/**
 * LexiconGallery
 * --------------
 * The lexicon's binding of the shared {@link EntityGallery}: search, filter and
 * sort functions for a word, a card body, and the per-card actions.
 *
 * Everything structural (toolbar, paging, the two empty states, the card chrome,
 * hover/focus, the delete confirmation) now lives in `shared/gallery`. This file
 * used to hold 17 inline style objects, a JS hover-mutation pair, a
 * `setCurPage()` call during render and a hand-rolled delete modal — all three
 * galleries did, in three slightly different ways.
 */

import { useCallback } from 'react';
import { Link } from 'react-router-dom';

import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button';
import type { GalleryViewMode, SortOption } from 'cyber-components/display/dataGallery';

import { useEtymolog } from '../../../../db';
import type { LexiconComplete, GraphemeComplete } from '../../../../db/types';
import { ROUTES, resolveUrl } from '../../../../url_mapping';
import { DetailedLexiconDisplay } from '../../../display/lexicon/detailed';
import { CompactLexiconDisplay } from '../../../display/lexicon/compact';
import {
    EntityGallery,
    useGalleryState,
    useApiAction,
    useConfirm,
    type GalleryAdapters,
    type GalleryFilterOption,
} from '../../../shared';
import { lexiconDisplayName } from '../lexiconIdentity';

export type NativeFilter = 'all' | 'native' | 'external';

interface LexiconGalleryProps {
    lexicons: LexiconComplete[];
    graphemeMap: Map<number, GraphemeComplete>;
    /** `false` while the database is booting — drives the card skeleton. */
    isReady?: boolean;
    error?: Error | null;
    defaultViewMode?: GalleryViewMode;
    /** Picker mode (Phase 7 reuses this for "pick an ancestor"). */
    selectionMode?: boolean;
    onSelect?: (lexicon: LexiconComplete) => void;
}

const SORT_OPTIONS: SortOption[] = [
    { value: 'pronunciation-asc', displayComponent: <span>Pronunciation (A-Z)</span> },
    { value: 'pronunciation-desc', displayComponent: <span>Pronunciation (Z-A)</span> },
    { value: 'descendants-desc', displayComponent: <span>Most descendants</span> },
    { value: 'descendants-asc', displayComponent: <span>Fewest descendants</span> },
    { value: 'created-desc', displayComponent: <span>Newest first</span> },
    { value: 'created-asc', displayComponent: <span>Oldest first</span> },
];

const FILTER_OPTIONS: readonly GalleryFilterOption[] = [
    { value: 'all', label: 'All words' },
    { value: 'native', label: 'Native only' },
    { value: 'external', label: 'External only' },
];

const ADAPTERS: GalleryAdapters<LexiconComplete> = {
    search: (lexicon, query) =>
        (lexicon.pronunciation?.toLowerCase().includes(query) ?? false) ||
        lexicon.lemma.toLowerCase().includes(query) ||
        (lexicon.meaning?.toLowerCase().includes(query) ?? false),

    filter: (lexicon, filter) =>
        filter === 'native' ? Boolean(lexicon.is_native) : !lexicon.is_native,

    sort: (a, b, sortBy) => {
        switch (sortBy) {
            case 'pronunciation-asc':
                return lexiconDisplayName(a).localeCompare(lexiconDisplayName(b));
            case 'pronunciation-desc':
                return lexiconDisplayName(b).localeCompare(lexiconDisplayName(a));
            case 'descendants-desc':
                return (b.descendants?.length ?? 0) - (a.descendants?.length ?? 0);
            case 'descendants-asc':
                return (a.descendants?.length ?? 0) - (b.descendants?.length ?? 0);
            case 'created-desc':
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            case 'created-asc':
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            default:
                return 0;
        }
    },
};

