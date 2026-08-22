// @vitest-environment happy-dom
/**
 * Mount harness for the flavour-guide tests.
 *
 * The guide is PRESENTATION over a settings value, so these suites mock the
 * database context rather than booting sql.js: what is under test is what the
 * components do with a `guidePresetId`, and a real database would only add a
 * five-second boot and a second thing that could fail.
 *
 * Named `harness.tsx` so the `*.test.*` include pattern skips it.
 */

import { vi } from 'vitest';
import type { ReactNode } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
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

export interface Mounted {
    container: HTMLDivElement;
    root: Root;
    text: () => string;
    /**
     * Render new children into the SAME root.
     *
     * Load-bearing for the memo tests: mounting a second tree would create
     * fresh `useMemo` caches, so a dependency array that never invalidates and
     * one that is correct would both look right. Only a re-render can tell them
     * apart.
     */
    rerender: (children: ReactNode) => void;
    unmount: () => void;
}

/** Render `children` under a router, synchronously. */
export function mount(children: ReactNode, path = '/script-maker/chart'): Mounted {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
        root.render(<MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>);
    });

    return {
        container,
        root,
        text: () => container.textContent ?? '',
        rerender: (next: ReactNode) => {
            act(() => {
                root.render(<MemoryRouter initialEntries={[path]}>{next}</MemoryRouter>);
            });
        },
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

/** Flush effects and timers between interactions. */
export async function settle(times = 2): Promise<void> {
    for (let i = 0; i < times; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }
}

/** Every cell (or header) the guide has painted with `tier`. */
export function painted(scope: ParentNode, tier: 'core' | 'flavour' | 'avoid'): Element[] {
    return Array.from(scope.querySelectorAll(`[class*="guide${tier[0].toUpperCase()}${tier.slice(1)}"]`));
}
