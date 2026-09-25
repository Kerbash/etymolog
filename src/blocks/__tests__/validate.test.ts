/**
 * validateBlockScheme — every rule in BLOCK_SCRIPT_PLAN.md §2.4.
 *
 * Lenient contract: never throws, always returns a complete self-consistent
 * scheme, and reports every correction with a `path`.
 */

import { describe, expect, it } from 'vitest';
import {
    cloneEmptyBlockScheme,
    EMPTY_BLOCK_SCHEME,
    LONE_CONSONANT_TEMPLATE_ID,
    MAX_DIPHTHONG_LENGTH,
    MAX_DIPHTHONGS,
    MAX_SLOT_COUNT,
    MAX_SOUND_LENGTH,
    MAX_SOUND_LIST,
    MIN_SLOT_SIZE,
    normalizeDiphthongs,
    normalizeSoundList,
    SLOT_FILLS,
    SLOT_PINS,
    validateBlockScheme,
} from '../validate';

const C = { id: 'C1', label: 'Onset', matcher: { kind: 'class', letter: 'C' } };
const V = { id: 'V', label: 'Nucleus', matcher: { kind: 'class', letter: 'V' } };
const fullSlot = (roleId: string, extra: Record<string, unknown> = {}) => ({ roleId, groupId: null, x: 0, y: 0, w: 1, h: 1, ...extra });

function paths(raw: unknown): string[] {
    return validateBlockScheme(raw).issues.map((i) => i.path);
}

describe('defaults', () => {
    it('EMPTY_BLOCK_SCHEME is version 1, disabled, empty', () => {
        expect(EMPTY_BLOCK_SCHEME).toEqual({ version: 1, enabled: false, roles: [], templates: [] });
        expect(Object.isFrozen(EMPTY_BLOCK_SCHEME)).toBe(true);
    });

    it('cloneEmptyBlockScheme returns an unshared copy', () => {
        const a = cloneEmptyBlockScheme();
        const b = cloneEmptyBlockScheme();
        a.roles.push({ id: 'x', label: 'x', matcher: { kind: 'any' } });
        expect(b.roles).toEqual([]);
        expect(EMPTY_BLOCK_SCHEME.roles).toEqual([]);
    });

    it('undefined validates silently to the empty scheme', () => {
        expect(validateBlockScheme(undefined)).toEqual({ scheme: cloneEmptyBlockScheme(), issues: [] });
    });

    it.each([null, 'x', 3, []])('non-object %j → empty scheme + issue', (raw) => {
        const { scheme, issues } = validateBlockScheme(raw);
        expect(scheme).toEqual(cloneEmptyBlockScheme());
        expect(issues).toHaveLength(1);
        expect(issues[0].path).toBe('');
    });

    it('missing enabled → false without an issue; non-boolean → false with an issue', () => {
        expect(validateBlockScheme({ version: 1, roles: [], templates: [] })).toEqual({ scheme: cloneEmptyBlockScheme(), issues: [] });
        const bad = validateBlockScheme({ enabled: 'yes' });
        expect(bad.scheme.enabled).toBe(false);
        expect(bad.issues.map((i) => i.path)).toEqual(['enabled']);
    });

    it('a valid document round-trips unchanged with no issues', () => {
        const doc = {
            version: 1,
            enabled: true,
            roles: [C, { ...V, colour: 'var(--red)' }],
            templates: [{ id: 't', name: 'CV', pattern: ['C1', 'V'], slots: [fullSlot('V', { groupId: 3, x: 0.5, w: 0.5 }), fullSlot('C1', { w: 0.5 })] }],
        };
        const { scheme, issues } = validateBlockScheme(doc);
        expect(issues).toEqual([]);
        expect(scheme).toEqual(doc);
    });

    it('wrong version is reported and read as 1', () => {
        const { scheme, issues } = validateBlockScheme({ version: 2 });
        expect(scheme.version).toBe(1);
        expect(issues.map((i) => i.path)).toEqual(['version']);
    });

    it('roles / templates that are not arrays are reported', () => {
        expect(paths({ roles: {}, templates: 'x' })).toEqual(['roles', 'templates']);
    });
});

describe('unknown keys are reported and dropped at every level', () => {
    it('scheme, role, matcher, template, slot', () => {
        const { scheme, issues } = validateBlockScheme({
            enabled: true,
            extra: 1,
            roles: [{ ...C, bogus: true, matcher: { kind: 'class', letter: 'C', junk: 1 } }],
            templates: [{ id: 't', name: 't', pattern: ['C1'], zzz: 0, slots: [fullSlot('C1', { rot: 90 })] }],
        });
        expect(issues.map((i) => i.path)).toEqual([
            'extra',
            'roles[0].bogus',
            'roles[0].matcher.junk',
            'templates[0].zzz',
            'templates[0].slots[0].rot',
        ]);
        expect(scheme).not.toHaveProperty('extra');
        expect(scheme.roles[0]).toEqual(C);
        expect(scheme.templates[0].slots[0]).toEqual(fullSlot('C1'));
    });
});

