/**
 * GlyphEditPage — `/script-maker/glyphs/db/:id`.
 *
 * The edit half of the glyph CRUD pair, on the same `EntityEditLayout` as
 * every other Script Maker form.
 *
 * Delete is a CASCADE: a grapheme cannot exist without its glyphs, so the
 * graphemes that use this one go with it. The confirmation names them in its
 * `extra` slot — a count alone ("3 graphemes will be deleted") tells the user
 * how much they are about to lose but not WHAT, which is the one thing they
 * need in order to answer.
 */

import { useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

// NAMED import — the index has no default export; see LexiconEditor.
import { NavigationGuard } from "cyber-components/container/navigationGuard";
import { SmartForm, useSmartForm } from "smart-form/smartForm";

import { useEtymolog } from "../../../../db";
import { ROUTES } from "../../../../url_mapping";
import { GlyphFormFields, useGlyphSubmit } from "../../../form/glyphForm";
import { DialogPanel, useApiAction, useConfirm, useNotify } from "../../../shared";
import { useRegisterUnsaved } from "../../../shell";
import EntityEditLayout from "../entityEdit/EntityEditLayout";

import styles from "../entityEdit/entityEditPage.module.scss";

function GuardCard({ children }: { closeModal: () => void; children: React.ReactNode }) {
    return <DialogPanel size="sm">{children}</DialogPanel>;
}

export default function GlyphEditPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const notify = useNotify();
    const confirm = useConfirm();
    const runApiAction = useApiAction();
    const { api, data, isReady, error } = useEtymolog();
    const { registerField, unregisterField, registerForm } = useSmartForm({ mode: "onChange" });

    const glyphId = id ? Number.parseInt(id, 10) : NaN;
    const glyphResult = Number.isNaN(glyphId) ? null : api.glyph.getById(glyphId);
    const glyphData = glyphResult?.success ? (glyphResult.data ?? null) : null;

    /** The graphemes that would be deleted along with this glyph. */
    const affectedGraphemes = useMemo(
        () =>
            (data.graphemesComplete ?? []).filter((grapheme) =>
                grapheme.glyphs.some((glyph) => glyph.id === glyphId),
            ),
        [data.graphemesComplete, glyphId],
    );

    const handleSuccess = useCallback(() => {
        notify.success("Glyph saved.");
        navigate(ROUTES.glyphs);
    }, [navigate, notify]);

    const submitFunc = useGlyphSubmit({
        mode: "edit",
        initialData: glyphData,
        onSuccess: handleSuccess,
    });

    const formProps = registerForm("editGlyphForm", { submitFunc, lockFormOnSubmit: false });

    const isDirty = formProps.formState.isChanged && !formProps.formState.isSubmitting;
    useRegisterUnsaved("edit-glyph", isDirty);

    const handleDelete = useCallback(async () => {
        if (!glyphData) return;

        const confirmed = await confirm({
            title: `Delete glyph "${glyphData.name}"?`,
            message: affectedGraphemes.length
                ? `${affectedGraphemes.length} grapheme${affectedGraphemes.length === 1 ? '' : 's'} ` +
                  'built from this glyph will be deleted with it. This cannot be undone.'
                : 'This cannot be undone.',
            confirmLabel: "Delete glyph",
            tone: "danger",
            extra: affectedGraphemes.length ? (
                <div className={styles.affectedList}>
                    {affectedGraphemes.map((grapheme) => (
                        <p key={grapheme.id} className={styles.affectedItem}>
                            {grapheme.name}
                        </p>
                    ))}
                </div>
            ) : undefined,
        });
        if (!confirmed) return;

        const result = await runApiAction(() => api.glyph.cascadeDelete(glyphData.id), {
            errorTitle: "Could not delete glyph",
            success: `Deleted "${glyphData.name}".`,
        });
        if (result.success) navigate(ROUTES.glyphs);
    }, [affectedGraphemes, api.glyph, confirm, glyphData, navigate, runApiAction]);

    const fatal = error
        ? { title: "The database could not be opened", description: error.message }
        : isReady && !glyphData
          ? {
                icon: "question-circle",
                title: "That glyph does not exist",
                description: "It may have been deleted, or the link may be wrong.",
            }
          : null;

    return (
        <EntityEditLayout
            title={glyphData ? `Edit glyph "${glyphData.name}"` : "Edit glyph"}
            back={{ to: ROUTES.glyphs, label: "Glyphs" }}
            onCancel={() => navigate(ROUTES.glyphs)}
            submitLabel="Save changes"
            submitDisabled={!formProps.formState.isSubmittable}
            isReady={isReady}
            fatal={fatal}
            danger={{ label: "Delete glyph", onClick: () => void handleDelete() }}
            overlays={
                <NavigationGuard
                    active={isDirty}
                    modalCardTemplate={GuardCard}
                    translationMap={{
                        title: "Leave without saving?",
                        message:
                            "This glyph has changes that have not been saved. Leaving now discards them.",
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
                    <GlyphFormFields
                        registerField={registerField}
                        mode="edit"
                        initialData={glyphData}
                    />
                    {actionBar}
                </SmartForm>
            )}
        </EntityEditLayout>
    );
}
