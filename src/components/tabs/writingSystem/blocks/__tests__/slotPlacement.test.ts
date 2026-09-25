/**
 * slotPlacement — the designer's pin (where the sign sits) and fill (how it
 * fits) writers (BLOCK_PLACEMENT_PLAN.md §2, §4).
 *
 * Asserted: the labels; `slotPlacementOf` fills the defaults (`center` / `fit`);
 * every pin and both fills round-trip through `setSlotPin` / `setSlotFill`; the
 * written slot is in the validator's normalised form (N1) — the default value
 * DELETES the key — so a validated copy is deep-equal (no phantom "Unsaved
 * changes"); a role with no slot is left alone; inputs are never mutated.
 */

import { describe, it, expect } from 'vitest';

import { SLOT_FILLS, SLOT_PINS, validateBlockScheme } from '../../../../../blocks';
import type { BlockScheme, BlockSlot, BlockTemplate, SlotFill, SlotPin } from '../../../../../blocks';
import { SLOT_FILL_LABELS, SLOT_PIN_LABELS, setSlotFill, setSlotPin, slotPlacementOf } from '../slotPlacement';

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

describe('SLOT_PIN_LABELS / SLOT_FILL_LABELS', () => {
    it('names every pin and both fills in plain words', () => {
        expect(SLOT_PINS.map((pin) => SLOT_PIN_LABELS[pin])).toEqual([
            'Top left', 'Top', 'Top right',
            'Left', 'Centre', 'Right',
            'Bottom left', 'Bottom', 'Bottom right',
        ]);
        expect(SLOT_FILLS.map((fill) => SLOT_FILL_LABELS[fill])).toEqual([
            'Fit inside the box',
            'Fill the box (may overflow)',
        ]);
    });
});

describe('slotPlacementOf', () => {
    it('defaults an unset slot to centre / fit', () => {
        expect(slotPlacementOf(slotOf('c1'))).toEqual({ pin: 'center', fill: 'fit' });
        expect(slotPlacementOf(undefined)).toEqual({ pin: 'center', fill: 'fit' });
    });

    it('reads a stored pin and fill', () => {
        expect(slotPlacementOf(slotOf('c1', { pin: 'bottom-left', fill: 'fill' }))).toEqual({
            pin: 'bottom-left',
            fill: 'fill',
        });
    });
});

describe('setSlotPin', () => {
    it.each(SLOT_PINS)('round-trips %s in normalised form', (pin: SlotPin) => {
        const next = setSlotPin(TEMPLATE, 'c1', pin);
        expect(slotPlacementOf(c1(next)).pin).toBe(pin);
        // N1: 'center' is stored as absent; every other pin is written.
        expect('pin' in c1(next)).toBe(pin !== 'center');
        expect(validated(next)).toEqual(next);
        // The other slot is untouched (same object).
        expect(next.slots[1]).toBe(TEMPLATE.slots[1]);
    });

    it('deletes the key when set back to centre', () => {
        const pinned = setSlotPin(TEMPLATE, 'c1', 'top-right');
        expect(c1(pinned).pin).toBe('top-right');
        const centred = setSlotPin(pinned, 'c1', 'center');
        expect('pin' in c1(centred)).toBe(false);
        expect(c1(centred)).toEqual(slotOf('c1'));
        expect(validated(centred)).toEqual(centred);
    });

    it('leaves the template alone for a role with no slot', () => {
        expect(setSlotPin(TEMPLATE, 'nope', 'top')).toBe(TEMPLATE);
    });
});

describe('setSlotFill', () => {
    it.each(SLOT_FILLS)('round-trips %s in normalised form', (fill: SlotFill) => {
        const next = setSlotFill(TEMPLATE, 'c1', fill);
        expect(slotPlacementOf(c1(next)).fill).toBe(fill);
        // N1: 'fit' is stored as absent; only 'fill' is written.
        expect('fill' in c1(next)).toBe(fill === 'fill');
        expect(validated(next)).toEqual(next);
        expect(next.slots[1]).toBe(TEMPLATE.slots[1]);
    });

    it('deletes the key when set back to fit', () => {
        const filled = setSlotFill(TEMPLATE, 'c1', 'fill');
        expect(c1(filled).fill).toBe('fill');
        const fitted = setSlotFill(filled, 'c1', 'fit');
        expect('fill' in c1(fitted)).toBe(false);
        expect(c1(fitted)).toEqual(slotOf('c1'));
    });

    it('leaves the template alone for a role with no slot', () => {
        expect(setSlotFill(TEMPLATE, 'nope', 'fill')).toBe(TEMPLATE);
    });
});

describe('pin and fill are independent', () => {
    it('keeps both when set together and clears them independently', () => {
        const both = setSlotFill(setSlotPin(TEMPLATE, 'c1', 'bottom'), 'c1', 'fill');
        expect(c1(both)).toEqual(slotOf('c1', { pin: 'bottom', fill: 'fill' }));
        expect(validated(both)).toEqual(both);

        const noPin = setSlotPin(both, 'c1', 'center');
        expect(c1(noPin)).toEqual(slotOf('c1', { fill: 'fill' }));
    });

    it('never mutates its input', () => {
        const input: BlockTemplate = structuredClone({
            ...TEMPLATE,
            slots: [slotOf('c1', { pin: 'top-left', fill: 'fill' }), TEMPLATE.slots[1]],
        });
        const frozen = structuredClone(input);
        setSlotPin(input, 'c1', 'center');
        setSlotFill(input, 'c1', 'fit');
        setSlotPin(input, 'c1', 'right');
        expect(input).toEqual(frozen);
    });
});
