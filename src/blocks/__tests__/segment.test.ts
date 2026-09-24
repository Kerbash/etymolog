/**
 * segmentEntries — BLOCK_SCRIPT_PLAN.md §3.2 (+ SYLLABLE_BLOCKS, DIPHTHONG_BLOCKS, CONLANG_EDGES_PLAN.md §3.3, §4).
 */

import { describe, expect, it } from 'vitest';
import { segmentEntries } from '../segment';
import type { BlockRole, BlockTemplate } from '../types';
import { cloneEmptyBlockScheme } from '../validate';
import { fakeGrapheme, gEntry, indexOf, ipaEntry, markGrapheme, roleEntry, roles, scheme, template, withCounts } from './fixtures';

// k t m = consonants, a i = vowels, ka = syllable sign, 9 = logogram
const index = indexOf(
    fakeGrapheme(1, 'k'),
    fakeGrapheme(2, 'a'),
    fakeGrapheme(3, 't'),
    fakeGrapheme(4, 'm'),
    fakeGrapheme(5, 'i'),
    fakeGrapheme(6, 'ka'),
    fakeGrapheme(9, null, { category: 'logogram' }),
);
const [K, A, T, M, I, KA, LOGO] = [1, 2, 3, 4, 5, 6, 9];
const word = (...ids: (number | string)[]) =>
    ids.map((id, position) => (typeof id === 'number' ? gEntry(id, position) : ipaEntry(id, position)));

const CVC = template('CVC', ['C1', 'V', 'C2']);
const CV = template('CV', ['C1', 'V']);

describe('segmentEntries', () => {
    it('empty spelling → no segments', () => {
        expect(segmentEntries([], scheme([roles.C1, roles.V], [CV]), index)).toEqual([]);
    });

    it('empty scheme → every entry is a single', () => {
        expect(segmentEntries(word(K, A, T), cloneEmptyBlockScheme(), index)).toEqual([
            { kind: 'single', entryIndices: [0], consonant: true },
            { kind: 'single', entryIndices: [1] },
            { kind: 'single', entryIndices: [2], consonant: true },
        ]);
    });

    it('does NOT check scheme.enabled — the caller does', () => {
        const off = { ...scheme([roles.C1, roles.V], [CV]), enabled: false };
        expect(segmentEntries(word(K, A), off, index)).toEqual([{ kind: 'block', templateId: 'CV', entryIndices: [0, 1] }]);
    });

    it('first match wins: C1 V C2 before C1 V takes three entries', () => {
        const s = scheme([roles.C1, roles.V, roles.C2], [CVC, CV]);
        expect(segmentEntries(word(K, A, T), s, index)).toEqual([{ kind: 'block', templateId: 'CVC', entryIndices: [0, 1, 2] }]);
    });

    it('first match wins: C1 V before C1 V C2 never reaches the longer one', () => {
        const s = scheme([roles.C1, roles.V, roles.C2], [CV, CVC]);
        expect(segmentEntries(word(K, A, T), s, index)).toEqual([
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1] },
            { kind: 'single', entryIndices: [2], consonant: true },
        ]);
    });

    it('greedy CVC swallows the next onset: k a t a → [kat] a', () => {
        const s = scheme([roles.C1, roles.V, roles.C2], [CVC, CV]);
        expect(segmentEntries(word(K, A, T, A), s, index)).toEqual([
            { kind: 'block', templateId: 'CVC', entryIndices: [0, 1, 2] },
            { kind: 'single', entryIndices: [3] },
        ]);
    });

    it('a boundary splits kata into ka|ta and produces no segment of its own', () => {
        const s = scheme([roles.C1, roles.V, roles.C2], [CVC, CV]);
        expect(segmentEntries(word(K, A, '.', T, A), s, index)).toEqual([
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1] },
            { kind: 'block', templateId: 'CV', entryIndices: [3, 4] },
        ]);
    });

    it('a template can never span a boundary', () => {
        const s = scheme([roles.C1, roles.V], [CV]);
        expect(segmentEntries(word(K, '.', A), s, index)).toEqual([
            { kind: 'single', entryIndices: [0], consonant: true },
            { kind: 'single', entryIndices: [2] },
        ]);
    });

    it('leading, trailing and repeated boundaries are consumed silently', () => {
        const s = scheme([roles.C1, roles.V], [CV]);
        expect(segmentEntries(word('.', K, A, '.', '.'), s, index)).toEqual([{ kind: 'block', templateId: 'CV', entryIndices: [1, 2] }]);
    });

    it('structural entries pass through and break runs', () => {
        const s = scheme([roles.C1, roles.V], [CV]);
        const entries = [gEntry(K, 0), roleEntry('word-separator', ' ', 1), gEntry(A, 2), gEntry(T, 3), gEntry(I, 4)];
        expect(segmentEntries(entries, s, index)).toEqual([
            { kind: 'single', entryIndices: [0], consonant: true },
            { kind: 'passthrough', entryIndices: [1] },
            { kind: 'single', entryIndices: [2] },
            { kind: 'block', templateId: 'CV', entryIndices: [3, 4] },
        ]);
    });

    it('unmatched entries become singles, and matching resumes after them', () => {
        const s = scheme([roles.C1, roles.V], [CV]);
        expect(segmentEntries(word(A, K, A, M), s, index)).toEqual([
            { kind: 'single', entryIndices: [0] },
            { kind: 'block', templateId: 'CV', entryIndices: [1, 2] },
            { kind: 'single', entryIndices: [3], consonant: true },
        ]);
    });

    it('a template longer than the remaining entries does not match', () => {
        const s = scheme([roles.C1, roles.V, roles.C2], [CVC]);
        expect(segmentEntries(word(K, A), s, index)).toEqual([
            { kind: 'single', entryIndices: [0], consonant: true },
            { kind: 'single', entryIndices: [1] },
        ]);
    });

    it('IPA (virtual) entries participate by their sound', () => {
        const s = scheme([roles.C1, roles.V], [CV]);
        expect(segmentEntries(word(K, 'a'), s, index)).toEqual([{ kind: 'block', templateId: 'CV', entryIndices: [0, 1] }]);
    });

    it('Mayan-style: logogram + k a t a → [LOGO C1 V] [C1 V]', () => {
        const s = scheme([roles.LOGO, roles.C1, roles.V], [template('LCV', ['LOGO', 'C1', 'V']), CV]);
        expect(segmentEntries(word(LOGO, K, A, T, A), s, index)).toEqual([
            { kind: 'block', templateId: 'LCV', entryIndices: [0, 1, 2] },
            { kind: 'block', templateId: 'CV', entryIndices: [3, 4] },
        ]);
    });

    it('a syllable sign fills a syllable role, not a C role', () => {
        const s = scheme([roles.SYL, roles.C1, roles.V, roles.C2], [template('SC', ['SYL', 'C2']), CV]);
        expect(segmentEntries(word(KA, M, K, A), s, index)).toEqual([
            { kind: 'block', templateId: 'SC', entryIndices: [0, 1] },
            { kind: 'block', templateId: 'CV', entryIndices: [2, 3] },
        ]);
        // ka + a is not CV: the syllable sign is not a consonant.
        expect(segmentEntries(word(KA, A), scheme([roles.C1, roles.V], [CV]), index)).toEqual([
            { kind: 'single', entryIndices: [0] },
            { kind: 'single', entryIndices: [1] },
        ]);
    });

    it('a single-role template turns every match into a one-entry block', () => {
        const s = scheme([roles.LOGO], [template('L', ['LOGO'])]);
        expect(segmentEntries(word(LOGO, K), s, index)).toEqual([
            { kind: 'block', templateId: 'L', entryIndices: [0] },
            { kind: 'single', entryIndices: [1], consonant: true },
        ]);
    });

    it('an unvalidated template naming a missing role never matches (no throw)', () => {
        const s = scheme([roles.V], [template('ghost', ['NOPE', 'V']), template('V', ['V'])]);
        expect(segmentEntries(word(K, A), s, index)).toEqual([
            { kind: 'single', entryIndices: [0], consonant: true },
            { kind: 'block', templateId: 'V', entryIndices: [1] },
        ]);
    });

    it('is deterministic', () => {
        const s = scheme([roles.C1, roles.V, roles.C2], [CVC, CV]);
        const entries = word(K, A, T, '.', M, I);
        expect(segmentEntries(entries, s, index)).toEqual(segmentEntries(entries, s, index));
    });
});

