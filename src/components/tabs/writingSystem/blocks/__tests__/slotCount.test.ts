/**
 * slotCount — the designer's slot-count presets (SYLLABLE_BLOCKS_PLAN §2, §4).
 *
 * Asserted: every preset round-trips through `setSlotCount` / `presetOf`; the
 * written slot is in the validator's normalised form (N1) — including the
 * arrangement being dropped when a box goes back to one sign — so a
 * validated copy is deep-equal; imported counts that match no preset read as
 * custom; the readout strings; inputs are never mutated.
 */

import { describe, it, expect } from 'vitest';

import { validateBlockScheme } from '../../../../../blocks';
import type { BlockScheme, BlockSlot, BlockTemplate } from '../../../../../blocks';
import {
    SLOT_COUNT_PRESETS,
    describeSlotCount,
    labelWithCount,
    presetOf,
    setSlotArrange,
    setSlotCount,
    slotCountOf,
} from '../slotCount';
import type { SlotCountPreset } from '../slotCount';

const slotOf = (roleId: string, extra: Partial<BlockSlot> = {}): BlockSlot => ({
    roleId,
    groupId: null,
    x: 0,
    y: 0,
    w: 0.5,
    h: 1,
    ...extra,
});

const TEMPLATE: BlockTemplate = {
    id: 'tpl-1',
    name: 'CVC',
    pattern: ['c1', 'v'],
    slots: [slotOf('c1'), slotOf('v', { x: 0.5 })],
};

/** The template as the validator would store it (its own normalised form). */
function validated(template: BlockTemplate): BlockTemplate {
    const scheme: BlockScheme = {
        version: 1,
        enabled: true,
        roles: [
            { id: 'c1', label: 'C1', matcher: { kind: 'class', letter: 'C' } },
            { id: 'v', label: 'V', matcher: { kind: 'class', letter: 'V' } },
        ],
        templates: [template],
    };
    return validateBlockScheme(scheme).scheme.templates[0];
}

const c1 = (template: BlockTemplate) => template.slots.find((s) => s.roleId === 'c1')!;

describe('SLOT_COUNT_PRESETS', () => {
    it('lists the four presets in plain words', () => {
        expect(SLOT_COUNT_PRESETS.map((p) => [p.id, p.label, p.min, p.max])).toEqual([
            ['one', 'Exactly one', 1, 1],
            ['optional', 'Optional (none or one)', 0, 1],
            ['oneToThree', 'One to three', 1, 3],
            ['upToThree', 'Up to three (or none)', 0, 3],
        ]);
    });
});

describe('slotCountOf / presetOf', () => {
    it('defaults an unset slot to exactly one, side by side', () => {
        expect(slotCountOf(slotOf('c1'))).toEqual({ min: 1, max: 1, arrange: 'row' });
        expect(slotCountOf(undefined)).toEqual({ min: 1, max: 1, arrange: 'row' });
        expect(presetOf(slotOf('c1'))).toBe('one');
        expect(presetOf(undefined)).toBe('one');
    });

    it('reads a custom (imported) count as no preset', () => {
        expect(presetOf(slotOf('c1', { max: 2 }))).toBeNull();
        expect(presetOf(slotOf('c1', { min: 0, max: 4 }))).toBeNull();
        expect(presetOf(slotOf('c1', { min: 0, max: 2 }))).toBeNull();
        expect(slotCountOf(slotOf('c1', { min: 0, max: 4, arrange: 'column' }))).toEqual({
            min: 0,
            max: 4,
            arrange: 'column',
        });
    });
});

