/**
 * sonority — the scale, and the two cluster checks built on it.
 *
 * The ordering assertions are written as a chain rather than as magic numbers
 * wherever the exact value does not matter: what the generator depends on is
 * that a vowel outranks a liquid outranks a nasal outranks a fricative
 * outranks a stop. The numbers themselves are an implementation detail that a
 * future scale change should be free to renumber.
 */

import { describe, expect, it } from 'vitest';

import { describePhoneme } from '../features';
import { isValidCoda, isValidOnset, sonorityOf } from '../sonority';

/** Sonority of a phoneme string, for readability below. */
function sonority(phoneme: string): number {
    const features = describePhoneme(phoneme);
    if (!features) throw new Error(`test fixture ${phoneme} does not resolve`);
    return sonorityOf(features);
}

describe('the scale', () => {
    it('ranks the manner groups in the classic order', () => {
        expect(sonority('a')).toBeGreaterThan(sonority('j'));      // vowel > glide
        expect(sonority('j')).toBeGreaterThan(sonority('l'));      // glide > lateral
        expect(sonority('l')).toBeGreaterThan(sonority('n'));      // lateral > nasal
        expect(sonority('n')).toBeGreaterThan(sonority('z'));      // nasal > voiced fricative
        expect(sonority('z')).toBeGreaterThan(sonority('s'));      // voiced > voiceless fricative
        expect(sonority('s')).toBeGreaterThan(sonority('t\u0361s'));    // fricative > affricate
        expect(sonority('t\u0361s')).toBeGreaterThan(sonority('d'));    // affricate > voiced plosive
        expect(sonority('d')).toBeGreaterThan(sonority('t'));      // voiced > voiceless plosive
    });

    it('separates vowels by height group, open being the most sonorous', () => {
        expect(sonority('a')).toBe(10);
        expect(sonority('æ')).toBe(10);   // near-open shares the open group
        expect(sonority('e')).toBe(9);
        expect(sonority('ə')).toBe(9);    // mid shares the mid group
        expect(sonority('i')).toBe(8);
        expect(sonority('ʊ')).toBe(8);    // near-close shares the close group
        expect(sonority('a')).toBeGreaterThan(sonority('e'));
        expect(sonority('e')).toBeGreaterThan(sonority('i'));
    });

    it('ranks trills and taps with the laterals', () => {
        expect(sonority('r')).toBe(sonority('l'));
        expect(sonority('ɾ')).toBe(sonority('l'));
    });

    it('scores a lateral fricative as a fricative, not as a liquid', () => {
        // ɬ patterns with s in clusters (it is friction, not sonority), which is
        // the whole reason the lateral fricative row is kept out of `L`.
        expect(sonority('ɬ')).toBe(sonority('s'));
        expect(sonority('ɮ')).toBe(sonority('z'));
        expect(sonority('ɬ')).toBeLessThan(sonority('l'));
    });

    it('puts clicks and implosives on the floor with the voiceless plosives', () => {
        expect(sonority('ʘ')).toBe(sonority('t'));
        expect(sonority('ɓ')).toBe(sonority('t'));
    });

    it('gives every chart-resolvable sound a positive, finite score', () => {
        for (const phoneme of ['p', 'b', 'm', 'ʙ', 'ⱱ', 'x', 'ɬ', 'ɰ', 'ʟ', 'ʔ', 'i', 'ɶ', 't\u0361ʃ', 'ǂ', 'ʄ']) {
            const value = sonority(phoneme);
            expect(Number.isFinite(value), phoneme).toBe(true);
            expect(value, phoneme).toBeGreaterThan(0);
        }
    });
});

