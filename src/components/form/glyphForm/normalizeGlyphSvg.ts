/**
 * normalizeGlyphSvg
 * -----------------
 * Rewrite every painted colour in a glyph's SVG to `currentColor`.
 *
 * A script glyph is ONE colour by definition — the colour of the text it sits
 * in. Anything else is a bug waiting for a theme switch: the drawer used to
 * bake the author's swatch (`var(--black)`, or a literal `#000000` in an
 * imported file) into `fill`/`stroke`, and a black glyph is invisible on a dark
 * background. `currentColor` is the only value that follows the READER.
 *
 * The drawer itself now paints with `currentColor` (its palette is restricted
 * to a single entry — see `GLYPH_INK` in `glyphInk.ts`), so this runs as a
 * SAVE-TIME normalisation for the two cases the palette cannot cover:
 *
 *  1. glyphs drawn before that change, re-saved from the edit page;
 *  2. SVG that arrived from an import or a paste rather than the canvas.
 *
 * `none` and `transparent` are left alone: they are not colours, they are the
 * absence of paint, and rewriting them would flood every outlined shape solid.
 */

/** Paint values that mean "do not paint" and must survive untouched. */
const NON_COLOURS = new Set(['none', 'transparent', 'inherit', 'currentcolor']);

/** `fill="…"` / `stroke="…"` (single or double quoted). */
const PAINT_ATTRIBUTE = /\b(fill|stroke)\s*=\s*(["'])([^"']*)\2/gi;

/** `fill: …` / `stroke: …` inside a `style` declaration list. */
const PAINT_DECLARATION = /\b(fill|stroke)\s*:\s*([^;"']+)/gi;

function normalizePaint(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed === '' || NON_COLOURS.has(trimmed.toLowerCase())) return null;
    // `url(#gradient)` is a paint SERVER, not a colour — replacing it would drop
    // the reference and leave the shape unpainted rather than theme-following.
    if (/^url\(/i.test(trimmed)) return null;
    return 'currentColor';
}

/**
 * @param svg the glyph markup, as stored in `glyph.svg_data`.
 * @returns the same markup with every colour replaced by `currentColor`.
 *          Geometry, `viewBox`, dimensions and every other attribute are
 *          untouched; an empty/absent input is returned unchanged.
 */
export function normalizeGlyphSvg(svg: string | null | undefined): string {
    if (!svg) return svg ?? '';

    return svg
        .replace(PAINT_ATTRIBUTE, (match, property: string, quote: string, value: string) =>
            normalizePaint(value) === null ? match : `${property}=${quote}currentColor${quote}`,
        )
        .replace(PAINT_DECLARATION, (match, property: string, value: string) =>
            normalizePaint(value) === null ? match : `${property}:currentColor`,
        );
}

export default normalizeGlyphSvg;
