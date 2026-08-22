/**
 * @fileoverview "Harsh / guttural" — back-of-the-mouth consonants and closed syllables.
 *
 * @module generator/presets/data/guttural
 */

import type { FlavourPreset } from '../types';

export const GUTTURAL_PRESET: FlavourPreset = {
    id: 'guttural',
    name: 'Harsh / guttural',
    tagline: 'Uvulars, ejectives and a glottal stop; heavy closed syllables and real clusters.',
    touchstones: ['Arabic', 'Georgian', 'Klingon'],
    why:
        'Everything in this flavour happens behind the tongue. The stop series runs back past k to a '
        + 'uvular q, the fricatives to χ and ʁ, and the glottal stop is a full member rather than a '
        + 'boundary effect — so the mouth keeps closing at its narrowest, hardest point. Ejectives '
        + '(kʼ, tʼ, qʼ) are the sharpest thing a human vocal tract does and they sit alongside their '
        + 'plain counterparts rather than replacing them, which is what makes the inventory sound '
        + 'crowded as well as harsh. Syllables are closed by default and clusters are welcome, '
        + 'including the s + stop onsets that sonority alone would forbid. The vowels are '
        + 'deliberately short and unglamorous — a, ɪ, ʊ, ə — because a bright five-vowel system '
        + 'would sand the edges off everything else. What breaks it: palatals and glides (ʎ, ɲ, w, '
        + 'j), which are the softest consonants there are.',
    sounds: {
        core: [
            'q', 'qʼ', 'k', 'kʼ', 'g', 't', 'tʼ', 'd', 'ʔ',
            'χ', 'ʁ', 'x', 'ɣ',
            's', 'z', 'ʃ',
            'r', 'm', 'n',
        ],
        flavour: ['ħ', 'ʕ', 'ɬ', 't͡s', 'ʒ', 'h'],
        avoid: ['ʎ', 'ɲ', 'w', 'j', 'ɸ', 'β'],
    },
    vowels: {
        core: ['a', 'ɪ', 'ʊ', 'ə'],
        flavour: ['ɛ', 'ɔ', 'ɑ'],
    },
    // Lax, to match the vowel system: this flavour has no cardinal i or u, so
    // the diphthongs glide towards ɪ and ʊ. Written with the vowels the preset
    // actually ships, or the sequence could never be generated.
    diphthongs: ['aɪ', 'aʊ'],
    profile: {
        version: 1,
        frequencyCurve: 'zipf',
        syllables: [
            { pattern: 'CVC', weight: 5 },
            { pattern: 'CVCC', weight: 2 },
            { pattern: 'CCVC', weight: 2 },
            { pattern: 'CV', weight: 1 },
            { pattern: 'C[aɪ aʊ]', weight: 1 },
        ],
        // Two syllables minimum. `[1, 3]` is picked UNIFORMLY, so a third of
        // every batch came back as `gak`, `tɛk`, `ʃɑ` — and a one-syllable word
        // has no junction, no second cluster and nowhere for the ejectives and
        // uvulars to pile up, which is to say none of the flavour. Words this
        // heavy earn their length.
        syllableCount: { min: 2, max: 3 },
        clusters: {
            sonority: true,
            sibilantOnsetException: true,
            allowGeminates: true,
            maxPerWord: 3,
        },
        vowelHarmony: 'off',
        longVowelChance: 0.05,
        forbidden: [],
        phonemeTilt: { q: 'common', 'χ': 'common', 'ʔ': 'common' },
    },
    examples: ['zəkkɪz', 'hɪngɔm', 'kʼʊttʼɑ', 'mɪʁʃʊx', 'mɪhqaʊdəd', 'χənmarkʼ'],
};
