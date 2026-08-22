import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import NotificationBanner, {
    type NotificationBannerSeverity,
} from 'cyber-components/interactable/information/notificationBanner';

import {
    DEFAULT_AUTO_HIDE,
    NotificationContext,
    type Notice,
    type NotifyApi,
    type NotifyOptions,
} from './notificationContext';

export interface NotificationProviderProps {
    children: ReactNode;
    /**
     * Distance from the top of the viewport, in px. Set this to the sticky
     * header's height so the banner clears it instead of being drawn behind it.
     */
    offsetTop?: number;
}

/**
 * NotificationProvider — the app's ONE failure/success surface.
 *
 * Before this, 22 call sites reported failures to the console and nothing else:
 * an export that failed, a delete that was refused, a refresh that threw — all
 * silent, with the UI simply not changing. The user's only signal was that
 * nothing happened.
 *
 * Queue semantics: notices are FIFO and only the HEAD is rendered. A single
 * banner is a fixed-position element; stacking three of them covers the content
 * the user is trying to act on, and interleaving auto-hide timers across a stack
 * makes the order they vanish in unpredictable. One at a time, in the order they
 * arrived, is the behaviour that stays legible when a batch operation reports
 * six failures.
 *
 * Mount it ABOVE the routes so a notice survives navigation (a delete that fails
 * and then redirects still gets to say so).
 */
export function NotificationProvider({ children, offsetTop = 16 }: NotificationProviderProps) {
    const [queue, setQueue] = useState<Notice[]>([]);
    const nextId = useRef(1);

    const enqueue = useCallback(
        (severity: NotificationBannerSeverity, message: string, options?: NotifyOptions): number => {
            const id = nextId.current++;
            setQueue((prev) => [
                ...prev,
                {
                    id,
                    severity,
                    message,
                    title: options?.title,
                    actions: options?.actions,
                    autoHideMs:
                        options?.autoHideMs !== undefined
                            ? options.autoHideMs
                            : DEFAULT_AUTO_HIDE[severity],
                },
            ]);
            return id;
        },
        [],
    );

    const api = useMemo<NotifyApi>(
        () => ({
            success: (m, o) => enqueue('success', m, o),
            error: (m, o) => enqueue('error', m, o),
            warning: (m, o) => enqueue('warning', m, o),
            info: (m, o) => enqueue('info', m, o),
            dismiss: (id) => setQueue((prev) => prev.filter((n) => n.id !== id)),
            clear: () => setQueue([]),
        }),
        [enqueue],
    );

    const head = queue[0];

    return (
        <NotificationContext.Provider value={api}>
            {children}
            {head && (
                <NotificationBanner
                    // Keyed by notice id so a NEW head remounts the banner:
                    // without this, replacing the message in place leaves the
                    // previous notice's auto-hide timer running and the new one
                    // vanishes early.
                    key={head.id}
                    visible
                    severity={head.severity}
                    title={head.title}
                    message={head.message}
                    actions={head.actions}
                    autoHideMs={head.autoHideMs}
                    pauseAutoHideOnHover
                    offsetTop={offsetTop}
                    onDismiss={() => api.dismiss(head.id)}
                />
            )}
        </NotificationContext.Provider>
    );
}

export default NotificationProvider;
