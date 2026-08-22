/**
 * @fileoverview "Sinitic" — short syllables, aspiration contrast, n/ŋ codas only.
 *
 * @module generator/presets/data/sinitic
 */

import type { FlavourPreset } from '../types';

export const SINITIC_PRESET: FlavourPreset = {
    id: 'sinitic',
    name: 'Sinitic',
    tagline: 'One or two short syllables, aspirated versus plain stops, only n and ŋ may close.',
    touchstones: ['Mandarin', 'Cantonese'],
    why:
        'The signature here is the aspiration contrast. Instead of voiced against voiceless (b vs p), '
        + 'the stops come in plain and aspirated pairs — p vs pʰ, t vs tʰ, k vs kʰ — and the same '
        + 'contrast runs through the affricate series (t͡s / t͡sʰ, ʈ͡ʂ / ʈ͡ʂʰ, t͡ɕ / t͡ɕʰ), which is '
        + 'why a word can be full of stops and still sound crisp rather than heavy. Syllables are '
        + 'short, one or two per word, and only two consonants are ever allowed to close one: n and '
        + 'ŋ. That restriction is not the whole nasal class, so the template names them literally — '
        + 'CV[nŋ] — and an m at the end of a word is exactly the sort of small wrongness that makes '
        + 'a generated set stop sounding like the target. Voiced obstruents (b, d, g, v, z) are '
        + 'absent for the same reason: the language contrasts aspiration, so it has no use for them.',
    sounds: {
        core: [
            'p', 'pʰ', 't', 'tʰ', 'k', 'kʰ',
            'm', 'n', 'ŋ', 'l',
            's', 'x', 'ʂ',
            't͡s', 't͡sʰ', 'ʈ͡ʂ', 'ʈ͡ʂʰ',
        ],
        flavour: ['t͡ɕ', 't͡ɕʰ', 'ɕ', 'f', 'ʐ'],
        avoid: ['r', 'b', 'd', 'g', 'v', 'z', 'θ', 'ð', 'ʃ'],
    },
    vowels: {
        core: ['a', 'o', 'ɤ', 'i', 'u', 'y', 'ə'],
        flavour: ['ɛ', 'ɚ'],
    },
    // The rime table's four falling diphthongs. The mid one is written with ɛ
    // rather than e because this preset has no cardinal e: a diphthong whose
    // nucleus is not in the inventory can never be generated, and would sit here
    // as a declaration that does nothing.
    diphthongs: ['ai', 'ɛi', 'au', 'ou'],
    profile: {
        version: 1,
        frequencyCurve: 'zipf',
        syllables: [
            { pattern: 'CV', weight: 5 },
            // The literal group is the point: `N` would also allow a final m.
            { pattern: 'CV[nŋ]', weight: 4 },
            // The four falling diphthongs of a Mandarin-shaped rime table. They
            // carry real weight here: a language of bare CV and CVn would be
            // missing most of what makes the syllable inventory sound Sinitic.
            { pattern: 'C[ai ɛi au ou]', weight: 3 },
            { pattern: 'V', weight: 1 },
        ],
        syllableCount: { min: 1, max: 2 },
        clusters: {
            sonority: true,
            sibilantOnsetException: false,
            allowGeminates: false,
            maxPerWord: 0,
        },
        vowelHarmony: 'off',
        longVowelChance: 0,
        forbidden: [],
        phonemeTilt: {},
    },
    examples: ['mɚo', 'kʰouman', 'ma', 'kai', 'nən', 'mən'],
};
