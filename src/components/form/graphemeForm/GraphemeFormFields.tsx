/**
 * GraphemeFormFields
 * -------------------
 * Shared form fields for creating and editing graphemes.
 * Extracted from NewGraphemeForm to be reusable across create/edit contexts.
 *
 * This component renders:
 * - Glyph Selection Area (with selected glyphs list using GlyphCard)
 * - Grapheme Name Input
 * - Category Input
 * - Notes Input
 * - Pronunciation Table
 *
 * It does NOT render the form wrapper or submit buttons - that's the parent's responsibility.
 *
 * IMPORTANT: This component follows SmartForm's pattern of calling registerField() on every
 * render. SmartForm handles the registration internally - the returned fieldState values
 * must be used fresh each render to receive state updates.
 */

import classNames from "classnames";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { Glyph, GraphemeComplete, GlyphWithUsage } from "../../../db";
import type { registerFieldReturnType } from "smart-form/types";

import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory.ts";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import { buttonStyles } from "cyber-components/interactable/buttons/button/button";
import { PronunciationTableInput, type PronunciationRowValue } from "../customInput/pronunciationTableInput";
import NewGlyphModal from "../../tabs/grapheme/newGrapheme/NewGlyphModal";
import { EditGlyphModal } from "../glyphForm";
import GlyphCard from "../../display/glyphs/glyphCard/glyphCard";
import { flex, graphic, sizing } from "utils-styles";
import styles from "./graphemeFormFields.module.scss";

export interface GraphemeFormFieldsProps {
    /** SmartForm's registerField function */
    registerField: (name: string, options: any) => registerFieldReturnType;
    /** Mode: 'create' for new graphemes, 'edit' for existing graphemes */
    mode: 'create' | 'edit';
    /** Initial data for edit mode (grapheme to edit) */
    initialData?: GraphemeComplete | null;
    /** Optional class name for the container */
    className?: string;
    /** Callback when selected glyphs change (for parent to track) */
    onSelectedGlyphsChange?: (glyphs: Glyph[]) => void;
    /** Initial selected glyphs (for controlled behavior) */
    selectedGlyphs?: Glyph[];
}

/**
 * Helper to programmatically set a SmartForm field value and update its fieldState
 */
function setSmartFieldValue(field: registerFieldReturnType, value: string) {
    const inputEl = field.registerSmartFieldProps.ref?.current as HTMLInputElement | HTMLTextAreaElement | null;
    if (!inputEl) return false;

    inputEl.value = value;

    const isEmpty = value.trim() === '';
    field.fieldState.isEmpty.setIsEmpty(isEmpty);
    field.fieldState.isTouched.setIsTouched(true);
    field.fieldState.isChanged.setIsChanged(true);

    if (field.utils.validatorFunction) {
        const warning = field.utils.validatorFunction(value);
        field.fieldState.warning.setWarning(warning);
        field.fieldState.isInputValid.setIsInputValid(warning === null);
    }

    return true;
}

/**
 * Helper to get the current value of a SmartForm field via its ref
 */
function getSmartFieldValue(field: registerFieldReturnType): string {
    const inputEl = field.registerSmartFieldProps.ref?.current as HTMLInputElement | HTMLTextAreaElement | null;
    return inputEl?.value ?? '';
}

/**
 * Convert Glyph to GlyphWithUsage (adds usageCount for GlyphCard compatibility)
 */
function toGlyphWithUsage(glyph: Glyph): GlyphWithUsage {
    return { ...glyph, usageCount: 0 };
}

/**
 * GraphemeFormFields - Reusable form fields for grapheme creation/editing
 *
 * DESIGN NOTE: registerField() is called on every render. This is intentional and correct!
 * SmartForm's registerField:
 * 1. Handles registration internally (only registers once via pending refs)
 * 2. Returns FRESH fieldState values from React state each render
 * 3. Provides stable handlers via internal caching
 *
 * DO NOT cache registerField results in refs - this causes stale state bugs.
 */
