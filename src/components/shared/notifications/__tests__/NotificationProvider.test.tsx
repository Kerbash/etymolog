// @vitest-environment happy-dom
/**
 * NotificationProvider — the queue, the auto-hide policy, and `useApiAction`.
 *
 * The policy assertions matter more than they look:
 *  - the queue shows ONE notice at a time, in arrival order, so a batch failure
 *    stays legible instead of stacking fixed-position banners over the content;
 *  - success/info auto-hide but warning/error do NOT. An error the user did not
 *    read is, for them, an error that did not happen — which is precisely the
 *    state the 22 `console.error` sites left the app in.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import { NotificationProvider } from '../NotificationProvider';
import { useApiAction, useNotify, type NotifyApi } from '../notificationContext';
import type { ApiResponse } from '../../../../db/api/types';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
type RunFn = ReturnType<typeof useApiAction>;

// The hook values are published from an EFFECT, not from the render body.
// Writing to an outer binding while rendering is exactly what
// `react-hooks/globals` / `react-hooks/immutability` flag, and they are
// flagging something real (a render may be discarded, or run twice under
// StrictMode). Effects flush inside `act()`, so the values are available by the
// time any assertion runs.
let notifyApi: NotifyApi | null = null;
let runFn: RunFn | null = null;

const notify = new Proxy({} as NotifyApi, {
    get: (_t, key: string) => (notifyApi as unknown as Record<string, unknown>)[key],
});
const run: RunFn = (fn, options) => runFn!(fn, options);

function Probe() {
    const currentNotify = useNotify();
    const currentRun = useApiAction();
    useEffect(() => {
        notifyApi = currentNotify;
        runFn = currentRun;
    });
    return null;
}

function mount() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root.render(
            <NotificationProvider>
                <Probe />
            </NotificationProvider>,
        );
    });
}

beforeEach(mount);

afterEach(() => {
    try {
        act(() => root.unmount());
    } catch {
        /* already unmounted */
    }
    container.parentNode?.removeChild(container);
    vi.useRealTimers();
});

/** The banner is rendered inside the provider subtree. */
const banner = () => container.querySelector('[role="alert"], [role="status"]');
const bannerText = () => banner()?.textContent ?? '';
const dismissBtn = () =>
    container.querySelector('[aria-label="Dismiss"]') as HTMLElement | null;

describe('NotificationProvider — queue', () => {
    it('renders nothing until something is notified', () => {
        expect(banner()).toBeNull();
    });

    it('shows ONE notice at a time, head first, in arrival order', () => {
        act(() => {
            notify.error('first failure');
            notify.error('second failure');
        });

        // Exactly one banner…
        expect(container.querySelectorAll('[role="alert"]').length).toBe(1);
        // …and it is the FIRST one queued.
        expect(bannerText()).toContain('first failure');
        expect(bannerText()).not.toContain('second failure');

        act(() => {
            dismissBtn()!.click();
        });

        // Dismissing the head promotes the next.
        expect(bannerText()).toContain('second failure');
    });

    it('dismiss(id) removes a specific queued notice', () => {
        let firstId = 0;
        act(() => {
            firstId = notify.error('first');
            notify.error('second');
        });

        act(() => {
            notify.dismiss(firstId);
        });
        expect(bannerText()).toContain('second');
    });

    it('clear() empties the queue', () => {
        act(() => {
            notify.error('a');
            notify.error('b');
        });
        act(() => {
            notify.clear();
        });
        expect(banner()).toBeNull();
    });

    it('errors and warnings use the assertive alert role; success and info are polite', () => {
        act(() => {
            notify.error('bad');
        });
        expect(container.querySelector('[role="alert"]')).not.toBeNull();

        act(() => {
            notify.clear();
            notify.success('good');
        });
        expect(container.querySelector('[role="status"]')).not.toBeNull();
        expect(container.querySelector('[role="alert"]')).toBeNull();
    });
});

describe('NotificationProvider — auto-hide policy', () => {
    it('a success notice auto-hides after 2.5s', () => {
        vi.useFakeTimers();
        act(() => {
            notify.success('Saved');
        });
        expect(bannerText()).toContain('Saved');

        act(() => {
            vi.advanceTimersByTime(2600);
        });
        expect(banner()).toBeNull();
    });

    it('an ERROR notice lingers long enough to read, then auto-hides so it cannot wedge the queue', () => {
        vi.useFakeTimers();
        act(() => {
            notify.error('Delete refused');
        });
        act(() => {
            vi.advanceTimersByTime(5_000);
        });
        expect(bannerText()).toContain('Delete refused');
        act(() => {
            vi.advanceTimersByTime(4_000);
        });
        expect(banner()).toBeNull();
    });

    it('autoHideMs: null keeps a notice until it is dismissed', () => {
        vi.useFakeTimers();
        act(() => {
            notify.error('Stay put', { autoHideMs: null });
        });
        act(() => {
            vi.advanceTimersByTime(60_000);
        });
        expect(bannerText()).toContain('Stay put');
    });

    it('an explicit autoHideMs overrides the severity default', () => {
        vi.useFakeTimers();
        act(() => {
            notify.error('transient', { autoHideMs: 1000 });
        });
        act(() => {
            vi.advanceTimersByTime(1100);
        });
        expect(banner()).toBeNull();
    });
});

describe('useApiAction', () => {
    const ok: ApiResponse<number> = { success: true, data: 1 };
    const failed: ApiResponse<number> = {
        success: false,
        error: { code: 'CONSTRAINT_VIOLATION', message: 'Grapheme is used by 3 words' },
    };

    it('notifies with the API error message when the call fails', async () => {
        let result: ApiResponse<number> | undefined;
        await act(async () => {
            result = await run(() => failed, { errorTitle: 'Could not delete grapheme' });
        });

        expect(result!.success).toBe(false);
        expect(bannerText()).toContain('Could not delete grapheme');
        expect(bannerText()).toContain('Grapheme is used by 3 words');
    });

    it('says nothing on success unless a success message is given', async () => {
        await act(async () => {
            await run(() => ok);
        });
        expect(banner()).toBeNull();

        await act(async () => {
            await run(() => ok, { success: 'Glyph deleted' });
        });
        expect(bannerText()).toContain('Glyph deleted');
    });

    it('catches a THROWN error and reports it as a failed response', async () => {
        // Several service paths throw rather than returning { success: false }.
        // Those were the ones that produced a blank screen.
        let result: ApiResponse<number> | undefined;
        await act(async () => {
            result = await run(() => {
                throw new Error('database is locked');
            });
        });

        expect(result!.success).toBe(false);
        expect(result!.error?.message).toBe('database is locked');
        expect(bannerText()).toContain('database is locked');
    });

    it('awaits a promise-returning call', async () => {
        await act(async () => {
            await run(async () => failed);
        });
        expect(bannerText()).toContain('Grapheme is used by 3 words');
    });
});

describe('useNotify outside the provider', () => {
    it('throws rather than silently swallowing the message', () => {
        const stray = document.createElement('div');
        document.body.appendChild(stray);
        const strayRoot = createRoot(stray);
        expect(() =>
            act(() => {
                strayRoot.render(<Probe />);
            }),
        ).toThrow(/NotificationProvider/);
        stray.parentNode?.removeChild(stray);
    });
});