describe('roles', () => {
    it('ids must be non-empty strings', () => {
        const { scheme, issues } = validateBlockScheme({ roles: [{ ...C, id: '' }, { ...C, id: '  ' }, { ...C, id: 4 }] });
        expect(scheme.roles).toEqual([]);
        expect(issues.map((i) => i.path)).toEqual(['roles[0].id', 'roles[1].id', 'roles[2].id']);
    });

    it('ids must be unique — the second is dropped', () => {
        const { scheme, issues } = validateBlockScheme({ roles: [C, { ...V, id: 'C1' }] });
        expect(scheme.roles).toEqual([C]);
        expect(issues).toHaveLength(1);
        expect(issues[0].path).toBe('roles[1].id');
        expect(issues[0].message).toMatch(/duplicate/);
    });

    it('an empty label defaults to the id with an issue', () => {
        const { scheme, issues } = validateBlockScheme({ roles: [{ ...C, label: '' }] });
        expect(scheme.roles[0].label).toBe('C1');
        expect(issues.map((i) => i.path)).toEqual(['roles[0].label']);
    });

    it('a non-string colour is dropped', () => {
        const { scheme, issues } = validateBlockScheme({ roles: [{ ...C, colour: 7 }] });
        expect(scheme.roles[0]).not.toHaveProperty('colour');
        expect(issues.map((i) => i.path)).toEqual(['roles[0].colour']);
    });

    it.each([
        [{ kind: 'class', letter: 'X' }, 'roles[0].matcher.letter'],
        [{ kind: 'class', letter: 'CV' }, 'roles[0].matcher.letter'],
        [{ kind: 'category', category: '  ' }, 'roles[0].matcher.category'],
        [{ kind: 'wat' }, 'roles[0].matcher.kind'],
        ['any', 'roles[0].matcher'],
    ])('invalid matcher %j drops the role', (matcher, path) => {
        const { scheme, issues } = validateBlockScheme({ roles: [{ id: 'r', label: 'r', matcher }] });
        expect(scheme.roles).toEqual([]);
        expect(issues[0].path).toBe(path);
    });

    it('accepts every matcher kind; category is trimmed', () => {
        const { scheme, issues } = validateBlockScheme({
            roles: [
                { id: 'a', label: 'a', matcher: { kind: 'any' } },
                { id: 's', label: 's', matcher: { kind: 'syllable' } },
                { id: 'c', label: 'c', matcher: { kind: 'category', category: ' logogram ' } },
                { id: 'n', label: 'n', matcher: { kind: 'class', letter: 'N' } },
            ],
        });
        expect(issues).toEqual([]);
        expect(scheme.roles.map((r) => r.matcher)).toEqual([
            { kind: 'any' },
            { kind: 'syllable' },
            { kind: 'category', category: 'logogram' },
            { kind: 'class', letter: 'N' },
        ]);
    });
});

