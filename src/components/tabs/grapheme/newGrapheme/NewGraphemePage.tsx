/**
 * NewGraphemePage — `/script-maker/create`.
 *
 * The create half of the grapheme CRUD pair. It gained a Cancel: the only way
 * out used to be a "Back to Gallery" link floating above the form, which is not
 * where anyone looks for the escape from a form they have decided against.
 *
 * `?phoneme=…` pre-fills the pronunciation table — that is how the IPA,
 * syllabary and custom charts hand an unassigned sound over to be given a
 * grapheme.
 */

import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

// NAMED import — the index has no default export; see LexiconEditor.
import { NavigationGuard } from "cyber-components/container/navigationGuard";
import { SmartForm, useSmartForm } from "smart-form/smartForm";

import { useEtymolog, type Glyph } from "../../../../db";
import { ROUTES, resolveUrl } from "../../../../url_mapping";
import { GraphemeFormFields, useGraphemeSubmit } from "../../../form/graphemeForm";
import { DialogPanel } from "../../../shared";
import { useRegisterUnsaved } from "../../../shell";
import EntityEditLayout from "../entityEdit/EntityEditLayout";

import styles from "../entityEdit/entityEditPage.module.scss";

function GuardCard({ children }: { closeModal: () => void; children: React.ReactNode }) {
    return <DialogPanel size="sm">{children}</DialogPanel>;
}

export default function NewGraphemePage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { isReady, error } = useEtymolog();
    const { registerField, unregisterField, registerForm } = useSmartForm({ mode: "onChange" });

    // The glyph list is not a form FIELD — it is an ordered list of records —
    // so it lives here and is handed to the submit handler directly.
    const [selectedGlyphs, setSelectedGlyphs] = useState<Glyph[]>([]);

    const prefilledPhoneme = searchParams.get('phoneme') || undefined;
    const defaultPronunciations = useMemo(
        () =>
            prefilledPhoneme
                ? [{ pronunciation: prefilledPhoneme, useInAutoSpelling: true }]
                : undefined,
        [prefilledPhoneme],
    );

    const handleSuccess = useCallback(
        (graphemeId: number) => navigate(resolveUrl(ROUTES.graphemeEdit, { id: graphemeId })),
        [navigate],
    );

    const submitFunc = useGraphemeSubmit({
        mode: 'create',
        glyphs: selectedGlyphs,
        onSuccess: handleSuccess,
    });

    const formProps = registerForm("createGraphemeForm", {
        submitFunc,
        lockFormOnSubmit: false,
    });

    // Glyphs picked but not yet saved are unsaved work too — `isChanged` alone
    // would say "nothing to lose" for a grapheme with three glyphs on it and no
    // text typed.
    const isDirty =
        (formProps.formState.isChanged || selectedGlyphs.length > 0) &&
        !formProps.formState.isSubmitting;
    useRegisterUnsaved("new-grapheme", isDirty);

    return (
        <EntityEditLayout
            title={prefilledPhoneme ? `New grapheme for "${prefilledPhoneme}"` : "New grapheme"}
            description="A grapheme is one or more glyphs standing for a sound."
            back={{ to: ROUTES.scriptMaker, label: "Graphemes" }}
            onCancel={() => navigate(ROUTES.scriptMaker)}
            submitLabel="Create grapheme"
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
                        message:
                            "This grapheme has not been saved. Leaving now discards it.",
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
                        mode="create"
                        selectedGlyphs={selectedGlyphs}
                        onSelectedGlyphsChange={setSelectedGlyphs}
                        defaultPronunciations={defaultPronunciations}
                    />
                    {actionBar}
                </SmartForm>
            )}
        </EntityEditLayout>
    );
}
