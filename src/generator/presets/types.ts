/**
 * @fileoverview Flavour presets — the shape of "make it sound like X".
 *
 * A preset is DATA, not behaviour. It is a sound inventory split into three
 * tiers, a set of syllable shapes, a handful of constraint switches, and the
 * prose that explains the choice to a user who has never met the word
 * "phonotactics". Nothing in a preset module may run the engine or reach for the
 * db — a preset file is loaded at import time, and an import that generates
 * words would cost every page that touches the generator barrel.
 *
 * The three tiers exist because a preset is used twice over: to FILL a profile
 * (core + flavour + vowels become the inventory) and to PAINT the IPA chart
 * (core lit, flavour soft, avoid dimmed). `avoid` therefore never enters an
 * inventory; it is advice, and the chart is where it is given.
 *
 * @module generator/presets/types
 */

import type { FrequencyTilt, WordGeneratorProfile } from '../profile/types';

/** The seven flavours. The union is closed: a preset id is a stable identifier that settings persist. */
export type PresetId =
    | 'flowing'
    | 'island'
    | 'japanese'
    | 'sinitic'
    | 'romance'
    | 'guttural'
    | 'slavic';

/**
 * A preset's consonants, in the three guide tiers.
 *
 * `core` is what the flavour is made of, `flavour` is what colours it without
 * being required, and `avoid` is what breaks the illusion. Every entry is a
 * single phoneme string that `describePhoneme` can resolve — a test asserts it,
 * because a typo here would show up as a chart cell that never lights and would
 * be almost impossible to spot by eye.
 */
export interface PresetSounds {
    core: string[];
    flavour: string[];
    avoid: string[];
}

/** A preset's vowels. There is no `avoid` tier: no flavour is defined by a vowel it refuses. */
export interface PresetVowels {
    core: string[];
    flavour: string[];
}

/**
 * The profile a preset installs, minus the three fields `applyPreset` derives:
 * `presetId` (the preset's own id), `inventory` (its sounds) and `phonemeTilt`
 * (optional here, `{}` when absent).
 */
export type PresetProfile =
    Omit<WordGeneratorProfile, 'presetId' | 'inventory' | 'phonemeTilt'>
    & { phonemeTilt?: Record<string, FrequencyTilt> };

export interface FlavourPreset {
    id: PresetId;
    /** Display name, e.g. "Elvish / flowing". */
    name: string;
    /** One line, shown on the preset card under the name. */
    tagline: string;
    /** Real languages (or fictional ones) the flavour is drawn from. */
    touchstones: string[];
    /** One paragraph: WHY these sounds produce that impression. Shown in the chart page's explainer. */
    why: string;
    sounds: PresetSounds;
    vowels: PresetVowels;
    /**
     * Vowel sequences the flavour is known for. Not phonemes — each is two or
     * more vowels — so they are checked sound by sound rather than with
     * `describePhoneme`. Absent where a flavour genuinely has none.
     *
     * THE CONVENTION, enforced by `__tests__/examples.test.ts`:
     *
     *   1. every diphthong listed here must appear as a member of at least one
     *      template's literal group (`C[ai au ei]`), so that declaring one has
     *      an effect on the output rather than being a note to the reader; and
     *   2. every sound inside it must be in the preset's own inventory, or the
     *      engine drops the member at build time and the group quietly narrows.
     *
     * A preset with no diphthongs is exempt from both — `slavic` spreads its
     * vowel sequences across syllables and says so.
     *
     * The rule exists because both halves were violated in Phase 2: `flowing`
     * declared three diphthongs no template could produce, and `sinitic`
     * declared `ei` while shipping no `e`.
     */
    diphthongs?: string[];
    profile: PresetProfile;
    /**
     * Six example words, in IPA.
     *
     * DATA, generated once in Phase 3 with a fixed seed and pasted in — a preset
     * module must not run the engine at import time. Empty until then; a Phase 3
     * test regenerates them and asserts they still match, so they cannot go
     * stale when the engine changes.
     */
    examples: string[];
}
