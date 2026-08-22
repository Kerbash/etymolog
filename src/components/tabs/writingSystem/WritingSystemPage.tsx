/**
 * WritingSystemPage — `/writing-system`.
 *
 * The directional rules of the script: which way glyphs run inside a word,
 * which way words run along a line, and where the next line goes.
 *
 * ```
 *  Writing System
 *  ⚠ Word order and line progression run along the same axis …   ← live warning
 *  ┌ Directionality ───────────────┬──────────────┐
 *  │ Glyph direction               │ [Left to Right ▾]
 *  │ How glyphs flow within a word │
 *  └───────────────────────────────┴──────────────┘
 *  ┌ Layout ───────────────────────┬──────────────┐
 *  …
 * ```
 *
 * Four things this page did not do before:
 *
 *  - **the selects had no names.** Each row's `<select>` sat next to a `<td>`
 *    holding the rule's label, which associates nothing: a screen reader
 *    announced five unnamed comboboxes. Every select now points at its own
 *    rule-name cell with `aria-labelledby`.
 *  - **the categories were fake table sections** — a `<tr><td colSpan>` header
 *    inside its own `<tbody>`, which is a row pretending to be a heading. Each
 *    category is its own `<table>` with a real `<caption>` now, which is how a
 *    table says what it contains.
 *  - **saves were silent.** Changing a rule wrote settings and said nothing,
 *    and a REJECTED write (settings validation is strict) said nothing either.
 *  - **contradictory combinations were undetectable.** `validateWritingSystem`
 *    existed and nothing called it, so a user could set words and lines to run
 *    along the same axis — every wrapped line stacked on the last — and the only
 *    symptom was a rendering they would go looking for a bug in.
 */

import { useCallback, useId, useMemo } from 'react';

import BasicTable from 'cyber-components/container/table/basicTable';
import NotificationBanner from 'cyber-components/interactable/information/notificationBanner';

import { useEtymolog } from '../../../db';
import type { WritingSystemSettings } from '../../../db/api/types';
import { getRuleCategories, getRulesByCategory, validateWritingSystem } from '../../../rules';
import { PageHeader, useApiAction } from '../../shared';

import styles from './writingSystem.module.scss';

export default function WritingSystemPage() {
    const { api, settings } = useEtymolog();
    const runApiAction = useApiAction();
    const idPrefix = useId();

    const writingSystem = settings.writingSystem;

    const handleChange = useCallback(
        (key: keyof WritingSystemSettings, value: string) => {
            // `api.settings.update` is STRICT: an unknown key or a bad enum
            // value rejects the WHOLE update, so the current object is spread
            // rather than the single changed field sent on its own.
            void runApiAction(
                () =>
                    api.settings.update({
                        writingSystem: { ...writingSystem, [key]: value },
                    }),
                { errorTitle: 'Could not save the rule', success: 'Rule saved.' },
            );
        },
        [api, runApiAction, writingSystem],
    );

    // Re-evaluated on every change, because that is when a combination becomes
    // contradictory — a warning that only appears on load is a warning nobody
    // sees at the moment they cause the problem.
    const warnings = useMemo(() => validateWritingSystem(writingSystem), [writingSystem]);

    const categories = useMemo(() => getRuleCategories(), []);

    return (
        <>
            <PageHeader
                title="Writing System"
                description="How your script flows: glyphs within a word, words along a line, and lines down the page."
            />

            {warnings.map((warning) => (
                <NotificationBanner
                    key={warning.keys.join('-')}
                    visible
                    severity="warning"
                    title="These rules contradict each other"
                    message={warning.message}
                    // The banner is `position: fixed` by default (it is normally
                    // a toast). An INLINE warning has to sit with the rules it
                    // is about, and an inline style is the only override that
                    // reliably beats the component's own stylesheet — a class
                    // would depend on bundle order for equal specificity.
                    parts={{
                        root: {
                            style: {
                                position: 'static',
                                maxWidth: '100%',
                                marginInline: 0,
                                width: '100%',
                            },
                        },
                    }}
                />
            ))}

            <div className={styles.tables}>
                {categories.map((category) => {
                    const rules = getRulesByCategory(category);
                    if (rules.length === 0) return null;

                    return (
                        <BasicTable
                            key={category}
                            className={styles.table}
                            caption={category}
                            header={['Rule', 'Value']}
                            rows={rules.map((rule) => {
                                const value = writingSystem[rule.key] ?? rule.defaultValue;
                                const isModified = value !== rule.defaultValue;
                                const labelId = `${idPrefix}-${rule.key}`;

                                return {
                                    key: rule.key,
                                    cells: [
                                        <div className={styles.ruleLabel} key="label">
                                            <span id={labelId} className={styles.ruleName}>
                                                {rule.label}
                                            </span>
                                            <span className={styles.ruleDescription}>
                                                {rule.description}
                                            </span>
                                        </div>,
                                        <select
                                            key="value"
                                            className={
                                                isModified
                                                    ? `${styles.select} ${styles.modified}`
                                                    : styles.select
                                            }
                                            // The rule's NAME cell is the label —
                                            // there is nothing else on the row
                                            // that names this control.
                                            aria-labelledby={labelId}
                                            value={String(value)}
                                            onChange={(event) =>
                                                handleChange(rule.key, event.target.value)
                                            }
                                        >
                                            {rule.options.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>,
                                    ],
                                };
                            })}
                        />
                    );
                })}
            </div>
        </>
    );
}