describe('templates', () => {
    const base = { roles: [C, V] };

    it('pattern must have ≥ 1 entry — else the template is dropped', () => {
        const { scheme, issues } = validateBlockScheme({ ...base, templates: [{ id: 't', name: 't', pattern: [], slots: [] }] });
        expect(scheme.templates).toEqual([]);
        expect(issues.map((i) => i.path)).toEqual(['templates[0].pattern']);
    });

    it('pattern entries must be existing role ids — unknown ones are dropped, with their slots', () => {
        const { scheme, issues } = validateBlockScheme({
            ...base,
            templates: [{ id: 't', name: 't', pattern: ['C1', 'NOPE', 'V'], slots: [fullSlot('C1'), fullSlot('NOPE'), fullSlot('V')] }],
        });
        expect(scheme.templates[0].pattern).toEqual(['C1', 'V']);
        expect(scheme.templates[0].slots.map((s) => s.roleId)).toEqual(['C1', 'V']);
        expect(issues.map((i) => i.path)).toEqual(['templates[0].pattern[1]', 'templates[0].slots[1].roleId']);
    });

    it('a pattern referencing a DROPPED role loses that entry', () => {
        const { scheme } = validateBlockScheme({
            roles: [C, { ...V, matcher: { kind: 'nope' } }],
            templates: [{ id: 't', name: 't', pattern: ['C1', 'V'], slots: [fullSlot('C1'), fullSlot('V')] }],
        });
        expect(scheme.templates[0].pattern).toEqual(['C1']);
    });

    it('no role appears twice in one pattern', () => {
        const { scheme, issues } = validateBlockScheme({
            ...base,
            templates: [{ id: 't', name: 't', pattern: ['C1', 'V', 'C1'], slots: [fullSlot('C1'), fullSlot('V')] }],
        });
        expect(scheme.templates[0].pattern).toEqual(['C1', 'V']);
        expect(issues).toHaveLength(1);
        expect(issues[0].path).toBe('templates[0].pattern[2]');
        expect(issues[0].message).toMatch(/twice/);
    });

    it('ids must be non-empty and unique', () => {
        const t = { name: 'x', pattern: ['C1'], slots: [fullSlot('C1')] };
        const { scheme, issues } = validateBlockScheme({ ...base, templates: [{ ...t, id: 'a' }, { ...t, id: 'a' }, { ...t, id: '' }] });
        expect(scheme.templates.map((x) => x.id)).toEqual(['a']);
        expect(issues.map((i) => i.path)).toEqual(['templates[1].id', 'templates[2].id']);
    });

    it('a missing name defaults to the id', () => {
        const { scheme, issues } = validateBlockScheme({ ...base, templates: [{ id: 't', pattern: ['C1'], slots: [fullSlot('C1')] }] });
        expect(scheme.templates[0].name).toBe('t');
        expect(issues.map((i) => i.path)).toEqual(['templates[0].name']);
    });

    it('slots must match the pattern exactly: a missing slot is synthesized full-square', () => {
        const { scheme, issues } = validateBlockScheme({ ...base, templates: [{ id: 't', name: 't', pattern: ['C1', 'V'], slots: [fullSlot('C1', { w: 0.5 })] }] });
        expect(scheme.templates[0].slots).toEqual([fullSlot('C1', { w: 0.5 }), fullSlot('V')]);
        expect(issues.map((i) => i.path)).toEqual(['templates[0].slots']);
    });

    it('slots must match the pattern exactly: extra and duplicate slots are dropped', () => {
        const { scheme, issues } = validateBlockScheme({
            ...base,
            templates: [{ id: 't', name: 't', pattern: ['C1'], slots: [fullSlot('C1'), fullSlot('C1', { x: 0.5, w: 0.5 }), fullSlot('V'), 'nope'] }],
        });
        expect(scheme.templates[0].slots).toEqual([fullSlot('C1')]);
        expect(issues.map((i) => i.path)).toEqual(['templates[0].slots[1].roleId', 'templates[0].slots[2].roleId', 'templates[0].slots[3]']);
    });

    it('slot order is irrelevant and preserved', () => {
        const { scheme, issues } = validateBlockScheme({ ...base, templates: [{ id: 't', name: 't', pattern: ['C1', 'V'], slots: [fullSlot('V'), fullSlot('C1')] }] });
        expect(issues).toEqual([]);
        expect(scheme.templates[0].slots.map((s) => s.roleId)).toEqual(['V', 'C1']);
    });

    it('slots not an array → every role gets a synthesized slot', () => {
        const { scheme, issues } = validateBlockScheme({ ...base, templates: [{ id: 't', name: 't', pattern: ['C1', 'V'], slots: null }] });
        expect(scheme.templates[0].slots).toEqual([fullSlot('C1'), fullSlot('V')]);
        expect(issues.map((i) => i.path)).toEqual(['templates[0].slots', 'templates[0].slots', 'templates[0].slots']);
    });
});