export default function GraphemeFormFields({
    registerField,
    mode,
    initialData,
    className,
    onSelectedGlyphsChange,
    selectedGlyphs: controlledSelectedGlyphs,
}: GraphemeFormFieldsProps) {
    // Track if we've initialized the form with initial data
    const initializedRef = useRef(false);

    // State for glyph selection (internal if not controlled)
    const [internalSelectedGlyphs, setInternalSelectedGlyphs] = useState<Glyph[]>(() => {
        if (mode === 'edit' && initialData?.glyphs) {
            return initialData.glyphs;
        }
        return [];
    });

    // Use controlled or internal state
    const selectedGlyphs = controlledSelectedGlyphs ?? internalSelectedGlyphs;

    // Wrapper for setting glyphs - only updates internal state, callback is handled via useEffect
    const updateSelectedGlyphs = useCallback((glyphsOrUpdater: Glyph[] | ((prev: Glyph[]) => Glyph[])) => {
        if (controlledSelectedGlyphs !== undefined) {
            // Controlled mode - call parent's callback with new value
            const newGlyphs = typeof glyphsOrUpdater === 'function'
                ? glyphsOrUpdater(controlledSelectedGlyphs)
                : glyphsOrUpdater;
            onSelectedGlyphsChange?.(newGlyphs);
        } else {
            // Uncontrolled mode - update internal state
            setInternalSelectedGlyphs(glyphsOrUpdater);
        }
    }, [controlledSelectedGlyphs, onSelectedGlyphsChange]);

    // Notify parent of internal state changes (uncontrolled mode only)
    useEffect(() => {
        if (controlledSelectedGlyphs === undefined && onSelectedGlyphsChange) {
            onSelectedGlyphsChange(internalSelectedGlyphs);
        }
    }, [internalSelectedGlyphs, controlledSelectedGlyphs, onSelectedGlyphsChange]);

    const [isGlyphModalOpen, setIsGlyphModalOpen] = useState(false);

    // State for editing an existing glyph via modal
    const [editingGlyph, setEditingGlyph] = useState<Glyph | null>(null);
    const [isEditGlyphModalOpen, setIsEditGlyphModalOpen] = useState(false);

    // Prepare default pronunciations for edit mode
    const defaultPronunciations: PronunciationRowValue[] = useMemo(() => {
        if (mode === 'edit' && initialData?.phonemes && initialData.phonemes.length > 0) {
            return initialData.phonemes.map(p => ({
                pronunciation: p.phoneme,
                useInAutoSpelling: p.use_in_auto_spelling,
            }));
        }
        return [{ pronunciation: '', useInAutoSpelling: false }];
    }, [mode, initialData?.phonemes]);

    // Memoize validation config to prevent unnecessary re-registration
    const graphemeNameValidation = useMemo(() => TextInputValidatorFactory({
        required: {
            value: true,
            message: "Grapheme name is required"
        },
    }), []);

    // Register fields on every render - SmartForm handles internal state
    // The returned objects contain fresh state values that update with React state
    const graphemeNameField = registerField("graphemeName", {
        defaultValue: mode === 'edit' && initialData?.name ? initialData.name : undefined,
        validation: graphemeNameValidation,
    });

    const categoryField = registerField("category", {
        defaultValue: mode === 'edit' && initialData?.category ? initialData.category : undefined,
    });

    const notesField = registerField("notes", {
        defaultValue: mode === 'edit' && initialData?.notes ? initialData.notes : undefined,
    });

    const pronunciationsField = registerField("pronunciations", {
        defaultValue: defaultPronunciations,
    });

    // Set initial values for edit mode after fields are registered
    useEffect(() => {
        if (mode === 'edit' && initialData && !initializedRef.current) {
            initializedRef.current = true;

            // Use setTimeout to defer state updates out of render phase
            setTimeout(() => {
                if (initialData.name) {
                    setSmartFieldValue(graphemeNameField, initialData.name);
                }
                if (initialData.category) {
                    setSmartFieldValue(categoryField, initialData.category);
                }
                if (initialData.notes) {
                    setSmartFieldValue(notesField, initialData.notes);
                }
            }, 0);
        }
    }, [mode, initialData, graphemeNameField, categoryField, notesField]);

    // Handle glyph creation from modal
    const handleGlyphCreated = useCallback((glyph: Glyph) => {
        updateSelectedGlyphs(prev => {
            // Prevent duplicates
            if (prev.some(g => g.id === glyph.id)) return prev;

            const isFirst = prev.length === 0;
            const next = [...prev, glyph];

            // If this is the first glyph, inherit its name and category (only if fields are empty)
            if (isFirst) {
                // Use setTimeout to avoid setState during render
                setTimeout(() => {
                    try {
                        const currentName = getSmartFieldValue(graphemeNameField);
                        const currentCategory = getSmartFieldValue(categoryField);

                        if (currentName.trim() === '' && glyph.name) {
                            setSmartFieldValue(graphemeNameField, glyph.name);
                        }
                        if (currentCategory.trim() === '' && glyph.category) {
                            setSmartFieldValue(categoryField, glyph.category);
                        }
                    } catch (e) {
                        console.warn('[GraphemeFormFields] Failed to auto-fill form fields:', e);
                    }
                }, 0);
            }

            return next;
        });
    }, [updateSelectedGlyphs, graphemeNameField, categoryField]);

    // Handle removing a selected glyph (used by GlyphCard's delete button)
    const handleRemoveGlyph = useCallback((glyphId: number) => {
        updateSelectedGlyphs(prev => prev.filter(g => g.id !== glyphId));
    }, [updateSelectedGlyphs]);

    // Handle opening the edit glyph modal
    const handleEditGlyph = useCallback((glyphWithUsage: GlyphWithUsage) => {
        // Convert GlyphWithUsage back to Glyph for the modal
        const glyph: Glyph = {
            id: glyphWithUsage.id,
            name: glyphWithUsage.name,
            svg_data: glyphWithUsage.svg_data,
            category: glyphWithUsage.category,
            notes: glyphWithUsage.notes,
            created_at: glyphWithUsage.created_at,
            updated_at: glyphWithUsage.updated_at,
        };
        setEditingGlyph(glyph);
        setIsEditGlyphModalOpen(true);
    }, []);

    // Handle glyph update from edit modal
    const handleGlyphUpdated = useCallback((updatedGlyph: Glyph) => {
        updateSelectedGlyphs(prev =>
            prev.map(g => g.id === updatedGlyph.id ? updatedGlyph : g)
        );
        setEditingGlyph(null);
    }, [updateSelectedGlyphs]);

    // Handle glyph deletion from edit modal
    const handleGlyphDeleted = useCallback((glyphId: number) => {
        updateSelectedGlyphs(prev => prev.filter(g => g.id !== glyphId));
        setEditingGlyph(null);
    }, [updateSelectedGlyphs]);

    return (
        <>
            <div className={classNames(className)}>
                {/* Glyph Selection Area */}
                <div className={classNames(styles.glyphSelectionContainer)}>
                    <h3>Glyphs</h3>
                    <div className={classNames(styles.glyphSelectionBox)}>
                        {selectedGlyphs.length === 0 ? (
                            <p className={styles.emptyState}>No glyphs selected</p>
                        ) : (
                            <div className={classNames(styles.selectedGlyphs)}>
                                {selectedGlyphs.map((glyph) => (
                                    <GlyphCard
                                        key={glyph.id}
                                        glyph={toGlyphWithUsage(glyph)}
                                        onDelete={handleRemoveGlyph}
                                        interactionMode="modal"
                                        onClick={handleEditGlyph}
                                    />
                                ))}
                            </div>
                        )}

                        <div className={classNames(styles.glyphButtons)}>
                            <IconButton
                                type="button"
                                onClick={() => setIsGlyphModalOpen(true)}
                                className={classNames(buttonStyles.primary)}
                            >
                                Add New Glyph
                            </IconButton>
                            {/* TODO: Implement select existing glyphs functionality */}
                            <IconButton
                                type="button"
                                disabled={true}
                                className={classNames(buttonStyles.secondary)}
                                title="Select from existing glyphs (coming soon)"
                            >
                                Select Existing Glyph
                            </IconButton>
                        </div>
                    </div>
                </div>

                <div className={classNames(flex.flexCol, flex.flexGapM)}>
                    {/* Grapheme Name Input */}
                    <HoverToolTip content={"The name of the grapheme"}>
                        <LabelShiftTextInput
                            displayName={"Grapheme Name"}
                            asInput={true}
                            {...graphemeNameField}
                        />
                    </HoverToolTip>

                    {/* Category Input */}
                    <HoverToolTip content={"Category to organize your graphemes (e.g., Vowels, Consonants, Numbers). Inherited from first glyph but can be changed."}>
                        <LabelShiftTextInput
                            displayName={"Category"}
                            asInput={true}
                            {...categoryField}
                        />
                    </HoverToolTip>

                    {/* Notes / Description Textarea */}
                    <HoverToolTip
                        className={classNames(sizing.parentWidth)}
                        content={"Additional notes, usage examples, or etymology information"}
                    >
                        <LabelShiftTextInput
                            displayName={"Notes"}
                            asInput={false}
                            {...notesField}
                        />
                    </HoverToolTip>
                </div>

                <h2 className={graphic.underlineHighlightColorPrimary}>
                    Pronunciation
                </h2>
                <div>
                    <PronunciationTableInput
                        {...pronunciationsField}
                        defaultValue={defaultPronunciations}
                        maxRows={10}
                        requirePronunciation={true}
                    />
                </div>
            </div>

            {/* Glyph Creation Modal */}
            <NewGlyphModal
                isOpen={isGlyphModalOpen}
                setIsOpen={setIsGlyphModalOpen}
                onGlyphCreated={handleGlyphCreated}
            />

            {/* Glyph Edit Modal */}
            <EditGlyphModal
                isOpen={isEditGlyphModalOpen}
                setIsOpen={setIsEditGlyphModalOpen}
                glyph={editingGlyph}
                onGlyphUpdated={handleGlyphUpdated}
                onGlyphDeleted={handleGlyphDeleted}
                showDelete={true}
            />
        </>
    );
}

/**
 * Type for the form data produced by GraphemeFormFields
 */
export interface GraphemeFormData {
    graphemeName: string;
    category?: string;
    notes?: string;
    pronunciations: PronunciationRowValue[];
}

export type { PronunciationRowValue };
