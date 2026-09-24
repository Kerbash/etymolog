/**
 * NotFoundNotice — what a tab shows for an address it has no page for.
 *
 * A mistyped or stale address used to render an EMPTY panel inside the tab
 * (e.g. `/script-maker/graphemes/create`; the real page is
 * `/script-maker/create`), and elsewhere it bounced silently to another page.
 * Neither says what happened. This names the address and offers the way back,
 * so nothing happens behind the user's back.
 */

import { Link, useLocation } from 'react-router-dom';

import EmptyState from 'cyber-components/display/emptyState';
import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';

export interface NotFoundNoticeProps {
    /** Where the "back" button goes — the tab's home. */
    backTo: string;
    /** Its label, e.g. "Go to the Script Maker". */
    backLabel: string;
}

export default function NotFoundNotice({ backTo, backLabel }: NotFoundNoticeProps) {
    const { pathname } = useLocation();
    return (
        <EmptyState
            ariaLive="polite"
            icon="signpost-split"
            title="There is no page here"
            description={`Nothing lives at “${pathname}” — the address may be mistyped or out of date.`}
            action={(
                <Button as={Link} to={backTo} className={buttonStyles.primary}>
                    {backLabel}
                </Button>
            )}
        />
    );
}