describe('slot geometry', () => {
    function slotOf(slot: Record<string, unknown>) {
        const result = validateBlockScheme({ roles: [C], templates: [{ id: 't', name: 't', pattern: ['C1'], slots: [{ roleId: 'C1', groupId: null, ...slot }] }] });
        return { slot: result.scheme.templates[0].slots[0], issues: result.issues.map((i) => i.path) };
    }

    it('in-range rectangles pass untouched', () => {
        expect(slotOf({ x: 0.25, y: 0.1, w: 0.75, h: 0.9 })).toEqual({ slot: { roleId: 'C1', groupId: null, x: 0.25, y: 0.1, w: 0.75, h: 0.9 }, issues: [] });
    });

    it('negative origin is clamped to 0', () => {
        const { slot, issues } = slotOf({ x: -0.5, y: -1, w: 0.5, h: 0.5 });
        expect([slot.x, slot.y]).toEqual([0, 0]);
        expect(issues).toEqual(['templates[0].slots[0].x', 'templates[0].slots[0].y']);
    });

    it('x + w > 1 clamps w (the rectangle is kept, not dropped)', () => {
        const { slot, issues } = slotOf({ x: 0.5, y: 0, w: 0.8, h: 1 });
        expect(slot.w).toBe(0.5);
        expect(issues).toEqual(['templates[0].slots[0].w']);
    });

    it('y + h > 1 clamps h', () => {
        const { slot } = slotOf({ x: 0, y: 0.75, w: 1, h: 0.5 });
        expect(slot.h).toBe(0.25);
    });

    it('w, h must be > 0 — non-positive sizes are lifted to MIN_SLOT_SIZE', () => {
        const { slot, issues } = slotOf({ x: 0, y: 0, w: 0, h: -2 });
        expect([slot.w, slot.h]).toEqual([MIN_SLOT_SIZE, MIN_SLOT_SIZE]);
        expect(issues).toEqual(['templates[0].slots[0].w', 'templates[0].slots[0].h']);
    });

    it('an origin at 1 is pulled in so the rectangle still has room', () => {
        const { slot } = slotOf({ x: 1, y: 1, w: 0.5, h: 0.5 });
        expect(slot.x).toBe(1 - MIN_SLOT_SIZE);
        expect(slot.x + slot.w).toBeLessThanOrEqual(1);
        expect(slot.w).toBeCloseTo(MIN_SLOT_SIZE);
    });

    it('non-numbers default (origin 0, size = the remaining room)', () => {
        const { slot, issues } = slotOf({ x: 'a', y: NaN, w: undefined, h: Infinity });
        expect(slot).toMatchObject({ x: 0, y: 0, w: 1, h: 1 });
        expect(issues).toHaveLength(4);
    });

    it('overlapping rectangles are allowed — no issue', () => {
        const result = validateBlockScheme({
            roles: [C, V],
            templates: [{ id: 't', name: 't', pattern: ['C1', 'V'], slots: [fullSlot('C1'), fullSlot('V', { x: 0.25, y: 0.25, w: 0.5, h: 0.5 })] }],
        });
        expect(result.issues).toEqual([]);
    });

    it.each([
        [5, 5, []],
        [null, null, []],
        [undefined, null, []],
        [0, null, ['templates[0].slots[0].groupId']],
        [-3, null, ['templates[0].slots[0].groupId']],
        [1.5, null, ['templates[0].slots[0].groupId']],
        ['2', null, ['templates[0].slots[0].groupId']],
    ])('groupId %j → %j', (groupId, expected, expectedIssues) => {
        const { slot, issues } = slotOf({ x: 0, y: 0, w: 1, h: 1, groupId });
        expect(slot.groupId).toBe(expected);
        expect(issues).toEqual(expectedIssues);
    });
});

// =============================================================================
// SYLLABLE_BLOCKS_PLAN.md §2 — slot counts, split, leftovers, reserved id
// =============================================================================

describe('old documents are untouched by the new fields (P1 / N1)', () => {
    it('a pre-counts document validates to EXACTLY the same object — no new keys', () => {
        const doc = {
            version: 1,
            enabled: true,
            roles: [C, V],
            templates: [{ id: 't', name: 'CV', pattern: ['C1', 'V'], slots: [fullSlot('C1', { w: 0.5 }), fullSlot('V', { x: 0.5, w: 0.5 })] }],
        };
        const { scheme, issues } = validateBlockScheme(doc);
        expect(issues).toEqual([]);
        expect(scheme).toStrictEqual(doc);
        expect(Object.keys(scheme)).toEqual(['version', 'enabled', 'roles', 'templates']);
        expect(Object.keys(scheme.templates[0].slots[0])).toEqual(['roleId', 'groupId', 'x', 'y', 'w', 'h']);
    });
});

