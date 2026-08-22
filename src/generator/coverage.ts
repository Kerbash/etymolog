/**
 * @fileoverview Preset against inventory: what the user's script already has.
 *
 * Two questions, one answer each, both asked by the UI rather than by the
 * engine:
 *
 *   - {@link computeCoverage} — "your script has 7 of 17 core sounds; these are
 *     the missing ones" (the generator page's coverage line, the chart legend's
 *     counts).
 *   - {@link guideMapFor} — "paint THIS chart cell as core / flavour / avoid"
 *     (the chart guide overlay).
 *
 * The whole file exists because STRING EQUALITY IS THE WRONG TEST. A user who
 * typed `tʃ` and a preset that says `t͡ʃ` mean the same sound; a user who typed
 * `pʰ` and a preset that says `p` do not. Comparison therefore runs on the
 * classified form — canonical base plus the set of modifiers — which gets both
 * of those right, and falls back to the normalised text for anything the
 * feature table cannot classify (so an unrecognised sound still matches an
 * identical unrecognised sound rather than matching nothing).
 *
 * @module generator/coverage
 */

import { describePhoneme, phonemeIdentity } from './phonology/features';
import type { FlavourPreset } from './presets/types';

/** Which tier of a preset's guide a sound belongs to. */
export type GuideTier = 'core' | 'flavour' | 'avoid';

/** A chart-ready guide: base symbol to tier. Read-only — the chart never writes to it. */
export type GuideMap = ReadonlyMap<string, GuideTier>;

/** One tier's split against a user's inventory. Both arrays are in the preset's own order. */
export interface CoverageSet {
    present: string[];
    missing: string[];
}

export interface PresetCoverage {
    core: CoverageSet;
    flavour: CoverageSet;
    /** Sounds the preset advises against that the user's script nevertheless has. */
    avoidPresent: string[];
    /** `core.present.length / (core.present.length + core.missing.length)`, or 0 for an empty core. */
    score: number;
}

// The identity a sound is compared by lives in `phonology/features.ts`
// (`phonemeIdentity`): canonical base + its modifiers as a set, so that `t͡ʃ`
// matches `tʃ` while `p` does not match `pʰ`. It is imported rather than
// restated because the inventory, the constraints and the commonness ranking
// compare sounds too, and two definitions of "the same sound" is a bug that
// shows up as a chart cell that will not light.

/** Consonants then vowels, in preset order, with sounds that resolve to the same key kept once. */
function tierSounds(preset: FlavourPreset, tier: 'core' | 'flavour'): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const sound of [...preset.sounds[tier], ...preset.vowels[tier]]) {
        const key = phonemeIdentity(sound);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(sound);
    }
    return out;
}

function split(sounds: readonly string[], have: ReadonlySet<string>): CoverageSet {
    const present: string[] = [];
    const missing: string[] = [];
    for (const sound of sounds) {
        if (have.has(phonemeIdentity(sound))) present.push(sound);
        else missing.push(sound);
    }
    return { present, missing };
}

/**
 * How much of a preset the user's script already covers.
 *
 * `conlangPhonemes` is whatever the page has — every phoneme on every grapheme,
 * or only the auto-spelling ones; the function does not care which, it only
 * matches. Vowels are included in the core and flavour tiers: a script with
 * every consonant and no vowels covers a flavour far less well than the
 * consonant count alone would suggest, and the chart guide paints vowels too, so
 * the legend's counts have to agree with what is lit.
 */
export function computeCoverage(
    preset: FlavourPreset,
    conlangPhonemes: readonly string[],
): PresetCoverage {
    const have = new Set<string>();
    for (const phoneme of conlangPhonemes) {
        if (typeof phoneme !== 'string' || phoneme.length === 0) continue;
        have.add(phonemeIdentity(phoneme));
    }

    const core = split(tierSounds(preset, 'core'), have);
    const flavour = split(tierSounds(preset, 'flavour'), have);
    const total = core.present.length + core.missing.length;

    return {
        core,
        flavour,
        avoidPresent: preset.sounds.avoid.filter((sound) => have.has(phonemeIdentity(sound))),
        score: total === 0 ? 0 : core.present.length / total,
    };
}

/**
 * The guide overlay for a preset, keyed by BASE symbol.
 *
 * Base, not the preset's spelling, because the IPA chart draws base symbols: a
 * preset that lists `pʰ` has to light the chart's `p` cell, or an aspirating
 * flavour would paint nothing at all. That deliberately loses the distinction
 * between `p` and `pʰ` — the chart has one cell for both, and the guide is a
 * suggestion rather than a rule.
 *
 * Tier precedence is core > flavour > avoid, so a base that a preset mentions
 * twice (an aspirated core stop and a plain one, say) lights as the strongest
 * claim. In practice no preset does mention one twice across tiers — a test
 * asserts it, because a base in both `core` and `avoid` would be a data bug
 * that precedence would quietly hide.
 */
export function guideMapFor(preset: FlavourPreset): Map<string, GuideTier> {
    const map = new Map<string, GuideTier>();
    const add = (sounds: readonly string[], tier: GuideTier): void => {
        for (const sound of sounds) {
            const base = describePhoneme(sound)?.base ?? sound;
            if (!map.has(base)) map.set(base, tier);
        }
    };
    add([...preset.sounds.core, ...preset.vowels.core], 'core');
    add([...preset.sounds.flavour, ...preset.vowels.flavour], 'flavour');
    add(preset.sounds.avoid, 'avoid');
    return map;
}
