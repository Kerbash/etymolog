/**
 * diphthongSuggestions — the pure helpers behind "Vowels next to each other"
 * (DIPHTHONG_BLOCKS_PLAN.md §4.2) and "Consonants that can carry a syllable"
 * (CONLANG_EDGES_PLAN.md §5.1).
 */

import { describe, expect, it } from 'vitest';

import {
    diphthongExample,
    isSingleConsonant,
    isVowelSequence,
    suggestDiphthongs,
    suggestSyllabicConsonants,
    syllabicExample,
} from '../diphthongSuggestions';

const shapes = (...patterns: string[]) => patterns.map((pattern) => ({ pattern, weight: 1 }));

describe('isVowelSequence', () => {
    it.each(['ai', 'au', 'iə', 'iəu', ' ai '])('%s is two or more vowels', (text) => {
        expect(isVowelSequence(text)).toBe(true);
    });

    it.each(['a', '', 'ka', 'ng', 'a.i', 'a i', '¤§'])('%s is not', (text) => {
        expect(isVowelSequence(text)).toBe(false);
    });
});

describe('suggestDiphthongs', () => {
    it('collects the all-vowel literal members of two or more sounds, in first-appearance order', () => {
        expect(suggestDiphthongs(shapes('CV[ai au]', '(C)[ei a]', 'CV[au iə]'))).toEqual(['ai', 'au', 'ei', 'iə']);
    });

    it('skips single vowels, consonants, syllables and shapes without literal groups', () => {
        // `[oi]` (no space) is "o or i" to the word generator — two single vowels.
        expect(suggestDiphthongs(shapes('CV', 'CV[n ŋ]', '[a e]', 'C[ka ta]', 'C[oi]'))).toEqual([]);
    });

    it('skips a shape that does not parse and keeps reading the others', () => {
        expect(suggestDiphthongs(shapes('CV[ai', 'CV[oi ui]'))).toEqual(['oi', 'ui']);
    });

    it('NFC-normalises and de-duplicates', () => {
        const decomposed = 'a' + String.fromCodePoint(0x303) + 'i'; // a + combining tilde, then i
        const composed = String.fromCodePoint(0xe3) + 'i'; // the precomposed letter, then i
        const out = suggestDiphthongs(shapes(`CV[${decomposed} a]`, `CV[${composed} o]`));
        expect(out).toEqual([composed]);
    });

    it('no shapes → no suggestions', () => {
        expect(suggestDiphthongs([])).toEqual([]);
    });
});

describe('diphthongExample', () => {
    it('t + the pair, kept whole and split sound by sound', () => {
        expect(diphthongExample('ai')).toEqual({ word: 'tai', apart: 'ta · i' });
        expect(diphthongExample('iəu')).toEqual({ word: 'tiəu', apart: 'ti · ə · u' });
    });
});

/** A sign with these sounds; the first flag says which one is used for spelling. */
const sign = (...phonemes: [string, boolean][]) => ({
    phonemes: phonemes.map(([phoneme, use_in_auto_spelling]) => ({ phoneme, use_in_auto_spelling })),
});

describe('isSingleConsonant', () => {
    it.each(['r', 'l', 'n', 'm', 'k', 'tʃ', ' r ', 'rʲ', 'r̩'])('%s is one consonant', (text) => {
        expect(isSingleConsonant(text)).toBe(true);
    });

    it.each(['', '  ', 'a', 'ai', 'rl', 'kr', 'r.', 'r l', '¤'])('%s is not', (text) => {
        expect(isSingleConsonant(text)).toBe(false);
    });

    it('reads a decomposed entry the same as a composed one', () => {
        expect(isSingleConsonant('n' + String.fromCodePoint(0x303))).toBe(isSingleConsonant(String.fromCodePoint(0xf1)));
    });
});

describe('suggestSyllabicConsonants', () => {
    it('offers nasals, l-sounds, r-sounds and the like, in sign order, without duplicates', () => {
        const signs = [
            sign(['k', true]),
            sign(['r', true]),
            sign(['a', true]),
            sign(['n', true]),
            sign(['l', true]),
            sign(['ɾ', true]),
            sign(['ɹ', true]),
            sign(['s', true]),
            sign(['r', true]),
            sign(['m', true]),
        ];
        expect(suggestSyllabicConsonants(signs)).toEqual(['r', 'n', 'l', 'ɾ', 'ɹ', 'm']);
    });

    it('reads the spelling sound first, else the first sound', () => {
        expect(suggestSyllabicConsonants([sign(['k', false], ['n', true])])).toEqual(['n']);
        expect(suggestSyllabicConsonants([sign(['n', false], ['k', false])])).toEqual(['n']);
        expect(suggestSyllabicConsonants([sign(['l', false], ['k', true])])).toEqual([]);
    });

    it('skips signs with no sound, syllables, unreadable sounds and sounds already marked syllabic', () => {
        const signs = [sign(), sign(['ka', true]), sign(['¤', true]), sign(['r̩', true]), sign(['  ', true])];
        expect(suggestSyllabicConsonants(signs)).toEqual([]);
    });

    it('NFC-normalises and trims', () => {
        const decomposed = 'n' + String.fromCodePoint(0x303);
        expect(suggestSyllabicConsonants([sign([` ${decomposed} `, true]), sign([decomposed.normalize('NFC'), true])])).toEqual([
            decomposed.normalize('NFC'),
        ]);
    });

    it('reads any iterable (the values of a Map)', () => {
        const map = new Map([
            [1, sign(['m', true])],
            [2, sign(['p', true])],
        ]);
        expect(suggestSyllabicConsonants(map.values())).toEqual(['m']);
        expect(suggestSyllabicConsonants([])).toEqual([]);
    });
});

describe('syllabicExample', () => {
    it('k + the consonant + tek, cut after the consonant and whole', () => {
        expect(syllabicExample('r')).toEqual({ word: 'krtek', apart: 'kr · tek' });
        expect(syllabicExample('l')).toEqual({ word: 'kltek', apart: 'kl · tek' });
    });
});
