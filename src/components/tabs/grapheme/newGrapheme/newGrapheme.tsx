import styles from "./newGrapheme.module.scss";
import {flex, graphic, sizing} from "utils-styles";

import classNames from "classnames";

import {SmartForm, useSmartForm} from "smart-form/smartForm";
import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import SvgDrawerInput from "smart-form/input/basic/svgDrawerInput/svgDrawerInput.tsx";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory.ts";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import {PronunciationTableInput} from "../../../form/customInput/pronunciationTableInput";
import {buttonStyles} from "cyber-components/interactable/buttons/button/button";
import { useGraphemes, transformFormToGraphemeInput, type GraphemeFormData } from "../../../../db";

export default function NewGraphemeForm() {
    const {registerField, unregisterField, registerForm, isFormValid} = useSmartForm({mode: "onChange"});

    // Use the graphemes hook - this automatically initializes the database
    const { create, isLoading, error } = useGraphemes();

    // Register form with submission handler
    const formProps = registerForm("graphemeForm", {
        submitFunc: async (formData) => {
            try {
                // Transform form data to database input format
                const graphemeInput = transformFormToGraphemeInput(formData as unknown as GraphemeFormData);

                // Validate required fields
                if (!graphemeInput.svg_data || graphemeInput.svg_data.trim() === '') {
                    throw new Error('Please draw a script character');
                }
                if (!graphemeInput.name || graphemeInput.name.trim() === '') {
                    throw new Error('Grapheme name is required');
                }

                // Save to database using the hook's create function
                const grapheme = await create(graphemeInput);

                console.log("[NewGraphemeForm] Saved grapheme:", grapheme);

                return { success: true, data: grapheme };
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
            <div className={classNames(flex.flexCol, flex.flexGapM)}>
                <div className={classNames(sizing.parentWidth, flex.flex, flex.justifyContentCenter)}>
                    {/* SVG Drawing Canvas */}
                    <HoverToolTip
                        className={classNames(sizing.fitContent)}
                        content={"Draw your script character or grapheme here"}
                    >
                        <SvgDrawerInput
                            {...registerField("graphemeSvg", {})}
                        />
                    </HoverToolTip>
                </div>

                {/* Script name Input */}
                <HoverToolTip content={"The name of the script character or grapheme"}>
                    <LabelShiftTextInput
                        displayName={"Grapheme Name"}
                        asInput={true}
                        {...registerField("graphemeName", {
                            validation: TextInputValidatorFactory({
                                required: {
                                    value: true,
                                    message: "Grapheme name is required"
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
                className={classNames(styles.saveGraphemeButton, buttonStyles.primary)}
            >
                Save Grapheme
            </IconButton>
        </SmartForm>
    );
}
