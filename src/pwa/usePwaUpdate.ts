import { useCallback, useSyncExternalStore } from 'react';

import {
    getPwaUpdateController,
    type PwaUpdateState,
    type PwaUpdateStatus,
} from './updateController';

export interface PwaUpdateHandle extends PwaUpdateState {
    /** True when a new build is waiting and the banner should offer it. */
    updateReady: boolean;
    /** Take the waiting build live now (flushes persistence, then reloads). */
    apply(): void;
    /** Hide the banner for the rest of the session. */
    dismiss(): void;
    /** Ask the browser to look for a new build right now. */
    checkNow(): void;
}

/** Statuses that mean "there is a new build the user can take". */
const OFFERABLE: readonly PwaUpdateStatus[] = ['ready', 'applying'];

/**
 * React's view of {@link getPwaUpdateController}.
 *
 * `useSyncExternalStore` rather than a context + state: the controller is a
 * process-wide singleton created before React mounts, and its state changes
 * from timers and DOM events that have no component to live in. The store
 * returns the SAME object until something actually moves, which is what keeps
 * an hourly poll from re-rendering the shell.
 */
export function usePwaUpdate(): PwaUpdateHandle {
    const controller = getPwaUpdateController();
    const state = useSyncExternalStore(
        controller.subscribe,
        controller.getState,
        controller.getState,
    );

    const apply = useCallback(() => {
        void controller.apply();
    }, [controller]);

    const dismiss = useCallback(() => {
        controller.dismiss();
    }, [controller]);

    const checkNow = useCallback(() => {
        void controller.checkNow();
    }, [controller]);

    return {
        ...state,
        updateReady: OFFERABLE.includes(state.status),
        apply,
        dismiss,
        checkNow,
    };
}
