// @vitest-environment happy-dom
/**
 * ConfirmDialogProvider — the promise contract every delete in the app relies on.
 *
 * Each assertion here corresponds to a way the old hand-rolled modals could
 * strand a caller or fire the wrong action:
 *  - confirm resolves `true`, cancel resolves `false`;
 *  - Escape counts as cancel (a modal alertdialog with no keyboard exit is a
 *    trap, and a hung `await confirm()` silently loses the action);
 *  - a SECOND confirm while one is open supersedes the first, resolving it
 *    `false` — the user never saw that question, so its destructive action must
 *    not proceed;
 *  - `tone: 'danger'` really reaches the confirm control.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import ConfirmDialogProvider from '../ConfirmDialogProvider';
import { useConfirm, type ConfirmFn } from '../confirmContext';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

// The hook value is published from an EFFECT, not from the render body. Writing
// to an outer binding while rendering is exactly what `react-hooks/globals` /
// `react-hooks/immutability` flag, and they are flagging something real (a
// render may be discarded, or run twice under StrictMode). Effects flush inside
// `act()`, so the value is available by the time any assertion runs.
let confirmFn: ConfirmFn | null = null;
const confirm: ConfirmFn = (request) => confirmFn!(request);

function Probe() {
    const current = useConfirm();
    useEffect(() => {
        confirmFn = current;
    });
    return null;
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root.render(
            <ConfirmDialogProvider>
                <Probe />
            </ConfirmDialogProvider>,
        );
    });
});

afterEach(() => {
    try {
        act(() => root.unmount());
    } catch {
        /* already unmounted */
    }
    container.parentNode?.removeChild(container);
});

/** The dialog portals out of `container` — search the whole document. */
const dialog = () => document.body.querySelector('[role="alertdialog"]');
const action = (which: 'confirm' | 'cancel') =>
    document.body.querySelector(`[data-confirmation-action="${which}"]`) as HTMLElement | null;

const REQUEST = { title: 'Delete glyph "ka"?', message: 'This cannot be undone.' };

/** Let React flush the state update that mounts/unmounts the dialog. */
async function flush() {
    await act(async () => {
        await Promise.resolve();
    });
}

describe('ConfirmDialogProvider', () => {
    it('shows the request copy and resolves TRUE when confirmed', async () => {
        let resolved: boolean | undefined;
        await act(async () => {
            void confirm({ ...REQUEST, confirmLabel: 'Delete glyph' }).then((v: boolean) => {
                resolved = v;
            });
        });

        expect(dialog()).not.toBeNull();
        expect(dialog()!.textContent).toContain('Delete glyph "ka"?');
        expect(dialog()!.textContent).toContain('This cannot be undone.');
        expect(action('confirm')!.textContent).toContain('Delete glyph');

        await act(async () => {
            action('confirm')!.click();
        });
        await flush();

        expect(resolved).toBe(true);
    });

    it('resolves FALSE when cancelled', async () => {
        let resolved: boolean | undefined;
        await act(async () => {
            void confirm(REQUEST).then((v: boolean) => {
                resolved = v;
            });
        });

        await act(async () => {
            action('cancel')!.click();
        });
        await flush();

        expect(resolved).toBe(false);
    });

    it('resolves FALSE on Escape', async () => {
        let resolved: boolean | undefined;
        await act(async () => {
            void confirm(REQUEST).then((v: boolean) => {
                resolved = v;
            });
        });

        await act(async () => {
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
            );
        });
        await flush();

        expect(resolved).toBe(false);
    });

    it('a second confirm() SUPERSEDES the first, resolving it false', async () => {
        const settled: Array<['first' | 'second', boolean]> = [];

        await act(async () => {
            void confirm({ title: 'First?', message: 'm' }).then((v: boolean) => settled.push(['first', v]));
        });
        expect(dialog()!.textContent).toContain('First?');

        await act(async () => {
            void confirm({ title: 'Second?', message: 'm' }).then((v: boolean) => settled.push(['second', v]));
        });
        await flush();

        // The first caller is already settled — and settled as NOT confirmed,
        // because the user never saw its question.
        expect(settled).toEqual([['first', false]]);
        // The dialog now asks the second question.
        expect(dialog()!.textContent).toContain('Second?');

        await act(async () => {
            action('confirm')!.click();
        });
        await flush();

        expect(settled).toEqual([
            ['first', false],
            ['second', true],
        ]);
    });

    it('tone "danger" reaches the confirm control (trash icon + danger class)', async () => {
        await act(async () => {
            void confirm({ ...REQUEST, tone: 'danger' });
        });

        const confirmBtn = action('confirm')!;
        expect(confirmBtn.querySelector('.bi-trash')).not.toBeNull();
        expect(confirmBtn.className).toContain('confirmDanger');

        await act(async () => {
            action('cancel')!.click();
        });
    });

    it('the default tone is neutral (check icon, no danger class)', async () => {
        await act(async () => {
            void confirm(REQUEST);
        });

        const confirmBtn = action('confirm')!;
        expect(confirmBtn.querySelector('.bi-check-lg')).not.toBeNull();
        expect(confirmBtn.className).not.toContain('confirmDanger');

        await act(async () => {
            action('cancel')!.click();
        });
    });

    it('renders the `extra` slot between the message and the buttons', async () => {
        await act(async () => {
            void confirm({ ...REQUEST, extra: <p data-testid="extra">3 graphemes affected</p> });
        });

        expect(document.body.querySelector('[data-testid="extra"]')).not.toBeNull();

        await act(async () => {
            action('cancel')!.click();
        });
    });

    it('useConfirm() outside the provider throws rather than silently no-opping', () => {
        // A no-op would delete without asking — the exact failure the dialog exists
        // to prevent.
        const stray = document.createElement('div');
        document.body.appendChild(stray);
        const strayRoot = createRoot(stray);
        expect(() =>
            act(() => {
                strayRoot.render(<Probe />);
            }),
        ).toThrow(/ConfirmDialogProvider/);
        stray.parentNode?.removeChild(stray);
    });
});
