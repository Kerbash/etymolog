/**
 * Lexicon folder UI — re-export shim (Phase 3).
 *
 * The folder UI was generalised over all three domains and moved to
 * `shared/directory`; this barrel re-exports it at the historical
 * `tabs/lexicon/folders` path so every pre-Phase-3 import keeps resolving.
 * `FolderBrowser` (the old one-level breadcrumb browser) was retired — its
 * breadcrumb + CRUD live on inside `DirectoryGallery`.
 */

export {
    FolderTreeSelect,
    FolderNameDialog,
    MoveToFolderDialog,
    buildFolderOptions,
    childFolders,
    compareFolders,
    descendantFolders,
    folderPath,
    indexFolders,
    folderCreateHref,
    lexiconCreateHref,
} from '../../../shared/directory';
export type {
    FolderTreeSelectProps,
    FolderNameDialogProps,
    MoveToFolderDialogProps,
    FolderTreeOption,
} from '../../../shared/directory';
