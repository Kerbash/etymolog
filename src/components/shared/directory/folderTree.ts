/**
 * Folder tree helpers (shared/directory)
 * --------------------------------------
 * Pure functions over the flat `FolderRecord[]` a provider folder slice holds
 * (lexicon words, glyphs or graphemes — the shape is identical across all three
 * domains). The service assembles the tree in SQL for its own guards; the UI has
 * the whole list in memory already, so navigation, breadcrumbs, the picker tree
 * and the inline directory tree are all derived here without a round trip — and
 * stay reactive to the slice.
 *
 * Every walk carries a visited guard: a corrupt cycle (which the service's
 * guards make impossible, but a hand-edited import could still smuggle in)
 * terminates rather than hanging the render.
 *
 * Generalised from the lexicon-only `tabs/lexicon/folders/folderTree.ts` in
 * Phase 3; the old path re-exports this module so every existing import (and
 * `folderTree.test.ts`) keeps working unchanged.
 */

import type { FolderRecord } from '../../../db/types';

/** Index folders by id — the base every other helper walks over. */
export function indexFolders(folders: readonly FolderRecord[]): Map<number, FolderRecord> {
    return new Map(folders.map((f) => [f.id, f]));
}

/** Stable child order: by `position`, then name, then id (a total order). */
export function compareFolders(a: FolderRecord, b: FolderRecord): number {
    return a.position - b.position || a.name.localeCompare(b.name) || a.id - b.id;
}

/**
 * The direct child folders of `parentId` (null = root level), sorted for
 * display. Treats a null/absent `parent_id` as root.
 */
export function childFolders(
    folders: readonly FolderRecord[],
    parentId: number | null,
): FolderRecord[] {
    return folders
        .filter((f) => (f.parent_id ?? null) === parentId)
        .sort(compareFolders);
}

/**
 * The folder chain from root to `id` (inclusive), for breadcrumbs. Empty for
 * the root level (null id) or an id no folder has.
 */
export function folderPath(folders: readonly FolderRecord[], id: number | null): FolderRecord[] {
    if (id === null) return [];
    const byId = indexFolders(folders);
    const path: FolderRecord[] = [];
    const seen = new Set<number>();
    let current: number | null = id;
    while (current !== null) {
        if (seen.has(current)) break;
        seen.add(current);
        const folder = byId.get(current);
        if (!folder) break;
        path.push(folder);
        current = folder.parent_id ?? null;
    }
    return path.reverse();
}

/**
 * Every STRICT descendant of `rootId` (excluding `rootId` itself), for the
 * inline directory tree. `null` returns the whole forest (every folder). A
 * visited guard keeps a corrupt cycle from hanging the walk.
 *
 * The returned folders keep their real `parent_id`; when they are handed to the
 * generic `TreeExplorer` scoped to a focused root, the focused root's direct
 * children point at a `parent_id` that is absent from the scoped node list, so
 * `buildForest` promotes them to forest roots automatically.
 */
export function descendantFolders(
    folders: readonly FolderRecord[],
    rootId: number | null,
): FolderRecord[] {
    if (rootId === null) return folders.slice();
    const byId = indexFolders(folders);
    return folders.filter((f) => {
        if (f.id === rootId) return false;
        const seen = new Set<number>();
        let current: number | null = f.parent_id ?? null;
        while (current !== null) {
            if (current === rootId) return true;
            if (seen.has(current)) break;
            seen.add(current);
            current = byId.get(current)?.parent_id ?? null;
        }
        return false;
    });
}

/** One row of the indented picker/select tree. */
export interface FolderTreeOption {
    id: number;
    name: string;
    /** Nesting depth from the root (a root folder is depth 0). */
    depth: number;
    /** The name prefixed with `depth` levels of indent, for a flat `<option>`. */
    label: string;
}

/** The indent unit for a flat `<select>` label (figure-space reads evenly). */
const INDENT = '  ';

/**
 * Flatten the folder forest into a depth-first, display-ordered list with an
 * indent-prefixed `label` for each entry — everything a plain `<select>` (or a
 * roll-your-own tree) needs to render the hierarchy without a widget.
 *
 * `excludeId`, when given, drops that folder AND its whole subtree (used by the
 * move-a-folder picker so a folder can't be filed under its own descendant).
 */
export function buildFolderOptions(
    folders: readonly FolderRecord[],
    options: { excludeId?: number } = {},
): FolderTreeOption[] {
    const { excludeId } = options;
    const out: FolderTreeOption[] = [];

    const walk = (parentId: number | null, depth: number) => {
        for (const folder of childFolders(folders, parentId)) {
            if (excludeId !== undefined && folder.id === excludeId) continue;
            out.push({
                id: folder.id,
                name: folder.name,
                depth,
                label: `${INDENT.repeat(depth)}${folder.name}`,
            });
            walk(folder.id, depth + 1);
        }
    };

    walk(null, 0);
    return out;
}
