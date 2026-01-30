/**
 * Spiral Layout Strategy
 *
 * Arranges glyphs in an outward spiral pattern from the center.
 *
 * @module display/spelling/strategies/spiralStrategy
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
 * Spiral layout strategy.
 *
 * Glyphs are arranged in an outward spiral starting from the center.
 * The first glyph is at the center, subsequent glyphs spiral outward.
 *
 * Example (simplified):
 *     [G5]
 * [G4][G1][G2]
 *     [G3]
 */
export const spiralStrategy: LayoutStrategy = {
    name: 'spiral',

    calculate(glyphs: RenderableGlyph[], config: LayoutStrategyConfig): LayoutResult {
        if (glyphs.length === 0) {
            return { positions: [], bounds: emptyBounds(config) };
        }

        const { glyphWidth, glyphHeight, spacing, padding } = config;
        const cellWidth = glyphWidth + spacing;
        const cellHeight = glyphHeight + spacing;

        // Use Ulam spiral pattern for grid positions
        // Direction order: right, up, left, down
        const directions = [
            [1, 0],   // right
            [0, -1],  // up
            [-1, 0],  // left
            [0, 1],   // down
        ];

        const gridPositions: Array<{ x: number; y: number }> = [];

        if (glyphs.length === 1) {
            gridPositions.push({ x: 0, y: 0 });
        } else {
            let x = 0;
            let y = 0;
            let direction = 0;
            let stepsInDirection = 1;
            let stepsTaken = 0;
            let turnsAtCurrentLength = 0;

            for (let i = 0; i < glyphs.length; i++) {
                gridPositions.push({ x, y });

                // Move to next position
                x += directions[direction][0];
                y += directions[direction][1];
                stepsTaken++;

                // Check if we need to turn
                if (stepsTaken === stepsInDirection) {
                    stepsTaken = 0;
                    direction = (direction + 1) % 4;
                    turnsAtCurrentLength++;

                    // Every 2 turns, increase the steps per direction
                    if (turnsAtCurrentLength === 2) {
                        turnsAtCurrentLength = 0;
                        stepsInDirection++;
                    }
                }
            }
        }

        // Find grid bounds to center the layout
        let minGridX = 0, maxGridX = 0, minGridY = 0, maxGridY = 0;
        for (const pos of gridPositions) {
            minGridX = Math.min(minGridX, pos.x);
            maxGridX = Math.max(maxGridX, pos.x);
            minGridY = Math.min(minGridY, pos.y);
            maxGridY = Math.max(maxGridY, pos.y);
        }

        // Calculate offset to position layout starting from padding
        const offsetX = -minGridX * cellWidth + padding;
        const offsetY = -minGridY * cellHeight + padding;

        const positions: PositionedGlyph[] = glyphs.map((glyph, index) => ({
            glyph,
            index,
            x: gridPositions[index].x * cellWidth + offsetX,
            y: gridPositions[index].y * cellHeight + offsetY,
            width: glyphWidth,
            height: glyphHeight,
        }));

        return {
            positions,
            bounds: calculateBounds(positions, config),
        };
    },
};
