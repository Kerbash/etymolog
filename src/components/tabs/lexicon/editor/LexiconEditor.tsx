/**
 * LexiconEditor
 * -------------
 * The ONE word form. Create and edit are the same component in two modes,
 * reached by two routes (`/lexicon/create` and `/lexicon/db/:id/edit`).
 *
 * Before this the app had THREE editing paradigms at once: a create PAGE, an
 * in-page edit MODE toggled on the view page (whose Edit/Delete buttons
 * vanished when it opened, so the layout jumped), and modals for the other
 * entities. The in-page mode also meant an edit had no URL — it could not be
 * linked to, bookmarked, or returned to with the back button, and a reload
 * silently discarded it.
 *
 * Unsaved-changes protection is wired TWICE on purpose, because the two
 * mechanisms cover disjoint sets of exits:
 *
 *  - `NavigationGuard` catches what leaves the DOCUMENT (reload, close, the
 *    back button, same-origin anchor clicks);
 *  - `useRegisterUnsaved` catches in-app react-router navigation, which never
 *    touches an anchor — a primary-nav tab click is exactly that, and it used
 *    to discard the form with no prompt at all.
 *
 * Both read `isChanged && !isSubmitting`. The `!isSubmitting` term is
 * load-bearing: `isChanged` stays true through submission until the redirect
 * fires, so without it the user is asked to confirm leaving during their own
 * successful save (SMART_FORM_GUIDELINE §7).
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

// NAMED import: `container/navigationGuard/index.ts` re-exports the component
// under its name only — there is no default there, and a default import
// resolves to `undefined` at RUNTIME while typechecking cleanly under
// `allowSyntheticDefaultImports`.
import { NavigationGuard } from 'cyber-components/container/navigationGuard';
import EmptyState from 'cyber-components/display/emptyState';
import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';
import { SmartForm, useSmartForm } from 'smart-form/smartForm';
import type { useSmartFormRef } from 'smart-form/types';

import { useEtymolog } from '../../../../db';
import type {
    CreateLexiconInput,
    LexiconAncestorFormRow,
    LexiconComplete,
    UpdateLexiconInput,
} from '../../../../db/types';
import type { SpellingEntry } from '../../../../db/utils/spellingUtils';
import { ROUTES, resolveUrl } from '../../../../url_mapping';
import { LexiconFormFields } from '../../../form/lexiconForm';
import { FormActionBar, LoadingState, PageHeader, useApiAction, useNotify } from '../../../shared';
import { useRegisterUnsaved } from '../../../shell';
import DialogPanel from '../../../shared/dialogPanel';
import { lexiconDisplayName } from '../lexiconIdentity';

import styles from './LexiconEditor.module.scss';

export interface LexiconEditorProps {
    mode: 'create' | 'edit';
    /** The word being edited. Required in `edit` mode. */
    initialData?: LexiconComplete | null;
}

/**
 * The app's skin for `NavigationGuard`'s otherwise headless modal — the same
 * surface every other dialog in the app uses.
 */
function GuardCard({ children }: { closeModal: () => void; children: React.ReactNode }) {
    return <DialogPanel size="sm">{children}</DialogPanel>;
}

