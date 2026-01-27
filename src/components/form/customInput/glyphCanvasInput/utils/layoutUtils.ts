/**
 * Canvas Layout Utilities
 *
 * Functions for calculating glyph positions on the canvas based on
 * writing direction and layout configuration.
 *
 * @module glyphCanvasInput/utils/layoutUtils
 */

import type { CanvasGlyph, CanvasLayoutConfig } from '../types';
import { DEFAULT_LAYOUT_CONFIG } from '../types';

/**
 * Minimal glyph interface needed for layout calculations.
 */
interface GlyphForLayout {
    id: number;
    name: string;
    svg_data: string;
    category?: string | null;
    notes?: string | null;
}

/**
 * Merge partial layout config with defaults.
 */
export function mergeLayoutConfig(
    partial?: Partial<CanvasLayoutConfig>
): Required<Omit<CanvasLayoutConfig, 'customLayout'>> & Pick<CanvasLayoutConfig, 'customLayout'> {
    return {
        ...DEFAULT_LAYOUT_CONFIG,
        ...partial,
        customLayout: partial?.customLayout,
    };
}

/**
 * Calculate the position of glyphs on the canvas based on writing direction.
 *
 * @param glyphs - Array of glyphs to position
 * @param config - Layout configuration
 * @returns Array of positioned glyphs
 */
export function calculateGlyphLayout(
    glyphs: GlyphForLayout[],
    config: Partial<CanvasLayoutConfig> = {}
): CanvasGlyph[] {
    const mergedConfig = mergeLayoutConfig(config);
    const { direction, customLayout } = mergedConfig;

    // Use custom layout if provided
    if (direction === 'custom' && customLayout) {
        return customLayout(glyphs as any, mergedConfig);
    }

    // Use direction-specific layout
    switch (direction) {
        case 'rtl':
            return calculateRtlLayout(glyphs, mergedConfig);
        case 'ttb':
            return calculateTtbLayout(glyphs, mergedConfig);
        case 'btt':
            return calculateBttLayout(glyphs, mergedConfig);
        case 'ltr':
        default:
            return calculateLtrLayout(glyphs, mergedConfig);
    }
}

/**
 * Calculate Left-to-Right layout.
 *
 * Glyphs flow from left to right, starting at the origin.
 *
 * Example: [G1] [G2] [G3] →
 */
function calculateLtrLayout(
    glyphs: GlyphForLayout[],
    config: Required<Omit<CanvasLayoutConfig, 'customLayout'>>
): CanvasGlyph[] {
    const { glyphSpacing, glyphWidth, glyphHeight, canvasPadding } = config;

    return glyphs.map((glyph, index) => ({
        glyph: glyph as any,
        index,
        x: canvasPadding + index * (glyphWidth + glyphSpacing),
        y: canvasPadding,
        width: glyphWidth,
        height: glyphHeight,
    }));
}

/**
 * Calculate Right-to-Left layout.
 *
 * Glyphs flow from right to left. The rightmost position is calculated
 * based on total width, and glyphs are placed from right to left.
 *
 * Example: ← [G3] [G2] [G1]
 */
function calculateRtlLayout(
    glyphs: GlyphForLayout[],
    config: Required<Omit<CanvasLayoutConfig, 'customLayout'>>
): CanvasGlyph[] {
    const { glyphSpacing, glyphWidth, glyphHeight, canvasPadding } = config;

    // Calculate total width needed
    const totalWidth = glyphs.length * glyphWidth + (glyphs.length - 1) * glyphSpacing;
    const startX = canvasPadding + totalWidth - glyphWidth;

    return glyphs.map((glyph, index) => ({
        glyph: glyph as any,
        index,
        x: startX - index * (glyphWidth + glyphSpacing),
        y: canvasPadding,
        width: glyphWidth,
        height: glyphHeight,
    }));
}

/**
 * Calculate Top-to-Bottom layout.
 *
 * Glyphs flow from top to bottom, starting at the origin.
 *
 * Example:
 * [G1]
 *  ↓
 * [G2]
 *  ↓
 * [G3]
 */
function calculateTtbLayout(
    glyphs: GlyphForLayout[],
    config: Required<Omit<CanvasLayoutConfig, 'customLayout'>>
): CanvasGlyph[] {
    const { glyphSpacing, glyphWidth, glyphHeight, canvasPadding } = config;

    return glyphs.map((glyph, index) => ({
        glyph: glyph as any,
        index,
        x: canvasPadding,
        y: canvasPadding + index * (glyphHeight + glyphSpacing),
        width: glyphWidth,
        height: glyphHeight,
    }));
}

/**
 * Calculate Bottom-to-Top layout.
 *
 * Glyphs flow from bottom to top. The bottommost position is calculated
 * based on total height, and glyphs are placed from bottom to top.
 *
 * Example:
 * [G3]
 *  ↑
 * [G2]
 *  ↑
 * [G1]
 */
function calculateBttLayout(
    glyphs: GlyphForLayout[],
    config: Required<Omit<CanvasLayoutConfig, 'customLayout'>>
): CanvasGlyph[] {
    const { glyphSpacing, glyphWidth, glyphHeight, canvasPadding } = config;

    // Calculate total height needed
    const totalHeight = glyphs.length * glyphHeight + (glyphs.length - 1) * glyphSpacing;
    const startY = canvasPadding + totalHeight - glyphHeight;

    return glyphs.map((glyph, index) => ({
        glyph: glyph as any,
        index,
        x: canvasPadding,
        y: startY - index * (glyphHeight + glyphSpacing),
        width: glyphWidth,
        height: glyphHeight,
    }));
}

/**
 * Calculate the bounding box of all positioned glyphs.
 *
 * @param positionedGlyphs - Array of positioned glyphs
 * @param config - Layout configuration
 * @returns Bounding box dimensions
 */
export function calculateBounds(
    positionedGlyphs: CanvasGlyph[],
    config: Partial<CanvasLayoutConfig> = {}
): { width: number; height: number; minX: number; minY: number; maxX: number; maxY: number } {
    const mergedConfig = mergeLayoutConfig(config);
    const { canvasPadding, glyphWidth, glyphHeight } = mergedConfig;

    if (positionedGlyphs.length === 0) {
        // Return minimum size for empty canvas
        return {
            width: canvasPadding * 2 + glyphWidth,
            height: canvasPadding * 2 + glyphHeight,
            minX: 0,
            minY: 0,
            maxX: canvasPadding * 2 + glyphWidth,
            maxY: canvasPadding * 2 + glyphHeight,
        };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const pg of positionedGlyphs) {
        minX = Math.min(minX, pg.x);
        minY = Math.min(minY, pg.y);
        maxX = Math.max(maxX, pg.x + pg.width);
        maxY = Math.max(maxY, pg.y + pg.height);
    }

    // Add padding to bounds
    return {
        width: maxX - minX + canvasPadding * 2,
        height: maxY - minY + canvasPadding * 2,
        minX: minX - canvasPadding,
        minY: minY - canvasPadding,
        maxX: maxX + canvasPadding,
        maxY: maxY + canvasPadding,
    };
}
