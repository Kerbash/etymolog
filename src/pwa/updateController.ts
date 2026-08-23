/**
 * updateController — the in-app deploy pipeline.
 *
 * ## The problem
 *
 * Etymolog is a precached PWA. Under the plugin's `autoUpdate` mode a new
 * deploy installs a service worker that immediately calls `skipWaiting()` and
 * `clientsClaim()`, but the JS ALREADY RUNNING in the open tab is the old
 * bundle and stays that way until the next full navigation. A user who leaves
 * the app open for a week keeps running the build they first loaded, and the
 * only cure was telling them to force-refresh.
 *
 * ## The shape of the fix
 *
 * `vite.config.ts` switched to `registerType: 'prompt'`, which is the mode
 * where the app — not the plugin — decides WHEN a waiting worker takes over:
 *
 *  1. the new worker installs and parks in `waiting`;
 *  2. the plugin helper arms a `controlling` listener and calls `onNeedRefresh`;
 *  3. calling the returned `updateSW()` posts `SKIP_WAITING`;
 *  4. the worker activates, `controlling` fires, the helper reloads the page.
 *
 * Step 3 is the decision point, and it is the whole reason this module exists:
 * a reload in the middle of an edit destroys the form (drafts live in React
 * state, not in SQLite). So every AUTOMATIC path is gated on the
 * unsaved-changes registry being clean, and the only thing that can override a
 * dirty registry is the user pressing the banner's button.
 *
 * `prompt` rather than `autoUpdate` was chosen deliberately: under `autoUpdate`
 * the plugin forces `skipWaiting` into the generated worker, so the new build
 * can claim the page at any moment and `window.location.reload()` fires from
 * inside the helper's `activated` handler with nothing able to veto it. There
 * is no version of "never reload mid-edit" that can be built on top of that.
 *
 * ## Detection
 *
 * A `waiting` worker only appears if something asks for the SW script again.
 * The browser does that on navigation, which is exactly what never happens in
 * a long-lived SPA session, so this module drives `registration.update()` from
 * four triggers: an hourly interval, tab-visible, back-online, and in-app route
 * changes (throttled — see the constants).
 *
 * ## Why it is framework-free
 *
 * Registration has to happen before React mounts (`main.tsx`), it has to
 * survive every remount of the tree, and it is a process-wide singleton — three
 * properties that a hook cannot have. React reads it through
 * `usePwaUpdate()` (`useSyncExternalStore`) and pushes exactly one thing back
 * in: the dirty probe.
 */

import { registerSW as virtualRegisterSW } from 'virtual:pwa-register';

import { flushPersist } from '../db/persistence';
import { pwaLog } from '../db/utils/logger';

// ── Timings ──────────────────────────────────────────────────────────────

/**
 * Unconditional background poll. An hour is the interval a tab left open
 * overnight still notices a morning deploy on, without turning a parked tab
 * into a request generator.
 */
export const PWA_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Route changes are the highest-frequency trigger — a user clicking through
 * tabs would otherwise issue an SW fetch per click — so they carry the longest
 * throttle. Five minutes still means an update is picked up almost immediately
 * by anyone actually using the app.
 */
export const PWA_ROUTE_CHECK_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Floor for the `visibilitychange` / `online` triggers. Both are user-driven
 * and can fire in bursts (alt-tabbing, a flapping connection); without a floor
 * a laptop waking from sleep issues one SW fetch per focus event.
 */
export const PWA_EVENT_CHECK_THROTTLE_MS = 30 * 1000;

