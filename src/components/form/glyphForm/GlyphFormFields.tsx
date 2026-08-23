/**
 * GlyphFormFields
 * ----------------
 * The fields of the glyph form — the drawing canvas, the name, the category and
 * the notes. It renders NO form element and NO buttons: the owner (a page or
 * the nested-create modal) supplies the `<SmartForm>` and the action bar, which
 * is what lets create, edit and the modal share exactly one set of fields.
 *
 * ## One colour, and it is the reader's
 *
 * The canvas is restricted to a SINGLE ink (`GLYPH_INK`, in `glyphInk.ts`) and it is
 * `currentColor`, so `SvgDrawer` renders no colour picker at all. Two problems
 * go away together:
 *
 *  - eleven swatches invited a two-colour glyph, which a script cannot have;
 *  - whatever was picked got BAKED into the stored `fill`/`stroke`, so a glyph
 *    drawn in black vanished the moment the reader switched to the dark theme.
 *
 * `normalizeGlyphSvg` re-applies the rule on save for markup that did not come
 * from this canvas (older glyphs, imports).
 *
 * ## The guide square is the cell
 *
 * The canvas paints a guide square inset `GLYPH_GUIDE_INSET` from every edge
 * (`db/utils/glyphMetrics`). That square is the space the glyph RESERVES in a
 * word; the margin around it is space the glyph may reach into but does not
 * own — the layout engine advances letters by the square, so margins overlap
 * and a tail drawn there lands beside the next letter. Canvas and layout read
 * the one constant, so the guide the author sees is the geometry the word uses.
 *
 * `registerField()` is called on EVERY render on purpose — that is SmartForm's
 * contract. It registers once internally and returns fresh state each render;
 * caching the result in a ref is what produces stale-value bugs.
 */

import classNames from "classnames";
import { useEffect, useId, useMemo, useRef } from "react";

import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import NumberedSectionHeader from "cyber-components/graphics/decor/numbered-section-header";
import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import SvgDrawerInput from "smart-form/input/basic/svgDrawerInput/svgDrawerInput.tsx";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory.ts";
import type { registerFieldReturnType } from "smart-form/types";
import { flex, sizing } from "utils-styles";

import type { Glyph } from "../../../db";
import { GLYPH_GUIDE_INSET } from "../../../db/utils/glyphMetrics";
import { GLYPH_INK } from "./glyphInk";

import styles from "./glyphFormFields.module.scss";

export interface GlyphFormFieldsProps {
    /**
     * SmartForm's `registerField`. The options bag is deliberately loose — its
     * shape differs per input type and SmartForm validates it internally.
     */
    registerField: (name: string, options: Record<string, unknown>) => registerFieldReturnType;
    mode: 'create' | 'edit';
    /** The glyph being edited. Required in `edit` mode. */
    initialData?: Glyph | null;
    className?: string;
}

/** The shape `GlyphFormFields` produces on submit. */
export interface GlyphFormData {
    glyphSvg: string;
    glyphName: string;
    category?: string;
    notes?: string;
}

export default function GlyphFormFields({
    registerField,
    mode,
    initialData,
    className,
}: GlyphFormFieldsProps) {
    const sectionId = useId();
    // Guards the one-shot "push the existing values into the DOM" effect below.
    const initializedRef = useRef(false);

    const glyphNameValidation = useMemo(
        () =>
            TextInputValidatorFactory({
                required: { value: true, message: "Glyph name is required" },
            }),
        [],
    );

    const glyphSvgField = registerField("glyphSvg", {
        defaultValue: mode === 'edit' && initialData?.svg_data ? initialData.svg_data : undefined,
    });

    const glyphNameField = registerField("glyphName", {
        defaultValue: mode === 'edit' && initialData?.name ? initialData.name : undefined,
        validation: glyphNameValidation,
    });

    const categoryField = registerField("category", {
        defaultValue: mode === 'edit' && initialData?.category ? initialData.category : undefined,
    });

    const notesField = registerField("notes", {
        defaultValue: mode === 'edit' && initialData?.notes ? initialData.notes : undefined,
    });

    // Edit mode: the inputs are uncontrolled, so the existing values have to be
    // written into the DOM once the refs exist. Deferred out of the render
    // phase — these calls set SmartForm state.
    useEffect(() => {
        if (mode !== 'edit' || !initialData || initializedRef.current) return;
        initializedRef.current = true;

        const timer = setTimeout(() => {
            const write = (field: registerFieldReturnType, value: string | null | undefined) => {
                const el = field.registerSmartFieldProps.ref?.current as
                    | HTMLInputElement
                    | HTMLTextAreaElement
                    | null;
                if (!el || !value) return;
                el.value = value;
                field.fieldState.isEmpty.setIsEmpty(false);
            };
            write(glyphNameField, initialData.name);
            write(categoryField, initialData.category);
            write(notesField, initialData.notes);
        }, 0);

        return () => clearTimeout(timer);
    }, [mode, initialData, glyphNameField, categoryField, notesField]);

    return (
        <div className={classNames(flex.flexColumn, flex.flexGapM, className)}>
            <section className={styles.section} aria-labelledby={`${sectionId}-drawing`}>
                {/* `NumberedSectionHeader` hardcodes an <h2>; the page's
                    PageHeader owns that level, so the sections are level 3. */}
                <NumberedSectionHeader
                    number="01"
                    title="Drawing"
                    parts={{ title: { id: `${sectionId}-drawing`, 'aria-level': 3 } }}
                />

                <div className={classNames(sizing.parentWidth, flex.flex, flex.justifyContentCenter)}>
                    <HoverToolTip
                        className={styles.drawerField}
                        content={mode === 'edit' ? "Edit your glyph drawing" : "Draw your glyph here"}
                    >
                        <SvgDrawerInput
                            displayName="Glyph drawing"
                            colors={GLYPH_INK}
                            guideInset={GLYPH_GUIDE_INSET}
                            {...glyphSvgField}
                        />
                    </HoverToolTip>
                </div>
            </section>

            <section className={styles.section} aria-labelledby={`${sectionId}-details`}>
                <NumberedSectionHeader
                    number="02"
                    title="Details"
                    parts={{ title: { id: `${sectionId}-details`, 'aria-level': 3 } }}
                />

                <div className={classNames(flex.flexColumn, flex.flexGapM)}>
                    <HoverToolTip content="The name of this glyph">
                        <LabelShiftTextInput displayName="Glyph name" asInput {...glyphNameField} />
                    </HoverToolTip>

                    <HoverToolTip content="Category to organise your glyphs (e.g. Vowels, Consonants, Numbers)">
                        <LabelShiftTextInput displayName="Category" asInput {...categoryField} />
                    </HoverToolTip>

                    <HoverToolTip
                        className={sizing.parentWidth}
                        content="Additional notes about this glyph"
                    >
                        <LabelShiftTextInput displayName="Notes" asInput={false} {...notesField} />
                    </HoverToolTip>
                </div>
            </section>
        </div>
    );
}