describe('slot counts', () => {
    const withSlot = (extra: Record<string, unknown>) => ({
        roles: [C],
        templates: [{ id: 't', name: 't', pattern: ['C1'], slots: [fullSlot('C1', extra)] }],
    });
    const slotOf = (extra: Record<string, unknown>) => validateBlockScheme(withSlot(extra));

    it('non-default counts round-trip with no issue', () => {
        const { scheme, issues } = slotOf({ min: 0, max: 3, arrange: 'column' });
        expect(issues).toEqual([]);
        expect(scheme.templates[0].slots[0]).toStrictEqual(fullSlot('C1', { min: 0, max: 3, arrange: 'column' }));
    });

    it('explicit defaults are normalised away silently (N1): min 1, max 1, arrange row', () => {
        const { scheme, issues } = slotOf({ min: 1, max: 1, arrange: 'row' });
        expect(issues).toEqual([]);
        expect(scheme.templates[0].slots[0]).toStrictEqual(fullSlot('C1'));
    });

    it('max = 4 is the cap and passes', () => {
        expect(slotOf({ max: 4 }).scheme.templates[0].slots[0].max).toBe(4);
        expect(MAX_SLOT_COUNT).toBe(4);
    });

    it('an out-of-range integer max is clamped with an issue', () => {
        const high = slotOf({ max: 9 });
        expect(high.scheme.templates[0].slots[0].max).toBe(4);
        expect(high.issues.map((i) => i.path)).toEqual(['templates[0].slots[0].max']);
        const low = slotOf({ max: 0 });
        expect(low.scheme.templates[0].slots[0]).not.toHaveProperty('max');
        expect(low.issues.map((i) => i.path)).toEqual(['templates[0].slots[0].max']);
    });

    it('an out-of-range integer min is clamped with an issue', () => {
        const high = slotOf({ min: 2 });
        expect(high.scheme.templates[0].slots[0]).not.toHaveProperty('min');
        expect(high.issues.map((i) => i.path)).toEqual(['templates[0].slots[0].min']);
        const low = slotOf({ min: -1 });
        expect(low.scheme.templates[0].slots[0].min).toBe(0);
        expect(low.issues.map((i) => i.path)).toEqual(['templates[0].slots[0].min']);
    });

    it.each([0.5, '2', null, Number.NaN])('a non-integer count %j defaults with an issue', (bad) => {
        const { scheme, issues } = slotOf({ min: bad, max: bad });
        expect(scheme.templates[0].slots[0]).toStrictEqual(fullSlot('C1'));
        expect(issues.map((i) => i.path)).toEqual(['templates[0].slots[0].min', 'templates[0].slots[0].max']);
    });

    it('an unknown arrange defaults to row with an issue', () => {
        const { scheme, issues } = slotOf({ arrange: 'diagonal' });
        expect(scheme.templates[0].slots[0]).not.toHaveProperty('arrange');
        expect(issues.map((i) => i.path)).toEqual(['templates[0].slots[0].arrange']);
    });
});

describe('slot placement — pin + fill (BLOCK_PLACEMENT_PLAN.md §2)', () => {
    const withSlot = (extra: Record<string, unknown>) => ({
        roles: [C],
        templates: [{ id: 't', name: 't', pattern: ['C1'], slots: [fullSlot('C1', extra)] }],
    });
    const slotOf = (extra: Record<string, unknown>) => validateBlockScheme(withSlot(extra));

    it('SLOT_PINS is the nine positions; SLOT_FILLS is fit/fill', () => {
        expect(SLOT_PINS).toEqual(['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right']);
        expect(SLOT_FILLS).toEqual(['fit', 'fill']);
    });

    it('non-default pin + fill round-trip with no issue', () => {
        const { scheme, issues } = slotOf({ pin: 'bottom-right', fill: 'fill' });
        expect(issues).toEqual([]);
        expect(scheme.templates[0].slots[0]).toStrictEqual(fullSlot('C1', { pin: 'bottom-right', fill: 'fill' }));
    });

    it("explicit defaults are normalised away silently (N1): pin 'center', fill 'fit'", () => {
        const { scheme, issues } = slotOf({ pin: 'center', fill: 'fit' });
        expect(issues).toEqual([]);
        expect(scheme.templates[0].slots[0]).toStrictEqual(fullSlot('C1'));
        expect(scheme.templates[0].slots[0]).not.toHaveProperty('pin');
        expect(scheme.templates[0].slots[0]).not.toHaveProperty('fill');
    });

    it('every one of the nine pins is accepted (center normalised away)', () => {
        for (const pin of SLOT_PINS) {
            const slot = slotOf({ pin }).scheme.templates[0].slots[0];
            if (pin === 'center') expect(slot).not.toHaveProperty('pin');
            else expect(slot.pin).toBe(pin);
        }
    });

    it('a bad pin defaults to center with an issue', () => {
        const { scheme, issues } = slotOf({ pin: 'middle' });
        expect(scheme.templates[0].slots[0]).not.toHaveProperty('pin');
        expect(issues.map((i) => i.path)).toEqual(['templates[0].slots[0].pin']);
    });

    it('a bad fill defaults to fit with an issue', () => {
        const { scheme, issues } = slotOf({ fill: 'stretch' });
        expect(scheme.templates[0].slots[0]).not.toHaveProperty('fill');
        expect(issues.map((i) => i.path)).toEqual(['templates[0].slots[0].fill']);
    });
});

