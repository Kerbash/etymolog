/**
 * ScriptSpacingSettings — the two conlang-wide spacing controls
 * (SCRIPT_SPACING_PLAN.md §5), shown BELOW the rule tables on the Writing
 * System page and in the "Spacing" section on the Blocks page.
 *
 *  - **Letter spacing** — how far apart consecutive letters / blocks sit within
 *    a word. Writes `writingSystem.letterSpacing` (spread whole; the update is
 *    strict). `auto` keeps each view's own preset.
 *  - **Word separation** — {@link WordSeparationSetting}, a front-end over the
 *    existing `punctuation.wordSeparator`.
 *
 * Both save IMMEDIATELY (through `useApiAction`), unlike the Blocks page's scheme
 * draft which waits for Save — the caller says so where it is placed.
 */

import { useCallback, useId } from 'react';

import { useEtymolog } from '../../../db';
import { useApiAction } from '../../shared';
import { LETTER_SPACING_OPTIONS } from './scriptSpacingOptions';
import WordSeparationSetting from './WordSeparationSetting';

import styles from './scriptSpacing.module.scss';

export default function ScriptSpacingSettings() {
    const { api, settings } = useEtymolog();
    const runApiAction = useApiAction();
    const fieldId = useId();

    const writingSystem = settings.writingSystem;
    const letterSpacing = writingSystem.letterSpacing;

    const handleLetterSpacing = useCallback(
        (value: string) => {
            // Strict update: spread the whole sub-object (an unknown key or bad
            // enum rejects the entire write).
            void runApiAction(
                () => api.settings.update({ writingSystem: { ...writingSystem, letterSpacing: value as typeof letterSpacing } }),
                { errorTitle: 'Could not save the letter spacing', success: 'Letter spacing saved.' },
            );
        },
        [api, runApiAction, writingSystem],
    );

    return (
        <div className={styles.group}>
            <div className={styles.field}>
                <label className={styles.label} htmlFor={`${fieldId}-letter`}>
                    Letter spacing
                </label>
                <span className={styles.description}>
                    How far apart consecutive letters and blocks sit within a word.
                </span>
                <div className={styles.controls}>
                    <select
                        id={`${fieldId}-letter`}
                        className={letterSpacing !== 'auto' ? `${styles.select} ${styles.modified}` : styles.select}
                        data-letter-spacing=""
                        value={letterSpacing}
                        onChange={(event) => handleLetterSpacing(event.target.value)}
                    >
                        {LETTER_SPACING_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <WordSeparationSetting />
        </div>
    );
}
