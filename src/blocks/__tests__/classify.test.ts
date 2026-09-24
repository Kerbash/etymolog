/**
 * classifyEntry / roleAccepts — BLOCK_SCRIPT_PLAN.md §3.1.
 */

import { describe, expect, it } from 'vitest';
import { MARK_CATEGORY } from '../../db/wordSymbolService';
import { BLOCK_BOUNDARY, BLOCK_JOIN, classifyEntry, MARK_CATEGORY_NAME, resolveEntryGrapheme, roleAccepts } from '../classify';
import type { BlockRole, EntryClass } from '../types';
import { fakeGrapheme, gEntry, indexOf, ipaEntry, markGrapheme, roleEntry, roles } from './fixtures';

/** Mirrors `WORD_SYMBOL_CATEGORY` (db/wordSymbolService) — not imported, to keep this suite DB-free. */
const WORD_SYMBOL_CATEGORY = 'logogram';

const index = indexOf(
    fakeGrapheme(1, 'k'),
    fakeGrapheme(2, 'a'),
    fakeGrapheme(3, 'ka'),
    fakeGrapheme(4, null, { category: WORD_SYMBOL_CATEGORY }),
    fakeGrapheme(5, 'tʃ'),
    fakeGrapheme(6, 'aɪ'),
    fakeGrapheme(7, '[?12]'),
    fakeGrapheme(8, 'm'),
    fakeGrapheme(9, 'ˈka'),
    fakeGrapheme(10, ''),
);

function cls(id: number): EntryClass {
    return classifyEntry(gEntry(id), index);
}

describe('classifyEntry — graphemes', () => {
    it('k → phoneme C / P / O', () => {
        expect(cls(1)).toEqual({ kind: 'phoneme', letters: ['C', 'P', 'O'], category: null });
    });

    it('a → phoneme V', () => {
        expect(cls(2)).toEqual({ kind: 'phoneme', letters: ['V'], category: null });
    });

    it('m → phoneme C / N / R', () => {
        expect(cls(8)).toEqual({ kind: 'phoneme', letters: ['C', 'N', 'R'], category: null });
    });

    it('ka → syllable', () => {
        expect(cls(3)).toEqual({ kind: 'syllable', category: null });
    });

    it('stress marks do not count as sounds: ˈka is still a syllable', () => {
        expect(cls(9)).toEqual({ kind: 'syllable', category: null });
    });

    it('untied tʃ is read as ONE sound (the affricate), as describePhoneme reads grapheme phonemes', () => {
        const result = cls(5);
        expect(result.kind).toBe('phoneme');
        expect(result.kind === 'phoneme' && result.letters).toContain('P');
    });

    it('a vowel sequence (diphthong) is a V, not a syllable', () => {
        expect(cls(6)).toEqual({ kind: 'phoneme', letters: ['V'], category: null });
    });

    it('logogram (no phonemes) → silent, carrying its category', () => {
        expect(cls(4)).toEqual({ kind: 'silent', category: 'logogram' });
    });

    it('an empty phoneme string → silent', () => {
        expect(cls(10)).toEqual({ kind: 'silent', category: null });
    });

    it('an unclassifiable phoneme → unknown', () => {
        expect(cls(7)).toEqual({ kind: 'unknown' });
    });

    it('prefers the first use_in_auto_spelling phoneme, else the first', () => {
        const g = fakeGrapheme(20, 'a');
        const both = { ...g, phonemes: [{ phoneme: 'a', use_in_auto_spelling: false }, { phoneme: 'k', use_in_auto_spelling: true }] };
        expect(classifyEntry(gEntry(20), indexOf(both))).toMatchObject({ kind: 'phoneme', letters: ['C', 'P', 'O'] });
        const neither = { ...g, phonemes: [{ phoneme: 'a', use_in_auto_spelling: false }, { phoneme: 'k', use_in_auto_spelling: false }] };
        expect(classifyEntry(gEntry(20), indexOf(neither))).toMatchObject({ kind: 'phoneme', letters: ['V'] });
    });

    it('a grapheme missing from the index (and not complete inline) → unknown', () => {
        expect(classifyEntry(gEntry(999), index)).toEqual({ kind: 'unknown' });
    });

    it('falls back to a complete grapheme carried inline on the entry', () => {
        const inline = { ...gEntry(500), grapheme: { ...gEntry(500).grapheme!, ...fakeGrapheme(500, 'a') } };
        expect(classifyEntry(inline, new Map())).toMatchObject({ kind: 'phoneme', letters: ['V'] });
        expect(resolveEntryGrapheme(inline, new Map())?.id).toBe(500);
    });

    it('a grapheme entry with no grapheme object → unknown', () => {
        expect(classifyEntry({ type: 'grapheme', position: 0 }, index)).toEqual({ kind: 'unknown' });
    });
});

