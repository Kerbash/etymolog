/**
 * WordCheck — "Check all my words" on the Blocks page, right under "Try a word"
 * (CONLANG_EDGES_PLAN.md §6.2).
 *
 * ```
 *  Check all my words
 *  Runs the settings and templates above, unsaved changes included, …
 *  [Check 42 words]
 *  ⓘ Settings changed since this check — run it again     ← stale only
 *  42 words checked · 37 split cleanly
 *  ▾ Signs drawn on their own (3)
 *      kaa — ka · a — a at the end is drawn on its own   [Try it]
 *  ▸ Consonants with no vowel (2)
 *  ▸ Signs that cannot be read (1)
 *  Templates no word uses (1): CVC
 * ```
 *
 * Computed ON CLICK only (`useState`, no effect, never in render — P-D1): the
 * result is kept with the scheme it was computed against, and the moment the
 * page's draft changes (`scheme !== checkedScheme`) a visible note says the
 * report is stale. "Try it" hands the word to the page (`onTryWord`), which
 * shows it in the "Try a word" preview.
 */

import { useId, useState } from 'react';

import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';

import { useEtymolog } from '../../../../db';
import type { BlockScheme } from '../../../../blocks';
import { checkWords } from './checkWords';
import type { WordCheck as WordCheckResult, WordCheckList } from './checkWords';

import styles from './blocksPage.module.scss';
import settingsStyles from './settings.module.scss';

export interface WordCheckProps {
    /** Optional stable id for the section (used by the page's "On this page" links). */
    id?: string;
    /** The scheme to check with — the page's draft, forced on. */
    scheme: BlockScheme;
    /** "Try it": show this word in the "Try a word" preview. */
    onTryWord: (wordId: number) => void;
}

/** One finished check and the scheme it ran against. */
interface CheckedReport {
    result: WordCheckResult;
    scheme: BlockScheme;
}

type RowGroup = 'unplaced' | 'lone' | 'unreadable';

const ROW_GROUPS: { group: RowGroup; title: string; list: (r: WordCheckResult) => WordCheckList }[] = [
    { group: 'unplaced', title: 'Signs drawn on their own', list: (r) => r.unplaced },
    { group: 'lone', title: 'Consonants with no vowel', list: (r) => r.loneConsonants },
    { group: 'unreadable', title: 'Signs that cannot be read', list: (r) => r.unreadable },
];

function counted(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`;
}

export default function WordCheck({ id, scheme, onTryWord }: WordCheckProps) {
    const { data } = useEtymolog();
    const titleId = useId();
    // Whole values read out first (P8).
    const lexicon = data.lexiconComplete;
    const graphemeMap = data.graphemeMap;

    const [report, setReport] = useState<CheckedReport | null>(null);
    // Bumped per run so each fresh report re-opens its first group.
    const [run, setRun] = useState(0);

    const spelled = lexicon.filter((word) => word.spellingDisplay.length > 0).length;

    const handleCheck = () => {
        setReport({ result: checkWords(lexicon, scheme, graphemeMap), scheme });
        setRun((n) => n + 1);
    };

    const result = report?.result ?? null;
    const stale = report !== null && report.scheme !== scheme;
    const groups = result ? ROW_GROUPS.filter(({ list }) => list(result).count > 0) : [];

    return (
        <section id={id} className={styles.section} aria-labelledby={titleId} data-word-check-section="">
            <div className={styles.sectionHeader}>
                <h3 id={titleId} className={styles.sectionTitle}>Check all my words</h3>
                <Button
                    type="button"
                    onClick={handleCheck}
                    disabled={spelled === 0}
                    className={buttonStyles.secondary}
                >
                    {`Check ${counted(spelled, 'word', 'words')}`}
                </Button>
            </div>
            <p className={styles.hint}>
                Runs the settings and templates above, unsaved changes included, over every spelled word.
            </p>
            {spelled === 0 && <p className={styles.caption}>No spelled words yet — add a word to the lexicon first.</p>}

            {result && (
                <div className={styles.wordCheckReport} data-word-check="" key={run}>
                    {stale && (
                        <p className={settingsStyles.note} role="status" data-word-check-stale="">
                            Settings changed since this check — run it again
                        </p>
                    )}
                    <p className={styles.caption} data-word-check-status="">
                        {`${counted(result.checked, 'word', 'words')} checked · ${result.clean} split cleanly`}
                    </p>
                    {groups.map(({ group, title, list }, g) => {
                        const { rows, count } = list(result);
                        return (
                            <details key={group} className={styles.wordCheckGroup} open={g === 0} data-word-check-group={group}>
                                <summary className={styles.wordCheckSummary}>{`${title} (${count})`}</summary>
                                <ul className={styles.wordCheckRows}>
                                    {rows.map((row) => (
                                        <li key={row.wordId} className={styles.wordCheckRow} data-word-check-row={row.wordId}>
                                            <span className={styles.wordCheckLabel}>{row.label}</span>
                                            <span className={styles.wordCheckReadout}>{`— ${row.readout}`}</span>
                                            <span className={styles.wordCheckDetail}>{`— ${row.detail}`}</span>
                                            <Button
                                                type="button"
                                                onClick={() => onTryWord(row.wordId)}
                                                className={buttonStyles.secondary}
                                                aria-label={`Try it: ${row.label}`}
                                            >
                                                Try it
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                                {count > rows.length && (
                                    <p className={styles.caption}>{`Showing the first ${rows.length} of ${count}.`}</p>
                                )}
                            </details>
                        );
                    })}
                    {result.unusedTemplates.length > 0 && (
                        <div data-word-check-group="unused">
                            <p className={styles.caption}>{`Templates no word uses (${result.unusedTemplates.length}):`}</p>
                            <ul className={styles.caption}>
                                {result.unusedTemplates.map((template) => (
                                    <li key={template.id}>{template.name}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
