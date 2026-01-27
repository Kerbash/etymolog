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
} from './types';
import type { Glyph, GlyphWithUsage, GraphemeComplete } from '../../../../db/types';
import { defaultInsertionStrategy } from './strategies';
import { GlyphCanvas } from './GlyphCanvas';
import { GlyphKeyboardOverlay } from './GlyphKeyboardOverlay';
import { buildRenderableMap, normalizeToRenderable, type RenderableGlyph } from './utils';

import styles from './GlyphCanvasInput.module.scss';

// Augment/extend the imported props type to include the optional helpers we need here
// This keeps backwards compatibility if the upstream types don't include them yet.
export interface GlyphCanvasInputProps extends _OrigProps {
    /** Optional explicit available glyphs/graphemes prop (supports Glyph, GlyphWithUsage, or GraphemeComplete) */
    availableGlyphs?: (Glyph | GlyphWithUsage | GraphemeComplete)[];
    /** Called whenever the selection changes (happy-path hook) */
    onSelectionChange?: (ids: number[]) => void;
    /** Optional auto-spell preview provided by parent */
    autoSpellPreview?: any | null;
    /** Request auto-spell handler (parent provides generation) */
    onRequestAutoSpell?: (() => void) | undefined;
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
        const [cursor, setCursor] = useState<number | null>(null);
        const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

        // Get the active insertion strategy
        const strategy: InsertionStrategy = useMemo(() => {
            return insertionStrategy ?? defaultInsertionStrategy;
        }, [insertionStrategy]);

        // Build glyph lookup map - normalizes GraphemeComplete, Glyph, and GlyphWithUsage
        const glyphMap = useMemo(() => {
            return buildRenderableMap(availableGlyphs as (Glyph | GlyphWithUsage | GraphemeComplete)[]);
        }, [availableGlyphs]);

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
        useImperativeHandle(registerSmartFieldProps.ref, () => ({
            get value(): number[] {
                return selectedIds;
            },
            resetCanvasView: () => canvasRef.current?.resetView(),
            fitCanvasToView: () => canvasRef.current?.fitToView(),
            openKeyboard: () => setIsKeyboardOpen(true),
            closeKeyboard: () => setIsKeyboardOpen(false),
            clear: () => {
                const result = strategy.clear();
                setSelectedIds(result.selection);
                setCursor(result.cursor);
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
        }), [selectedIds, strategy]);

        // Update parent field state when selection changes
        useEffect(() => {
            if (isInitialRender.current) {
                isInitialRender.current = false;
                return;
            }

            fieldStateRef.current.isTouched.setIsTouched(true);
            fieldStateRef.current.isChanged.setIsChanged(true);
            fieldStateRef.current.isEmpty.setIsEmpty(selectedIds.length === 0);
            fieldStateRef.current.isInputValid.setIsInputValid(true);

            // Notify parent via callback (new prop)
            try {
                onSelectionChange?.(selectedIds.slice());
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
        }, [selectedIds, onSelectionChange, registerSmartFieldProps.name]);

        // Handle glyph selection from keyboard
        const handleSelect = useCallback((glyph: { id: number }) => {
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
        }, [strategy]);

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

                {/* Inline auto-spell preview (compact) */}
                {autoSpellPreview && (
                    <div className={styles.autoSpellPreview} role="status" aria-live="polite">
                        {autoSpellPreview.success ? (
                            <div className={styles.previewSuccess}>
                                Auto-spell: {autoSpellPreview.spelling.map(s => s.grapheme_id).join(', ')}
                            </div>
                        ) : (
                            <div className={styles.previewError}>{autoSpellPreview.error ?? 'Auto-spell failed'}</div>
                        )}
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
