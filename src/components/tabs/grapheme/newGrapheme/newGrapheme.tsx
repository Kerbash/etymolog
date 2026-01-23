import styles from "./newGrapheme.module.scss";
import {flex, graphic, sizing} from "utils-styles";

import classNames from "classnames";
import { useState, useMemo } from "react";

import {SmartForm, useSmartForm} from "smart-form/smartForm";
import type {registerFieldReturnType} from "smart-form/smartForm";
import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory.ts";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import {PronunciationTableInput} from "../../../form/customInput/pronunciationTableInput";
import {buttonStyles} from "cyber-components/interactable/buttons/button/button";
import { useEtymolog, type Glyph, type CreateGraphemeRequest } from "../../../../db";
import NewGlyphModal from "./NewGlyphModal";

/**
 * Helper to programmatically set a SmartForm field value and update its fieldState
 * @param field - The registerField return object containing ref and fieldState
 * @param value - The value to set
 */
function setSmartFieldValue(field: registerFieldReturnType, value: string) {
    const inputEl = field.registerSmartFieldProps.ref?.current as HTMLInputElement | HTMLTextAreaElement | null;
    if (!inputEl) return false;

    // Set the native input value
    inputEl.value = value;

    // Update fieldState to reflect the change
    const isEmpty = value.trim() === '';
    field.fieldState.isEmpty.setIsEmpty(isEmpty);
    field.fieldState.isTouched.setIsTouched(true);
    field.fieldState.isChanged.setIsChanged(true);

    // Run validation if validator exists
    if (field.utils.validatorFunction) {
        const warning = field.utils.validatorFunction(value);
        field.fieldState.warning.setWarning(warning);
        field.fieldState.isInputValid.setIsInputValid(warning === null);
    }

    return true;
}

/**
 * Helper to get the current value of a SmartForm field via its ref
 * @param field - The registerField return object
 */
function getSmartFieldValue(field: registerFieldReturnType): string {
    const inputEl = field.registerSmartFieldProps.ref?.current as HTMLInputElement | HTMLTextAreaElement | null;
    return inputEl?.value ?? '';
}

