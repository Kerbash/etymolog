/**
 * Spelling Display System
 *
 * Unified system for rendering glyph sequences with flexible layout strategies.
 *
 * @module display/spelling
 */

// Main component
export { default as GlyphSpellingDisplay } from './GlyphSpellingDisplay';

// Types
export type {
    // Strategy types
    LayoutStrategyType,
    LayoutStrategyConfig,
    LayoutStrategy,
    LayoutResult,
    LayoutBounds,
    LayoutPreset,
    // Glyph types
    RenderableGlyph,
    PositionedGlyph,
    // Component props
    GlyphSpellingDisplayProps,
    OverflowBehavior,
    // Normalization
    NormalizationContext,
    InputType,
} from './types';

// Constants
export { DEFAULT_LAYOUT_CONFIG, LAYOUT_PRESETS } from './types';

// Strategies
export {
    getStrategy,
    getStrategyNames,
    defaultStrategy,
    ltrStrategy,
    rtlStrategy,
    ttbStrategy,
    bttStrategy,
    blockStrategy,
    spiralStrategy,
    circularStrategy,
    boustrophedonStrategy,
} from './strategies';

// Hooks
export { useNormalizedGlyphs } from './hooks/useNormalizedGlyphs';
export { useGlyphPositions } from './hooks/useGlyphPositions';

// Utils
export {
    normalizeGlyphInput,
    detectInputType,
    emptyBounds,
    calculateBounds,
    mergeBounds,
    padBounds,
    boundsToViewBox,
    resolveLayoutConfig,
} from './utils';
