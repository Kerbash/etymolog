/**
 * GlyphCanvasInput Component
 *
 * A form input that combines a pannable/zoomable canvas for displaying
 * selected glyphs with a bottom-pinned keyboard for glyph selection.
 *
 * Features:
 * - Pannable/zoomable canvas for viewing selected glyphs
 * - Bottom-pinned keyboard overlay for glyph selection
 * - Configurable writing direction (LTR, RTL, TTB, BTT, custom)
 * - Modular insertion/removal strategies
 * - SmartForm integration via registerFieldReturnType
 *
 * Additional SmartForm props supported by this component:
 * - `registerSmartFieldProps` / `fieldState` (from `registerField`) - required to integrate
 * - `availableGlyphs` (optional) - alias for `availableGlyphs` prop (keeps naming explicit)
 * - `onSelectionChange?: (ids: number[]) => void` - called whenever the selection changes
 * - `autoSpell?: AutoSpellToggle` - the wand: an on/off toggle for the word's auto-spell flag
 * - `locked?: LockedSpelling | null` - the spelling is software-owned; shown read-only
 *
 * Block script (only while the provider's block scheme is enabled): block
 * outlines on the tiles, a composed preview strip, `.` boundary entries, and
 * a per-block popover that pins variants (`grapheme-12@34`) and splits/joins
 * blocks. See the README's "Blocks" section.
 *
 * Value contract with SmartForm:
 * - The component exposes `registerSmartFieldProps.ref.current.value` as the current
 *   array of selected glyph IDs (number[]). SmartForm reads this value synchronously on submit.
 * - The component also renders a hidden input whose value is the spelling in glyph_order
 *   format (JSON of SpellingEntry[], pins included) for standard HTML form submission.
 *
 * Usage example (SmartForm):
 * ```tsx
 * const glyphCanvasField = registerField('glyphSequence', { defaultValue: [] });
 *
 * <GlyphCanvasInput
 *   {...glyphCanvasField}
 *   availableGlyphs={glyphs}
 *   onSelectionChange={(ids) => setSpellingIds(ids)}
 *   autoSpell={{ enabled, onToggle: setEnabled }}
 *   locked={enabled ? { glyphOrder: derived, message, tooltip } : null}
 * />
 * ```
 */

'use client';

