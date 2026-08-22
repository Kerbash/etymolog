/**
 * @fileoverview The persisted shape of a word generator.
 *
 * This is a SETTINGS type: it is written to `localStorage` under the
 * `wordGenerator` key, it rides along in the JSON/PNG export envelope, and it
 * comes back from both of those places completely untrusted. Everything here is
 * therefore plain, `structuredClone`-able data — no `Map`, no `Set`, no class
 * instance, no function — and every field has a defined behaviour when it is
 * missing (see `defaults.ts`) and when it is wrong (see `validate.ts`).
 *
 * It also has to survive a user who edits the exported JSON by hand, which is
 * why the numbers are ranges rather than free values and the strings are
 * enumerations wherever a fixed set exists.
 *
 * @module generator/profile/types
 */

/**
 * How often a single sound should turn up, relative to what the frequency curve
 * would give it on its own.
 *
 * `off` is not "delete": the sound stays in the inventory so the UI can show it
 * muted and the user can switch it back on with one click. The engine simply
 * never picks it.
 */
export type FrequencyTilt = 'common' | 'normal' | 'rare' | 'off';

/**
 * One syllable shape and how often it is chosen relative to the others.
 *
 * `pattern` is in the little language `engine/template.ts` parses (`CV`,
 * `(C)V(N)`, `CV[n ŋ]`); `weight` is a positive number, relative to the other
 * templates in the same profile — `{CV:6}, {CVC:2}` means CV three times as
 * often as CVC.
 */
export interface SyllableTemplate {
    pattern: string;
    weight: number;
}

/** How the engine handles clusters and repeated consonants. */
export interface ClusterRules {
    /** Enforce rising sonority in onsets and falling sonority in codas. */
    sonority: boolean;
    /** Licence `st-`, `sp-`, `sk-` word-initially, which sonority alone forbids. */
    sibilantOnsetException: boolean;
    /** Allow the same consonant on both sides of a syllable boundary (`kat.ta`). */
    allowGeminates: boolean;
    /** How many consonant clusters (CC or longer) a single word may contain, 0–4. */
    maxPerWord: number;
}

/**
 * Everything the generator needs to build words, minus the sounds it does not
 * own: when `inventory` is empty the page supplies the conlang's own
 * auto-spelling phonemes instead.
 */
export interface WordGeneratorProfile {
    /**
     * Shape version. Only `1` exists; it is here so a future change can migrate
     * rather than guess, and so a profile from a newer build is recognisable.
     */
    version: 1;
    /**
     * The flavour preset this profile was started from, or `null` for a profile
     * the user built themselves. It is a provenance label, not a constraint —
     * editing anything does NOT clear it, because a user who picked "Elvish" and
     * nudged two templates still has an Elvish profile.
     */
    presetId: string | null;
    /**
     * The sounds to build from. EMPTY means "use my script's sounds" — the
     * phonemes flagged for auto-spelling on the user's graphemes. A beginner
     * with no graphemes yet gets a preset's explicit list; a user with a script
     * can stay in sync with it.
     */
    inventory: string[];
    /** Per-sound frequency tilt. A sound that is absent is `'normal'`. */
    phonemeTilt: Record<string, FrequencyTilt>;
    /**
     * `zipf` gives common sounds the lion's share (real inventories are steeply
     * skewed); `flat` picks uniformly, which is what a user wants when they are
     * auditioning an inventory rather than writing a language.
     */
    frequencyCurve: 'zipf' | 'flat';
    /** At least one shape; weights are positive. */
    syllables: SyllableTemplate[];
    /** Syllables per word, 1–5, picked uniformly in `[min, max]`. */
    syllableCount: { min: number; max: number };
    clusters: ClusterRules;
    /**
     * `frontBack` makes every vowel of a word share a backness bucket (central
     * vowels are neutral and go with either) — Finnish/Turkish-style harmony.
     */
    vowelHarmony: 'off' | 'frontBack';
    /** Chance, 0–1, that a generated vowel gets a length mark. */
    longVowelChance: number;
    /** IPA sequences rejected anywhere in a word, as plain substrings. */
    forbidden: string[];
}

/**
 * The whole `wordGenerator` settings key.
 *
 * The guide is here rather than on the profile because it is a VIEW choice —
 * which flavour the IPA chart paints — and a user can perfectly well be
 * generating with one flavour while looking at another on the chart.
 */
export interface WordGeneratorSettings {
    profile: WordGeneratorProfile;
    /** Which preset the IPA chart paints as a guide; `null` = no guide. */
    guidePresetId: string | null;
}
