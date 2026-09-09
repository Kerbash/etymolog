/**
 * DirectoryGallery
 * ================
 * The ONE binding that gives any {@link EntityGallery} an inline, collapsible
 * folder tree — used (from Phase 3) by the lexicon and (Phase 4) by the glyph
 * and grapheme galleries, so the "folders" behaviour lives in exactly one place.
 *
 * Two modes:
 *
 *  - **Flat view** (`selectionMode || allItems || searchActive`) renders a plain
 *    `EntityGallery` over the FULL item list, exactly as before — pagination and
 *    all. A live search always escapes the folder (a word you are searching for
 *    might live anywhere in the tree); a picker is a flat chooser with no folder
 *    chrome at all.
 *  - **Tree view** shows a breadcrumb for the focused folder (`?folder=`), that
 *    folder's own items in the gallery grid (the "current directory content"),
 *    and BELOW them a {@link TreeExplorer} over the focused root's subtree. Each
 *    tree node is a folder: its header carries the name + direct item count, its
 *    end-slot the folder CRUD, and expanding it reveals its subfolders
 *    (recursively) plus a capped grid of its own items — `TREE_ITEM_CAP` cards
 *    then a "Show all N →" row that FOCUSES the folder (it becomes the new tree
 *    root). Caps replace pagination on the tree side; nothing navigates itself.
 *
 * The `EntityGallery` stays mounted across the flat↔tree switch (only its
 * `items` and empty copy change), so the search box never loses focus mid-type.
 *
 * `?folder=` is validated against the loaded folder slice here (unknown or
 * non-numeric → root), and expansion state persists per domain in localStorage
 * (best-effort, corrupt-safe, pruned against the live slice). Folder mutations
 * go through the passed `folderApi`, whose provider-wrapped methods already
 * refresh the folder + item slices — this component never double-refreshes.
 */

import classNames from 'classnames';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { TreeExplorer } from 'cyber-components/display/treeExplorer';
import type { TreeNodeContext, TreeNodeId } from 'cyber-components/display/treeExplorer';
import type { GalleryViewMode } from 'cyber-components/display/dataGallery';
import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';

import type { FolderRecord } from '../../../db/types';
import type { FolderApi } from '../../../db/api/folderApi';
import { useConfirm } from '../confirmDialog';
import { useApiAction } from '../notifications';
import {
    EntityCard,
    EntityGallery,
    applyGallery,
    GALLERY_FILTER_ALL,
    type EntityGalleryProps,
    type GalleryEmptyCopy,
} from '../gallery';
import {
    childFolders,
    compareFolders,
    descendantFolders,
    folderPath,
    indexFolders,
} from './folderTree';
import FolderNameDialog from './FolderNameDialog';
import MoveToFolderDialog from './MoveToFolderDialog';

import styles from './directory.module.scss';

/** How many of a folder's items a tree node shows before "Show all N →". */
export const TREE_ITEM_CAP = 12;

/** Per-domain localStorage key for the persisted expanded-folder set. */
const expansionStorageKey = (domainKey: string) => `etymolog.treeExpansion.${domainKey}`;

/** A folder decorated with the `parentId` the generic tree needs. */
type FolderNode = FolderRecord & { parentId: number | null };

const EMPTY_ITEMS: readonly never[] = [];

/** Context the caller's `empty` factory receives — it owns all the copy. */
export interface DirectoryEmptyContext {
    /** True when the flat gallery is showing (search, "all items", or picker). */
    flatView: boolean;
    /** The focused folder, or null at the root. */
    currentFolderId: number | null;
    /** The create-in-folder link builder passed to DirectoryGallery. */
    createHref: (folderId: number | null) => string;
}

/** EntityGallery props DirectoryGallery forwards verbatim (all but `empty`). */
type ForwardedGalleryProps<T> = Pick<
    EntityGalleryProps<T>,
    | 'items'
    | 'state'
    | 'adapters'
    | 'keyExtractor'
    | 'renderItem'
    | 'itemLabel'
    | 'itemHref'
    | 'onItemActivate'
    | 'renderActions'
    | 'selectionMode'
    | 'onSelect'
    | 'ariaLabel'
    | 'isReady'
    | 'error'
    | 'searchPlaceholder'
    | 'sortOptions'
    | 'filterOptions'
    | 'filterLabel'
    | 'showViewToggle'
    | 'minItemWidth'
    | 'maxItemWidth'
    | 'itemGap'
    | 'toolbarEndSlot'
    | 'noMatch'
    | 'className'
