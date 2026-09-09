/**
 * Create-in-folder link helpers (shared/directory)
 * ------------------------------------------------
 * A create route, carrying the folder the directory is currently viewing so a
 * new item defaults into it (mirrors the `?pronunciation=` prefill the generator
 * uses). A null folder (the root level) yields the bare create route.
 *
 * `folderCreateHref` is the domain-neutral primitive; `lexiconCreateHref` is the
 * lexicon binding kept at its historical name so pre-Phase-3 callers keep
 * compiling. Phase 4 adds the glyph/grapheme bindings alongside it.
 */

import { ROUTES } from '../../../url_mapping';

/** `<base>` for the root level, `<base>?folder=<id>` when filed into a folder. */
export function folderCreateHref(base: string, folderId: number | null): string {
    return folderId === null ? base : `${base}?folder=${folderId}`;
}

export function lexiconCreateHref(folderId: number | null): string {
    return folderCreateHref(ROUTES.lexiconCreate, folderId);
}

/** `/script-maker/glyphs/create`, carrying the focused glyph folder. */
export function glyphCreateHref(folderId: number | null): string {
    return folderCreateHref(ROUTES.glyphCreate, folderId);
}

/** `/script-maker/create`, carrying the focused grapheme folder. */
export function graphemeCreateHref(folderId: number | null): string {
    return folderCreateHref(ROUTES.scriptMakerCreate, folderId);
}
