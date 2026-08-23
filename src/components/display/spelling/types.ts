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
import { GLYPH_CELL_FRACTION } from '../../../db/utils/glyphMetrics';

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
    | 'boustrophedon'    // Alternating direction
    | 'composed-block';  // Writing-system-aware block

/**
 * Configuration for layout strategies.
 */
export interface LayoutStrategyConfig {
    /** Width of each glyph box — the whole drawing canvas, margins included */
    glyphWidth: number;
    /** Height of each glyph box */
    glyphHeight: number;
    /**
     * The CELL — the part of the box a letter reserves — as a fraction of the
     * box on each axis. Letters advance by the cell, so consecutive boxes
     * overlap by their margins and a letter can reach into its neighbour's
     * space. `1` means no margins (boxes abut). Required rather than defaulted
     * here so every hand-built config states which geometry it wants; the
     * app's value is `GLYPH_CELL_FRACTION`, the same number the drawing
     * canvas paints its guide square with. See `utils/cell`.
     */
    cellFraction: number;
    /** Spacing between cells (on top of the cell advance) */
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
    cellFraction: GLYPH_CELL_FRACTION,
    spacing: 2,
    padding: 4,
};

/**
 * Preset layout configurations for common use cases. None sets
 * `cellFraction`: every preset is merged over `DEFAULT_LAYOUT_CONFIG`
 * (`resolveLayoutConfig`), so all of them lay letters out by the app's cell.
 *
 * `card` is the lexicon grid card: a box large enough that the cell (half of
 * it) reads at a glance, no spacing — neighbours touch cell to cell, which is
 * what a written word looks like — and no padding, because the card's glyph
 * band provides the room.
 */
