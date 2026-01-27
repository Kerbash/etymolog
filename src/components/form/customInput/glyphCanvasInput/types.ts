/**
 * GlyphCanvasInput Type Definitions
 *
 * Type system for the glyph canvas input component that supports:
 * - Directional writing systems (LTR, RTL, TTB, BTT, custom)
 * - Modular insertion/removal strategies
 * - Future cursor-based selection
 *
 * @module glyphCanvasInput/types
 */

import type { CSSProperties, ReactNode } from 'react';
import type { Glyph, GlyphWithUsage } from '../../../../db/types';
import type { registerFieldReturnType } from 'smart-form/types';

// =============================================================================
// WRITING DIRECTION
// =============================================================================

/**
 * Writing direction for glyph layout on canvas.
 *
 * - `ltr`: Left-to-right (e.g., Latin, Greek)
 * - `rtl`: Right-to-left (e.g., Arabic, Hebrew)
 * - `ttb`: Top-to-bottom (e.g., traditional Chinese, Japanese)
 * - `btt`: Bottom-to-top (rare, but supported for flexibility)
 * - `custom`: Uses custom layout callback
 */
export type WritingDirection = 'ltr' | 'rtl' | 'ttb' | 'btt' | 'custom';

/**
 * Default writing direction.
 */
export const DEFAULT_WRITING_DIRECTION: WritingDirection = 'ltr';

// =============================================================================
// CANVAS POSITIONED GLYPH
// =============================================================================

/**
 * Minimal glyph interface needed for canvas rendering.
 */
export interface GlyphForCanvas {
    id: number;
    name: string;
    svg_data: string;
    category?: string | null;
    notes?: string | null;
}

/**
 * A glyph with computed position and dimensions for canvas rendering.
 *
 * @internal Used by layout calculation
 */
export interface CanvasGlyph {
    /** Original glyph data (or compatible object) */
    glyph: GlyphForCanvas;
    /** X position on canvas */
    x: number;
    /** Y position on canvas */
    y: number;
    /** Width of the glyph box */
    width: number;
    /** Height of the glyph box */
    height: number;
    /** Index in the selection array */
    index: number;
}

/**
 * Configuration for canvas layout.
 */
export interface CanvasLayoutConfig {
    /** Writing direction */
    direction: WritingDirection;
    /** Padding between glyphs */
    glyphSpacing: number;
    /** Uniform glyph box width */
    glyphWidth: number;
    /** Uniform glyph box height */
    glyphHeight: number;
    /** Padding around canvas content */
    canvasPadding: number;
    /** Custom layout function (used when direction='custom') */
    customLayout?: (glyphs: Glyph[], config: Omit<CanvasLayoutConfig, 'customLayout'>) => CanvasGlyph[];
}

/**
 * Default layout configuration values.
 */
export const DEFAULT_LAYOUT_CONFIG: Required<Omit<CanvasLayoutConfig, 'customLayout'>> = {
    direction: 'ltr',
    glyphSpacing: 8,
    glyphWidth: 48,
    glyphHeight: 48,
    canvasPadding: 16,
};

// =============================================================================
// INSERTION STRATEGY
// =============================================================================

/**
 * Strategy for inserting/removing glyphs in the selection.
 *
 * This interface allows modular composition of different editing behaviors:
 * - Append-only (default for cursor=null)
 * - Insert-at-cursor
 * - Rule-based insertion (e.g., graphotactic constraints)
 */
export interface InsertionStrategy {
    /** Strategy identifier for debugging */
    readonly name: string;

    /**
     * Insert a glyph into the selection.
     *
     * @param currentSelection - Current array of glyph IDs
     * @param glyphId - ID of glyph to insert
     * @param cursor - Current cursor position (null = append mode)
     * @returns Object with new selection and new cursor position
     */
    insert(
        currentSelection: number[],
        glyphId: number,
        cursor: number | null
    ): InsertionResult;

    /**
     * Remove a glyph from the selection.
     *
     * @param currentSelection - Current array of glyph IDs
     * @param cursor - Current cursor position (null = remove from end)
     * @returns Object with new selection and new cursor position
     */
    remove(
        currentSelection: number[],
        cursor: number | null
    ): InsertionResult;

    /**
     * Clear all glyphs from the selection.
     *
     * @returns Empty selection with reset cursor
     */
    clear(): InsertionResult;
}