describe('isValidOnset', () => {
    it('accepts anything shorter than a cluster', () => {
        expect(isValidOnset([])).toBe(true);
        expect(isValidOnset(['p'])).toBe(true);
        expect(isValidOnset(['ʔ'])).toBe(true);
    });

    it('accepts a rising cluster and rejects a falling one', () => {
        expect(isValidOnset(['p', 'l'])).toBe(true);
        expect(isValidOnset(['k', 'r'])).toBe(true);
        expect(isValidOnset(['b', 'j'])).toBe(true);
        expect(isValidOnset(['l', 'p'])).toBe(false);
        expect(isValidOnset(['r', 't'])).toBe(false);
    });

    it('rejects a flat cluster — strictly rising means strictly', () => {
        expect(isValidOnset(['t', 't'])).toBe(false);
        expect(isValidOnset(['p', 't'])).toBe(false);   // both voiceless plosives
        expect(isValidOnset(['m', 'n'])).toBe(false);   // both nasals
    });

    it('allows s + plosive only when the exception is switched on', () => {
        expect(isValidOnset(['s', 't'])).toBe(false);
        expect(isValidOnset(['s', 't'], { allowSibilantOnset: true })).toBe(true);
        expect(isValidOnset(['s', 'p'], { allowSibilantOnset: true })).toBe(true);
        expect(isValidOnset(['s', 't', 'r'], { allowSibilantOnset: true })).toBe(true);
        expect(isValidOnset(['ʃ', 't'], { allowSibilantOnset: true })).toBe(true);
    });

    it('anchors the exception to the first position', () => {
        // `pst` must not become legal because there is a sibilant somewhere in
        // it; the licence is for a word-initial s, not for any s.
        expect(isValidOnset(['p', 's', 't'], { allowSibilantOnset: true })).toBe(false);
        expect(isValidOnset(['t', 's', 't'], { allowSibilantOnset: true })).toBe(false);
    });

    it('does not extend the exception to a non-sibilant or a non-plosive', () => {
        expect(isValidOnset(['f', 't'], { allowSibilantOnset: true })).toBe(false);   // f is not sibilant
        expect(isValidOnset(['s', 'f'], { allowSibilantOnset: true })).toBe(false);   // f is not a plosive
    });

    it('still checks the rest of the onset after an exempt s + plosive', () => {
        // str- passes because t < r. The licence covers the first pair only:
        // a tail that falls must still be rejected, or `splm-` walks in.
        expect(isValidOnset(['s', 't', 'r'], { allowSibilantOnset: true })).toBe(true);
        expect(isValidOnset(['s', 'p', 'l', 'm'], { allowSibilantOnset: true })).toBe(false);
    });

    it('refuses to judge a cluster it cannot classify', () => {
        expect(isValidOnset(['☃', 'l'])).toBe(false);
        expect(isValidOnset(['p', '☃'])).toBe(false);
        // ...but a single unknown sound is still a legal one-consonant onset:
        // there is no sequence to check.
        expect(isValidOnset(['☃'])).toBe(true);
    });
});

describe('isValidCoda', () => {
    it('accepts anything shorter than a cluster', () => {
        expect(isValidCoda([])).toBe(true);
        expect(isValidCoda(['t'])).toBe(true);
    });

    it('accepts a falling cluster and rejects a rising one', () => {
        expect(isValidCoda(['l', 'p'])).toBe(true);
        expect(isValidCoda(['r', 't'])).toBe(true);
        expect(isValidCoda(['n', 't'])).toBe(true);
        expect(isValidCoda(['p', 'l'])).toBe(false);
        expect(isValidCoda(['t', 'r'])).toBe(false);
    });

    it('rejects a flat cluster', () => {
        expect(isValidCoda(['t', 't'])).toBe(false);
    });

    it('never applies the sibilant exception, whatever the bag says', () => {
        // The licence is an ONSET licence, and the same sequence proves it:
        // `str` is a legal onset with the flag on and never a legal coda.
        expect(isValidCoda(['t', 's'], { allowSibilantOnset: true })).toBe(false);
        expect(isValidCoda(['s', 't', 'r'], { allowSibilantOnset: true })).toBe(false);
        expect(isValidOnset(['s', 't', 'r'], { allowSibilantOnset: true })).toBe(true);
        // -st IS a legal coda, but because it falls, not because of any flag.
        expect(isValidCoda(['s', 't'])).toBe(true);
    });

    it('refuses to judge a cluster it cannot classify', () => {
        expect(isValidCoda(['l', '☃'])).toBe(false);
    });
});