describe('split', () => {
    const base = { roles: [], templates: [] };

    it('valid modes pass; sibilantClusters is kept only when true (N1)', () => {
        expect(validateBlockScheme({ ...base, split: { mode: 'syllables', sibilantClusters: true } })).toEqual({
            scheme: { ...cloneEmptyBlockScheme(), split: { mode: 'syllables', sibilantClusters: true } },
            issues: [],
        });
        const off = validateBlockScheme({ ...base, split: { mode: 'templates', sibilantClusters: false } });
        expect(off.issues).toEqual([]);
        expect(off.scheme.split).toStrictEqual({ mode: 'templates' });
    });

    it('an unknown mode drops the whole split', () => {
        const { scheme, issues } = validateBlockScheme({ split: { mode: 'words', sibilantClusters: true } });
        expect(scheme).not.toHaveProperty('split');
        expect(issues.map((i) => i.path)).toEqual(['split.mode']);
    });

    it('a non-object split is dropped', () => {
        const { scheme, issues } = validateBlockScheme({ split: 'syllables' });
        expect(scheme).not.toHaveProperty('split');
        expect(issues.map((i) => i.path)).toEqual(['split']);
    });

    it('a non-boolean sibilantClusters is dropped; the split survives', () => {
        const { scheme, issues } = validateBlockScheme({ split: { mode: 'syllables', sibilantClusters: 'yes' } });
        expect(scheme.split).toStrictEqual({ mode: 'syllables' });
        expect(issues.map((i) => i.path)).toEqual(['split.sibilantClusters']);
    });

    it('unknown keys are reported', () => {
        const { scheme, issues } = validateBlockScheme({ split: { mode: 'syllables', greedy: true } });
        expect(scheme.split).toStrictEqual({ mode: 'syllables' });
        expect(issues.map((i) => i.path)).toEqual(['split.greedy']);
    });
});

describe('split.diphthongs (DIPHTHONG_BLOCKS_PLAN.md §2)', () => {
    const splitOf = (diphthongs: unknown) => validateBlockScheme({ split: { mode: 'syllables', diphthongs } });

    it('a clean list passes unchanged with no issues', () => {
        const { scheme, issues } = splitOf(['ai', 'au', 'iə']);
        expect(issues).toEqual([]);
        expect(scheme.split).toStrictEqual({ mode: 'syllables', diphthongs: ['ai', 'au', 'iə'] });
    });

    it('an empty list is emitted as absent (N1)', () => {
        const { scheme, issues } = splitOf([]);
        expect(issues).toEqual([]);
        expect(scheme.split).toStrictEqual({ mode: 'syllables' });
    });

    it('trims and NFC-normalises each entry', () => {
        const { scheme, issues } = splitOf(['  ai ', 'éi']);
        expect(issues).toEqual([]);
        expect(scheme.split?.diphthongs).toEqual(['ai', 'éi']);
    });

    it('duplicates (after normalising) keep the first and report the rest', () => {
        const { scheme, issues } = splitOf(['ai', ' ai', 'éi', 'éi']);
        expect(scheme.split?.diphthongs).toEqual(['ai', 'éi']);
        expect(issues.map((i) => i.path)).toEqual(['split.diphthongs[1]', 'split.diphthongs[3]']);
    });

    it('non-string, empty and too-long entries are dropped one by one; the split survives', () => {
        const { scheme, issues } = splitOf(['ai', 3, null, '', '   ', 'aaaaaaaaa', 'aaaaaaaa', 'au']);
        expect(scheme.split).toStrictEqual({ mode: 'syllables', diphthongs: ['ai', 'aaaaaaaa', 'au'] });
        expect(issues.map((i) => i.path)).toEqual([
            'split.diphthongs[1]',
            'split.diphthongs[2]',
            'split.diphthongs[3]',
            'split.diphthongs[4]',
            'split.diphthongs[5]',
        ]);
    });

    it('the 8-character cap counts code points, not UTF-16 units', () => {
        // 8 astral code points = 16 UTF-16 units — still allowed.
        const astral = '\u{1F600}'.repeat(8);
        expect(splitOf([astral]).scheme.split?.diphthongs).toEqual([astral]);
    });

    it(`keeps at most ${MAX_DIPHTHONGS} entries`, () => {
        const many = Array.from({ length: MAX_DIPHTHONGS + 3 }, (_, k) => `a${k}`);
        const { scheme, issues } = splitOf(many);
        expect(scheme.split?.diphthongs).toEqual(many.slice(0, MAX_DIPHTHONGS));
        expect(issues.map((i) => i.path)).toEqual([32, 33, 34].map((k) => `split.diphthongs[${k}]`));
    });

    it('a non-array is dropped with an issue; the rest of split is kept', () => {
        const { scheme, issues } = validateBlockScheme({ split: { mode: 'syllables', sibilantClusters: true, diphthongs: 'ai' } });
        expect(scheme.split).toStrictEqual({ mode: 'syllables', sibilantClusters: true });
        expect(issues.map((i) => i.path)).toEqual(['split.diphthongs']);
    });

    it('is structural only: a consonant entry is kept', () => {
        expect(splitOf(['st']).scheme.split?.diphthongs).toEqual(['st']);
    });

    it('normalizeDiphthongs gives exactly the validated list (one source of truth for N1)', () => {
        const inputs: unknown[][] = [
            [],
            ['ai'],
            ['  ai ', 'éi', 'ai', '', 3, 'aaaaaaaaa'],
            Array.from({ length: 40 }, (_, k) => `i${k}`),
            Array.from({ length: 40 }, (_, k) => (k % 2 ? 'ai' : `u${k}`)),
        ];
        for (const input of inputs) {
            expect(normalizeDiphthongs(input)).toEqual(splitOf(input).scheme.split?.diphthongs ?? []);
        }
    });
});