/**
 * Result of an insertion/removal operation.
 */
export interface InsertionResult {
    /** New selection array */
    selection: number[];
    /** New cursor position */
    cursor: number | null;
}

// =============================================================================
// KEYBOARD OVERLAY
// =============================================================================

/**
 * Base glyph-like interface for keyboard overlay.
 * Accepts Glyph, GlyphWithUsage, or RenderableGlyph.
 */
export interface GlyphLike {
    id: number;
    name: string;
    svg_data: string;
    category?: string | null;
    notes?: string | null;
}

/**
 * Props for the glyph keyboard overlay component.
 */
export interface GlyphKeyboardOverlayProps {
    /** Available glyphs to select from (any object with id, name, svg_data) */
    availableGlyphs: GlyphLike[];
    /** Called when a glyph is selected */
    onSelect: (glyph: GlyphLike) => void;
    /** Called when remove/backspace is triggered */
    onRemove?: () => void;
    /** Called when clear all is triggered */
    onClear?: () => void;
    /** Whether the keyboard is currently open */
    isOpen: boolean;
    /** Called when keyboard should close */
    onClose: () => void;
    /** Enable search functionality */
    searchable?: boolean;
    /** Fixed height for scrollable keyboard */
    height?: string;
    /** Additional class name */
    className?: string;
    /** Additional styles */
    style?: CSSProperties;
}

// =============================================================================
// CANVAS COMPONENT
// =============================================================================

/**
 * Ref methods exposed by GlyphCanvas.
 */
export interface GlyphCanvasRef {
    /** Reset zoom and pan to initial state */
    resetView: () => void;
    /** Fit all content in view */
    fitToView: () => void;
}

/**
 * Props for the glyph canvas component.
 */
export interface GlyphCanvasProps {
    /** Selected glyph IDs in order */
    selectedGlyphIds: number[];
    /** Map of glyph ID to glyph data (for rendering). Accepts Glyph or any object with svg_data */
    glyphMap: Map<number, Glyph | { id: number; name: string; svg_data: string; category?: string | null; notes?: string | null }>;
    /** Layout configuration */
    layout?: Partial<CanvasLayoutConfig>;
    /** Initial zoom scale */
    initialScale?: number;
    /** Minimum zoom scale */
    minScale?: number;
    /** Maximum zoom scale */
    maxScale?: number;
    /** Show zoom controls */
    showControls?: boolean;
    /** Empty state content */
    emptyStateContent?: ReactNode;
    /** Additional class name */
    className?: string;
    /** Additional styles */
    style?: CSSProperties;
    /** Minimum height for the canvas */
    minHeight?: string;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * Props for the main GlyphCanvasInput component.
 *
 * Extends SmartForm's registerFieldReturnType for form integration.
 */
export interface GlyphCanvasInputProps extends registerFieldReturnType {
    /** Available glyphs to select from (optional for backwards-compat) */
    availableGlyphs?: GlyphWithUsage[];
    /** Default selected glyph IDs */
    defaultValue?: number[];
    /** Writing direction */
    direction?: WritingDirection;
    /** Custom insertion strategy (defaults to append strategy) */
    insertionStrategy?: InsertionStrategy;
    /** Enable keyboard search */
    searchable?: boolean;
    /** Canvas layout configuration */
    canvasLayout?: Partial<CanvasLayoutConfig>;
    /** Keyboard height when open */
    keyboardHeight?: string;
    /** Label text */
    label?: string;
    /** Additional class name */
    className?: string;
    /** Additional styles */
    style?: CSSProperties;
    /** Optional callback when selection changes - non-breaking hook */
    onSelectionChange?: (ids: number[]) => void;
    /** Optional auto-spell preview data provided by parent (displayed by component) */
    autoSpellPreview?: any | null;
    /** Optional handler parent provides to generate/refresh auto-spell preview */
    onRequestAutoSpell?: () => void;
}

/**
 * Ref methods exposed by GlyphCanvasInput.
 */
export interface GlyphCanvasInputRef {
    /** Current selected glyph IDs */
    readonly value: number[];
    /** Reset the canvas view */
    resetCanvasView: () => void;
    /** Fit canvas to content */
    fitCanvasToView: () => void;
    /** Open the keyboard */
    openKeyboard: () => void;
    /** Close the keyboard */
    closeKeyboard: () => void;
    /** Clear all selections */
    clear: () => void;
}
