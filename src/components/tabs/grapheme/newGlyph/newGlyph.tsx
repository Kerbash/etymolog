import styles from "./newGlyph.module.scss";
import { flex, graphic, sizing } from "utils-styles";

import classNames from "classnames";

import { SmartForm, useSmartForm } from "smart-form/smartForm";
import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import SvgDrawerInput from "smart-form/input/basic/svgDrawerInput/svgDrawerInput.tsx";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory.ts";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import { PronunciationTableInput } from "../../../form/customInput/pronunciationTableInput";
import { buttonStyles } from "cyber-components/interactable/buttons/button/button";
import {
    useGlyphs,
    useGraphemes
} from "../../../../db";

/**
 * NewGlyphForm - Creates a new glyph and optionally a grapheme with pronunciations.
 *
 * This form handles the most common workflow:
 * 1. Draw a glyph (atomic visual symbol)
 * 2. Give it a name
 * 3. Add pronunciations
 * 4. Save → Creates both a glyph AND a grapheme using that glyph
 */
export default function NewGlyphForm() {
    const { registerField, unregisterField, registerForm, isFormValid } = useSmartForm({ mode: "onChange" });

    // Use both hooks - glyphs for creating the visual symbol, graphemes for refresh
    const { create: createGlyph, isLoading: glyphsLoading, error: glyphsError, refresh: refreshGlyphs } = useGlyphs();
    const { create: createGrapheme, isLoading: graphemesLoading, error: graphemesError, refresh: refreshGraphemes } = useGraphemes();

    const isLoading = glyphsLoading || graphemesLoading;
    const error = glyphsError || graphemesError;

    // Register form with submission handler
    const formProps = registerForm("glyphForm", {
        submitFunc: async (formData) => {
            try {
                const data = formData as unknown as {
                    glyphSvg: string;
                    glyphName: string;
                    notes?: string;
                    pronunciations: Array<{
                        pronunciation: string;
                        useInAutoSpelling: boolean;
                    }>;
                };

                // Validate required fields
                if (!data.glyphSvg || data.glyphSvg.trim() === '') {
                    throw new Error('Please draw a script character');
                }
                if (!data.glyphName || data.glyphName.trim() === '') {
                    throw new Error('Glyph name is required');
                }

                // Step 1: Create the glyph (atomic visual symbol)
                const glyph = await createGlyph({
                    name: data.glyphName.trim(),
                    svg_data: data.glyphSvg,
                    notes: data.notes?.trim() || undefined
                });

                console.log("[NewGlyphForm] Created glyph:", glyph);

                // Step 2: Create a grapheme using this glyph (with same name)
                const grapheme = await createGrapheme({
                    name: data.glyphName.trim(),
                    notes: data.notes?.trim() || undefined,
                    glyphs: [{
                        glyph_id: glyph.id,
                        position: 0
                    }],
                    phonemes: (data.pronunciations || [])
                        .filter(p => p.pronunciation && p.pronunciation.trim() !== '')
                        .map(p => ({
                            phoneme: p.pronunciation.trim(),
                            use_in_auto_spelling: p.useInAutoSpelling
                        }))
                });

                console.log("[NewGlyphForm] Created grapheme:", grapheme);

                // Refresh both stores
                refreshGlyphs();
                refreshGraphemes();

                return {
                    success: true,
                    data: { glyph, grapheme }
                };
            } catch (error) {
                console.error("[NewGlyphForm] Failed to save:", error);

                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to save'
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
                New Glyph
            </h2>
            <div className={classNames(flex.flexCol, flex.flexGapM)}>
                <div className={classNames(sizing.parentWidth, flex.flex, flex.justifyContentCenter)}>
                    {/* SVG Drawing Canvas */}
                    <HoverToolTip
                        className={classNames(sizing.fitContent)}
                        content={"Draw your glyph (script character) here"}
                    >
                        <SvgDrawerInput
                            {...registerField("glyphSvg", {})}
                        />
                    </HoverToolTip>
                </div>

                {/* Glyph name Input */}
                <HoverToolTip content={"The name of this glyph"}>
                    <LabelShiftTextInput
                        displayName={"Glyph Name"}
                        asInput={true}
                        {...registerField("glyphName", {
                            validation: TextInputValidatorFactory({
                                required: {
                                    value: true,
                                    message: "Glyph name is required"
                                },
                            })
                        })}
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
                        {...registerField("notes", {})}
                    />
                </HoverToolTip>
            </div>

            <h2 className={graphic.underlineHighlightColorPrimary}>
                Pronunciation
            </h2>
            <div>
                <PronunciationTableInput
                    {...registerField("pronunciations", {})}
                    maxRows={10}
                    requirePronunciation={true}
                />
            </div>

            <IconButton
                className={classNames(styles.saveGlyphButton, buttonStyles.primary)}
            >
                Save Glyph
            </IconButton>
        </SmartForm>
    );
}
