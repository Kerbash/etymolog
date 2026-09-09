/**
 * Folder Domain Engine
 * --------------------
 * ONE parameterized adjacency-list folder service that drives all three folder
 * domains — lexicon words (schema v7), glyphs and graphemes (schema v8). It is
 * the extraction of the original lexicon-only `folderService.ts`: the SQL body
 * is identical, with the three coupling points that used to name `lexicon` /
 * `lexicon_folders` / `folder_id` moved into the {@link FolderDomainConfig}.
 *
 * The tree is tiny compared with the item table, so every structural check
 * assembles the whole folder list in JS with ONE query rather than issuing
 * recursive SQL.
 *
 * Invariants each domain guarantees (the DB's FK cascades are only a backstop):
 *
 *  - **No cycles.** A folder can never be moved under itself or any of its own
 *    descendants — `moveFolder` walks the TARGET parent's chain before writing.
 *  - **No item is ever deleted by a folder operation.** Deleting a folder
 *    REPARENTS its child folders and its items to the deleted folder's parent
 *    (root when it had none), in one transaction, then removes the folder row.
 *  - **Bounded depth.** The tree is capped at {@link MAX_FOLDER_DEPTH} levels,
 *    enforced on create and move (a move also accounts for the moved subtree's
 *    own height, so relocating a deep branch cannot bury it past the cap).
 *
 * EVERY write — multi-statement OR a single UPDATE/INSERT — runs in
 * `withTransaction()`. Beyond atomicity that is also what marks the sql.js
 * database dirty for durable IndexedDB persistence: `withTransaction` calls
 * `schedulePersist()` when its outermost transaction commits, and NOTHING else
 * on a bare `db.run(...)` does. A single-statement write left un-wrapped still
 * mutates the in-memory DB (so the UI refresh shows the change) but never
 * schedules a save, so the change is silently lost on the next reload while the
 * persistence indicator reads "Saved". `updateFolder`, `moveFolder` and
 * `setItemFolder` were exactly that bug (inherited verbatim from the original
 * lexicon-only `folderService.ts`, so the v7 word-move was already broken).
 *
 * SAFETY: `folderTable` / `itemTable` / `itemFolderColumn` are interpolated into
 * SQL text, so they MUST come only from the hardcoded config literals below
 * (the three domain registrations) — never from user input. All VALUES stay
 * `?`-parameterized, exactly as in the original service.
 *
 * ERROR MESSAGES: the five substrings folderApi's `fromError` string-sniffs
 * (`'not found'`, `'cannot exceed'`, `'into itself'`, `'own descendant'`,
 * `'needs a name'`) are kept byte-identical here — do not reword them without
 * updating `fromError` in the same change.
 */

import { getDatabase } from './database';
import { withTransaction } from './utils/transaction';
import { execRows, execOne, lastInsertId, type SqlRecord } from './utils/sql';
import { validateStringLength, LIMITS } from './utils/sanitize';
import type { FolderRecord, CreateFolderInput, UpdateFolderInput } from './types';

/**
 * Maximum nesting depth (root folder = depth 1). Twelve gives the feedback
 * author's seven-deep hierarchy (Nouns/People-Entities/Entities/Mythological/
 * Divine/Gods/De'ura) comfortable headroom while still bounding pathological
 * trees. Enforced on create and move. Shared by every folder domain.
 */
export const MAX_FOLDER_DEPTH = 12;

/**
 * The three coupling points that specialise the engine to one domain.
 * `label` is the human word used in error messages (always `'Folder'`).
 */
export interface FolderDomainConfig {
    /** Folder table, e.g. `'lexicon_folders'`. Interpolated into SQL — never user input. */
    folderTable: string;
    /** Item table the folder organises, e.g. `'lexicon'`. Interpolated into SQL. */
    itemTable: string;
    /** The item table's folder foreign-key column, e.g. `'folder_id'`. Interpolated into SQL. */
    itemFolderColumn: string;
    /** Human label for error messages (`'Folder'`). */
    label: string;
}