// =============================================================================
// SYLLABLE_BLOCKS_PLAN.md §3.3 — template mode with slot counts
// =============================================================================

describe('segmentEntries with slot counts (template mode)', () => {
    /** C1(0–3) V C2(0–3). */
    const FLEX = withCounts(CVC, { C1: { min: 0, max: 3 }, C2: { min: 0, max: 3 } });
    const s = scheme([roles.C1, roles.V, roles.C2], [FLEX]);

    it('a count template emits roleIds parallel to entryIndices', () => {
        expect(segmentEntries(word('s', 'p', 'ɛ', 'l'), s, index)).toEqual([
            { kind: 'block', templateId: 'CVC', entryIndices: [0, 1, 2, 3], roleIds: ['C1', 'C1', 'V', 'C2'] },
        ]);
    });

    it('one template covers a, spa and strɛŋθs', () => {
        expect(segmentEntries(word('a'), s, index)).toEqual([{ kind: 'block', templateId: 'CVC', entryIndices: [0], roleIds: ['V'] }]);
        expect(segmentEntries(word('s', 'p', 'a'), s, index)).toEqual([
            { kind: 'block', templateId: 'CVC', entryIndices: [0, 1, 2], roleIds: ['C1', 'C1', 'V'] },
        ]);
        expect(segmentEntries(word('s', 't', 'r', 'ɛ', 'ŋ', 'θ', 's'), s, index)).toEqual([
            { kind: 'block', templateId: 'CVC', entryIndices: [0, 1, 2, 3, 4, 5, 6], roleIds: ['C1', 'C1', 'C1', 'V', 'C2', 'C2', 'C2'] },
        ]);
    });

    it('template mode stays greedy: t a p a → [tap] [a]', () => {
        expect(segmentEntries(word(T, A, 'p', A), s, index)).toEqual([
            { kind: 'block', templateId: 'CVC', entryIndices: [0, 1, 2], roleIds: ['C1', 'V', 'C2'] },
            { kind: 'block', templateId: 'CVC', entryIndices: [3], roleIds: ['V'] },
        ]);
    });

    it('a consonant with no vowel stays a single; boundaries still cut runs', () => {
        expect(segmentEntries(word(K, '.', A, T), s, index)).toEqual([
            { kind: 'single', entryIndices: [0], consonant: true },
            { kind: 'block', templateId: 'CVC', entryIndices: [2, 3], roleIds: ['V', 'C2'] },
        ]);
    });

    it('count-less templates keep the old segment shape (no roleIds) even beside count ones', () => {
        const mixed = scheme([roles.C1, roles.V, roles.C2], [CV, FLEX]);
        const segments = segmentEntries(word(K, A, 's', 't'), mixed, index);
        expect(segments).toEqual([
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1] },
            { kind: 'single', entryIndices: [2], consonant: true },
            { kind: 'single', entryIndices: [3], consonant: true },
        ]);
        expect(segments[0]).not.toHaveProperty('roleIds');
    });

    it('scheme order still decides: a count template first beats a longer count-less one', () => {
        const first = scheme([roles.C1, roles.V, roles.C2], [withCounts(CV, { C1: { max: 2 } }), CVC]);
        expect(segmentEntries(word(K, A, T), first, index)).toEqual([
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1], roleIds: ['C1', 'V'] },
            { kind: 'single', entryIndices: [2], consonant: true },
        ]);
    });
});

