/**
 * Slot placement — where a sign sits in its template box and how it fits
 * (BLOCK_PLACEMENT_PLAN.md §1, §2, §4). The designer counterpart to the engine's
 * `SlotPin` / `SlotFill` (`src/blocks`), sitting beside `slotCount.ts`.
 *
 * A `BlockSlot` stores its placement as `pin?` (nine positions) and `fill?`
 * (`'fit'` / `'fill'`); the designer never shows those words raw. It offers a
 * 3×3 pin picker and a fit/fill select, and reads a slot's EFFECTIVE placement
 * (defaults filled in: `center` / `fit`) through `slotPlacementOf`.
 *
 * Every writer here produces the validator's normalised form (pitfall N1,
 * mirroring `withCount`): `pin` is written only when it is not `'center'`,
 * `fill` only when it is `'fill'` — so a default written by one side and dropped
 * by the validator never shows a phantom "Unsaved changes" (`blockSchemeDraft`
 * compares normalised schemes).
 *
 * Pure; inputs are never mutated.
 *
 * @module writingSystem/blocks/slotPlacement
 */

import type { BlockSlot, BlockTemplate, SlotFill, SlotPin } from '../../../../blocks';

/** Plain-word label for each of the nine pins (the picker's accessible names). */
export const SLOT_PIN_LABELS: Readonly<Record<SlotPin, string>> = {
    'top-left': 'Top left',
    top: 'Top',
    'top-right': 'Top right',
    left: 'Left',
    center: 'Centre',
    right: 'Right',
    'bottom-left': 'Bottom left',
    bottom: 'Bottom',
    'bottom-right': 'Bottom right',
};

/** Plain-word label for each fill mode (the select's options). */
export const SLOT_FILL_LABELS: Readonly<Record<SlotFill, string>> = {
    fit: 'Fit inside the box',
    fill: 'Fill the box (may overflow)',
};

/** A slot's effective placement, defaults filled in (`center` / `fit`). */
export function slotPlacementOf(slot: Pick<BlockSlot, 'pin' | 'fill'> | undefined): { pin: SlotPin; fill: SlotFill } {
    return {
        pin: slot?.pin ?? 'center',
        fill: slot?.fill === 'fill' ? 'fill' : 'fit',
    };
}

function mapSlot(template: BlockTemplate, roleId: string, update: (slot: BlockSlot) => BlockSlot): BlockTemplate {
    if (!template.slots.some((slot) => slot.roleId === roleId)) return template;
    return {
        ...template,
        slots: template.slots.map((slot) => (slot.roleId === roleId ? update(slot) : slot)),
    };
}

/**
 * Where `roleId`'s sign sits in its box. `'center'` is stored as absent (N1). A
 * role with no slot leaves the template unchanged.
 */
export function setSlotPin(template: BlockTemplate, roleId: string, pin: SlotPin): BlockTemplate {
    return mapSlot(template, roleId, (slot) => {
        const { pin: _pin, ...rest } = slot;
        return pin === 'center' ? rest : { ...rest, pin };
    });
}

/**
 * How `roleId`'s sign fits its box. `'fit'` is stored as absent (N1). A role
 * with no slot leaves the template unchanged.
 */
export function setSlotFill(template: BlockTemplate, roleId: string, fill: SlotFill): BlockTemplate {
    return mapSlot(template, roleId, (slot) => {
        const { fill: _fill, ...rest } = slot;
        return fill === 'fill' ? { ...rest, fill } : rest;
    });
}
