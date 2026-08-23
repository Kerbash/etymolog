import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { APP_VERSION } from '../config/version';
import { useNotify } from '../components/shared/notifications';
import { useUnsavedChanges } from '../components/shell/unsavedChanges';
import { getPwaUpdateController } from './updateController';

/**
 * PwaUpdateGate — the three wires between React and the update controller.
 *
 * Renders nothing. It exists because all three wires need router and app
 * context that the controller (a pre-React singleton) cannot reach:
 *
 *  1. **the dirty probe** — the unsaved-changes registry is a ref inside a
 *     provider, so the controller cannot read it; the gate pushes the reader in
 *     and takes it back out on unmount. Installed FIRST, before any route
 *     change can be handled, because a missing probe reads as "clean".
 *  2. **the boot notice** — the reload that applied an update is
 *     indistinguishable from any other page load, so the version bump is
 *     announced from a flag the controller wrote just before reloading.
 *  3. **route changes** — the moment an editor unmounts is the moment a
 *     held-back update becomes safe to apply, and it is also the cheapest
 *     place to poll for a new deploy.
 *
 * Mount it inside `UnsavedChangesRegistry` (for 1) and below
 * `NotificationProvider` (for 2).
 */
export default function PwaUpdateGate() {
    const { pathname } = useLocation();
    const { isDirty } = useUnsavedChanges();
    const notify = useNotify();
    const controller = getPwaUpdateController();

    useEffect(() => {
        controller.setDirtyProbe(isDirty);
        return () => controller.setDirtyProbe(null);
    }, [controller, isDirty]);

    useEffect(() => {
        // `consumeAppliedFlag()` clears as it reads, so StrictMode's
        // mount → cleanup → mount cycle announces once, not twice.
        if (controller.consumeAppliedFlag()) {
            notify.info(`Updated to v${APP_VERSION}`);
        }
    }, [controller, notify]);

    useEffect(() => {
        controller.handleRouteChange();
    }, [controller, pathname]);

    return null;
}
