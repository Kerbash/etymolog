/**
 * TemplateEditor — edit one block template (a page section, not a modal).
 *
 * ```
 *  Edit template                                         [Cancel] [Apply]
 *  Name [CVC        ]
 *  Pattern  (C1) (V) (C2) (Logo)       ← toggle chips; order = click order
 *           C1 → V → C2
 *  ┌ canvas ───────────┐   Live preview
 *  │ C1 [form ▾]       │   [kata ▾] [or type IPA…]
 *  │───────┬───────────│   ┌──────────────┐
 *  │ V     │ C2        │   │   ▟▙  ▟▙     │
 *  └───────┴───────────┘   └──────────────┘
 *  [x] Snap to 1/8          2 blocks: CVC, CV
 * ```
 *
 * Controlled: the page holds the WORKING copy (`template`) and receives every
 * change through `onChange`, so it can tell whether the editor is dirty and so
 * the preview can render the draft scheme with this template applied. Apply
 * writes the working copy into the page's draft scheme; Cancel drops it.
 * Neither touches the database — Save on the page does.
 *
 * - Pattern: one chip per role; pressing an unchosen chip appends the role
 *   (each role at most once — the scheme rule), pressing a chosen chip removes
 *   it. A new role's rectangle takes the next even-row position
 *   (`addRoleToTemplate`); existing rectangles are never moved.
 * - Canvas: `RectLayoutEditor`, one rect per pattern role (`id = roleId`),
 *   with the slot's variant-group `<select>` injected into each rectangle,
 *   plus a small count readout ("optional", "1–3 · side by side") when the
 *   box holds anything other than exactly one sign.
 * - Selected box: the canvas selection is CONTROLLED here (`selectedRole`) and
 *   shared with `SlotSettings` below the canvas, where the designer picks how
 *   many signs the box holds and, for several, how they sit. The pattern
 *   chips and the readout line carry the same count ("C2 (optional)").
 */

