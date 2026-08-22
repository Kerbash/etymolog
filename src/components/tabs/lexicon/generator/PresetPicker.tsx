/**
 * PresetPicker — section 01, "Flavour".
 *
 * ```
 *  ┌ Elvish / flowing ────────┐ ┌ Island ─────────────────┐
 *  │ Liquid consonants, …     │ │ Open syllables, …       │
 *  │ Sindarin · Welsh         │ │ Hawaiian · Samoan       │
 *  │ elmiˈen  nawel  …        │ │ tanoa  kaiwe  …         │
 *  └──────────────────────────┘ └─────────────────────────┘
 *  Your script has 4 of 9 core sounds — missing θ ð ʎ · Show on the IPA chart
 * ```
 *
 * Each card is a `<label>` around a REAL `<input type="radio">`, visually
 * hidden. That is the whole accessibility story for this control and it is why
 * it is not a grid of `<button role="radio">`: the native group already gives
 * arrow-key movement between cards, space to select, ONE tab stop for the whole
 * group, and "Elvish / flowing, radio button, 1 of 8" announced — four
 * behaviours that a button group has to reimplement in a `keydown` handler and
 * that were wrong in every hand-rolled version of this pattern.
 *
 * "Custom" is a real, selectable option rather than a state the UI infers. A
 * radio you can see but cannot choose is a broken control; choosing it clears
 * the provenance label (`presetId`) and touches nothing else, because the
 * profile in front of the user IS their custom one.
 *
 * @module tabs/lexicon/generator/PresetPicker
 */

import { useId, useMemo } from 'react';
import classNames from 'classnames';
import { Link } from 'react-router-dom';

import { computeCoverage, PRESETS, type FlavourPreset } from '../../../../generator';
import { ROUTES } from '../../../../url_mapping';

import styles from './generator.module.scss';

/** How many missing core sounds are named before the line is truncated. */
const MISSING_SHOWN = 6;

export interface PresetPickerProps {
    /**
     * The RESOLVED preset, or `null` for "Custom".
     *
     * Resolved rather than the raw id on purpose: `presetId` is validated as
     * any non-empty string, so a hand-edited settings file or a flavour a later
     * build dropped can leave an id nothing matches. That case has to select
     * "Custom" — a radio group with nothing selected reads as a broken control
     * rather than as "no flavour", which is what is actually true.
     */
    preset: FlavourPreset | null;
    /** Every phoneme the user's script has, for the coverage line. */
    conlangPhonemes: readonly string[];
    /** `null` means "Custom". */
    onChoose: (id: string | null) => void;
}

export default function PresetPicker({ preset, conlangPhonemes, onChoose }: PresetPickerProps) {
    const groupName = useId();

    const coverage = useMemo(
        () => (preset && conlangPhonemes.length > 0 ? computeCoverage(preset, conlangPhonemes) : null),
        [preset, conlangPhonemes],
    );

    return (
        <>
            <div className={styles.presetGrid} role="radiogroup" aria-label="Flavour">
                {PRESETS.map((entry) => {
                    const selected = preset?.id === entry.id;
                    return (
                        <label
                            key={entry.id}
                            className={classNames(styles.presetCard, {
                                [styles.presetCardSelected]: selected,
                            })}
                        >
                            <input
                                type="radio"
                                className={styles.visuallyHidden}
                                name={groupName}
                                value={entry.id}
                                checked={selected}
                                onChange={() => onChoose(entry.id)}
                            />
                            <span className={styles.presetName}>{entry.name}</span>
                            <span className={styles.presetTagline}>{entry.tagline}</span>
                            {entry.touchstones.length > 0 && (
                                <span className={styles.presetTouchstones}>
                                    {entry.touchstones.join(' · ')}
                                </span>
                            )}
                            {entry.examples.length > 0 && (
                                <span className={styles.presetExamples}>
                                    {entry.examples.slice(0, 6).join('  ')}
                                </span>
                            )}
                        </label>
                    );
                })}

                <label
                    className={classNames(styles.presetCard, {
                        [styles.presetCardSelected]: preset === null,
                    })}
                >
                    <input
                        type="radio"
                        className={styles.visuallyHidden}
                        name={groupName}
                        value=""
                        checked={preset === null}
                        onChange={() => onChoose(null)}
                    />
                    <span className={styles.presetName}>Custom</span>
                    <span className={styles.presetTagline}>
                        Your own sounds and shapes, with no flavour applied.
                    </span>
                </label>
            </div>

            {coverage && (
                <p className={styles.coverage}>
                    {`Your script has ${coverage.core.present.length} of ${
                        coverage.core.present.length + coverage.core.missing.length
                    } core sounds`}
                    {coverage.core.missing.length > 0 && (
                        <>
                            {' — missing '}
                            <span className={styles.coverageMissing}>
                                {coverage.core.missing.slice(0, MISSING_SHOWN).join(' ')}
                            </span>
                            {coverage.core.missing.length > MISSING_SHOWN
                                ? ` and ${coverage.core.missing.length - MISSING_SHOWN} more`
                                : ''}
                        </>
                    )}
                    {' · '}
                    {/* The chart's guide is already set to this flavour — the
                        one write that applies a preset sets both. */}
                    <Link className={styles.linkAction} to={ROUTES.scriptMakerChart}>
                        Show on the IPA chart
                    </Link>
                </p>
            )}
        </>
    );
}