// =============================================================================
// SYLLABLE_BLOCKS_PLAN.md §3.3 — syllable mode
// =============================================================================

describe('segmentEntries by syllable', () => {
    const V = template('V', ['V']);
    const FLEX = withCounts(CVC, { C1: { min: 0, max: 3 }, C2: { min: 0, max: 3 } });
    const bySyllable = (templates: Parameters<typeof scheme>[1], sibilantClusters?: boolean) => ({
        ...scheme([roles.C1, roles.V, roles.C2], templates),
        split: sibilantClusters ? { mode: 'syllables' as const, sibilantClusters } : { mode: 'syllables' as const },
    });
    const ids = (segments: ReturnType<typeof segmentEntries>) => segments.map((seg) => (seg.kind === 'block' ? `${seg.templateId}:${seg.entryIndices.join(',')}` : `${seg.kind}:${seg.entryIndices[0]}`));

    it('t a p a → ta · pa (not the greedy tap · a)', () => {
        expect(segmentEntries(word(T, A, 'p', A), bySyllable([CVC, CV, V]), index)).toEqual([
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1] },
            { kind: 'block', templateId: 'CV', entryIndices: [2, 3] },
        ]);
    });

    it('p a t a t a p a → four CV blocks', () => {
        expect(ids(segmentEntries(word('p', A, T, A, T, A, 'p', A), bySyllable([CVC, CV, V]), index)))
            .toEqual(['CV:0,1', 'CV:2,3', 'CV:4,5', 'CV:6,7']);
    });

    it('spɛl → one counted block with roleIds C1 C1 V C2', () => {
        expect(segmentEntries(word('s', 'p', 'ɛ', 'l'), bySyllable([FLEX]), index)).toEqual([
            { kind: 'block', templateId: 'CVC', entryIndices: [0, 1, 2, 3], roleIds: ['C1', 'C1', 'V', 'C2'] },
        ]);
    });

    it('strɛŋθs → one block (C1 up to 3, C2 up to 3)', () => {
        expect(segmentEntries(word('s', 't', 'r', 'ɛ', 'ŋ', 'θ', 's'), bySyllable([FLEX]), index)).toEqual([
            { kind: 'block', templateId: 'CVC', entryIndices: [0, 1, 2, 3, 4, 5, 6], roleIds: ['C1', 'C1', 'C1', 'V', 'C2', 'C2', 'C2'] },
        ]);
    });

    it('a syllable no template covers falls back to template order INSIDE the syllable', () => {
        // spa: CV cannot take the whole syllable → s on its own, then pa.
        expect(segmentEntries(word('s', 'p', A), bySyllable([CV]), index)).toEqual([
            { kind: 'single', entryIndices: [0], consonant: true },
            { kind: 'block', templateId: 'CV', entryIndices: [1, 2] },
        ]);
        // ka · ta with only CVC: the fallback never reaches into the next
        // syllable (template order would read [kat] a).
        expect(ids(segmentEntries(word(K, A, T, A), bySyllable([CVC]), index))).toEqual(['single:0', 'single:1', 'single:2', 'single:3']);
    });

    it('`.` still forces a break', () => {
        const s = bySyllable([FLEX], true);
        expect(ids(segmentEntries(word(A, 's', T, A), s, index))).toEqual(['CVC:0', 'CVC:1,2,3']);
        expect(ids(segmentEntries(word(A, 's', '.', T, A), s, index))).toEqual(['CVC:0,1', 'CVC:3,4']);
    });

    it('prefers the template with the fewest empty optional slots, whatever the order', () => {
        for (const templates of [[CV, FLEX], [FLEX, CV]]) {
            expect(segmentEntries(word(T, A), bySyllable(templates), index)).toEqual([{ kind: 'block', templateId: 'CV', entryIndices: [0, 1] }]);
        }
        // tak: only FLEX covers it.
        expect(ids(segmentEntries(word(T, A, K), bySyllable([CV, FLEX]), index))).toEqual(['CVC:0,1,2']);
    });

    it('a tie goes to scheme order', () => {
        const CV2 = template('CV2', ['C1', 'V']);
        expect(ids(segmentEntries(word(T, A), bySyllable([CV2, CV]), index))).toEqual(['CV2:0,1']);
    });

    it('sibilantClusters decides a s t a: as · ta off, a · sta on', () => {
        expect(segmentEntries(word(A, 's', T, A), bySyllable([FLEX]), index)).toEqual([
            { kind: 'block', templateId: 'CVC', entryIndices: [0, 1], roleIds: ['V', 'C2'] },
            { kind: 'block', templateId: 'CVC', entryIndices: [2, 3], roleIds: ['C1', 'V'] },
        ]);
        expect(segmentEntries(word(A, 's', T, A), bySyllable([FLEX], true), index)).toEqual([
            { kind: 'block', templateId: 'CVC', entryIndices: [0], roleIds: ['V'] },
            { kind: 'block', templateId: 'CVC', entryIndices: [1, 2, 3], roleIds: ['C1', 'C1', 'V'] },
        ]);
    });

    it('structural entries still pass through and cut runs', () => {
        const entries = [gEntry(T, 0), gEntry(A, 1), roleEntry('word-separator', ' ', 2), gEntry(K, 3), gEntry(I, 4)];
        expect(ids(segmentEntries(entries, bySyllable([CV]), index))).toEqual(['CV:0,1', 'passthrough:2', 'CV:3,4']);
    });

    it('split mode "templates" (and absent) is the greedy template order', () => {
        const templatesMode = { ...scheme([roles.C1, roles.V, roles.C2], [CVC, CV]), split: { mode: 'templates' as const } };
        const absent = scheme([roles.C1, roles.V, roles.C2], [CVC, CV]);
        for (const entries of [word(T, A, 'p', A), word(K, A, '.', T, A, M), word(A, 's', T, A)]) {
            expect(segmentEntries(entries, templatesMode, index)).toEqual(segmentEntries(entries, absent, index));
        }
        expect(ids(segmentEntries(word(T, A, 'p', A), templatesMode, index))).toEqual(['CVC:0,1,2', 'single:3']);
    });

    it('only consonant singles carry the consonant flag (both modes)', () => {
        const entries = word(LOGO, K, '.', A, '.', KA);
        for (const s of [bySyllable([CVC]), scheme([roles.C1, roles.V, roles.C2], [CVC])]) {
            expect(segmentEntries(entries, s, index)).toEqual([
                { kind: 'single', entryIndices: [0] },
                { kind: 'single', entryIndices: [1], consonant: true },
                { kind: 'single', entryIndices: [3] },
                { kind: 'single', entryIndices: [5] },
            ]);
        }
    });
});