export default function LexiconEditor({ mode, initialData }: LexiconEditorProps) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { api, refresh, isReady, error } = useEtymolog();
    const notify = useNotify();
    const runApiAction = useApiAction();

    const { registerField, registerForm } = useSmartForm({ mode: 'onChange' });
    const smartFormRef = useRef<useSmartFormRef>(null);

    // Complex fields report upward rather than living in the form value store:
    // the spelling canvas and the ancestry rows are composite inputs whose
    // shape (`glyph_order`, ordered ancestor rows) is not a form field value.
    const [glyphOrder, setGlyphOrder] = useState<SpellingEntry[]>([]);
    const [ancestors, setAncestors] = useState<LexiconAncestorFormRow[]>([]);
    const [isNative, setIsNative] = useState(initialData?.is_native ?? true);
    const [autoSpell, setAutoSpell] = useState(initialData?.auto_spell ?? true);

    const editingId = mode === 'edit' ? (initialData?.id ?? null) : null;

    /**
     * `/lexicon/create?pronunciation=…` — the word generator's "Edit & add".
     *
     * Read here rather than in the fields so the fields component stays a pure
     * function of its props (it is mounted by three pages and by a test that
     * has no router). Only meaningful in create mode; in edit mode the stored
     * word owns the field.
     */
    const initialPronunciation =
        mode === 'create' ? (searchParams.get('pronunciation') ?? undefined) : undefined;

    const backTo = useMemo(
        () =>
            editingId != null
                ? resolveUrl(ROUTES.lexiconView, { id: editingId })
                : ROUTES.lexicon,
        [editingId],
    );

    const handleSubmit = useCallback(
        async (formData: Record<string, unknown>) => {
            const pronunciation = (formData.pronunciation as string | undefined)?.trim();
            const meanings = (
                formData.meanings as
                    | Array<{ meaning: string; part_of_speech?: string; usage_notes?: string }>
                    | undefined
            )
                ?.filter((m) => m.meaning?.trim())
                .map((m) => ({
                    meaning: m.meaning.trim(),
                    part_of_speech: m.part_of_speech?.trim(),
                    usage_notes: m.usage_notes?.trim(),
                }));

            if (mode === 'create') {
                const input: CreateLexiconInput = {
                    pronunciation: pronunciation || undefined,
                    is_native: isNative,
                    auto_spell: autoSpell,
                    meanings,
                    glyph_order: glyphOrder,
                    ancestry: ancestors.map((a, index) => ({
                        ancestor_id: a.ancestorId,
                        position: index,
                        ancestry_type: a.ancestryType,
                    })),
                };

                const result = await runApiAction(() => api.lexicon.create(input), {
                    errorTitle: 'Could not create the word',
                });
                if (!result.success || !result.data) {
                    return { success: false, message: result.error?.message ?? 'Creation failed' };
                }

                refresh();
                notify.success(`Created "${lexiconDisplayName(result.data)}".`);
                navigate(resolveUrl(ROUTES.lexiconView, { id: result.data.id }));
                return { success: true };
            }

            if (editingId == null) {
                return { success: false, message: 'No word to update' };
            }

            const update: UpdateLexiconInput = {
                // `lemma` is kept populated for backwards compatibility — the
                // lemma INPUT was removed from the form, and pronunciation is
                // the primary identifier everywhere the user can see.
                lemma: (pronunciation || initialData?.lemma || '').trim() || undefined,
                pronunciation: pronunciation || undefined,
                is_native: isNative,
                auto_spell: autoSpell,
                meanings,
                glyph_order: glyphOrder,
            };

            const result = await runApiAction(() => api.lexicon.update(editingId, update), {
                errorTitle: 'Could not save the word',
            });
            if (!result.success) {
                return { success: false, message: result.error?.message ?? 'Update failed' };
            }

            const ancestryResult = api.lexicon.updateAncestry(editingId, {
                ancestry: ancestors.map((a, index) => ({
                    ancestor_id: a.ancestorId,
                    position: index,
                    ancestry_type: a.ancestryType,
                })),
            });
            if (!ancestryResult.success) {
                // A WARNING, not an error: the word itself saved. Genuinely
                // silent before — the only trace of a lost ancestry edit was a
                // console warning behind a success message.
                notify.warning(
                    ancestryResult.error?.message ?? 'The ancestry could not be saved.',
                    { title: 'Word saved, but its ancestry was not' },
                );
            }

            refresh();
            notify.success('Word saved.');
            navigate(resolveUrl(ROUTES.lexiconView, { id: editingId }));
            return { success: true };
        },
        [
            mode,
            editingId,
            initialData,
            glyphOrder,
            ancestors,
            isNative,
            autoSpell,
            api,
            runApiAction,
            refresh,
            notify,
            navigate,
        ],
    );

    // `lockFormOnSubmit` off: every SQLite call here is synchronous and
    // in-memory, so the lock modal would flash for a single frame.
    const formProps = registerForm(mode === 'create' ? 'createLexiconForm' : 'editLexiconForm', {
        submitFunc: handleSubmit,
        lockFormOnSubmit: false,
    });

    const isDirty = formProps.formState.isChanged && !formProps.formState.isSubmitting;
    useRegisterUnsaved('lexicon-editor', isDirty);

    const title =
        mode === 'create'
            ? 'New word'
            : `Edit ${initialData ? lexiconDisplayName(initialData) : 'word'}`;

    if (!isReady && !error) {
        return (
            <>
                <PageHeader title={title} back={{ to: backTo, label: 'Back' }} />
                <LoadingState variant="form" label="Loading the word form" count={5} />
            </>
        );
    }

    if (error) {
        return (
            <EmptyState
                icon="exclamation-triangle"
                title="The database could not be opened"
                description={error.message}
                action={
                    <Button as="a" href={ROUTES.lexicon} className={buttonStyles.secondary}>
                        Back to Lexicon
                    </Button>
                }
            />
        );
    }

    return (
        <>
            <NavigationGuard
                active={isDirty}
                modalCardTemplate={GuardCard}
                translationMap={{
                    title: 'Leave without saving?',
                    message:
                        'This word has changes that have not been saved. Leaving now discards them.',
                    leaveButton: 'Discard and leave',
                    stayButton: 'Stay on this page',
                }}
            />

            <PageHeader
                title={title}
                as="h2"
                back={{
                    to: backTo,
                    label: mode === 'create' ? 'Lexicon' : 'Back to the word',
                }}
                description={
                    mode === 'create'
                        ? 'Type the pronunciation first — auto-spelling reads it to build the spelling.'
                        : undefined
                }
            />

            <SmartForm
                ref={smartFormRef}
                {...formProps}
                registerField={registerField}
                className={styles.form}
            >
                <LexiconFormFields
                    registerField={registerField}
                    mode={mode}
                    initialData={initialData}
                    initialPronunciation={initialPronunciation}
                    onGlyphOrderChange={setGlyphOrder}
                    onAncestorsChange={setAncestors}
                    onIsNativeChange={setIsNative}
                    onAutoSpellChange={setAutoSpell}
                />

                <FormActionBar
                    onCancel={() => navigate(backTo)}
                    submitLabel={mode === 'create' ? 'Create word' : 'Save changes'}
                    disabled={!formProps.formState.isSubmittable}
                />
            </SmartForm>
        </>
    );
}
