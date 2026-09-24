/**
 * useGraphemeSubmit
 * -----------------
 * The ONE grapheme create/update submit handler, shared by the create page and
 * the edit page.
 *
 * A grapheme is three writes, not one — the record, its ordered glyph list, and
 * its phonemes — and the two copies this replaces disagreed about them: the
 * create path sent all three in one `create()` call, the edit path issued four
 * separate calls and IGNORED the result of three of them, so a failed
 * `updateGlyphs` or a rejected phoneme still reported "saved" and navigated
 * away. Every call is checked here, and a partial failure is surfaced as a
 * warning naming what did not land rather than being swallowed.
 *
 * The phoneme list is saved with ONE `phoneme.replaceAll` call, not a
 * delete-all followed by an add per row: the API respells auto-spelled words
 * after every phoneme write, and the row-by-row version would have respelled
 * them once per row (the first time against an empty list).
 *
 * FORMS (block-script Phase 2). A grapheme has a default form (the glyph list
 * above) and optional other forms (`variants`, see `variantDrafts.ts`):
 *
 *  - create: the other forms ride in the one `grapheme.create` request; if a
 *    "Make default" moved a named form into the default slot, the default
 *    variant is renamed/regrouped afterwards.
 *  - edit: the drafts are DIFFED against `initialData.variants` and saved in an
 *    order that can never trip the schema's two constraints —
 *      1. groups that move are cleared first (one form per group per grapheme);
 *      2. new forms are created and glyph ADDITIONS are written before any
 *         glyph is removed or any form deleted, so with `autoManageGlyphs` on a
 *         glyph that moves between forms is never momentarily unused (and
 *         garbage-collected);
 *      3. the default is switched before the old default can be deleted;
 *      4. deletions, then glyph removals, then final names and groups.
 *    Each call is checked; failures join the "saved, but not everything on
 *    it" warning. A deleted form that words PIN (`grapheme-12@34`) is only
 *    deleted after a confirm, asked before anything is written.
 */

import { useCallback, useContext } from 'react';

import {
    useEtymolog,
    type CreateGraphemeRequest,
    type EtymologApi,
    type Glyph,
    type GraphemeComplete,
    type VariantGroup,
} from '../../../db';
import { useApiAction, useNotify } from '../../shared';
import { ConfirmContext } from '../../shared/confirmDialog/confirmContext';
import type { GraphemeFormData } from './GraphemeFormFields';
import {
    DEFAULT_FORM_NAME,
    formLabel,
    initialDefaultForm,
    joinList,
    sameGlyphSequence,
    validateForms,
    type DefaultFormDraft,
    type VariantDraft,
} from './variantDrafts';

/** "Respelled 3 words" — or nothing, when the save changed no word. */
export function describeRespell(count: number): string {
    if (count <= 0) return '';
    return `Respelled ${count} word${count === 1 ? '' : 's'}.`;
}

export interface GraphemeSubmitResult {
    success: boolean;
    message?: string;
}

export interface UseGraphemeSubmitOptions {
    mode: 'create' | 'edit';
    /** The grapheme being edited. Required in `edit` mode. */
    initialData?: GraphemeComplete | null;
    /** The ordered glyph list the form is holding. */
    glyphs: Glyph[];
    /**
     * The folder a NEW grapheme is filed into (create-in-folder, from the
     * gallery's `?folder=`). Ignored in edit mode — a grapheme's folder is
     * changed from its card's "Move to folder", not this form.
     */
    folderId?: number | null;
    /**
     * The grapheme is a logogram (no sound): it is saved with NO phonemes,
     * whatever the hidden pronunciation table still holds.
     */
    isLogogram?: boolean;
    /** The other (non-default) forms the form is holding. Default: none. */
    variants?: VariantDraft[];
    /**
     * Identity of the default form (changed only by "Make default"). Default:
     * the stored default (edit) / the service's "Default" (create).
     */
    defaultForm?: DefaultFormDraft;
    /** Called with the saved grapheme's id. Navigation belongs to the caller. */
    onSuccess?: (graphemeId: number) => void;
}

const NO_VARIANTS: VariantDraft[] = [];

/** Positioned glyph refs for the API. */
function glyphRefs(glyphs: readonly Glyph[]) {
    return glyphs.map((glyph, index) => ({ glyph_id: glyph.id, position: index }));
}

