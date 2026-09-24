/**
 * VariantsSection
 * ---------------
 * "Other forms" of the grapheme form: every visual form of the sign besides
 * the default one. Same sound, different look — a block layout picks the form
 * by its variant group (see `BLOCK_SCRIPT_PLAN.md` §0).
 *
 * One card per {@link VariantDraft}: a name, a group `<select>` (+ "Manage
 * groups…", which opens the shared {@link VariantGroupsDialog}), the form's
 * own glyph list ({@link GlyphListEditor}, the same editor the default form
 * uses), "Make default" and "Remove form". "Add a form" appends a card.
 *
 * Controlled and SmartForm-free (pitfall P9): the drafts are page state, like
 * the default glyph list. The name is a plain controlled `<input>`. Nothing is
 * written here — the submit hook diffs the drafts against the stored variants.
 *
 * A grapheme can have at most one form per group, so a group another form
 * already holds is shown but not selectable in a card's `<select>`.
 */

import { useCallback, useId, useRef, useState } from "react";

import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import Button, { buttonStyles } from "cyber-components/interactable/buttons/button";

import { useEtymolog, type Glyph } from "../../../db";
import VariantGroupsDialog from "../../tabs/grapheme/variantGroups/VariantGroupsDialog";
import GlyphListEditor from "./GlyphListEditor";
import { formLabel, type VariantDraft } from "./variantDrafts";

import styles from "./variantsSection.module.scss";

export interface VariantsSectionProps {
    variants: VariantDraft[];
    onChange: (next: VariantDraft[]) => void;
    /** "Make default" on a card — the owner swaps it with the default form. */
    onMakeDefault: (key: string) => void;
    /** The default form's group, which no card may take as well. */
    defaultGroupId: number | null;
    /** Display name of the default form's owner, for "used by …" hints. */
    defaultFormName?: string;
}

const NO_GROUP = "";

export default function VariantsSection({
    variants,
    onChange,
    onMakeDefault,
    defaultGroupId,
    defaultFormName = "the default form",
}: VariantsSectionProps) {
    const uid = useId();
    const nextKeyRef = useRef(0);
    const { data } = useEtymolog();
    const groups = data.variantGroups;
    const [isGroupsOpen, setIsGroupsOpen] = useState(false);

    const updateDraft = useCallback(
        (key: string, patch: Partial<Omit<VariantDraft, "key">>) => {
            onChange(variants.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));
        },
        [variants, onChange],
    );

    const addForm = useCallback(() => {
        nextKeyRef.current += 1;
        onChange([
            ...variants,
            {
                key: `${uid}-new-${nextKeyRef.current}`,
                id: null,
                // The default form is form 1.
                name: `Form ${variants.length + 2}`,
                groupId: null,
                glyphs: [],
            },
        ]);
    }, [variants, onChange, uid]);

    const removeForm = useCallback(
        (key: string) => onChange(variants.filter((draft) => draft.key !== key)),
        [variants, onChange],
    );

    /** Who else holds `groupId` (null when nobody else does). */
    const holderOf = (groupId: number, exceptKey: string): string | null => {
        if (defaultGroupId === groupId) return defaultFormName;
        const other = variants.find((draft) => draft.key !== exceptKey && draft.groupId === groupId);
        return other ? formLabel(other.name) : null;
    };

    return (
        <div className={styles.root}>
            {variants.length === 0 ? (
                <p className={styles.emptyState}>
                    Different looks for the same sign — a block layout picks the form by group.
                    Add a form to give this grapheme another shape (a narrow one for a
                    block&rsquo;s side, say) without changing how it sounds.
                </p>
            ) : (
                <ul className={styles.cards} aria-label="Other forms of this grapheme">
                    {variants.map((draft, index) => {
                        const nameId = `${uid}-${draft.key}-name`;
                        const groupSelectId = `${uid}-${draft.key}-group`;
                        const label = formLabel(draft.name);
                        const groupValue =
                            draft.groupId !== null && groups.some((g) => g.id === draft.groupId)
                                ? String(draft.groupId)
                                : NO_GROUP;
                        return (
                            <li key={draft.key} className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <span className={styles.cardNumber} aria-hidden="true">
                                        {index + 2}
                                    </span>
                                    <label className={styles.field} htmlFor={nameId}>
                                        <span className={styles.fieldLabel}>Name</span>
                                        <input
                                            id={nameId}
                                            className={styles.input}
                                            value={draft.name}
                                            onChange={(e) => updateDraft(draft.key, { name: e.target.value })}
                                            onKeyDown={(e) => {
                                                // Enter here must not submit the grapheme form.
                                                if (e.key === "Enter") e.preventDefault();
                                            }}
                                            maxLength={200}
                                        />
                                    </label>
                                    <label className={styles.field} htmlFor={groupSelectId}>
                                        <span className={styles.fieldLabel}>Group</span>
                                        <select
                                            id={groupSelectId}
                                            className={styles.input}
                                            value={groupValue}
                                            onChange={(e) =>
                                                updateDraft(draft.key, {
                                                    groupId:
                                                        e.target.value === NO_GROUP
                                                            ? null
                                                            : Number(e.target.value),
                                                })
                                            }
                                        >
                                            <option value={NO_GROUP}>No group</option>
                                            {groups.map((group) => {
                                                const holder = holderOf(group.id, draft.key);
                                                return (
                                                    <option
                                                        key={group.id}
                                                        value={String(group.id)}
                                                        disabled={holder !== null}
                                                    >
                                                        {holder ? `${group.name} (used by ${holder})` : group.name}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </label>
                                    <Button
                                        type="button"
                                        onClick={() => setIsGroupsOpen(true)}
                                        className={buttonStyles.outline}
                                    >
                                        Manage groups…
                                    </Button>
                                </div>

                                <GlyphListEditor
                                    glyphs={draft.glyphs}
                                    onChange={(next: Glyph[]) => updateDraft(draft.key, { glyphs: next })}
                                    listLabel={`Glyphs of the form ${label}, in writing order`}
                                    emptyText="No glyphs in this form yet — draw one, or reuse a glyph you already have."
                                    ownerLabel={`the form ${label}`}
                                />

                                <div className={styles.cardActions}>
                                    <Button
                                        type="button"
                                        onClick={() => onMakeDefault(draft.key)}
                                        disabled={draft.glyphs.length === 0}
                                        title={
                                            draft.glyphs.length === 0
                                                ? "Add a glyph to this form first"
                                                : undefined
                                        }
                                        className={buttonStyles.secondary}
                                        aria-label={`Make the form ${label} the default`}
                                    >
                                        Make default
                                    </Button>
                                    <IconButton
                                        type="button"
                                        iconName="trash"
                                        onClick={() => removeForm(draft.key)}
                                        aria-label={`Remove the form ${label}`}
                                    >
                                        Remove form
                                    </IconButton>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className={styles.addRow}>
                <IconButton
                    type="button"
                    iconName="plus-lg"
                    onClick={addForm}
                    className={buttonStyles.secondary}
                >
                    Add a form
                </IconButton>
                {variants.length === 0 && (
                    <Button
                        type="button"
                        onClick={() => setIsGroupsOpen(true)}
                        className={buttonStyles.outline}
                    >
                        Manage groups…
                    </Button>
                )}
            </div>

            <VariantGroupsDialog open={isGroupsOpen} onClose={() => setIsGroupsOpen(false)} />
        </div>
    );
}
