/**
 * GlyphCanvasInput Type Definitions
 *
 * Type system for the glyph canvas input component that supports:
 * - Directional writing systems (LTR, RTL, TTB, BTT, custom)
 * - Modular insertion/removal strategies
 * - Virtual IPA glyph fallback system
 * - Future cursor-based selection
 *
 * @module glyphCanvasInput/types
 */

import type { CSSProperties, ReactNode } from 'react';
import type { Glyph, GlyphWithUsage } from '../../../../db/types';
import type { SpellingEntry } from '../../../../db/utils/spellingUtils';
import type { registerFieldReturnType } from 'smart-form/types';

// =============================================================================
// VIRTUAL GLYPH SYSTEM
// =============================================================================

/**
 * Discriminator for glyph source type.
 * - `real`: A glyph from the database
 * - `virtual-ipa`: A virtual glyph generated for IPA fallback
 */
export type GlyphSource = 'real' | 'virtual-ipa';

/**
 * Virtual glyph for IPA character fallback.
 * Used when no real glyph exists for an IPA character during auto-spell.
 *
 * Virtual glyphs have negative IDs (generated from hash) to distinguish
 * them from real database glyphs which have positive IDs.
 */
export interface VirtualGlyph {
    /** Negative ID generated from IPA character hash */
    id: number;
    /** The IPA character this virtual glyph represents */
    ipaCharacter: string;
    /** Display name (typically the IPA character itself) */
    name: string;
    /** Generated SVG data showing the IPA character */
    svg_data: string;
    /** Always 'IPA Fallback' for virtual glyphs */
    category: string;
    /** Optional notes/description */
    notes: string | null;
    /** Source discriminator - always 'virtual-ipa' */
    source: 'virtual-ipa';
}

/**
 * Keyboard mode for glyph selection.
 * - `glyphs`: Show available glyphs from the database
 * - `ipa`: Show IPA character keyboard for virtual glyph creation
 */
export type KeyboardMode = 'glyphs' | 'ipa';

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
    /** Enable IPA keyboard mode toggle */
    enableIpaMode?: boolean;
    /** Called when an IPA character is selected (creates virtual glyph) */
    onIpaSelect?: (ipaChar: string, virtualGlyph: VirtualGlyph) => void;
    /**
     * Block-script boundary. When provided (the script's block scheme is on),
     * a "·" Boundary key is shown and the physical `.` key inserts a boundary;
     * both call this. Omit to hide both.
     */
    onBoundary?: () => void;
    /**
     * Block-script join. When provided (the script's block scheme is on), a
     * "‿" Join key is shown right after the Boundary key; it inserts the
     * undertie that keeps the signs on both sides in one block. No physical
     * key (nothing on a keyboard means ‿). Omit to hide it.
     */
    onJoin?: () => void;
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
    /**
     * Block-script outlines (only when the script's block scheme is on). Each
     * groups the tiles at `entryIndices` — positions in `selectedGlyphIds` —
     * with a thin coloured outline and a caption.
     */
    blocks?: CanvasBlockOutline[];
    /** Called by a block's caption button / outline with that block's `key`. */
    onOpenBlock?: (key: number) => void;
    /**
     * Draw the `.` boundary entry and the `‿` join entry as slim tiles
     * instead of text glyphs. On only while the block scheme is on (off, they
     * render as they always did — the same as the display does with the
     * scheme off).
     */
    showBoundaries?: boolean;
    /** Positions (in `selectedGlyphIds`) whose entry carries a pinned variant. */
    pinnedIndices?: ReadonlySet<number>;
    /** Per-position glyph replacing the id's own (a pinned entry shows its pinned form). */
    glyphOverrides?: ReadonlyMap<number, GlyphForCanvas>;
    /**
     * The insertion point, as a position in `selectedGlyphIds` (`null` = the
     * end). Only drawn, and only movable, when `onCursorMove` is given.
     */
    cursor?: number | null;
    /**
     * Makes the canvas focusable: the arrow keys (following the writing
     * direction), Home and End move the insertion point and report the new
     * one here. Omit it for a canvas that only displays.
     */
    onCursorMove?: (cursor: number | null) => void;
    /** Draw the caret even while the canvas is not focused (e.g. the glyph keyboard is open). */
    showCursor?: boolean;
}

/** One block outline on the canvas (see `GlyphCanvasProps.blocks`). */
export interface CanvasBlockOutline {
    /** Stable id for the block (its first entry's position). */
    key: number;
    /** Positions in `selectedGlyphIds`, contiguous, in order. */
    entryIndices: number[];
    /** Caption text (the template name). */
    label: string;
    /** Outline colour — a CSS colour or `var(--token)`. */
    colour: string;
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
    /** Auto-spell toggle (the wand) shown in the header. Omit to hide it. */
    autoSpell?: AutoSpellToggle;
    /**
     * When set, the spelling belongs to the software (auto-spell is on): the
     * canvas shows it read-only, greyed, and every editing control is disabled.
     */
    locked?: LockedSpelling | null;
}

/**
 * The auto-spell on/off switch. It IS the word's stored `auto_spell` boolean:
 * the wand is a toggle, not a one-shot "generate" button.
 */
export interface AutoSpellToggle {
    enabled: boolean;
    onToggle: (next: boolean) => void;
    /** Why the toggle cannot be used right now (e.g. an external word); disables it. */
    disabledReason?: string | null;
}

/**
 * A spelling the software owns. `glyphOrder` is what the canvas must show;
 * `null` means "nothing to derive yet" and the current spelling stays as is
 * (a word with no pronunciation keeps its spelling, exactly as on save).
 */
export interface LockedSpelling {
    glyphOrder: SpellingEntry[] | null;
    /** Visible status line explaining who owns the spelling and how to take it back. */
    message: string;
    /** Hover text on the greyed canvas and controls. */
    tooltip: string;
}

/**
 * Ref methods exposed by GlyphCanvasInput.
 */
/**
 * Options accepted by the imperative `setValue` handle.
 *
 * Mirrors SmartForm's own `SetValueOptions` (see
 * `smart-form/input/basic/basicSelectListInput`) so a parent form can drive the
 * canvas the same way it drives a built-in input.
 */
export interface SetValueOptions {
    /** Whether to run validation after setting the value. Default: true */
    doValidation?: boolean;
    /** Whether to update fieldState (isEmpty, isChanged, isInputValid). Default: true */
    toggleFieldState?: boolean;
    /** Whether to mark the field as touched. Default: false */
    toggleTouch?: boolean;
}

export interface GlyphCanvasInputRef {
    /** Current selected glyph IDs */
    readonly value: number[];
    /**
     * Current spelling in glyph_order format (Two-List Architecture):
     * `["grapheme-123", "ə", ...]`. Real graphemes are referenced, IPA
     * fallbacks are stored as the bare character.
     */
    readonly glyphOrder: SpellingEntry[];
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
    /** Replace the selection from a number[] value (SmartForm setValue pattern). */
    setValue: (val: number[], options?: SetValueOptions) => void;
    /**
     * Replace the whole spelling from glyph_order format. Used by the
     * "Build spelling from ancestors" action (Phase 4, UC-B2) to drop a
     * compound word's concatenated ancestor spellings onto the canvas.
     */
    setGlyphOrder: (glyphOrder: SpellingEntry[]) => void;
}
