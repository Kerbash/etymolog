/**
 * Barrel for the PWA update flow — how a running tab notices, and takes, a new
 * deploy without a force-refresh. See `updateController.ts` for the design.
 */

export {
    createPwaUpdateController,
    getPwaUpdateController,
    installPwaUpdates,
    resetPwaUpdatesForTests,
    PWA_APPLIED_FLAG,
    PWA_APPLY_TIMEOUT_MS,
    PWA_CHECK_INTERVAL_MS,
    PWA_ROUTE_CHECK_THROTTLE_MS,
    PWA_EVENT_CHECK_THROTTLE_MS,
} from './updateController';
export type {
    PwaUpdateController,
    PwaUpdateControllerOptions,
    PwaUpdateState,
    PwaUpdateStatus,
    RegisterSWLike,
    RegisterSWLikeOptions,
} from './updateController';
export { usePwaUpdate } from './usePwaUpdate';
export type { PwaUpdateHandle } from './usePwaUpdate';
export { default as PwaUpdateGate } from './PwaUpdateGate';
