/**
 * @fileoverview The profile a user gets before they have chosen anything, and
 * the bounds every profile is held to.
 *
 * The default is deliberately the DULLEST profile that still produces
 * pronounceable words: mostly CV, no clusters worth the name, no harmony, no
 * length. A first batch that is boring is a first batch the user can read, and
 * every knob below it is something they can turn on and immediately hear the
 * difference. A flavourful default would make the presets look like they do
 * nothing.
 *
 * @module generator/profile/defaults
 */

import type { WordGeneratorProfile, WordGeneratorSettings } from './types';

/**
 * Hard bounds. These are not taste — they are the numbers that keep a
 * hand-edited export, or a UI bug, from producing a profile that hangs the
 * generation loop or fills `localStorage`.
 */
export const LIMITS = {
    /** Sounds in an explicit inventory. Above this the chip list is unusable anyway. */
    MAX_INVENTORY: 120,
    /** Syllable templates in one profile. */
    MAX_TEMPLATES: 12,
    /** Characters in one template pattern — bounds the parser's work. */
    MAX_PATTERN_LENGTH: 40,
    /** Forbidden sequences in one profile. */
    MAX_FORBIDDEN: 40,
    /** Characters in one forbidden sequence. */
    MAX_FORBIDDEN_LENGTH: 12,
    /** Words the page may ask for in one batch. */
    MAX_BATCH: 100,
    /** Syllables per word. */
    MIN_SYLLABLE_COUNT: 1,
    MAX_SYLLABLE_COUNT: 5,
    /** Clusters per word. */
    MAX_CLUSTERS_PER_WORD: 4,
    /** Template weight. A weight of 0 would be a template that never fires — say so instead. */
    MIN_TEMPLATE_WEIGHT: 0,
    MAX_TEMPLATE_WEIGHT: 100,
} as const;

/**
 * The starting profile: an open-syllable language with an occasional closed one.
 *
 * `inventory: []` means "use my script's sounds", which is the right default for
 * a user who arrives at the generator with a script already built — and the
 * empty-state copy covers the user who does not.
 */
export const DEFAULT_PROFILE: WordGeneratorProfile = {
    version: 1,
    presetId: null,
    inventory: [],
    phonemeTilt: {},
    frequencyCurve: 'zipf',
    syllables: [
        { pattern: 'CV', weight: 6 },
        { pattern: 'CVC', weight: 2 },
        { pattern: 'V', weight: 1 },
    ],
    syllableCount: { min: 1, max: 3 },
    clusters: {
        sonority: true,
        sibilantOnsetException: false,
        allowGeminates: false,
        maxPerWord: 1,
    },
    vowelHarmony: 'off',
    longVowelChance: 0,
    forbidden: [],
};

/** The whole `wordGenerator` settings key at its default: a default profile, no chart guide. */
export const DEFAULT_WORD_GENERATOR_SETTINGS: WordGeneratorSettings = {
    profile: DEFAULT_PROFILE,
    guidePresetId: null,
};

/**
 * A fresh, unshared default profile.
 *
 * `DEFAULT_PROFILE` is a module singleton with nested arrays and objects; handing
 * it out and letting a caller push a template onto `syllables` would corrupt the
 * default for the rest of the session. Every path that needs "the default" goes
 * through here.
 */
export function cloneDefaultProfile(): WordGeneratorProfile {
    return structuredClone(DEFAULT_PROFILE);
}

/** A fresh, unshared default settings key. */
export function cloneDefaultWordGeneratorSettings(): WordGeneratorSettings {
    return structuredClone(DEFAULT_WORD_GENERATOR_SETTINGS);
}
