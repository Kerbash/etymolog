/**
 * TemplateList — the Templates section of the Blocks page.
 *
 * ```
 *  Templates                    [Add templates from my word shapes] [New template]
 *  ┌ Add templates from your word shapes ─────────────────────────────┐
 *  │ (•) One flexible template [Recommended]                          │  ← opens under the
 *  │ ( ) One template per shape                                       │    header on click
 *  │ [Add] [Cancel]                                                   │
 *  └──────────────────────────────────────────────────────────────────┘
 *  First match wins: templates are tried top to bottom — put longer patterns first.
 *  ┌──┬───┬────────────────────────┬────┬─────────────────────────────┐
 *  │⋮⋮│ 1 │ CVC   (C1)(V)(C2)       │ ▦  │ ↑ ↓ Edit Duplicate Delete   │
 *  │⋮⋮│ 2 │ CV    (C1)(V)           │ ▥  │ ↑ ↓ Edit Duplicate Delete   │
 *  └──┴───┴────────────────────────┴────┴─────────────────────────────┘
 * ```
 *
 * The ORDER is the priority (the segmenter tries templates in scheme order and
 * the first match wins), so the list is reorderable — by dragging the grip
 * (pointer, touch, or keyboard via cyber `ReorderableList`) and by the ↑/↓
 * buttons, which are the plain-click route to the same result.
 *
 * The seed button opens an INLINE choice (not a modal): one flexible template
 * (recommended, preselected) or one template per shape; Add runs the chosen
 * seed through `onSeed(kind)`. With no word shapes at all there is nothing to
 * choose between, so the button seeds straight away and the report says so.
 *
 * Controlled: every action is a callback into the page's draft. The only
 * local state is the open/closed choice panel and its selected radio.
 */

import { useId, useState } from 'react';
import type { CSSProperties } from 'react';
import classNames from 'classnames';

import ReorderableList from 'cyber-components/interactable/reorderableList';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';
import SvgIcon from 'cyber-components/graphics/decor/svgIcon/svgIcon';

import type { BlockRole, BlockTemplate } from '../../../../blocks';
import type { SeedKind, SeedResult } from './seedFromGenerator';
import { describeSeedResult } from './seedFromGenerator';
import { describeSlotCount, labelWithCount } from './slotCount';

import styles from './blocksPage.module.scss';
import settingsStyles from './settings.module.scss';
import seedStyles from './seedChoice.module.scss';

export interface TemplateListProps {
    templates: BlockTemplate[];
    roles: BlockRole[];
    /** The template open in the editor, highlighted in the list. */
    editingId: string | null;
    onReorder: (orderedIds: string[]) => void;
    onMove: (templateId: string, delta: -1 | 1) => void;
    onEdit: (templateId: string) => void;
    onDuplicate: (templateId: string) => void;
    onRemove: (templateId: string) => void;
    onNew: () => void;
    /** Run a seed: one flexible template, or one template per word shape. */
    onSeed: (kind: SeedKind) => void;
    /**
     * The word generator has at least one syllable shape. Without any, the
     * seed button skips the choice (there is nothing to choose between) and
     * seeds directly so the report can say there are no shapes.
     */
    hasWordShapes: boolean;
    /** The last "Add templates from my word shapes" run, or null. */
    seedReport: SeedResult | null;
}

type ColourStyle = CSSProperties & { '--role-colour'?: string };

/** A small picture of a template's rectangles, each in its role's colour. */
function TemplateThumbnail({ template, roles }: { template: BlockTemplate; roles: BlockRole[] }) {
    const colourOf = new Map(roles.map((role) => [role.id, role.colour]));
    return (
        <svg className={styles.thumbnail} viewBox="0 0 100 100" aria-hidden="true" data-template-thumbnail="">
            {template.slots.map((slot) => {
                const colour = colourOf.get(slot.roleId);
                const style: ColourStyle | undefined = colour ? { '--role-colour': colour } : undefined;
                return (
                    <rect
                        key={slot.roleId}
                        className={classNames(styles.thumbRect, !colour && styles.thumbRectDefault)}
                        style={style}
                        x={slot.x * 100 + 2}
                        y={slot.y * 100 + 2}
                        width={Math.max(slot.w * 100 - 4, 1)}
                        height={Math.max(slot.h * 100 - 4, 1)}
                        rx={4}
                    />
                );
            })}
        </svg>
    );
}

