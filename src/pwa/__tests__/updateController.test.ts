// @vitest-environment happy-dom
/**
 * updateController — the deploy pipeline's state machine.
 *
 * Everything here is driven through an INJECTED `registerSW`, so the suite
 * exercises the real controller against a scripted service worker instead of
 * mocking the controller itself. The three properties worth protecting:
 *
 *  - a reload NEVER happens automatically while an editor is dirty (form
 *    drafts live in React state; a reload destroys them silently);
 *  - persistence is flushed BEFORE the handover, on every path including the
 *    button, because the SQLite snapshot is written on a debounce;
 *  - nothing here can throw into the app. A browser that refuses the worker,
 *    a failed check, a dev server whose virtual module is a no-op — all of
 *    them have to leave a working app behind.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
    createPwaUpdateController,
    getPwaUpdateController,
    installPwaUpdates,
    resetPwaUpdatesForTests,
    PWA_APPLIED_FLAG,
    PWA_CHECK_INTERVAL_MS,
    PWA_ROUTE_CHECK_THROTTLE_MS,
    PWA_APPLY_TIMEOUT_MS,
    type FlagStorage,
    type PwaLogger,
    type PwaUpdateControllerOptions,
    type RegisterSWLike,
    type RegisterSWLikeOptions,
} from '../updateController';

/** Let every chained `await` inside `apply()` settle. */
async function settle(times = 6) {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
}

/** A scripted `registerSW`: the test fires the callbacks by hand. */
function makeSw() {
    const update = vi.fn(() => Promise.resolve());
    const registration = { update } as unknown as ServiceWorkerRegistration;
    const updateSW = vi.fn((_reloadPage?: boolean) => Promise.resolve());
    let options: RegisterSWLikeOptions | undefined;
    let handOutRegistration = true;

    const registerSW: RegisterSWLike = (opts) => {
        options = opts;
        opts?.onRegisteredSW?.('/etymolog/sw.js', handOutRegistration ? registration : undefined);
        return updateSW;
    };

    return {
        registerSW,
        updateSW,
        update,
        registration,
        get options() {
            return options;
        },
        /** Pretend the browser refuses to hand back a registration. */
        withoutRegistration() {
            handOutRegistration = false;
        },
        needRefresh: () => options?.onNeedRefresh?.(),
        offlineReady: () => options?.onOfflineReady?.(),
        registerError: (error: unknown) => options?.onRegisterError?.(error),
    };
}

function makeStorage(): FlagStorage & { map: Map<string, string> } {
    const map = new Map<string, string>();
    return {
        map,
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value);
        },
        removeItem: (key) => {
            map.delete(key);
        },
    };
}

function makeLog() {
    return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } satisfies PwaLogger;
}

const makeFlush = () => vi.fn(() => Promise.resolve());

let clock = 1_000_000;
let log: ReturnType<typeof makeLog>;
let storage: ReturnType<typeof makeStorage>;
let flush: ReturnType<typeof makeFlush>;
let controllers: Array<{ destroy(): void }> = [];

function build(sw: ReturnType<typeof makeSw>, overrides: PwaUpdateControllerOptions = {}) {
    const controller = createPwaUpdateController({
        registerSW: sw.registerSW,
        flush,
        now: () => clock,
        log,
        storage,
        // The hourly poll is opt-in per test; a live interval in every case
        // would make the "checked exactly once" assertions timing-dependent.
        checkIntervalMs: 0,
        ...overrides,
    });
    controllers.push(controller);
    return controller;
}

beforeEach(() => {
    clock = 1_000_000;
    log = makeLog();
    storage = makeStorage();
    flush = makeFlush();
    controllers = [];
});

afterEach(() => {
    for (const c of controllers) c.destroy();
    resetPwaUpdatesForTests();
    vi.useRealTimers();
});