// =============================================================================
// Syllable mode — an opaque unit joins a neighbouring syllable when a template
// is drawn for the joined shape (logogram + phonetic complement)
// =============================================================================

describe('segmentEntries by syllable: opaque units joining a neighbour', () => {
    const LCV = template('LCV', ['LOGO', 'C1', 'V']);
    const CVL = template('CVL', ['C1', 'V', 'LOGO']);
    const L = template('L', ['LOGO']);
    const bySyllable = (templates: Parameters<typeof scheme>[1]) => ({
        ...scheme([roles.LOGO, roles.SYL, roles.C1, roles.V], templates),
        split: { mode: 'syllables' as const },
    });
    const ids = (segments: ReturnType<typeof segmentEntries>) => segments.map((seg) => (seg.kind === 'block' ? `${seg.templateId}:${seg.entryIndices.join(',')}` : `${seg.kind}:${seg.entryIndices[0]}`));

    it('LOGO + ka with a LOGO C V template → one block', () => {
        expect(segmentEntries(word(LOGO, K, A), bySyllable([CV, LCV]), index)).toEqual([
            { kind: 'block', templateId: 'LCV', entryIndices: [0, 1, 2] },
        ]);
    });

    it('without such a template the logogram stays on its own (unchanged output)', () => {
        expect(segmentEntries(word(LOGO, K, A), bySyllable([CV]), index)).toEqual([
            { kind: 'single', entryIndices: [0] },
            { kind: 'block', templateId: 'CV', entryIndices: [1, 2] },
        ]);
        // A one-role logogram template: the logogram is its own block, as before.
        expect(ids(segmentEntries(word(LOGO, K, A), bySyllable([CV, L]), index))).toEqual(['L:0', 'CV:1,2']);
    });

    it('ka + LOGO with a C V LOGO template → merged with the previous syllable', () => {
        expect(segmentEntries(word(K, A, LOGO), bySyllable([CV, CVL]), index)).toEqual([
            { kind: 'block', templateId: 'CVL', entryIndices: [0, 1, 2] },
        ]);
    });

    it('joining the following syllable is tried before the previous one', () => {
        // ta LOGO ka: both joins would fit; the logogram takes the one after it.
        expect(ids(segmentEntries(word(T, A, LOGO, K, A), bySyllable([CV, LCV, CVL]), index)))
            .toEqual(['CV:0,1', 'LCV:2,3,4']);
    });

    it('only the neighbouring syllables are considered: ta · ka LOGO joins ka, not ta', () => {
        expect(ids(segmentEntries(word(T, A, K, A, LOGO), bySyllable([CV, CVL]), index)))
            .toEqual(['CV:0,1', 'CVL:2,3,4']);
    });

    it('two opaque units side by side: the first takes the second when a template asks for it', () => {
        const LL = template('LL', ['LOGO', 'SYL']);
        // LOGO + ka-sign (a syllable sign): only an explicit LOGO SYL template joins them.
        expect(ids(segmentEntries(word(LOGO, KA, T, A), bySyllable([CV, LL]), index))).toEqual(['LL:0,1', 'CV:2,3']);
        expect(ids(segmentEntries(word(LOGO, KA, T, A), bySyllable([CV]), index))).toEqual(['single:0', 'single:1', 'CV:2,3']);
    });

    it('a syllable that already absorbed a unit does not take another from behind', () => {
        // LOGO ka LOGO: the first joins ka (LCV); the second may not also join
        // that range (it would need a LOGO C V LOGO template anyway) and stays alone.
        const LCVL = template('LCVL', ['LOGO', 'C1', 'V', 'SYL']);
        expect(ids(segmentEntries(word(LOGO, K, A, KA), bySyllable([CV, LCV, LCVL]), index)))
            .toEqual(['LCV:0,1,2', 'single:3']);
    });

    it('template mode is unaffected (greedy prefix, as before)', () => {
        const greedy = scheme([roles.LOGO, roles.C1, roles.V], [CV, CVL]);
        expect(ids(segmentEntries(word(K, A, LOGO), greedy, index))).toEqual(['CV:0,1', 'single:2']);
    });
});

// =============================================================================
// DIPHTHONG_BLOCKS_PLAN.md §3.5 — vowels said as one stay in one block
// =============================================================================

