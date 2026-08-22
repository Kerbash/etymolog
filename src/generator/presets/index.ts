/**
 * @fileoverview The flavour presets — registry and application.
 *
 * Seven presets, one module each under `data/`, collected here in the order they
 * are shown to the user. The registry is an ARRAY rather than a record because
 * the order is a decision (safe and familiar first, opinionated last) and a
 * record's key order is not something to rely on.
 *
 * @module generator/presets
 */

import { FLOWING_PRESET } from './data/flowing';
import { ISLAND_PRESET } from './data/island';
import { JAPANESE_PRESET } from './data/japanese';
import { SINITIC_PRESET } from './data/sinitic';
import { ROMANCE_PRESET } from './data/romance';
import { GUTTURAL_PRESET } from './data/guttural';
import { SLAVIC_PRESET } from './data/slavic';
import type { FlavourPreset, PresetId } from './types';
import type { FrequencyTilt, WordGeneratorProfile } from '../profile/types';

export type { FlavourPreset, PresetId, PresetProfile, PresetSounds, PresetVowels } from './types';

// The chart guide is computed from a preset, so it is re-exported here: a caller
// that has a preset should not have to know which module the tiering lives in.
export { computeCoverage, guideMapFor } from '../coverage';
export type { CoverageSet, GuideMap, GuideTier, PresetCoverage } from '../coverage';

/**
 * Every preset, in display order.
 *
 * Flowing and island first — they are the two that produce readable words with
 * no further thought. Guttural and slavic last: they are the ones whose output
 * a beginner is most likely to mistake for a bug.
 */
export const PRESETS: readonly FlavourPreset[] = [
    FLOWING_PRESET,
    ISLAND_PRESET,
    JAPANESE_PRESET,
    SINITIC_PRESET,
    ROMANCE_PRESET,
    GUTTURAL_PRESET,
    SLAVIC_PRESET,
];

/** The ids, in the same order as {@link PRESETS}. */
export const PRESET_IDS: readonly PresetId[] = PRESETS.map((preset) => preset.id);

/** Look a preset up by id. `null` — not a throw — for an id from stale settings or a hand-edited URL. */
export function getPreset(id: string | null | undefined): FlavourPreset | null {
    if (!id) return null;
    return PRESETS.find((preset) => preset.id === id) ?? null;
}

/**
 * Every sound a preset would put in an inventory: core, flavour and both vowel
 * tiers, deduplicated, consonants before vowels.
 *
 * `avoid` is NOT included — it is the tier that says "not this".
 */
export function presetInventory(preset: FlavourPreset): string[] {
    const out: string[] = [];
    for (const sound of [
        ...preset.sounds.core,
        ...preset.sounds.flavour,
        ...preset.vowels.core,
        ...preset.vowels.flavour,
    ]) {
        if (!out.includes(sound)) out.push(sound);
    }
    return out;
}

/**
 * Apply a preset to a profile.
 *
 * A preset OVERWRITES: templates, counts, constraints, inventory and tilts all
 * come from it. Partial merges were considered and rejected — a preset's
 * templates assume its inventory (Sinitic's `CV[nŋ]` is meaningless without ŋ)
 * and its constraints assume its templates, so half a preset is a profile that
 * contradicts itself in ways the user cannot see.
 *
 * The inventory becomes an EXPLICIT list rather than staying empty ("use my
 * script's sounds"), because the commonest user of a preset is someone who has
 * not built a script yet and would otherwise get an empty batch. The generator
 * page offers the switch back.
 *
 * `current` is the base of the spread, so any profile field a preset does not
 * carry keeps its existing value; today `PresetProfile` covers all of them, and
 * the spread is what keeps that true if the profile type grows a field.
 *
 * The result is deep-cloned: the caller stores it in settings and the UI edits
 * it in place, and a shared array would let that edit reach back into the
 * preset module and change it for the rest of the session.
 */
export function applyPreset(
    preset: FlavourPreset,
    current: WordGeneratorProfile,
): WordGeneratorProfile {
    const tilt: Record<string, FrequencyTilt> = { ...(preset.profile.phonemeTilt ?? {}) };
    return structuredClone({
        ...current,
        ...preset.profile,
        version: 1,
        presetId: preset.id,
        inventory: presetInventory(preset),
        phonemeTilt: tilt,
    });
}