>;

export interface DirectoryGalleryProps<T> extends ForwardedGalleryProps<T> {
    /**
     * Copy for the "nothing here" state. A factory when the copy depends on
     * whether the flat or a folder view is empty (the lexicon changes its title
     * and CTA per folder); a plain object otherwise.
     */
    empty: GalleryEmptyCopy | ((ctx: DirectoryEmptyContext) => GalleryEmptyCopy);

    /** The domain's folder slice (flat adjacency list). */
    folders: readonly FolderRecord[];
    /** An item's folder id, or null when it sits at the root. */
    getItemFolderId: (item: T) => number | null;
    /**
     * The provider-wrapped folder API for this domain — its `create`/`rename`/
     * `move`/`delete` already refresh the folder (and item) slices.
     */
    folderApi: FolderApi;
    /** Drives the localStorage key and disambiguates copy. */
    domainKey: 'lexicon' | 'glyph' | 'grapheme';
    /** Builds the create-in-folder link; forwarded to the empty-state factory. */
    createHref?: (folderId: number | null) => string;
    /** Singular noun for an item in messages (e.g. `'word'`). Default `'item'`. */
    itemNoun?: string;
    /** Label for the "show the flat list" toggle. Default `'All items'`. */
    allItemsLabel?: string;
    /** Label for the "go back to folders" toggle. Default `'Browse folders'`. */
    browseFoldersLabel?: string;
}

/** Pluralise a count of `noun` the boring, locale-agnostic way. */
function plural(count: number, noun: string): string {
    return `${count} ${noun}${count !== 1 ? 's' : ''}`;
}

