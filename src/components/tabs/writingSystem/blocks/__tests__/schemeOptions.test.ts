/**
 * schemeOptions — the split / lone-consonant helpers of the Block Designer.
 *
 * The rule that matters most is N1 (SYLLABLE_BLOCKS_PLAN.md §2): the helpers
 * emit exactly the form `validateBlockScheme` emits, so a saved scheme and the
 * draft it came from compare equal (`sameDocument`) — otherwise every save
 * would leave a phantom "Unsaved changes".
 */

import { describe, expect, it } from 'vitest';

import { cloneEmptyBlockScheme, validateBlockScheme } from '../../../../../blocks';
import type { BlockScheme } from '../../../../../blocks';
import { sameDocument } from '../blockSchemeDraft';
import { normalSplit, splitModeOf, withLeftovers, withSplit } from '../schemeOptions';

function base(): BlockScheme {
    return cloneEmptyBlockScheme();
}

/** Deep-frozen copy: any mutation by a helper throws. */
function frozen<T>(value: T): T {
    const copy = structuredClone(value);
    const freeze = (v: unknown) => {
        if (v && typeof v === 'object') {
            Object.values(v).forEach(freeze);
            Object.freeze(v);
        }
    };
    freeze(copy);
    return copy;
}

describe('normalSplit', () => {
    it('carries sibilantClusters only when true, and only by syllable', () => {
        expect(normalSplit('syllables', false)).toEqual({ mode: 'syllables' });
        expect(Object.keys(normalSplit('syllables', false))).toEqual(['mode']);
        expect(normalSplit('syllables', true)).toEqual({ mode: 'syllables', sibilantClusters: true });
        expect(normalSplit('templates', true)).toEqual({ mode: 'templates' });
        expect(Object.keys(normalSplit('templates', true))).toEqual(['mode']);
    });

    it('carries diphthongs only by syllable and only when non-empty', () => {
        expect(normalSplit('syllables', false, [])).toEqual({ mode: 'syllables' });
        expect(Object.keys(normalSplit('syllables', false, ['  ', '']))).toEqual(['mode']);
        expect(normalSplit('syllables', true, ['ai'])).toEqual({
            mode: 'syllables',
            sibilantClusters: true,
            diphthongs: ['ai'],
        });
        expect(Object.keys(normalSplit('templates', true, ['ai']))).toEqual(['mode']);
    });

    it('normalises diphthongs exactly like the validator (N1)', () => {
        const raw = [' ai', 'ai', 'au'];
        const out = normalSplit('syllables', false, raw);
        expect(out).toEqual({ mode: 'syllables', diphthongs: ['ai', 'au'] });
        const { scheme } = validateBlockScheme({ ...base(), split: { mode: 'syllables', diphthongs: raw } });
        expect(out).toEqual(scheme.split);
    });

    it('carries syllabicConsonants only by syllable and only when non-empty (N1)', () => {
        expect(Object.keys(normalSplit('syllables', false, [], []))).toEqual(['mode']);
        expect(Object.keys(normalSplit('syllables', false, [], ['  ', '']))).toEqual(['mode']);
        expect(normalSplit('syllables', false, [], ['r'])).toEqual({ mode: 'syllables', syllabicConsonants: ['r'] });
        expect(Object.keys(normalSplit('templates', true, ['ai'], ['r']))).toEqual(['mode']);
    });

    it('carries both lists, in the key order of the validator', () => {
        const out = normalSplit('syllables', true, ['ai'], ['r', 'l']);
        expect(out).toEqual({ mode: 'syllables', sibilantClusters: true, diphthongs: ['ai'], syllabicConsonants: ['r', 'l'] });
        const { scheme } = validateBlockScheme({ ...base(), split: out });
        expect(Object.keys(scheme.split!)).toEqual(Object.keys(out));
    });

    it('normalises syllabicConsonants exactly like the validator (N1)', () => {
        const decomposed = 'n' + String.fromCodePoint(0x303);
        const raw = [' r', 'r', decomposed, '', 'l '];
        const out = normalSplit('syllables', false, [], raw);
        expect(out).toEqual({ mode: 'syllables', syllabicConsonants: ['r', decomposed.normalize('NFC'), 'l'] });
        const { scheme } = validateBlockScheme({ ...base(), split: { mode: 'syllables', syllabicConsonants: raw } });
        expect(out).toEqual(scheme.split);
    });

    it('does not alias the given list', () => {
        const list = ['ai'];
        const out = normalSplit('syllables', false, list);
        expect(out.diphthongs).not.toBe(list);
        const consonants = ['r'];
        expect(normalSplit('syllables', false, [], consonants).syllabicConsonants).not.toBe(consonants);
    });
});

