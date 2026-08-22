/**
 * LexiconViewPage
 * ---------------
 * VIEW ONLY. Editing lives at `ROUTES.lexiconEdit` (`EditLexiconPage`), on its
 * own URL, like every other entity in the app.
 *
 * What the in-page edit mode this replaces cost: the Edit and Delete buttons
 * disappeared when it opened (so the header jumped), the edit had no URL to
 * link, bookmark or come back to, and a reload discarded it without asking.
 */

import { useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import EmptyState from 'cyber-components/display/emptyState';
import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';

import { useEtymolog } from '../../../../db';
import type { LexiconComplete } from '../../../../db/types';
import { ROUTES, resolveUrl } from '../../../../url_mapping';
import { DetailedLexiconDisplay } from '../../../display/lexicon/detailed';
import { EtymologyTree } from '../../../display/lexicon/etymologyTree';
import { LoadingState, PageHeader, useApiAction, useConfirm } from '../../../shared';
import { lexiconDisplayName } from '../lexiconIdentity';

import styles from './LexiconViewPage.module.scss';

export default function LexiconViewPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { api, data, refresh, isReady, error } = useEtymolog();
    const confirm = useConfirm();
    const runApiAction = useApiAction();

    const lexiconId = id ? Number.parseInt(id, 10) : Number.NaN;
    const validId = Number.isInteger(lexiconId);

    const graphemeMap = useMemo(
        () => new Map((data.graphemesComplete ?? []).map((g) => [g.id, g] as const)),
        [data.graphemesComplete],
    );

    const lexiconResult = validId && isReady ? api.lexicon.getByIdComplete(lexiconId) : null;
    const lexicon: LexiconComplete | null = lexiconResult?.success
        ? (lexiconResult.data ?? null)
        : null;

    const ancestryTreeResult = validId && isReady ? api.lexicon.getAncestryTree(lexiconId, 3) : null;
    const ancestryTree = ancestryTreeResult?.success ? (ancestryTreeResult.data ?? null) : null;

    /**
     * The confirmation names the word EXACTLY as the page title does — one rule,
     * `lexiconDisplayName`. The dialog this replaces asked about `lemma` while
     * the heading showed `pronunciation`, so the two disagreed on every word
     * where they differ.
     */
    const handleDelete = useCallback(async () => {
        if (!lexicon || !validId) return;

        const name = lexiconDisplayName(lexicon);
        const descendantCount = lexicon.descendants?.length ?? 0;

        let message = 'This cannot be undone.';
        if (descendantCount > 0) {
            const names = lexicon.descendants
                .slice(0, 3)
                .map((d) => lexiconDisplayName(d.descendant))
                .join(', ');
            const more = descendantCount > 3 ? ` and ${descendantCount - 3} more` : '';
            message =
                `This word has ${descendantCount} descendant${descendantCount !== 1 ? 's' : ''}: ` +
                `${names}${more}. Deleting it removes the etymology links from those words. ` +
                `This cannot be undone.`;
        }

        const confirmed = await confirm({
            title: `Delete word "${name}"?`,
            message,
            confirmLabel: 'Delete word',
            tone: 'danger',
        });
        if (!confirmed) return;

        const result = await runApiAction(() => api.lexicon.delete(lexiconId), {
            errorTitle: 'Could not delete word',
            success: `Deleted "${name}".`,
        });
        if (result.success) {
            refresh();
            navigate(ROUTES.lexicon);
        }
    }, [api, confirm, runApiAction, lexicon, lexiconId, validId, refresh, navigate]);

    const handleTreeNodeClick = useCallback(
        (nodeId: number) => navigate(resolveUrl(ROUTES.lexiconView, { id: nodeId })),
        [navigate],
    );

    if (!isReady && !error) {
        return <LoadingState variant="page" label="Loading the word" />;
    }

    if (error) {
        return (
            <EmptyState
                icon="exclamation-triangle"
                title="The database could not be opened"
                description={error.message}
                action={
                    <Button as={Link} to={ROUTES.lexicon} className={buttonStyles.secondary}>
                        Back to Lexicon
                    </Button>
                }
            />
        );
    }

    // Invalid id and not-found are the SAME dead end to the user, and both used
    // to be a bare `<p>` with a naked link under it.
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

    const name = lexiconDisplayName(lexicon);
    const hasEtymology = (ancestryTree?.ancestors?.length ?? 0) > 0;

    return (
        <>
            <PageHeader
                title={name}
                back={{ to: ROUTES.lexicon, label: 'Lexicon' }}
                actions={
                    <>
                        <IconButton
                            as={Link}
                            to={resolveUrl(ROUTES.lexiconEdit, { id: lexicon.id })}
                            iconName="pencil"
                            className={buttonStyles.secondary}
                        >
                            Edit
                        </IconButton>
                        <IconButton
                            iconName="trash"
                            iconColor="var(--status-bad)"
                            onClick={() => void handleDelete()}
                        >
                            Delete
                        </IconButton>
                    </>
                }
            />

            <div className={styles.content}>
                {/* No wrapper class: DetailedLexiconDisplay's own root already
                    paints the card (padding + surface + border). */}
                <section>
                    <DetailedLexiconDisplay
                        lexiconData={lexicon}
                        graphemeMap={graphemeMap}
                        showAncestry={false}
                    />
                </section>

                <section className={styles.section} aria-labelledby="etymology-heading">
                    <h3 id="etymology-heading" className={styles.sectionTitle}>
                        Etymology
                    </h3>
                    {hasEtymology && ancestryTree ? (
                        <EtymologyTree
                            rootNode={ancestryTree}
                            direction="ancestors"
                            maxDepth={3}
                            onNodeClick={handleTreeNodeClick}
                            currentWordId={lexicon.id}
                        />
                    ) : (
                        // A sentence saying "no etymology data available" is a
                        // dead end; the user is on the one page that knows how
                        // to fix it.
                        <EmptyState
                            icon="diagram-3"
                            title="No ancestors recorded"
                            description="Link this word to the words it came from to build its etymology."
                            action={
                                <Button
                                    as={Link}
                                    to={resolveUrl(ROUTES.lexiconEdit, { id: lexicon.id })}
                                    className={buttonStyles.secondary}
                                >
                                    Add ancestors
                                </Button>
                            }
                        />
                    )}
                </section>

                {lexicon.descendants && lexicon.descendants.length > 0 && (
                    <section className={styles.section} aria-labelledby="descendants-heading">
                        <h3 id="descendants-heading" className={styles.sectionTitle}>
                            Descendants ({lexicon.descendants.length})
                        </h3>
                        <ul className={styles.descendantsList}>
                            {lexicon.descendants.map((d) => (
                                <li key={d.descendant.id}>
                                    <Link
                                        to={resolveUrl(ROUTES.lexiconView, {
                                            id: d.descendant.id,
                                        })}
                                        className={styles.descendantItem}
                                    >
                                        <span className={styles.descendantType}>
                                            {d.ancestry_type}
                                        </span>
                                        <span className={styles.descendantLemma}>
                                            {lexiconDisplayName(d.descendant)}
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </>
    );
}
