/**
 * Block Layout Strategy
 *
 * Multi-row wrapping layout that flows glyphs and wraps to new lines
 * when maxWidth is exceeded.
 *
 * @module display/spelling/strategies/blockStrategy
 */

import type {
    LayoutStrategy,
    LayoutStrategyConfig,
    LayoutResult,
    RenderableGlyph,
    PositionedGlyph,
} from '../types';
import { emptyBounds, calculateBounds } from '../utils/bounds';
import { cellGeometry } from '../utils/cell';

/**
 * Block layout strategy.
 *
 * Glyphs flow left-to-right and wrap to new rows when maxWidth is reached.
 * If no maxWidth is specified, defaults to 5 glyphs per row. Rows, like
 * letters, advance by the cell, so a descender reaches into the row below
 * the way a tail reaches into the next letter.
 *
 * Example (maxWidth fits 3 glyphs):
 * [G1] [G2] [G3]
 * [G4] [G5] [G6]
 * [G7]
 */
export const blockStrategy: LayoutStrategy = {
    name: 'block',

    calculate(glyphs: RenderableGlyph[], config: LayoutStrategyConfig): LayoutResult {
        if (glyphs.length === 0) {
            return { positions: [], bounds: emptyBounds(config) };
        }

        const { glyphWidth, glyphHeight, padding, maxWidth } = config;
        const { stepX, stepY, fitInRow } = cellGeometry(config);

        // Calculate how many glyphs fit per row
        const glyphsPerRow = maxWidth
            ? fitInRow(maxWidth - padding * 2)
            : 5; // Default to 5 glyphs per row if no maxWidth

        const positions: PositionedGlyph[] = glyphs.map((glyph, index) => {
            const col = index % glyphsPerRow;
            const row = Math.floor(index / glyphsPerRow);

            return {
                glyph,
                index,
                x: padding + col * stepX,
                y: padding + row * stepY,
                width: glyphWidth,
                height: glyphHeight,
            };
        });

        return {
            positions,
            bounds: calculateBounds(positions, config),
        };
    },
};
