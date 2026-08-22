/**
 * @fileoverview "Japanese-like" — moraic CV with a single nasal coda.
 *
 * @module generator/presets/data/japanese
 */

import type { FlavourPreset } from '../types';

export const JAPANESE_PRESET: FlavourPreset = {
    id: 'japanese',
    name: 'Japanese-like',
    tagline: 'Even CV beats, one nasal allowed to close a syllable, no l and no v.',
    touchstones: ['Japanese'],
    why:
        'Two things carry this flavour. The first is rhythm: almost every syllable is a consonant '
        + 'plus a vowel, all of the same length, so words come out as an even string of beats rather '
        + 'than with a stressed spine. The one exception is a nasal that may close a syllable, which '
        + 'is what makes the shape recognisable instead of merely simple. The second is the '
        + 'inventory: five vowels with an unrounded back u, a palatal series (ɕ, t͡ɕ, d͡ʑ) where '
        + 'other languages have ʃ and t͡ʃ, and a bilabial ɸ standing in for f. The sounds to keep '
        + 'out are the famous ones — l (there is only a tap r), v, θ, ð — because a single l in a '
        + 'word is enough to send the ear somewhere else entirely.',
    sounds: {
        core: ['k', 's', 't', 'n', 'h', 'm', 'j', 'r', 'w', 'g', 'z', 'd', 'b', 'p'],
        flavour: ['ɕ', 't͡ɕ', 'd͡ʑ', 'ɸ', 'ɴ'],
        avoid: ['l', 'v', 'θ', 'ð', 'f', 'ʃ', 'ʒ', 'x', 'ʔ'],
    },
    vowels: {
        core: ['a', 'i', 'ɯ', 'e', 'o'],
        flavour: [],
    },
    diphthongs: ['ai', 'oi', 'ɯi', 'ei'],
    profile: {
        version: 1,
        frequencyCurve: 'zipf',
        syllables: [
            { pattern: 'CV', weight: 8 },
            // The moraic nasal. `N` rather than a literal group because the
            // Japanese coda nasal assimilates to whatever follows it — m, n and
            // ŋ are all it, so the whole nasal class is the honest slot.
            { pattern: 'CVN', weight: 1 },
            // ai / oi / ui / ei: the vowel sequences Japanese actually has, as
            // one nucleus rather than as two moras, which is the shape the ear
            // hears in kirei and omoi.
            { pattern: 'C[ai oi ɯi ei]', weight: 1 },
            { pattern: 'V', weight: 1 },
        ],
        syllableCount: { min: 2, max: 4 },
        clusters: {
            sonority: true,
            sibilantOnsetException: false,
            // Geminates are real in Japanese (kitte), but they are a length
            // contrast the app has no way to spell yet; off keeps the output
            // honest.
            allowGeminates: false,
            maxPerWord: 0,
        },
        vowelHarmony: 'off',
        longVowelChance: 0.1,
        // No vowel may repeat itself immediately, in any combination of
        // lengths. Japanese writes ああ and おお, but it HEARS them as one long
        // vowel — which is what `longVowelChance` (kept at 0.1) supplies — so a
        // generated `makaake` or `saseːepɯ` is the same sound spelt twice plus a
        // syllable boundary the language does not have. Written out per vowel
        // and per length because `forbidden` is a plain substring list with no
        // wildcard; `aa` also catches the tail of `aaa`, and `aːa` the head of
        // `aːaː`. The declared diphthongs (ai, oi, ɯi, ei) are untouched: no
        // sequence of two DIFFERENT vowels is forbidden.
        forbidden: [
            'aa', 'ii', 'ɯɯ', 'ee', 'oo',
            'aːa', 'iːi', 'ɯːɯ', 'eːe', 'oːo',
            'aaː', 'iiː', 'ɯɯː', 'eeː', 'ooː',
        ],
        phonemeTilt: { k: 'common', s: 'common', t: 'common', n: 'common' },
    },
    examples: ['nomei', 'sate', 'tɯke', 'jiasijɯ', 'moe', 'poe'],
};
