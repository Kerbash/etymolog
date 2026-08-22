/**
 * @fileoverview "Elvish / flowing" — the liquid, open-syllable flavour.
 *
 * @module generator/presets/data/flowing
 */

import type { FlavourPreset } from '../types';

export const FLOWING_PRESET: FlavourPreset = {
    id: 'flowing',
    name: 'Elvish / flowing',
    tagline: 'Liquid consonants, open syllables, nothing that catches in the throat.',
    touchstones: ['Sindarin', 'Finnish', 'Welsh'],
    why:
        'The impression of "flowing" comes almost entirely from sonority. Words are built out of '
        + 'the most vowel-like consonants there are — l, r, n, m and the glides j and w — so the '
        + 'mouth never fully closes for long, and every syllable slides into the next. Stops are '
        + 'present but thin on the ground and voiceless (t, k), which keeps the rhythm light; the '
        + 'fricatives are the soft, front ones (s, θ, ð, v) rather than anything scraped at the back '
        + 'of the mouth. What is missing does as much work as what is there: no uvulars, no glottal '
        + 'stop, no affricates. Those are the sounds that interrupt a word, and a flavour whose whole '
        + 'identity is not being interrupted cannot afford them.',
    sounds: {
        core: ['l', 'r', 'n', 'm', 't', 'k', 's', 'θ', 'ð', 'v', 'j', 'w'],
        flavour: ['ɬ', 'ʎ', 'ɲ', 'f', 'h', 'd', 'g'],
        avoid: ['q', 'χ', 'ʁ', 'ʔ', 'x', 'ʕ', 'ħ', 't͡ʃ', 'd͡ʒ'],
    },
    vowels: {
        core: ['a', 'e', 'i', 'o', 'u'],
        flavour: ['y', 'ø', 'ɛ'],
    },
    diphthongs: ['ai', 'au', 'ei'],
    profile: {
        version: 1,
        frequencyCurve: 'zipf',
        syllables: [
            // Every non-cluster weight here is DOUBLED, so that the two cluster
            // shapes below — 1 each — together keep exactly the share the single
            // weight-1 `CLV` they replace used to have. The ratios are the ones
            // this preset shipped with; only the scale changed.
            { pattern: 'CV', weight: 12 },
            // A liquid or n coda is the one closed syllable this flavour
            // tolerates: it ends a syllable without stopping it. Named
            // literally rather than as the sonorant class `R`, which also
            // licenses -j, -w and the palatal nasals and produced the
            // `ɲonsimnlɛnɛw` school of word: a glide coda reads as a second
            // vowel and a -ɲ coda as Spanish, and neither is this flavour.
            { pattern: 'CV[n l r]', weight: 6 },
            // Obstruent + liquid, named on both sides. `CLV` took any
            // consonant, which meant `nl-`, `ml-`, `nr-` and `wr-`: sonorant
            // plus liquid is a rise so thin that the ear hears two syllables
            // run together rather than one onset, and it was most of what made
            // `mlowurlul` and `nlenyːu`. Two templates rather than one group of
            // each, because the r-clusters and the l-clusters do not have the
            // same members: tr-, cr-, dr-, gr-, thr- are Sindarin and Welsh,
            // `tl-` and `dl-` are neither. The palatal ʎ is left out of both —
            // it is a coda-less flavour sound here, not an onset.
            { pattern: '[t k d g f θ][r]V', weight: 1 },
            { pattern: '[k g f][l]V', weight: 1 },
            // The declared diphthongs, as a nucleus a consonant leans on. Small
            // weight: a diphthong in every second word reads as a tic, and the
            // flavour's rhythm comes from the open CV, not from the glides.
            { pattern: 'C[ai au ei]', weight: 2 },
            { pattern: 'V', weight: 2 },
        ],
        // Three syllables, not four: with a coda licence AND a CL- onset
        // licence, a fourth syllable is a fourth chance to stack something, and
        // the flavour's whole claim is that nothing catches.
        syllableCount: { min: 2, max: 3 },
        clusters: {
            sonority: true,
            sibilantOnsetException: false,
            allowGeminates: false,
            // One difficult place per word at most. Two licences (CLV onsets
            // and a liquid coda) meeting twice in one word is what a listener
            // hears as "not flowing".
            maxPerWord: 1,
        },
        vowelHarmony: 'off',
        longVowelChance: 0.1,
        forbidden: [],
        phonemeTilt: { l: 'common', n: 'common', r: 'common' },
    },
    examples: ['tɛkui', 'namy', 'moru', 'jieni', 'kanɲer', 'θɛhøn'],
};
