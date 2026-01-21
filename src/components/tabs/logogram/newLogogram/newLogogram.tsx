import {flex, graphic, sizing} from "utils-styles";

import classNames from "classnames";

import {SmartForm, useSmartForm} from "smart-form/smartForm";
import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import SvgDrawerInput from "smart-form/input/basic/svgDrawerInput/svgDrawerInput.tsx";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory.ts";
import PronunciationForm from "../pronunciation/pronunciation.tsx";

const exampleSyllableStructure = {
    // Primary constituents
    onset: "Onset",
    nucleus: "Nucleus",
    coda: "Coda"
}

export default function NewLogogramForm() {
    const {registerField, registerForm} = useSmartForm({mode: "onChange"});

    return (
        <SmartForm {...registerForm("logogramForm")}>
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
                <PronunciationForm/>
            </div>
        </SmartForm>
    );
}