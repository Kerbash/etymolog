/**
 * computeCanvasBlocks / describeBlockSlots — the canvas' block popover model
 * (SYLLABLE_BLOCKS_PLAN.md Phase B): one row per ENTRY, labelled by the role
 * it fills, however many signs a slot holds.
 */

import { describe, expect, it } from 'vitest';

import type { BlockScheme } from '../../../../../blocks';
import { A, HEAD_GROUP, K, T, cvcScheme, gEntry, glyph, grapheme, mapOf } from '../../../../display/spelling/__tests__/blockFixtures';
import { computeCanvasBlocks, describeBlockSlots } from '../utils/blockUtils';

const MAP = mapOf(K, A, T);
const GROUPS = new Map([[HEAD_GROUP, 'head']]);

/** cvcScheme's CVC template with an onset of 0–3 signs and an optional coda. */
function countedScheme(): BlockScheme {
    const base = cvcScheme();
    const [cvc] = base.templates;
    return {
        ...base,
        templates: [{
            ...cvc,
            slots: cvc.slots.map((slot) => (slot.roleId === 'V' ? slot : { ...slot, min: 0 as const, max: 3 as const })),
        }],
    };
}

function rows(scheme: BlockScheme, ...graphemes: (typeof K)[]) {
    const entries = graphemes.map((g, position) => gEntry(g, position));
    const [block] = computeCanvasBlocks(entries, scheme, MAP);
    return { block, slots: describeBlockSlots(block, entries, entries.map(() => null), MAP, GROUPS) };
}

describe('describeBlockSlots', () => {
    it('a role holding several signs gets one row per sign, numbered only when repeated', () => {
        // k t a t → C1 C1 V C2
        const { block, slots } = rows(countedScheme(), K, T, A, T);
        expect(block.roleIds).toEqual(['C1', 'C1', 'V', 'C2']);
        expect(slots.map((s) => [s.label, s.roleId, s.entryIndex, s.name])).toEqual([
            ['Onset', 'C1', 0, K.name],
            ['Onset (2)', 'C1', 1, T.name],
            ['Nucleus', 'V', 2, A.name],
            ['Coda', 'C2', 3, T.name],
        ]);
        // Every row still carries the slot's group: both onset signs draw "head".
        expect(slots[0].autoLabel).toBe('Auto (head)');
        expect(slots[1].autoLabel).toBe('Auto (head)');
    });

    it('an empty optional slot has no row', () => {
        const { slots } = rows(countedScheme(), A, T);
        expect(slots.map((s) => [s.label, s.entryIndex])).toEqual([['Nucleus', 0], ['Coda', 1]]);
    });

    it('a count-less template reads exactly as before: pattern order, plain role labels', () => {
        const { block, slots } = rows(cvcScheme(), K, A, T);
        expect(block).not.toHaveProperty('roleIds');
        expect(slots.map((s) => [s.label, s.roleLabel, s.roleId, s.entryIndex])).toEqual([
            ['Onset', 'Onset', 'C1', 0],
            ['Nucleus', 'Nucleus', 'V', 1],
            ['Coda', 'Coda', 'C2', 2],
        ]);
        // a has no head form but its slot asks for none; t's coda slot neither.
        expect(slots.every((s) => s.missingGroup === undefined)).toBe(true);
    });

    it('keeps the missing-group report per row', () => {
        // p has no "head" form; both onset rows ask for it.
        const P = grapheme({ id: 4, phoneme: 'p', glyphs: [glyph(41, 'p-default')] });
        const entries = [gEntry(P, 0), gEntry(P, 1), gEntry(A, 2)];
        const map = mapOf(P, A);
        const [block] = computeCanvasBlocks(entries, countedScheme(), map);
        const slots = describeBlockSlots(block, entries, [null, null, null], map, GROUPS);
        expect(slots.map((s) => [s.label, s.missingGroup])).toEqual([
            ['Onset', { name: 'head' }],
            ['Onset (2)', { name: 'head' }],
            ['Nucleus', undefined],
        ]);
    });
});
