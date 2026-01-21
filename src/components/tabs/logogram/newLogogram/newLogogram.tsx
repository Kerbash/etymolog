import styles from "./newLogogram.module.scss";
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

export default function NewLogogramForm() {
    const {registerField, unregisterField, registerForm, isFormValid} = useSmartForm({mode: "onChange"});
    // create the form
    const formProps = registerForm("logogramForm", {
        submitFunc: async (formData) => {
            console.log("Submitting logogram form data:", formData);
            // Here you would typically send the data to your backend or process it as needed
            return { success: true, data: formData };
        }
    });

    return (
        <SmartForm 
            {...formProps} 
            registerField={registerField} 
            unregisterField={unregisterField}
            isFormValid={isFormValid}
            className={classNames(styles.formContainer)}
        >
            <h2 className={graphic.underlineHighlightColorPrimary}>
                New Logogram
            </h2>
            <div className={classNames(flex.flexCol, flex.flexGapM)}>
                <div className={classNames(sizing.parentWidth, flex.flex, flex.justifyContentCenter)}>
                    {/* SVG Drawing Canvas */}
                    <HoverToolTip
                        className={classNames(sizing.fitContent)}
                        content={"Draw your script character or logogram here"}
                    >
                        <SvgDrawerInput
                            {...registerField("logogramSvg", {})}
                        />
                    </HoverToolTip>
                </div>

                {/* Script name Input */}
                <HoverToolTip content={"The name of the scipt character or logogram"}>
                    <LabelShiftTextInput
                        displayName={"Logogram Name"}
                        asInput={true}
                        {...registerField("logogramName", {
                            validation: TextInputValidatorFactory({
                                required: {
                                    value: true,
                                    message: "Logogram name is required"
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
                className={classNames(styles.saveLogogramButton, buttonStyles.primary)}
            >
                Save Logogram
            </IconButton>
        </SmartForm>
    );
}