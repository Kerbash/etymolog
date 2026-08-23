/**
 * Cell Geometry
 *
 * A positioned glyph is a BOX (`glyphWidth` × `glyphHeight`, the whole drawing
 * canvas) with a CELL in its middle (`cellFraction` of each side). Letters
 * advance by the cell, not the box, so consecutive boxes overlap by their
 * margins — that is the entire mechanism by which a letter can reach into
 * its neighbour's space. Every strategy derives its steps from here; none
 * should add `glyphWidth + spacing` by hand again.
 *
 * Bounds stay BOX-based (see `utils/bounds`): the outer margins of a word are
 * still part of its drawing, so nothing a letter draws there is clipped.
 *
 * @module display/spelling/utils/cell
 */

import type { LayoutStrategyConfig } from '../types';

export interface CellGeometry {
    /** The cell's width — what one letter reserves along the x axis. */
    cellWidth: number;
    /** The cell's height — what one letter reserves along the y axis. */
    cellHeight: number;
    /** Margin between the box's left/right edge and the cell. */
    insetX: number;
    /** Margin between the box's top/bottom edge and the cell. */
    insetY: number;
    /** Distance from one glyph's box origin to the next along x. */
    stepX: number;
    /** Distance from one glyph's box origin to the next along y. */
    stepY: number;
    /** Box extent of `count` glyphs in one row (first box start → last box end). */
    rowExtent: (count: number) => number;
    /** Box extent of `count` glyphs in one column. */
    columnExtent: (count: number) => number;
    /**
     * How many glyphs fit in `available` along a row: the outer margins are
     * paid once, every further glyph costs one step.
     */
    fitInRow: (available: number) => number;
    /** As `fitInRow`, along a column. */
    fitInColumn: (available: number) => number;
}

/** The cell geometry of a layout config. */
export function cellGeometry(config: LayoutStrategyConfig): CellGeometry {
    const { glyphWidth, glyphHeight, spacing } = config;
    // Clamped: a fraction above 1 would make letters repel, 0 would stack them.
    const fraction = Math.min(1, Math.max(Number.EPSILON, config.cellFraction));

    const cellWidth = glyphWidth * fraction;
    const cellHeight = glyphHeight * fraction;
    const insetX = (glyphWidth - cellWidth) / 2;
    const insetY = (glyphHeight - cellHeight) / 2;
    const stepX = cellWidth + spacing;
    const stepY = cellHeight + spacing;

    const rowExtent = (count: number) => (count <= 0 ? 0 : (count - 1) * stepX + glyphWidth);
    const columnExtent = (count: number) => (count <= 0 ? 0 : (count - 1) * stepY + glyphHeight);
    const fit = (available: number, box: number, step: number) =>
        Number.isFinite(available) ? Math.max(1, Math.floor((available - box) / step) + 1) : Infinity;

    return {
        cellWidth,
        cellHeight,
        insetX,
        insetY,
        stepX,
        stepY,
        rowExtent,
        columnExtent,
        fitInRow: (available) => fit(available, glyphWidth, stepX),
        fitInColumn: (available) => fit(available, glyphHeight, stepY),
    };
}
