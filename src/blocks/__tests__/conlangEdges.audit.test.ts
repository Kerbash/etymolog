/**
 * Audit tests for CONLANG_EDGES_PLAN.md Phase A (marks, joins, stress) —
 * written by the reviewer, independent of the implementer's own tests.
 *
 * Every case here is a cross-module property: the segmenter, the composer
 * and the render path (`normalizeGlyphInput`) must agree, and a feature that
 * is not used must leave the output byte-identical (P-A2).
 */

import { describe, it, expect } from 'vitest';

import { segmentEntries } from '../segment';
import { composeBlock } from '../compose';
import { classifyEntry, MARK_CATEGORY_NAME } from '../classify';
import { syllabify } from '../syllabify';
import type { SyllableUnit } from '../syllabify';
import { normalizeGlyphInput } from '../../components/display/spelling/utils/normalization';
import type { GraphemeComplete } from '../../db/types';
import type { BlockSplit } from '../types';
import { MARK_CATEGORY } from '../../db/wordSymbolService';
import { fakeGrapheme, gEntry, indexOf, ipaEntry, markGrapheme, roleEntry, roles, scheme, template } from './fixtures';

const K = 1;
const A = 2;
const T = 3;
const I = 4;
const N = 5;
const TONE = 9;
const index = indexOf(
    fakeGrapheme(K, 'k'),
    fakeGrapheme(A, 'a'),
    fakeGrapheme(T, 't'),
    fakeGrapheme(I, 'i'),
    fakeGrapheme(N, 'n'),
    markGrapheme(TONE),
);
const CV = template('CV', ['C1', 'V']);
const CVC = template('CVC', ['C1', 'V', 'C2']);
const CVM = template('CVM', ['C1', 'V', 'MARK']);
const bySyllable = (templates = [CV, CVC]) => ({
    ...scheme([roles.C1, roles.V, roles.C2, roles.MARK], templates),
    split: { mode: 'syllables' as const },
});
const byTemplates = (templates = [CVC, CV]) => scheme([roles.C1, roles.V, roles.C2, roles.MARK], templates);

const word = (...ids: (number | string)[]) =>
    ids.map((id, position) => (typeof id === 'number' ? gEntry(id, position) : ipaEntry(id, position)));
const shape = (segments: ReturnType<typeof segmentEntries>) =>
    segments.map((s) => `${s.kind === 'block' ? s.templateId : s.kind}:${s.entryIndices.join(',')}`);

describe('audit: the mark category constant is shared with the DB layer', () => {
    it('MARK_CATEGORY_NAME equals wordSymbolService.MARK_CATEGORY', () => {
        expect(MARK_CATEGORY_NAME).toBe(MARK_CATEGORY);
    });
});

describe('audit: stress marks cut like `.` in BOTH split modes', () => {
    it('by syllable: kaˈta → [ka] [ta], the stress entry in no segment', () => {
        expect(shape(segmentEntries(word(K, A, 'ˈ', T, A), bySyllable(), index))).toEqual(['CV:0,1', 'CV:3,4']);
    });
    it('by template order: kaˈta → [ka] [ta] (CVC cannot reach across the stress)', () => {
        expect(shape(segmentEntries(word(K, A, 'ˈ', T, A), byTemplates(), index))).toEqual(['CV:0,1', 'CV:3,4']);
    });
    it('secondary stress ˌ behaves the same', () => {
        expect(shape(segmentEntries(word(K, A, 'ˌ', T, A), bySyllable(), index))).toEqual(['CV:0,1', 'CV:3,4']);
    });
});

describe('audit: joins are byte-identical no-ops where they mean nothing (P-A2)', () => {
    const cases: (number | string)[][] = [
        [K, A, T, A],
        [K, A, N, T, A],
        [T, A, '.', K, A, I],
        [K, A, ' ', T, A],
        [K, A, TONE, N],
    ];
    for (const ids of cases) {
        it(`${ids.join(' ')}: a join at the start, at the end, after a boundary or after a separator changes nothing`, () => {
            const baseline = segmentEntries(word(...ids), bySyllable(), index);
            const variants: (number | string)[][] = [['‿', ...ids], [...ids, '‿']];
            const boundaryAt = ids.findIndex((id) => id === '.' || id === ' ');
            if (boundaryAt >= 0) {
                variants.push([...ids.slice(0, boundaryAt + 1), '‿', ...ids.slice(boundaryAt + 1)]);
            }
            for (const variant of variants) {
                const entries = word(...variant);
                // The baseline, with every index moved to where that entry sits in the variant.
                const kept = variant.flatMap((id, k) => (id === '‿' ? [] : [k]));
                const expected = baseline.map((s) => ({ ...s, entryIndices: s.entryIndices.map((i) => kept[i]) }));
                expect(segmentEntries(entries, bySyllable(), index)).toEqual(expected);
            }
        });
    }
});

