/**
 * IPAExtraSoundsChart — the sounds the two big charts have no cell for.
 *
 * ```
 *  Affricates & other sounds
 *  Affricates   t͡s d͡z t͡ʃ d͡ʒ ʈ͡ʂ ɖ͡ʐ t͡ɕ d͡ʑ t͡ɬ d͡ɮ
 *  Other        ɕ ʑ w ʍ ɫ ɚ ɝ ɹ̠
 *  Clicks       ʘ ǀ ǃ ǂ ǁ
 *  Implosives   ɓ ɗ ʄ ɠ ʛ
 * ```
 *
 * WHY IT EXISTS. The pulmonic grid and the vowel trapezoid between them draw
 * about 130 symbols, and every one of the flavour presets reaches outside that
 * set: `t͡ʃ` and `w` are core to four of the seven, `ɕ` to two. Before this
 * strip, those sounds were counted in the guide legend ("Core · 17") and then
 * never painted, because there was no cell to paint — the panel said seventeen
 * and the chart lit twelve, with nothing on screen to explain the gap. They are
 * also, separately, sounds a user wants to assign a grapheme to: `onClick` is
 * the same handler the other charts use, so clicking one starts a grapheme with
 * that phoneme prefilled exactly as clicking `p` does.
 *
 * WHY IT IS A STRIP AND NOT A TABLE. These four groups have no shared axis —
 * affricates are place × voicing, clicks are place alone, the extras are a
 * grab-bag of things the chart's categories cannot express. Any grid drawn over
 * them would be mostly holes. A labelled row of cells per group says the same
 * thing without inventing structure.
 *
 * THE DATA IS DERIVED, NEVER TRANSCRIBED. The affricates, clicks and implosives
 * come from `src/data/ipaChartData.ts` (the same tables the feature lookup is
 * built from) and the "other" row from `EXTRA_SYMBOLS` in
 * `generator/phonology/features.ts`, filtered to the symbols the two main
 * charts do not already draw. A hand-copied list here would drift from the
 * lookup table, and the drift would show up as a cell that lights on the chart
 * for a sound the generator refuses to use.
 *
 * @module display/ipaChart/IPAExtraSoundsChart
 */

import { useCallback, useMemo } from 'react';
import classNames from 'classnames';

import IPAChartCell from './IPAChartCell';
import type { GuideOverlayProps } from './types';
import type { GraphemeComplete } from '../../../db/types';
import {
    getAllConsonantSymbols,
    getAllVowelSymbols,
    IPA_AFFRICATES,
    IPA_CLICKS,
    IPA_IMPLOSIVES,
} from '../../../data/ipaChartData';
import { describePhonemeLabel, EXTRA_SYMBOLS, phonemeIdentity } from '../../../generator';

import styles from './IPAExtraSoundsChart.module.scss';

/** One sound in the strip: what to draw, and what to say about it. */
interface ExtraSound {
    ipa: string;
    description: string;
}

interface ExtraGroup {
    key: string;
    label: string;
    sounds: ExtraSound[];
}

/** Everything the pulmonic table and the vowel trapezoid already draw. */
const MAIN_CHART_SYMBOLS: ReadonlySet<string> = new Set([
    ...getAllConsonantSymbols(),
    ...getAllVowelSymbols(),
]);

/**
 * The groups, built ONCE at module load from the shared data.
 *
 * `describePhonemeLabel` supplies the description wherever the source table
 * does not ship one, so the tooltip on `ɕ` reads like the tooltip on `s` rather
 * than being blank — and it reads it out of the same feature table the classes
 * and the sonority scale use.
 */
