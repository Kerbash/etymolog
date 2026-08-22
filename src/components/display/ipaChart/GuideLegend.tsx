/**
 * GuideLegend — what the three colours on the chart mean, and how well the
 * user's own script already fits the flavour.
 *
 * ```
 *  ┌────────────────────────────────────────────────────────────┐
 *  │ Elvish / flowing — Liquid consonants, open vowels, …        │
 *  │ ▣ Core · 17 (4 in your script)   The sounds the flavour …   │
 *  │ ▣ Flavour · 8                    Optional colour …          │
 *  │ ▣ Avoid · 9 (1 in your script)   These break the illusion … │
 *  │ Generate words with this flavour · Why it sounds like this  │
 *  └────────────────────────────────────────────────────────────┘
 * ```
 *
 * It is deliberately OUTSIDE the pannable canvas: a legend that pans and zooms
 * away with the chart is a legend you cannot read while looking at what it
 * explains.
 *
 * The counts come from `computeCoverage`, the same function the generator page
 * uses, so the chart and the generator can never quote different numbers for
 * the same script — and they arrive as a PROP, already computed by
 * `useGuidePreset`, rather than being recomputed here from the phoneme list.
 * The hook needs the coverage anyway (for the page's "4 / 9" fact), so a second
 * computation was one more place for the two numbers to drift apart.
 *
 * @module display/ipaChart/GuideLegend
 */

import { useMemo } from 'react';
import classNames from 'classnames';
import { Link } from 'react-router-dom';

import {
    phonemeIdentity,
    type FlavourPreset,
    type GuideTier,
    type PresetCoverage,
} from '../../../generator';
import { ROUTES } from '../../../url_mapping';
import {
    GUIDE_GENERATE_LINK_LABEL,
    GUIDE_TIERS,
    GUIDE_TIER_DESCRIPTIONS,
    GUIDE_TIER_LABELS,
    GUIDE_WHY_LABEL,
} from './guideTiers';

import styles from './guideLegend.module.scss';

export interface GuideLegendProps {
    /** The preset being painted. The legend is not rendered at all when there is none. */
    preset: FlavourPreset;
    /**
     * The preset measured against the user's script, from `useGuidePreset`.
     * Passed in rather than derived here so the legend stays a pure function of
     * its props and cannot quote a different number from the fact strip above
     * it.
     */
    coverage: PresetCoverage;
    /** Opens the page explainer at the preset's `why` paragraph. */
    onShowWhy?: () => void;
    /**
     * Whether that explainer is currently open. Drives `aria-expanded` on the
     * "why" control, which is a TOGGLE, not a one-way switch: a button that
     * reports itself as a button and never says what it did leaves a screen
     * reader user pressing it repeatedly with no feedback.
     */
    whyOpen?: boolean;
    /** The id of the element `onShowWhy` reveals, for `aria-controls`. */
    whyTargetId?: string;
    /** Optional class name. */
    className?: string;
}

interface TierCount {
    total: number;
    inScript: number;
    /** Whether "(n in your script)" is worth saying for this tier. */
    showInScript: boolean;
}

/** Tier to swatch class — a lookup so an unknown tier cannot inject a class name. */
const SWATCH_CLASS: Record<GuideTier, string> = {
    core: styles.swatchCore,
    flavour: styles.swatchFlavour,
    avoid: styles.swatchAvoid,
};

export default function GuideLegend({
    preset,
    coverage,
    onShowWhy,
    whyOpen = false,
    whyTargetId,
    className,
}: GuideLegendProps) {
    const counts = useMemo<Record<GuideTier, TierCount>>(
        () => ({
            core: {
                total: coverage.core.present.length + coverage.core.missing.length,
                inScript: coverage.core.present.length,
                // Always stated for core, even at zero: "0 in your script" is
                // the single most useful number on this panel for someone who
                // has just picked a flavour and has not built a script yet.
                showInScript: true,
            },
            flavour: {
                total: coverage.flavour.present.length + coverage.flavour.missing.length,
                inScript: coverage.flavour.present.length,
                showInScript: coverage.flavour.present.length > 0,
            },
            avoid: {
                // Deduplicated by IDENTITY, like the other two tiers (which get
                // it from `computeCoverage`'s `tierSounds`). A raw `.length`
                // counted two spellings of one sound twice, so a preset listing
                // both `t͡ʃ` and `tʃ` under `avoid` would advertise one more
                // sound to avoid than the chart dims.
                total: new Set(preset.sounds.avoid.map(phonemeIdentity)).size,
                inScript: coverage.avoidPresent.length,
                // Only worth saying when it is true: "0 in your script" next to
                // "Avoid" reads as a reprimand for something that did not happen.
                showInScript: coverage.avoidPresent.length > 0,
            },
        }),
        [coverage, preset],
    );

    return (
        <aside className={classNames(styles.legend, className)} aria-label={`${preset.name} guide`}>
            <p className={styles.tagline}>
                <strong className={styles.presetName}>{preset.name}</strong>
                <span className={styles.taglineText}> — {preset.tagline}</span>
            </p>

            <ul className={styles.tiers}>
                {GUIDE_TIERS.map((tier) => {
                    const row = counts[tier];
                    return (
                        <li key={tier} className={styles.tier}>
                            <span
                                className={classNames(styles.swatch, SWATCH_CLASS[tier])}
                                aria-hidden="true"
                            />
                            <span className={styles.tierLabel}>
                                {GUIDE_TIER_LABELS[tier]} · {row.total}
                                {row.showInScript ? ` (${row.inScript} in your script)` : ''}
                            </span>
                            <span className={styles.tierDescription}>
                                {GUIDE_TIER_DESCRIPTIONS[tier]}
                            </span>
                        </li>
                    );
                })}
            </ul>

            <p className={styles.actions}>
                <Link
                    className={styles.action}
                    to={`${ROUTES.lexiconGenerate}?preset=${encodeURIComponent(preset.id)}`}
                >
                    {GUIDE_GENERATE_LINK_LABEL}
                </Link>
                {onShowWhy && (
                    <button
                        type="button"
                        className={styles.action}
                        onClick={onShowWhy}
                        aria-controls={whyTargetId}
                        aria-expanded={whyOpen}
                    >
                        {GUIDE_WHY_LABEL}
                    </button>
                )}
            </p>
        </aside>
    );
}
