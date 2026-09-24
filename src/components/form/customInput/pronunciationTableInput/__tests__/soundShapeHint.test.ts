/**
 * soundShapeHint — the note under a pronunciation row whose text reads as
 * several consonants (DIPHTHONG_BLOCKS_PLAN.md §4.3).
 */

import { describe, expect, it } from 'vitest';

import { soundShapeHint } from '../soundShapeHint';

describe('soundShapeHint', () => {
    it.each([
        ['ng', 'n, g', 'ŋ'],
        ['ny', 'n, y', 'ɲ'],
        ['sh', 's, h', 'ʃ'],
        ['ch', 'c, h', 'tʃ'],
        ['zh', 'z, h', 'ʒ'],
        ['th', 't, h', 'θ'],
        ['dj', 'd, j', 'dʒ'],
    ])('%s → "two sounds (%s)" and the one-sound spelling %s', (typed, sounds, spelling) => {
        expect(soundShapeHint(typed)).toBe(
            `${typed} reads as two sounds (${sounds}). If it is one sound, spell it ${spelling}.`,
        );
    });

    it.each(['ts', 'dz', 'tʃ', 'dʒ'])(
        'an untied affricate (%s) is already ONE sound to the sound table — no hint',
        (typed) => {
            expect(soundShapeHint(typed)).toBeNull();
        },
    );

    it('two consonants outside the table: no spelling suggestion', () => {
        expect(soundShapeHint('kw')).toBe('kw reads as two sounds (k, w). That is fine if your sign stands for both.');
    });

    it('three consonants say "three sounds"', () => {
        expect(soundShapeHint('str')).toBe(
            'str reads as three sounds (s, t, r). That is fine if your sign stands for all of them.',
        );
    });

    it.each([
        ['ŋ', 'one sound'],
        ['n͡g', 'tie bar (the table cannot read it)'],
        ['ai', 'vowels'],
        ['ka', 'a syllable'],
        ['', 'empty'],
        ['   ', 'blank'],
        ['n', 'one consonant'],
        ['¤§', 'unreadable'],
    ])('%s → null (%s)', (typed) => {
        expect(soundShapeHint(typed)).toBeNull();
    });

    it('trims and NFC-normalises before reading', () => {
        expect(soundShapeHint('  ng ')).toBe('ng reads as two sounds (n, g). If it is one sound, spell it ŋ.');
    });
});
