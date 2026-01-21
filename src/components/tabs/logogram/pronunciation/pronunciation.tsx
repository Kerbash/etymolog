import {SmartForm, useSmartForm} from "smart-form/smartForm";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import BasicCheckbox from "smart-form/input/basic/checkbox/checkbox.tsx";

export default function PronunciationForm() {
    const {registerField, registerForm} = useSmartForm();

    return (
        <SmartForm>
            <HoverToolTip content={"The pronunciation of the logogram"}>
                <LabelShiftTextInput
                    displayName={"Pronunciation"}
                    {...registerField("pronunciation", {})}
                />
            </HoverToolTip>

            <HoverToolTip content={"Is a logogram/pictogram (Will not be used to spell out words)"}>
                <BasicCheckbox
                    displayName={"Is a pictogram/logogram"}
                    {...registerField("isLogogram", {})}
                />
            </HoverToolTip>
        </SmartForm>
    )
}