describe('audit: syllabify merges when every cut is forbidden (P-A5) and never emits an empty range', () => {
    const unit = (char: string): SyllableUnit => ({ cls: classifyEntry(ipaEntry(char), new Map()), sound: char });
    it('a‿t‿a is one range covering everything', () => {
        const out = syllabify(['a', 't', 'a'].map(unit), { joins: new Set([1, 2]) });
        expect(out).toEqual([[0, 3]]);
    });
    it('a‿t‿a‿t‿a stays one range (repeated merges keep syllableStart put)', () => {
        const out = syllabify(['a', 't', 'a', 't', 'a'].map(unit), { joins: new Set([1, 2, 3, 4]) });
        expect(out).toEqual([[0, 5]]);
    });
    it('ranges always tile the input, whatever the joins', () => {
        const units = ['k', 'a', 'n', 't', 'a', 'i', 'k'].map(unit);
        for (let mask = 0; mask < 1 << 6; mask += 1) {
            const joins = new Set<number>();
            for (let p = 1; p < 7; p += 1) if (mask & (1 << (p - 1))) joins.add(p);
            const out = syllabify(units, { joins });
            let at = 0;
            for (const [from, to] of out) {
                expect(from).toBe(at);
                expect(to).toBeGreaterThan(from);
                at = to;
            }
            expect(at).toBe(units.length);
        }
    });
});

describe('audit: a mark rides in a block through the WHOLE render path', () => {
    const graphemeMap = new Map<number, GraphemeComplete>();
    for (const [id, info] of index) {
        graphemeMap.set(id, {
            id,
            name: `g${id}`,
            category: info.category,
            notes: null,
            created_at: '',
            updated_at: '',
            phonemes: info.phonemes.map((p, k) => ({ id: k + 1, grapheme_id: id, phoneme: p.phoneme, use_in_auto_spelling: p.use_in_auto_spelling, position: k, created_at: '', updated_at: '' })),
            glyphs: info.glyphs.map((g, k) => ({ id: id * 100 + k, name: `g${id}`, svg_data: g.svg_data, category: null, notes: null, created_at: '', updated_at: '' })),
        } as unknown as GraphemeComplete);
    }
    it('k a TONE → one block renderable; the join `‿` renders nothing; with blocks off the join is a text glyph', () => {
        // The join sits between `a` and its mark, where no cut could fall anyway.
        const entries = word(K, A, '‿', TONE, K, A);
        const on = normalizeGlyphInput(entries, { blockScheme: bySyllable([CV, CVM]), graphemeMap });
        expect(on.map((g) => g.name)).toEqual(['CVM', 'CV']);
        expect(on[0].block?.entryIndices).toEqual([0, 1, 3]);
        expect(on[1].block?.entryIndices).toEqual([4, 5]);
        const off = normalizeGlyphInput(entries, { blockScheme: { ...bySyllable([CV, CVM]), enabled: false }, graphemeMap });
        expect(off.map((g) => g.isVirtual)).toEqual([false, false, true, false, false, false]);
        expect(off[2].ipaCharacter).toBe('‿');
    });
    it('a join between a mark and the next consonant keeps that consonant in the first syllable (it forbids the cut)', () => {
        expect(shape(segmentEntries(word(K, A, TONE, '‿', K, A), bySyllable([CV, CVM, template('CVMC', ['C1', 'V', 'MARK', 'C2'])]), index)))
            .toEqual(['CVMC:0,1,2,4', 'single:5']);
    });
    it('a typed IPA mark composes as a virtual stand-in inside the block', () => {
        const entries = word(K, A, 'ː');
        const s = { ...bySyllable([CV, template('CVA', ['C1', 'V', 'ANY'])]), roles: [roles.C1, roles.V, roles.ANY] };
        const [segment] = segmentEntries(entries, s, index);
        expect(segment.kind).toBe('block');
        if (segment.kind !== 'block') return;
        const composed = composeBlock(segment, entries, s, index);
        expect(composed.containsVirtual).toBe(true);
        expect(composed.slots.map((slot) => slot.roleId)).toEqual(['C1', 'V', 'ANY']);
    });
    it('structural entries still pass through around marks and joins', () => {
        const entries = [gEntry(K, 0), gEntry(A, 1), gEntry(TONE, 2), roleEntry('word-separator', ' ', 3), ipaEntry('‿', 4), gEntry(T, 5), gEntry(A, 6)];
        expect(shape(segmentEntries(entries, bySyllable([CV, CVM]), index))).toEqual(['CVM:0,1,2', 'passthrough:3', 'CV:5,6']);
    });
});

