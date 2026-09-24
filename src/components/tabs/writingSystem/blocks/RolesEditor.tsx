/**
 * RolesEditor — the Roles section of the Blocks page.
 *
 * A role is a slot TYPE (`C1`, `V`, `Tone`…) with a matcher deciding which
 * spelling entries may fill it. One row per role:
 *
 * ```
 *  Label   Matches                          Colour
 *  [C1  ]  [consonants ▾]                   ● ● ● ● …   Used by 2 templates
 *  [Logo]  [category… ▾] [logogram]         ● ● ● ● …   [🗑]
 *  [Tone]  [mark (accent, tone…) ▾] [mark]   ● ● ● ● …   [🗑]
 * ```
 *
 * "mark (accent, tone…)" is a shortcut that writes `MARK_CATEGORY` into a
 * category matcher — the signs the grapheme form files as marks (a tone,
 * length or accent sign with no sound of its own), which ride with the sign
 * before them (CONLANG_EDGES_PLAN.md §5.3). A category matcher ALWAYS shows
 * its text box, the mark included, so the category can be edited in place
 * (typing `markup` passes through `mark` without losing the box); the select
 * shows the shortcut while the box reads exactly `mark`, and "category…"
 * otherwise.
 *
 * Controlled: the page owns the draft scheme and passes the roles plus how
 * many templates use each one. Role ids are generated once by the page
 * (`role-<n>`) and never shown or derived from the label, so renaming a role
 * cannot break a pattern.
 *
 * Delete is GUARDED: a role some template's pattern uses cannot be removed —
 * the row shows "Used by N templates" in place of the delete button — because
 * the validator would otherwise drop those templates on save.
 */

import { useId } from 'react';
import type { CSSProperties } from 'react';

import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';

import { CLASS_LABELS, CLASS_LETTERS, isClassLetter } from '../../../../generator/phonology/classes';
import { MARK_CATEGORY, WORD_SYMBOL_CATEGORY } from '../../../../db/wordSymbolService';
import type { BlockRole, RoleMatcher } from '../../../../blocks';
import { ROLE_COLOURS } from './blockSchemeDraft';

import styles from './blocksPage.module.scss';

export interface RolesEditorProps {
    roles: BlockRole[];
    /** Role id → how many templates (including the one being edited) use it. */
    usage: ReadonlyMap<string, number>;
    onAdd: () => void;
    onUpdate: (roleId: string, patch: Partial<Omit<BlockRole, 'id'>>) => void;
    onRemove: (roleId: string) => void;
}

type ColourStyle = CSSProperties & { '--role-colour'?: string };

/** The `<select>` value of the "mark (accent, tone…)" preset. */
const MARK_VALUE = 'mark';

/** Is this the mark preset — a category matcher naming exactly `MARK_CATEGORY`? */
function isMarkMatcher(matcher: RoleMatcher): boolean {
    return matcher.kind === 'category' && matcher.category === MARK_CATEGORY;
}

/** The matcher `<select>` value for a matcher. */
function matcherValue(matcher: RoleMatcher): string {
    if (matcher.kind === 'class') return `class:${matcher.letter}`;
    if (isMarkMatcher(matcher)) return MARK_VALUE;
    return matcher.kind;
}

/** The matcher a `<select>` value stands for (keeping a category's text). */
function matcherFromValue(value: string, previous: RoleMatcher): RoleMatcher {
    if (value.startsWith('class:')) {
        const letter = value.slice('class:'.length);
        if (isClassLetter(letter)) return { kind: 'class', letter };
    }
    if (value === 'syllable') return { kind: 'syllable' };
    if (value === MARK_VALUE) return { kind: 'category', category: MARK_CATEGORY };
    if (value === 'category') {
        // Keep the box's text (the mark included — it is editable in place);
        // only a switch from another kind starts at the logogram default.
        return { kind: 'category', category: previous.kind === 'category' ? previous.category : WORD_SYMBOL_CATEGORY };
    }
    return { kind: 'any' };
}

