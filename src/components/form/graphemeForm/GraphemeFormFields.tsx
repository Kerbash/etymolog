/**
 * GraphemeFormFields
 * -------------------
 * The fields of the grapheme form — the ordered glyph list, the name, the
 * category, the notes and the pronunciation table. It renders no form element
 * and no buttons; the owning page supplies the `<SmartForm>` and the action bar.
 *
 * Three things changed here in Phase 7:
 *
 *  - **Glyph ORDER is editable.** `position` has always been persisted, and the
 *    glyph order is what the spelling engine lays out — but the only way to
 *    change it was to remove every glyph and re-add them in the right sequence.
 *    The list is a cyber `ReorderableList` now (pointer drag AND keyboard, with
 *    its own announcements).
 *  - **"Select existing glyph" works.** It shipped `disabled` with the title
 *    "(coming soon)", so reusing a mark meant drawing it a second time. It
 *    opens {@link GlyphPickerModal} — the shared gallery in selection mode.
 *  - **Editing a glyph is a LINK, not a modal.** `EditGlyphModal` is gone: a
 *    modal inside a modal-adjacent form is where the app's two nested-editing
 *    bugs lived, and the glyph edit page is a real URL that can be returned to.
 *    The link is a sibling of the card, never inside it (no nested anchors).
 *
 * Phase 2 of the block-script epic added the grapheme's FORMS: the glyph
 * section is the DEFAULT form, and "Other forms" ({@link VariantsSection})
 * holds the rest. Both glyph lists use the one {@link GlyphListEditor}. The
 * forms are page state like the glyph list (`variants` / `defaultForm`), never
 * SmartForm fields — see `variantDrafts.ts` for the model and for why "Make
 * default" is an identity swap.
 *
 * `registerField()` runs on every render by SmartForm's contract — it registers
 * once internally and returns fresh state each time; caching it produces stale
 * values.
 */

import classNames from "classnames";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import NumberedSectionHeader from "cyber-components/graphics/decor/numbered-section-header";
import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory.ts";
import type { registerFieldReturnType } from "smart-form/types";
import { flex, sizing } from "utils-styles";

import { useEtymolog, type Glyph, type GraphemeComplete } from "../../../db";
import { PronunciationTableInput, type PronunciationRowValue } from "../customInput/pronunciationTableInput";
import GlyphListEditor from "./GlyphListEditor";
import VariantsSection from "./VariantsSection";
import {
    categoryForNoSoundKind,
    initialIsLogogram,
    initialNoSoundKind,
    type NoSoundKind,
} from "./logogramOption";
import {
    DEFAULT_FORM_NAME,
    initialDefaultForm,
    initialVariantDrafts,
    makeDraftDefault,
    type DefaultFormDraft,
    type VariantDraft,
} from "./variantDrafts";

import styles from "./graphemeFormFields.module.scss";

export interface GraphemeFormFieldsProps {
    /**
     * SmartForm's `registerField`. The options bag is deliberately loose — its
     * shape differs per input type and SmartForm validates it internally.
     */
    registerField: (name: string, options: Record<string, unknown>) => registerFieldReturnType;
    mode: 'create' | 'edit';
    /** The grapheme being edited. Required in `edit` mode. */
    initialData?: GraphemeComplete | null;
    className?: string;
    /** Reports the glyph list (in order) upward — it is not a form field value. */
    onSelectedGlyphsChange?: (glyphs: Glyph[]) => void;
    /** Controlled glyph list. Omit to let the component own it. */
    selectedGlyphs?: Glyph[];
    /** Pre-filled pronunciations, e.g. arriving from an IPA chart cell. */
    defaultPronunciations?: PronunciationRowValue[];
    /**
     * Reports the "No sound" choice upward — plain state, like the glyph
     * list, not a form field. When true the grapheme is saved with NO
     * pronunciations. Which KIND of no-sound sign it is (a word symbol or a
     * mark, `logogramOption.ts`) is not reported: it lives only in the
     * category field, which the kind radios stamp.
     */
    onIsLogogramChange?: (isLogogram: boolean) => void;
    /**
     * Controlled "other forms" (every non-default variant). Omit to let the
     * component own them; `onVariantsChange` reports them either way.
     */
    variants?: VariantDraft[];
    onVariantsChange?: (variants: VariantDraft[]) => void;
    /**
     * Controlled identity of the DEFAULT form (its glyphs are
     * `selectedGlyphs`). Changes only through "Make default".
     */
    defaultForm?: DefaultFormDraft;
    onDefaultFormChange?: (defaultForm: DefaultFormDraft) => void;
}