describe('audit (Phase B): syllable-sign codas and syllabic consonants', () => {
    const KA = 20;
    const R = 21;
    const S = 22;
    const P = 23;
    const L = 24;
    const M = 25;
    const H = 26;
    const E = 27;
    const bIndex = indexOf(
        fakeGrapheme(K, 'k'), fakeGrapheme(A, 'a'), fakeGrapheme(T, 't'), fakeGrapheme(I, 'i'), fakeGrapheme(N, 'n'),
        markGrapheme(TONE), fakeGrapheme(KA, 'ka'), fakeGrapheme(R, 'r'), fakeGrapheme(S, 's'), fakeGrapheme(P, 'p'),
        fakeGrapheme(L, 'l'), fakeGrapheme(M, 'm'), fakeGrapheme(H, 'h'), fakeGrapheme(E, 'e'),
    );
    const R_ROLE = { id: 'R', label: 'Core', matcher: { kind: 'class' as const, letter: 'R' as const } };
    const CRC = template('CRC', ['C1', 'R', 'C2']);
    const SYLC = template('SYLC', ['SYL', 'C2']);
    const SYL1 = template('SYL1', ['SYL']);
    const s = (templates: ReturnType<typeof template>[], extra: Partial<BlockSplit> = {}) => ({
        ...scheme([roles.C1, roles.V, roles.C2, roles.SYL, roles.MARK, R_ROLE], templates),
        split: { mode: 'syllables' as const, ...extra },
    });

    it('KA n t a with SYL C + CV → [KA n] [t a]; the grown range is never joined again', () => {
        expect(shape(segmentEntries(word(KA, N, T, A), s([SYL1, SYLC, CV, CVC, template('SYLCV', ['SYL', 'C1', 'V'])]), bIndex)))
            .toEqual(['SYLC:0,1', 'CV:2,3']);
    });
    it('KA t a → the sign takes nothing; a SYL C V template may still join it to the next syllable', () => {
        expect(shape(segmentEntries(word(KA, T, A), s([SYL1, CV, template('SYLCV', ['SYL', 'C1', 'V'])]), bIndex)))
            .toEqual(['SYLCV:0,1,2']);
    });
    it('KA r t a with r listed → KAr · ta (a syllable sign counts as a vowel neighbour)', () => {
        expect(shape(segmentEntries(word(KA, R, T, A), s([SYL1, SYLC, CV], { syllabicConsonants: ['r'] }), bIndex)))
            .toEqual(['SYLC:0,1', 'CV:2,3']);
    });
    it('prst with r listed → one CRC block with counts; only r is not flagged as a lone consonant under a CV-only scheme', () => {
        const flexible = { ...CRC, slots: CRC.slots.map((slot) => (slot.roleId === 'R' ? slot : { ...slot, max: 3 as const })) };
        expect(shape(segmentEntries(word(P, R, S, T), s([flexible]), bIndex))).toEqual(['CRC:0,1,2,3']);
        const degraded = segmentEntries(word(P, R, S, T), s([CV], { syllabicConsonants: ['r'] }), bIndex);
        expect(degraded.map((seg) => (seg.kind === 'single' ? seg.consonant === true : 'block'))).toEqual([true, false, true, true]);
    });
    it('mlha with m AND l listed → ml · ha with l as the core', () => {
        const flexible = { ...CRC, slots: CRC.slots.map((slot) => (slot.roleId === 'R' ? slot : { ...slot, min: 0 as const, max: 3 as const })) };
        const segs = segmentEntries(word(M, L, H, A), s([flexible, CV, CVC], { syllabicConsonants: ['m', 'l'] }), bIndex);
        expect(shape(segs)).toEqual(['CRC:0,1', 'CV:2,3']);
        expect(segs[0].kind === 'block' && segs[0].roleIds).toEqual(['C1', 'R']);
    });
    it('the ranges tile every input under every syllabic list and sign mix', () => {
        const unit = (id: number): SyllableUnit => ({ cls: classifyEntry(gEntry(id), bIndex), sound: id === TONE ? null : (bIndex.get(id)!.phonemes[0]?.phoneme ?? null) });
        const pool = [K, A, T, KA, R, N, TONE, L, M];
        for (let seed = 1; seed < 400; seed += 1) {
            let x = seed;
            const ids: number[] = [];
            const len = 3 + (seed % 6);
            for (let k = 0; k < len; k += 1) {
                x = (x * 1103515245 + 12345) & 0x7fffffff;
                ids.push(pool[x % pool.length]);
            }
            const out = syllabify(ids.map(unit), { syllabicConsonants: ['r', 'l', 'm'], sibilantClusters: seed % 2 === 0 });
            let at = 0;
            for (const [from, to] of out) {
                expect(from).toBe(at);
                expect(to).toBeGreaterThan(from);
                at = to;
            }
            expect(at).toBe(ids.length);
        }
    });
});