describe('classifyEntry — a sign whose sound is several consonants (DIPHTHONG_BLOCKS_PLAN.md §3.1)', () => {
    const several = indexOf(
        fakeGrapheme(30, 'ng'),
        fakeGrapheme(31, 'ts'),
        fakeGrapheme(32, 'kw'),
        fakeGrapheme(33, 'ks'),
        fakeGrapheme(34, 'ŋm'),
        fakeGrapheme(35, 'n͡g'),
        fakeGrapheme(36, 'ka'),
        fakeGrapheme(37, 'ai'),
    );
    const read = (id: number) => classifyEntry(gEntry(id), several);

    it.each([30, 31, 32])('grapheme %i (ng / ts / kw) is a consonant and fills a C role', (id) => {
        const result = read(id);
        expect(result.kind).toBe('phoneme');
        expect(result.kind === 'phoneme' && result.letters).toContain('C');
        expect(roleAccepts(roles.C1, result)).toBe(true);
        expect(roleAccepts(roles.SYL, result)).toBe(false);
    });

    it('keeps only the class letters EVERY sound shares', () => {
        // n (C N R) + g (C P O) → C; k (C P O) + w (C G R) → C.
        expect(read(30)).toEqual({ kind: 'phoneme', letters: ['C'], category: null });
        expect(read(32)).toEqual({ kind: 'phoneme', letters: ['C'], category: null });
        // k (C P O) + s (C F S O) → C O: a stop plus a fricative is neither.
        expect(read(33)).toEqual({ kind: 'phoneme', letters: ['C', 'O'], category: null });
        // Two nasals stay nasal.
        expect(read(34)).toEqual({ kind: 'phoneme', letters: ['C', 'N', 'R'], category: null });
    });

    it('the same rule for an IPA entry', () => {
        expect(classifyEntry(ipaEntry('ng'), several)).toEqual({ kind: 'phoneme', letters: ['C'], category: null });
    });

    it('a sound with a vowel is still a syllable sign; vowels together are still V', () => {
        expect(read(36)).toEqual({ kind: 'syllable', category: null });
        expect(read(37)).toEqual({ kind: 'phoneme', letters: ['V'], category: null });
    });

    it('a tied n͡g the phonology cannot describe stays unknown', () => {
        expect(read(35)).toEqual({ kind: 'unknown' });
    });
});

describe('classifyEntry — IPA and structural entries', () => {
    it('BLOCK_BOUNDARY is "."', () => {
        expect(BLOCK_BOUNDARY).toBe('.');
    });

    it('"." → boundary', () => {
        expect(classifyEntry(ipaEntry('.'), index)).toEqual({ kind: 'boundary' });
    });

    it('IPA k → phoneme with no category', () => {
        expect(classifyEntry(ipaEntry('k'), index)).toEqual({ kind: 'phoneme', letters: ['C', 'P', 'O'], category: null });
    });

    it('[?12] → unknown', () => {
        expect(classifyEntry(ipaEntry('[?12]'), index)).toEqual({ kind: 'unknown' });
    });

    it('empty / missing IPA character → unknown', () => {
        expect(classifyEntry(ipaEntry(''), index)).toEqual({ kind: 'unknown' });
        expect(classifyEntry({ type: 'ipa', position: 0 }, index)).toEqual({ kind: 'unknown' });
    });

    it.each(['word-separator', 'line-break', 'punctuation'] as const)('role %s → structural', (role) => {
        expect(classifyEntry(roleEntry(role), index)).toEqual({ kind: 'structural' });
    });

    it('a role wins even on a grapheme entry', () => {
        expect(classifyEntry({ ...gEntry(1), role: 'punctuation' }, index)).toEqual({ kind: 'structural' });
    });
});

describe('roleAccepts', () => {
    const phonemeC: EntryClass = { kind: 'phoneme', letters: ['C', 'P', 'O'], category: null };
    const phonemeV: EntryClass = { kind: 'phoneme', letters: ['V'], category: null };
    const syllable: EntryClass = { kind: 'syllable', category: null };
    const silentLogo: EntryClass = { kind: 'silent', category: 'logogram' };
    const unknown: EntryClass = { kind: 'unknown' };
    const boundary: EntryClass = { kind: 'boundary' };
    const structural: EntryClass = { kind: 'structural' };

    it('any accepts phoneme / syllable / silent / unknown, never boundary / structural', () => {
        for (const c of [phonemeC, phonemeV, syllable, silentLogo, unknown]) expect(roleAccepts(roles.ANY, c)).toBe(true);
        expect(roleAccepts(roles.ANY, boundary)).toBe(false);
        expect(roleAccepts(roles.ANY, structural)).toBe(false);
    });

    it('class needs a phoneme with that letter', () => {
        expect(roleAccepts(roles.C1, phonemeC)).toBe(true);
        expect(roleAccepts(roles.C1, phonemeV)).toBe(false);
        expect(roleAccepts(roles.V, phonemeV)).toBe(true);
        const P: BlockRole = { id: 'P', label: 'P', matcher: { kind: 'class', letter: 'P' } };
        expect(roleAccepts(P, phonemeC)).toBe(true);
        expect(roleAccepts(roles.C1, syllable)).toBe(false);
        expect(roleAccepts(roles.C1, unknown)).toBe(false);
    });

    it('a syllable sign matches a syllable role and NOT a class C role', () => {
        const ka = classifyEntry(gEntry(3), index);
        expect(roleAccepts(roles.SYL, ka)).toBe(true);
        expect(roleAccepts(roles.C1, ka)).toBe(false);
        expect(roleAccepts(roles.V, ka)).toBe(false);
        expect(roleAccepts(roles.SYL, phonemeC)).toBe(false);
    });

    it('category compares trimmed, case-sensitively, across phoneme / syllable / silent', () => {
        expect(roleAccepts(roles.LOGO, silentLogo)).toBe(true);
        expect(roleAccepts(roles.LOGO, { kind: 'phoneme', letters: ['V'], category: ' logogram ' })).toBe(true);
        expect(roleAccepts(roles.LOGO, { kind: 'syllable', category: 'logogram' })).toBe(true);
        expect(roleAccepts(roles.LOGO, { kind: 'silent', category: 'Logogram' })).toBe(false);
        expect(roleAccepts(roles.LOGO, { kind: 'silent', category: null })).toBe(false);
        expect(roleAccepts(roles.LOGO, unknown)).toBe(false);
        expect(roleAccepts(roles.LOGO, boundary)).toBe(false);
    });
});

