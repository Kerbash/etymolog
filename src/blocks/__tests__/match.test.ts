/**
 * matchTemplate — SYLLABLE_BLOCKS_PLAN.md §3.2.
 *
 * Slot counts ([min, max] per pattern role), backtracking, longest-prefix vs
 * exact, the "earlier items take more" tie rule, and the P1/P2 guarantee that
 * a count-less template is exactly the old `every(roleAccepts)` prefix check.
 */

import { describe, expect, it } from 'vitest';
import { matchTemplate, templateHasCounts } from '../match';
import type { BlockRole, BlockTemplate } from '../types';
import { classesOf, roles, template, withCounts } from './fixtures';

const rolesById = new Map<string, BlockRole>(Object.values(roles).map((role) => [role.id, role]));

const CV = template('CV', ['C1', 'V']);
const CVC = template('CVC', ['C1', 'V', 'C2']);
/** C1(0–3) V C2(0–3) — the one template that fits a, spa, spɛl, strɛŋθs. */
const FLEX = withCounts(CVC, { C1: { min: 0, max: 3 }, C2: { min: 0, max: 3 } });

const whole = (t: BlockTemplate, chars: string[], mode: 'prefix' | 'exact' = 'prefix') =>
    matchTemplate(t, rolesById, classesOf(...chars), 0, chars.length, mode);

describe('templateHasCounts', () => {
    it('false for a count-less template, true once any slot declares min or max', () => {
        expect(templateHasCounts(CVC)).toBe(false);
        expect(templateHasCounts(withCounts(CVC, { V: { arrange: 'column' } }))).toBe(false);
        expect(templateHasCounts(withCounts(CVC, { C2: { min: 0 } }))).toBe(true);
        expect(templateHasCounts(withCounts(CVC, { C1: { max: 2 } }))).toBe(true);
    });
});

describe('count-less templates behave exactly like every(roleAccepts) (P1/P2)', () => {
    it('matches a prefix one entry per role', () => {
        expect(whole(CV, ['k', 'a', 't'])).toEqual({ length: 2, roleIds: ['C1', 'V'], emptyOptional: 0 });
    });

    it('fails when any role rejects its entry, or entries run out', () => {
        expect(whole(CV, ['a', 'k'])).toBeNull();
        expect(whole(CVC, ['k', 'a'])).toBeNull();
    });

    it('respects the end bound', () => {
        expect(matchTemplate(CVC, rolesById, classesOf('k', 'a', 't'), 0, 2, 'prefix')).toBeNull();
    });

    it('starts where it is told', () => {
        expect(matchTemplate(CV, rolesById, classesOf('a', 'k', 'a'), 1, 3, 'prefix')).toEqual({ length: 2, roleIds: ['C1', 'V'], emptyOptional: 0 });
    });

    it('an empty range never matches', () => {
        expect(matchTemplate(CV, rolesById, classesOf('k', 'a'), 2, 2, 'prefix')).toBeNull();
        expect(matchTemplate(CV, rolesById, classesOf('k', 'a'), 1, 0, 'exact')).toBeNull();
    });
});

describe('optional slots', () => {
    const CVopt = withCounts(CV, { V: { min: 0 } });

    it('absent: the slot takes nothing and is counted in emptyOptional', () => {
        expect(whole(CVopt, ['k'])).toEqual({ length: 1, roleIds: ['C1'], emptyOptional: 1 });
    });

    it('present: the slot takes its entry', () => {
        expect(whole(CVopt, ['k', 'a'])).toEqual({ length: 2, roleIds: ['C1', 'V'], emptyOptional: 0 });
    });

    it('a match must take at least one entry — all-optional on nothing that fits ⇒ null', () => {
        const allOptional = withCounts(template('CC', ['C1', 'C2']), { C1: { min: 0 }, C2: { min: 0 } });
        expect(whole(allOptional, ['a'])).toBeNull();
    });
});

describe('several signs per slot', () => {
    const C3V = withCounts(CV, { C1: { max: 3 } });

    it('1–3 is greedy up to its cap', () => {
        expect(whole(C3V, ['k', 'a'])).toEqual({ length: 2, roleIds: ['C1', 'V'], emptyOptional: 0 });
        expect(whole(C3V, ['s', 't', 'r', 'a'])).toEqual({ length: 4, roleIds: ['C1', 'C1', 'C1', 'V'], emptyOptional: 0 });
    });

    it('more consonants than the cap cannot match', () => {
        expect(whole(C3V, ['s', 't', 'r', 'p', 'a'])).toBeNull();
    });

    it('backtracks: a greedy slot gives entries back when a later role needs them', () => {
        const CC = withCounts(template('CC', ['C1', 'C2']), { C1: { max: 3 } });
        expect(whole(CC, ['k', 't'])).toEqual({ length: 2, roleIds: ['C1', 'C2'], emptyOptional: 0 });
        expect(whole(CC, ['k', 't', 'm'])).toEqual({ length: 3, roleIds: ['C1', 'C1', 'C2'], emptyOptional: 0 });
    });

    it('ties go to earlier items taking MORE entries', () => {
        const CC = withCounts(template('CC', ['C1', 'C2']), { C1: { min: 0, max: 3 }, C2: { min: 0, max: 3 } });
        expect(whole(CC, ['s', 't'])).toEqual({ length: 2, roleIds: ['C1', 'C1'], emptyOptional: 1 });
        expect(whole(CC, ['s', 't'], 'exact')).toEqual({ length: 2, roleIds: ['C1', 'C1'], emptyOptional: 1 });
    });
});

