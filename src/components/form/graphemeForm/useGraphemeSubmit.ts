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
 */

import { useCallback } from 'react';

import { useEtymolog, type CreateGraphemeRequest, type Glyph, type GraphemeComplete } from '../../../db';
import { useApiAction, useNotify } from '../../shared';
import type { GraphemeFormData } from './GraphemeFormFields';

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
    /** Called with the saved grapheme's id. Navigation belongs to the caller. */
    onSuccess?: (graphemeId: number) => void;
}

export function useGraphemeSubmit({
    mode,
    initialData,
    glyphs,
    onSuccess,
}: UseGraphemeSubmitOptions): (formData: Record<string, unknown>) => Promise<GraphemeSubmitResult> {
    const { api } = useEtymolog();
    const notify = useNotify();
    const runApiAction = useApiAction();

    return useCallback(
        async (formData: Record<string, unknown>): Promise<GraphemeSubmitResult> => {
            const data = formData as unknown as GraphemeFormData;

            if (glyphs.length === 0) {
                return { success: false, message: 'Add at least one glyph to this grapheme.' };
            }
            const name = data.graphemeName?.trim();
            if (!name) return { success: false, message: 'The grapheme needs a name.' };

            const category = data.category?.trim() || undefined;
            const notes = data.notes?.trim() || undefined;
            const phonemes = (data.pronunciations ?? [])
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
                    glyphs: glyphs.map((glyph, index) => ({ glyph_id: glyph.id, position: index })),
                    phonemes,
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

                notify.success(
                    [`Created grapheme "${name}".`, describeRespell(result.data.lexiconRespelled)]
                        .filter(Boolean)
                        .join(' '),
                );
                onSuccess?.(result.data.id);
                return { success: true };
            }

            const graphemeId = initialData?.id;
            if (graphemeId == null) return { success: false, message: 'No grapheme to update.' };

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

            const glyphResult = api.grapheme.updateGlyphs(graphemeId, {
                glyphs: glyphs.map((glyph, index) => ({ glyph_id: glyph.id, position: index })),
            });
            if (!glyphResult.success) failures.push('its glyphs');

            const replaced = api.phoneme.replaceAll({ grapheme_id: graphemeId, phonemes });
            if (!replaced.success) failures.push('its pronunciations');

            if (failures.length > 0) {
                notify.warning(`${failures.join(' and ')} could not be saved.`, {
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
        [api, glyphs, initialData, mode, notify, onSuccess, runApiAction],
    );
}

export default useGraphemeSubmit;