describe('segmentEntries by syllable: diphthongs', () => {
    const FLEX = withCounts(CVC, { C1: { min: 0, max: 4 }, C2: { min: 0, max: 4 } });
    const bySyllable = (templates: Parameters<typeof scheme>[1], diphthongs?: string[]) => ({
        ...scheme([roles.C1, roles.V, roles.C2], templates),
        split: diphthongs ? { mode: 'syllables' as const, diphthongs } : { mode: 'syllables' as const },
    });

    it('t a i (three graphemes) with C1 V and `ai` → ONE block, both vowels in V', () => {
        const segments = segmentEntries(word(T, A, I), bySyllable([CV], ['ai']), index);
        expect(segments).toEqual([{ kind: 'block', templateId: 'CV', entryIndices: [0, 1, 2], roleIds: ['C1', 'V', 'V'] }]);
    });

    it('without the list: ta · i, as before', () => {
        expect(segmentEntries(word(T, A, I), bySyllable([CV]), index)).toEqual([
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1] },
            { kind: 'single', entryIndices: [2] },
        ]);
    });

    it('a count-less block that took no pair keeps the old shape (no roleIds, P1)', () => {
        const segments = segmentEntries(word(T, A, 'p', I), bySyllable([CV], ['ai']), index);
        expect(segments).toEqual([
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1] },
            { kind: 'block', templateId: 'CV', entryIndices: [2, 3] },
        ]);
        expect(segments[0]).not.toHaveProperty('roleIds');
    });

    it('template order ignores the list', () => {
        const templatesMode = { ...scheme([roles.C1, roles.V, roles.C2], [CV]), split: { mode: 'templates' as const, diphthongs: ['ai'] } };
        expect(segmentEntries(word(T, A, I), templatesMode, index)).toEqual([
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1] },
            { kind: 'single', entryIndices: [2] },
        ]);
    });

    it('ŋ w i ə n with C1(0–4) V C2(0–4) and `iə` → one block', () => {
        expect(segmentEntries(word('ŋ', 'w', 'i', 'ə', 'n'), bySyllable([FLEX], ['iə']), index)).toEqual([
            { kind: 'block', templateId: 'CVC', entryIndices: [0, 1, 2, 3, 4], roleIds: ['C1', 'C1', 'V', 'V', 'C2'] },
        ]);
        // Without it: ŋwi · ən.
        expect(segmentEntries(word('ŋ', 'w', 'i', 'ə', 'n'), bySyllable([FLEX]), index)).toEqual([
            { kind: 'block', templateId: 'CVC', entryIndices: [0, 1, 2], roleIds: ['C1', 'C1', 'V'] },
            { kind: 'block', templateId: 'CVC', entryIndices: [3, 4], roleIds: ['V', 'C2'] },
        ]);
    });

    it('t a i a → tai · a', () => {
        expect(segmentEntries(word(T, A, I, A), bySyllable([CV, template('V', ['V'])], ['ai']), index)).toEqual([
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1, 2], roleIds: ['C1', 'V', 'V'] },
            { kind: 'block', templateId: 'V', entryIndices: [3] },
        ]);
    });

    it('a pair no template takes falls to singles, one entry at a time', () => {
        // tai with only C1 V C2: no coda, so nothing covers the syllable.
        expect(segmentEntries(word(T, A, I), bySyllable([CVC], ['ai']), index)).toEqual([
            { kind: 'single', entryIndices: [0], consonant: true },
            { kind: 'single', entryIndices: [1] },
            { kind: 'single', entryIndices: [2] },
        ]);
        // a i with only C1 V: the vowels stay singles.
        expect(segmentEntries(word(A, I), bySyllable([CV], ['ai']), index)).toEqual([
            { kind: 'single', entryIndices: [0] },
            { kind: 'single', entryIndices: [1] },
        ]);
    });

    it('the fallback inside a syllable still takes the pair whole', () => {
        // t a i k with C1 V (count-less) only: the syllable is not covered;
        // template order inside it reads [t ai] then k alone.
        expect(segmentEntries(word(T, A, I, K), bySyllable([CV], ['ai']), index)).toEqual([
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1, 2], roleIds: ['C1', 'V', 'V'] },
            { kind: 'single', entryIndices: [3], consonant: true },
        ]);
    });

    it('works across runs: each run glues on its own, ids never leak between them', () => {
        const entries = [gEntry(T, 0), gEntry(A, 1), gEntry(I, 2), roleEntry('word-separator', ' ', 3), gEntry(K, 4), gEntry(A, 5), gEntry(I, 6)];
        expect(segmentEntries(entries, bySyllable([CV], ['ai']), index)).toEqual([
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1, 2], roleIds: ['C1', 'V', 'V'] },
            { kind: 'passthrough', entryIndices: [3] },
            { kind: 'block', templateId: 'CV', entryIndices: [4, 5, 6], roleIds: ['C1', 'V', 'V'] },
        ]);
        // `.` between the vowels still forces the break.
        expect(segmentEntries(word(T, A, '.', I), bySyllable([CV, template('V', ['V'])], ['ai']), index)).toEqual([
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1] },
            { kind: 'block', templateId: 'V', entryIndices: [3] },
        ]);
    });

    it('a several-consonant sign (ng) fills a C slot: ng a → one block', () => {
        const withNg = indexOf(fakeGrapheme(40, 'ng'), fakeGrapheme(2, 'a'));
        expect(segmentEntries([gEntry(40, 0), gEntry(2, 1)], bySyllable([CV]), withNg)).toEqual([
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1] },
        ]);
    });
});

// =============================================================================
// CONLANG_EDGES_PLAN.md §3.3 — marks ride with the sign before them; `‿`
// joins; stress marks cut like `.`
// =============================================================================