// `initialVariantDrafts` / `initialDefaultForm` live in `variantDrafts.ts`
// (re-exported by the folder index) — a component module may only export
// components (react-refresh).
export type { VariantDraft, DefaultFormDraft };

/** The shape `GraphemeFormFields` produces on submit. */
export interface GraphemeFormData {
    graphemeName: string;
    category?: string;
    notes?: string;
    pronunciations: PronunciationRowValue[];
}

export type { PronunciationRowValue };

/** The "What kind of sign is it?" radios under "No sound", in display order. */
const NO_SOUND_KINDS: readonly { value: NoSoundKind; name: string; description: string }[] = [
    {
        value: 'wordSymbol',
        name: 'A word symbol (logogram)',
        description: 'Stands for a whole word or idea.',
    },
    {
        value: 'mark',
        name: 'A mark',
        description:
            'Added to other signs, like a vowel-killer or an accent. It is never used on its own in auto-spelling.',
    },
];

/** Write a value into an uncontrolled SmartForm input and sync its field state. */
function setSmartFieldValue(field: registerFieldReturnType, value: string): void {
    const el = field.registerSmartFieldProps.ref?.current as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
    if (!el) return;

    el.value = value;
    field.fieldState.isEmpty.setIsEmpty(value.trim() === '');
    field.fieldState.isTouched.setIsTouched(true);
    field.fieldState.isChanged.setIsChanged(true);

    if (field.utils.validatorFunction) {
        field.fieldState._setValidation(field.utils.validatorFunction(value));
    }
}

/** Read the current value of an uncontrolled SmartForm input. */
function getSmartFieldValue(field: registerFieldReturnType): string {
    const el = field.registerSmartFieldProps.ref?.current as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
    return el?.value ?? '';
}

/**
 * Controlled-or-internal state: the controlled value wins when given; the
 * internal one is reported upward so the owner can still read it.
 */
function useControllable<T>(
    controlled: T | undefined,
    onChange: ((value: T) => void) | undefined,
    initial: () => T,
): [T, (next: T) => void] {
    const [internal, setInternal] = useState<T>(initial);
    const value = controlled ?? internal;
    const update = useCallback(
        (next: T) => {
            if (controlled !== undefined) onChange?.(next);
            else setInternal(next);
        },
        [controlled, onChange],
    );
    useEffect(() => {
        if (controlled === undefined) onChange?.(internal);
    }, [internal, controlled, onChange]);
    return [value, update];
}

