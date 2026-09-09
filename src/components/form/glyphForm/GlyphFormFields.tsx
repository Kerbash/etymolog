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
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import HoverToolTip from "cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx";
import NumberedSectionHeader from "cyber-components/graphics/decor/numbered-section-header";
import LabelShiftTextInput from "smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx";
import SvgDrawerInput from "smart-form/input/basic/svgDrawerInput/svgDrawerInput.tsx";
import TextInputValidatorFactory from "smart-form/commonValidatorFactory/textValidatorFactory/textValidatorFactory.ts";
import type { registerFieldReturnType } from "smart-form/types";
import { flex, sizing } from "utils-styles";

import type { Glyph } from "../../../db";
import { GLYPH_GUIDE_INSET } from "../../../db/utils/glyphMetrics";
import { GlyphImageImport, GlyphImagePreview, type GlyphImportMode } from "../glyphImport";
import { GLYPH_INK } from "./glyphInk";

import styles from "./glyphFormFields.module.scss";

/**
 * True when stored glyph markup is a raster IMPORT — it carries an `<image>`
 * element the drawing canvas cannot parse back into pen strokes. Such a glyph
 * is shown in the read-only preview, not loaded into the drawer, so opening it
 * for edit doesn't silently blank it.
 */
function isImageImportSvg(svg: string | null | undefined): boolean {
    return !!svg && /<image[\s>]/i.test(svg);
}

/** Classify an image-import SVG for the preview caption. */
function detectImportMode(svg: string): GlyphImportMode {
    // The line-art codec pairs a <mask> with a currentColor <rect>; a
    // keep-colors import is a bare <image> with neither.
    return /<mask[\s>]/i.test(svg) && /currentColor/i.test(svg) ? "line-art" : "keep-colors";
}

/** State for an active import being previewed in place of the canvas. */
interface ActiveImport {
    svg: string;
    mode: GlyphImportMode;
}

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

    // An imported image is previewed here rather than loaded into the canvas,
    // which cannot render an `<image>`/`<mask>`. Edit mode opens straight into
    // the preview when the stored glyph is itself an import.
    const [imported, setImported] = useState<ActiveImport | null>(() =>
        mode === "edit" && isImageImportSvg(initialData?.svg_data)
            ? { svg: initialData!.svg_data, mode: detectImportMode(initialData!.svg_data) }
            : null,
    );

    const glyphNameValidation = useMemo(
        () =>
            TextInputValidatorFactory({
                required: { value: true, message: "Glyph name is required" },
            }),
        [],
    );

    // The canvas seeds from the stored SVG only when that SVG is something the
    // canvas can actually draw — an image-import glyph starts the drawer blank
    // (its markup lives in the preview instead).
    const drawerDefault =
        mode === "edit" && initialData?.svg_data && !isImageImportSvg(initialData.svg_data)
            ? initialData.svg_data
            : undefined;

    const glyphSvgField = registerField("glyphSvg", {
        defaultValue: drawerDefault,
    });

    // The last SVG written into the hidden input. `registerField` returns a
    // FRESH object every render, so this effect's deps change every render and
    // it runs on every commit — the ref makes the body a no-op once a given
    // import is written, which is what stops the state-setters below from
    // looping (set → render → effect → set …). Reset when the import clears.
    const writtenSvgRef = useRef<string | null>(null);

    // Import mode binds `glyphSvg` to a hidden input we write imperatively;
    // SmartForm collects the field from `ref.current.value` at submit, so the
    // imported markup must sit in that node's value. Written in an effect (not
    // during render) once the input has mounted.
    useEffect(() => {
        if (!imported) {
            writtenSvgRef.current = null;
            return;
        }
        if (writtenSvgRef.current === imported.svg) return;
        const el = glyphSvgField.registerSmartFieldProps.ref?.current as
            | HTMLInputElement
            | null;
        if (!el) return;
        writtenSvgRef.current = imported.svg;
        el.value = imported.svg;
        glyphSvgField.fieldState.isEmpty.setIsEmpty(false);
        glyphSvgField.fieldState.isTouched.setIsTouched(true);
        // Prefilling an existing import on edit-open must NOT dirty the form (a
        // create form or an untouched edit would trip the leave guard); a fresh
        // user import must. The stored glyph, if any, is the baseline.
        glyphSvgField.fieldState.isChanged.setIsChanged(imported.svg !== initialData?.svg_data);
    }, [imported, glyphSvgField, initialData]);

    const handleImport = useCallback((svg: string, importMode: GlyphImportMode) => {
        setImported({ svg, mode: importMode });
    }, []);

    const handleClearImport = useCallback(() => {
        setImported(null);
        // Back to a blank canvas: the field's value now comes from the drawer,
        // whose ref has no writable `.value`, so only the flags are reset here.
        glyphSvgField.fieldState.isEmpty.setIsEmpty(true);
        glyphSvgField.fieldState.isTouched.setIsTouched(true);
        glyphSvgField.fieldState.isChanged.setIsChanged(initialData?.svg_data != null);
    }, [glyphSvgField, initialData]);

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
                    {imported ? (
                        <>
                            <GlyphImagePreview
                                svg={imported.svg}
                                mode={imported.mode}
                                onClear={handleClearImport}
                                className={styles.drawerField}
                            />
                            {/* `glyphSvg` binds to this hidden input while an
                                import is active; the effect above writes its
                                value. */}
                            <input
                                type="hidden"
                                ref={
                                    glyphSvgField.registerSmartFieldProps
                                        .ref as React.Ref<HTMLInputElement>
                                }
                                name={glyphSvgField.registerSmartFieldProps.name}
                            />
                        </>
                    ) : (
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
                    )}
                </div>

                <GlyphImageImport onImport={handleImport} />
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