describe('updateController — registration', () => {
    it('registers immediately and wires all four callbacks', () => {
        const sw = makeSw();
        build(sw).start();

        expect(sw.options?.immediate).toBe(true);
        expect(typeof sw.options?.onNeedRefresh).toBe('function');
        expect(typeof sw.options?.onOfflineReady).toBe('function');
        expect(typeof sw.options?.onRegisteredSW).toBe('function');
        expect(typeof sw.options?.onRegisterError).toBe('function');
    });

    it('is idempotent — a second start() does not register twice', () => {
        const sw = makeSw();
        const registerSpy = vi.fn(sw.registerSW);
        const controller = build(sw, { registerSW: registerSpy });
        controller.start();
        controller.start();

        expect(registerSpy).toHaveBeenCalledTimes(1);
    });

    it('records a register error without throwing, and logs it', () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();

        expect(() => sw.registerError(new Error('scope refused'))).not.toThrow();
        expect(controller.getState().status).toBe('error');
        expect(controller.getState().error).toBe('scope refused');
        expect(log.warn).toHaveBeenCalled();
    });

    it('survives a registerSW that throws synchronously', () => {
        const controller = build(makeSw(), {
            registerSW: () => {
                throw new Error('no service workers here');
            },
        });

        expect(() => controller.start()).not.toThrow();
        expect(controller.getState().status).toBe('error');
    });

    it('stays silently idle when registerSW never calls back (the dev-server stub)', async () => {
        // `virtual:pwa-register` is a no-op unless `devOptions` is enabled, so
        // this is the shape of every `vite dev` session. It must not log.
        const controller = build(makeSw(), {
            registerSW: () => async () => {},
        });
        controller.start();
        await controller.checkNow();
        controller.handleRouteChange();

        expect(controller.getState().status).toBe('idle');
        expect(log.warn).not.toHaveBeenCalled();
        expect(log.error).not.toHaveBeenCalled();
    });

    it('reports offline readiness on the first install', () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();
        sw.offlineReady();

        expect(controller.getState().offlineReady).toBe(true);
        // The FIRST install is not an update — nothing is waiting.
        expect(controller.getState().status).toBe('idle');
    });
});

describe('updateController — applying', () => {
    it('auto-applies when a new version lands and nothing is dirty', async () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();

        sw.needRefresh();
        expect(controller.getState().status).toBe('applying');
        await settle();

        expect(flush).toHaveBeenCalledTimes(1);
        expect(sw.updateSW).toHaveBeenCalledWith(true);
    });

    it('flushes persistence BEFORE handing over to the worker', async () => {
        const sw = makeSw();
        const order: string[] = [];
        flush.mockImplementation(async () => {
            order.push('flush');
        });
        sw.updateSW.mockImplementation(async () => {
            order.push('skipWaiting');
        });
        const controller = build(sw);
        controller.start();

        sw.needRefresh();
        await settle();

        expect(order).toEqual(['flush', 'skipWaiting']);
    });

    it('holds the update back while an editor is dirty', async () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();
        controller.setDirtyProbe(() => true);

        sw.needRefresh();
        await settle();

        expect(controller.getState().status).toBe('ready');
        expect(sw.updateSW).not.toHaveBeenCalled();
        expect(flush).not.toHaveBeenCalled();
    });

    it('apply() overrides a dirty registry — the button is the one explicit path', async () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();
        controller.setDirtyProbe(() => true);
        sw.needRefresh();
        await settle();

        await controller.apply();
        await settle();

        expect(flush).toHaveBeenCalledTimes(1);
        expect(sw.updateSW).toHaveBeenCalledWith(true);
        expect(controller.getState().status).toBe('applying');
    });

    it('does nothing when apply() is called with nothing waiting', async () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();

        await controller.apply();

        expect(sw.updateSW).not.toHaveBeenCalled();
        expect(controller.getState().status).toBe('idle');
    });

    it('sets the applied flag before the reload, and consumes it exactly once', async () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();
        sw.needRefresh();
        await settle();

        expect(storage.map.get(PWA_APPLIED_FLAG)).toBe('1');
        expect(controller.consumeAppliedFlag()).toBe(true);
        // A StrictMode double effect must not announce the same update twice.
        expect(controller.consumeAppliedFlag()).toBe(false);
    });

    it('clears the flag and returns to ready when the handover fails', async () => {
        const sw = makeSw();
        sw.updateSW.mockRejectedValueOnce(new Error('postMessage failed'));
        const controller = build(sw);
        controller.start();

        sw.needRefresh();
        await settle();

        expect(storage.map.has(PWA_APPLIED_FLAG)).toBe(false);
        expect(controller.getState().status).toBe('ready');
        expect(controller.getState().error).toBe('postMessage failed');
        expect(log.error).toHaveBeenCalled();
    });

    it('re-arms itself when the reload never arrives', async () => {
        // The helper's `window.location.reload()` can be vetoed by a
        // `beforeunload` handler — and this app arms one (cyber
        // `NavigationGuard`) exactly when the banner is up. Answering "Stay"
        // cancels the navigation with no event to observe, so the controller
        // has to time out rather than sit disabled forever.
        vi.useFakeTimers();
        const sw = makeSw();
        const controller = build(sw, { applyTimeoutMs: 5000 });
        controller.start();

        sw.needRefresh();
        await vi.advanceTimersByTimeAsync(1000);
        expect(controller.getState().status).toBe('applying');

        await vi.advanceTimersByTimeAsync(5000);

        expect(controller.getState().status).toBe('ready');
        expect(controller.getState().error).toContain('did not reload');
        // The boot notice must not fire on a reload that never happened.
        expect(storage.map.has(PWA_APPLIED_FLAG)).toBe(false);
        expect(log.warn).toHaveBeenCalled();
    });

    it('lets the button be pressed again after a cancelled reload', async () => {
        vi.useFakeTimers();
        const sw = makeSw();
        const controller = build(sw, { applyTimeoutMs: 5000 });
        controller.start();
        controller.setDirtyProbe(() => true);

        sw.needRefresh();
        await vi.advanceTimersByTimeAsync(0);
        await controller.apply();
        await vi.advanceTimersByTimeAsync(6000);
        expect(controller.getState().status).toBe('ready');

        await controller.apply();
        expect(sw.updateSW).toHaveBeenCalledTimes(2);
    });

    it('does not leak the re-arm timer past destroy()', async () => {
        vi.useFakeTimers();
        const sw = makeSw();
        const controller = build(sw, { applyTimeoutMs: 5000 });
        controller.start();
        sw.needRefresh();
        await vi.advanceTimersByTimeAsync(0);
        controller.destroy();

        await vi.advanceTimersByTimeAsync(10_000);

        expect(controller.getState().status).toBe('applying');
    });

    it('ships a re-arm window long enough for a slow activate handler', () => {
        expect(PWA_APPLY_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    });

    it('tolerates storage that refuses to be written (private mode)', async () => {
        const sw = makeSw();
        const controller = build(sw, {
            storage: {
                getItem: () => {
                    throw new Error('blocked');
                },
                setItem: () => {
                    throw new Error('blocked');
                },
                removeItem: () => {
                    throw new Error('blocked');
                },
            },
        });
        controller.start();

        sw.needRefresh();
        await settle();

        // The notice is optional; the update is not.
        expect(sw.updateSW).toHaveBeenCalledWith(true);
        expect(controller.consumeAppliedFlag()).toBe(false);
    });
});