import { useId, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import classNames from 'classnames';

import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';

import type { VariantGroup } from '../../../../db/types';
import type { BlockRole, BlockScheme, BlockTemplate } from '../../../../blocks';
import RectLayoutEditor from './RectLayoutEditor';
import BlockPreview from './BlockPreview';
import SlotSettings from './SlotSettings';
import { SLOT_ARRANGE_LABELS, describeSlotCount, labelWithCount, slotCountOf } from './slotCount';
import {
    addRoleToTemplate,
    applyRects,
    previewScheme,
    removeRoleFromTemplate,
    setSlotGroup,
    templateToRects,
} from './blockSchemeDraft';

import styles from './blocksPage.module.scss';
import slotStyles from './slotSettings.module.scss';

/** The snap grid the toggle switches on. */
const TEMPLATE_SNAP = 1 / 8;

export interface TemplateEditorProps {
    /** The working copy being edited. */
    template: BlockTemplate;
    /** The draft scheme (roles to pick from; the preview renders it). */
    scheme: BlockScheme;
    /** The script's variant groups, for each slot's form `<select>`. */
    groups: VariantGroup[];
    /** A template not yet in the draft ("New template"). */
    isNew: boolean;
    onChange: (template: BlockTemplate) => void;
    onApply: () => void;
    onCancel: () => void;
}

type ColourStyle = CSSProperties & { '--role-colour'?: string };

export default function TemplateEditor({ template, scheme, groups, isNew, onChange, onApply, onCancel }: TemplateEditorProps) {
    const idPrefix = useId();
    const [snap, setSnap] = useState(true);
    const [selectedRole, setSelectedRole] = useState<string | null>(null);

    const roles: BlockRole[] = scheme.roles;
    const roleById = new Map(roles.map((role) => [role.id, role]));
    const slotByRole = new Map(template.slots.map((slot) => [slot.roleId, slot]));
    const rects = templateToRects(template, roles);
    const nameMissing = !template.name.trim();
    const canApply = !nameMissing && template.pattern.length > 0;
    // A selection whose role left the pattern is no selection.
    const activeRole = selectedRole !== null && template.pattern.includes(selectedRole) ? selectedRole : null;
    const roleLabelOf = (roleId: string) => roleById.get(roleId)?.label.trim() || roleId;
    // Both inputs are whole state objects the page owns (P8), so this only
    // changes when the draft or the working copy does.
    const preview = useMemo(() => previewScheme(scheme, template), [scheme, template]);

    function toggleRole(roleId: string) {
        onChange(
            template.pattern.includes(roleId)
                ? removeRoleFromTemplate(template, roleId)
                : addRoleToTemplate(template, roleId),
        );
    }

    return (
        <section
            className={classNames(styles.section, styles.editor)}
            aria-labelledby={`${idPrefix}-title`}
            data-template-editor=""
        >
            <div className={styles.sectionHeader}>
                <h3 id={`${idPrefix}-title`} className={styles.sectionTitle}>
                    {isNew ? 'New template' : `Edit template “${template.name.trim() || 'unnamed'}”`}
                </h3>
                <div className={styles.actions}>
                    <Button type="button" onClick={onCancel} className={buttonStyles.secondary}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={onApply} disabled={!canApply} className={buttonStyles.primary}>
                        Apply
                    </Button>
                </div>
            </div>
            <p className={styles.hint}>
                Apply puts the template into the scheme you are editing; Save on the page writes it to your
                language.
            </p>

            <label className={styles.field}>
                <span className={styles.fieldLabel}>Name</span>
                <input
                    className={styles.input}
                    value={template.name}
                    aria-invalid={nameMissing || undefined}
                    onChange={(event) => onChange({ ...template, name: event.target.value })}
                />
            </label>

            <div className={styles.field} role="group" aria-labelledby={`${idPrefix}-pattern`}>
                <span className={styles.fieldLabel} id={`${idPrefix}-pattern`}>
                    Pattern
                </span>
                {roles.length === 0 ? (
                    <p className={styles.hint}>Add a role first — a pattern is built from roles.</p>
                ) : (
                    <>
                        <div className={styles.chips}>
                            {roles.map((role) => {
                                const chosen = template.pattern.includes(role.id);
                                const style: ColourStyle | undefined = role.colour ? { '--role-colour': role.colour } : undefined;
                                const label = role.label.trim() || role.id;
                                const count = chosen ? describeSlotCount(slotByRole.get(role.id)) : '';
                                return (
                                    <button
                                        key={role.id}
                                        type="button"
                                        className={classNames(styles.chip, styles.chipButton)}
                                        style={style}
                                        aria-pressed={chosen}
                                        aria-label={
                                            chosen
                                                ? `Remove ${labelWithCount(label, slotByRole.get(role.id))} from the pattern`
                                                : `Add ${label} to the pattern`
                                        }
                                        onClick={() => toggleRole(role.id)}
                                    >
                                        <span className={styles.chipDot} aria-hidden="true" />
                                        {count ? `${label} · ${count}` : label}
                                    </button>
                                );
                            })}
                        </div>
                        <p className={styles.hint} data-pattern-readout="">
                            {template.pattern.length === 0
                                ? 'Click roles in the order the block reads them.'
                                : template.pattern
                                      .map((roleId) => labelWithCount(roleById.get(roleId)?.label ?? roleId, slotByRole.get(roleId)))
                                      .join(' → ')}
                        </p>
                    </>
                )}
            </div>

            <div className={styles.editorBody}>
                <div className={styles.canvasColumn}>
                    <span className={styles.fieldLabel}>Layout</span>
                    {rects.length === 0 ? (
                        <div className={styles.emptyCanvas}>Add roles to the pattern to place them here.</div>
                    ) : (
                        <RectLayoutEditor
                            rects={rects}
                            onChange={(next) => onChange(applyRects(template, next))}
                            snap={snap ? TEMPLATE_SNAP : null}
                            selectedId={activeRole}
                            onSelect={setSelectedRole}
                            aria-label={`Layout of ${template.name.trim() || 'the template'}`}
                            renderRectContent={(rect) => {
                                const slot = slotByRole.get(rect.id);
                                const count = describeSlotCount(slot);
                                const { max, arrange } = slotCountOf(slot);
                                return (
                                    <>
                                        <select
                                            className={styles.slotSelect}
                                            aria-label={`Form drawn in ${rect.label}`}
                                            value={slot?.groupId == null ? '' : String(slot.groupId)}
                                            onChange={(event) =>
                                                onChange(
                                                    setSlotGroup(
                                                        template,
                                                        rect.id,
                                                        event.target.value === '' ? null : Number(event.target.value),
                                                    ),
                                                )
                                            }
                                        >
                                            <option value="">Default form</option>
                                            {groups.map((group) => (
                                                <option key={group.id} value={String(group.id)}>
                                                    {group.name}
                                                </option>
                                            ))}
                                        </select>
                                        {count && (
                                            <span className={slotStyles.rectCount} data-rect-count="">
                                                {max > 1 ? `${count} · ${SLOT_ARRANGE_LABELS[arrange].toLowerCase()}` : count}
                                            </span>
                                        )}
                                    </>
                                );
                            }}
                        />
                    )}
                    <label className={styles.toggle}>
                        <input type="checkbox" checked={snap} onChange={(event) => setSnap(event.target.checked)} />
                        Snap to a 1/8 grid
                    </label>
                    {rects.length > 0 && (
                        <SlotSettings
                            template={template}
                            roleId={activeRole}
                            roleLabel={activeRole === null ? '' : roleLabelOf(activeRole)}
                            onChange={onChange}
                        />
                    )}
                </div>

                <BlockPreview scheme={preview} />
            </div>
        </section>
    );
}
