/**
 * GraphemeEditPage — `/script-maker/grapheme/db/:id`.
 *
 * The edit half of the grapheme CRUD pair.
 *
 * Delete goes through {@link useGraphemeDelete}, the same two-stage flow the
 * gallery card uses: an ordinary danger confirmation, and — only when words are
 * spelled with this grapheme — a second dialog that names them and explains
 * what respelling will do before it happens.
 */

import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

// NAMED import — the index has no default export; see LexiconEditor.
import { NavigationGuard } from "cyber-components/container/navigationGuard";
import { SmartForm, useSmartForm } from "smart-form/smartForm";

import { useEtymolog, type Glyph } from "../../../../db";
import { ROUTES } from "../../../../url_mapping";
import { GraphemeFormFields, useGraphemeSubmit } from "../../../form/graphemeForm";
import { DialogPanel } from "../../../shared";
import { useRegisterUnsaved } from "../../../shell";
import EntityEditLayout from "../entityEdit/EntityEditLayout";
import { useGraphemeDelete } from "../useGraphemeDelete";

import styles from "../entityEdit/entityEditPage.module.scss";

function GuardCard({ children }: { closeModal: () => void; children: React.ReactNode }) {
    return <DialogPanel size="sm">{children}</DialogPanel>;
}

export default function GraphemeEditPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { api, isReady, error } = useEtymolog();
    const deleteGrapheme = useGraphemeDelete();
    const { registerField, unregisterField, registerForm } = useSmartForm({ mode: "onChange" });

    const graphemeId = id ? Number.parseInt(id, 10) : NaN;
    const result = Number.isNaN(graphemeId) ? null : api.grapheme.getByIdComplete(graphemeId);
    const graphemeData = result?.success ? (result.data ?? null) : null;

    /**
     * The glyph list, DERIVED rather than seeded.
     *
     * `null` means "the user has not touched it", so the stored order shows
     * through — including on the first render after the database finishes
     * booting, when `graphemeData` arrives. Seeding a `useState` from an effect
     * instead (the shape this replaces) renders one frame with an empty list,
     * writes state during commit, and re-renders: a cascade React's
     * `set-state-in-effect` rule exists to flag.
     */
    const [glyphEdits, setGlyphEdits] = useState<Glyph[] | null>(null);
    const selectedGlyphs = glyphEdits ?? graphemeData?.glyphs ?? [];

    const handleSuccess = useCallback(() => navigate(ROUTES.scriptMaker), [navigate]);

    const submitFunc = useGraphemeSubmit({
        mode: 'edit',
        initialData: graphemeData,
        glyphs: selectedGlyphs,
        onSuccess: handleSuccess,
    });

    const formProps = registerForm("editGraphemeForm", { submitFunc, lockFormOnSubmit: false });

    // A reorder or a removed glyph is unsaved work too, and it never touches a
    // form FIELD — `isChanged` alone would report "nothing to lose" for a
    // grapheme whose glyph order the user has just rearranged.
    const isDirty =
        (formProps.formState.isChanged || glyphEdits !== null) &&
        !formProps.formState.isSubmitting;
    useRegisterUnsaved("edit-grapheme", isDirty);

    const handleDelete = useCallback(async () => {
        if (!graphemeData) return;
        const deleted = await deleteGrapheme({ id: graphemeData.id, name: graphemeData.name });
        if (deleted) navigate(ROUTES.scriptMaker);
    }, [deleteGrapheme, graphemeData, navigate]);

    const fatal = error
        ? { title: "The database could not be opened", description: error.message }
        : isReady && !graphemeData
          ? {
                icon: "question-circle",
                title: "That grapheme does not exist",
                description: "It may have been deleted, or the link may be wrong.",
            }
          : null;

    return (
        <EntityEditLayout
            title={graphemeData ? `Edit grapheme "${graphemeData.name}"` : "Edit grapheme"}
            back={{ to: ROUTES.scriptMaker, label: "Graphemes" }}
            onCancel={() => navigate(ROUTES.scriptMaker)}
            submitLabel="Save changes"
            submitDisabled={!formProps.formState.isSubmittable}
            isReady={isReady}
            fatal={fatal}
            danger={{ label: "Delete grapheme", onClick: () => void handleDelete() }}
            overlays={
                <NavigationGuard
                    active={isDirty}
                    modalCardTemplate={GuardCard}
                    translationMap={{
                        title: "Leave without saving?",
                        message:
                            "This grapheme has changes that have not been saved. Leaving now discards them.",
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
                    <GraphemeFormFields
                        registerField={registerField}
                        mode="edit"
                        initialData={graphemeData}
                        selectedGlyphs={selectedGlyphs}
                        onSelectedGlyphsChange={setGlyphEdits}
                    />
                    {actionBar}
                </SmartForm>
            )}
        </EntityEditLayout>
    );
}
