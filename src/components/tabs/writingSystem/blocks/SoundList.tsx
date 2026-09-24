/**
 * SoundList — one editable list of sounds in "Splitting words into blocks"
 * (CONLANG_EDGES_PLAN.md §5.1): the listed entries as removable chips, an add
 * row (button or Enter), a visible warning per entry that will not do
 * anything, the "up to 32" cap line, suggestion buttons and a live example.
 *
 * ```
 *  Vowels next to each other                           ← title
 *  Two vowel signs in a row are usually two syllables… ← description
 *  [ai ×] [au ×]   [ type a vowel pair… ] [Add]
 *  ng is not two vowels, so it will not join anything. ← warn(entry)
 *  Suggested from your word shapes: [+ ei]             ← only when any
 *  With ai: tai → tai. Without: tai → ta · i.          ← example
 * ```
 *
 * Used twice by `SplitSettings`: "Vowels next to each other"
 * (`split.diphthongs`, `dataPrefix: 'diphthong'`) and "Consonants that can
 * carry a syllable" (`split.syllabicConsonants`, `dataPrefix: 'syllabic'`).
 * `dataPrefix` names every `data-*` hook (`data-<prefix>-settings` on the
 * root; `data-<prefix>`, `-example`, `-warning`, `-suggestions`, `-cap`,
 * `-problem`), so the vowel list keeps the selectors it always had.
 *
 * Controlled: `onChange` receives the new list; the parent normalises it into
 * the split (`normalSplit`, the validator's own normaliser — N1). Entries are
 * added trimmed + NFC; an empty entry is ignored, one already listed counts
 * as done, past `MAX_SOUND_LIST` nothing is added (the cap line says why),
 * and an entry longer than `MAX_SOUND_LENGTH` letters is refused with a
 * visible reason. Suggestions are buttons; nothing is added by itself (P4).
 */

import { useId, useState } from 'react';
import type { ReactNode } from 'react';

import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';

import { MAX_SOUND_LENGTH, MAX_SOUND_LIST } from '../../../../blocks';
import { safeNormalize } from '../../../../generator/phonology/features';

import pageStyles from './blocksPage.module.scss';
import styles from './settings.module.scss';

export interface SoundListProps {
    /** The list's visible name (also the group's accessible name). */
    title: string;
    /** One or two plain sentences under the title. */
    description: ReactNode;
    /** The stored, normalised list. */
    list: readonly string[];
    /** Entries offered as "+ x" buttons (those already listed are hidden). */
    suggestions: readonly string[];
    /** The words before the suggestion buttons ("Suggested from your signs:"). */
    suggestionsLabel: string;
    /** `aria-label` of the text box ("Vowel pair"). */
    inputLabel: string;
    /** Placeholder of the text box ("type a vowel pair…"). */
    placeholder: string;
    /** `aria-label` of the chip list ("Vowel pairs kept together"). */
    listLabel: string;
    /** What one entry is called at the start of a sentence ("A vowel pair"). */
    noun: string;
    /** The visible warning for an entry that will not do anything, or `null` for a good one. */
    warn: (entry: string) => ReactNode | null;
    /** The live example line. */
    example: ReactNode;
    /** Names every `data-*` hook (`'diphthong'`, `'syllabic'`). */
    dataPrefix: string;
    /** The new list (the parent normalises it into the split). */
    onChange: (list: string[]) => void;
}

export default function SoundList({
    title,
    description,
    list,
    suggestions,
    suggestionsLabel,
    inputLabel,
    placeholder,
    listLabel,
    noun,
    warn,
    example,
    dataPrefix,
    onChange,
}: SoundListProps) {
    const idPrefix = useId();
    const titleId = `${idPrefix}-title`;
    const [text, setText] = useState('');
    const [problem, setProblem] = useState<string | null>(null);

    /** The `data-<prefix><suffix>` attribute, spread onto an element. */
    const hook = (suffix: string, value = ''): Record<string, string> => ({ [`data-${dataPrefix}${suffix}`]: value });

    const atCap = list.length >= MAX_SOUND_LIST;
    const offered = suggestions.filter((entry) => !list.includes(safeNormalize(entry.trim(), 'NFC')));
    const warnings = list.flatMap((entry) => {
        const warning = warn(entry);
        return warning === null ? [] : [{ entry, warning }];
    });

    /**
     * Add one entry: trimmed + NFC. Empty is ignored; an entry already listed
     * is ignored (and counts as done, so the typed text clears); past the cap
     * nothing is added and the visible "up to 32" line says why.
     */
    const add = (raw: string): boolean => {
        const entry = safeNormalize(raw.trim(), 'NFC');
        if (entry.length === 0) return false;
        if (list.includes(entry)) {
            setProblem(null);
            return true;
        }
        if (atCap) return false;
        if (Array.from(entry).length > MAX_SOUND_LENGTH) {
            setProblem(`${noun} can be at most ${MAX_SOUND_LENGTH} letters long.`);
            return false;
        }
        setProblem(null);
        onChange([...list, entry]);
        return true;
    };

    const addTyped = () => {
        if (add(text)) setText('');
    };

    return (
        <div className={styles.soundList} role="group" aria-labelledby={titleId} {...hook('-settings')}>
            <span id={titleId} className={styles.optionName}>
                {title}
            </span>
            <span className={styles.optionDescription}>{description}</span>

            <div className={styles.addRow}>
                {list.length > 0 && (
                    <ul className={`${pageStyles.chips} ${styles.chipList}`} aria-label={listLabel}>
                        {list.map((entry) => (
                            <li key={entry} className={pageStyles.chip} {...hook('', entry)}>
                                {entry}
                                <button
                                    type="button"
                                    className={styles.chipRemove}
                                    aria-label={`Remove ${entry}`}
                                    onClick={() => onChange(list.filter((other) => other !== entry))}
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <input
                    type="text"
                    className={pageStyles.input}
                    aria-label={inputLabel}
                    placeholder={placeholder}
                    value={text}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        addTyped();
                    }}
                />
                <Button type="button" className={buttonStyles.secondary} onClick={addTyped}>
                    Add
                </Button>
            </div>

            {atCap && (
                <p className={pageStyles.hint} {...hook('-cap')}>
                    You can list up to {MAX_SOUND_LIST}.
                </p>
            )}
            {problem !== null && (
                <p className={pageStyles.hint} {...hook('-problem')}>
                    {problem}
                </p>
            )}

            {warnings.map(({ entry, warning }) => (
                <p key={entry} className={styles.warning} {...hook('-warning', entry)}>
                    {warning}
                </p>
            ))}

            {offered.length > 0 && (
                <div className={styles.suggestions} {...hook('-suggestions')}>
                    <span className={styles.example}>{suggestionsLabel}</span>
                    {offered.map((entry) => (
                        <button
                            key={entry}
                            type="button"
                            className={`${pageStyles.chip} ${pageStyles.chipButton}`}
                            aria-label={`Add ${entry}`}
                            onClick={() => add(entry)}
                        >
                            + {entry}
                        </button>
                    ))}
                </div>
            )}

            <span className={styles.example} {...hook('-example')}>
                {example}
            </span>
        </div>
    );
}
