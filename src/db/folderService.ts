/**
 * Lexicon Folder Service (Phase 5a, UC-D)
 * ---------------------------------------
 * Thin, back-compatible facade over the shared folder engine
 * (`folderDomain.ts`). Every function here is the `lexiconFolderDomain`
 * instance's corresponding method, re-exported under its original name so that
 * every existing import and test keeps working unchanged after the engine was
 * generalised to also drive glyph and grapheme folders (schema v8).
 *
 * The behaviour, invariants and error messages are documented on the engine
 * (`createFolderDomain`). `setLexiconFolder` is the lexicon domain's
 * `setItemFolder`; the item table is `lexicon` and the column is `folder_id`.
 */

import { lexiconFolderDomain } from './folderDomain';
import type { FolderRecord } from './types';

/** Maximum nesting depth (root folder = depth 1). Shared by every domain. */
export { MAX_FOLDER_DEPTH } from './folderDomain';

/** Every folder, ordered by (position, name) — the caller assembles the tree. */
export const getAllFolders = lexiconFolderDomain.getAllFolders;

/** A single folder by id, or null. */
export const getFolderById = lexiconFolderDomain.getFolderById;

/**
 * Create a folder. When `parent_id` is given the parent must exist and the new
 * folder must not exceed `MAX_FOLDER_DEPTH`.
 */
export const createFolder = lexiconFolderDomain.createFolder;

/** Rename a folder (and optionally reorder it among its siblings). */
export const updateFolder = lexiconFolderDomain.updateFolder;

/** Convenience wrapper for the common rename-only case. */
export const renameFolder = lexiconFolderDomain.renameFolder;

/**
 * Move a folder under a new parent (null = root). Rejects a move that would
 * create a cycle or push the moved subtree past `MAX_FOLDER_DEPTH`.
 */
export const moveFolder = lexiconFolderDomain.moveFolder;

/**
 * Delete a folder. Its child folders and the words filed under it are
 * REPARENTED to the deleted folder's parent (root when it had none) before the
 * row is removed — so a word is never destroyed.
 */
export const deleteFolder = lexiconFolderDomain.deleteFolder;

/**
 * File a word into a folder (or clear to root with null). Both the word and,
 * when given, the target folder must exist.
 */
export function setLexiconFolder(lexiconId: number, folderId: number | null): void {
    lexiconFolderDomain.setItemFolder(lexiconId, folderId);
}

/** The folder chain from root to the given folder (inclusive), for breadcrumbs. */
export const getFolderPath = lexiconFolderDomain.getFolderPath;

/** All descendant folder ids of `id` (excluding itself) — exposed for the UI. */
export const getDescendantFolderIds = lexiconFolderDomain.getDescendantFolderIds;

/** Historical re-export: the shared folder row shape. */
export type { FolderRecord };
