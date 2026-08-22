/**
 * Grapheme Utility Functions
 *
 * Utilities for transforming GraphemeComplete objects into formats
 * compatible with the glyph canvas and keyboard components.
 *
 * @module glyphCanvasInput/utils/graphemeUtils
 */

import type { Glyph, GraphemeComplete, GlyphWithUsage } from '../../../../../db/types';

/**
 * Represents a grapheme or glyph with SVG data for rendering.
 * This is a normalized format that works with both GlyphCanvas and GlyphKeyboardOverlay.
 */
export interface RenderableGlyph {
    id: number;
    name: string;
    svg_data: string;
    category: string | null;
    notes: string | null;
    /** For GlyphWithUsage compatibility */
    usageCount?: number;
    created_at?: string;
    updated_at?: string;
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
 * Combine multiple SVG strings into a single horizontal SVG.
 *
 * Each source is nested as its own `<svg>` with its ORIGINAL `viewBox`, placed
 * in a fixed-size cell, so the browser rescales it — a glyph authored in a
 * 0 0 100 100 space and one in 0 0 48 48 come out the same size. (Splicing the
 * raw markup into a shared coordinate space, as this used to, rendered
 * multi-glyph graphemes several times too large.)
 *
 * @param svgStrings - Array of SVG strings to combine
 * @param spacing - Horizontal spacing between cells (in output units)
 * @param glyphSize - Size of each square cell (width/height)
 */
export function combineSvgStrings(
    svgStrings: string[],
    spacing: number = 2,
    glyphSize: number = 24
): string {
    if (svgStrings.length === 0) {
        return '';
    }
    if (svgStrings.length === 1) {
        return svgStrings[0];
    }

    const totalWidth = svgStrings.length * glyphSize + (svgStrings.length - 1) * spacing;
    const cells = svgStrings.map((svg, index) => {
        const vb = parseSvgViewBox(svg);
        const x = index * (glyphSize + spacing);
        return `<svg x="${x}" y="0" width="${glyphSize}" height="${glyphSize}" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}" preserveAspectRatio="xMidYMid meet">${extractSvgInner(svg)}</svg>`;
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${glyphSize}" width="${totalWidth}" height="${glyphSize}">${cells.join('')}</svg>`;
}

/**
 * Extract SVG data from a GraphemeComplete object.
 *
 * If the grapheme has multiple glyphs, their SVGs are combined horizontally.
 * If no glyphs are present, returns an empty string.
 *
 * @param grapheme - GraphemeComplete object
 * @returns Combined SVG string
 */
export function extractSvgFromGrapheme(grapheme: GraphemeComplete): string {
    if (!grapheme.glyphs || grapheme.glyphs.length === 0) {
        return '';
    }

    const svgStrings = grapheme.glyphs
        .filter(g => g.svg_data)
        .map(g => g.svg_data);

    return combineSvgStrings(svgStrings);
}

/**
 * Convert a GraphemeComplete to a RenderableGlyph format.
 *
 * This normalizes grapheme data to work with components that expect
 * glyph-like objects with direct svg_data property.
 *
 * @param grapheme - GraphemeComplete object
 * @returns RenderableGlyph
 */
export function graphemeToRenderableGlyph(grapheme: GraphemeComplete): RenderableGlyph {
    return {
        id: grapheme.id,
        name: grapheme.name,
        svg_data: extractSvgFromGrapheme(grapheme),
        category: grapheme.category,
        notes: grapheme.notes,
    };
}

/**
 * Convert an array of GraphemeComplete to RenderableGlyph format.
 *
 * @param graphemes - Array of GraphemeComplete objects
 * @returns Array of RenderableGlyph
 */
export function graphemesToRenderableGlyphs(graphemes: GraphemeComplete[]): RenderableGlyph[] {
    return graphemes.map(graphemeToRenderableGlyph);
}

/**
 * Convert a RenderableGlyph to GlyphWithUsage format for compatibility.
 *
 * @param renderable - RenderableGlyph
 * @returns GlyphWithUsage-compatible object
 */
export function renderableToGlyphWithUsage(renderable: RenderableGlyph): GlyphWithUsage {
    return {
        id: renderable.id,
        name: renderable.name,
        svg_data: renderable.svg_data,
        category: renderable.category,
        notes: renderable.notes,
        usageCount: renderable.usageCount ?? 0,
        created_at: renderable.created_at ?? '',
        updated_at: renderable.updated_at ?? '',
    };
}

/**
 * Check if an object is a GraphemeComplete (has glyphs array).
 *
 * @param obj - Object to check
 * @returns True if object is GraphemeComplete
 */
export function isGraphemeComplete(obj: unknown): obj is GraphemeComplete {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'glyphs' in obj &&
        Array.isArray((obj as GraphemeComplete).glyphs)
    );
}

/**
 * Check if an object has svg_data (Glyph or GlyphWithUsage).
 *
 * @param obj - Object to check
 * @returns True if object has svg_data
 */
export function hasDirectSvgData(obj: unknown): obj is Glyph | GlyphWithUsage {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'svg_data' in obj &&
        typeof (obj as Glyph).svg_data === 'string'
    );
}

/**
 * Normalize any glyph-like or grapheme-like object to RenderableGlyph.
 *
 * This function handles:
 * - GraphemeComplete (extracts combined SVG from glyphs)
 * - Glyph (uses svg_data directly)
 * - GlyphWithUsage (uses svg_data directly)
 *
 * @param item - Glyph, GlyphWithUsage, or GraphemeComplete
 * @returns RenderableGlyph
 */
export function normalizeToRenderable(
    item: Glyph | GlyphWithUsage | GraphemeComplete
): RenderableGlyph {
    if (isGraphemeComplete(item)) {
        return { ...graphemeToRenderableGlyph(item), created_at: item.created_at, updated_at: item.updated_at };
    }

    // It's a Glyph or GlyphWithUsage
    return {
        id: item.id,
        name: item.name,
        svg_data: item.svg_data,
        category: item.category,
        notes: item.notes,
        usageCount: (item as GlyphWithUsage).usageCount,
        created_at: item.created_at,
        updated_at: item.updated_at,
    };
}

/**
 * Build a Map of RenderableGlyph from an array of mixed glyph/grapheme items.
 *
 * @param items - Array of Glyph, GlyphWithUsage, or GraphemeComplete
 * @returns Map<number, RenderableGlyph>
 */
export function buildRenderableMap(
    items: (Glyph | GlyphWithUsage | GraphemeComplete)[]
): Map<number, RenderableGlyph> {
    const map = new Map<number, RenderableGlyph>();
    for (const item of items) {
        const renderable = normalizeToRenderable(item);
        map.set(renderable.id, renderable);
    }
    return map;
}