describe('leftovers', () => {
    it.each(['below', 'above', 'after', 'before'])('placement %s passes', (placement) => {
        const { scheme, issues } = validateBlockScheme({ leftovers: { markGraphemeId: 12, placement } });
        expect(issues).toEqual([]);
        expect(scheme.leftovers).toStrictEqual({ markGraphemeId: 12, placement });
    });

    it.each([0, -3, 1.5, '12', null])('markGraphemeId %j drops leftovers', (markGraphemeId) => {
        const { scheme, issues } = validateBlockScheme({ leftovers: { markGraphemeId, placement: 'below' } });
        expect(scheme).not.toHaveProperty('leftovers');
        expect(issues.map((i) => i.path)).toEqual(['leftovers.markGraphemeId']);
    });

    it('an unknown placement drops leftovers', () => {
        const { scheme, issues } = validateBlockScheme({ leftovers: { markGraphemeId: 12, placement: 'left' } });
        expect(scheme).not.toHaveProperty('leftovers');
        expect(issues.map((i) => i.path)).toEqual(['leftovers.placement']);
    });

    it('a non-object leftovers is dropped', () => {
        const { scheme, issues } = validateBlockScheme({ leftovers: 12 });
        expect(scheme).not.toHaveProperty('leftovers');
        expect(issues.map((i) => i.path)).toEqual(['leftovers']);
    });

    it('unknown keys are reported; the valid rest is kept', () => {
        const { scheme, issues } = validateBlockScheme({ leftovers: { markGraphemeId: 12, placement: 'after', size: 0.3 } });
        expect(scheme.leftovers).toStrictEqual({ markGraphemeId: 12, placement: 'after' });
        expect(issues.map((i) => i.path)).toEqual(['leftovers.size']);
    });
});

describe('reserved template id', () => {
    it(`a template with id "${LONE_CONSONANT_TEMPLATE_ID}" is dropped`, () => {
        const { scheme, issues } = validateBlockScheme({
            roles: [C],
            templates: [
                { id: LONE_CONSONANT_TEMPLATE_ID, name: 'x', pattern: ['C1'], slots: [fullSlot('C1')] },
                { id: 'ok', name: 'ok', pattern: ['C1'], slots: [fullSlot('C1')] },
            ],
        });
        expect(scheme.templates.map((t) => t.id)).toEqual(['ok']);
        expect(issues).toHaveLength(1);
        expect(issues[0].path).toBe('templates[0].id');
        expect(issues[0].message).toMatch(/reserved/);
    });
});

