/**
 * BlockPopover — one block's details on the word form (BLOCK_SCRIPT_PLAN Phase 6).
 *
 * Opened from the "Block…" button on a block's caption (or its outline).
 * Shows the template and, per entry of the block (a slot holding several
 * signs gets one row each, numbered "Onset (2)" …), the role, the sign and a
 * variant picker:
 *
 *   - "Auto (<group>)" — the default: the composer picks the variant the
 *     slot's group asks for (or the default form); choosing it STRIPS the pin;
 *   - each of the grapheme's variants — choosing one PINS it on that entry
 *     (`grapheme-12@34` in `glyph_order`).
 *
 * Plus the two structure edits the plan keeps in scope:
 *   - "Split before <row>" — inserts a `.` boundary entry before that row's
 *     entry (every row but the first);
 *   - "Join with next block" — removes the `.` right after the block (only
 *     offered when there is one).
 *
 * Under the auto-spell lock every control is disabled and the lock's own
 * explanation is shown on screen: pins are a manual-spelling thing
 * (`deriveAutoSpelledGlyphOrder` never emits them, plan P11).
 *
 * The component is presentational: the canvas input owns the selection and
 * passes callbacks. It renders inside the app's standard `<Modal>` +
 * `<DialogPanel>`, which portals out of the form — its `<select>`s are never
 * SmartForm fields.
 *
 * @module glyphCanvasInput/BlockPopover
 */

'use client';

import { useId } from 'react';
import Modal from 'cyber-components/container/modal/modal.tsx';
import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';

import { DialogPanel } from '../../../shared';
import type { BlockSlotDetails } from './utils/blockUtils';

import styles from './BlockPopover.module.scss';

export interface BlockPopoverProps {
    isOpen: boolean;
    onClose: () => void;
    /** The template's name. */
    templateName: string;
    /** One row per entry, in writing order. */
    slots: BlockSlotDetails[];
    /** Pin (`variantId`) or strip (`null`) the variant of the entry at `entryIndex`. */
    onPinChange: (entryIndex: number, variantId: number | null) => void;
    /** Insert a boundary before the entry at `entryIndex`. */
    onSplitBefore: (entryIndex: number) => void;
    /** Whether a `.` directly follows the block (so it can be joined with the next). */
    canJoin: boolean;
    /** Remove the `.` directly after the block. */
    onJoin: () => void;
    /**
     * When set, the popover is read-only and this text says why (the
     * auto-spell lock's explanation).
     */
    readOnlyReason?: string | null;
}

/** `<select>` value for "Auto". Variant ids are positive integers. */
const AUTO_VALUE = '';

export default function BlockPopover({
    isOpen,
    onClose,
    templateName,
    slots,
    onPinChange,
    onSplitBefore,
    canJoin,
    onJoin,
    readOnlyReason = null,
}: BlockPopoverProps) {
    const idPrefix = useId();
    const readOnly = readOnlyReason !== null && readOnlyReason !== undefined;

    return (
        <Modal isOpen={isOpen} setIsOpen={(next) => { if (!next) onClose(); }} allowClose>
            <DialogPanel
                size="sm"
                title={`Block: ${templateName}`}
                actions={(
                    <Button type="button" className={buttonStyles.secondary} onClick={onClose}>
                        Close
                    </Button>
                )}
            >
                <div className={styles.body} data-testid="block-popover">
                    {readOnly && (
                        <p className={styles.lockNotice} role="status">
                            <i className="bi-magic" aria-hidden="true" />
                            <span>{readOnlyReason}</span>
                        </p>
                    )}

                    <ol className={styles.slots}>
                        {slots.map((slot, k) => {
                            const selectId = `${idPrefix}-slot-${k}`;
                            return (
                                <li key={`${slot.roleId}-${slot.entryIndex}`} className={styles.slot}>
                                    <div className={styles.slotHeader}>
                                        <span className={styles.role}>{slot.label}</span>
                                        <span className={styles.sign}>
                                            {slot.kind === 'grapheme' ? slot.name : `IPA ${slot.name}`}
                                        </span>
                                    </div>

                                    {slot.kind === 'grapheme' ? (
                                        <label className={styles.variantField} htmlFor={selectId}>
                                            <span className={styles.variantLabel}>Form</span>
                                            <select
                                                id={selectId}
                                                className={styles.select}
                                                value={slot.pin === null ? AUTO_VALUE : String(slot.pin)}
                                                disabled={readOnly}
                                                aria-label={`Form of ${slot.name} (${slot.label})`}
                                                onChange={(event) => {
                                                    const value = event.target.value;
                                                    onPinChange(slot.entryIndex, value === AUTO_VALUE ? null : Number(value));
                                                }}
                                            >
                                                <option value={AUTO_VALUE}>{slot.autoLabel}</option>
                                                {slot.variants.map((variant) => (
                                                    <option key={variant.id} value={String(variant.id)}>
                                                        {variant.isDefault ? `${variant.name} (default)` : variant.name}
                                                    </option>
                                                ))}
                                                {/* A pin naming a variant this grapheme no longer has
                                                    renders as the default; keep it selectable so the
                                                    control does not lie about the stored value. */}
                                                {slot.pin !== null && !slot.variants.some((v) => v.id === slot.pin) && (
                                                    <option value={String(slot.pin)}>Unknown form #{slot.pin}</option>
                                                )}
                                            </select>
                                        </label>
                                    ) : (
                                        <p className={styles.note}>IPA characters have no forms to choose from.</p>
                                    )}

                                    {slot.kind === 'grapheme' && slot.missingGroup && slot.pin === null && (
                                        <p className={styles.note} data-testid="missing-group-note">
                                            {slot.missingGroup.name === null
                                                ? `This slot's form group was deleted, so ${slot.name} draws its default form.`
                                                : `${slot.name} has no “${slot.missingGroup.name}” form, so it draws its default. Add one in the Script Maker to use it here.`}
                                        </p>
                                    )}

                                    {k > 0 && (
                                        <Button
                                            type="button"
                                            className={buttonStyles.secondary}
                                            disabled={readOnly}
                                            onClick={() => onSplitBefore(slot.entryIndex)}
                                            aria-label={`Split before ${slot.label}`}
                                        >
                                            Split before {slot.label}
                                        </Button>
                                    )}
                                </li>
                            );
                        })}
                    </ol>

                    {canJoin && (
                        <Button
                            type="button"
                            className={buttonStyles.secondary}
                            disabled={readOnly}
                            onClick={onJoin}
                        >
                            Join with next block
                        </Button>
                    )}
                </div>
            </DialogPanel>
        </Modal>
    );
}

export { BlockPopover };
