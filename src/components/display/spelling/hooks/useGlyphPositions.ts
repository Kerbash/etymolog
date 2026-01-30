/**
 * useGlyphPositions Hook
 *
 * Memoized hook for calculating glyph positions using a layout strategy.
 *
 * @module display/spelling/hooks/useGlyphPositions
 */

import { useMemo } from 'react';
import type {
    RenderableGlyph,
    LayoutStrategyType,
    LayoutStrategyConfig,
    LayoutResult,
    LayoutPreset,
} from '../types';
import { getStrategy } from '../strategies';
import { resolveLayoutConfig } from '../utils/config';

/**
 * Hook to calculate glyph positions using a layout strategy.
 *
 * Memoizes the result based on glyphs, strategy, and config changes.
 *
 * @param glyphs - Normalized glyph data
 * @param strategy - Layout strategy name (default: 'ltr')
 * @param config - Layout configuration or preset name
 * @returns Layout result with positions and bounds
 */
export function useGlyphPositions(
    glyphs: RenderableGlyph[],
    strategy: LayoutStrategyType = 'ltr',
    config?: Partial<LayoutStrategyConfig> | LayoutPreset
): LayoutResult {
    return useMemo(() => {
        const resolvedConfig = resolveLayoutConfig(config);
        const layoutStrategy = getStrategy(strategy);
        return layoutStrategy.calculate(glyphs, resolvedConfig);
    }, [glyphs, strategy, config]);
}