describe('updateController — checking', () => {
    it('checkNow asks the registration to update and records the time', async () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();

        await controller.checkNow();

        expect(sw.update).toHaveBeenCalledTimes(1);
        expect(controller.getState().lastCheckedAt).toBe(clock);
        expect(controller.getState().status).toBe('idle');
    });

    it('skips a throttled check and runs again once the window has passed', async () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();

        await controller.checkNow({ throttleMs: 5000 });
        clock += 4000;
        await controller.checkNow({ throttleMs: 5000 });
        expect(sw.update).toHaveBeenCalledTimes(1);

        clock += 2000;
        await controller.checkNow({ throttleMs: 5000 });
        expect(sw.update).toHaveBeenCalledTimes(2);
    });

    it('is a silent no-op when the browser handed back no registration', async () => {
        const sw = makeSw();
        sw.withoutRegistration();
        const controller = build(sw);
        controller.start();

        await controller.checkNow();

        expect(controller.getState().status).toBe('idle');
        expect(log.warn).not.toHaveBeenCalled();
    });

    it('records a failed check as an error and keeps working afterwards', async () => {
        const sw = makeSw();
        sw.update.mockRejectedValueOnce(new Error('offline'));
        const controller = build(sw);
        controller.start();

        await controller.checkNow();
        expect(controller.getState().status).toBe('error');
        expect(controller.getState().error).toBe('offline');
        expect(log.warn).toHaveBeenCalled();

        await controller.checkNow();
        expect(controller.getState().status).toBe('idle');
    });

    it('does not overwrite a waiting update with a check result', async () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();
        controller.setDirtyProbe(() => true);
        sw.needRefresh();

        await controller.checkNow();

        expect(controller.getState().status).toBe('ready');
    });
});

