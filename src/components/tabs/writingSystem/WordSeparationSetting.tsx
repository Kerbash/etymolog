/**
 * WordSeparationSetting — the conlang-wide "how are words separated" control,
 * shown inside {@link ScriptSpacingSettings} on both the Writing System and
 * Blocks pages (SCRIPT_SPACING_PLAN.md §4).
 *
 * A front-end over the EXISTING `settings.punctuation.wordSeparator` — NO new
 * stored field. The mode is derived from that config
 * ({@link wordSeparationModeOf}) and every choice writes the WHOLE punctuation
 * object back (the strict-update pattern from the Punctuation page):
 *
 *  - **Space** → `{ graphemeId: null, useNoGlyph: false }` (the default virtual space);
 *  - **A glyph** → `{ graphemeId: <chosen>, useNoGlyph: false }`;
 *  - **Nothing** → `{ graphemeId: <kept>, useNoGlyph: true }` — words run on with
 *    no gap; the translator emits an invisible `word-break` so blocks never join
 *    across a word.
 *
 * Picking "A glyph" with nothing chosen writes nothing until a grapheme is
 * selected (a local-only pending state), so a half-made choice is never stored.
 */

import { useCallback, useId, useState } from 'react';

import { useEtymolog } from '../../../db';
import type { GraphemeComplete } from '../../../db/types';
import { useApiAction } from '../../shared';
import { wordSeparationModeOf, WORD_SEPARATION_HINTS, type WordSeparationMode } from './scriptSpacingOptions';

import styles from './scriptSpacing.module.scss';

export default function WordSeparationSetting() {
    const { api, data, settings } = useEtymolog();
    const runApiAction = useApiAction();
    const fieldId = useId();

    const punctuation = settings.punctuation;
    const config = punctuation.wordSeparator;
    const graphemes = data.graphemesComplete;

    const storedMode = wordSeparationModeOf(config);
    // "A glyph" chosen but none picked yet — local only, never stored.
    const [pendingGlyph, setPendingGlyph] = useState(false);
    const mode: WordSeparationMode = pendingGlyph ? 'glyph' : storedMode;

    const save = useCallback(
        (wordSeparator: { graphemeId: number | null; useNoGlyph: boolean }) =>
            runApiAction(
                () => api.settings.update({ punctuation: { ...punctuation, wordSeparator } }),
                { errorTitle: 'Could not save the word separation', success: 'Word separation saved.' },
            ),
        [api, punctuation, runApiAction],
    );

    const handleModeChange = useCallback(
        (next: WordSeparationMode) => {
            if (next === 'space') {
                setPendingGlyph(false);
                void save({ graphemeId: null, useNoGlyph: false });
            } else if (next === 'nothing') {
                setPendingGlyph(false);
                // Keep any assigned grapheme so switching back to "A glyph" restores it.
                void save({ graphemeId: config.graphemeId ?? null, useNoGlyph: true });
            } else if (config.graphemeId != null && !config.useNoGlyph) {
                // Already a glyph separator — nothing to write.
                setPendingGlyph(false);
            } else {
                // No grapheme yet: reveal the picker, write nothing until one is chosen.
                setPendingGlyph(true);
            }
        },
        [config.graphemeId, config.useNoGlyph, save],
    );

    const handleGraphemeChange = useCallback(
        (value: string) => {
            const graphemeId = Number(value);
            if (!Number.isInteger(graphemeId) || graphemeId <= 0) return;
            setPendingGlyph(false);
            void save({ graphemeId, useNoGlyph: false });
        },
        [save],
    );

    const graphemeValue = !pendingGlyph && config.graphemeId != null ? String(config.graphemeId) : '';

    return (
        <div className={styles.field}>
            <label className={styles.label} htmlFor={`${fieldId}-mode`}>
                Word separation
            </label>
            <span className={styles.description}>How words are told apart on the page.</span>
            <div className={styles.controls}>
                <select
                    id={`${fieldId}-mode`}
                    className={styles.select}
                    data-word-separation=""
                    value={mode}
                    onChange={(event) => handleModeChange(event.target.value as WordSeparationMode)}
                >
                    <option value="space">Space</option>
                    <option value="glyph">A glyph</option>
                    <option value="nothing">Nothing</option>
                </select>

                {mode === 'glyph' && (
                    <select
                        className={styles.select}
                        data-word-separator-grapheme=""
                        aria-label="Word separator grapheme"
                        value={graphemeValue}
                        onChange={(event) => handleGraphemeChange(event.target.value)}
                    >
                        <option value="">Select a grapheme…</option>
                        {[...graphemes]
                            .sort((a: GraphemeComplete, b: GraphemeComplete) => a.name.localeCompare(b.name))
                            .map((grapheme) => (
                                <option key={grapheme.id} value={String(grapheme.id)}>
                                    {grapheme.name}
                                </option>
                            ))}
                    </select>
                )}
            </div>
            <span className={styles.hint}>{WORD_SEPARATION_HINTS[mode]}</span>
        </div>
    );
}