describe('withSplit', () => {
    it('stores the normalised split', () => {
        expect(withSplit(base(), 'syllables', false).split).toEqual({ mode: 'syllables' });
        expect(withSplit(base(), 'syllables', true).split).toEqual({ mode: 'syllables', sibilantClusters: true });
    });

    it('stores template order EXPLICITLY (the "not chosen yet" state ends)', () => {
        const scheme = withSplit(base(), 'templates', false);
        expect(scheme.split).toEqual({ mode: 'templates' });
        expect(splitModeOf(scheme)).toBe('templates');
    });

    it('stores the normalised diphthong list by syllable; template order drops it', () => {
        expect(withSplit(base(), 'syllables', false, ['ai', 'ai ']).split).toEqual({
            mode: 'syllables',
            diphthongs: ['ai'],
        });
        expect(withSplit(base(), 'templates', false, ['ai']).split).toEqual({ mode: 'templates' });
    });

    it('stores the normalised consonant list by syllable; template order drops both lists', () => {
        expect(withSplit(base(), 'syllables', false, [], ['r', 'r ']).split).toEqual({
            mode: 'syllables',
            syllabicConsonants: ['r'],
        });
        expect(withSplit(base(), 'templates', false, ['ai'], ['r']).split).toEqual({ mode: 'templates' });
        expect(Object.keys(withSplit(base(), 'templates', true, ['ai'], ['r']).split!)).toEqual(['mode']);
    });

    it('never mutates its input, and keeps the rest of the scheme', () => {
        const input = frozen({ ...base(), enabled: true, split: { mode: 'syllables' as const, sibilantClusters: true } });
        const out = withSplit(input, 'templates', false);
        expect(out).not.toBe(input);
        expect(input.split).toEqual({ mode: 'syllables', sibilantClusters: true });
        expect(out.enabled).toBe(true);
        expect(out.roles).toBe(input.roles);
    });

    it.each([
        ['syllables', false],
        ['syllables', true],
        ['templates', false],
        ['templates', true],
    ] as const)('round-trips through the validator unchanged (%s, %s)', (mode, sibilant) => {
        const draft = withSplit(base(), mode, sibilant, ['ai', ' iə ', 'ai'], [' r', 'l', 'r']);
        const { scheme, issues } = validateBlockScheme(draft);
        expect(issues).toEqual([]);
        expect(sameDocument(scheme, draft)).toBe(true);
    });
});

describe('withLeftovers', () => {
    it('stores the mark and placement', () => {
        const scheme = withLeftovers(base(), { markGraphemeId: 7, placement: 'above' });
        expect(scheme.leftovers).toEqual({ markGraphemeId: 7, placement: 'above' });
    });

    it('null removes the KEY (absent, never undefined)', () => {
        const withMark = withLeftovers(base(), { markGraphemeId: 7, placement: 'below' });
        const cleared = withLeftovers(withMark, null);
        expect('leftovers' in cleared).toBe(false);
        expect(sameDocument(cleared, base())).toBe(true);
        // Clearing a scheme without leftovers is a no-op in content.
        expect('leftovers' in withLeftovers(base(), null)).toBe(false);
    });

    it('never mutates its input (nor aliases the given leftovers)', () => {
        const input = frozen({ ...base(), leftovers: { markGraphemeId: 3, placement: 'after' as const } });
        const cleared = withLeftovers(input, null);
        expect(input.leftovers).toEqual({ markGraphemeId: 3, placement: 'after' });
        expect('leftovers' in cleared).toBe(false);

        const given = { markGraphemeId: 4, placement: 'before' as const };
        const stored = withLeftovers(input, given);
        expect(stored.leftovers).toEqual(given);
        expect(stored.leftovers).not.toBe(given);
    });

    it('round-trips through the validator unchanged', () => {
        const draft = withLeftovers(base(), { markGraphemeId: 12, placement: 'before' });
        const { scheme, issues } = validateBlockScheme(draft);
        expect(issues).toEqual([]);
        expect(sameDocument(scheme, draft)).toBe(true);
    });
});

describe('splitModeOf', () => {
    it('reads unset / syllables / templates', () => {
        expect(splitModeOf(base())).toBe('unset');
        expect(splitModeOf({ split: undefined })).toBe('unset');
        expect(splitModeOf({ split: { mode: 'syllables' } })).toBe('syllables');
        expect(splitModeOf({ split: { mode: 'templates' } })).toBe('templates');
    });
});