describe('C1(0–3) V C2(0–3)', () => {
    it('a', () => {
        expect(whole(FLEX, ['a'])).toEqual({ length: 1, roleIds: ['V'], emptyOptional: 2 });
    });

    it('spa', () => {
        expect(whole(FLEX, ['s', 'p', 'a'])).toEqual({ length: 3, roleIds: ['C1', 'C1', 'V'], emptyOptional: 1 });
    });

    it('spɛl', () => {
        expect(whole(FLEX, ['s', 'p', 'ɛ', 'l'])).toEqual({ length: 4, roleIds: ['C1', 'C1', 'V', 'C2'], emptyOptional: 0 });
    });

    it('strɛŋθs', () => {
        expect(whole(FLEX, ['s', 't', 'r', 'ɛ', 'ŋ', 'θ', 's'])).toEqual({
            length: 7,
            roleIds: ['C1', 'C1', 'C1', 'V', 'C2', 'C2', 'C2'],
            emptyOptional: 0,
        });
    });

    it('no vowel ⇒ no match (V is required)', () => {
        expect(whole(FLEX, ['s', 't'])).toBeNull();
    });
});

describe('prefix vs exact', () => {
    it('prefix takes the longest match and leaves the rest', () => {
        // k a t a: the coda swallows t (template-order greed), the last a is left over.
        expect(whole(FLEX, ['k', 'a', 't', 'a'])).toEqual({ length: 3, roleIds: ['C1', 'V', 'C2'], emptyOptional: 0 });
    });

    it('exact must consume the whole range', () => {
        expect(matchTemplate(FLEX, rolesById, classesOf('k', 'a', 't', 'a'), 0, 2, 'exact')).toEqual({
            length: 2,
            roleIds: ['C1', 'V'],
            emptyOptional: 1,
        });
        expect(whole(FLEX, ['k', 'a', 't', 'a'], 'exact')).toBeNull();
        expect(matchTemplate(FLEX, rolesById, classesOf('t', 'a', 'p', 'a'), 2, 4, 'exact')).toEqual({
            length: 2,
            roleIds: ['C1', 'V'],
            emptyOptional: 1,
        });
    });

    it('exact backs off a greedy count to reach the end', () => {
        // C1(1–3) C2(1): C1 taking all three leaves C2 nothing; exact backs off to two.
        const CC = withCounts(template('CC', ['C1', 'C2']), { C1: { max: 3 } });
        expect(whole(CC, ['k', 't', 'm'], 'exact')).toEqual({ length: 3, roleIds: ['C1', 'C1', 'C2'], emptyOptional: 0 });
    });
});

describe('invalid input never throws', () => {
    it('a pattern role missing from rolesById ⇒ null', () => {
        expect(matchTemplate(template('X', ['C1', 'NOPE']), rolesById, classesOf('k', 'a'), 0, 2, 'prefix')).toBeNull();
    });

    it('an empty pattern ⇒ null', () => {
        expect(matchTemplate(template('E', []), rolesById, classesOf('k'), 0, 1, 'prefix')).toBeNull();
    });

    it('a missing slot counts as exactly one', () => {
        const noSlots = { ...CV, slots: [] };
        expect(whole(noSlots, ['k', 'a'])).toEqual({ length: 2, roleIds: ['C1', 'V'], emptyOptional: 0 });
    });

    it('an end beyond the classes is clamped', () => {
        expect(matchTemplate(CV, rolesById, classesOf('k', 'a'), 0, 99, 'prefix')).toEqual({ length: 2, roleIds: ['C1', 'V'], emptyOptional: 0 });
    });

    it('boundaries are never taken, even by a many-sign slot', () => {
        expect(whole(FLEX, ['k', '.', 'a'])).toBeNull();
        expect(whole(FLEX, ['a', '.', 'k'])).toEqual({ length: 1, roleIds: ['V'], emptyOptional: 2 });
    });
});

// =============================================================================
// DIPHTHONG_BLOCKS_PLAN.md §3.4 — glued groups (a diphthong spelled with two signs)
// =============================================================================

