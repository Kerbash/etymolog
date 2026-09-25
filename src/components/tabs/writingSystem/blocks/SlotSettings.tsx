/**
 * SlotSettings — the "Selected box" panel under a template's layout canvas
 * (SYLLABLE_BLOCKS_PLAN §4, template editor C2; BLOCK_PLACEMENT_PLAN.md §4).
 *
 * ```
 *  Selected box: C2
 *  C2 — How many signs   [Optional (none or one) ▾]
 *  The block still fits when this sign is missing — the box is left empty.
 *  Several signs sit     [Side by side ▾]          ← only when > 1 is allowed
 *  Signs that share a box are drawn smaller. …      ← muted, same condition
 *  Where the sign sits      ┌─┬─┬─┐                ← 3×3 pin picker (radiogroup)
 *                           ├─┼─┼─┤                  the filled cell = the pin
 *                           └─┴─┴─┘
 *  How the sign fits     [Fit inside the box ▾]
 *  The sign shrinks until it sits inside the box.
 * ```
 *
 * Plain words only: the stored `min` / `max` / `arrange` / `pin` / `fill`
 * numbers and keywords never show. The four count presets cover what a designer
 * needs; a slot whose count matches none of them (imported, e.g. at most 2 or
 * 4) shows an extra selected "Custom (…)" option so the control never claims a
 * count the slot does not have. Choosing a preset replaces the custom count.
 * The pin picker (where the sign sits) and the fill select (how it fits the
 * box) apply to every box, whatever its count.
 *
 * Controlled and stateless: the selection lives in `TemplateEditor` (shared
 * with the canvas); every change goes out through `onChange` as a whole
 * normalised template (`setSlotCount` / `setSlotArrange` / `setSlotPin` /
 * `setSlotFill`).
 *
 * @module writingSystem/blocks/SlotSettings
 */

import { useId } from 'react';
import classNames from 'classnames';

import type { BlockTemplate, SlotFill } from '../../../../blocks';
import { SLOT_FILLS, SLOT_PINS } from '../../../../blocks';
import {
    SLOT_ARRANGE_LABELS,
    SLOT_COUNT_PRESETS,
    describeSlotCount,
    presetOf,
    setSlotArrange,
    setSlotCount,
    slotCountOf,
} from './slotCount';
import type { SlotArrange, SlotCountPreset } from './slotCount';
import {
    SLOT_FILL_LABELS,
    SLOT_PIN_LABELS,
    setSlotFill,
    setSlotPin,
    slotPlacementOf,
} from './slotPlacement';

import pageStyles from './blocksPage.module.scss';
import styles from './slotSettings.module.scss';

export interface SlotSettingsProps {
    template: BlockTemplate;
    /** The selected box's role, or `null` when nothing is selected. */
    roleId: string | null;
    /** The selected role's display label. */
    roleLabel: string;
    onChange: (template: BlockTemplate) => void;
}

/** One plain sentence per preset, shown under the select. */
const PRESET_HINTS: Record<SlotCountPreset, string> = {
    one: 'Exactly one sign fills this box.',
    optional: 'The block still fits when this sign is missing — the box is left empty.',
    oneToThree: 'One, two or three signs share this box.',
    upToThree: 'Up to three signs share this box, or it is left empty when there are none.',
};

const ARRANGE_HINTS: Record<SlotArrange, string> = {
    row: 'The box is split into equal columns, one sign in each.',
    column: 'The box is split into equal rows, one sign above the next.',
};

/** Shown whenever a box can hold more than one sign. */
const SHARED_BOX_HINT = 'Signs that share a box are drawn smaller. Make the box bigger if they look cramped.';

/** One plain sentence per fill mode, shown under the "How the sign fits" select. */
const FILL_HINTS: Record<SlotFill, string> = {
    fit: 'The sign shrinks until it sits inside the box.',
    fill:
        "The sign grows until it spans the box; the rest spills past the box edges, up to the block's edge. " +
        'The pin says which way it spills.',
};

const CUSTOM_VALUE = 'custom';

