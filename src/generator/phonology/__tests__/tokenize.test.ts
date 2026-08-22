/**
 * tokenize — a transcription split into sounds.
 *
 * Two contracts are load-bearing here and both are easy to break by accident:
 *
 *  1. `tokenizeIpa` NEVER throws. It runs on the render path over whatever the
 *     user pasted, so the fuzz case below feeds it random Unicode — including
 *     lone surrogates, which are the input that makes naive `split('')` code
 *     produce garbage and `normalize()` implementations differ.
 *  2. The tokens are a PARTITION of the (NFC-normalised) input: joining `text`
 *     reproduces it exactly and every `index` addresses the right slice. Anything
 *     that highlights a sound in place depends on that.
 */

import { describe, expect, it } from 'vitest';

import { splitPhonemeString, tokenizeIpa } from '../tokenize';

/** Shorthand for the shape assertions below. */
function texts(input: string): string[] {
    return tokenizeIpa(input).map((token) => token.text);
}

describe('the worked example from the plan', () => {
    const tokens = tokenizeIpa('ˈkʷaː.t\u0361ʃi');

    it('splits into stress, kʷ, aː, syllable, t\u0361ʃ, i', () => {
        expect(texts('ˈkʷaː.t\u0361ʃi')).toEqual(['ˈ', 'kʷ', 'aː', '.', 't\u0361ʃ', 'i']);
    });

    it('marks the separators and only the separators', () => {
        expect(tokens.map((token) => token.separator)).toEqual([
            'stress', undefined, undefined, 'syllable', undefined, undefined,
        ]);
    });

    it('classifies each sound, with the modifier flags set', () => {
        expect(tokens[1].features).toMatchObject({ base: 'k', modifiers: ['ʷ'], long: false });
        expect(tokens[2].features).toMatchObject({ base: 'a', long: true });
        expect(tokens[4].features).toMatchObject({ base: 't\u0361ʃ', manner: 'affricate' });
        expect(tokens[5].features).toMatchObject({ base: 'i', kind: 'vowel' });
    });

    it('gives every separator a null feature set', () => {
        for (const token of tokens) {
            if (token.separator) expect(token.features).toBeNull();
        }
    });

    it('reports the offset of each token in the source string', () => {
        expect(tokens.map((token) => token.index)).toEqual([0, 1, 3, 5, 6, 9]);
    });
});

describe('token boundaries', () => {
    it('keeps a tie bar and the symbol after it in one token', () => {
        expect(texts('t\u0361ʃa')).toEqual(['t\u0361ʃ', 'a']);
        expect(texts('d\u035Cz')).toEqual(['d\u035Cz']);
    });

    it('splits an untied tʃ into two sounds', () => {
        // Deliberate: a tokenizer sees no word and no inventory, so it cannot
        // know whether `tʃ` was meant as an affricate or a cluster.
        // `describePhoneme` — the single-phoneme api — reads it as the affricate.
        const tokens = tokenizeIpa('tʃ');
        expect(tokens).toHaveLength(2);
        expect(tokens[0].features).toMatchObject({ base: 't', manner: 'plosive' });
        expect(tokens[1].features).toMatchObject({ base: 'ʃ', manner: 'fricative' });
    });

    it('attaches every modifier letter and combining mark to the base before it', () => {
        // The nasalised vowel arrives DECOMPOSED here and comes back composed:
        // NFC is the one change the tokenizer makes to the text it is given.
        expect(texts('pʰa\u0303kʷːtʲ')).toEqual(['pʰ', '\u00E3', 'kʷː', 'tʲ']);
    });

    it('attaches the superscript ⁿ, which is outside the modifier-letter block', () => {
        // U+207F is not in U+02B0-U+02FF, so it only attaches because it is
        // named separately. A nasally released d is one sound, not two.
        expect(texts('dⁿa')).toEqual(['dⁿ', 'a']);
    });

    it('does not swallow a stress mark as a modifier', () => {
        // ˈ (U+02C8) and ˌ (U+02CC) live INSIDE the modifier-letter range, so
        // this is the case that breaks the moment the range check loses its
        // separator exclusion.
        expect(texts('kaˈta')).toEqual(['k', 'a', 'ˈ', 't', 'a']);
        expect(texts('kaˌta')).toEqual(['k', 'a', 'ˌ', 't', 'a']);
    });

    it('treats a dangling tie bar as part of the token it follows', () => {
        expect(texts('t\u0361')).toEqual(['t\u0361']);
        expect(texts('t\u0361 a')).toEqual(['t\u0361', ' ', 'a']);
    });

    it('emits one separator token per whitespace character', () => {
        const tokens = tokenizeIpa('a b');
        expect(tokens.map((token) => token.separator)).toEqual([undefined, 'space', undefined]);
        expect(tokenizeIpa('a\tb\nc').filter((token) => token.separator === 'space')).toHaveLength(2);
    });

    it('treats the undertie as a boundary marker', () => {
        expect(tokenizeIpa('a‿b').map((token) => token.separator)).toEqual([undefined, 'syllable', undefined]);
    });
});

