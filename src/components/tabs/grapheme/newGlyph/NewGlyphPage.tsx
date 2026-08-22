/**
 * NewGlyphPage — `/script-maker/glyphs/create`.
 *
 * The create half of the glyph CRUD pair. Same layout, same fields, same submit
 * handler as the edit page; the only differences are the title, the button
 * label and the absence of a delete.
 *
 * Unsaved-changes protection is wired TWICE, as on every other form in the app,
 * because the two mechanisms cover disjoint exits: `NavigationGuard` catches
 * what leaves the DOCUMENT (reload, close, back, anchor clicks) and
 * `useRegisterUnsaved` catches in-app react-router navigation, which never
 * touches an anchor — the Graphemes/Glyphs tab strip is exactly that.
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

// NAMED import: that index re-exports the component by name only, and a default
// import resolves to `undefined` at RUNTIME while typechecking cleanly.
import { NavigationGuard } from "cyber-components/container/navigationGuard";
import { SmartForm, useSmartForm } from "smart-form/smartForm";

import type { Glyph } from "../../../../db";
import { useEtymolog } from "../../../../db";
import { ROUTES, resolveUrl } from "../../../../url_mapping";
import { GlyphFormFields, useGlyphSubmit } from "../../../form/glyphForm";
import { DialogPanel, useNotify } from "../../../shared";
import { useRegisterUnsaved } from "../../../shell";
import EntityEditLayout from "../entityEdit/EntityEditLayout";

import styles from "../entityEdit/entityEditPage.module.scss";

/** The app's skin for `NavigationGuard`'s otherwise headless modal. */
function GuardCard({ children }: { closeModal: () => void; children: React.ReactNode }) {
    return <DialogPanel size="sm">{children}</DialogPanel>;
}

export default function NewGlyphPage() {
    const navigate = useNavigate();
    const notify = useNotify();
    const { isReady, error } = useEtymolog();
    const { registerField, unregisterField, registerForm } = useSmartForm({ mode: "onChange" });

    const handleSuccess = useCallback(
        (glyph: Glyph) => {
            notify.success(`Created glyph "${glyph.name}".`);
            navigate(resolveUrl(ROUTES.glyphEdit, { id: glyph.id }));
        },
        [navigate, notify],
    );

    const submitFunc = useGlyphSubmit({ mode: "create", onSuccess: handleSuccess });

    const formProps = registerForm("createGlyphForm", {
        submitFunc,
        lockFormOnSubmit: false,
    });

    // `!isSubmitting` is load-bearing: `isChanged` stays true through submission
    // until the redirect fires, so without it the user is asked to confirm
    // leaving during their own successful save.
    const isDirty = formProps.formState.isChanged && !formProps.formState.isSubmitting;
    useRegisterUnsaved("new-glyph", isDirty);

    return (
        <EntityEditLayout
            title="New glyph"
            description="A glyph is one drawn mark. Graphemes are built from them."
            back={{ to: ROUTES.glyphs, label: "Glyphs" }}
            onCancel={() => navigate(ROUTES.glyphs)}
            submitLabel="Create glyph"
            submitDisabled={!formProps.formState.isSubmittable}
            isReady={isReady || Boolean(error)}
            fatal={
                error
                    ? { title: "The database could not be opened", description: error.message }
                    : null
            }
            overlays={
                <NavigationGuard
                    active={isDirty}
                    modalCardTemplate={GuardCard}
                    translationMap={{
                        title: "Leave without saving?",
                        message: "This glyph has not been saved. Leaving now discards the drawing.",
                        leaveButton: "Discard and leave",
                        stayButton: "Stay on this page",
                    }}
                />
            }
        >
            {(actionBar) => (
                <SmartForm
                    {...formProps}
                    registerField={registerField}
                    unregisterField={unregisterField}
                    className={styles.form}
                >
                    <GlyphFormFields registerField={registerField} mode="create" />
                    {actionBar}
                </SmartForm>
            )}
        </EntityEditLayout>
    );
}
