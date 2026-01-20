import {SmartForm, useSmartForm} from "smart-form/smartForm";
import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import BasicCheckbox from "smart-form/input/basic/checkbox/checkbox.tsx";
import classNames from "classnames";
import {flex, sizing} from "utils-styles";
import DropDownSelectInput from "smart-form/input/basic/dropDownSelect/dropDownSelectInput.tsx";

const PARTS_OF_SPEECH: Record<string, string> = {
    noun: "Noun",
    verb: "Verb",
    adjective: "Adjective",
    adverb: "Adverb",
    pronoun: "Pronoun",
    preposition: "Preposition",
    conjunction: "Conjunction",
    interjection: "Interjection",
    determiner: "Determiner",
    numeral: "Numeral",
    particle: "Particle",
};

export default function CreateLexiconForm() {
    const {registerForm, registerField} = useSmartForm();

    return (
        <SmartForm
            {...registerForm("createLexiconForm")}
        >
            <div>
                <div className={classNames(flex.flexRow, flex.alignItemsCenter, flex.flexGapM)}>
                    {/* Lexicon Name Field */}
                    <HoverToolTip
                        className={classNames(sizing.parentWidth)}
                        content={"The word written in the conlang's script or romanization system"}
                    >
                        <LabelShiftTextInput
                            displayName={"Written Form"}
                            {...registerField("lexiconName", {})}
                        />
                    </HoverToolTip>

                    {/* Part of Speech Field */}
                    <HoverToolTip content={"The part of speech for the lexicon entry (e.g., noun, verb, adjective)"}>
                        <DropDownSelectInput
                            style={{
                                marginBottom: "1em",
                                marginRight: "1em",
                            }}
                            {...registerField("partOfSpeech", {})}
                            map={PARTS_OF_SPEECH}
                        />
                    </HoverToolTip>
                </div>

                {/* Auto generated checkbox (if the written form should be auto generated) */}
                <HoverToolTip
                    className={classNames(sizing.fitContent)}
                    content={"Automatically generate written form from pronunciation using transliteration rules"}
                >
                    <BasicCheckbox
                        displayName={"Auto-generate Written Form"}
                        {...registerField("autoGenerateWrittenForm", {})}
                    />
                </HoverToolTip>

                {/* Pronunciation Field */}
                <HoverToolTip content={"The pronunciation of the word using the International Phonetic Alphabet (IPA)"}>
                    <LabelShiftTextInput
                        displayName={"Pronunciation"}
                        {...registerField("pronunciation", {})}
                    />
                </HoverToolTip>
            </div>
        </SmartForm>
    )
}