describe('updateController — triggers', () => {
    it('checks when the tab becomes visible', async () => {
        const sw = makeSw();
        build(sw).start();

        document.dispatchEvent(new Event('visibilitychange'));
        await settle();

        expect(sw.update).toHaveBeenCalledTimes(1);
    });

    it('does not check when the tab goes hidden', async () => {
        const sw = makeSw();
        build(sw).start();

        // `visibilityState` may be an own property or live on the prototype
        // depending on the DOM implementation; restore whichever it was.
        const own = Object.getOwnPropertyDescriptor(document, 'visibilityState');
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'hidden',
        });
        try {
            document.dispatchEvent(new Event('visibilitychange'));
            await settle();
            expect(sw.update).not.toHaveBeenCalled();
        } finally {
            if (own) Object.defineProperty(document, 'visibilityState', own);
            else delete (document as unknown as Record<string, unknown>).visibilityState;
        }
    });

    it('checks when the connection comes back', async () => {
        const sw = makeSw();
        build(sw).start();

        window.dispatchEvent(new Event('online'));
        await settle();

        expect(sw.update).toHaveBeenCalledTimes(1);
    });

    it('throttles bursts of visibility events', async () => {
        const sw = makeSw();
        build(sw, { eventCheckThrottleMs: 30_000 }).start();

        document.dispatchEvent(new Event('visibilitychange'));
        await settle();
        clock += 1000;
        document.dispatchEvent(new Event('visibilitychange'));
        await settle();

        expect(sw.update).toHaveBeenCalledTimes(1);
    });

    it('polls on the hourly interval', async () => {
        vi.useFakeTimers();
        const sw = makeSw();
        build(sw, { checkIntervalMs: PWA_CHECK_INTERVAL_MS }).start();

        await vi.advanceTimersByTimeAsync(PWA_CHECK_INTERVAL_MS + 1);

        expect(sw.update).toHaveBeenCalledTimes(1);
    });

    it('detaches every listener and timer on destroy()', async () => {
        vi.useFakeTimers();
        const sw = makeSw();
        const controller = build(sw, { checkIntervalMs: PWA_CHECK_INTERVAL_MS });
        controller.start();
        controller.destroy();

        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('online'));
        await vi.advanceTimersByTimeAsync(PWA_CHECK_INTERVAL_MS + 1);

        expect(sw.update).not.toHaveBeenCalled();
    });
});

describe('updateController — route changes', () => {
    it('checks on a route change, at most once per throttle window', async () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();

        controller.handleRouteChange();
        await settle();
        clock += 60_000;
        controller.handleRouteChange();
        await settle();
        expect(sw.update).toHaveBeenCalledTimes(1);

        clock += PWA_ROUTE_CHECK_THROTTLE_MS;
        controller.handleRouteChange();
        await settle();
        expect(sw.update).toHaveBeenCalledTimes(2);
    });

    it('applies a held-back update once the registry has gone clean', async () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();
        let dirty = true;
        controller.setDirtyProbe(() => dirty);

        sw.needRefresh();
        await settle();
        controller.handleRouteChange();
        await settle();
        expect(sw.updateSW).not.toHaveBeenCalled();

        dirty = false;
        controller.handleRouteChange();
        await settle();
        expect(sw.updateSW).toHaveBeenCalledWith(true);
    });

    it('does not spend a check when an update is already waiting', async () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();
        controller.setDirtyProbe(() => true);
        sw.needRefresh();

        controller.handleRouteChange();
        await settle();

        expect(sw.update).not.toHaveBeenCalled();
    });

    it('keeps applying automatically after the banner has been dismissed', async () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();
        let dirty = true;
        controller.setDirtyProbe(() => dirty);
        sw.needRefresh();
        await settle();

        controller.dismiss();
        expect(controller.getState().snoozed).toBe(true);

        dirty = false;
        controller.handleRouteChange();
        await settle();

        // Snoozing hides the BANNER. It must not strand the user on an old
        // build for the rest of the session.
        expect(sw.updateSW).toHaveBeenCalledWith(true);
    });
});

describe('updateController — store semantics', () => {
    it('notifies subscribers on a change and stops after unsubscribe', () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();
        const listener = vi.fn();
        const unsubscribe = controller.subscribe(listener);

        controller.dismiss();
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        sw.registerError(new Error('later'));
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('returns an identical state object when nothing moved', () => {
        const sw = makeSw();
        const controller = build(sw);
        controller.start();
        const before = controller.getState();

        // `snoozed` is already false; a redundant write must not churn the
        // reference, or `useSyncExternalStore` re-renders the shell hourly.
        controller.dismiss();
        controller.dismiss();
        const after = controller.getState();

        expect(after).not.toBe(before);
        expect(controller.getState()).toBe(after);
    });
});

describe('updateController — singleton', () => {
    it('installPwaUpdates starts exactly one controller and exposes it', () => {
        const sw = makeSw();
        const first = installPwaUpdates({ registerSW: sw.registerSW, checkIntervalMs: 0, log });
        const second = installPwaUpdates({ registerSW: sw.registerSW, checkIntervalMs: 0, log });

        expect(second).toBe(first);
        expect(getPwaUpdateController()).toBe(first);
        expect((window as unknown as Record<string, unknown>).__etymologPwa).toBe(first);
    });

    it('hands out a dormant controller when nothing was installed', () => {
        resetPwaUpdatesForTests();
        const controller = getPwaUpdateController();

        // Never started, so there is nothing to report and nothing to crash on.
        expect(controller.getState().status).toBe('idle');
        expect(() => controller.handleRouteChange()).not.toThrow();
    });
});
