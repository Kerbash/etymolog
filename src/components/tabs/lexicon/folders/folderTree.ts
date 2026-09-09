/**
 * Re-export shim (Phase 3). The folder-tree helpers moved to
 * `shared/directory/folderTree` when the folder UI was generalised over all
 * three domains; this shim keeps `tabs/lexicon/folders/folderTree` (and
 * `folderTree.test.ts`, which imports it directly) resolving unchanged.
 */

export * from '../../../shared/directory/folderTree';
