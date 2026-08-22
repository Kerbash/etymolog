/**
 * @fileoverview "Romance" — five vowels, palatals, restricted codas.
 *
 * @module generator/presets/data/romance
 */

import type { FlavourPreset } from '../types';

export const ROMANCE_PRESET: FlavourPreset = {
    id: 'romance',
    name: 'Romance',
    tagline: 'Five clean vowels, palatal ɲ and ʎ, words that end in a vowel or n, s, r, l.',
    touchstones: ['Spanish', 'Italian', 'Portuguese'],
    why:
        'Three ingredients. A full voiced/voiceless stop series (p b, t d, k g), which gives the '
        + 'sound its weight; a palatal pair, ɲ and ʎ, which almost no other flavour uses and which '
        + 'the ear reads as Romance immediately; and two rhotics, a tap ɾ and a trill r, contrasting '
        + 'with each other. Syllables are open by preference, and when one does close it closes on a '
        + 'small set — n, s, r or l — which is why the template names them rather than allowing any '
        + 'consonant: a word ending in -k or -t͡ʃ reads as Germanic or Slavic instead. Consonant + '
        + 'liquid onsets (pr-, kl-, br-) are the one cluster type that belongs, and the back '
        + 'fricatives (x, χ) and the glottal stop are what to keep out.',
    sounds: {
        core: [
            'p', 'b', 't', 'd', 'k', 'g',
            'm', 'n', 'ɲ',
            'l', 'ʎ', 'r', 'ɾ',
            'f', 'v', 's',
            't͡ʃ', 'd͡ʒ',
        ],
        flavour: ['ʃ', 'z', 'θ', 'ʒ', 'ʝ'],
        avoid: ['x', 'χ', 'ʔ', 'ŋ', 'h', 'q', 'ħ'],
    },
    vowels: {
        core: ['a', 'e', 'i', 'o', 'u'],
        flavour: ['ɛ', 'ɔ'],
    },
    diphthongs: ['ai', 'au', 'ei', 'ie', 'ue'],
    profile: {
        version: 1,
        frequencyCurve: 'zipf',
        syllables: [
            { pattern: 'CV', weight: 6 },
            // Space-separated because the members have to stay whole; the same
            // group written `[nsrl]` would also work, but the spaces are what a
            // user should copy when a member is more than one symbol.
            { pattern: 'CV[n s r l]', weight: 2 },
            // Obstruent + liquid, named on both sides and split in two so that
            // only the pairs a Romance language really has can be built. `CLV`
            // allowed ANY consonant in front of any liquid and produced `ʃl-`,
            // `mɾ-`, `sɾ-`; one group of each would still have produced `tl-`
            // and `dl-`, which is why there are two templates rather than one
            // `[…][l ɾ]V`. The trill is deliberately absent from both: `ɾ` is
            // the rhotic that clusters (`otro`, `padre`), `r` never does. The
            // two weights add up to the single `CLV` weight they replace, so
            // the share of clustered syllables is unchanged.
            { pattern: '[p b t d k g f][ɾ]V', weight: 1 },
            { pattern: '[p b k g f][l]V', weight: 1 },
            // ai / au / ei plus the two rising ones (ie, ue) that Spanish and
            // Italian get from their broken mid vowels.
            { pattern: 'C[ai au ei ie ue]', weight: 1 },
            { pattern: 'V', weight: 1 },
        ],
        syllableCount: { min: 2, max: 4 },
        clusters: {
            sonority: true,
            sibilantOnsetException: false,
            // Italian's doubled consonants; the one flavour where they belong.
            allowGeminates: true,
            maxPerWord: 1,
        },
        vowelHarmony: 'off',
        longVowelChance: 0,
        forbidden: [],
        // The trill is a MARKED sound in the languages this imitates: Spanish
        // and Italian contrast it with the tap in one position and use the tap
        // everywhere else, so a generator that picks them evenly stacks them
        // (`ɾarɾɔɾa`) and spends the flavour's most recognisable contrast on
        // noise. Rare for `r`, normal for `ɾ` — the tap should stay common.
        phonemeTilt: { a: 'common', o: 'common', e: 'common', r: 'rare' },
    },
    examples: ['mɔarel', 'betego', 'pevan', 'ɾarfɔɾa', 'dakɾa', 'saltɾo'],
};