export default function GraphemeFormFields({
    registerField,
    mode,
    initialData,
    className,
    onSelectedGlyphsChange,
    selectedGlyphs: controlledSelectedGlyphs,
    defaultPronunciations: propDefaultPronunciations,
    onIsLogogramChange,
    variants: controlledVariants,
    onVariantsChange,
    defaultForm: controlledDefaultForm,
    onDefaultFormChange,
}: GraphemeFormFieldsProps) {
    const sectionId = useId();
    const { data } = useEtymolog();
    const initializedRef = useRef(false);

    const [isLogogram, setIsLogogram] = useState<boolean>(() => initialIsLogogram(mode, initialData));
    useEffect(() => {
        onIsLogogramChange?.(isLogogram);
    }, [isLogogram, onIsLogogramChange]);

    const [internalSelectedGlyphs, setInternalSelectedGlyphs] = useState<Glyph[]>(() =>
        mode === 'edit' && initialData?.glyphs ? initialData.glyphs : [],
    );
    const selectedGlyphs = controlledSelectedGlyphs ?? internalSelectedGlyphs;

    const [variants, setVariants] = useControllable<VariantDraft[]>(
        controlledVariants,
        onVariantsChange,
        () => initialVariantDrafts(mode, initialData),
    );
    const [defaultForm, setDefaultForm] = useControllable<DefaultFormDraft>(
        controlledDefaultForm,
        onDefaultFormChange,
        () => initialDefaultForm(mode, initialData),
    );

    const updateSelectedGlyphs = useCallback(
        (glyphsOrUpdater: Glyph[] | ((prev: Glyph[]) => Glyph[])) => {
            if (controlledSelectedGlyphs !== undefined) {
                const next =
                    typeof glyphsOrUpdater === 'function'
                        ? glyphsOrUpdater(controlledSelectedGlyphs)
                        : glyphsOrUpdater;
                onSelectedGlyphsChange?.(next);
            } else {
                setInternalSelectedGlyphs(glyphsOrUpdater);
            }
        },
        [controlledSelectedGlyphs, onSelectedGlyphsChange],
    );

    // Uncontrolled mode still reports upward, so the owning page can submit the
    // list without duplicating the state.
    useEffect(() => {
        if (controlledSelectedGlyphs === undefined && onSelectedGlyphsChange) {
            onSelectedGlyphsChange(internalSelectedGlyphs);
        }
    }, [internalSelectedGlyphs, controlledSelectedGlyphs, onSelectedGlyphsChange]);

    const defaultPronunciations: PronunciationRowValue[] = useMemo(() => {
        if (propDefaultPronunciations && propDefaultPronunciations.length > 0) {
            return propDefaultPronunciations;
        }
        if (mode === 'edit' && initialData?.phonemes && initialData.phonemes.length > 0) {
            return initialData.phonemes.map((p) => ({
                pronunciation: p.phoneme,
                useInAutoSpelling: p.use_in_auto_spelling,
            }));
        }
        return [{ pronunciation: '', useInAutoSpelling: true }];
    }, [mode, initialData?.phonemes, propDefaultPronunciations]);

    const graphemeNameValidation = useMemo(
        () =>
            TextInputValidatorFactory({
                required: { value: true, message: "Grapheme name is required" },
            }),
        [],
    );

    const graphemeNameField = registerField("graphemeName", {
        defaultValue: mode === 'edit' && initialData?.name ? initialData.name : undefined,
        validation: graphemeNameValidation,
    });
    const categoryField = registerField("category", {
        defaultValue: mode === 'edit' && initialData?.category ? initialData.category : undefined,
    });
    const notesField = registerField("notes", {
        defaultValue: mode === 'edit' && initialData?.notes ? initialData.notes : undefined,
    });
    const pronunciationsField = registerField("pronunciations", {
        defaultValue: defaultPronunciations,
    });

    // Edit mode: push the stored values into the uncontrolled inputs once the
    // refs exist. Deferred out of the render phase — these set SmartForm state.
    useEffect(() => {
        if (mode !== 'edit' || !initialData || initializedRef.current) return;
        initializedRef.current = true;

        const timer = setTimeout(() => {
            if (initialData.name) setSmartFieldValue(graphemeNameField, initialData.name);
            if (initialData.category) setSmartFieldValue(categoryField, initialData.category);
            if (initialData.notes) setSmartFieldValue(notesField, initialData.notes);
        }, 0);
        return () => clearTimeout(timer);
    }, [mode, initialData, graphemeNameField, categoryField, notesField]);

    // The first glyph seeds the grapheme's identity, but only into fields the
    // user has left empty. Deferred: the list update has not rendered yet.
    const handleDefaultGlyphAdded = useCallback(
        (glyph: Glyph, wasFirst: boolean) => {
            if (!wasFirst) return;
            setTimeout(() => {
                if (getSmartFieldValue(graphemeNameField).trim() === '' && glyph.name) {
                    setSmartFieldValue(graphemeNameField, glyph.name);
                }
                if (getSmartFieldValue(categoryField).trim() === '' && glyph.category) {
                    setSmartFieldValue(categoryField, glyph.category);
                }
            }, 0);
        },
        [graphemeNameField, categoryField],
    );

    // The kind of no-sound sign ("No sound" → word symbol or mark). Plain
    // state: the kind itself is not saved — only the category it stamps is.
    const [noSoundKind, setNoSoundKind] = useState<NoSoundKind>(() => initialNoSoundKind(mode, initialData));

    // Stamp the kind's category, but only over an empty category or the OTHER
    // kind's own one — never over a category the user typed.
    const applyKindCategory = (kind: NoSoundKind) => {
        const category = categoryForNoSoundKind(getSmartFieldValue(categoryField), kind);
        if (category !== null) setSmartFieldValue(categoryField, category);
    };

    const handleDefaultGlyphsChange = useCallback(
        (next: Glyph[]) => updateSelectedGlyphs(next),
        [updateSelectedGlyphs],
    );

    const handleMakeDefault = useCallback(
        (key: string) => {
            const next = makeDraftDefault(
                { defaultGlyphs: selectedGlyphs, defaultForm, variants },
                key,
            );
            updateSelectedGlyphs(next.defaultGlyphs);
            setDefaultForm(next.defaultForm);
            setVariants(next.variants);
        },
        [selectedGlyphs, defaultForm, variants, updateSelectedGlyphs, setDefaultForm, setVariants],
    );

    // The default form's own name/group only differ from the service's
    // "Default"/none after a "Make default" — say so, since nothing else would.
    const defaultGroupName =
        defaultForm.groupId === null
            ? null
            : (data.variantGroups.find((g) => g.id === defaultForm.groupId)?.name ?? null);
    const showDefaultIdentity = defaultForm.name !== DEFAULT_FORM_NAME || defaultGroupName !== null;

    return (
        <div className={classNames(flex.flexColumn, flex.flexGapM, className)}>
            <section className={styles.section} aria-labelledby={`${sectionId}-glyphs`}>
                {/* `NumberedSectionHeader` hardcodes an <h2>; the page's
                    PageHeader owns that level, so sections are level 3. */}
                <NumberedSectionHeader
                    number="01"
                    title="Glyphs (default form)"
                    parts={{ title: { id: `${sectionId}-glyphs`, 'aria-level': 3 } }}
                />

                {showDefaultIdentity && (
                    <p className={styles.formIdentity}>
                        Default form: <strong>{defaultForm.name.trim() || DEFAULT_FORM_NAME}</strong>
                        {' · '}
                        {defaultGroupName ?? 'no group'}
                    </p>
                )}

                <GlyphListEditor
                    glyphs={selectedGlyphs}
                    onChange={handleDefaultGlyphsChange}
                    onGlyphAdded={handleDefaultGlyphAdded}
                    listLabel="Glyphs in this grapheme, in writing order"
                    emptyText="No glyphs yet — draw one, or reuse a glyph you already have."
                    preventRemovingLast={mode === 'edit'}
                />
            </section>

            <section className={styles.section} aria-labelledby={`${sectionId}-forms`}>
                <NumberedSectionHeader
                    number="02"
                    title="Other forms"
                    parts={{ title: { id: `${sectionId}-forms`, 'aria-level': 3 } }}
                />

                <VariantsSection
                    variants={variants}
                    onChange={setVariants}
                    onMakeDefault={handleMakeDefault}
                    defaultGroupId={defaultForm.groupId}
                />
            </section>

            <section className={styles.section} aria-labelledby={`${sectionId}-details`}>
                <NumberedSectionHeader
                    number="03"
                    title="Details"
                    parts={{ title: { id: `${sectionId}-details`, 'aria-level': 3 } }}
                />

                <div className={classNames(flex.flexColumn, flex.flexGapM)}>
                    <HoverToolTip content="The name of the grapheme">
                        <LabelShiftTextInput
                            displayName="Grapheme name"
                            asInput
                            {...graphemeNameField}
                        />
                    </HoverToolTip>

                    <HoverToolTip content="Category to organise your graphemes (e.g. Vowels, Consonants, Numbers). Inherited from the first glyph, but you can change it.">
                        <LabelShiftTextInput displayName="Category" asInput {...categoryField} />
                    </HoverToolTip>

                    <HoverToolTip
                        className={sizing.parentWidth}
                        content="Additional notes, usage examples, or etymology information"
                    >
                        <LabelShiftTextInput
                            displayName="Notes"
                            asInput={false}
                            {...notesField}
                        />
                    </HoverToolTip>
                </div>
            </section>

            <section className={styles.section} aria-labelledby={`${sectionId}-pronunciation`}>
                <NumberedSectionHeader
                    number="04"
                    title="Pronunciation"
                    parts={{ title: { id: `${sectionId}-pronunciation`, 'aria-level': 3 } }}
                />

                <label className={styles.logogramToggle}>
                    <input
                        type="checkbox"
                        checked={isLogogram}
                        onChange={(e) => {
                            const next = e.target.checked;
                            setIsLogogram(next);
                            // A no-sound grapheme with no category yet gets the
                            // one its kind is recognised by.
                            if (next) applyKindCategory(noSoundKind);
                        }}
                    />
                    <span>No sound</span>
                </label>

                {isLogogram && (
                    <fieldset className={styles.noSoundKind} data-no-sound-kind="">
                        <legend className={styles.noSoundKindLegend}>What kind of sign is it?</legend>
                        {NO_SOUND_KINDS.map((kind) => (
                            <label key={kind.value} className={styles.noSoundKindOption}>
                                <input
                                    type="radio"
                                    name={`${sectionId}-no-sound-kind`}
                                    value={kind.value}
                                    checked={noSoundKind === kind.value}
                                    onChange={() => {
                                        setNoSoundKind(kind.value);
                                        applyKindCategory(kind.value);
                                    }}
                                />
                                <span className={styles.noSoundKindText}>
                                    <span className={styles.noSoundKindName}>{kind.name}</span>
                                    <span className={styles.noSoundKindDescription}>{kind.description}</span>
                                </span>
                            </label>
                        ))}
                    </fieldset>
                )}

                {isLogogram && noSoundKind === 'wordSymbol' && (
                    <p className={styles.logogramNote}>
                        A logogram stands for a whole word or idea rather than a sound, so it has no
                        pronunciation and auto-spell never uses it. Give a word this spelling from
                        the word form&rsquo;s Logogram tab.
                    </p>
                )}
                {isLogogram && noSoundKind === 'mark' && (
                    <p className={styles.logogramNote}>
                        A mark has no sound of its own, so it has no pronunciation. Choose it as the
                        vowel-killer mark on Writing System &rarr; Blocks, or place it in a word by hand.
                    </p>
                )}

                {/* Kept MOUNTED while hidden: the table is a registered
                    SmartForm field, and unmounting it would leave the form
                    holding a dead ref. Not required while it is a logogram,
                    and its rows are ignored on submit. */}
                <div hidden={isLogogram}>
                    <PronunciationTableInput
                        {...pronunciationsField}
                        defaultValue={defaultPronunciations}
                        maxRows={10}
                        requirePronunciation={!isLogogram}
                    />
                </div>
            </section>
        </div>
    );
}
