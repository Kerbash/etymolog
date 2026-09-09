/**
 * Directory UI (shared) — the domain-neutral folder tree binding and its
 * building blocks: the inline `DirectoryGallery`, the folder CRUD dialogs, the
 * indented tree `<select>`, and the pure tree helpers. Consumed by the lexicon
 * gallery (Phase 3) and the glyph/grapheme galleries (Phase 4).
 *
 * The lexicon-specific `tabs/lexicon/folders/` paths re-export from here so
 * every pre-Phase-3 import keeps resolving unchanged.
 */

export { default as DirectoryGallery, TREE_ITEM_CAP } from './DirectoryGallery';
export type { DirectoryGalleryProps, DirectoryEmptyContext } from './DirectoryGallery';

export { default as FolderTreeSelect } from './FolderTreeSelect';
export type { FolderTreeSelectProps } from './FolderTreeSelect';

export { default as FolderNameDialog } from './FolderNameDialog';
export type { FolderNameDialogProps } from './FolderNameDialog';

export { default as MoveToFolderDialog } from './MoveToFolderDialog';
export type { MoveToFolderDialogProps } from './MoveToFolderDialog';

export {
    buildFolderOptions,
    childFolders,
    compareFolders,
    descendantFolders,
    folderPath,
    indexFolders,
} from './folderTree';
export type { FolderTreeOption } from './folderTree';

export { folderCreateHref, lexiconCreateHref, glyphCreateHref, graphemeCreateHref } from './createHref';
