/**
 * @fileoverview "Smooth / island" — the tiny-inventory, strictly-CV flavour.
 *
 * @module generator/presets/data/island
 */

import type { FlavourPreset } from '../types';

export const ISLAND_PRESET: FlavourPreset = {
    id: 'island',
    name: 'Smooth / island',
    tagline: 'A handful of consonants, every syllable open, long vowels doing the work.',
    touchstones: ['Hawaiian', 'Samoan', 'Māori'],
    why:
        'This flavour is defined by subtraction. The consonant inventory is one of the smallest in '
        + 'the world — a few stops, a couple of nasals, h and w — and every syllable is a consonant '
        + 'plus a vowel or a vowel alone, so no word ever ends in a consonant and no two consonants '
        + 'ever meet. That leaves the vowels carrying the whole word: five of them, freely long or '
        + 'short, freely sequenced into diphthongs. Fricatives are the giveaway to avoid; a single s '
        + 'or f makes the result read as generic rather than as an island language, because the '
        + 'absence of scraped sounds is exactly what the ear is picking up on.',
    sounds: {
        core: ['p', 'k', 'ʔ', 'h', 'm', 'n', 'l', 'w'],
        flavour: ['t', 'v', 'r', 'ŋ'],
        avoid: ['s', 'f', 'ʃ', 'z', 'θ', 'ð', 'x', 'χ', 't͡ʃ', 'd͡ʒ', 'g', 'b'],
    },
    vowels: {
        core: ['a', 'e', 'i', 'o', 'u'],
        // Length is a modifier here, not a separate vowel: `longVowelChance`
        // supplies it, so listing `aː` would only duplicate `a` on the chart.
        flavour: [],
    },
    diphthongs: ['ai', 'au', 'ei', 'ou'],
    profile: {
        version: 1,
        frequencyCurve: 'zipf',
        syllables: [
            { pattern: 'CV', weight: 8 },
            // Vowel sequences are half of this flavour; a diphthong nucleus is
            // the one way a strictly-CV language gets a heavy syllable.
            { pattern: 'C[ai au ei ou]', weight: 2 },
            // A vowel-initial syllable is real here (Hawaiʻi, aloha) but it is
            // the ONE shape that can put three vowels in a row — after a
            // diphthong nucleus, or after another of itself — so it stays a
            // seasoning rather than a quarter of the syllables.
            { pattern: 'V', weight: 1 },
        ],
        syllableCount: { min: 2, max: 4 },
        clusters: {
            sonority: true,
            sibilantOnsetException: false,
            allowGeminates: false,
            // Not "few clusters" — none. A single cluster breaks the flavour.
            maxPerWord: 0,
        },
        vowelHarmony: 'off',
        // Halved from 0.15. Length is a feature of this flavour, but at one
        // vowel in seven it was landing twice in a three-syllable word and the
        // result (`waahaweː`, `naːainaː`) read as a stutter rather than as a
        // contrast — a contrast needs short vowels around it to contrast with.
        longVowelChance: 0.08,
        // No vowel may repeat itself immediately, in any combination of
        // lengths. Two identical vowels in a row IS a long vowel — that is what
        // `longVowelChance` is for, and what Polynesian orthography writes with
        // a macron — so `hakaa` and `mopimouu` are not extra flavour, they are
        // the same sound spelt twice. Written out per vowel and per length
        // because `forbidden` is a plain substring list with no wildcard;
        // `aa` also catches the tail of `aaa`, and `aːa` the head of `aːaː`.
        forbidden: [
            'aa', 'ee', 'ii', 'oo', 'uu',
            'aːa', 'eːe', 'iːi', 'oːo', 'uːu',
            'aaː', 'eeː', 'iiː', 'ooː', 'uuː',
        ],
        phonemeTilt: { a: 'common', 'ʔ': 'rare' },
    },
    examples: ['munia', 'kami', 'meke', 'noi', 'ruo', 'tari'],
};
