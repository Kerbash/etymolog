/**
 * diphthongSuggestions — the pure helpers behind "Vowels next to each other"
 * in `SplitSettings` (DIPHTHONG_BLOCKS_PLAN.md §4.2).
 *
 *  - `suggestDiphthongs` reads the word generator's syllable shapes and offers
 *    every vowel pair (or triple) the owner already wrote into a literal group
 *    (`CV[ai au]` → `ai`, `au`). Offers only: the designer shows them as
 *    buttons and never adds one by itself (pitfall P4).
 *  - `isVowelSequence` decides whether a listed entry can join anything (two
 *    or more sounds, every one a vowel) — the designer warns about the rest.
 *  - `diphthongExample` builds the live "With ai: tai → tai. Without: …" line.
 *
 * And the ones behind "Consonants that can carry a syllable"
 * (CONLANG_EDGES_PLAN.md §5.1, `split.syllabicConsonants`):
 *
 *  - `isSingleConsonant` decides whether a listed entry is exactly one
 *    consonant (the only thing the engine can promote) — the designer warns
 *    about the rest.
 *  - `suggestSyllabicConsonants` offers the language's own nasals, l-sounds,
 *    r-sounds and similar (`n`, `m`, `l`, `r`, `ɹ`…) read from its signs.
 *    Offers only, never added by themselves (P4).
 *  - `syllabicExample` builds "With r: krtek → kr · tek. Without: …".
 *
 * Pure: no React. Kept out of the component file so it exports only a
 * component (P6).
 *
 * @module writingSystem/blocks/diphthongSuggestions
 */

import { parseTemplate } from '../../../../generator/engine/template';
import type { TemplateItem } from '../../../../generator/engine/template';
import { describePhoneme, safeNormalize, SYLLABIC_MARKS } from '../../../../generator/phonology/features';
import type { ConsonantManner } from '../../../../generator/phonology/features';
import { tokenizeIpa } from '../../../../generator/phonology/tokenize';
import type { SyllableTemplate } from '../../../../generator/profile/types';

/** The sound tokens of `text` (separators such as `.` or a space are not sounds). */
function soundTokens(text: string) {
    return tokenizeIpa(text).filter((token) => token.separator === undefined);
}

/**
 * Two or more sounds, every one a vowel (`ai`, `iə`, `iəu`). A single vowel,
 * anything with a consonant, anything with a break in it (`a.i`, `a i` — the
 * engine joins the signs' sounds with nothing between), and anything the
 * sound table cannot read are not.
 */
export function isVowelSequence(text: string): boolean {
    const tokens = tokenizeIpa(safeNormalize(text.trim(), 'NFC'));
    return tokens.length >= 2 && tokens.every((token) => token.separator === undefined && token.features?.kind === 'vowel');
}

/**
 * Vowel sequences written in the word shapes' literal groups, NFC, without
 * duplicates, in order of first appearance. A shape that does not parse is
 * skipped (the word generator reports it where it is edited).
 */
export function suggestDiphthongs(syllables: readonly SyllableTemplate[]): string[] {
    const out: string[] = [];
    for (const { pattern } of syllables) {
        let items: TemplateItem[];
        try {
            items = parseTemplate(pattern);
        } catch {
            continue;
        }
        for (const item of items) {
            if (item.kind !== 'literal') continue;
            for (const member of item.members) {
                const entry = safeNormalize(member.trim(), 'NFC');
                if (isVowelSequence(entry) && !out.includes(entry)) out.push(entry);
            }
        }
    }
    return out;
}

/** The example line's two readings of `t` + `entry`: kept whole, and split. */
export function diphthongExample(entry: string): { word: string; apart: string } {
    const sounds = soundTokens(entry).map((token) => token.text);
    const parts = sounds.length > 0 ? sounds : Array.from(entry);
    const [first = '', ...rest] = parts;
    return { word: `t${entry}`, apart: [`t${first}`, ...rest].join(' · ') };
}

// =============================================================================
// CONSONANTS THAT CAN CARRY A SYLLABLE
// =============================================================================

/**
 * The kinds of consonant a language can let carry a syllable (Czech `r`,
 * `l`; English `n` in "button"): nasals, l-sounds, r-sounds and the other
 * gliding consonants. Only these are SUGGESTED; the owner may list any
 * consonant by hand.
 */
const SYLLABIC_MANNERS: ReadonlySet<ConsonantManner> = new Set<ConsonantManner>([
    'nasal',
    'lateral_approximant',
    'trill',
    'tap',
    'approximant',
]);

/**
 * Exactly one consonant, read the way the engine reads a sign's sound
 * (`describePhoneme` on the trimmed NFC text): `r`, `n`, `tʃ`, `rʲ`. A vowel,
 * two sounds (`rl`), a break (`r.`) and anything the sound table cannot read
 * are not.
 */
export function isSingleConsonant(text: string): boolean {
    const entry = safeNormalize(text.trim(), 'NFC');
    return entry.length > 0 && describePhoneme(entry)?.kind === 'consonant';
}

/** The minimal shape of a sign this module reads: its sounds, in order. */
export interface SoundedSign {
    phonemes: readonly { phoneme: string; use_in_auto_spelling: boolean }[];
}

/**
 * The consonants among the signs' main sounds (the first auto-spelling
 * sound, else the first — the one the block engine reads) that can carry a
 * syllable in some language: nasals, l-sounds, r-sounds and the like. NFC,
 * without duplicates, in sign order. A sound that already carries the
 * syllable mark (`r̩`) is left out: it needs no listing.
 */
export function suggestSyllabicConsonants(signs: Iterable<SoundedSign>): string[] {
    const out: string[] = [];
    for (const sign of signs) {
        const preferred = sign.phonemes.find((p) => p.use_in_auto_spelling) ?? sign.phonemes[0];
        if (!preferred) continue;
        const entry = safeNormalize(preferred.phoneme.trim(), 'NFC');
        if (entry.length === 0 || out.includes(entry)) continue;
        const features = describePhoneme(entry);
        if (features?.kind !== 'consonant' || !SYLLABIC_MANNERS.has(features.manner)) continue;
        if (features.modifiers.some((mark) => SYLLABIC_MARKS.includes(mark))) continue;
        out.push(entry);
    }
    return out;
}

/** The example line's two readings of `k` + `entry` + `tek`: cut after the consonant, and whole. */
export function syllabicExample(entry: string): { word: string; apart: string } {
    return { word: `k${entry}tek`, apart: `k${entry} · tek` };
}
