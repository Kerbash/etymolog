/**
 * GlyphGallery
 * ------------
 * The glyph binding of the shared {@link DirectoryGallery}: search and sort for
 * a glyph, its card body, the per-card delete, and the folder-aware empty-state
 * copy. The inline folder tree (breadcrumb + collapsible subfolders + folder
 * CRUD + per-card "Move to folder"), `?folder=` deep-linking and the "All
 * glyphs" flat-view toggle all live in `shared/directory`.
 *
 * Two behaviours are preserved deliberately:
 *
 *  - deletion calls `api.glyph.cascadeDelete`, not `delete`: a glyph's
 *    graphemes cannot outlive it, and the context wrapper refreshes the
 *    affected slices;
 *  - the "Auto-manage" switch stays in the toolbar (`toolbarEndSlot`), with a
 *    real accessible name; `showViewToggle={false}` and `minItemWidth="160px"`
 *    keep the glyph grid's compact, denser layout.
 */

import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';

import CyberSwitch from 'cyber-components/interactable/switch/switch/switch.tsx';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button';
import type { SortOption } from 'cyber-components/display/dataGallery';

import { useEtymolog, type GlyphWithUsage, type GraphemeComplete } from '../../../../db';
import { ROUTES, resolveUrl } from '../../../../url_mapping';
import GlyphCard from '../../../display/glyphs/glyphCard';
import {
    DirectoryGallery,
    useGalleryState,
    useApiAction,
    useConfirm,
    glyphCreateHref,
    type GalleryAdapters,
} from '../../../shared';

import styles from './galleryGlyphs.module.scss';

const SORT_OPTIONS: SortOption[] = [
    { value: 'name-asc', displayComponent: <span>Name (A-Z)</span> },
    { value: 'name-desc', displayComponent: <span>Name (Z-A)</span> },
    { value: 'usage-desc', displayComponent: <span>Most used</span> },
    { value: 'usage-asc', displayComponent: <span>Least used</span> },
];

const ADAPTERS: GalleryAdapters<GlyphWithUsage> = {
    search: (glyph, query) => glyph.name.toLowerCase().includes(query),
    sort: (a, b, sortBy) => {
        switch (sortBy) {
            case 'name-asc':
                return a.name.localeCompare(b.name);
            case 'name-desc':
                return b.name.localeCompare(a.name);
            case 'usage-desc':
                return (b.usageCount ?? 0) - (a.usageCount ?? 0);
            case 'usage-asc':
                return (a.usageCount ?? 0) - (b.usageCount ?? 0);
            default:
                return 0;
        }
    },
};