describe('segmentEntries: marks, joins and stress (CONLANG_EDGES_PLAN.md §3.3)', () => {
    const TONE = 50;
    const withMark = indexOf(
        fakeGrapheme(K, 'k'),
        fakeGrapheme(A, 'a'),
        fakeGrapheme(T, 't'),
        fakeGrapheme(I, 'i'),
        fakeGrapheme(LOGO, null, { category: 'logogram' }),
        markGrapheme(TONE),
    );
    const N = 'n';
    const JOIN = '‿';
    const markWord = (...ids: (number | string)[]) =>
        ids.map((id, position) => (typeof id === 'number' ? gEntry(id, position) : ipaEntry(id, position)));
    const bySyllable = (roleList: Parameters<typeof scheme>[0], templates: Parameters<typeof scheme>[1], diphthongs?: string[]) => ({
        ...scheme(roleList, templates),
        split: diphthongs ? { mode: 'syllables' as const, diphthongs } : { mode: 'syllables' as const },
    });
    const CVMC = template('CVMC', ['C1', 'V', 'MARK', 'C2']);
    const CVM = template('CVM', ['C1', 'V', 'MARK']);
    const ids = (segments: ReturnType<typeof segmentEntries>) => segments.map((seg) => (seg.kind === 'block' ? `${seg.templateId}:${seg.entryIndices.join(',')}` : `${seg.kind}:${seg.entryIndices[0]}`));

    it('a C V MARK C2 template takes k a MARK n exactly under syllable mode', () => {
        const s = bySyllable([roles.C1, roles.V, roles.MARK, roles.C2], [CV, CVMC]);
        expect(segmentEntries(markWord(K, A, TONE, N), s, withMark)).toEqual([
            { kind: 'block', templateId: 'CVMC', entryIndices: [0, 1, 2, 3] },
        ]);
    });

    it('k a MARK t a → [ka MARK] [ta]: the mark stays with the syllable before it', () => {
        const s = bySyllable([roles.C1, roles.V, roles.MARK, roles.C2], [CV, CVM]);
        expect(ids(segmentEntries(markWord(K, A, TONE, T, A), s, withMark))).toEqual(['CVM:0,1,2', 'CV:3,4']);
    });

    it('a scheme with no mark role degrades: k a MARK n → CV block + mark single + lone n', () => {
        const s = bySyllable([roles.C1, roles.V, roles.C2], [CV]);
        expect(segmentEntries(markWord(K, A, TONE, N), s, withMark)).toEqual([
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1] },
            { kind: 'single', entryIndices: [2] },
            { kind: 'single', entryIndices: [3], consonant: true },
        ]);
    });

    it('a typed IPA mark (ː) rides the same way and fills an `any` slot', () => {
        const CVX = template('CVX', ['C1', 'V', 'ANY']);
        const s = bySyllable([roles.C1, roles.V, roles.ANY], [CV, CVX]);
        expect(ids(segmentEntries(markWord(K, A, 'ː', T, A), s, withMark))).toEqual(['CVX:0,1,2', 'CV:3,4']);
    });

    it('LOGO MARK is still a lone sign that may join the next syllable when a template asks', () => {
        const LMCV = template('LMCV', ['LOGO', 'MARK', 'C1', 'V']);
        const s = bySyllable([roles.LOGO, roles.MARK, roles.C1, roles.V], [CV, LMCV]);
        expect(ids(segmentEntries(markWord(LOGO, TONE, K, A), s, withMark))).toEqual(['LMCV:0,1,2,3']);
        // Without that template: the logogram and its mark are singles, ka a block.
        const plain = bySyllable([roles.LOGO, roles.MARK, roles.C1, roles.V], [CV]);
        expect(ids(segmentEntries(markWord(LOGO, TONE, K, A), plain, withMark))).toEqual(['single:0', 'single:1', 'CV:2,3']);
    });

    it('a join produces no segment; neighbours keep their ORIGINAL indices (join in the second run — P-A6)', () => {
        // k a . t a ‿ i  with only C1 V and V templates: the join glues a‿i.
        const s = bySyllable([roles.C1, roles.V], [CV, template('V', ['V'])]);
        const entries = markWord(K, A, '.', T, A, JOIN, I);
        expect(segmentEntries(entries, s, withMark)).toEqual([
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1] },
            { kind: 'block', templateId: 'CV', entryIndices: [3, 4, 6], roleIds: ['C1', 'V', 'V'] },
        ]);
        // Without the join: ta · i.
        expect(ids(segmentEntries(markWord(K, A, '.', T, A, I), s, withMark))).toEqual(['CV:0,1', 'CV:3,4', 'V:5']);
    });

    it('a join inside a consonant cluster keeps the consonant with the next syllable, indices mapped back', () => {
        const FLEX = withCounts(template('CVC', ['C1', 'V', 'C2']), { C1: { min: 0, max: 3 }, C2: { min: 0, max: 3 } });
        const s = bySyllable([roles.C1, roles.V, roles.C2], [FLEX]);
        // a t ‿ a → a · ta ; a ‿ t a → at · a
        expect(ids(segmentEntries(markWord(A, T, JOIN, A), s, withMark))).toEqual(['CVC:0', 'CVC:1,3']);
        expect(ids(segmentEntries(markWord(A, JOIN, T, A), s, withMark))).toEqual(['CVC:0,2', 'CVC:3']);
        // a ‿ t ‿ a is ONE syllable, but no template holds two vowels, so it
        // falls back to template order inside that syllable.
        expect(ids(segmentEntries(markWord(A, JOIN, T, JOIN, A), s, withMark))).toEqual(['CVC:0,2', 'CVC:4']);
    });

    it('joins at the edges, doubled, or right after a boundary / separator are harmless', () => {
        const s = bySyllable([roles.C1, roles.V], [CV]);
        expect(ids(segmentEntries(markWord(JOIN, K, A, JOIN), s, withMark))).toEqual(['CV:1,2']);
        expect(ids(segmentEntries(markWord(K, A, '.', JOIN, T, A), s, withMark))).toEqual(['CV:0,1', 'CV:4,5']);
        const entries = [gEntry(K, 0), gEntry(A, 1), roleEntry('word-separator', ' ', 2), ipaEntry(JOIN, 3), gEntry(T, 4), gEntry(A, 5)];
        expect(ids(segmentEntries(entries, s, withMark))).toEqual(['CV:0,1', 'passthrough:2', 'CV:4,5']);
        // Two joins in a row are one join.
        const FLEX = withCounts(template('CVC', ['C1', 'V', 'C2']), { C1: { min: 0, max: 3 }, C2: { min: 0, max: 3 } });
        expect(ids(segmentEntries(markWord(A, JOIN, JOIN, T, A), bySyllable([roles.C1, roles.V, roles.C2], [FLEX]), withMark)))
            .toEqual(['CVC:0,3', 'CVC:4']);
        // A spelling of joins only.
        expect(segmentEntries(markWord(JOIN, JOIN), s, withMark)).toEqual([]);
    });

    it('template mode drops joins and is otherwise unchanged', () => {
        const greedy = scheme([roles.C1, roles.V, roles.C2], [template('CVC', ['C1', 'V', 'C2']), CV]);
        expect(ids(segmentEntries(markWord(K, A, JOIN, T, A), greedy, withMark))).toEqual(['CVC:0,1,3', 'single:4']);
        expect(ids(segmentEntries(markWord(K, A, T, A), greedy, withMark))).toEqual(['CVC:0,1,2', 'single:3']);
    });

    it.each(['ˈ', 'ˌ'])('stress %s mid-word cuts like `.` and draws nothing (both modes)', (stress) => {
        const FLEX = withCounts(template('CVC', ['C1', 'V', 'C2']), { C1: { min: 0, max: 3 }, C2: { min: 0, max: 3 } });
        const s = bySyllable([roles.C1, roles.V, roles.C2], [FLEX]);
        expect(ids(segmentEntries(markWord(A, 's', stress, T, A), s, withMark)))
            .toEqual(ids(segmentEntries(markWord(A, 's', '.', T, A), s, withMark)));
        expect(ids(segmentEntries(markWord(A, 's', stress, T, A), s, withMark))).toEqual(['CVC:0,1', 'CVC:3,4']);
        const greedy = scheme([roles.C1, roles.V, roles.C2], [template('CVC', ['C1', 'V', 'C2']), CV]);
        expect(ids(segmentEntries(markWord(K, A, stress, T, A), greedy, withMark))).toEqual(['CV:0,1', 'CV:3,4']);
    });
});

