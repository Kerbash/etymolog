/**
 * Helpers shared by the logogram panel and the word form. They live apart from
 * `LogogramPanel.tsx` so that file exports only components (Fast Refresh).
 */

import type { GraphemeComplete } from '../../../db';
import { WORD_SYMBOL_CATEGORY } from '../../../db/wordSymbolService';

/** True when SVG markup is a raster import the drawing canvas cannot parse back. */
export function isImageImportSvg(svg: string | null | undefined): boolean {
    return !!svg && /<image[\s>]/i.test(svg);
}

/**
 * The logogram grapheme that already wraps exactly `glyphId` on its own — the
 * one `logogramForGlyph` would reuse on save. Mirrors that query so the panel
 * can say "reused" vs "created" before the user saves.
 */
export function existingLogogramForGlyph(
    graphemes: readonly GraphemeComplete[],
    glyphId: number,
): GraphemeComplete | null {
    return graphemes.find((g) =>
        g.category === WORD_SYMBOL_CATEGORY
        && g.phonemes.length === 0
        && g.glyphs.length === 1
        && g.glyphs[0].id === glyphId,
    ) ?? null;
}