describe('split.syllabicConsonants (CONLANG_EDGES_PLAN.md §2)', () => {
    const splitOf = (syllabicConsonants: unknown) => validateBlockScheme({ split: { mode: 'syllables', syllabicConsonants } });

    it('a clean list passes unchanged with no issues', () => {
        const { scheme, issues } = splitOf(['r', 'l', 'm', 'n']);
        expect(issues).toEqual([]);
        expect(scheme.split).toStrictEqual({ mode: 'syllables', syllabicConsonants: ['r', 'l', 'm', 'n'] });
    });

    it('an empty list is emitted as absent (N1), and so is an absent one', () => {
        expect(splitOf([]).scheme.split).toStrictEqual({ mode: 'syllables' });
        expect(splitOf([]).issues).toEqual([]);
        expect(validateBlockScheme({ split: { mode: 'syllables' } }).scheme.split).toStrictEqual({ mode: 'syllables' });
    });

    it('a list of only bad entries is emitted as absent too', () => {
        const { scheme, issues } = splitOf(['', 3, '  ']);
        expect(scheme.split).toStrictEqual({ mode: 'syllables' });
        expect(issues.map((i) => i.path)).toEqual(['split.syllabicConsonants[0]', 'split.syllabicConsonants[1]', 'split.syllabicConsonants[2]']);
    });

    it('per-entry issues: non-string, empty, too long, duplicate, over the cap', () => {
        const { scheme, issues } = splitOf(['r', 3, '', 'aaaaaaaaa', ' r', 'l']);
        expect(scheme.split?.syllabicConsonants).toEqual(['r', 'l']);
        expect(issues.map((i) => i.path)).toEqual([
            'split.syllabicConsonants[1]',
            'split.syllabicConsonants[2]',
            'split.syllabicConsonants[3]',
            'split.syllabicConsonants[4]',
        ]);
        const many = Array.from({ length: MAX_SOUND_LIST + 2 }, (_, k) => `n${k}`);
        const capped = splitOf(many);
        expect(capped.scheme.split?.syllabicConsonants).toEqual(many.slice(0, MAX_SOUND_LIST));
        expect(capped.issues.map((i) => i.path)).toEqual([32, 33].map((k) => `split.syllabicConsonants[${k}]`));
    });

    it('trims + NFC-normalises; the syllabic mark survives', () => {
        const syllabicR = 'r̩';
        expect(splitOf([' r ', syllabicR]).scheme.split?.syllabicConsonants).toEqual(['r', syllabicR]);
    });

    it('a non-array is dropped with an issue; the rest of split is kept', () => {
        const { scheme, issues } = validateBlockScheme({ split: { mode: 'syllables', diphthongs: ['ai'], syllabicConsonants: 'r' } });
        expect(scheme.split).toStrictEqual({ mode: 'syllables', diphthongs: ['ai'] });
        expect(issues).toEqual([{ path: 'split.syllabicConsonants', message: 'expected an array of strings (dropped)' }]);
    });

    it('is structural only: a vowel entry is kept (the designer warns)', () => {
        expect(splitOf(['a']).scheme.split?.syllabicConsonants).toEqual(['a']);
    });

    it('is not an unknown key, and both lists sit side by side', () => {
        const { scheme, issues } = validateBlockScheme({
            split: { mode: 'syllables', sibilantClusters: true, diphthongs: ['ai'], syllabicConsonants: ['r'] },
        });
        expect(issues).toEqual([]);
        expect(scheme.split).toStrictEqual({ mode: 'syllables', sibilantClusters: true, diphthongs: ['ai'], syllabicConsonants: ['r'] });
    });

    it('validateSoundList parity: the same input gives the same messages for both lists', () => {
        const input: unknown = ['ai', 3, '', 'aaaaaaaaa', 'ai', ...Array.from({ length: 34 }, (_, k) => `x${k}`)];
        const diph = validateBlockScheme({ split: { mode: 'syllables', diphthongs: input } });
        const syll = validateBlockScheme({ split: { mode: 'syllables', syllabicConsonants: input } });
        expect(syll.scheme.split?.syllabicConsonants).toEqual(diph.scheme.split?.diphthongs);
        expect(syll.issues).toEqual(diph.issues.map((i) => ({ ...i, path: i.path.replace('split.diphthongs', 'split.syllabicConsonants') })));
        const notArray = [validateBlockScheme({ split: { mode: 'syllables', diphthongs: 7 } }), validateBlockScheme({ split: { mode: 'syllables', syllabicConsonants: 7 } })];
        expect(notArray[1].issues.map((i) => i.message)).toEqual(notArray[0].issues.map((i) => i.message));
    });

    it('normalizeSoundList gives exactly the validated list; normalizeDiphthongs is the same function', () => {
        expect(normalizeDiphthongs).toBe(normalizeSoundList);
        const inputs: unknown[][] = [[], ['r'], ['  r ', 'l', 'r', '', 3, 'aaaaaaaaa'], Array.from({ length: 40 }, (_, k) => `m${k}`)];
        for (const input of inputs) {
            expect(normalizeSoundList(input)).toEqual(splitOf(input).scheme.split?.syllabicConsonants ?? []);
        }
    });

    it('the old constant names are aliases of the new ones', () => {
        expect(MAX_SOUND_LIST).toBe(32);
        expect(MAX_SOUND_LENGTH).toBe(8);
        expect(MAX_DIPHTHONGS).toBe(MAX_SOUND_LIST);
        expect(MAX_DIPHTHONG_LENGTH).toBe(MAX_SOUND_LENGTH);
    });
});