describe('groups', () => {
    const V = template('V', ['V']);
    const singletons = (n: number) => Array.from({ length: n }, (_, i) => i);
    const grouped = (t: BlockTemplate, chars: string[], groups: number[], mode: 'prefix' | 'exact' = 'prefix', start = 0, end = chars.length) =>
        matchTemplate(t, rolesById, classesOf(...chars), start, end, mode, groups);

    it('a group counts as ONE against a slot that takes exactly one', () => {
        expect(grouped(CV, ['t', 'a', 'i'], [0, 1, 1], 'exact')).toEqual({ length: 3, roleIds: ['C1', 'V', 'V'], emptyOptional: 0 });
        expect(grouped(V, ['a', 'i'], [0, 0], 'exact')).toEqual({ length: 2, roleIds: ['V', 'V'], emptyOptional: 0 });
        // Without the group the same range does not fit.
        expect(whole(CV, ['t', 'a', 'i'], 'exact')).toBeNull();
    });

    it('prefix mode takes the whole group or nothing of it', () => {
        expect(grouped(CV, ['t', 'a', 'i', 'k'], [0, 1, 1, 2])).toEqual({ length: 3, roleIds: ['C1', 'V', 'V'], emptyOptional: 0 });
        expect(grouped(CVC, ['t', 'a', 'i', 'k'], [0, 1, 1, 2])).toEqual({ length: 4, roleIds: ['C1', 'V', 'V', 'C2'], emptyOptional: 0 });
    });

    it('min / max count groups: V(1–2) takes two pairs, V(1) only the first', () => {
        const V2 = withCounts(V, { V: { max: 2 } });
        expect(grouped(V2, ['a', 'i', 'a', 'i'], [0, 0, 1, 1])).toEqual({ length: 4, roleIds: ['V', 'V', 'V', 'V'], emptyOptional: 0 });
        expect(grouped(V, ['a', 'i', 'a', 'i'], [0, 0, 1, 1])).toEqual({ length: 2, roleIds: ['V', 'V'], emptyOptional: 0 });
        expect(grouped(V, ['a', 'i', 'a', 'i'], [0, 0, 1, 1], 'exact')).toBeNull();
    });

    it('an optional slot skips a whole group, never half of it', () => {
        const optV = withCounts(CVC, { V: { min: 0 } });
        // C1 V? C2 on t a i k: V takes the pair; there is no way to take only `a`.
        expect(grouped(optV, ['t', 'a', 'i', 'k'], [0, 1, 1, 2], 'exact')).toEqual({ length: 4, roleIds: ['C1', 'V', 'V', 'C2'], emptyOptional: 0 });
    });

    it('a group is rejected as a whole when the role refuses any member', () => {
        // An (artificial) group of a vowel and a consonant: neither V nor C takes it.
        expect(grouped(V, ['a', 'k'], [0, 0])).toBeNull();
        expect(grouped(CV, ['k', 'a', 't'], [0, 1, 1])).toBeNull();
        const ANY = template('ANY', ['ANY']);
        expect(grouped(ANY, ['a', 'k'], [0, 0], 'exact')).toEqual({ length: 2, roleIds: ['ANY', 'ANY'], emptyOptional: 0 });
    });

    it('roleIds stay per ENTRY and follow backtracking', () => {
        const flex = withCounts(CVC, { C1: { min: 0, max: 3 }, C2: { min: 0, max: 3 } });
        expect(grouped(flex, ['ŋ', 'w', 'i', 'ə', 'n'], [0, 1, 2, 2, 3], 'exact')).toEqual({
            length: 5,
            roleIds: ['C1', 'C1', 'V', 'V', 'C2'],
            emptyOptional: 0,
        });
    });

    it('a start inside a group reads it as a group start; an end inside one cuts it (no throw)', () => {
        expect(grouped(V, ['a', 'i'], [0, 0], 'exact', 1, 2)).toEqual({ length: 1, roleIds: ['V'], emptyOptional: 0 });
        expect(grouped(V, ['a', 'i', 'u'], [0, 0, 0], 'exact', 0, 2)).toEqual({ length: 2, roleIds: ['V', 'V'], emptyOptional: 0 });
    });

    it('absent groups ≡ singleton groups on every case above (P1)', () => {
        const templates = [CV, CVC, FLEX, V, withCounts(CV, { C1: { max: 3 } }), withCounts(CV, { V: { min: 0 } })];
        const words = [['k', 'a', 't'], ['a', 'k'], ['s', 't', 'r', 'ɛ', 'ŋ', 'θ', 's'], ['k', 'a', 't', 'a'], ['a'], ['k', '.', 'a'], ['s', 't']];
        for (const t of templates) {
            for (const chars of words) {
                for (const mode of ['prefix', 'exact'] as const) {
                    expect(grouped(t, chars, singletons(chars.length), mode)).toEqual(whole(t, chars, mode));
                }
            }
        }
    });
});
