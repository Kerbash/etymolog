import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { downloadBlob } from 'utils-func/graphic/export';

import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';
import EmptyState from 'cyber-components/display/emptyState';

import { useEtymolog } from '../../../db';
import { LoadingState, useNotify } from '../../shared';
import { AppBackground } from '../../shell';
import { ROUTES } from '../../../url_mapping';

interface ConlangGuardProps {
    children: ReactNode;
}

/**
 * ConlangGuard — decides whether the shell may render at all.
 *
 * Three outcomes, in order:
 *
 *  1. **Still opening the database.** sql.js has to fetch and instantiate a WASM
 *     module before anything can be read, which is 1–2 s on a cold load. That
 *     used to be the bare string "Loading…" with no layout; it is now a skeleton
 *     of the page that is about to appear.
 *  2. **The database would not open.** Previously this rendered nothing at all —
 *     a blank page with the failure only in the console. It is now an explicit
 *     dead end WITH a way out: an export of whatever could still be read, so a
 *     corrupted snapshot does not have to mean a lost conlang.
 *  3. **No conlang yet.** Redirect to `/new`.
 */
export default function ConlangGuard({ children }: ConlangGuardProps) {
    const { api, settings, isLoading, error } = useEtymolog();
    const notify = useNotify();

    if (isLoading) {
        return (
            <AppBackground>
                <LoadingState variant="page" label="Opening your conlang" />
            </AppBackground>
        );
    }

    if (error) {
        const rescueExport = () => {
            const result = api.database.export('json');
            if (!result.success || !result.data) {
                notify.error(
                    result.error?.message ??
                        'Nothing could be read from the database — there is nothing to export.',
                );
                return;
            }
            downloadBlob(result.data, 'etymolog-rescue.json');
        };

        return (
            <AppBackground>
                <EmptyState
                    ariaLive="polite"
                    icon="exclamation-octagon"
                    title="The conlang database could not be opened"
                    description={
                        `${error.message} — reloading is worth a try; the app keeps the previous ` +
                        `snapshot and will fall back to it. If that does not help, export whatever ` +
                        `is still readable before doing anything else.`
                    }
                    action={
                        <Button className={buttonStyles.primary} onClick={rescueExport}>
                            Export what we could
                        </Button>
                    }
                />
            </AppBackground>
        );
    }

    if (!settings.conlangName) {
        return <Navigate to={ROUTES.new} replace />;
    }

    return <>{children}</>;
}
