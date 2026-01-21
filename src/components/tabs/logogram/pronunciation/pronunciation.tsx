import {SmartForm, useSmartForm} from "smart-form/smartForm";
import PronunciationTableInput from "smart-form/input/fancy/redditStyle/pronunciationTableInput";

export default function PronunciationForm() {
    const {registerField, registerForm} = useSmartForm();

    const pronunciationsField = registerField("pronunciations", {
        validation: {
            validator: (value) => {
                if (!value || value.length === 0) {
                    return {
                        message: "At least one pronunciation is required",
                        type: "error"
                    };
                }
                return null;
            },
            htmlAttrs: {},
            options: {}
        }
    });

    const formProps = registerForm("pronunciationForm", {
        method: "post",
    });

    return (
        <SmartForm as="div" {...formProps}>
            <PronunciationTableInput
                {...pronunciationsField}
                maxRows={10}
                requirePronunciation={true}
            />
        </SmartForm>
    )
}