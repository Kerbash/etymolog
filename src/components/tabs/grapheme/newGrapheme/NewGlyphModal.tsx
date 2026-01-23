import { useState, useRef } from "react";
import classNames from "classnames";
import Modal from "cyber-components/container/modal/modal";
import { SmartForm, useSmartForm } from "smart-form/smartForm";
import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import SvgDrawerInput from "smart-form/input/basic/svgDrawerInput/svgDrawerInput.tsx";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory.ts";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import { buttonStyles } from "cyber-components/interactable/buttons/button/button";
import { flex, graphic, sizing } from "utils-styles";
import { useEtymologApi, type Glyph } from "../../../../db";
import styles from "./newGrapheme.module.scss";

interface NewGlyphModalProps {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    onGlyphCreated: (glyph: Glyph) => void;
}

export default function NewGlyphModal({ isOpen, setIsOpen, onGlyphCreated }: NewGlyphModalProps) {
    const { registerField, unregisterField, registerForm, isFormValid } = useSmartForm({ mode: "onChange" });
    const [error, setError] = useState<string | null>(null);
    const isSubmittingRef = useRef(false);
    const api = useEtymologApi();

    const handleClose = () => {
        setError(null);
        isSubmittingRef.current = false;
        setIsOpen(false);
    };

    const formProps = registerForm("newGlyphForm", {
        submitFunc: async (formData) => {
            // Prevent double submission
            if (isSubmittingRef.current) {
                console.log("[NewGlyphModal] Already submitting, skipping...");
                return { success: false, error: 'Already submitting' };
            }
            isSubmittingRef.current = true;

            try {
                setError(null);

                const data = formData as unknown as {
                    glyphSvg: string;
                    glyphName: string;
                    category?: string;
                    notes?: string;
                };

                // Validate required fields
                if (!data.glyphSvg || data.glyphSvg.trim() === '') {
                    isSubmittingRef.current = false;
                    throw new Error('Please draw a glyph');
                }
                if (!data.glyphName || data.glyphName.trim() === '') {
                    isSubmittingRef.current = false;
                    throw new Error('Glyph name is required');
                }

                // Create the glyph via API
                const result = api.glyph.create({
                    name: data.glyphName.trim(),
                    svg_data: data.glyphSvg,
                    category: data.category?.trim() || undefined,
                    notes: data.notes?.trim() || undefined
                });

                if (!result.success) {
                    throw new Error(result.error?.message || 'Failed to create glyph');
                }

                const glyph = result.data!;
                console.log("[NewGlyphModal] Created glyph:", glyph);

                // Close the modal first
                setError(null);
                isSubmittingRef.current = false;
                setIsOpen(false);

                // Notify parent after a short delay so the modal close has propagated
                setTimeout(() => onGlyphCreated(glyph), 20);

                return { success: true, data: glyph };
            } catch (err) {
                isSubmittingRef.current = false;
                const errorMessage = err instanceof Error ? err.message : 'Failed to create glyph';
                setError(errorMessage);
                console.error("[NewGlyphModal] Error:", err);

                return {
                    success: false,
                    error: errorMessage
                };
            }
        }
    });

    return (
        <Modal
            isOpen={isOpen}
            setIsOpen={setIsOpen}
            onClose={handleClose}
            allowClose={true}
        >
            <div className={classNames(styles.modalContent)}>
                <h2 className={graphic.underlineHighlightColorPrimary}>
                    Create New Glyph
                </h2>

                {error && (
                    <div className={styles.errorMessage}>
                        {error}
                    </div>
                )}

                <SmartForm
                    {...formProps}
                    registerField={registerField}
                    unregisterField={unregisterField}
                    isFormValid={isFormValid}
                    className={classNames(flex.flexCol, flex.flexGapM)}
                >
                    <div className={classNames(sizing.parentWidth, flex.flex, flex.justifyContentCenter)}>
                        {/* SVG Drawing Canvas */}
                        <HoverToolTip
                            className={classNames(sizing.fitContent)}
                            content={"Draw your glyph here"}
                        >
                            <SvgDrawerInput
                                {...registerField("glyphSvg", {})}
                            />
                        </HoverToolTip>
                    </div>

                    {/* Glyph Name Input */}
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

                    {/* Category Input */}
                    <HoverToolTip content={"Category to organize your glyphs (e.g., Vowels, Consonants, Numbers)"}>
                        <LabelShiftTextInput
                            displayName={"Category"}
                            asInput={true}
                            {...registerField("category", {})}
                        />
                    </HoverToolTip>

                    {/* Notes Input */}
                    <HoverToolTip
                        className={classNames(sizing.parentWidth)}
                        content={"Additional notes about this glyph"}
                    >
                        <LabelShiftTextInput
                            displayName={"Notes"}
                            asInput={false}
                            {...registerField("notes", {})}
                        />
                    </HoverToolTip>

                    <div className={classNames(flex.flex, flex.flexGapM, styles.modalButtons)}>
                        <IconButton
                            className={classNames(buttonStyles.primary)}
                            type="submit"
                        >
                            Save Glyph
                        </IconButton>
                        <IconButton
                            className={classNames(buttonStyles.secondary)}
                            onClick={handleClose}
                            type="button"
                        >
                            Cancel
                        </IconButton>
                    </div>
                </SmartForm>
            </div>
        </Modal>
    );
}