// =============================================================================
// CONLANG_EDGES_PLAN.md §4 — syllable-sign codas, syllabic consonants
// =============================================================================

describe('segmentEntries by syllable: a syllable sign takes its coda (CONLANG_EDGES_PLAN.md §4.1)', () => {
    const SYLC = template('SYLC', ['SYL', 'C2']);
    const bySyllable = (templates: Parameters<typeof scheme>[1]) => ({
        ...scheme([roles.SYL, roles.C1, roles.V, roles.C2], templates),
        split: { mode: 'syllables' as const },
    });
    const ids = (segments: ReturnType<typeof segmentEntries>) => segments.map((seg) => (seg.kind === 'block' ? `${seg.templateId}:${seg.entryIndices.join(',')}` : `${seg.kind}:${seg.entryIndices[0]}`));

    it('KA n t a under a SYL C + CV scheme → two blocks', () => {
        expect(segmentEntries(word(KA, 'n', T, A), bySyllable([SYLC, CV]), index)).toEqual([
            { kind: 'block', templateId: 'SYLC', entryIndices: [0, 1] },
            { kind: 'block', templateId: 'CV', entryIndices: [2, 3] },
        ]);
        // At the end of the word: KA n → one SYL C block.
        expect(ids(segmentEntries(word(KA, 'n'), bySyllable([SYLC, CV]), index))).toEqual(['SYLC:0,1']);
    });

    it('without a SYL C template the grown syllable falls back to template order inside it', () => {
        expect(segmentEntries(word(KA, 'n', T, A), bySyllable([CV]), index)).toEqual([
            { kind: 'single', entryIndices: [0] },
            { kind: 'single', entryIndices: [1], consonant: true },
            { kind: 'block', templateId: 'CV', entryIndices: [2, 3] },
        ]);
    });

    it('a grown syllable-sign range is never joined again (joinOpaqueUnits)', () => {
        // A SYL C C V template would cover KA n + ta, but the grown range is
        // no longer a lone sign, so it stays SYL C.
        const SYLCCV = template('SYLCCV', ['SYL', 'C2', 'C1', 'V']);
        expect(ids(segmentEntries(word(KA, 'n', T, A), bySyllable([CV, SYLC, SYLCCV]), index))).toEqual(['SYLC:0,1', 'CV:2,3']);
        // Nor with the previous syllable: t a · KA n with a C V SYL C template.
        const CVSYLC = template('CVSYLC', ['C1', 'V', 'SYL', 'C2']);
        expect(ids(segmentEntries(word(T, A, KA, 'n'), bySyllable([CV, SYLC, CVSYLC]), index))).toEqual(['CV:0,1', 'SYLC:2,3']);
        // A sign that grew nothing is still lone and still joins: KA · ta with SYL C V.
        const SYLCV = template('SYLCV', ['SYL', 'C1', 'V']);
        expect(ids(segmentEntries(word(KA, T, A), bySyllable([CV, SYLCV]), index))).toEqual(['SYLCV:0,1,2']);
    });

    it('a logogram takes no coda (P-B3): LOGO n t a stays LOGO · nta', () => {
        const s = { ...scheme([roles.LOGO, roles.C1, roles.V, roles.C2], [CV]), split: { mode: 'syllables' as const } };
        expect(ids(segmentEntries(word(LOGO, 'n', T, A), s, index))).toEqual(['single:0', 'single:1', 'CV:2,3']);
    });

    it('template mode is unaffected', () => {
        const greedy = scheme([roles.SYL, roles.C1, roles.V, roles.C2], [CV, SYLC]);
        expect(ids(segmentEntries(word(KA, 'n', T, A), greedy, index))).toEqual(['SYLC:0,1', 'CV:2,3']);
        expect(ids(segmentEntries(word(KA, T, A), greedy, index))).toEqual(['SYLC:0,1', 'single:2']);
    });
});