/**
 * How long `applying` may last before the controller decides the reload is not
 * coming and re-arms the button.
 *
 * The reload is NOT ours: the plugin helper calls `window.location.reload()`
 * from its `controlling` listener. A `beforeunload` handler can veto that —
 * and in this app one is armed exactly when the banner is on screen, because
 * `LexiconEditor` mounts cyber `NavigationGuard` with `active={isDirty}`. The
 * browser then asks "Leave site?" a second time, and answering "Stay" (or an
 * automation environment answering it for you) cancels the navigation with no
 * event to observe. Without this timer the banner's button stays disabled for
 * the rest of the session and the update can never be taken.
 *
 * Generous, because a slow `activate` handler legitimately takes seconds and
 * re-arming under a reload that IS coming would flash the button back on.
 */
export const PWA_APPLY_TIMEOUT_MS = 15 * 1000;

/**
 * sessionStorage key set immediately before the update reload, so the NEXT
 * boot can say what happened.
 *
 * It has to be written before the reload rather than derived afterwards,
 * because the reloaded bundle has no other way to tell a version change from
 * an ordinary page load — and it has to be `sessionStorage` (per-tab, cleared
 * with the tab) rather than `localStorage`, or every other open tab would
 * announce an update it did not perform.
 */
export const PWA_APPLIED_FLAG = 'etymolog:pwa-update-applied';

// ── Types ────────────────────────────────────────────────────────────────

/**
 * `idle`     nothing waiting
 * `checking` a `registration.update()` is in flight
 * `ready`    a new worker is parked in `waiting`, one `apply()` away
 * `applying` `SKIP_WAITING` posted; the helper reloads when it activates
 * `error`    the last check or apply failed (recoverable — checks resume)
 */
export type PwaUpdateStatus = 'idle' | 'checking' | 'ready' | 'applying' | 'error';

export interface PwaUpdateState {
    status: PwaUpdateStatus;
    /** Human-readable reason for `status === 'error'`, else null. */
    error: string | null;
    /** `Date.now()` of the last SUCCESSFUL check, or null. */
    lastCheckedAt: number | null;
    /** The very first install finished — the app now works offline. */
    offlineReady: boolean;
    /** The user dismissed the banner; hide it for the rest of the session. */
    snoozed: boolean;
}

/** The subset of `RegisterSWOptions` this controller uses. */
export interface RegisterSWLikeOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegisteredSW?: (
        swScriptUrl: string,
        registration: ServiceWorkerRegistration | undefined,
    ) => void;
    onRegisterError?: (error: unknown) => void;
}

/**
 * `virtual:pwa-register`'s `registerSW`, narrowed to what is used here so tests
 * can hand in a fake without importing the plugin.
 */
export type RegisterSWLike = (
    options?: RegisterSWLikeOptions,
) => (reloadPage?: boolean) => Promise<void>;

/** Just enough of `Storage` to hold one flag; nullable for private mode. */
export type FlagStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface PwaLogger {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}

export interface PwaUpdateControllerOptions {
    /** Defaults to the real `virtual:pwa-register` export. */
    registerSW?: RegisterSWLike;
    checkIntervalMs?: number;
    routeCheckThrottleMs?: number;
    eventCheckThrottleMs?: number;
    /** Runs before the reload. Defaults to `flushPersist()`. */
    flush?: () => Promise<void>;
    now?: () => number;
    /** How long to wait for the helper's reload before re-arming. */
    applyTimeoutMs?: number;
    log?: PwaLogger;
    /** Pass `null` to disable the "Updated to vX" flag entirely. */
    storage?: FlagStorage | null;
}

