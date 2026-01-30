/**
 * Linear Layout Strategies
 *
 * Implements LTR, RTL, TTB, and BTT layout directions.
 * Ported from glyphCanvasInput/utils/layoutUtils.ts for shared use.
 *
 * @module display/spelling/strategies/linearStrategy
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
 * Left-to-Right layout strategy.
 *
 * Glyphs flow from left to right, starting at the origin.
 * Example: [G1] [G2] [G3] →
 */
export const ltrStrategy: LayoutStrategy = {
    name: 'ltr',

    calculate(glyphs: RenderableGlyph[], config: LayoutStrategyConfig): LayoutResult {
        if (glyphs.length === 0) {
            return { positions: [], bounds: emptyBounds(config) };
        }

        const { glyphWidth, glyphHeight, spacing, padding } = config;

        const positions: PositionedGlyph[] = glyphs.map((glyph, index) => ({
            glyph,
            index,
            x: padding + index * (glyphWidth + spacing),
            y: padding,
            width: glyphWidth,
            height: glyphHeight,
        }));

        return {
            positions,
            bounds: calculateBounds(positions, config),
        };
    },
};

/**
 * Right-to-Left layout strategy.
 *
 * Glyphs flow from right to left. The rightmost position is calculated
 * based on total width, and glyphs are placed from right to left.
 * Example: ← [G3] [G2] [G1]
 */
export const rtlStrategy: LayoutStrategy = {
    name: 'rtl',

    calculate(glyphs: RenderableGlyph[], config: LayoutStrategyConfig): LayoutResult {
        if (glyphs.length === 0) {
            return { positions: [], bounds: emptyBounds(config) };
        }

        const { glyphWidth, glyphHeight, spacing, padding } = config;

        // Calculate total width needed
        const totalWidth = glyphs.length * glyphWidth + (glyphs.length - 1) * spacing;
        const startX = padding + totalWidth - glyphWidth;

        const positions: PositionedGlyph[] = glyphs.map((glyph, index) => ({
            glyph,
            index,
            x: startX - index * (glyphWidth + spacing),
            y: padding,
            width: glyphWidth,
            height: glyphHeight,
        }));

        return {
            positions,
            bounds: calculateBounds(positions, config),
        };
    },
};

/**
 * Top-to-Bottom layout strategy.
 *
 * Glyphs flow from top to bottom, starting at the origin.
 * Example:
 * [G1]
 *  ↓
 * [G2]
 *  ↓
 * [G3]
 */
export const ttbStrategy: LayoutStrategy = {
    name: 'ttb',

    calculate(glyphs: RenderableGlyph[], config: LayoutStrategyConfig): LayoutResult {
        if (glyphs.length === 0) {
            return { positions: [], bounds: emptyBounds(config) };
        }

        const { glyphWidth, glyphHeight, spacing, padding } = config;

        const positions: PositionedGlyph[] = glyphs.map((glyph, index) => ({
            glyph,
            index,
            x: padding,
            y: padding + index * (glyphHeight + spacing),
            width: glyphWidth,
            height: glyphHeight,
        }));

        return {
            positions,
            bounds: calculateBounds(positions, config),
        };
    },
};

/**
 * Bottom-to-Top layout strategy.
 *
 * Glyphs flow from bottom to top. The bottommost position is calculated
 * based on total height, and glyphs are placed from bottom to top.
 * Example:
 * [G3]
 *  ↑
 * [G2]
 *  ↑
 * [G1]
 */
export const bttStrategy: LayoutStrategy = {
    name: 'btt',

    calculate(glyphs: RenderableGlyph[], config: LayoutStrategyConfig): LayoutResult {
        if (glyphs.length === 0) {
            return { positions: [], bounds: emptyBounds(config) };
        }

        const { glyphWidth, glyphHeight, spacing, padding } = config;

        // Calculate total height needed
        const totalHeight = glyphs.length * glyphHeight + (glyphs.length - 1) * spacing;
        const startY = padding + totalHeight - glyphHeight;

        const positions: PositionedGlyph[] = glyphs.map((glyph, index) => ({
            glyph,
            index,
            x: padding,
            y: startY - index * (glyphHeight + spacing),
            width: glyphWidth,
            height: glyphHeight,
        }));

        return {
            positions,
            bounds: calculateBounds(positions, config),
        };
    },
};
