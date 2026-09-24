/**
 * Grapheme Utility Functions
 *
 * Utilities for transforming GraphemeComplete objects into formats
 * compatible with the glyph canvas and keyboard components.
 *
 * @module glyphCanvasInput/utils/graphemeUtils
 */

import type { Glyph, GraphemeComplete, GlyphWithUsage } from '../../../../../db/types';
import { combineSvgRow } from '../../../../../db/utils/svgCompose';

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

// The SVG composition primitives live in `db/utils/svgCompose` — the ONE
// implementation, shared with the block-script engine (which sits below the
// component layer and cannot import from here). Re-exported under their
// historical names so this module's callers are unchanged.
export { parseSvgViewBox, extractSvgInner } from '../../../../../db/utils/svgCompose';

/**
 * Combine multiple SVG strings into a single horizontal SVG — see
 * `combineSvgRow` in `db/utils/svgCompose` (each source nested with its
 * ORIGINAL viewBox; boxes advance by the glyph CELL, like the word display).
 *
 * @param svgStrings - Array of SVG strings to combine
 * @param spacing - Horizontal spacing between cells (in output units)
 * @param glyphSize - Size of each square box (width/height)
 */
export function combineSvgStrings(
    svgStrings: string[],
    spacing: number = 2,
    glyphSize: number = 24
): string {
    return combineSvgRow(svgStrings, spacing, glyphSize);
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
