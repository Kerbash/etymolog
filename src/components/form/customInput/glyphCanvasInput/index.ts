/**
 * GlyphCanvasInput Module
 *
 * A form input component for selecting and arranging glyphs on a canvas.
 *
 * @module glyphCanvasInput
 *
 * @example
 * ```tsx
 * import GlyphCanvasInput from './glyphCanvasInput';
 * import type { WritingDirection } from './glyphCanvasInput';
 *
 * <GlyphCanvasInput
 *   {...registerField('glyphs', {})}
 *   availableGlyphs={glyphs}
 *   direction="ltr"
 * />
 * ```
 */

// Main component
export { default } from './GlyphCanvasInput';
export { default as GlyphCanvasInput } from './GlyphCanvasInput';

// Sub-components
export { default as GlyphCanvas } from './GlyphCanvas';
export { default as GlyphKeyboardOverlay } from './GlyphKeyboardOverlay';

// Types
export type {
    WritingDirection,
    CanvasGlyph,
    CanvasLayoutConfig,
    InsertionStrategy,
    InsertionResult,
    GlyphKeyboardOverlayProps,
    GlyphCanvasRef,
    GlyphCanvasProps,
    GlyphCanvasInputProps,
    GlyphCanvasInputRef,
    // Virtual glyph system types
    VirtualGlyph,
    GlyphSource,
    KeyboardMode,
} from './types';

export { DEFAULT_WRITING_DIRECTION, DEFAULT_LAYOUT_CONFIG } from './types';

// Strategies
export {
    createAppendStrategy,
    createPrependStrategy,
    createCursorStrategy,
    getDefaultStrategyForDirection,
    defaultInsertionStrategy,
} from './strategies';

// Utils
export {
    calculateGlyphLayout,
    calculateBounds,
    mergeLayoutConfig,
    // Virtual glyph utilities
    generateVirtualGlyphId,
    generateIpaSvg,
    createVirtualGlyph,
    createVirtualGlyphs,
    isVirtualGlyphId,
    isVirtualGlyph,
} from './utils';
