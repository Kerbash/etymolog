/**
 * GraphemeGallery
 * ---------------
 * The grapheme binding of the shared {@link DirectoryGallery}: search and sort
 * for a grapheme, its card body, the per-card delete, and the folder-aware
 * empty-state copy. The inline folder tree (breadcrumb + collapsible subfolders
 * + folder CRUD + per-card "Move to folder"), `?folder=` deep-linking and the
 * "All graphemes" flat-view toggle all live in `shared/directory`.
 *
 * Behaviour preserved from before the folder rollout, because `PunctuationPage`
 * depends on it: `selectionMode` turns every card into a single button that
 * calls `onSelect` and suppresses the delete — and a picker is ALWAYS flat, so
 * it gets no folder chrome at all. Deletion still runs the `useGraphemeDelete`
 * two-stage flow (the ordinary danger confirmation, then — only when words are
 * spelled with this grapheme — a second dialog offering to respell).
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
import {
    DirectoryGallery,
    useGalleryState,
    graphemeCreateHref,
    type GalleryAdapters,
} from '../../../shared';
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
     * "create the first one" CTA — and always flat (no folder tree).
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
    const { api, data, isReady: contextReady, error: contextError } = useEtymolog();
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
        <DirectoryGallery<GraphemeComplete>
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
            folders={data.graphemeFolders ?? []}
            getItemFolderId={(grapheme) => grapheme.folder_id ?? null}
            folderApi={api.graphemeFolder}
            domainKey="grapheme"
            createHref={graphemeCreateHref}
            itemNoun="grapheme"
            allItemsLabel="All graphemes"
            browseFoldersLabel="Browse folders"
            empty={({ flatView, currentFolderId, createHref }) => {
                if (selectionMode) {
                    return {
                        icon: 'type',
                        title: 'No graphemes to choose from',
                        description: 'Create some graphemes in the Script Maker first.',
                    };
                }
                const atRoot = flatView || currentFolderId === null;
                return {
                    icon: 'type',
                    title: atRoot ? 'No graphemes yet' : 'This folder is empty',
                    description: atRoot
                        ? 'A grapheme is one or more glyphs standing for a sound. Add one to start the script.'
                        : 'No graphemes are filed in this folder yet. Create one here, or move one into it from its card.',
                    action: (
                        <IconButton
                            as={Link}
                            to={createHref(atRoot ? null : currentFolderId)}
                            iconName="plus-lg"
                            className={buttonStyles.primary}
                        >
                            {atRoot ? 'Create your first grapheme' : 'Create a grapheme here'}
                        </IconButton>
                    ),
                };
            }}
            noMatch={{
                title: 'No graphemes match',
                description: 'Nothing in the script matches the current search.',
            }}
        />
    );
}