describe('setSlotCount', () => {
    it.each(SLOT_COUNT_PRESETS.map((p) => p.id))('round-trips %s in normalised form', (preset: SlotCountPreset) => {
        const next = setSlotCount(TEMPLATE, 'c1', preset);
        expect(presetOf(c1(next))).toBe(preset);
        expect(validated(next)).toEqual(next);
        // The other slot is untouched (same object).
        expect(next.slots[1]).toBe(TEMPLATE.slots[1]);
    });

    it('omits min when 1 and max when 1', () => {
        expect(c1(setSlotCount(TEMPLATE, 'c1', 'one'))).toEqual(slotOf('c1'));
        expect(c1(setSlotCount(TEMPLATE, 'c1', 'optional'))).toEqual(slotOf('c1', { min: 0 }));
        expect(c1(setSlotCount(TEMPLATE, 'c1', 'oneToThree'))).toEqual(slotOf('c1', { max: 3 }));
        expect(c1(setSlotCount(TEMPLATE, 'c1', 'upToThree'))).toEqual(slotOf('c1', { min: 0, max: 3 }));
        const back = setSlotCount(setSlotCount(TEMPLATE, 'c1', 'upToThree'), 'c1', 'one');
        expect(Object.keys(c1(back)).sort()).toEqual(['groupId', 'h', 'roleId', 'w', 'x', 'y']);
    });

    it('keeps "stacked" while several signs fit, drops it when back to one', () => {
        const stacked = setSlotArrange(setSlotCount(TEMPLATE, 'c1', 'upToThree'), 'c1', 'column');
        expect(c1(stacked).arrange).toBe('column');
        expect(c1(setSlotCount(stacked, 'c1', 'oneToThree')).arrange).toBe('column');
        const optional = setSlotCount(stacked, 'c1', 'optional');
        expect('arrange' in c1(optional)).toBe(false);
        expect(c1(optional)).toEqual(slotOf('c1', { min: 0 }));
        expect(validated(optional)).toEqual(optional);
    });

    it('replaces a custom count', () => {
        const custom: BlockTemplate = { ...TEMPLATE, slots: [slotOf('c1', { max: 4 }), TEMPLATE.slots[1]] };
        expect(c1(setSlotCount(custom, 'c1', 'oneToThree'))).toEqual(slotOf('c1', { max: 3 }));
    });

    it('leaves the template alone for a role with no slot', () => {
        expect(setSlotCount(TEMPLATE, 'nope', 'upToThree')).toBe(TEMPLATE);
        expect(setSlotArrange(TEMPLATE, 'nope', 'column')).toBe(TEMPLATE);
    });

    it('never mutates its input', () => {
        const input: BlockTemplate = structuredClone({
            ...TEMPLATE,
            slots: [slotOf('c1', { min: 0, max: 3, arrange: 'column' }), TEMPLATE.slots[1]],
        });
        const frozen = structuredClone(input);
        setSlotCount(input, 'c1', 'one');
        setSlotArrange(input, 'c1', 'row');
        setSlotCount(input, 'c1', 'oneToThree');
        expect(input).toEqual(frozen);
    });
});

describe('setSlotArrange', () => {
    it('stores stacked as column and side by side as absent', () => {
        const many = setSlotCount(TEMPLATE, 'c1', 'oneToThree');
        const stacked = setSlotArrange(many, 'c1', 'column');
        expect(c1(stacked)).toEqual(slotOf('c1', { max: 3, arrange: 'column' }));
        expect(validated(stacked)).toEqual(stacked);
        const row = setSlotArrange(stacked, 'c1', 'row');
        expect(c1(row)).toEqual(slotOf('c1', { max: 3 }));
        expect('arrange' in c1(row)).toBe(false);
    });
});

describe('describeSlotCount / labelWithCount', () => {
    it('reads presets and custom counts in plain words', () => {
        expect(describeSlotCount(slotOf('c1'))).toBe('');
        expect(describeSlotCount(undefined)).toBe('');
        expect(describeSlotCount(slotOf('c1', { min: 0 }))).toBe('optional');
        expect(describeSlotCount(slotOf('c1', { max: 3 }))).toBe('1–3');
        expect(describeSlotCount(slotOf('c1', { min: 0, max: 3 }))).toBe('up to 3');
        expect(describeSlotCount(slotOf('c1', { min: 0, max: 2 }))).toBe('0–2');
        expect(describeSlotCount(slotOf('c1', { max: 4 }))).toBe('1–4');
    });

    it('adds the count in parentheses only when it is not exactly one', () => {
        expect(labelWithCount('C2', slotOf('c2'))).toBe('C2');
        expect(labelWithCount('C2', slotOf('c2', { min: 0 }))).toBe('C2 (optional)');
        expect(labelWithCount('C1', slotOf('c1', { min: 0, max: 3 }))).toBe('C1 (up to 3)');
    });
});
