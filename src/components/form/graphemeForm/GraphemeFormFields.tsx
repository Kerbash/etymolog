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
 * `registerField()` runs on every render by SmartForm's contract — it registers
 * once internally and returns fresh state each time; caching it produces stale
 * values.
 */

import classNames from "classnames";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import ReorderableList from "cyber-components/interactable/reorderableList";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import Button, { buttonStyles } from "cyber-components/interactable/buttons/button";
import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import NumberedSectionHeader from "cyber-components/graphics/decor/numbered-section-header";
import SvgIcon from "cyber-components/graphics/decor/svgIcon/svgIcon";
import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory.ts";
import type { registerFieldReturnType } from "smart-form/types";
import { flex, sizing } from "utils-styles";

import type { Glyph, GraphemeComplete, GlyphWithUsage } from "../../../db";
import { ROUTES, resolveUrl } from "../../../url_mapping";
import GlyphCard from "../../display/glyphs/glyphCard/glyphCard";
import { PronunciationTableInput, type PronunciationRowValue } from "../customInput/pronunciationTableInput";
import NewGlyphModal from "../../tabs/grapheme/newGlyph/NewGlyphModal.tsx";
import GlyphPickerModal from "./GlyphPickerModal";

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
}

/** The shape `GraphemeFormFields` produces on submit. */
export interface GraphemeFormData {
    graphemeName: string;
    category?: string;
    notes?: string;
    pronunciations: PronunciationRowValue[];
}

export type { PronunciationRowValue };

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

/** `GlyphCard` wants a usage count; inside the form there is nothing to count. */
function toGlyphWithUsage(glyph: Glyph): GlyphWithUsage {
    return { ...glyph, usageCount: 0 };
}

