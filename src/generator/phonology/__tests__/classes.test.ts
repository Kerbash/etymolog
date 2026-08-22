/**
 * classes — the letters a syllable template is written in.
 *
 * These letters are a user-facing vocabulary: `CV`, `(C)V(N)`. Membership is
 * asserted as the COMPLETE set for each sound rather than as "contains N",
 * because the bug that matters is a sound quietly joining a class it does not
 * belong to — a `V` slot that can draw a consonant, an `L` that includes the
 * glides.
 */

import { describe, expect, it } from 'vitest';

import { getAllConsonantSymbols, getAllIPASymbols, getAllVowelSymbols } from '../../../data/ipaChartData';
import { classOf, isClassLetter, isInClass, CLASS_LABELS, CLASS_LETTERS } from '../classes';
import { describePhoneme } from '../features';
import type { ClassLetter } from '../classes';

/** Classes of a phoneme string, for readability below. */
function classes(phoneme: string): ClassLetter[] {
    const features = describePhoneme(phoneme);
    if (!features) throw new Error(`test fixture ${phoneme} does not resolve`);
    return classOf(features);
}

describe('the letter set', () => {
    it('is exactly the ten reserved letters', () => {
        expect(CLASS_LETTERS).toEqual(['C', 'V', 'P', 'F', 'S', 'N', 'L', 'G', 'R', 'O']);
    });

    it('has no duplicates and a label for every letter', () => {
        expect(new Set(CLASS_LETTERS).size).toBe(CLASS_LETTERS.length);
        for (const letter of CLASS_LETTERS) {
            expect(CLASS_LABELS[letter], letter).toBeTruthy();
        }
        expect(Object.keys(CLASS_LABELS).sort()).toEqual([...CLASS_LETTERS].sort());
    });

    it('recognises a letter only as a single character', () => {
        for (const letter of CLASS_LETTERS) expect(isClassLetter(letter)).toBe(true);
        expect(isClassLetter('X')).toBe(false);
        expect(isClassLetter('c')).toBe(false);    // lower case is not a class
        expect(isClassLetter('CV')).toBe(false);   // a pattern is not a letter
        expect(isClassLetter('')).toBe(false);
        expect(isClassLetter('(')).toBe(false);
    });
});

describe('membership', () => {
    it('puts the plan\'s spot checks where the plan says', () => {
        expect(classes('w')).toEqual(['C', 'G', 'R']);
        expect(classes('ʃ')).toEqual(['C', 'F', 'S', 'O']);
        expect(classes('m')).toEqual(['C', 'N', 'R']);
        expect(classes('a')).toEqual(['V']);
    });

    it('treats affricates as stops, and a sibilant affricate as a sibilant', () => {
        expect(classes('t\u0361ʃ')).toEqual(['C', 'P', 'S', 'O']);
        expect(classes('tʃ')).toEqual(['C', 'P', 'S', 'O']);
        expect(classes('t\u0361ɬ')).toEqual(['C', 'P', 'O']);   // lateral affricate: not grooved
    });

    it('counts clicks and implosives as stops', () => {
        expect(classes('ʘ')).toEqual(['C', 'P', 'O']);
        expect(classes('ɓ')).toEqual(['C', 'P', 'O']);
    });

    it('groups laterals, trills and taps as liquids', () => {
        expect(classes('l')).toEqual(['C', 'L', 'R']);
        expect(classes('r')).toEqual(['C', 'L', 'R']);
        expect(classes('ɾ')).toEqual(['C', 'L', 'R']);
        expect(classes('ɫ')).toEqual(['C', 'L', 'R']);
        expect(classes('ʎ')).toEqual(['C', 'L', 'R']);
    });

    it('keeps the lateral approximants out of the glides', () => {
        // A language that allows `Cj` very often does not allow `Cl`; merging
        // them would make the two indistinguishable in a template.
        expect(classes('j')).toEqual(['C', 'G', 'R']);
        expect(classes('ɹ')).toEqual(['C', 'G', 'R']);
        expect(isInClass(describePhoneme('l')!, 'G')).toBe(false);
        expect(isInClass(describePhoneme('j')!, 'L')).toBe(false);
    });

    it('counts a lateral fricative as a fricative and not as a liquid', () => {
        expect(classes('ɬ')).toEqual(['C', 'F', 'O']);
    });

    it('puts plosives and fricatives in O, sonorants in R, and never both', () => {
        for (const obstruent of ['p', 'b', 't', 'k', 's', 'z', 'x', 'h', 't\u0361s']) {
            expect(classes(obstruent), obstruent).toContain('O');
            expect(classes(obstruent), obstruent).not.toContain('R');
        }
        for (const sonorant of ['m', 'n', 'ŋ', 'l', 'r', 'j', 'w']) {
            expect(classes(sonorant), sonorant).toContain('R');
            expect(classes(sonorant), sonorant).not.toContain('O');
        }
    });

    it('returns the classes in the canonical order', () => {
        for (const phoneme of ['ʃ', 't\u0361ʃ', 'm', 'w', 'ɬ', 'p', 'a']) {
            const found = classes(phoneme);
            const ordered = [...found].sort(
                (a, b) => CLASS_LETTERS.indexOf(a) - CLASS_LETTERS.indexOf(b),
            );
            expect(found, phoneme).toEqual(ordered);
        }
    });
});

describe('the consonant / vowel wall', () => {
    it('never puts a chart vowel in a consonant class', () => {
        for (const symbol of getAllVowelSymbols()) {
            expect(classes(symbol), symbol).toEqual(['V']);
        }
    });

    it('never puts a chart consonant in V', () => {
        for (const symbol of getAllConsonantSymbols()) {
            const found = classes(symbol);
            expect(found, symbol).toContain('C');
            expect(found, symbol).not.toContain('V');
        }
    });

    it('gives every chart symbol at least one class', () => {
        for (const symbol of getAllIPASymbols()) {
            expect(classes(symbol).length, symbol).toBeGreaterThan(0);
        }
    });

    it('agrees with isInClass on every chart symbol', () => {
        for (const symbol of getAllIPASymbols()) {
            const features = describePhoneme(symbol)!;
            const found = classOf(features);
            for (const letter of CLASS_LETTERS) {
                expect(isInClass(features, letter), `${symbol} in ${letter}`).toBe(found.includes(letter));
            }
        }
    });
});