export default function SlotSettings({ template, roleId, roleLabel, onChange }: SlotSettingsProps) {
    const idPrefix = useId();
    const titleId = `${idPrefix}-title`;
    const slot = roleId === null ? undefined : template.slots.find((s) => s.roleId === roleId);

    if (roleId === null || !slot) {
        return (
            <div className={styles.panel} role="group" aria-labelledby={titleId} data-slot-settings="">
                <p id={titleId} className={styles.title}>
                    Selected box
                </p>
                <p className={pageStyles.hint}>Select a box in the layout to choose how many signs it holds.</p>
            </div>
        );
    }

    const count = slotCountOf(slot);
    const preset = presetOf(slot);
    const countLabel = `${roleLabel} — How many signs`;
    const placement = slotPlacementOf(slot);
    const pinGroupId = `${idPrefix}-pin`;

    return (
        <div className={styles.panel} role="group" aria-labelledby={titleId} data-slot-settings={roleId}>
            <p id={titleId} className={styles.title}>
                Selected box: {roleLabel}
            </p>

            <label className={pageStyles.field}>
                <span className={pageStyles.fieldLabel}>
                    <strong>{roleLabel}</strong> — How many signs
                </span>
                <select
                    className={pageStyles.select}
                    aria-label={countLabel}
                    value={preset ?? CUSTOM_VALUE}
                    data-slot-count=""
                    onChange={(event) => {
                        const next = event.target.value;
                        if (next === CUSTOM_VALUE) return;
                        onChange(setSlotCount(template, roleId, next as SlotCountPreset));
                    }}
                >
                    {SLOT_COUNT_PRESETS.map((option) => (
                        <option key={option.id} value={option.id}>
                            {option.label}
                        </option>
                    ))}
                    {preset === null && <option value={CUSTOM_VALUE}>{`Custom (${describeSlotCount(slot)})`}</option>}
                </select>
            </label>
            <p className={pageStyles.hint} data-slot-count-hint="">
                {preset === null
                    ? `This box takes ${count.min} to ${count.max} signs — a count set outside this editor. Pick another choice to replace it.`
                    : PRESET_HINTS[preset]}
            </p>

            {count.max > 1 && (
                <>
                    <label className={pageStyles.field}>
                        <span className={pageStyles.fieldLabel}>Several signs sit</span>
                        <select
                            className={pageStyles.select}
                            value={count.arrange}
                            data-slot-arrange=""
                            onChange={(event) => onChange(setSlotArrange(template, roleId, event.target.value as SlotArrange))}
                        >
                            {(Object.keys(SLOT_ARRANGE_LABELS) as SlotArrange[]).map((arrange) => (
                                <option key={arrange} value={arrange}>
                                    {SLOT_ARRANGE_LABELS[arrange]}
                                </option>
                            ))}
                        </select>
                    </label>
                    <p className={pageStyles.hint}>{ARRANGE_HINTS[count.arrange]}</p>
                    <p className={classNames(pageStyles.hint, pageStyles.muted)} data-slot-shared-hint="">
                        {SHARED_BOX_HINT}
                    </p>
                </>
            )}

            <div className={pageStyles.field} role="group" aria-labelledby={pinGroupId}>
                <span className={pageStyles.fieldLabel} id={pinGroupId}>
                    Where the sign sits
                </span>
                <div className={styles.pinGrid} role="radiogroup" aria-labelledby={pinGroupId} data-slot-pin="">
                    {SLOT_PINS.map((pin) => {
                        const checked = placement.pin === pin;
                        return (
                            <button
                                key={pin}
                                type="button"
                                className={classNames(styles.pinCell, checked && styles.pinCellChecked)}
                                role="radio"
                                aria-checked={checked}
                                aria-label={SLOT_PIN_LABELS[pin]}
                                data-slot-pin-option={pin}
                                onClick={() => onChange(setSlotPin(template, roleId, pin))}
                            >
                                <span className={styles.pinDot} aria-hidden="true" />
                            </button>
                        );
                    })}
                </div>
            </div>

            <label className={pageStyles.field}>
                <span className={pageStyles.fieldLabel}>How the sign fits</span>
                <select
                    className={pageStyles.select}
                    value={placement.fill}
                    data-slot-fill=""
                    onChange={(event) => onChange(setSlotFill(template, roleId, event.target.value as SlotFill))}
                >
                    {SLOT_FILLS.map((fill) => (
                        <option key={fill} value={fill}>
                            {SLOT_FILL_LABELS[fill]}
                        </option>
                    ))}
                </select>
            </label>
            <p className={pageStyles.hint} data-slot-fill-hint="">
                {FILL_HINTS[placement.fill]}
            </p>
        </div>
    );
}