export default function GraphemeFormFields({
    registerField,
    mode,
    initialData,
    className,
    onSelectedGlyphsChange,
    selectedGlyphs: controlledSelectedGlyphs,
    defaultPronunciations: propDefaultPronunciations,
}: GraphemeFormFieldsProps) {
    const sectionId = useId();
    const initializedRef = useRef(false);

    const [internalSelectedGlyphs, setInternalSelectedGlyphs] = useState<Glyph[]>(() =>
        mode === 'edit' && initialData?.glyphs ? initialData.glyphs : [],
    );
    const selectedGlyphs = controlledSelectedGlyphs ?? internalSelectedGlyphs;

    const [isNewGlyphOpen, setIsNewGlyphOpen] = useState(false);
    const [isPickerOpen, setIsPickerOpen] = useState(false);

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

    const addGlyph = useCallback(
        (glyph: Glyph) => {
            updateSelectedGlyphs((prev) => {
                if (prev.some((g) => g.id === glyph.id)) return prev;

                const isFirst = prev.length === 0;
                if (isFirst) {
                    // The first glyph seeds the grapheme's identity, but only
                    // into fields the user has left empty. Deferred: this runs
                    // inside a state updater.
                    setTimeout(() => {
                        if (getSmartFieldValue(graphemeNameField).trim() === '' && glyph.name) {
                            setSmartFieldValue(graphemeNameField, glyph.name);
                        }
                        if (getSmartFieldValue(categoryField).trim() === '' && glyph.category) {
                            setSmartFieldValue(categoryField, glyph.category);
                        }
                    }, 0);
                }

                return [...prev, glyph];
            });
        },
        [updateSelectedGlyphs, graphemeNameField, categoryField],
    );

    const removeGlyph = useCallback(
        (glyphId: number) => {
            updateSelectedGlyphs((prev) => prev.filter((g) => g.id !== glyphId));
        },
        [updateSelectedGlyphs],
    );

    const handleReorder = useCallback(
        (newOrderIds: string[]) => {
            updateSelectedGlyphs((prev) => {
                const byId = new Map(prev.map((glyph) => [String(glyph.id), glyph]));
                return newOrderIds
                    .map((id) => byId.get(id))
                    .filter((glyph): glyph is Glyph => glyph !== undefined);
            });
        },
        [updateSelectedGlyphs],
    );

    const selectedIds = useMemo(() => selectedGlyphs.map((g) => g.id), [selectedGlyphs]);

    return (
        <>
            <div className={classNames(flex.flexColumn, flex.flexGapM, className)}>
                <section className={styles.section} aria-labelledby={`${sectionId}-glyphs`}>
                    {/* `NumberedSectionHeader` hardcodes an <h2>; the page's
                        PageHeader owns that level, so sections are level 3. */}
                    <NumberedSectionHeader
                        number="01"
                        title="Glyphs"
                        parts={{ title: { id: `${sectionId}-glyphs`, 'aria-level': 3 } }}
                    />

                    <div className={styles.glyphSelectionBox}>
                        {selectedGlyphs.length === 0 ? (
                            <p className={styles.emptyState}>
                                No glyphs yet — draw one, or reuse a glyph you already have.
                            </p>
                        ) : (
                            <>
                                <p className={styles.orderHint}>
                                    Drag a glyph, or focus its grip and use the arrow keys, to
                                    change the order they are written in.
                                </p>
                                <ReorderableList<Glyph>
                                    items={selectedGlyphs}
                                    getId={(glyph) => String(glyph.id)}
                                    onReorder={handleReorder}
                                    aria-label="Glyphs in this grapheme, in writing order"
                                    className={styles.glyphList}
                                    renderItem={({ item, index, dragHandleProps }) => (
                                        <div className={styles.glyphRow}>
                                            <span
                                                {...dragHandleProps}
                                                className={styles.dragHandle}
                                                aria-label={`Reorder ${item.name}, position ${index + 1} of ${selectedGlyphs.length}`}
                                            >
                                                <SvgIcon iconName="grip-vertical" aria-hidden="true" />
                                            </span>

                                            <span className={styles.glyphPosition}>{index + 1}</span>

                                            <GlyphCard
                                                glyph={toGlyphWithUsage(item)}
                                                interactionMode="none"
                                                hideDelete
                                            />

                                            {/* Siblings of the card, never inside it. */}
                                            <div className={styles.glyphRowActions}>
                                                <IconButton
                                                    as={Link}
                                                    to={resolveUrl(ROUTES.glyphEdit, { id: item.id })}
                                                    iconName="pencil"
                                                    aria-label={`Edit glyph ${item.name}`}
                                                />
                                                <IconButton
                                                    type="button"
                                                    iconName="x-lg"
                                                    onClick={() => removeGlyph(item.id)}
                                                    aria-label={`Remove glyph ${item.name} from this grapheme`}
                                                />
                                            </div>
                                        </div>
                                    )}
                                />
                            </>
                        )}

                        <div className={styles.glyphButtons}>
                            <IconButton
                                iconName="plus-lg"
                                type="button"
                                onClick={() => setIsNewGlyphOpen(true)}
                                className={buttonStyles.primary}
                            >
                                Add new glyph
                            </IconButton>
                            <Button
                                type="button"
                                onClick={() => setIsPickerOpen(true)}
                                className={buttonStyles.secondary}
                            >
                                Select existing glyph
                            </Button>
                        </div>
                    </div>
                </section>

                <section className={styles.section} aria-labelledby={`${sectionId}-details`}>
                    <NumberedSectionHeader
                        number="02"
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
                        number="03"
                        title="Pronunciation"
                        parts={{ title: { id: `${sectionId}-pronunciation`, 'aria-level': 3 } }}
                    />

                    <PronunciationTableInput
                        {...pronunciationsField}
                        defaultValue={defaultPronunciations}
                        maxRows={10}
                        requirePronunciation
                    />
                </section>
            </div>

            <NewGlyphModal
                isOpen={isNewGlyphOpen}
                setIsOpen={setIsNewGlyphOpen}
                onGlyphCreated={addGlyph}
            />

            <GlyphPickerModal
                isOpen={isPickerOpen}
                setIsOpen={setIsPickerOpen}
                onSelect={addGlyph}
                excludeIds={selectedIds}
            />
        </>
    );
}