const EXTRA_GROUPS: readonly ExtraGroup[] = [
    {
        key: 'affricates',
        label: 'Affricates',
        // The tie-bar spelling (U+0361) is the chart's own: it is what
        // `IPA_AFFRICATES` stores and what `describePhoneme(...).base` returns
        // for every other spelling, so it is the key the guide map is built on.
        sounds: IPA_AFFRICATES.map((entry) => ({ ipa: entry.ipa, description: entry.description })),
    },
    {
        key: 'other',
        label: 'Other',
        sounds: EXTRA_SYMBOLS.filter(
            (entry): entry is Extract<typeof entry, { role: 'symbol' }> =>
                // Modifiers (`ʼ`) are not sounds and have no cell; anything the
                // main charts already draw would be a second copy of one.
                entry.role === 'symbol' && !MAIN_CHART_SYMBOLS.has(entry.ipa),
        ).map((entry) => ({
            ipa: entry.ipa,
            description: describePhonemeLabel(entry.ipa),
        })),
    },
    {
        key: 'clicks',
        label: 'Clicks',
        sounds: IPA_CLICKS.map((entry) => ({ ipa: entry.ipa, description: entry.description })),
    },
    {
        key: 'implosives',
        label: 'Implosives',
        sounds: IPA_IMPLOSIVES.map((entry) => ({ ipa: entry.ipa, description: entry.description })),
    },
];

export interface IPAExtraSoundsChartProps extends GuideOverlayProps {
    /** Map of phonemes to graphemes for lookup */
    phonemeMap: Map<string, GraphemeComplete>;
    /** Click handler for IPA cells */
    onCellClick?: (ipa: string, grapheme?: GraphemeComplete | null) => void;
    /** Whether the chart is loading */
    isLoading?: boolean;
    /** Optional class name */
    className?: string;
}

/**
 * IPAExtraSoundsChart - the affricate / click / implosive / odds-and-ends strip.
 *
 * @example
 * <IPAExtraSoundsChart
 *   phonemeMap={phonemeMap}
 *   onCellClick={(ipa, grapheme) => handleNavigation(ipa, grapheme)}
 *   guide={guideMapFor(preset)}
 *   guideLabel={preset.name}
 * />
 */
export default function IPAExtraSoundsChart({
    phonemeMap,
    onCellClick,
    isLoading = false,
    className,
    guide = null,
    guideLabel,
}: IPAExtraSoundsChartProps) {
    /**
     * The script's graphemes, keyed by SOUND rather than by spelling.
     *
     * The other two charts can look a symbol straight up in `phonemeMap`
     * because a user who wants to write `p` types `p`. This strip cannot: the
     * cell is `t͡ʃ` (tie bar, U+0361) and the phoneme row almost always says
     * `tʃ`, which is the spelling people actually type — a straight `get` would
     * report the sound as unassigned and offer to create a second grapheme for
     * a sound the script already writes. `phonemeIdentity` is the same
     * comparison the coverage split and the inventory use, so the chart and the
     * legend cannot disagree about whether a sound is in the script.
     */
    const graphemeByIdentity = useMemo(() => {
        const map = new Map<string, GraphemeComplete>();
        for (const [phoneme, grapheme] of phonemeMap) {
            const key = phonemeIdentity(phoneme);
            // First writer wins, matching `Map` iteration order, so a script
            // with both spellings shows the one it declared first.
            if (!map.has(key)) map.set(key, grapheme);
        }
        return map;
    }, [phonemeMap]);

    const getGrapheme = useCallback(
        (ipa: string) => phonemeMap.get(ipa) ?? graphemeByIdentity.get(phonemeIdentity(ipa)) ?? null,
        [phonemeMap, graphemeByIdentity],
    );

    const rows = useMemo(
        () =>
            EXTRA_GROUPS.map((group) => (
                <div key={group.key} className={styles.group}>
                    <h4 className={styles.groupLabel}>{group.label}</h4>
                    <div className={styles.groupCells}>
                        {group.sounds.map((sound) => (
                            <IPAChartCell
                                key={sound.ipa}
                                ipa={sound.ipa}
                                grapheme={getGrapheme(sound.ipa)}
                                onClick={onCellClick}
                                isLoading={isLoading}
                                size="small"
                                description={sound.description}
                                guide={guide?.get(sound.ipa) ?? null}
                                guideLabel={guideLabel}
                            />
                        ))}
                    </div>
                </div>
            )),
        // `guide` and `guideLabel` are dependencies for the same reason as in
        // the consonant chart: without them the memoised rows keep painting the
        // PREVIOUS flavour after the picker changes.
        [getGrapheme, onCellClick, isLoading, guide, guideLabel],
    );

    return (
        <div className={classNames(styles.extraChart, className)}>
            <h3 className={styles.chartTitle}>Affricates &amp; other sounds</h3>
            <div className={styles.groups}>{rows}</div>
        </div>
    );
}
