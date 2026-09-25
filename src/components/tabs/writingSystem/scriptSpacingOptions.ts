/**
 * Shared, component-free bits for the two conlang-wide spacing controls
 * (ScriptSpacingSettings, WordSeparationSetting). Kept in a `.ts` file so the
 * `.tsx` components each export ONE component (react-refresh, plan P4).
 */

import type { LetterSpacingValue, PunctuationConfig } from '../../../db/api/types';

/** The letter-spacing choices, in the order they appear in the select. */
export const LETTER_SPACING_OPTIONS: readonly { value: LetterSpacingValue; label: string }[] = [
    { value: 'auto', label: 'Auto (view default)' },
    { value: 'none', label: 'None (touching)' },
    { value: 'tight', label: 'Tight' },
    { value: 'normal', label: 'Normal' },
    { value: 'wide', label: 'Wide' },
    { value: 'extra-wide', label: 'Extra wide' },
];

/** How words are separated, derived from `punctuation.wordSeparator`. */
export type WordSeparationMode = 'space' | 'glyph' | 'nothing';

/**
 * The word-separation mode a `wordSeparator` config represents:
 *  - `useNoGlyph` → `nothing` (words run on; blocks never join across a word);
 *  - a `graphemeId` → `glyph` (written with a grapheme of your own);
 *  - otherwise → `space` (the default virtual space).
 */
export function wordSeparationModeOf(config: PunctuationConfig | undefined): WordSeparationMode {
    if (config?.useNoGlyph) return 'nothing';
    if (config?.graphemeId != null) return 'glyph';
    return 'space';
}

/** The one-line hint shown under the word-separation control per mode. */
export const WORD_SEPARATION_HINTS: Readonly<Record<WordSeparationMode, string>> = {
    space: 'Words are told apart by a space.',
    glyph: 'Words are separated by a grapheme of your own.',
    nothing: 'Words run on without a gap, but blocks never join across a word.',
};
