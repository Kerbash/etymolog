import styles from "./newGrapheme.module.scss";
import {graphic} from "utils-styles";

import classNames from "classnames";
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import {SmartForm, useSmartForm} from "smart-form/smartForm";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import {buttonStyles} from "cyber-components/interactable/buttons/button/button";
import { useEtymolog, type Glyph, type CreateGraphemeRequest } from "../../../../db";
import { GraphemeFormFields, type GraphemeFormData } from "../../../form/graphemeForm";

export default function NewGraphemeForm() {
    const {registerField, unregisterField, registerForm, isFormValid} = useSmartForm({mode: "onChange"});
    const navigate = useNavigate();

    // Use the unified context
    const { api, isLoading, error } = useEtymolog();

    // State for glyph selection - managed here to access in submit handler
    const [selectedGlyphs, setSelectedGlyphs] = useState<Glyph[]>([]);

    // Handle glyph selection changes from the form fields
    const handleSelectedGlyphsChange = useCallback((glyphs: Glyph[]) => {
        setSelectedGlyphs(glyphs);
    }, []);

    // Register form with submission handler
    const formProps = registerForm("graphemeForm", {
        submitFunc: async (formData) => {
            try {
                const data = formData as unknown as GraphemeFormData;

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

                // Navigate to the newly created grapheme's edit page
                if (result.data && (result.data as any).id) {
                    navigate(`/script-maker/grapheme/db/${(result.data as any).id}`);
                } else {
                    // fallback to main script-maker page
                    navigate('/script-maker');
                }

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

            <GraphemeFormFields
                registerField={registerField}
                mode="create"
                selectedGlyphs={selectedGlyphs}
                onSelectedGlyphsChange={handleSelectedGlyphsChange}
            />

            <IconButton
                className={classNames(styles.saveGraphemeButton, buttonStyles.primary)}
                type="submit"
            >
                Save Grapheme
            </IconButton>
        </SmartForm>
    );
}
