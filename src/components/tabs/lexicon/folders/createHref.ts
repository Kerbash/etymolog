/**
 * Re-export shim (Phase 3). `lexiconCreateHref` moved to
 * `shared/directory/createHref`; this keeps the old lexicon path working.
 */

export { folderCreateHref, lexiconCreateHref } from '../../../shared/directory/createHref';