/** The folder operations bound to one domain. */
export interface FolderDomain {
    readonly config: FolderDomainConfig;
    getAllFolders(): FolderRecord[];
    getFolderById(id: number): FolderRecord | null;
    createFolder(input: CreateFolderInput): FolderRecord;
    updateFolder(id: number, input: UpdateFolderInput): FolderRecord;
    renameFolder(id: number, name: string): FolderRecord;
    moveFolder(id: number, newParentId: number | null): FolderRecord;
    deleteFolder(id: number): boolean;
    /** File an item into a folder (or clear to root with null). */
    setItemFolder(itemId: number, folderId: number | null): void;
    getFolderPath(id: number): FolderRecord[];
    getDescendantFolderIds(id: number): number[];
}

/**
 * Build a folder service for one domain. The returned functions are plain
 * closures over `config` (no `this`), so callers may freely destructure or
 * alias them (e.g. `folderService.ts` re-exports the lexicon instance's
 * methods directly).
 */
export function createFolderDomain(config: FolderDomainConfig): FolderDomain {
    const { folderTable, itemTable, itemFolderColumn, label } = config;
    const lower = label.toLowerCase();

    // =========================================================================
    // ROW MAPPING
    // =========================================================================

    function mapFolderRecord(rec: SqlRecord): FolderRecord {
        return {
            id: rec.id as number,
            name: rec.name as string,
            parent_id: (rec.parent_id as number | null) ?? null,
            position: rec.position as number,
            created_at: rec.created_at as string,
            updated_at: rec.updated_at as string,
        };
    }

    // =========================================================================
    // READS
    // =========================================================================

    /** Every folder, ordered by (position, name) — the caller assembles the tree. */
    function getAllFolders(): FolderRecord[] {
        return execRows(
            getDatabase(),
            `SELECT id, name, parent_id, position, created_at, updated_at
             FROM ${folderTable} ORDER BY position ASC, name ASC`,
        ).map(mapFolderRecord);
    }

    /** A single folder by id, or null. */
    function getFolderById(id: number): FolderRecord | null {
        const rec = execOne(
            getDatabase(),
            `SELECT id, name, parent_id, position, created_at, updated_at
             FROM ${folderTable} WHERE id = ?`,
            [id],
        );
        return rec ? mapFolderRecord(rec) : null;
    }

    function requireFolder(id: number): FolderRecord {
        const folder = getFolderById(id);
        if (!folder) {
            throw new Error(`${label} with id ${id} not found`);
        }
        return folder;
    }

    // =========================================================================
    // TREE HELPERS (pure, over an in-memory folder index)
    // =========================================================================

    /**
     * Depth of a folder counted from the root (a root folder is depth 1). Walks
     * the parent chain over the supplied index; a visited guard makes a corrupt
     * cycle terminate rather than hang.
     */
    function depthOf(id: number, byId: Map<number, FolderRecord>): number {
        let depth = 0;
        let current: number | null = id;
        const seen = new Set<number>();
        while (current !== null) {
            if (seen.has(current)) break; // corrupt cycle — stop counting
            seen.add(current);
            const folder = byId.get(current);
            if (!folder) break;
            depth++;
            current = folder.parent_id;
        }
        return depth;
    }

    /** Build parent → children[] once for subtree walks. */
    function childrenIndex(folders: FolderRecord[]): Map<number, FolderRecord[]> {
        const children = new Map<number, FolderRecord[]>();
        for (const folder of folders) {
            if (folder.parent_id === null) continue;
            if (!children.has(folder.parent_id)) children.set(folder.parent_id, []);
            children.get(folder.parent_id)!.push(folder);
        }
        return children;
    }

    /**
     * Height of the subtree rooted at `id`: 1 for a leaf, 1 + tallest child
     * otherwise. Visited guard for corrupt cycles.
     */
    function subtreeHeight(id: number, children: Map<number, FolderRecord[]>): number {
        function walk(nodeId: number, seen: Set<number>): number {
            if (seen.has(nodeId)) return 0;
            seen.add(nodeId);
            const kids = children.get(nodeId) ?? [];
            let max = 0;
            for (const kid of kids) {
                max = Math.max(max, walk(kid.id, seen));
            }
            return 1 + max;
        }
        return walk(id, new Set());
    }

    /** All descendant ids of `id` (excluding `id` itself). */
    function descendantIds(id: number, children: Map<number, FolderRecord[]>): Set<number> {
        const out = new Set<number>();
        const stack = [...(children.get(id) ?? [])];
        while (stack.length > 0) {
            const node = stack.pop()!;
            if (out.has(node.id)) continue;
            out.add(node.id);
            stack.push(...(children.get(node.id) ?? []));
        }
        return out;
    }

    // =========================================================================
    // WRITES
    // =========================================================================

    function normalizeName(name: string): string {
        const trimmed = name.trim();
        if (!trimmed) {
            throw new Error(`A ${lower} needs a name`);
        }
        validateStringLength(trimmed, LIMITS.FOLDER_NAME, `${label} name`);
        return trimmed;
    }

    /**
     * Create a folder. When `parent_id` is given the parent must exist and the
     * new folder must not exceed {@link MAX_FOLDER_DEPTH}.
     */
    function createFolder(input: CreateFolderInput): FolderRecord {
        const name = normalizeName(input.name);
        const parentId = input.parent_id ?? null;

        if (parentId !== null) {
            const folders = getAllFolders();
            const byId = new Map(folders.map(f => [f.id, f]));
            if (!byId.has(parentId)) {
                throw new Error(`Parent ${lower} with id ${parentId} not found`);
            }
            if (depthOf(parentId, byId) + 1 > MAX_FOLDER_DEPTH) {
                throw new Error(`${label} nesting cannot exceed ${MAX_FOLDER_DEPTH} levels`);
            }
        }

        const db = getDatabase();
        return withTransaction(db, () => {
            db.run(
                `INSERT INTO ${folderTable} (name, parent_id, position) VALUES (?, ?, ?)`,
                [name, parentId, input.position ?? 0],
            );
            return requireFolder(lastInsertId(db));
        });
    }

    /** Rename a folder (and optionally reorder it among its siblings). */
    function updateFolder(id: number, input: UpdateFolderInput): FolderRecord {
        requireFolder(id);

        const updates: string[] = [];
        const values: (string | number)[] = [];
        if (input.name !== undefined) {
            updates.push('name = ?');
            values.push(normalizeName(input.name));
        }
        if (input.position !== undefined) {
            updates.push('position = ?');
            values.push(input.position);
        }
        if (updates.length === 0) {
            return requireFolder(id);
        }

        const db = getDatabase();
        updates.push("updated_at = datetime('now')");
        return withTransaction(db, () => {
            db.run(`UPDATE ${folderTable} SET ${updates.join(', ')} WHERE id = ?`, [...values, id]);
            return requireFolder(id);
        });
    }

    /** Convenience wrapper for the common rename-only case. */
    function renameFolder(id: number, name: string): FolderRecord {
        return updateFolder(id, { name });
    }

    /**
     * Move a folder under a new parent (null = root). Rejects a move that would
     * create a cycle (into itself or a descendant) or push the moved subtree
     * past {@link MAX_FOLDER_DEPTH}.
     */
    function moveFolder(id: number, newParentId: number | null): FolderRecord {
        const folders = getAllFolders();
        const byId = new Map(folders.map(f => [f.id, f]));
        if (!byId.has(id)) {
            throw new Error(`${label} with id ${id} not found`);
        }

        if (newParentId !== null) {
            if (newParentId === id) {
                throw new Error(`A ${lower} cannot be moved into itself`);
            }
            if (!byId.has(newParentId)) {
                throw new Error(`Parent ${lower} with id ${newParentId} not found`);
            }
            // Cycle guard: walk the TARGET's parent chain; hitting `id` means the
            // target is one of this folder's descendants.
            let cursor: number | null = newParentId;
            const seen = new Set<number>();
            while (cursor !== null) {
                if (cursor === id) {
                    throw new Error(`A ${lower} cannot be moved into its own descendant`);
                }
                if (seen.has(cursor)) break;
                seen.add(cursor);
                cursor = byId.get(cursor)?.parent_id ?? null;
            }

            // Depth guard: the moved folder lands at depth(newParent)+1, and its
            // own subtree extends below that. deepest = depth(newParent) + height.
            const children = childrenIndex(folders);
            const deepest = depthOf(newParentId, byId) + subtreeHeight(id, children);
            if (deepest > MAX_FOLDER_DEPTH) {
                throw new Error(`${label} nesting cannot exceed ${MAX_FOLDER_DEPTH} levels`);
            }
        } else {
            // Moving to root: the subtree's own height must fit under the cap.
            const children = childrenIndex(folders);
            if (subtreeHeight(id, children) > MAX_FOLDER_DEPTH) {
                throw new Error(`${label} nesting cannot exceed ${MAX_FOLDER_DEPTH} levels`);
            }
        }

        const db = getDatabase();
        return withTransaction(db, () => {
            db.run(
                `UPDATE ${folderTable} SET parent_id = ?, updated_at = datetime('now') WHERE id = ?`,
                [newParentId, id],
            );
            return requireFolder(id);
        });
    }

    /**
     * Delete a folder. Its child folders and the items filed under it are
     * REPARENTED to the deleted folder's parent (root when it had none) in the
     * SAME transaction before the row is removed — so an item is never
     * destroyed and the FK cascade (which would only ever touch child folders,
     * never items) is a backstop only.
     */
    function deleteFolder(id: number): boolean {
        const db = getDatabase();
        const folder = getFolderById(id);
        if (!folder) {
            throw new Error(`${label} with id ${id} not found`);
        }
        return withTransaction(db, () => {
            // Reparent child folders up one level.
            db.run(
                `UPDATE ${folderTable} SET parent_id = ?, updated_at = datetime('now') WHERE parent_id = ?`,
                [folder.parent_id, id],
            );
            // Reparent items up one level (never delete them).
            db.run(
                `UPDATE ${itemTable} SET ${itemFolderColumn} = ?, updated_at = datetime('now') WHERE ${itemFolderColumn} = ?`,
                [folder.parent_id, id],
            );
            db.run(`DELETE FROM ${folderTable} WHERE id = ?`, [id]);
            return db.getRowsModified() > 0;
        });
    }

    /**
     * File an item into a folder (or clear to root with null). Both the item and,
     * when given, the target folder must exist.
     */
    function setItemFolder(itemId: number, folderId: number | null): void {
        const db = getDatabase();
        const exists = execOne(db, `SELECT id FROM ${itemTable} WHERE id = ?`, [itemId]);
        if (!exists) {
            throw new Error(`Item with id ${itemId} not found`);
        }
        if (folderId !== null) {
            requireFolder(folderId);
        }
        withTransaction(db, () => {
            db.run(
                `UPDATE ${itemTable} SET ${itemFolderColumn} = ?, updated_at = datetime('now') WHERE id = ?`,
                [folderId, itemId],
            );
        });
    }

    /**
     * The folder chain from root to the given folder (inclusive), for
     * breadcrumbs. Returns an empty array for the root level (a null/absent
     * folder). A corrupt cycle terminates via a visited guard.
     */
    function getFolderPath(id: number): FolderRecord[] {
        const folders = getAllFolders();
        const byId = new Map(folders.map(f => [f.id, f]));
        const path: FolderRecord[] = [];
        const seen = new Set<number>();
        let current: number | null = id;
        while (current !== null) {
            if (seen.has(current)) break;
            seen.add(current);
            const folder = byId.get(current);
            if (!folder) break;
            path.push(folder);
            current = folder.parent_id;
        }
        return path.reverse();
    }

    /** All descendant folder ids of `id` (excluding itself) — exposed for the UI. */
    function getDescendantFolderIds(id: number): number[] {
        return [...descendantIds(id, childrenIndex(getAllFolders()))];
    }

    return {
        config,
        getAllFolders,
        getFolderById,
        createFolder,
        updateFolder,
        renameFolder,
        moveFolder,
        deleteFolder,
        setItemFolder,
        getFolderPath,
        getDescendantFolderIds,
    };
}

// =============================================================================
// DOMAIN REGISTRY — the three (and only three) domains, with their hardcoded
// coupling literals. These table/column names are the ONLY values ever
// interpolated into the engine's SQL.
// =============================================================================

/** Lexicon words → `lexicon_folders` (schema v7). */
export const lexiconFolderDomain: FolderDomain = createFolderDomain({
    folderTable: 'lexicon_folders',
    itemTable: 'lexicon',
    itemFolderColumn: 'folder_id',
    label: 'Folder',
});

/** Glyphs → `glyph_folders` (schema v8). */
export const glyphFolderDomain: FolderDomain = createFolderDomain({
    folderTable: 'glyph_folders',
    itemTable: 'glyphs',
    itemFolderColumn: 'folder_id',
    label: 'Folder',
});

/** Graphemes → `grapheme_folders` (schema v8). */
export const graphemeFolderDomain: FolderDomain = createFolderDomain({
    folderTable: 'grapheme_folders',
    itemTable: 'graphemes',
    itemFolderColumn: 'folder_id',
    label: 'Folder',
});