export default function RolesEditor({ roles, usage, onAdd, onUpdate, onRemove }: RolesEditorProps) {
    const idPrefix = useId();

    return (
        <section className={styles.section} aria-labelledby={`${idPrefix}-title`}>
            <div className={styles.sectionHeader}>
                <h3 id={`${idPrefix}-title`} className={styles.sectionTitle}>
                    Roles
                </h3>
                <Button type="button" onClick={onAdd} className={buttonStyles.secondary}>
                    Add role
                </Button>
            </div>
            <p className={styles.hint}>
                A role is a kind of slot in a block. It decides which signs may fill it — a consonant, a vowel, a
                syllable sign, a mark (an accent or tone sign), a category of signs, or anything. Want two consonants in one block? Make two roles
                (say C1 and C2).
            </p>

            {roles.length === 0 ? (
                <p className={styles.hint}>No roles yet. Add one, or add templates from your word shapes below.</p>
            ) : (
                <div className={styles.tableScroll}>
                    <table className={styles.rolesTable}>
                        <thead>
                            <tr>
                                <th scope="col">Label</th>
                                <th scope="col">Matches</th>
                                <th scope="col">Colour</th>
                                <th scope="col">
                                    <span className={styles.muted}>Remove</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {roles.map((role, i) => {
                                const rowId = `${idPrefix}-role-${i}`;
                                const name = role.label.trim() || `role ${i + 1}`;
                                const usedBy = usage.get(role.id) ?? 0;
                                const matcher = role.matcher;
                                const categoryMissing = matcher.kind === 'category' && !matcher.category.trim();
                                return (
                                    <tr key={role.id} data-role-id={role.id}>
                                        <td>
                                            <input
                                                className={styles.input}
                                                value={role.label}
                                                aria-label={`Label of role ${i + 1}`}
                                                aria-invalid={role.label.trim() ? undefined : true}
                                                size={8}
                                                onChange={(event) => onUpdate(role.id, { label: event.target.value })}
                                            />
                                        </td>
                                        <td>
                                            <div className={styles.matcherCell}>
                                                <select
                                                    className={styles.select}
                                                    value={matcherValue(matcher)}
                                                    aria-label={`What ${name} matches`}
                                                    onChange={(event) =>
                                                        onUpdate(role.id, { matcher: matcherFromValue(event.target.value, matcher) })
                                                    }
                                                >
                                                    {CLASS_LETTERS.map((letter) => (
                                                        <option key={letter} value={`class:${letter}`}>
                                                            {CLASS_LABELS[letter]} ({letter})
                                                        </option>
                                                    ))}
                                                    <option value="syllable">syllable sign</option>
                                                    <option value={MARK_VALUE}>mark (accent, tone…)</option>
                                                    <option value="category">category…</option>
                                                    <option value="any">anything</option>
                                                </select>
                                                {matcher.kind === 'category' && (
                                                    <input
                                                        id={`${rowId}-category`}
                                                        className={styles.input}
                                                        value={matcher.category}
                                                        placeholder={WORD_SYMBOL_CATEGORY}
                                                        aria-label={`Category ${name} matches`}
                                                        aria-invalid={categoryMissing || undefined}
                                                        size={10}
                                                        onChange={(event) =>
                                                            onUpdate(role.id, {
                                                                matcher: { kind: 'category', category: event.target.value },
                                                            })
                                                        }
                                                    />
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div className={styles.swatches} role="group" aria-label={`Colour of ${name}`}>
                                                {ROLE_COLOURS.map((colour) => {
                                                    const style: ColourStyle = { '--role-colour': colour.value };
                                                    return (
                                                        <button
                                                            key={colour.value}
                                                            type="button"
                                                            className={styles.swatch}
                                                            style={style}
                                                            aria-label={colour.label}
                                                            aria-pressed={role.colour === colour.value}
                                                            title={colour.label}
                                                            onClick={() => onUpdate(role.id, { colour: colour.value })}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td>
                                            {usedBy > 0 ? (
                                                <span className={styles.usedBy}>
                                                    Used by {usedBy} template{usedBy === 1 ? '' : 's'}
                                                </span>
                                            ) : (
                                                <IconButton
                                                    type="button"
                                                    iconName="trash"
                                                    onClick={() => onRemove(role.id)}
                                                    aria-label={`Remove the role ${name}`}
                                                />
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
