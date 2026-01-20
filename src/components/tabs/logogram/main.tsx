import {SmartForm, useSmartForm} from "smart-form/smartForm";
import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import SvgDrawerInput from "smart-form/input/basic/svgDrawerInput/svgDrawerInput.tsx";
import BasicCustomKeyboardTextInput, {IPA_CHARACTERS} from "smart-form/input/basic/basicCustomKeyboardTextInput";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import classNames from "classnames";
import {flex, sizing} from "utils-styles";

export default function LogogramMain() {
    const {registerField, registerForm} = useSmartForm({mode: "onChange"});

    return (
        <SmartForm {...registerForm("logogramForm")}>
            <div className={classNames(flex.flexCol, flex.flexGapM)}>
                {/* Script Name Field */}
                <HoverToolTip
                    className={classNames(sizing.parentWidth)}
                    content={"The name or identifier for this script/logogram"}
                >
                    <LabelShiftTextInput
                        displayName={"Name"}
                        {...registerField("logogramName", {})}
                    />
                </HoverToolTip>

                {/* SVG Drawing Canvas */}
                <HoverToolTip
                    content={"Draw your script character or logogram here"}
                >
                    <SvgDrawerInput
                        displayName={"Script Drawing"}
                        {...registerField("logogramSvg", {})}
                    />
                </HoverToolTip>

                {/* Pronunciation Field with IPA Keyboard */}
                <HoverToolTip
                    className={classNames(sizing.parentWidth)}
                    content={"The pronunciation using the International Phonetic Alphabet (IPA)"}
                >
                    <BasicCustomKeyboardTextInput
                        registerField={registerField}
                        name="pronunciation"
                        characters={IPA_CHARACTERS}
                        placeholder="Click to enter IPA pronunciation"
                    />
                </HoverToolTip>

                {/* Meaning / Definition Field */}
                <HoverToolTip
                    className={classNames(sizing.parentWidth)}
                    content={"The meaning or definition of this logogram"}
                >
                    <LabelShiftTextInput
                        displayName={"Meaning"}
                        {...registerField("meaning", {})}
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
        </SmartForm>
    );
}
