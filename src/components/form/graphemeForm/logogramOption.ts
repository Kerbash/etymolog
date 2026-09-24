/**
 * The grapheme form's "No sound" option and the two KINDS of no-sound
 * grapheme, kept apart from the component files so those export only
 * components (Fast Refresh).
 *
 *  - a **word symbol** (logogram, {@link WORD_SYMBOL_CATEGORY}) stands for a
 *    whole word or idea — the word form's Logogram tab offers these;
 *  - a **mark** ({@link MARK_CATEGORY}) is added to other signs — a
 *    vowel-killer, an accent — and never stands on its own. It is what the
 *    Blocks page's vowel-killer chooser offers first, and never a word's
 *    whole spelling.
 *
 * Only the category tells the kinds apart: both carry no phonemes.
 */

import type { GraphemeComplete } from '../../../db';
import { MARK_CATEGORY, WORD_SYMBOL_CATEGORY } from '../../../db/wordSymbolService';

/** Which kind of no-sound sign a grapheme is (the form's radio pair). */
export type NoSoundKind = 'wordSymbol' | 'mark';

/** The category each kind stamps on a grapheme. */
export const NO_SOUND_KIND_CATEGORY: Readonly<Record<NoSoundKind, string>> = {
    wordSymbol: WORD_SYMBOL_CATEGORY,
    mark: MARK_CATEGORY,
};

/**
 * A grapheme is a logogram when it carries no sound. On edit that is read off
 * the stored grapheme (no phonemes); a new grapheme starts phonetic.
 */
export function initialIsLogogram(mode: 'create' | 'edit', initialData?: GraphemeComplete | null): boolean {
    return mode === 'edit' && !!initialData && initialData.phonemes.length === 0;
}

/**
 * The kind the "What kind of sign is it?" radios start on: a mark when the
 * stored category is {@link MARK_CATEGORY}, otherwise a word symbol (the
 * default, also for every new grapheme).
 */
export function initialNoSoundKind(mode: 'create' | 'edit', initialData?: GraphemeComplete | null): NoSoundKind {
    return mode === 'edit' && initialData?.category?.trim() === MARK_CATEGORY ? 'mark' : 'wordSymbol';
}

/**
 * The category to write when the user picks `kind` (or ticks "No sound" with
 * `kind` selected), or `null` to leave the field alone. Only an EMPTY category
 * or the OTHER kind's own constant is replaced — a category the user typed
 * themselves is never overwritten.
 */
export function categoryForNoSoundKind(currentCategory: string, kind: NoSoundKind): string | null {
    const current = currentCategory.trim();
    const target = NO_SOUND_KIND_CATEGORY[kind];
    if (current === target) return null;
    const other = NO_SOUND_KIND_CATEGORY[kind === 'mark' ? 'wordSymbol' : 'mark'];
    return current === '' || current === other ? target : null;
}

/** A mark: a no-sound sign added to other signs (vowel-killer, accent). */
export function isMarkGrapheme(grapheme: GraphemeComplete): boolean {
    return grapheme.category?.trim() === MARK_CATEGORY;
}

/**
 * A grapheme that stands for a word rather than a sound: category
 * {@link WORD_SYMBOL_CATEGORY}, or no sound at all — unless it is a mark.
 */
export function isLogogramGrapheme(grapheme: GraphemeComplete): boolean {
    return grapheme.category === WORD_SYMBOL_CATEGORY
        || (grapheme.phonemes.length === 0 && !isMarkGrapheme(grapheme));
}
