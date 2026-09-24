/**
 * Slot counts — how many signs one template box holds (SYLLABLE_BLOCKS_PLAN
 * §2, §4 "Template editor (C2)").
 *
 * A `BlockSlot` stores its count as `min?` / `max?` / `arrange?`; the designer
 * never shows those numbers. It offers four PRESETS instead ("Exactly one",
 * "Optional (none or one)", "One to three", "Up to three (or none)"), and a
 * slot whose stored count matches none of them (an imported max of 2 or 4) is
 * a CUSTOM count the UI reports honestly instead of snapping it to a preset.
 *
 * Every writer here produces the validator's normalised form (pitfall N1):
 * `min` only when 0, `max` only when > 1, `arrange` only when `'column'` — and
 * `arrange` is dropped when the box goes back to holding one sign — so
 * `sameDocument(draft, saved)` never reports a phantom change after a save.
 * Readers default absent fields (pitfall P2: `min ?? 1`, `max ?? 1`).
 *
 * Pure; inputs are never mutated.
 *
 * @module writingSystem/blocks/slotCount
 */

import type { BlockSlot, BlockTemplate } from '../../../../blocks';

export type SlotCountPreset = 'one' | 'optional' | 'oneToThree' | 'upToThree';

export type SlotArrange = 'row' | 'column';

/** The count fields of a slot (a whole `BlockSlot` satisfies it). */
export type SlotCountFields = Pick<BlockSlot, 'min' | 'max' | 'arrange'>;

export interface SlotCountPresetInfo {
    id: SlotCountPreset;
    label: string;
    min: 0 | 1;
    max: 1 | 3;
}

/** The presets, in the order the "How many signs" select lists them. */
export const SLOT_COUNT_PRESETS: readonly SlotCountPresetInfo[] = [
    { id: 'one', label: 'Exactly one', min: 1, max: 1 },
    { id: 'optional', label: 'Optional (none or one)', min: 0, max: 1 },
    { id: 'oneToThree', label: 'One to three', min: 1, max: 3 },
    { id: 'upToThree', label: 'Up to three (or none)', min: 0, max: 3 },
];

/** Plain words for how several signs share a box. */
export const SLOT_ARRANGE_LABELS: Readonly<Record<SlotArrange, string>> = {
    row: 'Side by side',
    column: 'Stacked',
};

/** A slot's effective count, defaults filled in (1 / 1 / side by side). */
export function slotCountOf(slot: SlotCountFields | undefined): { min: 0 | 1; max: number; arrange: SlotArrange } {
    return {
        min: slot?.min === 0 ? 0 : 1,
        max: slot?.max ?? 1,
        arrange: slot?.arrange === 'column' ? 'column' : 'row',
    };
}

/** The preset a slot's count matches, or `null` for a custom count. */
export function presetOf(slot: SlotCountFields | undefined): SlotCountPreset | null {
    const { min, max } = slotCountOf(slot);
    return SLOT_COUNT_PRESETS.find((preset) => preset.min === min && preset.max === max)?.id ?? null;
}

function presetInfo(preset: SlotCountPreset): SlotCountPresetInfo {
    const info = SLOT_COUNT_PRESETS.find((p) => p.id === preset);
    if (!info) throw new Error(`unknown slot count preset "${preset}"`);
    return info;
}

/** `slot` with the count fields rewritten in normalised (N1) form. */
function withCount(slot: BlockSlot, min: 0 | 1, max: number, arrange: SlotArrange): BlockSlot {
    const { min: _min, max: _max, arrange: _arrange, ...rest } = slot;
    const next: BlockSlot = { ...rest };
    if (min === 0) next.min = 0;
    if (max > 1) {
        next.max = max as NonNullable<BlockSlot['max']>;
        if (arrange === 'column') next.arrange = 'column';
    }
    return next;
}

function mapSlot(template: BlockTemplate, roleId: string, update: (slot: BlockSlot) => BlockSlot): BlockTemplate {
    if (!template.slots.some((slot) => slot.roleId === roleId)) return template;
    return {
        ...template,
        slots: template.slots.map((slot) => (slot.roleId === roleId ? update(slot) : slot)),
    };
}

/**
 * Give `roleId`'s box a preset count. The arrangement is kept while the box
 * still holds several signs and dropped when it goes back to one. A role with
 * no slot leaves the template unchanged.
 */
export function setSlotCount(template: BlockTemplate, roleId: string, preset: SlotCountPreset): BlockTemplate {
    const { min, max } = presetInfo(preset);
    return mapSlot(template, roleId, (slot) => withCount(slot, min, max, slotCountOf(slot).arrange));
}

/** How several signs share `roleId`'s box (`'row'` is stored as absent). */
export function setSlotArrange(template: BlockTemplate, roleId: string, arrange: SlotArrange): BlockTemplate {
    return mapSlot(template, roleId, (slot) => {
        const { arrange: _arrange, ...rest } = slot;
        return arrange === 'column' ? { ...rest, arrange: 'column' } : rest;
    });
}

/**
 * A short readout of a count, for chips and the pattern line: `''` for
 * exactly one, `'optional'`, `'1–3'`, `'up to 3'`; any other count as a
 * range (`'0–2'`, `'1–4'`).
 */
export function describeSlotCount(slot: SlotCountFields | undefined): string {
    const { min, max } = slotCountOf(slot);
    switch (presetOf(slot)) {
        case 'one':
            return '';
        case 'optional':
            return 'optional';
        case 'oneToThree':
            return '1–3';
        case 'upToThree':
            return 'up to 3';
        default:
            return `${min}–${max}`;
    }
}

/** `label` plus the count in parentheses when it is not "exactly one": `C2 (optional)`. */
export function labelWithCount(label: string, slot: SlotCountFields | undefined): string {
    const count = describeSlotCount(slot);
    return count ? `${label} (${count})` : label;
}
