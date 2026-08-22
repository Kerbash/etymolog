/**
 * Canvas Layout Utilities
 *
 * The glyph-canvas input positions glyphs with the SAME linear strategies the
 * display layer uses (`display/spelling/strategies/linearStrategy`). This
 * module is an adapter: it maps the canvas config vocabulary
 * (`glyphSpacing`, `canvasPadding`, `direction`) onto `LayoutStrategyConfig`,
 * runs the strategy, and maps the result back to `CanvasGlyph`. One set of
 * direction algorithms, one set of bugs.
 *
 * @module glyphCanvasInput/utils/layoutUtils
 */

import type { CanvasGlyph, CanvasLayoutConfig, GlyphForCanvas } from '../types';
import { DEFAULT_LAYOUT_CONFIG } from '../types';
import type { LayoutStrategy, LayoutStrategyConfig, RenderableGlyph } from '../../../../display/spelling/types';
import { ltrStrategy, rtlStrategy, ttbStrategy, bttStrategy } from '../../../../display/spelling/strategies/linearStrategy';
import { calculateBounds as calculateLayoutBounds } from '../../../../display/spelling/utils/bounds';
import { isVirtualGlyphId } from '../../../../../db/utils/virtualGlyph';

type MergedCanvasLayoutConfig = Required<Omit<CanvasLayoutConfig, 'customLayout'>> & Pick<CanvasLayoutConfig, 'customLayout'>;

/**
 * Merge partial layout config with defaults.
 */
export function mergeLayoutConfig(partial?: Partial<CanvasLayoutConfig>): MergedCanvasLayoutConfig {
    return {
        ...DEFAULT_LAYOUT_CONFIG,
        ...partial,
        customLayout: partial?.customLayout,
    };
}

function toStrategyConfig(config: MergedCanvasLayoutConfig): LayoutStrategyConfig {
    return {
        glyphWidth: config.glyphWidth,
        glyphHeight: config.glyphHeight,
        spacing: config.glyphSpacing,
        padding: config.canvasPadding,
    };
}

function toRenderable(glyph: GlyphForCanvas, sourceIndex: number): RenderableGlyph {
    return {
        id: glyph.id,
        name: glyph.name,
        svg_data: glyph.svg_data,
        isVirtual: isVirtualGlyphId(glyph.id),
        sourceIndex,
    };
}

const STRATEGY_BY_DIRECTION: Record<'ltr' | 'rtl' | 'ttb' | 'btt', LayoutStrategy> = {
    ltr: ltrStrategy,
    rtl: rtlStrategy,
    ttb: ttbStrategy,
    btt: bttStrategy,
};

/**
 * Position glyphs on the canvas according to the writing direction.
 */
export function calculateGlyphLayout(
    glyphs: GlyphForCanvas[],
    config: Partial<CanvasLayoutConfig> = {}
): CanvasGlyph[] {
    const merged = mergeLayoutConfig(config);
    const { direction, customLayout } = merged;

    if (direction === 'custom' && customLayout) {
        return customLayout(glyphs as Parameters<typeof customLayout>[0], merged);
    }

    const strategy = STRATEGY_BY_DIRECTION[direction === 'custom' ? 'ltr' : direction] ?? ltrStrategy;
    const { positions } = strategy.calculate(glyphs.map(toRenderable), toStrategyConfig(merged));

    return positions.map(p => ({
        glyph: glyphs[p.glyph.sourceIndex],
        index: p.index,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
    }));
}

/**
 * Bounding box of positioned glyphs, including canvas padding.
 */
export function calculateBounds(
    positionedGlyphs: CanvasGlyph[],
    config: Partial<CanvasLayoutConfig> = {}
): { width: number; height: number; minX: number; minY: number; maxX: number; maxY: number } {
    const merged = mergeLayoutConfig(config);
    return calculateLayoutBounds(
        positionedGlyphs.map(pg => ({
            glyph: toRenderable(pg.glyph, pg.index),
            index: pg.index,
            x: pg.x,
            y: pg.y,
            width: pg.width,
            height: pg.height,
        })),
        toStrategyConfig(merged),
    );
}