import {
    forwardRef,
    useCallback,
    useContext,
    useEffect,
    useId,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import classNames from 'classnames';

import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton';

import type {
    GlyphCanvasInputProps as _OrigProps,
    GlyphCanvasInputRef,
    GlyphCanvasRef,
    InsertionStrategy,
    SetValueOptions,
    VirtualGlyph,
} from './types';
import type {Glyph, GlyphWithUsage, GraphemeComplete, VariantGroup} from '../../../../db/types';
import {
    createGraphemeEntry,
    parseGlyphOrder,
    serializeGlyphOrder,
    type SpellingEntry,
} from '../../../../db/utils/spellingUtils';
import {createCursorStrategy} from './strategies';
import {GlyphCanvas} from './GlyphCanvas';
import {GlyphKeyboardOverlay} from './GlyphKeyboardOverlay';
import {BlockPreviewStrip} from './BlockPreviewStrip';
import {BlockPopover} from './BlockPopover';
import {
    buildRenderableMap,
    normalizeToRenderable,
    isVirtualGlyphId,
    createVirtualGlyph,
    createBoundaryGlyph,
    createJoinGlyph,
} from './utils';
import {
    insertAt,
    insertWithStrategy,
    removeAt,
    removeWithStrategy,
    selectionFromIds,
    setPinAt,
    type CanvasSelection,
} from './utils/selectionModel';
import {computeCanvasBlocks, describeBlockSlots, glyphOrderToDisplayEntries} from './utils/blockUtils';
import {useEditedSinceMount} from '../useEditedSinceMount';
import {useOptionalBlockScheme, useOptionalGraphemeMap} from '../../../../db/context/useOptionalBlockScheme';
import {EtymologContext} from '../../../../db/context/etymologContext';
import {variantSvg} from '../../../../blocks/compose';

import styles from './GlyphCanvasInput.module.scss';
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";

/** The `.` boundary entry's virtual glyph — its id is a pure function of the character. */
const BOUNDARY_GLYPH = createBoundaryGlyph();
/** The `‿` join entry's virtual glyph — likewise a pure function of the character. */
const JOIN_GLYPH = createJoinGlyph();

/** Stable empty list for "no provider" (a fresh `[]` would break memos). */
const NO_VARIANT_GROUPS: VariantGroup[] = [];

// Augment/extend the imported props type to include the optional helpers we need here
// This keeps backwards compatibility if the upstream types don't include them yet.
// Use Omit to override the restrictive availableGlyphs type and onSelectionChange signature from the base interface
export interface GlyphCanvasInputProps extends Omit<_OrigProps, 'availableGlyphs' | 'onSelectionChange'> {
    /** Optional explicit available glyphs/graphemes prop (supports Glyph, GlyphWithUsage, or GraphemeComplete) */
    availableGlyphs?: (Glyph | GlyphWithUsage | GraphemeComplete)[];
    /**
     * Called whenever the selection changes.
     * @param ids - Array of grapheme IDs (for backward compatibility)
     * @param hasVirtualGlyphs - Whether selection contains IPA fallbacks
     * @param glyphOrder - The glyph_order format array (for saving with Two-List Architecture)
     */
    onSelectionChange?: (ids: number[], hasVirtualGlyphs: boolean, glyphOrder?: SpellingEntry[]) => void;
    /** Enable IPA keyboard mode for virtual glyph creation */
    enableIpaMode?: boolean;
    /** Initial virtual glyphs from auto-spell (merged with component's internal map) */
    initialVirtualGlyphs?: Map<number, VirtualGlyph>;
    /**
     * Initial glyph_order value (Two-List Architecture format).
     * If provided, overrides defaultValue.
     * Format: ["grapheme-123", "ə", "grapheme-456", ...]
     */
    initialGlyphOrder?: SpellingEntry[];
}

/**
 * `glyph_order` → the canvas selection (ids + pins) and the virtual glyphs its
 * IPA entries need. The ONE parser for both the initial value and every later
 * `setGlyphOrder` / auto-spell write, so a pinned entry (`grapheme-12@34`)
 * survives the round trip everywhere.
 */
function parseOrderToSelection(order: SpellingEntry[]): {
    selection: CanvasSelection;
    virtuals: Map<number, VirtualGlyph>;
} {
    const ids: number[] = [];
    const pins: (number | null)[] = [];
    const virtuals = new Map<number, VirtualGlyph>();

    for (const entry of parseGlyphOrder(order)) {
        if (entry.type === 'grapheme' && entry.graphemeId) {
            ids.push(entry.graphemeId);
            pins.push(entry.variantId ?? null);
        } else if (entry.type === 'ipa' && entry.ipaCharacter) {
            const virtualGlyph = createVirtualGlyph(entry.ipaCharacter);
            virtuals.set(virtualGlyph.id, virtualGlyph);
            ids.push(virtualGlyph.id);
            pins.push(null);
        }
    }
    return {selection: {ids, pins}, virtuals};
}

/**
 * GlyphCanvasInput
 *
 * A form input component that displays selected glyphs on a pannable canvas
 * and provides a keyboard overlay for glyph selection.
 */
const GlyphCanvasInput = forwardRef<GlyphCanvasInputRef, GlyphCanvasInputProps>(
    function GlyphCanvasInput(
        {
            registerSmartFieldProps,
            fieldState,
            availableGlyphs = [],
            defaultValue = [],
            direction = 'ltr',
            insertionStrategy,
            searchable = true,
            canvasLayout,
            keyboardHeight = '260px',
            label = 'Glyph Sequence',
            className,
            style,
            onSelectionChange,
            autoSpell,
            locked = null,
            enableIpaMode = false,
            initialVirtualGlyphs,
            initialGlyphOrder,
        },
        _
    ) {
        const idPrefix = useId();
        const fieldStateRef = useRef(fieldState);
        fieldStateRef.current = fieldState;

        const canvasRef = useRef<GlyphCanvasRef>(null);

        // Parse initialGlyphOrder if provided to get initial state
        const {initialSelection, initialVirtualsFromGlyphOrder} = useMemo(() => {
            if (!initialGlyphOrder || initialGlyphOrder.length === 0) {
                return {
                    initialSelection: selectionFromIds(Array.isArray(defaultValue) ? defaultValue : defaultValue ?? []),
                    initialVirtualsFromGlyphOrder: new Map<number, VirtualGlyph>(),
                };
            }
            const {selection, virtuals} = parseOrderToSelection(initialGlyphOrder);
            return {initialSelection: selection, initialVirtualsFromGlyphOrder: virtuals};
        }, [initialGlyphOrder, defaultValue]);

        // State - the entry list (grapheme IDs and virtual glyph IDs) plus the
        // pinned variant of each entry, aligned by position (see
        // `utils/selectionModel.ts`). ONE state, so ids and pins can never be
        // committed out of step.
        const [selection, setSelection] = useState<CanvasSelection>(initialSelection);
        const selectedIds = selection.ids;

        // Virtual glyph map - stores virtual glyphs created from IPA keyboard or loaded from glyph_order
        const [virtualGlyphMap, setVirtualGlyphMap] = useState<Map<number, VirtualGlyph>>(() => {
            const merged = new Map<number, VirtualGlyph>();
            // First add from glyph_order parsing
            for (const [id, vg] of initialVirtualsFromGlyphOrder) {
                merged.set(id, vg);
            }
            // Then add from initialVirtualGlyphs prop (auto-spell)
            if (initialVirtualGlyphs) {
                for (const [id, vg] of initialVirtualGlyphs) {
                    merged.set(id, vg);
                }
            }
            return merged;
        });

        // Refs for stable access in useImperativeHandle and useEffect (prevents infinite loops)
        const selectedIdsRef = useRef(selectedIds);
        selectedIdsRef.current = selectedIds;

        const isLocked = !!locked;

        const onSelectionChangeRef = useRef(onSelectionChange);
        onSelectionChangeRef.current = onSelectionChange;
        const [cursor, setCursor] = useState<number | null>(null);
        const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

        // Get the active insertion strategy
        // The CURSOR strategy by default: with no cursor it appends exactly like
        // the append strategy, and once the arrow keys move the insertion
        // point (see GlyphCanvas `onCursorMove`), keys and the boundary land
        // there and Backspace removes before it.
        const strategy: InsertionStrategy = useMemo(() => {
            return insertionStrategy ?? CURSOR_STRATEGY;
        }, [insertionStrategy]);

        // Build glyph lookup map - normalizes GraphemeComplete, Glyph, and GlyphWithUsage
        const baseGlyphMap = useMemo(() => {
            return buildRenderableMap(availableGlyphs as (Glyph | GlyphWithUsage | GraphemeComplete)[]);
        }, [availableGlyphs]);

        // Merged glyph map including virtual glyphs for canvas rendering
        const glyphMap = useMemo(() => {
            const merged = new Map(baseGlyphMap);

            // Add initial virtual glyphs from auto-spell (if provided)
            if (initialVirtualGlyphs) {
                for (const [id, virtualGlyph] of initialVirtualGlyphs) {
                    merged.set(id, {
                        id: virtualGlyph.id,
                        name: virtualGlyph.name,
                        svg_data: virtualGlyph.svg_data,
                        category: virtualGlyph.category,
                        notes: virtualGlyph.notes,
                    });
                }
            }

            // Add component's internal virtual glyphs (from IPA keyboard)
            for (const [id, virtualGlyph] of virtualGlyphMap) {
                merged.set(id, {
                    id: virtualGlyph.id,
                    name: virtualGlyph.name,
                    svg_data: virtualGlyph.svg_data,
                    category: virtualGlyph.category,
                    notes: virtualGlyph.notes,
                });
            }
            return merged;
        }, [baseGlyphMap, virtualGlyphMap, initialVirtualGlyphs]);

        // Block script: on only inside a provider whose scheme is enabled.
        // Values are read out of the context objects first (plan P8).
        const blockScheme = useOptionalBlockScheme();
        const contextGraphemeMap = useOptionalGraphemeMap();
        const blocksOn = blockScheme !== null && blockScheme.enabled && contextGraphemeMap !== null;
        const etymologContext = useContext(EtymologContext);
        const variantGroups = etymologContext?.data.variantGroups ?? NO_VARIANT_GROUPS;

        // Check if selection contains IPA fallbacks (from either source). A
        // `.` boundary or a `‿` join is not one while blocks are on: each
        // is drawn as a slim tile, not a dashed IPA tile, so the IPA notice
        // would lie.
        const hasVirtualGlyphs = useMemo(() => {
            return selectedIds.some(id =>
                !(blocksOn && (id === BOUNDARY_GLYPH.id || id === JOIN_GLYPH.id)) && (
                    isVirtualGlyphId(id) ||
                    virtualGlyphMap.has(id) ||
                    initialVirtualGlyphs?.has(id)
                )
            );
        }, [selectedIds, virtualGlyphMap, initialVirtualGlyphs, blocksOn]);

        // Convert availableGlyphs to RenderableGlyph[] for keyboard overlay
        const renderableGlyphs = useMemo(() => {
            return (availableGlyphs as (Glyph | GlyphWithUsage | GraphemeComplete)[]).map(normalizeToRenderable);
        }, [availableGlyphs]);

        // Merge canvas layout with direction
        const mergedCanvasLayout = useMemo(() => ({
            direction,
            ...canvasLayout,
        }), [direction, canvasLayout]);

        /**
         * Replace the whole selection from glyph_order format. Shared by the
         * imperative `setGlyphOrder` handle and the auto-spell lock, so both
         * register IPA fallbacks as virtual glyphs the same way.
         */
        const applyGlyphOrder = useCallback((order: SpellingEntry[]): CanvasSelection => {
            const {selection: next, virtuals} = parseOrderToSelection(order);

            setSelection(next);
            setCursor(null);
            setVirtualGlyphMap(prev => {
                const merged = new Map(prev);
                for (const [id, vg] of virtuals) {
                    merged.set(id, vg);
                }
                return merged;
            });
            return next;
        }, []);

        /**
         * The selection the auto-spell lock last wrote (by identity). A derived
         * spelling is not a user edit: when the current selection IS this
         * array, the change effect reports it (callbacks, hidden input) but
         * does not mark the field touched/changed — otherwise a prefilled
         * pronunciation (the generator's "Edit & add") would make an untouched
         * create form dirty and arm the leave-page guard.
         */
        const lockedSelectionRef = useRef<CanvasSelection | null>(null);

        // Build glyph_order format from selected IDs and virtual glyph map
        // This is the format used by Two-List Architecture for persistence
        const buildGlyphOrder = useCallback((): SpellingEntry[] => {
            return selection.ids.map((id, index) => {
                const virtualGlyph = virtualGlyphMap.get(id) || initialVirtualGlyphs?.get(id) || initialVirtualsFromGlyphOrder.get(id);
                if (virtualGlyph && virtualGlyph.ipaCharacter) {
                    return virtualGlyph.ipaCharacter;
                }
                if (isVirtualGlyphId(id)) {
                    // A negative id with no virtual-glyph record would serialise as
                    // "grapheme--N" and later render as literal text. Fail loudly.
                    throw new Error(`Virtual glyph ${id} has no IPA character; cannot build spelling`);
                }
                // A pinned variant travels with its entry: `grapheme-12@34`.
                return createGraphemeEntry(id, selection.pins[index]);
            });
        }, [selection, virtualGlyphMap, initialVirtualGlyphs, initialVirtualsFromGlyphOrder]);

        // Ref for buildGlyphOrder to prevent infinite loops
        const buildGlyphOrderRef = useRef(buildGlyphOrder);

        // The hidden input's value: the spelling in glyph_order format (JSON
        // of SpellingEntry[]), pins included. Rendered as the input's VALUE
        // rather than written into the DOM from the change effect: the input
        // is React-controlled, so the next re-render (the field-state updates
        // that same effect triggers) reset any DOM write back to the prop —
        // which used to be the bare id list, unable to carry a pin or tell a
        // grapheme from an IPA character. An unknown virtual id (reported on
        // the field by the change effect) leaves it empty.
        const hiddenValue = useMemo(() => {
            try {
                return serializeGlyphOrder(buildGlyphOrder());
            } catch {
                return '';
            }
        }, [buildGlyphOrder]);
        buildGlyphOrderRef.current = buildGlyphOrder;

        // Expose value via useImperativeHandle
        // Use ref for value getter to prevent handle recreation when state changes
        useImperativeHandle(registerSmartFieldProps.ref, () => ({
            get value(): number[] {
                return selectedIdsRef.current;
            },
            /** Get the glyph_order format for saving (Two-List Architecture) */
            get glyphOrder(): SpellingEntry[] {
                return buildGlyphOrderRef.current();
            },
            resetCanvasView: () => canvasRef.current?.resetView(),
            fitCanvasToView: () => canvasRef.current?.fitToView(),
            openKeyboard: () => setIsKeyboardOpen(true),
            closeKeyboard: () => setIsKeyboardOpen(false),
            clear: () => {
                const result = strategy.clear();
                setSelection(selectionFromIds(result.selection));
                setCursor(result.cursor);
                setVirtualGlyphMap(new Map()); // Also clear virtual glyphs
            },
            // Backwards-compatible setValue pattern. A number[] cannot carry
            // pins: every entry set this way is unpinned.
            setValue: (val: number[], options?: SetValueOptions) => {
                setSelection(selectionFromIds(Array.isArray(val) ? val : []));
                if (options?.doValidation !== false) {
                    fieldStateRef.current.isTouched.setIsTouched(true);
                    fieldStateRef.current.isChanged.setIsChanged(true);
                    fieldStateRef.current.isEmpty.setIsEmpty((val ?? []).length === 0);
                }
            },
            /** Set value from glyph_order format (Two-List Architecture) */
            setGlyphOrder: (glyphOrder: SpellingEntry[]) => { applyGlyphOrder(glyphOrder); },
        }), [strategy, applyGlyphOrder]);

        /**
         * Auto-spell lock: keep the canvas showing the software's spelling.
         * Written only when it DIFFERS from what is on the canvas, so opening
         * an auto-spelled word whose stored spelling is already current does
         * not count as an edit (the form must not go dirty on mount).
         */
        const lockedOrderKey = locked?.glyphOrder ? serializeGlyphOrder(locked.glyphOrder) : null;
        useEffect(() => {
            if (!locked?.glyphOrder) return;
            let current: string | null = null;
            try {
                current = serializeGlyphOrder(buildGlyphOrderRef.current());
            } catch {
                current = null;
            }
            if (current !== lockedOrderKey) {
                lockedSelectionRef.current = applyGlyphOrder(locked.glyphOrder);
            }
            // `lockedOrderKey` is the content identity of `locked.glyphOrder`.
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [lockedOrderKey, applyGlyphOrder]);

        useEffect(() => {
            if (isLocked) setIsKeyboardOpen(false);
        }, [isLocked]);

        // Update parent field state when selection changes
        // Use ref for callback to prevent re-runs when callback reference changes
        //
        // The guard is an identity comparison against the selection this input
        // mounted with, NOT a "first effect run" latch: StrictMode runs every
        // mount effect twice while keeping refs, so a latch let the second run
        // through and marked the untouched form changed. See
        // `useEditedSinceMount`.
        //
        // Keyed on the whole `selection` (ids AND pins): pinning a variant
        // changes no id but is an edit all the same.
        const selectionEdited = useEditedSinceMount(selection);
        useEffect(() => {
            if (!selectionEdited) return;
            const selectedIds = selection.ids;

            if (selection !== lockedSelectionRef.current) {
                fieldStateRef.current.isTouched.setIsTouched(true);
                fieldStateRef.current.isChanged.setIsChanged(true);
            }
            fieldStateRef.current.isEmpty.setIsEmpty(selectedIds.length === 0);
            fieldStateRef.current._setValidation(null);

            // Build glyph_order for saving. A negative id with no virtual-glyph
            // record is a programming error upstream; report it on the field
            // (there is no error boundary) instead of throwing out of an effect.
            let glyphOrder: SpellingEntry[];
            try {
                glyphOrder = buildGlyphOrderRef.current();
            } catch (error) {
                fieldStateRef.current._setValidation({
                    type: 'error',
                    message: error instanceof Error ? error.message : 'The spelling contains an unknown glyph',
                });
                return;
            }

            // Notify parent via callback using ref (prevents infinite loops)
            // Include hasVirtualGlyphs flag and glyph_order so parent can save properly
            try {
                const containsVirtual = selectedIds.some(id => isVirtualGlyphId(id));
                onSelectionChangeRef.current?.(selectedIds.slice(), containsVirtual, glyphOrder);
            } catch (e) {
                // swallow - callback should not break input
                console.error('onSelectionChange threw', e);
            }
        }, [selection, selectionEdited]);

        // Handle glyph selection from keyboard (both real and virtual glyphs)
        const handleSelect = useCallback((glyph: {
            id: number;
            name?: string;
            svg_data?: string;
            category?: string | null;
            notes?: string | null
        }) => {
            // If this is a virtual glyph (negative ID), add it to the virtual glyph map
            if (isVirtualGlyphId(glyph.id) && glyph.svg_data) {
                setVirtualGlyphMap(prev => {
                    const next = new Map(prev);
                    next.set(glyph.id, {
                        id: glyph.id,
                        ipaCharacter: glyph.name ?? '',
                        name: glyph.name ?? '',
                        svg_data: glyph.svg_data ?? '',
                        category: glyph.category ?? 'IPA Fallback',
                        notes: glyph.notes ?? null,
                        source: 'virtual-ipa',
                    });
                    return next;
                });
            }

            const result = insertWithStrategy(strategy, selection, glyph.id, cursor);
            setSelection(result.selection);
            setCursor(result.cursor);
        }, [strategy, selection, cursor]);

        // Handle glyph removal
        const handleRemove = useCallback(() => {
            const result = removeWithStrategy(strategy, selection, cursor);
            setSelection(result.selection);
            setCursor(result.cursor);
        }, [strategy, selection, cursor]);

        // Handle clear all
        const handleClear = useCallback(() => {
            const result = strategy.clear();
            setSelection(selectionFromIds(result.selection));
            setCursor(result.cursor);
            setVirtualGlyphMap(new Map()); // Also clear virtual glyphs
        }, [strategy]);

        // ------------------------------------------------------------------
        // Block script
        // ------------------------------------------------------------------

        /** The boundary glyph must be in the virtual map so it serialises to ".". */
        const registerBoundaryGlyph = useCallback(() => {
            setVirtualGlyphMap(prev => {
                if (prev.has(BOUNDARY_GLYPH.id)) return prev;
                const next = new Map(prev);
                next.set(BOUNDARY_GLYPH.id, BOUNDARY_GLYPH);
                return next;
            });
        }, []);

        // Keyboard "·" key and the physical `.` key: typed like any key, at
        // the cursor, through the insertion strategy.
        const handleBoundary = useCallback(() => {
            handleSelect(BOUNDARY_GLYPH);
        }, [handleSelect]);

        // Keyboard "‿" Join key: the mirror of the boundary, typed the same
        // way (`handleSelect` registers the virtual glyph, so it serialises
        // to "‿").
        const handleJoinKey = useCallback(() => {
            handleSelect(JOIN_GLYPH);
        }, [handleSelect]);

        // The canvas' entries as display entries, 1:1 with the tiles. Only
        // computed while blocks are on — nothing below runs otherwise.
        const blockEntries = useMemo(() => {
            if (!blocksOn || contextGraphemeMap === null) return null;
            let order: SpellingEntry[];
            try {
                order = buildGlyphOrder();
            } catch {
                // An unknown virtual id is reported on the field by the change
                // effect; the block UI simply stands down.
                return null;
            }
            return glyphOrderToDisplayEntries(order, contextGraphemeMap);
        }, [blocksOn, contextGraphemeMap, buildGlyphOrder]);

        const canvasBlocks = useMemo(() => {
            if (blockEntries === null || blockScheme === null || contextGraphemeMap === null) return [];
            return computeCanvasBlocks(blockEntries, blockScheme, contextGraphemeMap);
        }, [blockEntries, blockScheme, contextGraphemeMap]);

        const blockOutlines = useMemo(() => canvasBlocks.map(block => ({
            key: block.key,
            entryIndices: block.entryIndices,
            label: block.template.name,
            colour: block.colour,
        })), [canvasBlocks]);

        const groupNames = useMemo(
            () => new Map(variantGroups.map(group => [group.id, group.name])),
            [variantGroups],
        );

        // Which block's popover is open, by its first entry's position.
        const [openBlockKey, setOpenBlockKey] = useState<number | null>(null);
        const openBlock = openBlockKey === null
            ? undefined
            : canvasBlocks.find(block => block.key === openBlockKey);
        const openBlockSlots = useMemo(() => {
            if (!openBlock || blockEntries === null || contextGraphemeMap === null) return [];
            return describeBlockSlots(openBlock, blockEntries, selection.pins, contextGraphemeMap, groupNames);
        }, [openBlock, blockEntries, selection, contextGraphemeMap, groupNames]);
        const closeBlockPopover = useCallback(() => setOpenBlockKey(null), []);

        const joinIndex = openBlock ? openBlock.entryIndices[openBlock.entryIndices.length - 1] + 1 : -1;
        const canJoinOpenBlock = joinIndex >= 0 && selectedIds[joinIndex] === BOUNDARY_GLYPH.id;

        // Pins and structure edits are manual-spelling operations: refused
        // under the lock (the popover is read-only there as well).
        const handlePinChange = useCallback((entryIndex: number, variantId: number | null) => {
            if (isLocked) return;
            setSelection(prev => setPinAt(prev, entryIndex, variantId));
        }, [isLocked]);

        const handleSplitBefore = useCallback((entryIndex: number) => {
            if (isLocked) return;
            registerBoundaryGlyph();
            setSelection(prev => insertAt(prev, entryIndex, BOUNDARY_GLYPH.id));
            setCursor(prev => (prev !== null && prev >= entryIndex ? prev + 1 : prev));
            setOpenBlockKey(null);
        }, [isLocked, registerBoundaryGlyph]);

        const handleJoin = useCallback(() => {
            if (isLocked || joinIndex < 0) return;
            const index = joinIndex;
            setSelection(prev => (prev.ids[index] === BOUNDARY_GLYPH.id ? removeAt(prev, index) : prev));
            setCursor(prev => (prev !== null && prev > index ? prev - 1 : prev));
            setOpenBlockKey(null);
        }, [isLocked, joinIndex]);

        // Pinned entries: a marker on the tile, and the tile draws the pinned
        // form. Independent of the scheme — a pin is part of the stored
        // spelling, and the display honours it on the non-block path too.
        const pinnedIndices = useMemo(() => {
            const indices = new Set<number>();
            selection.pins.forEach((pin, index) => { if (pin !== null) indices.add(index); });
            return indices.size > 0 ? indices : undefined;
        }, [selection]);

        const graphemeById = useMemo(() => {
            const map = new Map<number, GraphemeComplete>();
            for (const item of availableGlyphs as (Glyph | GlyphWithUsage | GraphemeComplete)[]) {
                if ('variants' in item && Array.isArray(item.variants)) map.set(item.id, item as GraphemeComplete);
            }
            return map;
        }, [availableGlyphs]);

        const glyphOverrides = useMemo(() => {
            if (!pinnedIndices) return undefined;
            const overrides = new Map<number, {id: number; name: string; svg_data: string; category?: string | null; notes?: string | null}>();
            for (const index of pinnedIndices) {
                const id = selection.ids[index];
                const grapheme = graphemeById.get(id) ?? contextGraphemeMap?.get(id);
                const variant = grapheme?.variants?.find(v => v.id === selection.pins[index]);
                if (!grapheme || !variant || variant.glyphs.length === 0) continue;
                overrides.set(index, {
                    id,
                    name: `${grapheme.name} (${variant.name})`,
                    svg_data: variantSvg(variant.glyphs),
                    category: grapheme.category,
                    notes: grapheme.notes,
                });
            }
            return overrides.size > 0 ? overrides : undefined;
        }, [pinnedIndices, selection, graphemeById, contextGraphemeMap]);

        // Open keyboard
        const handleOpenKeyboard = useCallback(() => {
            setIsKeyboardOpen(true);
        }, []);

        // Close keyboard
        const handleCloseKeyboard = useCallback(() => {
            setIsKeyboardOpen(false);
        }, []);

        return (
            <div
                className={classNames(styles.glyphCanvasInput, className)}
                style={style}
                id={`${idPrefix}-container`}
            >
                {/* Header */}
                <div className={styles.header}>
                    <label
                        className={styles.label}
                        htmlFor={`${idPrefix}-canvas`}
                    >
                        {label}
                    </label>
                    <div className={styles.actions}>
                        <span className={styles.count}>
                            {selectedIds.length} glyph{selectedIds.length !== 1 ? 's' : ''}
                            {hasVirtualGlyphs && <span className={styles.virtualIndicator}> (includes IPA)</span>}
                        </span>
                        {selectedIds.length > 0 && !isLocked && (
                            <HoverToolTip content="Clear all glyphs">
                                <IconButton
                                    iconName="trash"
                                    onClick={handleClear}
                                    aria-label="Clear all glyphs"
                                    themeType="basic"
                                    iconSize="1rem"
                                    iconColor="var(--status-bad)"
                                />
                            </HoverToolTip>
                        )}

                        {/* The wand IS the auto-spell flag: a toggle, not a one-shot
                            "generate" button. On = the software owns the spelling. */}
                        {autoSpell && (
                            <HoverToolTip
                                content={autoSpell.disabledReason
                                    ?? (autoSpell.enabled
                                        ? 'Auto-spell is on: the spelling is generated from the pronunciation. Click to turn it off and spell by hand.'
                                        : 'Auto-spell is off. Click to generate the spelling from the pronunciation.')}
                            >
                                <IconButton
                                    iconName="magic"
                                    onClick={() => autoSpell.onToggle(!autoSpell.enabled)}
                                    disabled={!!autoSpell.disabledReason}
                                    aria-pressed={autoSpell.enabled}
                                    aria-label="Auto-spell"
                                    themeType="basic"
                                    iconSize="1rem"
                                    className={classNames(styles.autoSpellToggle, {
                                        [styles.autoSpellToggleOn]: autoSpell.enabled,
                                    })}
                                >
                                    {autoSpell.enabled ? 'Auto-spell on' : 'Auto-spell off'}
                                </IconButton>
                            </HoverToolTip>
                        )}

                        <HoverToolTip content={isLocked ? locked!.tooltip : 'Open glyph keyboard'}>
                            <IconButton
                                iconName="keyboard"
                                onClick={handleOpenKeyboard}
                                disabled={isLocked}
                                aria-label="Open glyph keyboard"
                                themeType="basic"
                                iconSize="1.25rem"
                            />
                        </HoverToolTip>
                    </div>
                </div>

                {/* Auto-spell ownership, stated on screen (not only on hover):
                    who owns the spelling and how to take it back. */}
                {isLocked && (
                    <div className={styles.lockNotice} role="status" aria-live="polite">
                        <i className="bi-magic" aria-hidden="true"/>
                        <span>{locked!.message}</span>
                    </div>
                )}

                {/* Info notice when IPA fallback characters are present */}
                {hasVirtualGlyphs && (
                    <div className={styles.virtualWarning} role="status">
                        <i className="bi-info-circle" aria-hidden="true"/>
                        <span>
                            IPA characters (dashed borders) will be saved as part of the spelling.
                            You can optionally create graphemes for them later.
                        </span>
                    </div>
                )}

                {/* Block script: the composed word, as every other renderer
                    draws it. Shown under the auto-spell lock too. */}
                {blocksOn && blockEntries !== null && (
                    <BlockPreviewStrip entries={blockEntries} direction={direction}/>
                )}

                {/* Canvas */}
                {(() => {
                    const canvas = (
                        <GlyphCanvas
                            ref={canvasRef}
                            selectedGlyphIds={selectedIds}
                            glyphMap={glyphMap}
                            layout={mergedCanvasLayout}
                            showControls={selectedIds.length > 0}
                            blocks={blocksOn ? blockOutlines : undefined}
                            onOpenBlock={blocksOn ? setOpenBlockKey : undefined}
                            showBoundaries={blocksOn}
                            pinnedIndices={pinnedIndices}
                            glyphOverrides={glyphOverrides}
                            cursor={cursor}
                            onCursorMove={isLocked ? undefined : setCursor}
                            showCursor={isKeyboardOpen}
                            minHeight="120px"
                            emptyStateContent={isLocked ? (
                                <span className={styles.lockedEmpty}>
                                    No spelling yet
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    className={styles.emptyButton}
                                    onClick={handleOpenKeyboard}
                                >
                                    Click here or the keyboard button to add glyphs
                                </button>
                            )}
                        />
                    );
                    return isLocked ? (
                        <HoverToolTip content={locked!.tooltip} className={styles.lockedCanvas}>
                            <div aria-disabled="true">{canvas}</div>
                        </HoverToolTip>
                    ) : canvas;
                })()}

                {/* Keyboard Overlay */}
                <GlyphKeyboardOverlay
                    availableGlyphs={renderableGlyphs}
                    onSelect={handleSelect}
                    onRemove={handleRemove}
                    onClear={handleClear}
                    isOpen={isKeyboardOpen}
                    onClose={handleCloseKeyboard}
                    searchable={searchable}
                    height={keyboardHeight}
                    enableIpaMode={enableIpaMode}
                    onBoundary={blocksOn ? handleBoundary : undefined}
                    onJoin={blocksOn ? handleJoinKey : undefined}
                />

                {/* Block popover: forms per slot, split, join. Read-only under the lock. */}
                {blocksOn && openBlock && (
                    <BlockPopover
                        isOpen
                        onClose={closeBlockPopover}
                        templateName={openBlock.template.name}
                        slots={openBlockSlots}
                        onPinChange={handlePinChange}
                        onSplitBefore={handleSplitBefore}
                        canJoin={canJoinOpenBlock}
                        onJoin={handleJoin}
                        readOnlyReason={isLocked ? locked!.tooltip : null}
                    />
                )}

                {/* Hidden input for form submission */}
                <input
                    type="hidden"
                    name={registerSmartFieldProps.name}
                    value={hiddenValue}
                />
            </div>
        );
    }
);

GlyphCanvasInput.displayName = 'GlyphCanvasInput';

/** One shared instance — the strategy is stateless. */
const CURSOR_STRATEGY: InsertionStrategy = createCursorStrategy();
export default GlyphCanvasInput;
export {GlyphCanvasInput};