/** A group id that no longer exists (deleted meanwhile) saves as "no group". */
function liveGroupId(groupId: number | null, groups: readonly VariantGroup[]): number | null {
    return groupId !== null && groups.some((g) => g.id === groupId) ? groupId : null;
}

/** One form in its final state, default included. */
interface FinalForm {
    id: number | null;
    name: string;
    groupId: number | null;
    glyphs: Glyph[];
    isDefault: boolean;
}

/**
 * Save the edit-mode forms diff (see the file header for the ORDER and why).
 * Returns the labels of what did not land.
 */
function saveFormsDiff(
    api: EtymologApi,
    graphemeId: number,
    initialData: GraphemeComplete,
    forms: FinalForm[],
): string[] {
    const failures: string[] = [];
    const initial = initialData.variants ?? [];
    const initialById = new Map(initial.map((variant) => [variant.id, variant]));
    const initialDefaultId = initial.find((v) => v.is_default)?.id ?? initial[0]?.id ?? null;
    const keptIds = new Set(forms.map((form) => form.id).filter((id): id is number => id !== null));
    const removed = initial.filter((variant) => !keptIds.has(variant.id));
    const failed = (what: string) => failures.push(what);

    // 1. Free every group that moves (and every group a deleted form holds).
    for (const form of forms) {
        const before = form.id !== null ? initialById.get(form.id) : undefined;
        if (before && before.group_id !== null && before.group_id !== form.groupId) {
            if (!api.variant.update(before.id, { group_id: null }).success) failed(`the group of ${formLabel(form.name)}`);
        }
    }
    for (const variant of removed) {
        if (variant.group_id !== null) api.variant.update(variant.id, { group_id: null });
    }

    // 2a. New forms, created whole.
    const createdIdByForm = new Map<FinalForm, number>();
    for (const form of forms) {
        if (form.id !== null) continue;
        const created = api.variant.create(graphemeId, {
            name: form.name,
            group_id: form.groupId,
            glyphs: glyphRefs(form.glyphs),
        });
        if (created.success && created.data) createdIdByForm.set(form, created.data.id);
        else failed(`the new form ${formLabel(form.name)}`);
    }

    // 2b. Glyph ADDITIONS on kept forms: final list + what is about to leave,
    //     so nothing is unused before its new home holds it.
    const needsSecondWrite = new Set<FinalForm>();
    for (const form of forms) {
        if (form.id === null) continue;
        const before = initialById.get(form.id);
        const oldGlyphs = before?.glyphs ?? [];
        if (before && sameGlyphSequence(oldGlyphs, form.glyphs)) continue;
        const finalIds = new Set(form.glyphs.map((g) => g.id));
        const oldIds = new Set(oldGlyphs.map((g) => g.id));
        const adds = form.glyphs.some((g) => !oldIds.has(g.id));
        const leaving = oldGlyphs.filter((g) => !finalIds.has(g.id));
        if (adds && leaving.length > 0) {
            if (!api.variant.setGlyphs(form.id, glyphRefs([...form.glyphs, ...leaving])).success) {
                failed(`the glyphs of ${formLabel(form.name)}`);
                continue;
            }
            needsSecondWrite.add(form);
        } else if (adds || leaving.length === 0) {
            // Pure addition or pure reorder: one write is the final one.
            if (!api.variant.setGlyphs(form.id, glyphRefs(form.glyphs)).success) {
                failed(`the glyphs of ${formLabel(form.name)}`);
            }
        } else {
            needsSecondWrite.add(form);
        }
    }

    // 3. Switch the default before the old one can be deleted.
    const defaultForm = forms.find((form) => form.isDefault);
    const newDefaultId = defaultForm
        ? (defaultForm.id ?? createdIdByForm.get(defaultForm) ?? null)
        : null;
    if (newDefaultId !== null && newDefaultId !== initialDefaultId) {
        if (!api.variant.setDefault(graphemeId, newDefaultId).success) failed('the default form');
    }

    // 4a. Deletions (pins were confirmed by the caller).
    for (const variant of removed) {
        if (!api.variant.delete(variant.id).success) failed(`the removal of ${formLabel(variant.name)}`);
    }

    // 4b. Glyph REMOVALS.
    for (const form of needsSecondWrite) {
        if (!api.variant.setGlyphs(form.id as number, glyphRefs(form.glyphs)).success) {
            failed(`the glyphs of ${formLabel(form.name)}`);
        }
    }

    // 4c. Final names and groups.
    for (const form of forms) {
        const before = form.id !== null ? initialById.get(form.id) : undefined;
        if (!before) continue;
        const nameChanged = before.name !== form.name;
        const groupChanged = before.group_id !== form.groupId;
        if (!nameChanged && !groupChanged) continue;
        const patch: { name?: string; group_id?: number | null } = {};
        if (nameChanged) patch.name = form.name;
        if (groupChanged) patch.group_id = form.groupId;
        if (!api.variant.update(before.id, patch).success) failed(`the name or group of ${formLabel(form.name)}`);
    }

    return failures;
}

