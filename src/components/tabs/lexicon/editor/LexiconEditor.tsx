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
import { createGraphemeEntry, type SpellingEntry } from '../../../../db/utils/spellingUtils';
import { ROUTES, resolveUrl } from '../../../../url_mapping';
import { LexiconFormFields, type LexiconSymbolState } from '../../../form/lexiconForm';
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
    // The folder the word is filed in (schema v7). Reported up by the fields —
    // seeded from the stored word (edit) or the `?folder=` param (create).
    const [folderId, setFolderId] = useState<number | null>(initialData?.folder_id ?? null);
    // The word-symbol state (Phase 3): mode, the chosen SVG, and — on edit — the
    // existing symbol grapheme inferred from the stored word. Starts in Compose
    // mode; the fields flip it to Symbol when they infer or the user chooses it.
    const [symbolState, setSymbolState] = useState<LexiconSymbolState>({
        mode: 'compose',
        svg: null,
        existingGraphemeId: null,
        originalSvg: null,
    });

    // Whether the word has something to be NAMED by — a pronunciation or a
    // meaning. Reported by the fields (SmartForm's own `isSubmittable` can't
    // express it; see `onHasNameSourceChange`). An existing word always has a
    // name (its lemma), so edit mode starts true; a fresh create form starts
    // false and the fields flip it as soon as either is filled.
    const [hasNameSource, setHasNameSource] = useState(mode === 'edit');

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

    /**
     * `/lexicon/create?folder=…` — the gallery's "New word" default (Phase 5b,
     * UC-D). Same read-here-not-in-the-fields rule as `?pronunciation=`. An
     * unparseable value is ignored (root); an id no folder has is filtered by
     * the picker's own option list, so the word simply files at the root.
     */
    const initialFolderId = useMemo(() => {
        if (mode !== 'create') return undefined;
        const raw = searchParams.get('folder');
        if (raw === null) return undefined;
        const parsed = Number.parseInt(raw, 10);
        return Number.isInteger(parsed) ? parsed : undefined;
    }, [mode, searchParams]);

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

            const isSymbol = symbolState.mode === 'symbol';
            const symbolSvg = symbolState.svg?.trim();
            if (isSymbol && !symbolSvg) {
                return { success: false, message: 'Draw or import a symbol for this word.' };
            }
            // The symbol name defaults to the word's display name.
            const symbolName =
                pronunciation || meanings?.[0]?.meaning || initialData?.lemma || 'Symbol';

            if (mode === 'create') {
                const ancestry = ancestors.map((a, index) => ({
                    ancestor_id: a.ancestorId,
                    position: index,
                    ancestry_type: a.ancestryType,
                }));
                const input: CreateLexiconInput = isSymbol
                    ? {
                          pronunciation: pronunciation || undefined,
                          is_native: isNative,
                          // Symbol words are always manual (the api enforces this too).
                          auto_spell: false,
                          meanings,
                          symbol: { svgData: symbolSvg! },
                          ancestry,
                          folder_id: folderId,
                      }
                    : {
                          pronunciation: pronunciation || undefined,
                          is_native: isNative,
                          auto_spell: autoSpell,
                          meanings,
                          glyph_order: glyphOrder,
                          ancestry,
                          folder_id: folderId,
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

            // Symbol mode on edit: the word's spelling is one logogram grapheme.
            // Either it already exists (reuse it, and re-draw its glyph if the
            // drawing changed) or the word is being switched INTO Symbol mode
            // now (make a new symbol grapheme). The result is the glyph_order
            // the word update pins.
            let editGlyphOrder = glyphOrder;
            let redrawGraphemeId: number | null = null;
            if (isSymbol) {
                if (symbolState.existingGraphemeId != null) {
                    editGlyphOrder = [createGraphemeEntry(symbolState.existingGraphemeId)];
                    if (symbolSvg !== (symbolState.originalSvg ?? '').trim()) {
                        redrawGraphemeId = symbolState.existingGraphemeId;
                    }
                } else {
                    const created = api.wordSymbol.create({
                        name: symbolName,
                        svgData: symbolSvg!,
                    });
                    if (!created.success || !created.data) {
                        return {
                            success: false,
                            message: created.error?.message ?? 'Could not create the symbol',
                        };
                    }
                    editGlyphOrder = [createGraphemeEntry(created.data.graphemeId)];
                }
            }

            const update: UpdateLexiconInput = {
                // `lemma` is intentionally NOT sent: the api recomputes it from
                // pronunciation → first meaning → existing lemma, so clearing
                // the pronunciation of a word that has a meaning renames it to
                // that meaning rather than stranding the old lemma.
                //
                // `null` (not `undefined`) when empty so the api actually
                // CLEARS the pronunciation — `undefined` would leave the old
                // value in place, making it impossible to remove a pronunciation
                // once set.
                pronunciation: pronunciation ? pronunciation : null,
                is_native: isNative,
                // Symbol mode forces auto-spell off (the fields already report
                // false, but pin it here so a symbol word is never auto-spelled).
                auto_spell: isSymbol ? false : autoSpell,
                meanings,
                glyph_order: editGlyphOrder,
                folder_id: folderId,
            };

            const result = await runApiAction(() => api.lexicon.update(editingId, update), {
                errorTitle: 'Could not save the word',
            });
            if (!result.success) {
                return { success: false, message: result.error?.message ?? 'Update failed' };
            }

            if (redrawGraphemeId != null) {
                const draw = api.wordSymbol.updateDrawing({
                    graphemeId: redrawGraphemeId,
                    svgData: symbolSvg!,
                });
                if (!draw.success) {
                    // The word itself saved; the drawing did not. Warn rather
                    // than fail the whole save (mirrors the ancestry warning).
                    notify.warning(
                        draw.error?.message ?? 'The symbol drawing could not be updated.',
                        { title: 'Word saved, but its symbol was not re-drawn' },
                    );
                }
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
            glyphOrder,
            ancestors,
            isNative,
            autoSpell,
            folderId,
            symbolState,
            initialData,
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
                        ? 'Name the word by its pronunciation or its meaning — either is enough. Auto-spelling, when used, reads the pronunciation to build the spelling.'
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
                    initialFolderId={initialFolderId}
                    onGlyphOrderChange={setGlyphOrder}
                    onAncestorsChange={setAncestors}
                    onIsNativeChange={setIsNative}
                    onAutoSpellChange={setAutoSpell}
                    onHasNameSourceChange={setHasNameSource}
                    onSymbolStateChange={setSymbolState}
                    onFolderIdChange={setFolderId}
                />

                <FormActionBar
                    onCancel={() => navigate(backTo)}
                    submitLabel={mode === 'create' ? 'Create word' : 'Save changes'}
                    // Both gates: SmartForm's field-level validity AND a name
                    // source (pronunciation or meaning). A word with neither has
                    // no derivable lemma and is rejected by the api anyway.
                    disabled={!formProps.formState.isSubmittable || !hasNameSource}
                />
            </SmartForm>
        </>
    );
}