export default function NewGraphemeForm() {
    const {registerField, unregisterField, registerForm, isFormValid} = useSmartForm({mode: "onChange"});

    // Use the unified context
    const { api, isLoading, error } = useEtymolog();

    // State for glyph selection
    const [selectedGlyphs, setSelectedGlyphs] = useState<Glyph[]>([]);
    const [isGlyphModalOpen, setIsGlyphModalOpen] = useState(false);

    // Register fields and store the return values for programmatic access
    const graphemeNameField = useMemo(() => registerField("graphemeName", {
        validation: TextInputValidatorFactory({
            required: {
                value: true,
                message: "Grapheme name is required"
            },
        })
    }), [registerField]);

    const categoryField = useMemo(() => registerField("category", {}), [registerField]);

    const notesField = useMemo(() => registerField("notes", {}), [registerField]);

    const pronunciationsField = useMemo(() => registerField("pronunciations", {}), [registerField]);

    // Handle glyph creation from modal
    const handleGlyphCreated = (glyph: Glyph) => {
        setSelectedGlyphs(prev => {
            // Prevent duplicates (in case callback fired twice)
            if (prev.some(g => g.id === glyph.id)) return prev;

            const isFirst = prev.length === 0;
            const next = [...prev, glyph];

            // If this is the first glyph, inherit its name and category, but only if fields are empty
            if (isFirst) {
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
                    // Protect against any unexpected runtime error
                    console.warn('[NewGraphemeForm] Failed to auto-fill form fields:', e);
                }
            }

            return next;
        });
    };

    // Handle removing a selected glyph
    const handleRemoveGlyph = (glyphId: number) => {
        setSelectedGlyphs(prev => prev.filter(g => g.id !== glyphId));
    };

    // Register form with submission handler
    const formProps = registerForm("graphemeForm", {
        submitFunc: async (formData) => {
            try {
                const data = formData as unknown as {
                    graphemeName: string;
                    category?: string;
                    notes?: string;
                    pronunciations: Array<{
                        pronunciation: string;
                        useInAutoSpelling: boolean;
                    }>;
                };

                // Validate required fields
                if (selectedGlyphs.length === 0) {
                    throw new Error('Please add at least one glyph');
                }
                if (!data.graphemeName || data.graphemeName.trim() === '') {
                    throw new Error('Grapheme name is required');
                }

                // Create grapheme input
                const graphemeInput: CreateGraphemeRequest = {
                    name: data.graphemeName.trim(),
                    category: data.category?.trim() || undefined,
                    notes: data.notes?.trim() || undefined,
                    glyphs: selectedGlyphs.map((glyph, index) => ({
                        glyph_id: glyph.id,
                        position: index
                    })),
                    phonemes: data.pronunciations
                        ?.filter(p => p.pronunciation && p.pronunciation.trim() !== '')
                        .map(p => ({
                            phoneme: p.pronunciation.trim(),
                            use_in_auto_spelling: p.useInAutoSpelling
                        })) || []
                };

                // Save to database via API
                const result = api.grapheme.create(graphemeInput);

                if (!result.success) {
                    throw new Error(result.error?.message || 'Failed to save grapheme');
                }

                console.log("[NewGraphemeForm] Saved grapheme:", result.data);

                // Reset form
                setSelectedGlyphs([]);

                return { success: true, data: result.data };
            } catch (error) {
                console.error("[NewGraphemeForm] Failed to save:", error);

                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to save grapheme'
                };
            }
        }
    });

    // Show loading state while database initializes
    if (isLoading) {
        return <div className={classNames(styles.formContainer)}>Loading database...</div>;
    }

    // Show error if database failed to initialize
    if (error) {
        return <div className={classNames(styles.formContainer)}>Database error: {error.message}</div>;
    }

    return (
        <>
            <SmartForm
                {...formProps}
                registerField={registerField}
                unregisterField={unregisterField}
                isFormValid={isFormValid}
                className={classNames(styles.formContainer)}
            >
                <h2 className={graphic.underlineHighlightColorPrimary}>
                    New Grapheme
                </h2>

                {/* Glyph Selection Area */}
                <div className={classNames(styles.glyphSelectionContainer)}>
                    <h3>Glyphs</h3>
                    <div className={classNames(styles.glyphSelectionBox)}>
                        {selectedGlyphs.length === 0 ? (
                            <p className={styles.emptyState}>No glyphs selected</p>
                        ) : (
                            <div className={classNames(styles.selectedGlyphs)}>
                                {selectedGlyphs.map((glyph) => (
                                    <div key={glyph.id} className={styles.glyphItem}>
                                        <IconButton
                                            type="button"
                                            iconName={'trash'}
                                            onClick={() => handleRemoveGlyph(glyph.id)}
                                            className={styles.removeButton}
                                            aria-label="Remove glyph"
                                            title="Remove glyph"
                                        />
                                        <div
                                            className={styles.glyphSvg}
                                            dangerouslySetInnerHTML={{ __html: glyph.svg_data }}
                                        />
                                        <span className={styles.glyphName}>{glyph.name}</span>
                                        {glyph.category && (
                                            <span className={styles.glyphCategory}>({glyph.category})</span>
                                        )}
                                    </div>
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
                        maxRows={10}
                        requirePronunciation={true}
                    />
                </div>

                <IconButton
                    className={classNames(styles.saveGraphemeButton, buttonStyles.primary)}
                >
                    Save Grapheme
                </IconButton>
            </SmartForm>

            {/* Glyph Creation Modal */}
            <NewGlyphModal
                isOpen={isGlyphModalOpen}
                setIsOpen={setIsGlyphModalOpen}
                onGlyphCreated={handleGlyphCreated}
            />
        </>
    );
}
