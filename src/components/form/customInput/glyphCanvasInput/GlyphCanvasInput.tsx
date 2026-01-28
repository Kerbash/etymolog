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
 * - `autoSpellPreview?: AutoSpellResult | null` - optional preview data for auto-spelling
 * - `onRequestAutoSpell?: () => void` - called when the user requests an auto-spell (UI button)
 *
 * Value contract with SmartForm:
 * - The component exposes `registerSmartFieldProps.ref.current.value` as the current
 *   array of selected glyph IDs (number[]). SmartForm reads this value synchronously on submit.
 * - The component also writes a hidden input with the JSON-encoded selection for standard
 *   HTML form submission compatibility.
 *
 * Usage example (SmartForm):
 * ```tsx
 * const glyphCanvasField = registerField('glyphSequence', { defaultValue: [] });
 *
 * <GlyphCanvasInput
 *   {...glyphCanvasField}
 *   availableGlyphs={glyphs}
 *   onSelectionChange={(ids) => setSpellingIds(ids)}
 *   autoSpellPreview={autoSpellPreview}
 *   onRequestAutoSpell={handleRequestAutoSpell}
 * />
 * ```
 */

'use client';

import {
    forwardRef,
    useCallback,
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
    VirtualGlyph,
} from './types';
import type { Glyph, GlyphWithUsage, GraphemeComplete, AutoSpellResultExtended } from '../../../../db/types';
import { defaultInsertionStrategy } from './strategies';
import { GlyphCanvas } from './GlyphCanvas';
import { GlyphKeyboardOverlay } from './GlyphKeyboardOverlay';
import { buildRenderableMap, normalizeToRenderable, isVirtualGlyphId, createVirtualGlyph, type RenderableGlyph } from './utils';

import styles from './GlyphCanvasInput.module.scss';

