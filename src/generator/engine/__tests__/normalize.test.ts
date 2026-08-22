/**
 * Pronunciation normalisation — the dedupe key.
 *
 * The danger here is over-reach. Anything this function strips becomes a
 * distinction the generator can no longer make, and a `ː` stripped by accident
 * would silently collapse `kata` and `kaːta` into one word forever.
 *
 * Node environment.
 */

import { describe, expect, it } from 'vitest';
import { normalizePronunciation } from '../normalize';

describe('normalizePronunciation strips what punctuates', () => {
    it('removes stress marks', () => {
        expect(normalizePronunciation('ˈkata')).toBe('kata');
        expect(normalizePronunciation('ˌkaˈta')).toBe('kata');
    });

    it('removes syllable dots and the undertie', () => {
        expect(normalizePronunciation('ka.ta')).toBe('kata');
        expect(normalizePronunciation('ka‿ta')).toBe('kata');
    });

    it('removes every kind of whitespace', () => {
        expect(normalizePronunciation('ka ta')).toBe('kata');
        expect(normalizePronunciation(' ka\tta\n')).toBe('kata');
    });

    it('folds the single-storey g onto ASCII g', () => {
        expect(normalizePronunciation('ɡata')).toBe('gata');
        expect(normalizePronunciation('ɡata')).toBe(normalizePronunciation('gata'));
    });

    it('makes a precomposed and a decomposed vowel compare equal', () => {
        expect(normalizePronunciation('ã')).toBe(normalizePronunciation('ã'));
    });

    it('handles the empty string and a non-string without throwing', () => {
        expect(normalizePronunciation('')).toBe('');
        expect(normalizePronunciation(undefined as unknown as string)).toBe('');
        expect(normalizePronunciation(null as unknown as string)).toBe('');
    });
});

describe('normalizePronunciation keeps what is a sound', () => {
    it('keeps length', () => {
        expect(normalizePronunciation('kaːta')).toBe('kaːta');
        expect(normalizePronunciation('kaːta')).not.toBe(normalizePronunciation('kata'));
    });

    it('keeps case — IPA is case-sensitive', () => {
        expect(normalizePronunciation('ʙa')).not.toBe(normalizePronunciation('Ba'));
    });

    it('keeps diacritics and modifier letters', () => {
        expect(normalizePronunciation('pʰal')).toBe('pʰal');
        expect(normalizePronunciation('kʼa')).toBe('kʼa');
        expect(normalizePronunciation('t͡ʃa')).toBe('t͡ʃa');
    });

    it('keeps a tie bar, so an affricate does not collapse into a cluster', () => {
        expect(normalizePronunciation('t͡ʃa')).not.toBe(normalizePronunciation('tʃa'));
    });

    it('is idempotent', () => {
        const once = normalizePronunciation('ˈkaː.ta ɡu');
        expect(normalizePronunciation(once)).toBe(once);
    });
});
