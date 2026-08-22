/**
 * EditLexiconPage — the `/lexicon/db/:id/edit` route.
 *
 * NEW in Phase 6. Editing a word used to be a MODE on the view page: no URL, so
 * it could not be linked to, bookmarked, or reached with the back button, and a
 * reload discarded it without a word. Every other entity in the app edits on a
 * route; the lexicon now does too.
 */

import { useParams } from 'react-router-dom';

import EmptyState from 'cyber-components/display/emptyState';
import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';
import { Link } from 'react-router-dom';

import { useEtymolog } from '../../../../db';
import type { LexiconComplete } from '../../../../db/types';
import { ROUTES } from '../../../../url_mapping';
import { LoadingState } from '../../../shared';
import { LexiconEditor } from '../editor';

export default function EditLexiconPage() {
    const { id } = useParams<{ id: string }>();
    const { api, isReady, error } = useEtymolog();

    const lexiconId = id ? Number.parseInt(id, 10) : Number.NaN;
    const validId = Number.isInteger(lexiconId);

    if (!isReady && !error) {
        return <LoadingState variant="form" label="Loading the word" count={5} />;
    }

    const result = validId ? api.lexicon.getByIdComplete(lexiconId) : null;
    const lexicon: LexiconComplete | null = result?.success ? (result.data ?? null) : null;

    if (!validId || !lexicon) {
        return (
            <EmptyState
                icon="question-circle"
                title={validId ? 'That word does not exist' : 'That is not a word id'}
                description={
                    validId
                        ? 'It may have been deleted, or the link may be out of date.'
                        : `"${id}" is not a valid word id.`
                }
                action={
                    <Button as={Link} to={ROUTES.lexicon} className={buttonStyles.secondary}>
                        Back to Lexicon
                    </Button>
                }
            />
        );
    }

    return <LexiconEditor mode="edit" initialData={lexicon} />;
}