export default function DirectoryGallery<T>({
    // Directory-specific
    folders,
    getItemFolderId,
    folderApi,
    domainKey,
    createHref = () => '#',
    itemNoun = 'item',
    allItemsLabel = 'All items',
    browseFoldersLabel = 'Browse folders',
    empty,
    // Forwarded to EntityGallery
    items,
    state,
    selectionMode = false,
    minItemWidth,
    itemGap,
    ...galleryProps
}: DirectoryGalleryProps<T>) {
    const confirm = useConfirm();
    const runApiAction = useApiAction();

    // ------------------------------------------------------------------ URL
    const [searchParams, setSearchParams] = useSearchParams();

    const folderIndex = useMemo(() => indexFolders(folders), [folders]);

    /** The focused folder from `?folder=`, validated — unknown/non-numeric → root. */
    const currentFolderId = useMemo(() => {
        const raw = searchParams.get('folder');
        if (raw === null) return null;
        const parsed = Number.parseInt(raw, 10);
        return Number.isInteger(parsed) && folderIndex.has(parsed) ? parsed : null;
    }, [searchParams, folderIndex]);

    const navigateToFolder = useCallback(
        (folderId: number | null) => {
            const next = new URLSearchParams(searchParams);
            if (folderId === null) next.delete('folder');
            else next.set('folder', String(folderId));
            setSearchParams(next);
            // Changing focus swaps the whole result set the focused-folder grid
            // paginates, so reset to page 1 — otherwise a folder with fewer items
            // than the previous page number would open on an empty page.
            state.setPage(1);
        },
        [searchParams, setSearchParams, state],
    );

    // -------------------------------------------------------------- view mode
    const [allItems, setAllItems] = useState(false);
    const searchActive = state.query.trim() !== '';
    const flatView = selectionMode || allItems || searchActive;

    // -------------------------------------------------------- items by folder
    const itemsByFolder = useMemo(() => {
        const map = new Map<number | null, T[]>();
        for (const item of items) {
            const key = getItemFolderId(item);
            const bucket = map.get(key);
            if (bucket) bucket.push(item);
            else map.set(key, [item]);
        }
        return map;
    }, [items, getItemFolderId]);

    const countOf = useCallback(
        (folderId: number | null) => itemsByFolder.get(folderId)?.length ?? 0,
        [itemsByFolder],
    );

    /** Flat view shows everything; tree view shows the focused folder's items. */
    const visibleItems = useMemo(() => {
        if (flatView) return items;
        return itemsByFolder.get(currentFolderId) ?? (EMPTY_ITEMS as unknown as T[]);
    }, [flatView, items, itemsByFolder, currentFolderId]);

    // ------------------------------------------------------------- tree nodes
    const treeFolders = useMemo(
        () => descendantFolders(folders, currentFolderId),
        [folders, currentFolderId],
    );
    const treeNodes = useMemo<FolderNode[]>(
        () => treeFolders.map((f) => ({ ...f, parentId: f.parent_id ?? null })),
        [treeFolders],
    );

    const breadcrumb = useMemo(
        () => folderPath(folders, currentFolderId),
        [folders, currentFolderId],
    );

    // -------------------------------------------------- expansion persistence
    const storageKey = expansionStorageKey(domainKey);
    const [expandedRaw, setExpandedRaw] = useState<ReadonlySet<number>>(() => {
        try {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
            if (!raw) return new Set<number>();
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed)) return new Set<number>();
            return new Set(
                parsed.filter((x): x is number => typeof x === 'number' && Number.isInteger(x)),
            );
        } catch {
            return new Set<number>();
        }
    });

    // Prune ids no folder owns before handing the set to the tree, so a deleted
    // folder's leftover id never keeps a phantom row "open".
    const expandedIds = useMemo(
        () => new Set([...expandedRaw].filter((id) => folderIndex.has(id))),
        [expandedRaw, folderIndex],
    );

    const onExpandedChange = useCallback(
        (next: ReadonlySet<TreeNodeId>) => {
            const nums = new Set<number>();
            for (const id of next) if (typeof id === 'number') nums.add(id);
            setExpandedRaw(nums);
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(storageKey, JSON.stringify([...nums]));
                }
            } catch {
                /* localStorage may throw (private mode, quota) — expansion is best-effort. */
            }
        },
        [storageKey],
    );

    // ------------------------------------------------------------- folder CRUD
    const [createOpen, setCreateOpen] = useState(false);
    const [createParentId, setCreateParentId] = useState<number | null>(null);
    const [renameTarget, setRenameTarget] = useState<FolderRecord | null>(null);
    const [moveTarget, setMoveTarget] = useState<FolderRecord | null>(null);
    /** The item whose per-card "Move to folder" dialog is open, if any. */
    const [itemMoveTarget, setItemMoveTarget] = useState<T | null>(null);

    const openCreate = useCallback((parentId: number | null) => {
        setCreateParentId(parentId);
        setCreateOpen(true);
    }, []);

    const handleCreate = useCallback(
        async (name: string) => {
            await runApiAction(() => folderApi.create({ name, parent_id: createParentId }), {
                errorTitle: 'Could not create folder',
                success: `Created "${name}".`,
            });
        },
        [folderApi, createParentId, runApiAction],
    );

    const handleRename = useCallback(
        async (name: string) => {
            if (!renameTarget) return;
            await runApiAction(() => folderApi.rename(renameTarget.id, name), {
                errorTitle: 'Could not rename folder',
                success: `Renamed to "${name}".`,
            });
        },
        [folderApi, renameTarget, runApiAction],
    );

    const handleMoveFolder = useCallback(
        async (destinationId: number | null) => {
            if (!moveTarget) return;
            await runApiAction(() => folderApi.move(moveTarget.id, destinationId), {
                errorTitle: 'Could not move folder',
                success: `Moved "${moveTarget.name}".`,
            });
        },
        [folderApi, moveTarget, runApiAction],
    );

    const handleDeleteFolder = useCallback(
        async (folder: FolderRecord) => {
            const itemCount = countOf(folder.id);
            const subfolders = childFolders(folders, folder.id).length;
            const parent = folder.parent_id != null ? folderIndex.get(folder.parent_id) : null;
            const destination = parent ? `"${parent.name}"` : 'the top level';

            const parts: string[] = [];
            if (itemCount > 0) parts.push(plural(itemCount, itemNoun));
            if (subfolders > 0) parts.push(plural(subfolders, 'subfolder'));
            const contents =
                parts.length > 0
                    ? `Its ${parts.join(' and ')} move up to ${destination} — nothing is deleted. `
                    : '';

            const confirmed = await confirm({
                title: `Delete folder "${folder.name}"?`,
                message: `${contents}This only removes the folder itself.`,
                confirmLabel: 'Delete folder',
                tone: 'danger',
            });
            if (!confirmed) return;

            await runApiAction(() => folderApi.delete(folder.id), {
                errorTitle: 'Could not delete folder',
                success: `Deleted "${folder.name}".`,
            });
        },
        [confirm, countOf, folderApi, folderIndex, folders, itemNoun, runApiAction],
    );

    // ------------------------------------------------------------- item move
    /**
     * File the item whose dialog is open into `folderId` (null = root). The item
     * id comes from `keyExtractor` — all three domains key a card on its numeric
     * row id — and `folderApi.setItemFolder` is the provider-wrapped call, so the
     * item slice refreshes itself.
     */
    const handleMoveItem = useCallback(
        async (folderId: number | null) => {
            if (itemMoveTarget === null) return;
            const rawKey = galleryProps.keyExtractor(itemMoveTarget);
            const itemId = typeof rawKey === 'number' ? rawKey : Number(rawKey);
            if (!Number.isInteger(itemId)) return;
            const label = galleryProps.itemLabel(itemMoveTarget);
            await runApiAction(() => folderApi.setItemFolder({ itemId, folderId }), {
                errorTitle: `Could not move ${itemNoun}`,
                success:
                    folderId === null ? `Moved "${label}" to the top level.` : `Moved "${label}".`,
            });
        },
        [itemMoveTarget, galleryProps, folderApi, itemNoun, runApiAction],
    );

    // ------------------------------------------------------------- tree render
    const viewMode: GalleryViewMode = state.viewMode;
    const { itemHref, onItemActivate, renderActions, itemLabel, renderItem, keyExtractor, adapters } =
        galleryProps;

    /**
     * The caller's card actions PLUS a "Move to folder" affordance — added here,
     * once, so all three domains get per-card item-move without repeating the
     * dialog wiring. Suppressed in a picker (a chooser has no actions row) and
     * when no folders exist yet (nowhere to move to).
     */
    const effectiveRenderActions = useCallback(
        (item: T): ReactNode => {
            const base = renderActions?.(item);
            if (selectionMode || folders.length === 0) return base;
            return (
                <>
                    {base}
                    <IconButton
                        iconName="folder-symlink"
                        onClick={() => setItemMoveTarget(item)}
                        aria-label={`Move ${itemLabel(item)} to folder`}
                    />
                </>
            );
        },
        [renderActions, selectionMode, folders.length, itemLabel],
    );

    const renderCard = useCallback(
        (item: T): ReactNode => {
            const to = itemHref?.(item);
            return (
                <EntityCard
                    key={keyExtractor(item)}
                    label={itemLabel(item)}
                    to={to}
                    onActivate={!to && onItemActivate ? () => onItemActivate(item) : undefined}
                    actions={effectiveRenderActions(item)}
                    compact={viewMode === 'compact'}
                >
                    {renderItem(item, viewMode)}
                </EntityCard>
            );
        },
        [itemHref, onItemActivate, effectiveRenderActions, itemLabel, renderItem, keyExtractor, viewMode],
    );

    const gridStyle = useMemo(
        () => ({
            gridTemplateColumns: `repeat(auto-fill, minmax(${minItemWidth ?? '200px'}, 1fr))`,
            gap: itemGap ?? '1rem',
        }),
        [minItemWidth, itemGap],
    );

    /**
     * The count of a folder's items AFTER the active filter — what the node
     * header, the node grid and the "Show all N" row all show. A live search
     * always escapes to flat view, so in tree mode the only narrowing in play is
     * the filter select; keeping the header count, the grid and the focus row on
     * that one filter means the select governs everything visible. The unfiltered
     * {@link countOf} is kept for the delete-folder confirmation, which describes
     * the ACTUAL rows being reparented (a filter does not change what moves up).
     */
    const filteredCountOf = useCallback(
        (folderId: number | null) => {
            const list = itemsByFolder.get(folderId) ?? [];
            const filterAdapter = adapters?.filter;
            if (!filterAdapter || !state.filter || state.filter === GALLERY_FILTER_ALL) {
                return list.length;
            }
            return list.reduce((n, item) => (filterAdapter(item, state.filter) ? n + 1 : n), 0);
        },
        [itemsByFolder, adapters, state.filter],
    );

    const renderNodeHeader = useCallback(
        (folder: FolderNode) => (
            <span className={styles.nodeHeader}>
                <span className={styles.nodeName}>{folder.name}</span>
                <span className={styles.nodeMeta}>{plural(filteredCountOf(folder.id), itemNoun)}</span>
            </span>
        ),
        [filteredCountOf, itemNoun],
    );

    const renderEndSlot = useCallback(
        (folder: FolderNode) => (
            <div className={styles.nodeActions}>
                {/* Always-present focus affordance. "Show all N →" only appears
                    once a folder exceeds TREE_ITEM_CAP, and the breadcrumb only
                    reaches ancestors, so a small folder would otherwise have no
                    way to become the focused root — leaving its create-in-folder
                    CTA and its shareable ?folder= deep link unreachable. This
                    focuses the folder (same navigateToFolder as Show-all, which
                    also resets the grid to page 1). */}
                <IconButton
                    iconName="box-arrow-in-right"
                    onClick={() => navigateToFolder(folder.id)}
                    aria-label={`Open folder ${folder.name}`}
                />
                <IconButton
                    iconName="folder-plus"
                    onClick={() => openCreate(folder.id)}
                    aria-label={`New subfolder in ${folder.name}`}
                />
                <IconButton
                    iconName="pencil"
                    onClick={() => setRenameTarget(folder)}
                    aria-label={`Rename folder ${folder.name}`}
                />
                <IconButton
                    iconName="folder-symlink"
                    onClick={() => setMoveTarget(folder)}
                    aria-label={`Move folder ${folder.name}`}
                />
                <IconButton
                    iconName="trash"
                    iconColor="var(--status-bad)"
                    onClick={() => void handleDeleteFolder(folder)}
                    aria-label={`Delete folder ${folder.name}`}
                />
            </div>
        ),
        [navigateToFolder, openCreate, handleDeleteFolder],
    );

    const renderNodeContent = useCallback(
        (folder: FolderNode, ctx: TreeNodeContext) => {
            // Apply the ACTIVE filter (not a hardcoded "all") so the filter select
            // governs the node grid, the cap and the "Show all N" number exactly as
            // it governs the focused-folder grid. `total` is the post-filter count.
            const source = itemsByFolder.get(folder.id) ?? [];
            const { pageItems, total } = applyGallery(
                source,
                {
                    query: '',
                    filter: state.filter,
                    sortBy: state.sortBy,
                    page: 1,
                    pageSize: TREE_ITEM_CAP,
                },
                { sort: adapters?.sort, filter: adapters?.filter },
            );
            if (total === 0) {
                // Nothing to show here once the filter is applied: if the folder
                // still has child folders (rendered above by TreeExplorer) show
                // nothing, otherwise note the absence of directly-filed items.
                return ctx.childCount > 0 ? null : (
                    <p className={styles.emptyNote}>No {itemNoun}s filed directly here.</p>
                );
            }
            return (
                <>
                    <div className={styles.itemGrid} style={gridStyle}>
                        {pageItems.map((item) => renderCard(item))}
                    </div>
                    {total > TREE_ITEM_CAP && (
                        <div className={styles.showAllRow}>
                            <button
                                type="button"
                                className={styles.showAll}
                                onClick={() => navigateToFolder(folder.id)}
                            >
                                {`Show all ${total} →`}
                            </button>
                        </div>
                    )}
                </>
            );
        },
        [itemsByFolder, itemNoun, state.filter, state.sortBy, adapters, gridStyle, renderCard, navigateToFolder],
    );

    // ---------------------------------------------------------------- gallery
    const resolvedEmpty: GalleryEmptyCopy = useMemo(() => {
        if (typeof empty === 'function') {
            return empty({ flatView, currentFolderId, createHref });
        }
        return empty;
    }, [empty, flatView, currentFolderId, createHref]);

    const gallery = (
        <EntityGallery<T>
            {...galleryProps}
            items={visibleItems}
            state={state}
            selectionMode={selectionMode}
            renderActions={effectiveRenderActions}
            minItemWidth={minItemWidth}
            itemGap={itemGap}
            empty={resolvedEmpty}
        />
    );

    // A picker is a flat chooser — no folder chrome, no toggle.
    if (selectionMode) return gallery;

    return (
        <div className={classNames(styles.tree)}>
            <div className={styles.toggleRow}>
                <span aria-hidden="true" />
                <Button
                    type="button"
                    themeType="basic"
                    className={buttonStyles.secondary}
                    onClick={() => setAllItems((prev) => !prev)}
                    aria-pressed={allItems}
                >
                    {allItems ? browseFoldersLabel : allItemsLabel}
                </Button>
            </div>

            {!flatView && (
                <div className={styles.bar}>
                    <nav className={styles.breadcrumb} aria-label="Folder path">
                        <button
                            type="button"
                            className={currentFolderId === null ? styles.crumbCurrent : styles.crumb}
                            onClick={() => navigateToFolder(null)}
                            aria-current={currentFolderId === null ? 'page' : undefined}
                            disabled={currentFolderId === null}
                        >
                            All folders
                        </button>
                        {breadcrumb.map((folder, index) => {
                            const isLast = index === breadcrumb.length - 1;
                            return (
                                <span key={folder.id} className={styles.breadcrumb}>
                                    <span className={styles.separator} aria-hidden="true">
                                        /
                                    </span>
                                    <button
                                        type="button"
                                        className={isLast ? styles.crumbCurrent : styles.crumb}
                                        onClick={() => navigateToFolder(folder.id)}
                                        aria-current={isLast ? 'page' : undefined}
                                        disabled={isLast}
                                    >
                                        {folder.name}
                                    </button>
                                </span>
                            );
                        })}
                    </nav>

                    <IconButton
                        iconName="folder-plus"
                        className={buttonStyles.secondary}
                        onClick={() => openCreate(currentFolderId)}
                    >
                        New folder
                    </IconButton>
                </div>
            )}

            {gallery}

            {!flatView && treeNodes.length > 0 && (
                <TreeExplorer<FolderNode>
                    nodes={treeNodes}
                    compareNodes={compareFolders}
                    expandedIds={expandedIds}
                    onExpandedChange={onExpandedChange}
                    renderNodeHeader={renderNodeHeader}
                    renderNodeContent={renderNodeContent}
                    endSlot={renderEndSlot}
                    expandLabel={(folder) => `Expand folder ${folder.name}`}
                    collapseLabel={(folder) => `Collapse folder ${folder.name}`}
                    ariaLabel="Folder tree"
                />
            )}

            <FolderNameDialog
                isOpen={createOpen}
                setIsOpen={setCreateOpen}
                title="New folder"
                submitLabel="Create folder"
                onSubmit={(name) => void handleCreate(name)}
            />
            <FolderNameDialog
                isOpen={renameTarget !== null}
                setIsOpen={(open) => {
                    if (!open) setRenameTarget(null);
                }}
                title="Rename folder"
                submitLabel="Save name"
                initialName={renameTarget?.name ?? ''}
                onSubmit={(name) => void handleRename(name)}
            />
            <MoveToFolderDialog
                isOpen={moveTarget !== null}
                setIsOpen={(open) => {
                    if (!open) setMoveTarget(null);
                }}
                title="Move folder"
                fieldLabel="New parent folder"
                folders={folders}
                currentFolderId={moveTarget?.parent_id ?? null}
                excludeId={moveTarget?.id}
                onMove={(destinationId) => void handleMoveFolder(destinationId)}
            />
            {/* Per-card "Move to folder" for an ITEM (no excludeId — an item has
                no subtree to guard against). */}
            <MoveToFolderDialog
                isOpen={itemMoveTarget !== null}
                setIsOpen={(open) => {
                    if (!open) setItemMoveTarget(null);
                }}
                title="Move to folder"
                folders={folders}
                currentFolderId={itemMoveTarget ? getItemFolderId(itemMoveTarget) : null}
                onMove={(destinationId) => void handleMoveItem(destinationId)}
            />
        </div>
    );
}