describe('normalisation', () => {
    it('keeps the user\'s ɡ but classifies it as g', () => {
        const [token] = tokenizeIpa('ɡa');
        expect(token.text).toBe('ɡ');
        expect(token.features?.base).toBe('g');
    });

    it('treats a precomposed and a decomposed vowel alike', () => {
        const composed = tokenizeIpa('\u00E3');
        const decomposed = tokenizeIpa('a\u0303');
        expect(composed).toHaveLength(1);
        expect(decomposed).toHaveLength(1);
        expect(composed[0].text).toBe(decomposed[0].text);
        expect(composed[0].features?.nasalized).toBe(true);
        expect(decomposed[0].features?.nasalized).toBe(true);
    });
});

describe('input it cannot classify', () => {
    it('returns an empty list for an empty string', () => {
        expect(tokenizeIpa('')).toEqual([]);
    });

    it('emits an unclassified token rather than throwing', () => {
        const tokens = tokenizeIpa('a☃b');
        expect(tokens.map((token) => token.text)).toEqual(['a', '☃', 'b']);
        expect(tokens[1].features).toBeNull();
        expect(tokens[1].separator).toBeUndefined();
    });

    it('starts a token on a stray modifier', () => {
        const tokens = tokenizeIpa('ʰa');
        expect(tokens.map((token) => token.text)).toEqual(['ʰ', 'a']);
        expect(tokens[0].features).toBeNull();
    });

    it('survives a lone surrogate', () => {
        expect(() => tokenizeIpa('\uD800')).not.toThrow();
        expect(() => tokenizeIpa('a\uDFFFb')).not.toThrow();
    });

    it('keeps astral characters whole', () => {
        // One emoji is one token, not two half-tokens: this is what `split('')`
        // gets wrong.
        expect(texts('a\u{1F600}b')).toEqual(['a', '\u{1F600}', 'b']);
    });
});

describe('fuzz: no input can break it', () => {
    /** mulberry32 — a seeded PRNG so a failing case is reproducible, not a flake. */
    function rng(seed: number): () => number {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const ALPHABET = Array.from('ptkbdgmnszʃʒaeiouːʰʷʲ\u0303\u0361\u035Cˈˌ.‿ ɡçã☃\u{1F600}');

    it('never throws, and always partitions its input', () => {
        const next = rng(0x5eed);
        for (let round = 0; round < 500; round++) {
            const length = Math.floor(next() * 12);
            let input = '';
            for (let i = 0; i < length; i++) {
                // Half from the IPA-ish alphabet, half from anywhere in the BMP
                // (lone surrogates included, deliberately).
                input += next() < 0.5
                    ? ALPHABET[Math.floor(next() * ALPHABET.length)]
                    : String.fromCharCode(Math.floor(next() * 0x10000));
            }

            let tokens;
            try {
                tokens = tokenizeIpa(input);
            } catch (error) {
                throw new Error(`tokenizeIpa threw on ${JSON.stringify(input)}: ${String(error)}`);
            }

            let normalised = input;
            try {
                normalised = input.normalize('NFC');
            } catch {
                // Matches the module's own fallback.
            }

            expect(tokens.map((token) => token.text).join(''), JSON.stringify(input)).toBe(normalised);
            let cursor = 0;
            for (const token of tokens) {
                expect(token.index, JSON.stringify(input)).toBe(cursor);
                expect(normalised.slice(token.index, token.index + token.text.length)).toBe(token.text);
                if (token.separator) expect(token.features).toBeNull();
                cursor += token.text.length;
            }
        }
    });
});

describe('splitPhonemeString', () => {
    it('drops the separators and keeps the sounds', () => {
        expect(splitPhonemeString('ˈkʷaː.t\u0361ʃi').map((token) => token.text))
            .toEqual(['kʷ', 'aː', 't\u0361ʃ', 'i']);
    });

    it('is empty for a string of nothing but separators', () => {
        expect(splitPhonemeString('ˈ . ')).toEqual([]);
    });

    it('returns tokens, so a caller can read features without classifying again', () => {
        const [first] = splitPhonemeString('nta');
        expect(first.features).toMatchObject({ manner: 'nasal' });
    });
});