describe('segmentEntries by syllable: syllabic consonants (CONLANG_EDGES_PLAN.md §4.2)', () => {
    const CORE = { id: 'R', label: 'Core', matcher: { kind: 'class', letter: 'R' } } satisfies BlockRole;
    const withList = (roleList: BlockRole[], templates: BlockTemplate[], syllabicConsonants?: string[]) => ({
        ...scheme(roleList, templates),
        split: syllabicConsonants ? { mode: 'syllables' as const, syllabicConsonants } : { mode: 'syllables' as const },
    });
    const ids = (segments: ReturnType<typeof segmentEntries>) => segments.map((seg) => (seg.kind === 'block' ? `${seg.templateId}:${seg.entryIndices.join(',')}` : `${seg.kind}:${seg.entryIndices[0]}`));
    const prst = word('p', 'r', 's', T);

    it('P-B1: a syllabic r is class C, so a V box does NOT take it — prst falls back to template order', () => {
        const CVCC = withCounts(template('CVC', ['C1', 'V', 'C2']), { C2: { max: 2 } });
        // Four singles; only the core r is NOT flagged for the vowel-killer mark.
        expect(segmentEntries(prst, withList([roles.C1, roles.V, roles.C2], [CVCC], ['r']), index)).toEqual([
            { kind: 'single', entryIndices: [0], consonant: true },
            { kind: 'single', entryIndices: [1] },
            { kind: 'single', entryIndices: [2], consonant: true },
            { kind: 'single', entryIndices: [3], consonant: true },
        ]);
        // Without the list, r is a dead consonant like the others.
        expect(segmentEntries(prst, withList([roles.C1, roles.V, roles.C2], [CVCC]), index)).toEqual(
            [0, 1, 2, 3].map((i) => ({ kind: 'single', entryIndices: [i], consonant: true })),
        );
    });

    it('a lone r + U+0329 is a plain single (a core), with nothing listed', () => {
        const s = withList([roles.C1, roles.V, roles.C2], [CVC]);
        expect(segmentEntries([ipaEntry('r\u0329', 0)], s, index)).toEqual([{ kind: 'single', entryIndices: [0] }]);
        // Template mode knows no cores: the flag stays (P1).
        expect(segmentEntries([ipaEntry('r\u0329', 0)], scheme([roles.C1, roles.V, roles.C2], [CVC]), index)).toEqual([
            { kind: 'single', entryIndices: [0], consonant: true },
        ]);
    });

    it('a template whose middle role is class R takes prst as ONE block', () => {
        const CRC = withCounts(template('CRC', ['C1', 'R', 'C2']), { C2: { max: 2 } });
        expect(segmentEntries(prst, withList([roles.C1, CORE, roles.C2], [CRC], ['r']), index)).toEqual([
            { kind: 'block', templateId: 'CRC', entryIndices: [0, 1, 2, 3], roleIds: ['C1', 'R', 'C2', 'C2'] },
        ]);
    });

    it('so does a template whose middle role is `any`', () => {
        const CAC = withCounts(template('CAC', ['C1', 'ANY', 'C2']), { C2: { max: 2 } });
        expect(segmentEntries(prst, withList([roles.C1, roles.ANY, roles.C2], [CAC], ['r']), index)).toEqual([
            { kind: 'block', templateId: 'CAC', entryIndices: [0, 1, 2, 3], roleIds: ['C1', 'ANY', 'C2', 'C2'] },
        ]);
    });

    it('krtek with r listed → kr · tek (C R + C V C)', () => {
        const CR = template('CR', ['C1', 'R']);
        const s = withList([roles.C1, CORE, roles.V, roles.C2], [CR, CVC], ['r']);
        expect(ids(segmentEntries(word(K, 'r', T, 'e', K), s, index))).toEqual(['CR:0,1', 'CVC:2,3,4']);
    });

    it('karta keeps its r as a coda (next to a vowel): kar · ta', () => {
        const s = withList([roles.C1, roles.V, roles.C2], [CV, CVC], ['r']);
        expect(ids(segmentEntries(word(K, A, 'r', T, A), s, index))).toEqual(['CVC:0,1,2', 'CV:3,4']);
    });

    it('a grapheme whose sound is ŋ is NOT promoted by n (exact match only)', () => {
        const withNg = indexOf(fakeGrapheme(K, 'k'), fakeGrapheme(T, 't'), fakeGrapheme(20, 'ŋ'), fakeGrapheme(21, 'n'));
        const CR = template('CR', ['C1', 'R']);
        const CCV = withCounts(template('CCV', ['C1', 'V']), { C1: { max: 3 } });
        const s = withList([roles.C1, CORE, roles.V], [CR, CCV], ['n']);
        // k n t e: n is a core → kn · te.
        expect(ids(segmentEntries([gEntry(K, 0), gEntry(21, 1), gEntry(T, 2), ipaEntry('e', 3)], s, withNg))).toEqual(['CR:0,1', 'CCV:2,3']);
        // k ŋ t e: ŋ is an ordinary consonant → one syllable → CCV takes all of it.
        expect(ids(segmentEntries([gEntry(K, 0), gEntry(20, 1), gEntry(T, 2), ipaEntry('e', 3)], s, withNg))).toEqual(['CCV:0,1,2,3']);
    });

    it('template mode ignores the list', () => {
        const CRC = withCounts(template('CRC', ['C1', 'R', 'C2']), { C2: { max: 2 } });
        const templatesMode = { ...scheme([roles.C1, CORE, roles.C2], [CRC]), split: { mode: 'templates' as const, syllabicConsonants: ['r'] } };
        const plain = scheme([roles.C1, CORE, roles.C2], [CRC]);
        expect(segmentEntries(prst, templatesMode, index)).toEqual(segmentEntries(prst, plain, index));
    });
});
