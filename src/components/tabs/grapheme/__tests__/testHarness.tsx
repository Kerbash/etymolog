// @vitest-environment happy-dom
/**
 * Shared mount harness for the Script Maker component tests.
 *
 * Every one of them needs the same five-provider stack and the same three
 * environment stubs, and the stubs are the part that is easy to get subtly
 * wrong: happy-dom has no `matchMedia` (the tab strip and the dropdown read
 * it), no `ResizeObserver` (the gallery and the tab strip observe their
 * containers) and no `crypto.randomUUID` in older builds.
 *
 * The database is REAL — `sql.js` runs fine here — because the flows under test
 * are about what the UI does with the service's ANSWERS (a refused delete, a
 * respelled word), and a mock of those answers would be a mock of the very
 * thing that could be wrong.
 *
 * This file is a helper, not a suite: it is named `testHarness.tsx` so the
 * `*.test.*` include pattern skips it.
 */

import { vi } from 'vitest';
import type { ReactNode } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
// happy-dom CAN sanitise, but the fixtures here are trivial `<svg/>` strings and
// the flag keeps them byte-identical to what the service tests store.
(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;

vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
);

vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

import { EtymologProvider } from '../../../../db/context';
import { NotificationProvider } from '../../../shared/notifications/NotificationProvider';
import ConfirmDialogProvider from '../../../shared/confirmDialog/ConfirmDialogProvider';
import { UnsavedChangesRegistry } from '../../../shell/unsavedChanges';

export interface Harness {
    container: HTMLDivElement;
    root: Root;
    /** All rendered text, for `toContain` assertions. */
    text: () => string;
    unmount: () => void;
}

/** Wrap `children` in the full provider stack at `path`. */
export function Providers({ children, path }: { children: ReactNode; path: string }) {
    return (
        <MemoryRouter initialEntries={[path]}>
            <EtymologProvider>
                <NotificationProvider>
                    <ConfirmDialogProvider>
                        <UnsavedChangesRegistry>{children}</UnsavedChangesRegistry>
                    </ConfirmDialogProvider>
                </NotificationProvider>
            </EtymologProvider>
        </MemoryRouter>
    );
}

/**
 * Render `children` and wait for the provider's async database init to settle.
 * Nothing under test renders anything real until `isReady` flips.
 */
export async function mountHarness(children: ReactNode, path = '/script-maker'): Promise<Harness> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(<Providers path={path}>{children}</Providers>);
    });

    // The provider initialises asynchronously; give it a bounded number of
    // ticks rather than a fixed sleep.
    for (let i = 0; i < 20; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }

    return {
        container,
        root,
        text: () => container.textContent ?? '',
        unmount: () => {
            try {
                act(() => root.unmount());
            } catch {
                /* already unmounted */
            }
            container.parentNode?.removeChild(container);
        },
    };
}

/** Flush effects, timers and microtasks between interactions. */
export async function settle(times = 3): Promise<void> {
    for (let i = 0; i < times; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
}

/** The confirmation dialog portals OUT of the container, onto `document.body`. */
export const confirmAction = (which: 'confirm' | 'cancel'): HTMLElement | null =>
    document.body.querySelector(`[data-confirmation-action="${which}"]`);

/** The first button whose text contains `label`, searched across the document. */
export function findButton(label: string, scope: ParentNode = document.body): HTMLButtonElement | undefined {
    return Array.from(scope.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes(label),
    ) as HTMLButtonElement | undefined;
}
