/**
 * GlyphSpellingDisplay Type Definitions
 *
 * Type system for the unified spelling display component that supports:
 * - Multiple layout strategies (linear, spiral, block, circular, boustrophedon)
 * - Flexible input formats (SpellingDisplayEntry[], Glyph[], GraphemeComplete[], number[])
 * - Virtual IPA glyph rendering
 *
 * @module display/spelling/types
 */

import type { CSSProperties, ReactNode } from 'react';
import type { Glyph, GraphemeComplete, SpellingDisplayEntry } from '../../../db/types';

// =============================================================================
// LAYOUT STRATEGY TYPES
// =============================================================================

/**
 * Layout strategy identifier.
 */
export type LayoutStrategyType =
    | 'ltr'              // Left-to-right
    | 'rtl'              // Right-to-left
    | 'ttb'              // Top-to-bottom
    | 'btt'              // Bottom-to-top
    | 'spiral'           // Outward spiral
    | 'block'            // Multi-row wrapping
    | 'circular'         // Ring layout
    | 'boustrophedon';   // Alternating direction

/**
 * Configuration for layout strategies.
 */
export interface LayoutStrategyConfig {
    /** Width of each glyph box */
    glyphWidth: number;
    /** Height of each glyph box */
    glyphHeight: number;
    /** Spacing between glyphs */
    spacing: number;
    /** Padding around the entire layout */
    padding: number;
    /** Maximum width for block layout wrapping */
    maxWidth?: number;
    /** Maximum height for vertical block layout wrapping */
    maxHeight?: number;
}

/**
 * Default layout configuration values.
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutStrategyConfig = {
    glyphWidth: 20,
    glyphHeight: 20,
    spacing: 2,
    padding: 4,
};

/**
 * Preset layout configurations for common use cases.
 */
export const LAYOUT_PRESETS = {
    compact: { glyphWidth: 20, glyphHeight: 20, spacing: 2, padding: 4 },
    detailed: { glyphWidth: 40, glyphHeight: 40, spacing: 6, padding: 12 },
    tree: { glyphWidth: 14, glyphHeight: 14, spacing: 1, padding: 2 },
    input: { glyphWidth: 48, glyphHeight: 48, spacing: 8, padding: 16 },
} as const;

export type LayoutPreset = keyof typeof LAYOUT_PRESETS;

// =============================================================================
// RENDERABLE GLYPH TYPES
// =============================================================================

/**
 * Normalized glyph data ready for rendering.
 * This is the common format that all input types are converted to.
 */
export interface RenderableGlyph {
    /** Unique identifier (negative for virtual IPA glyphs) */
    id: number;
    /** Display name */
    name: string;
    /** SVG data for rendering */
    svg_data: string;
    /** Whether this is a virtual IPA fallback glyph */
    isVirtual: boolean;
    /** IPA character (only for virtual glyphs) */
    ipaCharacter?: string;
    /** Original index in the input array */
    sourceIndex: number;
}

/**
 * A glyph with computed position and dimensions for canvas rendering.
 */
export interface PositionedGlyph {
    /** Normalized glyph data */
    glyph: RenderableGlyph;
    /** X position on canvas */
    x: number;
    /** Y position on canvas */
    y: number;
    /** Width of the glyph box */
    width: number;
    /** Height of the glyph box */
    height: number;
    /** Index in the positioned array */
    index: number;
    /** Optional rotation in degrees (for spiral/circular layouts) */
    rotation?: number;
}

/**
 * Bounding box for the layout result.
 */
export interface LayoutBounds {
    /** Total width including padding */
    width: number;
    /** Total height including padding */
    height: number;
    /** Minimum X coordinate */
    minX: number;
    /** Minimum Y coordinate */
    minY: number;
    /** Maximum X coordinate */
    maxX: number;
    /** Maximum Y coordinate */
    maxY: number;
}

/**
 * Result of a layout calculation.
 */
export interface LayoutResult {
    /** Positioned glyphs with coordinates */
    positions: PositionedGlyph[];
    /** Bounding box of the layout */
    bounds: LayoutBounds;
}

/**
 * Interface for layout strategy implementations.
 */
export interface LayoutStrategy {
    /** Strategy name for debugging */
    readonly name: string;
    /**
     * Calculate positions for all glyphs.
     *
     * @param glyphs - Normalized glyph data
     * @param config - Layout configuration
     * @returns Layout result with positions and bounds
     */
    calculate(glyphs: RenderableGlyph[], config: LayoutStrategyConfig): LayoutResult;
}

// =============================================================================
// COMPONENT PROPS
// =============================================================================

/**
 * Overflow behavior for the display component.
 */
export type OverflowBehavior = 'clip' | 'scroll' | 'visible';

/**
 * Props for the GlyphSpellingDisplay component.
 */
export interface GlyphSpellingDisplayProps {
    // --- Data Input (flexible formats) ---

    /**
     * Glyphs to display. Accepts multiple formats:
     * - SpellingDisplayEntry[]: Full spelling with grapheme/IPA entries
     * - Glyph[]: Array of glyph objects
     * - GraphemeComplete[]: Array of graphemes (extracts glyphs)
     * - number[]: Array of glyph IDs (requires glyphMap)
     */
    glyphs: SpellingDisplayEntry[] | Glyph[] | GraphemeComplete[] | number[];

    // --- Layout ---

    /** Layout strategy to use (default: 'ltr') */
    strategy?: LayoutStrategyType;

    /** Layout configuration or preset name */
    config?: Partial<LayoutStrategyConfig> | LayoutPreset;

    // --- Display ---

    /** Width of the container (CSS value) */
    width?: number | string;

    /** Height of the container (CSS value) */
    height?: number | string;

    /** Overflow behavior (default: 'clip') */
    overflow?: OverflowBehavior;

    // --- Data Dependencies ---

    /**
     * Map of glyph ID to Glyph data.
     * Required when glyphs prop is number[].
     */
    glyphMap?: Map<number, Glyph | RenderableGlyph>;

    /**
     * Map of grapheme ID to GraphemeComplete data.
     * Used to resolve grapheme references in SpellingDisplayEntry[].
     */
    graphemeMap?: Map<number, GraphemeComplete>;

    // --- Rendering ---

    /** Content to show when there are no glyphs */
    emptyContent?: ReactNode;

    /** Whether to show distinct styling for virtual IPA glyphs */
    showVirtualGlyphStyling?: boolean;

    /** Additional class name */
    className?: string;

    /** Additional styles */
    style?: CSSProperties;
}

// =============================================================================
// INPUT NORMALIZATION TYPES
// =============================================================================

/**
 * Context for normalizing input data.
 */
export interface NormalizationContext {
    /** Map of glyph ID to Glyph data */
    glyphMap?: Map<number, Glyph | RenderableGlyph>;
    /** Map of grapheme ID to GraphemeComplete data */
    graphemeMap?: Map<number, GraphemeComplete>;
}

/**
 * Type guard result for input type detection.
 */
export type InputType = 'spelling-display' | 'glyphs' | 'graphemes' | 'ids';
