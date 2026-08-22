/**
 * GlyphForm
 * ---------
 * A SELF-CONTAINED glyph form: it owns its `<SmartForm>`, its fields and its
 * action bar.
 *
 * This is the shape the nested "new glyph while composing a grapheme" modal
 * needs — a modal has no page around it to own the form state, and the whole
 * point of that modal is that the grapheme form behind it stays untouched. The
 * two glyph PAGES do not use it: they own their SmartForm directly so their
 * `EntityEditLayout` can render the shared action bar (with the separated
 * delete) and read `isSubmittable` from the same place every other page does.
 *
 * Submission itself is shared with those pages through {@link useGlyphSubmit},
 * so "what saving a glyph means" is defined once.
 */

import classNames from "classnames";

import { SmartForm, useSmartForm } from "smart-form/smartForm";

import type { Glyph } from "../../../db";
import { FormActionBar } from "../../shared";
import GlyphFormFields from "./GlyphFormFields";
import { useGlyphSubmit } from "./useGlyphSubmit";

import styles from "./glyphForm.module.scss";

export interface GlyphFormProps {
    mode: "create" | "edit";
    /** The glyph being edited. Required in `edit` mode. */
    initialData?: Glyph | null;
    /** Called with the saved glyph. */
    onSuccess: (glyph: Glyph) => void;
    onCancel: () => void;
    className?: string;
}

export default function GlyphForm({
    mode,
    initialData,
    onSuccess,
    onCancel,
    className,
}: GlyphFormProps) {
    const { registerField, unregisterField, registerForm } = useSmartForm({ mode: "onChange" });
    const submitFunc = useGlyphSubmit({ mode, initialData, onSuccess });

    // `lockFormOnSubmit` off: every SQLite call here is synchronous and
    // in-memory, so the lock modal would flash for a single frame.
    const formProps = registerForm(mode === "create" ? "createGlyphForm" : "editGlyphForm", {
        submitFunc,
        lockFormOnSubmit: false,
    });

    return (
        <SmartForm
            {...formProps}
            registerField={registerField}
            unregisterField={unregisterField}
            className={classNames(styles.form, className)}
        >
            <GlyphFormFields registerField={registerField} mode={mode} initialData={initialData} />

            <FormActionBar
                onCancel={onCancel}
                submitLabel={mode === "create" ? "Create glyph" : "Save changes"}
                disabled={!formProps.formState.isSubmittable}
            />
        </SmartForm>
    );
}
