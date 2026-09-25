/**
 * SVG composition primitives — pure string functions, no DOM, no React.
 *
 * Every picture the app builds out of other pictures goes through here: a
 * multi-glyph grapheme drawn as one row, a block-script block that nests one
 * grapheme per template rectangle, and the text stand-in drawn for an IPA
 * character that has no grapheme.
 *
 * This is the ONE implementation. The block engine (`src/blocks/`) sits below
 * the component layer and must not import from it, so the primitives live
 * here; `glyphCanvasInput/utils/graphemeUtils.ts` re-exports `parseSvgViewBox`
 * / `extractSvgInner` and delegates `combineSvgStrings` to `combineSvgRow`,
 * and the spelling display's normalization draws virtual glyphs with
 * `textSvg` (block-script plan, phase 4 — the former copies are gone).
 * Behaviour is pinned by `src/db/utils/__tests__/svgCompose.test.ts`.
 *
 * @module db/utils/svgCompose
 */

import { GLYPH_CELL_FRACTION } from './glyphMetrics';

/** A rectangle in the OUTPUT coordinate space of the SVG being built. */
export interface SvgRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** The align half of `preserveAspectRatio` — the nine `xMinYMin`…`xMaxYMax` positions. */
export type SvgAlign =
    | 'xMinYMin' | 'xMidYMin' | 'xMaxYMin'
    | 'xMinYMid' | 'xMidYMid' | 'xMaxYMid'
    | 'xMinYMax' | 'xMidYMax' | 'xMaxYMax';

/**
 * How a nested source is placed in its cell (BLOCK_PLACEMENT_PLAN.md §2).
 * Omitted ⇒ `xMidYMid meet` with no `overflow` — the exact bytes written before
 * placement existed. `scale: 'slice'` also writes `overflow="visible"` so the
 * sign spills past the cell instead of being cropped.
 */
export interface SvgPlacement {
    align?: SvgAlign;
    scale?: 'meet' | 'slice';
}

/** `preserveAspectRatio` value + the extra `overflow` attribute a placement writes. */
export function placementAttrs(placement?: SvgPlacement): { par: string; overflow: string } {
    const align = placement?.align ?? 'xMidYMid';
    const scale = placement?.scale ?? 'meet';
    return { par: `${align} ${scale}`, overflow: scale === 'slice' ? ' overflow="visible"' : '' };
}

/** The `viewBox` of an SVG string, or a 0 0 100 100 default when absent/malformed. */
export function parseSvgViewBox(svg: string): { x: number; y: number; width: number; height: number } {
    const match = svg.match(/<svg\b[^>]*\bviewBox\s*=\s*["']\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)\s*["']/i);
    if (!match) return { x: 0, y: 0, width: 100, height: 100 };
    const [x, y, width, height] = match.slice(1).map(Number);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
        return { x: 0, y: 0, width: 100, height: 100 };
    }
    return { x, y, width, height };
}

/**
 * Inner markup of an SVG document: everything between the first `>` after the
 * opening `<svg` and the LAST `</svg>`. Tolerates nested `<svg>` elements,
 * which a non-greedy regex does not.
 */
export function extractSvgInner(svg: string): string {
    const openStart = svg.search(/<svg\b/i);
    if (openStart === -1) return svg;
    const openEnd = svg.indexOf('>', openStart);
    let closeStart = -1;
    for (const match of svg.matchAll(/<\/svg\s*>/gi)) {
        closeStart = match.index ?? -1;
    }
    if (openEnd === -1 || closeStart === -1 || closeStart < openEnd) return svg;
    return svg.slice(openEnd + 1, closeStart);
}

/**
 * One source SVG as a nested `<svg>` cell occupying `rect` of the parent.
 *
 * The source keeps its ORIGINAL `viewBox` and the browser rescales it into the
 * box, so sources authored in different coordinate spaces come out the same
 * size. `placement` picks the align × meet/slice (`SvgPlacement`); omitted ⇒
 * `xMidYMid meet` with no `overflow` — aspect preserved, centred, the exact
 * bytes written before placement existed. Numbers are written with `String(n)`
 * — callers that want tidy output round before calling.
 */
export function nestSvg(svg: string, rect: SvgRect, placement?: SvgPlacement): string {
    const vb = parseSvgViewBox(svg);
    const { par, overflow } = placementAttrs(placement);
    return `<svg x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}" preserveAspectRatio="${par}"${overflow}>${extractSvgInner(svg)}</svg>`;
}

/**
 * Combine several SVGs into one horizontal row — equivalent to
 * `graphemeUtils.combineSvgStrings`.
 *
 * Boxes advance by the glyph CELL (`GLYPH_CELL_FRACTION` of the box), exactly
 * as the layout strategies do, so a multi-glyph grapheme's glyph margins
 * overlap the way the word display paints them. Zero sources → `''`; one source
 * → returned unchanged.
 *
 * @param svgs - SVG strings, in reading order
 * @param spacing - Horizontal spacing between cells (in output units)
 * @param glyphSize - Size of each square box (width/height)
 */
export function combineSvgRow(svgs: readonly string[], spacing: number = 2, glyphSize: number = 24): string {
    if (svgs.length === 0) return '';
    if (svgs.length === 1) return svgs[0];

    const step = glyphSize * GLYPH_CELL_FRACTION + spacing;
    const totalWidth = (svgs.length - 1) * step + glyphSize;
    const cells = svgs.map((svg, index) => nestSvg(svg, { x: index * step, y: 0, w: glyphSize, h: glyphSize }));

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${glyphSize}" width="${totalWidth}" height="${glyphSize}">${cells.join('')}</svg>`;
}

/**
 * The text stand-in for an IPA character with no grapheme (a "virtual glyph")
 * — equivalent to normalization's `generateVirtualSvg`, markup and whitespace
 * included, so a virtual entry looks the same inside a block as outside one.
 */
export function textSvg(text: string): string {
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <text x="50" y="60" font-family="serif" font-size="48" text-anchor="middle" fill="currentColor">${escaped}</text>
    </svg>`;
}