export interface PwaUpdateController {
    getState(): PwaUpdateState;
    subscribe(listener: () => void): () => void;
    /** Register the worker and attach the four detection triggers. Idempotent. */
    start(): void;
    /** Ask the browser to re-fetch the SW script. `throttleMs` skips if too soon. */
    checkNow(options?: { throttleMs?: number }): Promise<void>;
    /**
     * Take the waiting worker live. Flushes persistence first, then hands over
     * to the plugin helper, which reloads once the new worker is controlling.
     *
     * Deliberately unconditional on the dirty registry: this is the path the
     * BUTTON uses, and the button's copy says what it costs.
     */
    apply(): Promise<void>;
    /**
     * Install the "is any editor dirty?" probe. The controller owns no React
     * state, so the registry pushes itself in here (and clears it with `null`
     * on unmount).
     */
    setDirtyProbe(probe: (() => boolean) | null): void;
    /**
     * One in-app navigation happened: apply a pending update if the registry is
     * clean, otherwise (throttled) look for a new one.
     */
    handleRouteChange(): void;
    /** Hide the banner for the rest of the session. Does NOT stop auto-apply. */
    dismiss(): void;
    /**
     * True exactly once per applied update, on the boot that follows it. Reads
     * and clears the flag, so a second caller (React StrictMode's double effect)
     * gets `false` and the notice is not announced twice.
     */
    consumeAppliedFlag(): boolean;
    /** Detach every listener and timer. For tests and hot-reload hygiene. */
    destroy(): void;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function toMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown service-worker error';
}

/**
 * `sessionStorage` access throws outright in some privacy modes, and the whole
 * feature must survive that — losing the "Updated to vX" notice is acceptable,
 * losing the update flow is not.
 */
function safeSessionStorage(): FlagStorage | null {
    try {
        if (typeof sessionStorage === 'undefined') return null;
        return sessionStorage;
    } catch {
        return null;
    }
}

const INITIAL_STATE: PwaUpdateState = {
    status: 'idle',
    error: null,
    lastCheckedAt: null,
    offlineReady: false,
    snoozed: false,
};

// ── Controller ───────────────────────────────────────────────────────────

