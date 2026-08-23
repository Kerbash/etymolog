/**
 * Circular Layout Strategy
 *
 * Arranges glyphs in a ring/circle pattern.
 *
 * @module display/spelling/strategies/circularStrategy
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
 * Circular layout strategy.
 *
 * Glyphs are arranged in a circle. The first glyph is at the top (12 o'clock),
 * and subsequent glyphs are placed clockwise around the circle. The ring is
 * sized so the CELLS do not overlap — the margins may, as everywhere else.
 *
 * For a single glyph, it's placed at the center.
 * For two glyphs, they're placed horizontally.
 *
 * Example (4 glyphs):
 *     [G1]
 * [G4]    [G2]
 *     [G3]
 */
export const circularStrategy: LayoutStrategy = {
    name: 'circular',

    calculate(glyphs: RenderableGlyph[], config: LayoutStrategyConfig): LayoutResult {
        if (glyphs.length === 0) {
            return { positions: [], bounds: emptyBounds(config) };
        }

        const { glyphWidth, glyphHeight, spacing, padding } = config;
        const { cellWidth, cellHeight, stepX } = cellGeometry(config);

        // Single glyph: center it
        if (glyphs.length === 1) {
            const positions: PositionedGlyph[] = [{
                glyph: glyphs[0],
                index: 0,
                x: padding,
                y: padding,
                width: glyphWidth,
                height: glyphHeight,
            }];
            return {
                positions,
                bounds: calculateBounds(positions, config),
            };
        }

        // Two glyphs: horizontal layout
        if (glyphs.length === 2) {
            const positions: PositionedGlyph[] = [
                {
                    glyph: glyphs[0],
                    index: 0,
                    x: padding,
                    y: padding,
                    width: glyphWidth,
                    height: glyphHeight,
                },
                {
                    glyph: glyphs[1],
                    index: 1,
                    x: padding + stepX,
                    y: padding,
                    width: glyphWidth,
                    height: glyphHeight,
                },
            ];
            return {
                positions,
                bounds: calculateBounds(positions, config),
            };
        }

        // Calculate radius based on number of glyphs
        // Ensure cells don't overlap by using circumference
        const cellDiagonal = Math.sqrt(cellWidth * cellWidth + cellHeight * cellHeight);
        const minCircumference = glyphs.length * (cellDiagonal + spacing);
        const radius = Math.max(cellDiagonal, minCircumference / (2 * Math.PI));

        // Calculate center position
        const centerX = padding + radius + glyphWidth / 2;
        const centerY = padding + radius + glyphHeight / 2;

        const positions: PositionedGlyph[] = glyphs.map((glyph, index) => {
            // Start at top (12 o'clock = -90 degrees) and go clockwise
            const angle = -Math.PI / 2 + (2 * Math.PI * index) / glyphs.length;

            return {
                glyph,
                index,
                x: centerX + radius * Math.cos(angle) - glyphWidth / 2,
                y: centerY + radius * Math.sin(angle) - glyphHeight / 2,
                width: glyphWidth,
                height: glyphHeight,
                // Optionally rotate glyphs to face outward
                // rotation: (angle * 180 / Math.PI) + 90,
            };
        });

        return {
            positions,
            bounds: calculateBounds(positions, config),
        };
    },
};