export const LAYOUT_PRESETS = {
    compact: { glyphWidth: 20, glyphHeight: 20, spacing: 2, padding: 4 },
    detailed: { glyphWidth: 40, glyphHeight: 40, spacing: 6, padding: 12 },
    tree: { glyphWidth: 14, glyphHeight: 14, spacing: 1, padding: 2 },
    input: { glyphWidth: 48, glyphHeight: 48, spacing: 8, padding: 16 },
    card: { glyphWidth: 80, glyphHeight: 80, spacing: 0, padding: 0 },
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
    /** Index of the input entry this glyph came from (a grapheme expands to several glyphs) */
    sourceIndex: number;
    /** Structural role copied from the source entry — drives word/line splitting */
    role?: import('../../../db/types').SpellingRole;
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
     * - RenderableGlyph[]: Pre-normalized glyph data
     * - GraphemeComplete[]: Array of graphemes (extracts glyphs)
     * - number[]: Array of glyph IDs (requires glyphMap)
     */
    glyphs: SpellingDisplayEntry[] | Glyph[] | RenderableGlyph[] | GraphemeComplete[] | number[];

    // --- Layout ---

    /** Layout strategy to use (default: 'ltr') */
    strategy?: LayoutStrategyType;

    /** Layout configuration or preset name */
    config?: Partial<LayoutStrategyConfig> | LayoutPreset;

    // --- Display (Legacy mode - deprecated, use viewport/canvas instead) ---

    /**
     * Width of the container (CSS value).
     * @deprecated Use viewport.width for interactive mode
     */
    width?: number | string;

    /**
     * Height of the container (CSS value).
     * @deprecated Use viewport.height for interactive mode
     */
    height?: number | string;

    /** Overflow behavior (default: 'clip') */
    overflow?: OverflowBehavior;

    /**
     * How the static display relates to the space it is given.
     *
     * - `natural` (default): the display is exactly its layout's size.
     * - `shrink`: the display is its natural size when that fits, and is
     *   scaled DOWN — never up — to the parent's width (and, given a bounded
     *   parent, height) when it does not. Pure CSS, no measuring: every word
     *   renders at the same glyph size until one is too long for its box.
     *   Static mode only.
     */
    fit?: 'natural' | 'shrink';

    // --- Simulated Paper Mode ---

    /**
     * Display mode: 'static' (default) or 'interactive'.
     * - static: Simple SVG display without pan/zoom
     * - interactive: Full simulated paper with pan/zoom/viewport control
     */
    mode?: DisplayMode;

    /**
     * Canvas configuration (the internal paper surface).
     * Only used when mode='interactive'.
     * If canvas.width is set, text will wrap at that width using block strategy.
     */
    canvas?: CanvasConfig;

    /**
     * Viewport configuration (the visible window).
     * Only used when mode='interactive'.
     */
    viewport?: ViewportConfig;

    /**
     * Whether to disable all interactions (pan/zoom/drag).
     * Only applies when mode='interactive'.
     * Useful for creating a read-only interactive display.
     */
    disableInteraction?: boolean;

    /**
     * Show zoom/pan controls.
     * Only applies when mode='interactive'.
     * @default true
     */
    showControls?: boolean;

    /**
     * Callback when viewport transform changes.
     * Only applies when mode='interactive'.
     */
    onTransformChange?: (transform: ViewportTransform) => void;

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

    /**
     * If set, treats each glyph box as this many pixels (equivalent to 1em).
     * Use this to make glyphs appear as "1em" (e.g. set to 16 to make 1em=16px).
     * When provided, the internal layout's glyphWidth and glyphHeight will be
     * overridden with this value. The container's font-size is set to this value
     * so any em-based content aligns with the expected size.
     */
    glyphEmPx?: number;

    /**
     * Viewport zoom level for static mode.
     * 1 = 100% (default), 2 = 200%, 0.5 = 50%, etc.
     * Canvas coordinates remain fixed; this only affects display scale.
     */
    zoom?: number;

    /**
     * Writing system settings for composed block layout.
     * When provided with block/composed-block strategy, enables
     * writing-system-aware text flow.
     */
    writingSystem?: import('../../../db/api/types').WritingSystemSettings;
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

// =============================================================================
// VIEWPORT AND CANVAS TYPES (Simulated Paper)
// =============================================================================

/**
 * Viewport transform state for pan/zoom interactions.
 */
export interface ViewportTransform {
    /** Current scale/zoom level (1 = 100%) */
    scale: number;
    /** X offset (pan position) */
    positionX: number;
    /** Y offset (pan position) */
    positionY: number;
}

/**
 * Configuration for the viewport (the visible window into the canvas).
 */
export interface ViewportConfig {
    /** Viewport width in pixels. If not set, uses container width */
    width?: number | string;
    /** Viewport height in pixels. If not set, uses container height */
    height?: number | string;
    /** Initial zoom level (default: 1) */
    initialZoom?: number;
    /** Minimum zoom level (default: 0.1) */
    minZoom?: number;
    /** Maximum zoom level (default: 5) */
    maxZoom?: number;
    /** Initial X position (default: 0) */
    initialX?: number;
    /** Initial Y position (default: 0) */
    initialY?: number;
}

/**
 * Configuration for the internal canvas (the paper surface).
 */
export interface CanvasConfig {
    /** Canvas width in pixels. If set, enables text wrapping at this width */
    width?: number;
    /** Canvas height in pixels. If set, limits vertical space */
    height?: number;
    /** Background color of the canvas (default: transparent) */
    backgroundColor?: string;
    /** Whether to show a paper border/shadow (default: false) */
    showPaperEffect?: boolean;
}

/**
 * Display mode for the component.
 */
export type DisplayMode = 'static' | 'interactive';

/**
 * Ref methods exposed by GlyphSpellingDisplay for programmatic control.
 */
export interface GlyphSpellingDisplayRef {
    /** Reset the viewport to initial state (zoom and position) */
    resetView: () => void;
    /** Fit all content in the viewport (may zoom out/in to fit) */
    fitToView: () => void;
    /** Set zoom level programmatically */
    setZoom: (scale: number) => void;
    /** Pan to specific coordinates */
    panTo: (x: number, y: number) => void;
    /** Get current viewport transform state */
    getTransform: () => ViewportTransform;
    /** Get the content bounds (the actual size of rendered glyphs) */
    getContentBounds: () => LayoutBounds;
    /** Get the SVG element for export purposes */
    getSvgElement: () => SVGSVGElement | null;
}