export function createPwaUpdateController(
    options: PwaUpdateControllerOptions = {},
): PwaUpdateController {
    const register = options.registerSW ?? (virtualRegisterSW as RegisterSWLike);
    const checkIntervalMs = options.checkIntervalMs ?? PWA_CHECK_INTERVAL_MS;
    const routeThrottleMs = options.routeCheckThrottleMs ?? PWA_ROUTE_CHECK_THROTTLE_MS;
    const eventThrottleMs = options.eventCheckThrottleMs ?? PWA_EVENT_CHECK_THROTTLE_MS;
    const flush = options.flush ?? flushPersist;
    const applyTimeoutMs = options.applyTimeoutMs ?? PWA_APPLY_TIMEOUT_MS;
    const now = options.now ?? (() => Date.now());
    const log = options.log ?? pwaLog;
    const storage = options.storage !== undefined ? options.storage : safeSessionStorage();

    let state: PwaUpdateState = INITIAL_STATE;
    const listeners = new Set<() => void>();

    let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
    let registration: ServiceWorkerRegistration | null = null;
    let dirtyProbe: (() => boolean) | null = null;
    let started = false;
    let lastCheckAt: number | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let inFlightCheck: Promise<void> | null = null;
    let applyTimer: ReturnType<typeof setTimeout> | null = null;
    const detachers: Array<() => void> = [];

    function setState(patch: Partial<PwaUpdateState>): void {
        let changed = false;
        for (const key of Object.keys(patch) as Array<keyof PwaUpdateState>) {
            if (patch[key] !== undefined && patch[key] !== state[key]) {
                changed = true;
                break;
            }
        }
        // Bail on a no-op write: `useSyncExternalStore` re-renders on every
        // notification, and the check triggers fire far more often than the
        // state actually moves.
        if (!changed) return;
        state = { ...state, ...patch };
        for (const listener of listeners) listener();
    }

    function markApplied(): void {
        try {
            storage?.setItem(PWA_APPLIED_FLAG, '1');
        } catch {
            /* quota / private mode — the notice is optional, the update is not */
        }
    }

    function clearApplied(): void {
        try {
            storage?.removeItem(PWA_APPLIED_FLAG);
        } catch {
            /* see markApplied */
        }
    }

    function consumeAppliedFlag(): boolean {
        try {
            if (storage?.getItem(PWA_APPLIED_FLAG) !== '1') return false;
            storage.removeItem(PWA_APPLIED_FLAG);
            return true;
        } catch {
            return false;
        }
    }

    async function apply(): Promise<void> {
        // `ready` is the ONLY state with something to apply. Guarding here (and
        // not at every call site) is what makes the button, the route-change
        // gate and `onNeedRefresh` safe to wire up independently.
        if (state.status !== 'ready' || !updateSW) return;
        const handoff = updateSW;
        setState({ status: 'applying', error: null });
        // Set BEFORE the handover: once `SKIP_WAITING` lands the helper can
        // reload at any moment, and a flag written after that never happens.
        markApplied();
        try {
            // Persistence is debounced, so the last few seconds of edits are
            // still sitting in a timer. Nothing below this line is allowed to
            // run before the snapshot is on disk.
            await flush();
            await handoff(true);
            // The handover only POSTS `SKIP_WAITING`; the reload arrives later,
            // from the helper, and may never arrive at all. See
            // PWA_APPLY_TIMEOUT_MS. A reload that does happen takes this timer
            // down with the page.
            armApplyTimeout();
        } catch (error) {
            clearApplied();
            log.error('Failed to apply the update', error);
            // Back to `ready`, not `error`: the worker is still waiting and the
            // button must stay available.
            setState({ status: 'ready', error: toMessage(error) });
        }
    }

    function armApplyTimeout(): void {
        if (applyTimeoutMs <= 0) return;
        if (applyTimer !== null) clearTimeout(applyTimer);
        applyTimer = setTimeout(() => {
            applyTimer = null;
            if (state.status !== 'applying') return;
            clearApplied();
            log.warn('The update was applied but the page did not reload');
            setState({
                status: 'ready',
                error:
                    'The new version is installed but this tab did not reload — ' +
                    'something cancelled the navigation. Try again, or reload manually.',
            });
        }, applyTimeoutMs);
        (applyTimer as unknown as { unref?: () => void }).unref?.();
    }

    /** Apply only if nothing is dirty. Returns whether it started applying. */
    function maybeAutoApply(): boolean {
        if (state.status !== 'ready') return false;
        if (dirtyProbe?.()) {
            log.info('Update held back — an editor holds unsaved input');
            return false;
        }
        void apply();
        return true;
    }

    function checkNow(checkOptions: { throttleMs?: number } = {}): Promise<void> {
        const throttleMs = checkOptions.throttleMs ?? 0;
        const at = now();
        if (throttleMs > 0 && lastCheckAt !== null && at - lastCheckAt < throttleMs) {
            return Promise.resolve();
        }
        // No registration means either the dev server (where the virtual module
        // is a documented no-op) or a browser without service workers. Both are
        // "nothing to check", not an error, and must not log.
        if (!registration) return Promise.resolve();
        if (inFlightCheck) return inFlightCheck;

        lastCheckAt = at;
        const target = registration;
        if (state.status === 'idle' || state.status === 'error') {
            setState({ status: 'checking', error: null });
        }

        const run = (async () => {
            try {
                await target.update();
                // `onNeedRefresh` may have landed synchronously inside
                // `update()`; only step back to `idle` if it did not.
                setState({ lastCheckedAt: now() });
                if (state.status === 'checking') setState({ status: 'idle' });
            } catch (error) {
                log.warn('Update check failed', error);
                if (state.status === 'checking') {
                    setState({ status: 'error', error: toMessage(error) });
                }
            } finally {
                inFlightCheck = null;
            }
        })();
        inFlightCheck = run;
        return run;
    }

    function handleRouteChange(): void {
        // Apply first: a route change is the moment a form unmounts, which is
        // precisely when a held-back update becomes safe. Checking again while
        // one is already waiting would be a wasted request.
        if (maybeAutoApply()) return;
        if (state.status === 'ready' || state.status === 'applying') return;
        void checkNow({ throttleMs: routeThrottleMs });
    }

    function attachTriggers(): void {
        if (typeof document !== 'undefined') {
            const onVisibility = () => {
                if (document.visibilityState === 'visible') {
                    void checkNow({ throttleMs: eventThrottleMs });
                }
            };
            document.addEventListener('visibilitychange', onVisibility);
            detachers.push(() => document.removeEventListener('visibilitychange', onVisibility));
        }
        if (typeof window !== 'undefined') {
            const onOnline = () => {
                void checkNow({ throttleMs: eventThrottleMs });
            };
            window.addEventListener('online', onOnline);
            detachers.push(() => window.removeEventListener('online', onOnline));
        }
        if (checkIntervalMs > 0) {
            intervalId = setInterval(() => {
                void checkNow();
            }, checkIntervalMs);
            // Node returns a Timeout object; a poll that keeps a test runner or
            // a script alive for an hour is a bug, not a feature.
            (intervalId as unknown as { unref?: () => void }).unref?.();
        }
    }

    function start(): void {
        if (started) return;
        started = true;
        try {
            updateSW = register({
                immediate: true,
                onNeedRefresh: () => {
                    log.info('A new version is waiting');
                    setState({ status: 'ready', error: null });
                    maybeAutoApply();
                },
                onOfflineReady: () => {
                    log.info('Ready to work offline');
                    setState({ offlineReady: true });
                },
                onRegisteredSW: (url, reg) => {
                    log.info('Service worker registered', url);
                    registration = reg ?? null;
                },
                onRegisterError: (error) => {
                    // Never thrown: a browser that refuses the worker (file://,
                    // an unsupported engine, a blocked scope) must still get a
                    // working app, just without background updates.
                    log.warn('Service-worker registration failed', error);
                    setState({ status: 'error', error: toMessage(error) });
                },
            });
        } catch (error) {
            log.warn('Service-worker registration threw', error);
            setState({ status: 'error', error: toMessage(error) });
            return;
        }
        attachTriggers();
    }

    return {
        getState: () => state,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        start,
        checkNow,
        apply,
        setDirtyProbe(probe) {
            dirtyProbe = probe;
        },
        handleRouteChange,
        dismiss() {
            setState({ snoozed: true });
        },
        consumeAppliedFlag,
        destroy() {
            for (const detach of detachers) detach();
            detachers.length = 0;
            if (intervalId !== null) clearInterval(intervalId);
            intervalId = null;
            if (applyTimer !== null) clearTimeout(applyTimer);
            applyTimer = null;
            listeners.clear();
            dirtyProbe = null;
            registration = null;
            updateSW = null;
            started = false;
        },
    };
}

// ── Process-wide singleton ───────────────────────────────────────────────

let singleton: PwaUpdateController | null = null;

/**
 * The one controller the app reads. Created lazily and DORMANT — a component
 * rendered in a test or on a page where `installPwaUpdates()` never ran sees a
 * permanently `idle` store rather than a crash.
 */
export function getPwaUpdateController(): PwaUpdateController {
    singleton ??= createPwaUpdateController();
    return singleton;
}

/**
 * Register the service worker and start watching for deploys. Call once from
 * `main.tsx`, BEFORE React mounts — registration must not be tied to the
 * lifetime of any component.
 */
export function installPwaUpdates(
    options: PwaUpdateControllerOptions = {},
): PwaUpdateController {
    singleton ??= createPwaUpdateController(options);
    singleton.start();
    // A diagnostics handle, mirroring `window.__scrollDebug`: "is an update
    // waiting, and why has it not applied?" is otherwise unanswerable from a
    // user's console.
    if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__etymologPwa = singleton;
    }
    return singleton;
}

/** Drop the singleton so the next `installPwaUpdates()` builds a fresh one. */
export function resetPwaUpdatesForTests(): void {
    singleton?.destroy();
    singleton = null;
}