export default function LexiconGallery({
    lexicons,
    graphemeMap,
    isReady = true,
    error,
    defaultViewMode,
    selectionMode = false,
    onSelect,
}: LexiconGalleryProps) {
    const { api, refresh } = useEtymolog();
    const confirm = useConfirm();
    const runApiAction = useApiAction();

    const state = useGalleryState({ defaultSort: 'pronunciation-asc', defaultViewMode });

    /**
     * Deletion goes through the ONE app-wide confirmation dialog, and names the
     * word EXACTLY as the view page titles it (see `lexiconDisplayName`) — the
     * modal this replaces named `lemma` while the heading showed `pronunciation`,
     * so on any word where the two differ the dialog asked about a different
     * string than the one the user was looking at.
     */
    const handleDelete = useCallback(
        async (lexicon: LexiconComplete) => {
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

            const result = await runApiAction(() => api.lexicon.delete(lexicon.id), {
                errorTitle: 'Could not delete word',
                success: `Deleted "${name}".`,
            });
            if (result.success) refresh();
        },
        [api, confirm, runApiAction, refresh],
    );

    const renderItem = useCallback(
        (lexicon: LexiconComplete, viewMode: GalleryViewMode) =>
            viewMode === 'compact' ? (
                <CompactLexiconDisplay lexiconData={lexicon} graphemeMap={graphemeMap} />
            ) : (
                <DetailedLexiconDisplay lexiconData={lexicon} graphemeMap={graphemeMap} />
            ),
        [graphemeMap],
    );

    const renderActions = useCallback(
        (lexicon: LexiconComplete) => (
            <>
                <IconButton
                    as={Link}
                    to={resolveUrl(ROUTES.lexiconEdit, { id: lexicon.id })}
                    iconName="pencil"
                    aria-label={`Edit ${lexiconDisplayName(lexicon)}`}
                />
                <IconButton
                    iconName="trash"
                    iconColor="var(--status-bad)"
                    onClick={() => void handleDelete(lexicon)}
                    aria-label={`Delete ${lexiconDisplayName(lexicon)}`}
                />
            </>
        ),
        [handleDelete],
    );

    return (
        <EntityGallery<LexiconComplete>
            items={lexicons}
            state={state}
            adapters={ADAPTERS}
            keyExtractor={(lexicon) => lexicon.id}
            renderItem={renderItem}
            itemLabel={lexiconDisplayName}
            itemHref={(lexicon) => resolveUrl(ROUTES.lexiconView, { id: lexicon.id })}
            renderActions={renderActions}
            selectionMode={selectionMode}
            onSelect={onSelect}
            ariaLabel="Lexicon gallery"
            isReady={isReady}
            error={error}
            searchPlaceholder="Search by pronunciation, lemma or meaning…"
            sortOptions={SORT_OPTIONS}
            filterOptions={FILTER_OPTIONS}
            filterLabel="Word origin"
            empty={{
                icon: 'journal-text',
                title: 'No words yet',
                description:
                    'A word needs graphemes to be spelled with — build a few in the Script Maker first if you have not. ' +
                    'Or let the generator propose words from the sounds you already have.',
                // Three ways out, not one. The copy used to NAME the Script
                // Maker and the generator without linking to either, which is
                // the dead end an empty state exists to prevent.
                action: (
                    <>
                        <IconButton
                            as={Link}
                            to={ROUTES.scriptMaker}
                            iconName="pencil-square"
                            className={buttonStyles.secondary}
                        >
                            Open the Script Maker
                        </IconButton>
                        <IconButton
                            as={Link}
                            to={ROUTES.lexiconGenerate}
                            iconName="shuffle"
                            className={buttonStyles.secondary}
                        >
                            Generate words
                        </IconButton>
                        <IconButton
                            as={Link}
                            to={ROUTES.lexiconCreate}
                            iconName="plus-lg"
                            className={buttonStyles.primary}
                        >
                            Create your first word
                        </IconButton>
                    </>
                ),
            }}
            noMatch={{
                title: 'No words match',
                description: 'Nothing in the lexicon matches the current search and filter.',
            }}
        />
    );
}
