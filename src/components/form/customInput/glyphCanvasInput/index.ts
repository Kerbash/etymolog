/**
 * GlyphCanvasInput Module
 *
 * A form input component for selecting and arranging glyphs on a canvas.
 * Supports Two-List Architecture for saving IPA fallback characters.
 *
 * @module glyphCanvasInput
 *
 * @example
 * ```tsx
 * import GlyphCanvasInput from './glyphCanvasInput';
 * import type { WritingDirection, SpellingEntry } from './glyphCanvasInput';
 *
 * <GlyphCanvasInput
 *   {...registerField('glyphs', {})}
 *   availableGlyphs={glyphs}
 *   direction="ltr"
 *   onSelectionChange={(ids, hasVirtual, glyphOrder) => {
 *     // glyphOrder is in Two-List Architecture format
 *     // e.g., ["grapheme-123", "ə", "grapheme-456"]
 *   }}
 * />
 * ```
 */

// Main component
export { default } from './GlyphCanvasInput';
export { default as GlyphCanvasInput } from './GlyphCanvasInput';
export type { GlyphCanvasInputProps } from './GlyphCanvasInput';

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
    GlyphCanvasInputRef,
    // Virtual glyph system types
    VirtualGlyph,
    GlyphSource,
    KeyboardMode,
} from './types';

export { DEFAULT_WRITING_DIRECTION, DEFAULT_LAYOUT_CONFIG } from './types';

// Re-export SpellingEntry type from db utils for convenience
export type { SpellingEntry } from '../../../../db/utils/spellingUtils';

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
