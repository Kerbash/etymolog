import { createContext, useCallback, useContext } from 'react';

import type {
    NotificationBannerAction,
    NotificationBannerSeverity,
} from 'cyber-components/interactable/information/notificationBanner';

import type { ApiResponse } from '../../../db/api/types';

/** One queued notice. */
export interface Notice {
    /** Monotonic id — used as the React key and to dismiss a specific notice. */
    id: number;
    severity: NotificationBannerSeverity;
    title?: string;
    message: string;
    /** Optional buttons (Retry, Export, …). */
    actions?: NotificationBannerAction[];
    /**
     * Auto-hide delay. Resolved at ENQUEUE time from the severity — success and
     * info disappear on their own, warnings and errors do not. An error the user
     * did not read is an error that did not happen as far as they are concerned.
     */
    autoHideMs: number | null;
}

export interface NotifyOptions {
    title?: string;
    actions?: NotificationBannerAction[];
    /** Override the severity default (2500 ms for success/info, never for warning/error). */
    autoHideMs?: number | null;
}

export interface NotifyApi {
    success(message: string, options?: NotifyOptions): number;
    error(message: string, options?: NotifyOptions): number;
    warning(message: string, options?: NotifyOptions): number;
    info(message: string, options?: NotifyOptions): number;
    /** Dismiss a specific notice by the id `notify.*` returned. */
    dismiss(id: number): void;
    /** Drop everything queued (e.g. on route change away from a failed page). */
    clear(): void;
}

/**
 * Severity → default auto-hide. Errors and warnings linger long enough to be
 * read and acted on, but they DO go away: the queue shows one notice at a
 * time, so a never-expiring error would hide every later "Saved" for the rest
 * of the session. Conditions that genuinely persist belong in the shell banner
 * (`PersistenceStatus`), not in a toast; pass `autoHideMs: null` explicitly
 * for the rare toast that must wait for a dismissal.
 */
export const DEFAULT_AUTO_HIDE: Record<NotificationBannerSeverity, number | null> = {
    success: 2500,
    info: 2500,
    warning: 8000,
    error: 8000,
};

/**
 * The context and its hooks live in a separate module from the provider
 * COMPONENT on purpose: a `.tsx` exporting both a component and a hook defeats
 * react-refresh (the module remounts on every edit, dropping the queue the
 * provider exists to hold) — which is what `react-refresh/
 * only-export-components` is warning about.
 */
export const NotificationContext = createContext<NotifyApi | null>(null);

/**
 * The notification API. Throws when used outside the provider — a silent no-op
 * would reproduce the exact bug this surface exists to fix.
 */
export function useNotify(): NotifyApi {
    const ctx = useContext(NotificationContext);
    if (!ctx) {
        throw new Error('useNotify must be used inside a <NotificationProvider>');
    }
    return ctx;
}

export interface ApiActionOptions {
    /** Shown as a success notice when the call succeeds. Omit for silent success. */
    success?: string;
    /** Title for the failure notice, e.g. "Could not delete glyph". */
    errorTitle?: string;
}

/**
 * `run(fn, opts)` — execute an `ApiResponse`-returning call and surface its
 * outcome.
 *
 * Returns the response so callers keep their `if (!res.success) return;`
 * guards; the notification is a side effect, not a replacement for handling.
 * A THROWN error (as opposed to a returned `{ success: false }`) is also caught
 * and reported — several service paths throw rather than return, and those were
 * the ones that produced a blank screen.
 *
 * @example
 * ```tsx
 * const run = useApiAction();
 * const res = await run(() => api.glyph.delete(id), { success: 'Glyph deleted' });
 * if (res.success) refresh();
 * ```
 */
export function useApiAction() {
    const notify = useNotify();

    return useCallback(
        async <T,>(
            fn: () => ApiResponse<T> | Promise<ApiResponse<T>>,
            options?: ApiActionOptions,
        ): Promise<ApiResponse<T>> => {
            try {
                const response = await fn();
                if (!response.success) {
                    notify.error(response.error?.message ?? 'The operation failed.', {
                        title: options?.errorTitle,
                    });
                } else if (options?.success) {
                    notify.success(options.success);
                }
                return response;
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                notify.error(message, { title: options?.errorTitle });
                return {
                    success: false,
                    error: { code: 'UNKNOWN_ERROR', message },
                } as ApiResponse<T>;
            }
        },
        [notify],
    );
}
