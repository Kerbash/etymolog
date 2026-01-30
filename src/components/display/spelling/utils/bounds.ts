/**
 * Bounding Box Utilities
 *
 * Functions for calculating and manipulating layout bounds.
 *
 * @module display/spelling/utils/bounds
 */

import type { LayoutBounds, LayoutStrategyConfig, PositionedGlyph } from '../types';

/**
 * Calculate empty layout bounds with minimum size.
 */
export function emptyBounds(config: LayoutStrategyConfig): LayoutBounds {
    const { glyphWidth, glyphHeight, padding } = config;
    return {
        width: padding * 2 + glyphWidth,
        height: padding * 2 + glyphHeight,
        minX: 0,
        minY: 0,
        maxX: padding * 2 + glyphWidth,
        maxY: padding * 2 + glyphHeight,
    };
}

/**
 * Calculate bounds from positioned glyphs.
 */
export function calculateBounds(
    positions: PositionedGlyph[],
    config: LayoutStrategyConfig
): LayoutBounds {
    if (positions.length === 0) {
        return emptyBounds(config);
    }

    const { padding } = config;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const pg of positions) {
        minX = Math.min(minX, pg.x);
        minY = Math.min(minY, pg.y);
        maxX = Math.max(maxX, pg.x + pg.width);
        maxY = Math.max(maxY, pg.y + pg.height);
    }

    return {
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2,
        minX: minX - padding,
        minY: minY - padding,
        maxX: maxX + padding,
        maxY: maxY + padding,
    };
}

/**
 * Merge two bounds into a union bound that contains both.
 */
export function mergeBounds(a: LayoutBounds, b: LayoutBounds): LayoutBounds {
    const minX = Math.min(a.minX, b.minX);
    const minY = Math.min(a.minY, b.minY);
    const maxX = Math.max(a.maxX, b.maxX);
    const maxY = Math.max(a.maxY, b.maxY);

    return {
        width: maxX - minX,
        height: maxY - minY,
        minX,
        minY,
        maxX,
        maxY,
    };
}

/**
 * Add padding to bounds.
 */
export function padBounds(bounds: LayoutBounds, padding: number): LayoutBounds {
    return {
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
        minX: bounds.minX - padding,
        minY: bounds.minY - padding,
        maxX: bounds.maxX + padding,
        maxY: bounds.maxY + padding,
    };
}

/**
 * Calculate the viewBox string for SVG from bounds.
 */
export function boundsToViewBox(bounds: LayoutBounds): string {
    return `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`;
}
