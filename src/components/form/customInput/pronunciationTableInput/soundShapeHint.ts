/**
 * soundShapeHint — the note under a pronunciation row when what was typed
 * reads as SEVERAL consonants (DIPHTHONG_BLOCKS_PLAN.md §4.3).
 *
 * A grapheme whose sound is `ng` is read as two sounds, n and g. That is fine
 * when the sign really stands for both (`kw`), but often the owner meant one
 * sound and has an IPA letter for it (`ŋ`). The hint says so, visibly — it
 * never rewrites what was typed (pitfall P4).
 *
 * Rules:
 *  - one describable sound (`describePhoneme` on the whole text — so an untied
 *    `tʃ` or `ts` is ONE sound here, as everywhere a grapheme's sound is read)
 *    → `null`;
 *  - two or more sounds, every one describable, every one a consonant → the
 *    hint, naming the sounds; the "spell it …" suggestion only for the exact
 *    spellings in `ONE_SOUND_SPELLINGS` (a listed spelling gets it even when
 *    one of its letters is an IPA vowel — `ny`, since IPA `y` is a vowel);
 *  - anything with a vowel (a syllable sign, a vowel pair) → `null`;
 *  - anything the sound table cannot read → `null` (the IPA keyboard guides).
 *
 * English only, like the rest of this form's user text.
 *
 * @module form/customInput/pronunciationTableInput/soundShapeHint
 */

import { describePhoneme, safeNormalize } from '../../../../generator/phonology/features';
import { tokenizeIpa } from '../../../../generator/phonology/tokenize';

/**
 * Common two-letter spellings of ONE sound, and the IPA letter for it. Kept
 * tiny on purpose: a guess outside it would be more confusing than none.
 * (`ts`/`dz` are listed for completeness; the sound table already reads an
 * untied `ts`/`dz` as one sound, so they never reach the hint.)
 */
const ONE_SOUND_SPELLINGS: ReadonlyMap<string, string> = new Map([
    ['ng', 'ŋ'],
    ['ny', 'ɲ'],
    ['sh', 'ʃ'],
    ['ch', 'tʃ'],
    ['zh', 'ʒ'],
    ['th', 'θ'],
    ['dj', 'dʒ'],
    ['ts', 't͡s'],
    ['dz', 'd͡z'],
]);

const COUNT_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

function countWord(count: number): string {
    return COUNT_WORDS[count] ?? String(count);
}

/** The hint for one pronunciation, or `null` when there is nothing to say. */
export function soundShapeHint(pronunciation: string): string | null {
    const text = safeNormalize(pronunciation.trim(), 'NFC');
    if (text.length === 0) return null;
    if (describePhoneme(text)) return null;

    const sounds = tokenizeIpa(text).filter((token) => token.separator === undefined);
    if (sounds.length < 2 || !sounds.every((token) => token.features !== null)) return null;
    const oneSound = ONE_SOUND_SPELLINGS.get(text);
    // A listed spelling is answered even when a letter of it is an IPA vowel:
    // `y` is a vowel in IPA, so `ny` would otherwise never get its `ɲ`.
    if (!oneSound && !sounds.every((token) => token.features?.kind === 'consonant')) return null;

    const lead = `${text} reads as ${countWord(sounds.length)} sounds (${sounds.map((token) => token.text).join(', ')}).`;
    return oneSound
        ? `${lead} If it is one sound, spell it ${oneSound}.`
        : `${lead} That is fine if your sign stands for ${sounds.length === 2 ? 'both' : 'all of them'}.`;
}
