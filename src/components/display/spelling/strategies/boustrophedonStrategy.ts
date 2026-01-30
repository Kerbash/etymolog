/**
 * Boustrophedon Layout Strategy
 *
 * Arranges glyphs in alternating direction rows (like an ox plowing a field).
 * Odd rows go left-to-right, even rows go right-to-left.
 *
 * @module display/spelling/strategies/boustrophedonStrategy
 */

import type {
    LayoutStrategy,
    LayoutStrategyConfig,
    LayoutResult,
    RenderableGlyph,
    PositionedGlyph,
} from '../types';
import { emptyBounds, calculateBounds } from '../utils/bounds';

/**
 * Boustrophedon layout strategy.
 *
 * Glyphs are arranged in rows with alternating direction:
 * - Row 0 (top): left to right
 * - Row 1: right to left
 * - Row 2: left to right
 * - etc.
 *
 * This mimics the ancient writing pattern "as the ox plows".
 *
 * Example (5 glyphs per row):
 * [G1] [G2] [G3] [G4] [G5] →
 * ← [G10] [G9] [G8] [G7] [G6]
 * [G11] [G12] →
 */
export const boustrophedonStrategy: LayoutStrategy = {
    name: 'boustrophedon',

    calculate(glyphs: RenderableGlyph[], config: LayoutStrategyConfig): LayoutResult {
        if (glyphs.length === 0) {
            return { positions: [], bounds: emptyBounds(config) };
        }

        const { glyphWidth, glyphHeight, spacing, padding, maxWidth } = config;

        // Calculate how many glyphs fit per row
        const cellWidth = glyphWidth + spacing;
        const availableWidth = maxWidth ? maxWidth - padding * 2 : Infinity;
        const glyphsPerRow = maxWidth
            ? Math.max(1, Math.floor((availableWidth + spacing) / cellWidth))
            : 5; // Default to 5 glyphs per row if no maxWidth

        // Calculate the width of a full row (for RTL positioning)
        const rowWidth = glyphsPerRow * glyphWidth + (glyphsPerRow - 1) * spacing;

        const positions: PositionedGlyph[] = glyphs.map((glyph, index) => {
            const row = Math.floor(index / glyphsPerRow);
            const colInRow = index % glyphsPerRow;
            const isRtlRow = row % 2 === 1;

            let x: number;
            if (isRtlRow) {
                // RTL row: start from the right
                // For incomplete rows, align to the right edge
                const glyphsInThisRow = Math.min(glyphsPerRow, glyphs.length - row * glyphsPerRow);
                const thisRowWidth = glyphsInThisRow * glyphWidth + (glyphsInThisRow - 1) * spacing;
                const rightEdge = padding + rowWidth - glyphWidth;
                x = rightEdge - colInRow * (glyphWidth + spacing);
            } else {
                // LTR row: start from the left
                x = padding + colInRow * (glyphWidth + spacing);
            }

            return {
                glyph,
                index,
                x,
                y: padding + row * (glyphHeight + spacing),
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