export function useGraphemeSubmit({
    mode,
    initialData,
    glyphs,
    folderId,
    isLogogram = false,
    variants = NO_VARIANTS,
    defaultForm: defaultFormOption,
    onSuccess,
}: UseGraphemeSubmitOptions): (formData: Record<string, unknown>) => Promise<GraphemeSubmitResult> {
    const { api, data: contextData } = useEtymolog();
    const groups = contextData.variantGroups;
    const notify = useNotify();
    // Read OPTIONALLY: most saves never ask anything, so the hook works
    // outside a <ConfirmDialogProvider>. Without one, a save that would delete
    // a pinned form is refused rather than done without asking.
    const confirm = useContext(ConfirmContext);
    const runApiAction = useApiAction();

    return useCallback(
        async (formData: Record<string, unknown>): Promise<GraphemeSubmitResult> => {
            const data = formData as unknown as GraphemeFormData;

            if (glyphs.length === 0) {
                return { success: false, message: 'Add at least one glyph to this grapheme.' };
            }
            const name = data.graphemeName?.trim();
            if (!name) return { success: false, message: 'The grapheme needs a name.' };

            // ── Forms: validate EVERYTHING before the first write ──────────
            const defaultIdentity = defaultFormOption ?? initialDefaultForm(mode, initialData);
            const drafts = variants.map((draft) => ({
                ...draft,
                name: draft.name.trim(),
                groupId: liveGroupId(draft.groupId, groups),
            }));
            const defaultDraft: DefaultFormDraft = {
                ...defaultIdentity,
                name: defaultIdentity.name.trim() || DEFAULT_FORM_NAME,
                groupId: liveGroupId(defaultIdentity.groupId, groups),
            };
            const formsProblem = validateForms(
                defaultDraft,
                drafts,
                (groupId) => groups.find((g) => g.id === groupId)?.name ?? `#${groupId}`,
            );
            if (formsProblem) return { success: false, message: formsProblem };

            const category = data.category?.trim() || undefined;
            const notes = data.notes?.trim() || undefined;
            // A logogram has no sound: whatever the (hidden) table holds is dropped.
            const phonemes = (isLogogram ? [] : (data.pronunciations ?? []))
                .filter((p) => p.pronunciation?.trim())
                .map((p) => ({
                    phoneme: p.pronunciation.trim(),
                    use_in_auto_spelling: p.useInAutoSpelling,
                }));

            if (mode === 'create') {
                const request: CreateGraphemeRequest = {
                    name,
                    category,
                    notes,
                    glyphs: glyphRefs(glyphs),
                    phonemes,
                    folder_id: folderId ?? null,
                    ...(drafts.length > 0
                        ? {
                              variants: drafts.map((draft) => ({
                                  name: draft.name,
                                  group_id: draft.groupId,
                                  glyphs: glyphRefs(draft.glyphs),
                              })),
                          }
                        : {}),
                };

                const result = await runApiAction(() => api.grapheme.create(request), {
                    errorTitle: 'Could not create the grapheme',
                });
                if (!result.success || !result.data) {
                    return {
                        success: false,
                        message: result.error?.message ?? 'The grapheme was not created.',
                    };
                }

                // A "Make default" moved a named form into the default slot: the
                // service always calls the default "Default", so rename it.
                const createdId = result.data.id;
                const createFailures: string[] = [];
                if (defaultDraft.name !== DEFAULT_FORM_NAME || defaultDraft.groupId !== null) {
                    const stored = api.variant.getByGrapheme(createdId);
                    const defaultVariant = stored.success
                        ? stored.data?.find((variant) => variant.is_default)
                        : undefined;
                    const renamed = defaultVariant
                        ? api.variant.update(defaultVariant.id, {
                              name: defaultDraft.name,
                              group_id: defaultDraft.groupId,
                          })
                        : null;
                    if (!renamed?.success) createFailures.push('the name or group of its default form');
                }

                if (createFailures.length > 0) {
                    notify.warning(`${joinList(createFailures)} could not be saved.`, {
                        title: 'Grapheme created, but not everything on it',
                    });
                } else {
                    notify.success(
                        [`Created grapheme "${name}".`, describeRespell(result.data.lexiconRespelled)]
                            .filter(Boolean)
                            .join(' '),
                    );
                }
                onSuccess?.(createdId);
                return { success: true };
            }

            const graphemeId = initialData?.id;
            if (graphemeId == null || !initialData) return { success: false, message: 'No grapheme to update.' };

            // A removed form that words PIN: ask before anything is written.
            const hasStoredForms = (initialData.variants?.length ?? 0) > 0;
            if (hasStoredForms) {
                const finalIds = new Set(
                    [defaultDraft.id, ...drafts.map((draft) => draft.id)].filter((id) => id !== null),
                );
                for (const variant of initialData.variants ?? []) {
                    if (finalIds.has(variant.id)) continue;
                    const pins = api.variant.getPinUsageCount(variant.id);
                    const count = pins.success ? (pins.data ?? 0) : 0;
                    if (count === 0) continue;
                    if (!confirm) {
                        return {
                            success: false,
                            message: `${count} word${count === 1 ? ' pins' : 's pin'} the form "${variant.name}"; it can only be removed after confirming.`,
                        };
                    }
                    const ok = await confirm({
                        title: `Remove the form "${variant.name}"?`,
                        message:
                            `${count} word${count === 1 ? ' pins' : 's pin'} this form; ` +
                            `${count === 1 ? 'it' : 'they'} will fall back to the default.`,
                        confirmLabel: 'Remove form and save',
                        tone: 'danger',
                    });
                    if (!ok) {
                        return { success: false, message: `Not saved: the form "${variant.name}" was kept.` };
                    }
                }
            }

            const updated = await runApiAction(
                () => api.grapheme.update(graphemeId, { name, category, notes }),
                { errorTitle: 'Could not save the grapheme' },
            );
            if (!updated.success) {
                return { success: false, message: updated.error?.message ?? 'The grapheme was not saved.' };
            }

            // The three follow-up writes are WARNINGS, not errors: the grapheme
            // itself saved, and telling the user it failed would be wrong. What
            // is not acceptable is the silence they used to get.
            const failures: string[] = [];

            if (hasStoredForms) {
                // Every form by variant id — the default included, so a
                // "Make default" never writes one form's glyphs into another.
                failures.push(
                    ...saveFormsDiff(api, graphemeId, initialData, [
                        { ...defaultDraft, glyphs, isDefault: true },
                        ...drafts.map((draft) => ({
                            id: draft.id,
                            name: draft.name,
                            groupId: draft.groupId,
                            glyphs: draft.glyphs,
                            isDefault: false,
                        })),
                    ]),
                );
            } else {
                // No variant info on the loaded grapheme (a pre-v9 literal):
                // the default glyph list is all there is.
                const glyphResult = api.grapheme.updateGlyphs(graphemeId, { glyphs: glyphRefs(glyphs) });
                if (!glyphResult.success) failures.push('its glyphs');
                for (const draft of drafts) {
                    const created = api.variant.create(graphemeId, {
                        name: draft.name,
                        group_id: draft.groupId,
                        glyphs: glyphRefs(draft.glyphs),
                    });
                    if (!created.success) failures.push(`the new form ${formLabel(draft.name)}`);
                }
            }

            const replaced = api.phoneme.replaceAll({ grapheme_id: graphemeId, phonemes });
            if (!replaced.success) failures.push('its pronunciations');

            if (failures.length > 0) {
                notify.warning(`${joinList(failures)} could not be saved.`, {
                    title: 'Grapheme saved, but not everything on it',
                });
            } else {
                notify.success(
                    ['Grapheme saved.', describeRespell(replaced.data?.lexiconRespelled ?? 0)]
                        .filter(Boolean)
                        .join(' '),
                );
            }

            onSuccess?.(graphemeId);
            return { success: true };
        },
        [api, glyphs, initialData, mode, folderId, notify, onSuccess, runApiAction, isLogogram, variants, defaultFormOption, groups, confirm],
    );
}

export default useGraphemeSubmit;