// Augment/extend the imported props type to include the optional helpers we need here
// This keeps backwards compatibility if the upstream types don't include them yet.
export interface GlyphCanvasInputProps extends _OrigProps {
    /** Optional explicit available glyphs/graphemes prop (supports Glyph, GlyphWithUsage, or GraphemeComplete) */
    availableGlyphs?: (Glyph | GlyphWithUsage | GraphemeComplete)[];
    /** Called whenever the selection changes (happy-path hook) */
    onSelectionChange?: (ids: number[], hasVirtualGlyphs: boolean) => void;
    /** Optional auto-spell preview provided by parent (supports virtual IPA glyphs) */
    autoSpellPreview?: AutoSpellResultExtended | null;
    /** Request auto-spell handler (parent provides generation) */
    onRequestAutoSpell?: (() => void) | undefined;
    /** Enable IPA keyboard mode for virtual glyph creation */
    enableIpaMode?: boolean;
    /** Initial virtual glyphs from auto-spell (merged with component's internal map) */
    initialVirtualGlyphs?: Map<number, VirtualGlyph>;
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
            autoSpellPreview = null,
            onRequestAutoSpell,
            enableIpaMode = false,
            initialVirtualGlyphs,
        },
        _
    ) {
        const idPrefix = useId();
        const isInitialRender = useRef(true);
        const fieldStateRef = useRef(fieldState);
        fieldStateRef.current = fieldState;

        const canvasRef = useRef<GlyphCanvasRef>(null);

        // State
        const [selectedIds, setSelectedIds] = useState<number[]>(Array.isArray(defaultValue) ? defaultValue : defaultValue ?? []);

        // Virtual glyph map - stores virtual glyphs created from IPA keyboard
        const [virtualGlyphMap, setVirtualGlyphMap] = useState<Map<number, VirtualGlyph>>(new Map());

        // Refs for stable access in useImperativeHandle and useEffect (prevents infinite loops)
        const selectedIdsRef = useRef(selectedIds);
        selectedIdsRef.current = selectedIds;

        const onSelectionChangeRef = useRef(onSelectionChange);
        onSelectionChangeRef.current = onSelectionChange;
        const [cursor, setCursor] = useState<number | null>(null);
        const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

        // Get the active insertion strategy
        const strategy: InsertionStrategy = useMemo(() => {
            return insertionStrategy ?? defaultInsertionStrategy;
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

        // Check if selection contains virtual glyphs (from either source)
        const hasVirtualGlyphs = useMemo(() => {
            return selectedIds.some(id =>
                isVirtualGlyphId(id) ||
                virtualGlyphMap.has(id) ||
                initialVirtualGlyphs?.has(id)
            );
        }, [selectedIds, virtualGlyphMap, initialVirtualGlyphs]);

        // Convert availableGlyphs to RenderableGlyph[] for keyboard overlay
        const renderableGlyphs = useMemo(() => {
            return (availableGlyphs as (Glyph | GlyphWithUsage | GraphemeComplete)[]).map(normalizeToRenderable);
        }, [availableGlyphs]);

        // Merge canvas layout with direction
        const mergedCanvasLayout = useMemo(() => ({
            direction,
            ...canvasLayout,
        }), [direction, canvasLayout]);

        // Expose value via useImperativeHandle
        // Use ref for value getter to prevent handle recreation when state changes
        useImperativeHandle(registerSmartFieldProps.ref, () => ({
            get value(): number[] {
                return selectedIdsRef.current;
            },
            resetCanvasView: () => canvasRef.current?.resetView(),
            fitCanvasToView: () => canvasRef.current?.fitToView(),
            openKeyboard: () => setIsKeyboardOpen(true),
            closeKeyboard: () => setIsKeyboardOpen(false),
            clear: () => {
                const result = strategy.clear();
                setSelectedIds(result.selection);
                setCursor(result.cursor);
                setVirtualGlyphMap(new Map()); // Also clear virtual glyphs
            },
            // Backwards-compatible setValue pattern
            setValue: (val: number[], options?: any) => {
                setSelectedIds(Array.isArray(val) ? val : []);
                if (options?.doValidation !== false) {
                    fieldStateRef.current.isTouched.setIsTouched(true);
                    fieldStateRef.current.isChanged.setIsChanged(true);
                    fieldStateRef.current.isEmpty.setIsEmpty((val ?? []).length === 0);
                }
            }
        }), [strategy]);

        // Update parent field state when selection changes
        // Use ref for callback to prevent re-runs when callback reference changes
        useEffect(() => {
            if (isInitialRender.current) {
                isInitialRender.current = false;
                return;
            }

            fieldStateRef.current.isTouched.setIsTouched(true);
            fieldStateRef.current.isChanged.setIsChanged(true);
            fieldStateRef.current.isEmpty.setIsEmpty(selectedIds.length === 0);
            fieldStateRef.current.isInputValid.setIsInputValid(true);

            // Notify parent via callback using ref (prevents infinite loops)
            // Include hasVirtualGlyphs flag so parent knows if virtual glyphs are present
            try {
                const containsVirtual = selectedIds.some(id => isVirtualGlyphId(id));
                onSelectionChangeRef.current?.(selectedIds.slice(), containsVirtual);
            } catch (e) {
                // swallow - callback should not break input
                // eslint-disable-next-line no-console
                console.error('onSelectionChange threw', e);
            }

            // Update the hidden input's value so plain HTML form serialization picks it up
            const hiddenInput = document.querySelector(`input[name="${registerSmartFieldProps.name}"]`) as HTMLInputElement | null;
            if (hiddenInput) {
                hiddenInput.value = JSON.stringify(selectedIds);
            }
        }, [selectedIds, registerSmartFieldProps.name]);

        // Handle glyph selection from keyboard (both real and virtual glyphs)
        const handleSelect = useCallback((glyph: { id: number; name?: string; svg_data?: string; category?: string | null; notes?: string | null }) => {
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

            const result = strategy.insert(selectedIds, glyph.id, cursor);
            setSelectedIds(result.selection);
            setCursor(result.cursor);
        }, [strategy, selectedIds, cursor]);

        // Handle glyph removal
        const handleRemove = useCallback(() => {
            const result = strategy.remove(selectedIds, cursor);
            setSelectedIds(result.selection);
            setCursor(result.cursor);
        }, [strategy, selectedIds, cursor]);

        // Handle clear all
        const handleClear = useCallback(() => {
            const result = strategy.clear();
            setSelectedIds(result.selection);
            setCursor(result.cursor);
            setVirtualGlyphMap(new Map()); // Also clear virtual glyphs
        }, [strategy]);

        // Handle applying auto-spell results
        const handleApplyAutoSpell = useCallback(() => {
            if (!autoSpellPreview?.success || !autoSpellPreview.spelling) return;

            // Extract glyph IDs from the auto-spell result
            const newIds = autoSpellPreview.spelling.map(s => s.grapheme_id);

            // Add any virtual glyphs to the map
            if (autoSpellPreview.hasVirtualGlyphs) {
                setVirtualGlyphMap(prev => {
                    const next = new Map(prev);
                    for (const entry of autoSpellPreview.spelling) {
                        if (entry.isVirtual && entry.ipaCharacter) {
                            const virtualGlyph = createVirtualGlyph(entry.ipaCharacter);
                            next.set(entry.grapheme_id, virtualGlyph);
                        }
                    }
                    return next;
                });
            }

            // Set the selection
            setSelectedIds(newIds);
            setCursor(null);
        }, [autoSpellPreview]);

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
                        {selectedIds.length > 0 && (
                            <IconButton
                                iconName="trash"
                                onClick={handleClear}
                                aria-label="Clear all glyphs"
                                themeType="basic"
                                iconSize="1rem"
                                iconColor="var(--status-bad)"
                            />
                        )}

                        {/* Auto-spell request button (optional) */}
                        {onRequestAutoSpell && (
                            <IconButton
                                iconName="bolt"
                                onClick={onRequestAutoSpell}
                                aria-label="Request auto-spell preview"
                                themeType="basic"
                                iconSize="1.25rem"
                            />
                        )}

                        <IconButton
                            iconName="keyboard"
                            onClick={handleOpenKeyboard}
                            aria-label="Open glyph keyboard"
                            themeType="basic"
                            iconSize="1.25rem"
                        />
                    </div>
                </div>

                {/* Inline auto-spell preview with Apply button */}
                {autoSpellPreview && (
                    <div className={styles.autoSpellPreview} role="status" aria-live="polite">
                        {autoSpellPreview.success ? (
                            <div className={styles.previewSuccess}>
                                <span className={styles.previewLabel}>
                                    Auto-spell ready ({autoSpellPreview.spelling.length} glyphs
                                    {autoSpellPreview.hasVirtualGlyphs && ', includes IPA fallbacks'}):
                                </span>
                                <div className={styles.previewGlyphs}>
                                    {autoSpellPreview.spelling.map((s, i) => (
                                        <span
                                            key={`${s.grapheme_id}-${i}`}
                                            className={classNames(styles.previewGlyph, {
                                                [styles.previewVirtual]: s.isVirtual,
                                            })}
                                            title={s.isVirtual ? `IPA: ${s.ipaCharacter}` : `Grapheme #${s.grapheme_id}`}
                                        >
                                            {s.isVirtual ? s.ipaCharacter : `#${s.grapheme_id}`}
                                        </span>
                                    ))}
                                </div>
                                <IconButton
                                    iconName="check"
                                    onClick={handleApplyAutoSpell}
                                    aria-label="Apply auto-spell"
                                    themeType="basic"
                                    iconSize="1rem"
                                    iconColor="var(--status-good, green)"
                                >
                                    Apply
                                </IconButton>
                            </div>
                        ) : (
                            <div className={styles.previewError}>{autoSpellPreview.error ?? 'Auto-spell failed'}</div>
                        )}
                    </div>
                )}

                {/* Warning when virtual glyphs are present */}
                {hasVirtualGlyphs && (
                    <div className={styles.virtualWarning} role="alert">
                        <i className="bi-exclamation-triangle" aria-hidden="true" />
                        <span>
                            IPA fallback glyphs (dashed borders) are temporary placeholders.
                            Create real graphemes for these characters to save them permanently.
                        </span>
                    </div>
                )}

                {/* Canvas */}
                <GlyphCanvas
                    ref={canvasRef}
                    selectedGlyphIds={selectedIds}
                    glyphMap={glyphMap}
                    layout={mergedCanvasLayout}
                    showControls={selectedIds.length > 0}
                    minHeight="120px"
                    emptyStateContent={
                        <button
                            type="button"
                            className={styles.emptyButton}
                            onClick={handleOpenKeyboard}
                        >
                            Click here or the keyboard button to add glyphs
                        </button>
                    }
                />

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
                />

                {/* Hidden input for form submission */}
                <input
                    type="hidden"
                    name={registerSmartFieldProps.name}
                    value={JSON.stringify(selectedIds)}
                />
            </div>
        );
    }
);

GlyphCanvasInput.displayName = 'GlyphCanvasInput';
export default GlyphCanvasInput;
export { GlyphCanvasInput };
