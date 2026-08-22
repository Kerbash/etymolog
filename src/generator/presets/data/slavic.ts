/**
 * @fileoverview "Slavic" — dense onset clusters and a full sibilant series.
 *
 * @module generator/presets/data/slavic
 */

import type { FlavourPreset } from '../types';

export const SLAVIC_PRESET: FlavourPreset = {
    id: 'slavic',
    name: 'Slavic',
    tagline: 'Consonants stacked at the front of the syllable and sibilants at three places.',
    touchstones: ['Polish', 'Russian', 'Czech'],
    why:
        'The cluster is the flavour. Two and three consonants at the START of a syllable are normal '
        + 'here, including combinations sonority does not license — s or ʃ in front of a stop — so '
        + 'the s + stop exception is switched on. The other half is the sibilant system: where most '
        + 'languages have one or two, this one has three places (s, ʃ, ʂ and their voiced partners) '
        + 'plus the affricates t͡s and t͡ʃ, which is what gives the output its density. The vowel '
        + 'system stays small and central — ɨ is the characteristic one — so the consonants keep the '
        + 'ear. Avoid θ and ð (they read as English), w and h (they soften everything), and the '
        + 'uvulars, which belong to the guttural flavour instead.',
    sounds: {
        core: [
            'p', 'b', 't', 'd', 'k', 'g',
            'm', 'n', 'l', 'r',
            's', 'z', 'ʃ', 'ʒ', 'v', 'f', 'x', 'j',
            't͡s', 't͡ʃ',
        ],
        // Palatal and retroflex series: the Polish ń/ś/ź and sz/ż. Written as
        // their own symbols rather than as palatalised t/d/n, which would share
        // a base with the core sounds and could not be painted separately on
        // the chart.
        flavour: ['ɲ', 'ʎ', 'ɕ', 'ʑ', 'ʂ', 'ʐ', 'd͡z', 'd͡ʒ'],
        avoid: ['θ', 'ð', 'w', 'h', 'q', 'ʔ', 'ħ', 'ɣ'],
    },
    vowels: {
        core: ['a', 'ɛ', 'i', 'ɔ', 'u', 'ɨ'],
        flavour: ['ɪ', 'ə', 'e', 'o'],
    },
    // No diphthong tier: the Slavic languages spread vowel sequences across
    // syllables rather than gliding within one.
    profile: {
        version: 1,
        frequencyCurve: 'zipf',
        syllables: [
            { pattern: 'CCVC', weight: 3 },
            { pattern: 'CVC', weight: 3 },
            { pattern: 'CCV', weight: 2 },
            { pattern: 'CV', weight: 2 },
        ],
        // Two syllables minimum, for the same reason the templates are
        // cluster-heavy: `ki`, `su`, `me`, `no` are what a uniform `[1, 3]`
        // produced almost half the time, and a monosyllable with a CV shape has
        // nothing Slavic left in it. The three-syllable ceiling stays — the
        // density comes from the onsets, not from the length.
        syllableCount: { min: 2, max: 3 },
        clusters: {
            sonority: true,
            sibilantOnsetException: true,
            allowGeminates: false,
            maxPerWord: 3,
        },
        vowelHarmony: 'off',
        longVowelChance: 0,
        forbidden: [],
        phonemeTilt: { s: 'common', r: 'common', 'ʃ': 'common' },
    },
    examples: ['sʐomʃloral', 'mɪɲʃoɲa', 'meɲɪd', 'bifətdɔs', 'mosɪ', 'pmɔsisat͡ʃ'],
};
