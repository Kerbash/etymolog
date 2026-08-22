/**
 * ConstraintsEditor — section 04, "Constraints".
 *
 * ```
 *  Clusters must rise and fall in sonority          [ ●  ]
 *  Allow s + stop at the start of a word            [ ●  ]
 *  Allow doubled consonants (kat.ta)                [  ● ]
 *  Vowel harmony (front / back)                     [  ● ]
 *  Consonant clusters per word   [2 ▾]
 *  Never generate  [ mb  nd ]  → chips
 * ```
 *
 * The four switches are the rules that decide whether a candidate word
 * survives, and they are phrased as what they ALLOW rather than as what they
 * forbid — a switch labelled "no geminates" is on when there are none, which is
 * the reading half of all users get backwards.
 *
 * The forbidden box holds the whole list as text, space- or comma-separated,
 * and the chips below it are the parsed result. That is deliberate: it is the
 * one field where a user pastes several sequences at once, and a one-at-a-time
 * "add" box would make that four round trips. Removing is per-chip, because
 * hunting for one sequence inside a text field is the part that is unpleasant.
 *
 * @module tabs/lexicon/generator/ConstraintsEditor
 */

import { useCallback, useId } from 'react';
import classNames from 'classnames';

import CyberSwitch from 'cyber-components/interactable/switch/switch/switch.tsx';

import { LIMITS, type ClusterRules, type WordGeneratorProfile } from '../../../../generator';
import { parseForbidden } from './generatorText';
import { useDraftText } from './useDraftText';
import type { ProfilePatch } from './useGeneratorProfile';

import styles from './generator.module.scss';

/** Cluster budgets, from the shared limits so the UI cannot offer a rejected value. */
const CLUSTER_BUDGETS = Array.from(
    { length: LIMITS.MAX_CLUSTERS_PER_WORD + 1 },
    (_unused, index) => index,
);

export interface ConstraintsEditorProps {
    profile: WordGeneratorProfile;
    onUpdate: (patch: ProfilePatch) => void;
    onUpdateDebounced: (patch: ProfilePatch) => void;
    onFlush: () => void;
}

interface SwitchRowProps {
    label: string;
    hint: string;
    value: boolean;
    onChange: (next: boolean) => void;
}

function SwitchRow({ label, hint, value, onChange }: SwitchRowProps) {
    return (
        <div className={styles.switchRow}>
            <span className={styles.switchText}>
                <span className={styles.switchLabel}>{label}</span>
                <span className={styles.switchHint}>{hint}</span>
            </span>
            {/* The switch carries its own accessible name: it renders no
                `<input>`, so a `<label htmlFor>` would point at nothing. */}
            <CyberSwitch value={value} onChange={onChange} width="3em" aria-label={label} />
        </div>
    );
}

export default function ConstraintsEditor({
    profile,
    onUpdate,
    onUpdateDebounced,
    onFlush,
}: ConstraintsEditorProps) {
    const fieldId = useId();

    const setCluster = useCallback(
        <K extends keyof ClusterRules>(key: K, value: ClusterRules[K]) => {
            onUpdate((current) => ({ clusters: { ...current.clusters, [key]: value } }));
        },
        [onUpdate],
    );

    const forbidden = useDraftText(profile.forbidden.join(' '), {
        // The profile object as the epoch: any write replaces it, which is the
        // signal that this box's text is no longer an edit of what is stored.
        epoch: profile,
        commit: (next) => onUpdateDebounced({ forbidden: parseForbidden(next) }),
        flush: onFlush,
    });

    return (
        <>
            <SwitchRow
                label="Clusters must rise and fall in sonority"
                hint="Onsets get louder towards the vowel, codas quieter away from it — the shape most languages share."
                value={profile.clusters.sonority}
                onChange={(next) => setCluster('sonority', next)}
            />
            <SwitchRow
                label="Allow s + stop at the start of a word"
                hint="The exception every sonority rule has to make: st-, sp-, sk-."
                value={profile.clusters.sibilantOnsetException}
                onChange={(next) => setCluster('sibilantOnsetException', next)}
            />
            <SwitchRow
                label="Allow doubled consonants"
                hint="A consonant on both sides of a syllable break, as in kat·ta."
                value={profile.clusters.allowGeminates}
                onChange={(next) => setCluster('allowGeminates', next)}
            />
            <SwitchRow
                label="Vowel harmony (front and back)"
                hint="Every vowel in a word shares a bucket; central vowels go with either. Finnish and Turkish work this way."
                value={profile.vowelHarmony === 'frontBack'}
                onChange={(next) => onUpdate({ vowelHarmony: next ? 'frontBack' : 'off' })}
            />

            <div className={styles.rangeRow}>
                <label className={styles.fieldLabel} htmlFor={`${fieldId}-clusters`}>
                    Consonant clusters per word
                </label>
                <select
                    id={`${fieldId}-clusters`}
                    className={styles.select}
                    value={profile.clusters.maxPerWord}
                    onChange={(event) => setCluster('maxPerWord', Number(event.target.value))}
                >
                    {CLUSTER_BUDGETS.map((budget) => (
                        <option key={budget} value={budget}>
                            {budget}
                        </option>
                    ))}
                </select>
            </div>

            <div className={styles.addField}>
                <label className={styles.fieldLabel} htmlFor={`${fieldId}-forbidden`}>
                    Never generate
                </label>
                <input
                    id={`${fieldId}-forbidden`}
                    type="text"
                    className={classNames(styles.textInput, styles.monoInput)}
                    value={forbidden.value}
                    placeholder="mb nd ŋg"
                    onChange={(event) => forbidden.change(event.target.value)}
                    onBlur={forbidden.blur}
                />
                <span className={styles.sectionHint}>
                    Separate with spaces or commas. Each is rejected anywhere in a word.
                </span>
            </div>

            {profile.forbidden.length > 0 && (
                <ul className={styles.chips}>
                    {profile.forbidden.map((sequence) => (
                        <li key={sequence} className={styles.chip}>
                            <span className={classNames(styles.chipButton, styles.chipSound)}>
                                {sequence}
                            </span>
                            <button
                                type="button"
                                className={styles.chipRemove}
                                onClick={() =>
                                    onUpdate((current) => ({
                                        forbidden: current.forbidden.filter(
                                            (entry) => entry !== sequence,
                                        ),
                                    }))
                                }
                                aria-label={`Stop forbidding ${sequence}`}
                            >
                                ✕
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}
