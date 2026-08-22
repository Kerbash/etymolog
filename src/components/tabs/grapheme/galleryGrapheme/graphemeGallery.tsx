/**
 * GraphemeGallery
 * ---------------
 * The grapheme binding of the shared {@link EntityGallery}.
 *
 * Behaviour preserved from the copy this replaces, because `PunctuationPage`
 * depends on it: `selectionMode` turns every card into a single button that
 * calls `onSelect` instead of navigating, and suppresses the delete action.
 */

import { useCallback } from 'react';
import { Link } from 'react-router-dom';

import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button';
import type { GalleryViewMode, SortOption } from 'cyber-components/display/dataGallery';

import { useEtymolog, type GraphemeComplete } from '@src/db';
import { ROUTES, resolveUrl } from '../../../../url_mapping';
import DetailedGraphemeDisplay from '../../../display/grapheme/detailed/detailed.tsx';
import CompactGraphemeDisplay from '../../../display/grapheme/compact/compact.tsx';
import { EntityGallery, useGalleryState, type GalleryAdapters } from '../../../shared';
import { useGraphemeDelete } from '../useGraphemeDelete';

interface GraphemeGalleryProps {
    /** Omit to source the list from the context. */
    graphemes?: GraphemeComplete[];
    /** `false` while the database is booting. */
    isReady?: boolean;
    error?: Error | null;
    defaultViewMode?: GalleryViewMode;
    /** Called when a grapheme card is activated outside selection mode. */
    onGraphemeClick?: (grapheme: GraphemeComplete) => void;
    /**
     * Picker mode for modals: one `<button>` per card, no delete action, no
     * "create the first one" CTA.
     */
    selectionMode?: boolean;
    onSelect?: (grapheme: GraphemeComplete) => void;
}

const SORT_OPTIONS: SortOption[] = [
    { value: 'name-asc', displayComponent: <span>Name (A-Z)</span> },
    { value: 'name-desc', displayComponent: <span>Name (Z-A)</span> },
    { value: 'glyphs-desc', displayComponent: <span>Most glyphs</span> },
    { value: 'glyphs-asc', displayComponent: <span>Fewest glyphs</span> },
];

const ADAPTERS: GalleryAdapters<GraphemeComplete> = {
    search: (grapheme, query) =>
        grapheme.name.toLowerCase().includes(query) ||
        grapheme.phonemes.some((p) => p.phoneme.toLowerCase().includes(query)) ||
        grapheme.glyphs.some((g) => g.name.toLowerCase().includes(query)),

    sort: (a, b, sortBy) => {
        switch (sortBy) {
            case 'name-asc':
                return a.name.localeCompare(b.name);
            case 'name-desc':
                return b.name.localeCompare(a.name);
            case 'glyphs-desc':
                return b.glyphs.length - a.glyphs.length;
            case 'glyphs-asc':
                return a.glyphs.length - b.glyphs.length;
            default:
                return 0;
        }
    },
};

export default function GraphemeGallery({
    graphemes,
    isReady: isReadyProp,
    error: errorProp,
    defaultViewMode,
    onGraphemeClick,
    selectionMode = false,
    onSelect,
}: GraphemeGalleryProps) {
    const { data, isReady: contextReady, error: contextError } = useEtymolog();
    // The SAME two-stage flow the edit page uses: the ordinary danger
    // confirmation, and — only when words are spelled with this grapheme — a
    // second dialog naming them and offering to respell. The card used to ask
    // one question whose message described behaviour the service does not have,
    // and then fail with a raw constraint error the user could not act on.
    const deleteGrapheme = useGraphemeDelete();

    const items = graphemes ?? data.graphemesComplete ?? [];
    const isReady = isReadyProp ?? contextReady;
    const error = errorProp ?? contextError ?? null;

    const state = useGalleryState({ defaultSort: 'name-asc', defaultViewMode });

    const handleDelete = useCallback(
        (grapheme: GraphemeComplete) => deleteGrapheme({ id: grapheme.id, name: grapheme.name }),
        [deleteGrapheme],
    );

    const renderItem = useCallback(
        (grapheme: GraphemeComplete, viewMode: GalleryViewMode) =>
            viewMode === 'compact' ? (
                <CompactGraphemeDisplay graphemeData={grapheme} />
            ) : (
                <DetailedGraphemeDisplay graphemeData={grapheme} />
            ),
        [],
    );

    const renderActions = useCallback(
        (grapheme: GraphemeComplete) => (
            <IconButton
                iconName="trash"
                iconColor="var(--status-bad)"
                onClick={() => void handleDelete(grapheme)}
                aria-label={`Delete grapheme ${grapheme.name}`}
            />
        ),
        [handleDelete],
    );

    return (
        <EntityGallery<GraphemeComplete>
            items={items}
            state={state}
            adapters={ADAPTERS}
            keyExtractor={(grapheme) => grapheme.id}
            renderItem={renderItem}
            itemLabel={(grapheme) => grapheme.name}
            itemHref={
                selectionMode || onGraphemeClick
                    ? undefined
                    : (grapheme) => resolveUrl(ROUTES.graphemeEdit, { id: grapheme.id })
            }
            onItemActivate={onGraphemeClick}
            renderActions={renderActions}
            selectionMode={selectionMode}
            // `PunctuationPage` passes its picker callback as `onGraphemeClick`,
            // which is the selection callback in selection mode.
            onSelect={selectionMode ? (onSelect ?? onGraphemeClick) : undefined}
            ariaLabel="Grapheme gallery"
            isReady={isReady}
            error={error}
            searchPlaceholder="Search by name, phoneme or glyph…"
            sortOptions={SORT_OPTIONS}
            empty={{
                icon: 'type',
                title: selectionMode ? 'No graphemes to choose from' : 'No graphemes yet',
                description: selectionMode
                    ? 'Create some graphemes in the Script Maker first.'
                    : 'A grapheme is one or more glyphs standing for a sound. Add one to start the script.',
                action: (
                    <IconButton
                        as={Link}
                        to={ROUTES.scriptMakerCreate}
                        iconName="plus-lg"
                        className={buttonStyles.primary}
                    >
                        Create your first grapheme
                    </IconButton>
                ),
            }}
            noMatch={{
                title: 'No graphemes match',
                description: 'Nothing in the script matches the current search.',
            }}
        />
    );
}