export default function GlyphGallery() {
    const { api, data, settings, isReady, error } = useEtymolog();
    const confirm = useConfirm();
    const runApiAction = useApiAction();

    const { glyphsWithUsage, graphemesComplete } = data;

    const state = useGalleryState({ defaultSort: 'name-asc', defaultViewMode: 'compact' });

    /** glyph id → the graphemes that would be deleted with it. */
    const graphemesByGlyph = useMemo(() => {
        const map = new Map<number, GraphemeComplete[]>();
        for (const grapheme of graphemesComplete ?? []) {
            for (const glyph of grapheme.glyphs) {
                const list = map.get(glyph.id) ?? [];
                list.push(grapheme);
                map.set(glyph.id, list);
            }
        }
        return map;
    }, [graphemesComplete]);

    const handleAutoManageToggle = useCallback(
        (value: boolean) => {
            api.settings.update({ autoManageGlyphs: value });
        },
        [api],
    );

    const handleDelete = useCallback(
        async (glyph: GlyphWithUsage) => {
            const affected = graphemesByGlyph.get(glyph.id) ?? [];

            const confirmed = await confirm({
                title: `Delete glyph "${glyph.name}"?`,
                message: affected.length
                    ? `${affected.length} grapheme(s) reference this glyph and will be deleted with ` +
                      `it: ${affected.map((g) => g.name).join(', ')}. Unlink the glyph from them ` +
                      `first if you want to keep them. This cannot be undone.`
                    : 'This cannot be undone.',
                confirmLabel: 'Delete glyph',
                tone: 'danger',
            });
            if (!confirmed) return;

            await runApiAction(() => api.glyph.cascadeDelete(glyph.id), {
                errorTitle: 'Could not delete glyph',
                success: `Deleted "${glyph.name}".`,
            });
        },
        [api, confirm, runApiAction, graphemesByGlyph],
    );

    /**
     * `interactionMode="none"` + `hideDelete`: the card chrome, the link and the
     * delete control all belong to `EntityCard` now. Left as-is, `GlyphCard`'s
     * default 'route' mode renders a `<Link>` with a delete `<button>` INSIDE
     * it — an interactive element nested in an interactive element.
     */
    const renderItem = useCallback(
        (glyph: GlyphWithUsage) => (
            <GlyphCard glyph={glyph} interactionMode="none" hideDelete />
        ),
        [],
    );

    const renderActions = useCallback(
        (glyph: GlyphWithUsage) => (
            <IconButton
                iconName="trash"
                iconColor="var(--status-bad)"
                onClick={() => void handleDelete(glyph)}
                aria-label={`Delete glyph ${glyph.name}`}
            />
        ),
        [handleDelete],
    );

    return (
        <DirectoryGallery<GlyphWithUsage>
            items={glyphsWithUsage ?? []}
            state={state}
            adapters={ADAPTERS}
            keyExtractor={(glyph) => glyph.id}
            renderItem={renderItem}
            itemLabel={(glyph) => glyph.name}
            itemHref={(glyph) => resolveUrl(ROUTES.glyphEdit, { id: glyph.id })}
            renderActions={renderActions}
            ariaLabel="Glyph gallery"
            isReady={isReady}
            error={error}
            searchPlaceholder="Search glyphs…"
            sortOptions={SORT_OPTIONS}
            showViewToggle={false}
            minItemWidth="160px"
            maxItemWidth="1fr"
            folders={data.glyphFolders ?? []}
            getItemFolderId={(glyph) => glyph.folder_id ?? null}
            folderApi={api.glyphFolder}
            domainKey="glyph"
            createHref={glyphCreateHref}
            itemNoun="glyph"
            allItemsLabel="All glyphs"
            browseFoldersLabel="Browse folders"
            toolbarEndSlot={
                <div className={styles.autoManage}>
                    {/* Visible text AND an aria-label: `CyberSwitch` renders a
                        `role="switch"` button that takes `aria-label` but no
                        `id`, so a `<label htmlFor>` can never reach it. */}
                    <span>Auto-manage</span>
                    <CyberSwitch
                        value={settings.autoManageGlyphs}
                        onChange={handleAutoManageToggle}
                        width="2.5em"
                        aria-label="Auto-manage orphaned glyphs"
                    />
                </div>
            }
            empty={({ flatView, currentFolderId, createHref }) => {
                const atRoot = flatView || currentFolderId === null;
                return {
                    icon: 'pencil',
                    title: atRoot ? 'No glyphs yet' : 'This folder is empty',
                    description: atRoot
                        ? 'A glyph is one drawn mark. Draw one to start building the script.'
                        : 'No glyphs are filed in this folder yet. Draw one here, or move one into it from its card.',
                    action: (
                        <IconButton
                            as={Link}
                            to={createHref(atRoot ? null : currentFolderId)}
                            iconName="plus-lg"
                            className={buttonStyles.primary}
                        >
                            {atRoot ? 'Draw your first glyph' : 'Draw a glyph here'}
                        </IconButton>
                    ),
                };
            }}
            noMatch={{
                title: 'No glyphs match',
                description: 'No glyph name matches the current search.',
            }}
        />
    );
}
