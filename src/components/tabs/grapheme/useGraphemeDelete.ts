/**
 * useGraphemeDelete
 * -----------------
 * The ONE grapheme-deletion flow, shared by the gallery card and the edit page.
 *
 * Deleting a grapheme that words are spelled with is the only destructive
 * action in the app with a SECOND, materially different question behind it, so
 * the dialog comes in two stages:
 *
 *  1. the ordinary danger confirmation ("this also deletes its pronunciations");
 *  2. only if the service refuses with `CONSTRAINT_VIOLATION`, a second dialog
 *     that NAMES the words that use it and explains what respelling does to
 *     them — auto-spelled words are rewritten with the grapheme's phoneme,
 *     manually spelled ones are flagged for review rather than silently
 *     rearranged.
 *
 * The first attempt deliberately does NOT go through `useApiAction`: its
 * refusal is a QUESTION, not a failure, and surfacing it as an error toast next
 * to the dialog that answers it is noise. Everything after that does, so a real
 * failure is still reported.
 *
 * Both call sites used to have their own single-stage dialog whose message
 * ("words keep their spelling entries only if nothing references it") described
 * behaviour the service does not have, and whose delete then failed with a raw
 * constraint error the user could do nothing about.
 */

import { useCallback } from 'react';

import { useEtymolog } from '../../../db';
import { useApiAction, useConfirm, useNotify } from '../../shared';

/** How many words the second dialog names before it summarises the rest. */
const NAMED_WORD_LIMIT = 5;

export interface GraphemeDeleteTarget {
    id: number;
    name: string;
}

/**
 * Build the "and N more" word list for the second dialog.
 *
 * Exported for the test that pins the summary, and because the formatting is
 * the part most likely to be got wrong (an off-by-one in the remainder count
 * misstates how much is about to change).
 */
export function describeAffectedWords(labels: string[]): string {
    if (labels.length === 0) return '';
    const shown = labels.slice(0, NAMED_WORD_LIMIT);
    const rest = labels.length - shown.length;
    return rest > 0 ? `${shown.join(', ')}, and ${rest} more` : shown.join(', ');
}

/**
 * @returns `deleteGrapheme(target)` → `true` when the grapheme was deleted,
 *          `false` when the user backed out or the call failed. Callers use the
 *          result to decide whether to navigate away.
 */
export function useGraphemeDelete(): (target: GraphemeDeleteTarget) => Promise<boolean> {
    const { api } = useEtymolog();
    const confirm = useConfirm();
    const notify = useNotify();
    const runApiAction = useApiAction();

    return useCallback(
        async (target: GraphemeDeleteTarget): Promise<boolean> => {
            const confirmed = await confirm({
                title: `Delete grapheme "${target.name}"?`,
                message:
                    'Every pronunciation attached to this grapheme is deleted with it. ' +
                    'This cannot be undone.',
                confirmLabel: 'Delete grapheme',
                tone: 'danger',
            });
            if (!confirmed) return false;

            const first = api.grapheme.delete(target.id);

            if (first.success) {
                notify.success(`Deleted "${target.name}".`);
                return true;
            }

            if (first.error?.code !== 'CONSTRAINT_VIOLATION') {
                notify.error(first.error?.message ?? 'The grapheme could not be deleted.', {
                    title: 'Could not delete grapheme',
                });
                return false;
            }

            // The refusal carries the count; the LIST is a second read, so the
            // dialog can name the words instead of quoting a number at the user.
            const usage = api.grapheme.getLexiconUsage(target.id);
            const labels = (usage.success ? (usage.data ?? []) : []).map(
                (word) => word.pronunciation || word.lemma || `#${word.id}`,
            );
            const count =
                labels.length ||
                (typeof first.error?.details?.lexiconCount === 'number'
                    ? first.error.details.lexiconCount
                    : 0);

            const respell = await confirm({
                title: `"${target.name}" is used in ${count} word${count === 1 ? '' : 's'}`,
                message:
                    'Deleting it rewrites those words: auto-spelled words are respelled with ' +
                    "the grapheme's phoneme, and manually spelled words are flagged for review " +
                    'so you can fix them yourself. This cannot be undone.',
                confirmLabel: 'Respell and delete',
                tone: 'danger',
                extra: labels.length > 0 ? describeAffectedWords(labels) : undefined,
            });
            if (!respell) return false;

            const result = await runApiAction(
                () => api.grapheme.delete(target.id, { respellLexicon: true }),
                { errorTitle: 'Could not delete grapheme' },
            );
            if (!result.success) return false;

            const { lexiconRespelled = 0, lexiconMarked = 0, orphanGlyphsRemoved = 0 } =
                result.data ?? {};
            const parts = [`Deleted "${target.name}"`];
            if (lexiconRespelled > 0) parts.push(`respelled ${lexiconRespelled}`);
            if (lexiconMarked > 0) parts.push(`flagged ${lexiconMarked} for review`);
            if (orphanGlyphsRemoved > 0) parts.push(`removed ${orphanGlyphsRemoved} orphaned glyph${orphanGlyphsRemoved === 1 ? '' : 's'}`);
            notify.success(`${parts.join(', ')}.`);
            return true;
        },
        [api, confirm, notify, runApiAction],
    );
}

export default useGraphemeDelete;