// =============================================================================
// CONLANG_EDGES_PLAN.md §3.1 — marks, joins, stress
// =============================================================================

describe('classifyEntry — marks, joins and stress (CONLANG_EDGES_PLAN.md §3.1)', () => {
    it('BLOCK_JOIN is the undertie U+203F', () => {
        expect(BLOCK_JOIN).toBe('‿');
    });

    it('MARK_CATEGORY_NAME mirrors db MARK_CATEGORY (they cannot drift)', () => {
        expect(MARK_CATEGORY_NAME).toBe(MARK_CATEGORY);
    });

    it('‿ → join; "." stays a boundary (classified by character, not separator kind — P-A7)', () => {
        expect(classifyEntry(ipaEntry('‿'), index)).toEqual({ kind: 'join' });
        expect(classifyEntry(ipaEntry('.'), index)).toEqual({ kind: 'boundary' });
    });

    it.each(['ˈ', 'ˌ'])('stress mark %s → boundary', (char) => {
        expect(classifyEntry(ipaEntry(char), index)).toEqual({ kind: 'boundary' });
    });

    it.each([
        ['length ː', 'ː'],
        ['tone letter ˥', '˥'],
        ['two tone letters ˥˩', '˥˩'],
        ['a lone combining tilde', '̃'],
        ['a lone syllabic mark', '̩'],
    ])('IPA %s → mark with no category', (_label, char) => {
        expect(classifyEntry(ipaEntry(char), index)).toEqual({ kind: 'mark', category: null });
    });

    it('a mark on a sound is still that sound, not a mark', () => {
        expect(classifyEntry(ipaEntry('aː'), index)).toMatchObject({ kind: 'phoneme', letters: ['V'] });
    });

    it('a phoneme-less grapheme with category "mark" → mark with its category', () => {
        const marks = indexOf(markGrapheme(30), fakeGrapheme(31, null, { category: ' mark ' }));
        expect(classifyEntry(gEntry(30), marks)).toEqual({ kind: 'mark', category: 'mark' });
        expect(classifyEntry(gEntry(31), marks)).toEqual({ kind: 'mark', category: ' mark ' });
    });

    it('every other phoneme-less grapheme stays silent; a mark-category grapheme WITH a sound is its sound', () => {
        const others = indexOf(fakeGrapheme(32, null, { category: 'Mark' }), fakeGrapheme(33, null), fakeGrapheme(34, 'k', { category: 'mark' }));
        expect(classifyEntry(gEntry(32), others)).toEqual({ kind: 'silent', category: 'Mark' });
        expect(classifyEntry(gEntry(33), others)).toEqual({ kind: 'silent', category: null });
        expect(classifyEntry(gEntry(34), others)).toMatchObject({ kind: 'phoneme', category: 'mark' });
        expect(cls(4)).toEqual({ kind: 'silent', category: 'logogram' });
    });
});

describe('roleAccepts — mark and join', () => {
    const markGraph: EntryClass = { kind: 'mark', category: 'mark' };
    const markIpa: EntryClass = { kind: 'mark', category: null };
    const join: EntryClass = { kind: 'join' };
    const P: BlockRole = { id: 'P', label: 'P', matcher: { kind: 'class', letter: 'C' } };

    it.each([
        ['any', roles.ANY, true, true, false],
        ['category mark', roles.MARK, true, false, false],
        ['category logogram', roles.LOGO, false, false, false],
        ['class C', P, false, false, false],
        ['class V', roles.V, false, false, false],
        ['syllable', roles.SYL, false, false, false],
    ])('%s: mark grapheme %s, IPA mark %s, join %s', (_label, role, graph, ipa, joinOk) => {
        expect(roleAccepts(role, markGraph)).toBe(graph);
        expect(roleAccepts(role, markIpa)).toBe(ipa);
        expect(roleAccepts(role, join)).toBe(joinOk);
    });
});
