/**
 * @fileoverview `useGuidePreset` — the flavour guide, resolved once per page.
 *
 * The IPA chart page and the syllabary chart page need exactly the same four
 * derived values (the preset, the chart's guide map, the coverage against the
 * user's script, and the "4 / 9" fact) from exactly the same settings key. Two
 * copies of that derivation is two places for the chart and its legend to start
 * quoting different numbers, which is why it is one hook.
 *
 * A `.ts` module (not `.tsx`) because of `react-refresh/only-export-components`:
 * a hook and a component may not share a file.
 *
 * @module display/ipaChart/useGuidePreset
 */

import { useMemo } from 'react';

import { useEtymolog } from '../../../db';
import {
    computeCoverage,
    getPreset,
    guideMapFor,
    type FlavourPreset,
    type GuideMap,
    type PresetCoverage,
} from '../../../generator';

export interface GuidePresetState {
    /** The stored id, whatever it is — including one no preset matches. */
    presetId: string | null;
    /** The resolved preset, or `null` when the guide is off (or the id is stale). */
    preset: FlavourPreset | null;
    /** Base symbol to tier, ready for the charts. `null` when the guide is off. */
    guide: GuideMap | null;
    /** The preset's name, for the cell tooltips. `undefined` when the guide is off. */
    guideLabel: string | undefined;
    /** Coverage of the preset by the user's script. `null` when the guide is off. */
    coverage: PresetCoverage | null;
    /** `"4 / 9"` for the page's fact strip, or `null` when the guide is off. */
    coreFact: string | null;
    /**
     * Every phoneme the script has, memoised.
     *
     * The legend takes `coverage` rather than this list (Phase 6 — one
     * computation, not two), so nothing on the two chart pages reads it today;
     * it stays on the state because it is the input `coverage` was derived
     * from, and a caller measuring the script against a SECOND preset needs it.
     */
    phonemes: readonly string[];
}

/**
 * Resolve the guide for a chart page.
 *
 * @param phonemeMap the page's phoneme→grapheme map (its keys are the script's
 *   sounds). Passed in rather than looked up again so the coverage counts are
 *   computed from the SAME map the chart is painting.
 */
export function useGuidePreset(
    phonemeMap: ReadonlyMap<string, unknown>,
): GuidePresetState {
    const { settings } = useEtymolog();

    // A build older than Phase 2 stored no `wordGenerator` key at all; the
    // validator treats that as absent rather than invalid, so this can be
    // undefined and must not throw.
    const presetId = settings.wordGenerator?.guidePresetId ?? null;

    const preset = useMemo(() => getPreset(presetId), [presetId]);

    const phonemes = useMemo(() => Array.from(phonemeMap.keys()), [phonemeMap]);

    const guide = useMemo(() => (preset ? guideMapFor(preset) : null), [preset]);

    const coverage = useMemo(
        () => (preset ? computeCoverage(preset, phonemes) : null),
        [preset, phonemes],
    );

    const coreFact = useMemo(() => {
        if (!coverage) return null;
        const total = coverage.core.present.length + coverage.core.missing.length;
        return `${coverage.core.present.length} / ${total}`;
    }, [coverage]);

    return {
        presetId,
        preset,
        guide,
        guideLabel: preset?.name,
        coverage,
        coreFact,
        phonemes,
    };
}