/** A template's pattern as coloured role chips, in order, each with its count ("C2 · optional"). */
function PatternChips({ template, roles }: { template: BlockTemplate; roles: BlockRole[] }) {
    const roleById = new Map(roles.map((role) => [role.id, role]));
    const slotByRole = new Map(template.slots.map((slot) => [slot.roleId, slot]));
    const labelOf = (roleId: string) => roleById.get(roleId)?.label ?? roleId;
    return (
        <span
            className={styles.chips}
            aria-label={`Pattern: ${template.pattern.map((id) => labelWithCount(labelOf(id), slotByRole.get(id))).join(', ')}`}
        >
            {template.pattern.map((roleId) => {
                const role = roleById.get(roleId);
                const style: ColourStyle | undefined = role?.colour ? { '--role-colour': role.colour } : undefined;
                const count = describeSlotCount(slotByRole.get(roleId));
                return (
                    <span key={roleId} className={styles.chip} style={style} aria-hidden="true">
                        {count ? `${labelOf(roleId)} · ${count}` : labelOf(roleId)}
                    </span>
                );
            })}
        </span>
    );
}

export default function TemplateList({
    templates,
    roles,
    editingId,
    onReorder,
    onMove,
    onEdit,
    onDuplicate,
    onRemove,
    onNew,
    onSeed,
    hasWordShapes,
    seedReport,
}: TemplateListProps) {
    const titleId = useId();
    const seedPanelId = useId();
    const seedTitleId = useId();
    const seedRadioName = useId();
    const [choosing, setChoosing] = useState(false);
    const [seedKind, setSeedKind] = useState<SeedKind>('flexible');

    const handleSeedButton = () => {
        if (!hasWordShapes) {
            onSeed('perShape');
            return;
        }
        setChoosing((open) => !open);
    };

    return (
        <section className={styles.section} aria-labelledby={titleId}>
            <div className={styles.sectionHeader}>
                <h3 id={titleId} className={styles.sectionTitle}>
                    Templates
                </h3>
                <div className={styles.actions}>
                    <Button
                        type="button"
                        onClick={handleSeedButton}
                        className={buttonStyles.secondary}
                        aria-expanded={hasWordShapes ? choosing : undefined}
                        aria-controls={hasWordShapes && choosing ? seedPanelId : undefined}
                    >
                        Add templates from my word shapes
                    </Button>
                    <Button type="button" onClick={onNew} className={buttonStyles.primary}>
                        New template
                    </Button>
                </div>
            </div>
            {choosing && hasWordShapes && (
                <div
                    id={seedPanelId}
                    className={seedStyles.panel}
                    role="group"
                    aria-labelledby={seedTitleId}
                    data-seed-choice=""
                >
                    <p id={seedTitleId} className={seedStyles.title}>
                        Add templates from your word shapes
                    </p>
                    <div className={settingsStyles.options} role="radiogroup" aria-labelledby={seedTitleId}>
                        <label className={settingsStyles.option}>
                            <input
                                type="radio"
                                name={seedRadioName}
                                value="flexible"
                                checked={seedKind === 'flexible'}
                                onChange={() => setSeedKind('flexible')}
                            />
                            <span className={settingsStyles.optionText}>
                                <span className={settingsStyles.optionName}>
                                    One flexible template
                                    <span className={settingsStyles.recommended}>Recommended</span>
                                </span>
                                <span className={settingsStyles.optionDescription}>
                                    A single template whose boxes take as many consonants as your shapes need, e.g. up
                                    to 2 at the start and 1 at the end. Works best with By syllable.
                                </span>
                            </span>
                        </label>
                        <label className={settingsStyles.option}>
                            <input
                                type="radio"
                                name={seedRadioName}
                                value="perShape"
                                checked={seedKind === 'perShape'}
                                onChange={() => setSeedKind('perShape')}
                            />
                            <span className={settingsStyles.optionText}>
                                <span className={settingsStyles.optionName}>One template per shape</span>
                                <span className={settingsStyles.optionDescription}>
                                    A separate template for every shape (CV, CVC, CCVC…), as before.
                                </span>
                            </span>
                        </label>
                    </div>
                    <div className={styles.actions}>
                        <Button
                            type="button"
                            className={buttonStyles.primary}
                            onClick={() => {
                                onSeed(seedKind);
                                setChoosing(false);
                            }}
                        >
                            Add
                        </Button>
                        <Button type="button" className={buttonStyles.secondary} onClick={() => setChoosing(false)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            <p className={styles.hint}>
                A template is one block shape: which roles it takes, in order, and where each one sits. First match
                wins — templates are tried from the top of this list down, so put longer patterns first.
            </p>

            {seedReport && (
                <div className={styles.seedReport} role="status">
                    <span>{describeSeedResult(seedReport)}</span>
                    {seedReport.skipped.length > 0 && (
                        <>
                            <span>Skipped:</span>
                            <ul>
                                {seedReport.skipped.map((skip, i) => (
                                    <li key={`${skip.pattern}-${i}`}>
                                        <strong>{skip.pattern}</strong> — {skip.reason}
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            )}

            {templates.length === 0 ? (
                <p className={styles.hint}>No templates yet.</p>
            ) : (
                <ReorderableList<BlockTemplate>
                    items={templates}
                    getId={(template) => template.id}
                    onReorder={(ids) => onReorder(ids)}
                    aria-label="Templates, in priority order"
                    className={styles.templateList}
                    renderItem={({ item, index, dragHandleProps }) => {
                        const name = item.name.trim() || `template ${index + 1}`;
                        return (
                            <div
                                className={classNames(styles.templateRow, item.id === editingId && styles.templateRowEditing)}
                                data-template-id={item.id}
                            >
                                <span
                                    {...dragHandleProps}
                                    className={styles.dragHandle}
                                    aria-label={`Reorder ${name}, priority ${index + 1} of ${templates.length}`}
                                >
                                    <SvgIcon iconName="grip-vertical" aria-hidden="true" />
                                </span>
                                <span className={styles.priority} aria-hidden="true">
                                    {index + 1}
                                </span>
                                <TemplateThumbnail template={item} roles={roles} />
                                <div className={styles.templateBody}>
                                    <span className={styles.templateName}>{name}</span>
                                    <PatternChips template={item} roles={roles} />
                                </div>
                                <div className={styles.actions}>
                                    <IconButton
                                        type="button"
                                        iconName="arrow-up"
                                        disabled={index === 0}
                                        onClick={() => onMove(item.id, -1)}
                                        aria-label={`Move ${name} up`}
                                    />
                                    <IconButton
                                        type="button"
                                        iconName="arrow-down"
                                        disabled={index === templates.length - 1}
                                        onClick={() => onMove(item.id, 1)}
                                        aria-label={`Move ${name} down`}
                                    />
                                    <IconButton
                                        type="button"
                                        iconName="pencil"
                                        onClick={() => onEdit(item.id)}
                                        aria-label={`Edit ${name}`}
                                    />
                                    <IconButton
                                        type="button"
                                        iconName="copy"
                                        onClick={() => onDuplicate(item.id)}
                                        aria-label={`Duplicate ${name}`}
                                    />
                                    <IconButton
                                        type="button"
                                        iconName="trash"
                                        onClick={() => onRemove(item.id)}
                                        aria-label={`Delete ${name}`}
                                    />
                                </div>
                            </div>
                        );
                    }}
                />
            )}
        </section>
    );
}
