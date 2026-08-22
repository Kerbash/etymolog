/**
 * @fileoverview Validation for the `wordGenerator` settings key.
 *
 * Written in the same style as `src/db/api/settingsSchema.ts`, and for the same
 * reason: the value arrives from `localStorage` (possibly written by an older
 * build), from a hand-editable export envelope, and from UI code — so the
 * function ALWAYS returns a complete, well-typed value, and reports every
 * correction it had to make.
 *
 * The one rule that matters most: **absent is not invalid.** A settings object
 * from a build that predates the generator has no `wordGenerator` key at all,
 * and `validateSettings` runs on every boot; producing an issue for a missing
 * field would spam a warning at every user who ever used an older build, and —
 * because `settingsApi.update()` is STRICT — could make every settings write
 * fail. Only a value that is PRESENT and WRONG is an issue.
 *
 * WHY THE ISSUE TYPE IS DECLARED HERE. `src/generator/**` must not import from
 * `src/db/**` (the db layer imports the generator, never the other way round —
 * a ratchet test enforces it). `SettingsIssue` is a two-string record; it is
 * cheaper to restate the shape than to invert the dependency for it.
 *
 * @module generator/profile/validate
 */

import { isValidTemplatePattern, parseTemplate, templateHasVowelSlot } from '../engine/template';
import { cloneDefaultProfile, LIMITS } from './defaults';
import type {
    ClusterRules,
    FrequencyTilt,
    SyllableTemplate,
    WordGeneratorProfile,
    WordGeneratorSettings,
} from './types';

/**
 * One correction the validator had to make. Structurally identical to
 * `SettingsIssue` in `src/db/api/settingsSchema.ts` — see the module note.
 */
export interface SettingsIssue {
    path: string;
    message: string;
}

export interface GeneratorSettingsValidation {
    settings: WordGeneratorSettings;
    issues: SettingsIssue[];
}

const TILT_VALUES: readonly FrequencyTilt[] = ['common', 'normal', 'rare', 'off'];
const CURVE_VALUES = ['zipf', 'flat'] as const;
const HARMONY_VALUES = ['off', 'frontBack'] as const;

/** Keys the `wordGenerator` object may carry. Anything else is reported and dropped. */
const SETTINGS_KEYS: readonly (keyof WordGeneratorSettings)[] = ['profile', 'guidePresetId'];

/** Keys a profile may carry. */
const PROFILE_KEYS: readonly (keyof WordGeneratorProfile)[] = [
    'version',
    'presetId',
    'inventory',
    'phonemeTilt',
    'frequencyCurve',
    'syllables',
    'syllableCount',
    'clusters',
    'vowelHarmony',
    'longVowelChance',
    'forbidden',
];

/** Keys the cluster rules may carry. */
const CLUSTER_KEYS: readonly (keyof ClusterRules)[] = [
    'sonority',
    'sibilantOnsetException',
    'allowGeminates',
    'maxPerWord',
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Report unknown keys on an object whose key set is closed. */
function reportUnknownKeys(
    source: Record<string, unknown>,
    known: readonly string[],
    path: string,
    issues: SettingsIssue[],
): void {
    for (const key of Object.keys(source)) {
        if (!known.includes(key)) {
            // `path` is empty at the top of the key, where the issue is simply
            // `<name>` — the db layer prefixes it to `wordGenerator.<name>`.
            issues.push({ path: path ? `${path}.${key}` : key, message: 'unknown setting (dropped)' });
        }
    }
}

function validateBoolean(
    raw: unknown,
    path: string,
    issues: SettingsIssue[],
    fallback: boolean,
): boolean {
    if (typeof raw === 'boolean') return raw;
    if (raw !== undefined) issues.push({ path, message: 'expected a boolean' });
    return fallback;
}

function validateEnum<T extends string>(
    raw: unknown,
    allowed: readonly T[],
    path: string,
    issues: SettingsIssue[],
    fallback: T,
): T {
    if (typeof raw === 'string' && (allowed as readonly string[]).includes(raw)) return raw as T;
    if (raw !== undefined) issues.push({ path, message: `expected one of ${allowed.join(', ')}` });
    return fallback;
}

/** A nullable identifier: a non-empty string, or `null`. */
function validateNullableId(raw: unknown, path: string, issues: SettingsIssue[]): string | null {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.length > 0) return trimmed;
    }
    issues.push({ path, message: 'expected a non-empty string or null' });
    return null;
}

/**
 * An integer inside `[min, max]`.
 *
 * Out of range is CLAMPED rather than defaulted: a user who typed 9 syllables
 * meant "a lot", and 5 is the nearest thing to that we can offer. A value that
 * is not an integer at all carries no such intent, so it falls back.
 */
function validateInt(
    raw: unknown,
    path: string,
    issues: SettingsIssue[],
    fallback: number,
    min: number,
    max: number,
): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw)) {
        if (raw !== undefined) issues.push({ path, message: 'expected a whole number' });
        return fallback;
    }
    if (raw < min || raw > max) {
        issues.push({ path, message: `expected a whole number between ${min} and ${max}` });
        return Math.min(max, Math.max(min, raw));
    }
    return raw;
}

function validateInventory(raw: unknown, issues: SettingsIssue[]): string[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) {
        issues.push({ path: 'profile.inventory', message: 'expected an array of sounds' });
        return [];
    }
    const out: string[] = [];
    raw.forEach((entry, index) => {
        if (typeof entry !== 'string' || entry.trim().length === 0) {
            issues.push({ path: `profile.inventory[${index}]`, message: 'expected a non-empty string' });
            return;
        }
        const sound = entry.trim();
        // A duplicate is a paste accident, not an error worth blocking a save
        // for — the engine would only pick the same sound twice as often.
        if (!out.includes(sound)) out.push(sound);
    });
    if (out.length > LIMITS.MAX_INVENTORY) {
        issues.push({
            path: 'profile.inventory',
            message: `expected at most ${LIMITS.MAX_INVENTORY} sounds`,
        });
        out.length = LIMITS.MAX_INVENTORY;
    }
    return out;
}

function validatePhonemeTilt(raw: unknown, issues: SettingsIssue[]): Record<string, FrequencyTilt> {
    if (raw === undefined) return {};
    if (!isRecord(raw)) {
        issues.push({ path: 'profile.phonemeTilt', message: 'expected an object' });
        return {};
    }
    const out: Record<string, FrequencyTilt> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (key.trim().length === 0) {
            issues.push({ path: 'profile.phonemeTilt', message: 'expected non-empty sound keys' });
            continue;
        }
        if (typeof value !== 'string' || !(TILT_VALUES as readonly string[]).includes(value)) {
            issues.push({
                path: `profile.phonemeTilt.${key}`,
                message: `expected one of ${TILT_VALUES.join(', ')}`,
            });
            continue;
        }
        // `defineProperty`, not `out[key] = …`. The keys come from a hand-edited
        // export or from `JSON.parse`, so one of them can be `__proto__` — and a
        // plain assignment with that key runs the INHERITED setter instead of
        // creating a property, which silently discards the entry (and would be a
        // prototype-pollution vector if the value were ever an object). A data
        // property is created either way here, survives `structuredClone` and a
        // JSON round-trip, and never touches `Object.prototype`.
        Object.defineProperty(out, key, {
            value: value as FrequencyTilt,
            writable: true,
            enumerable: true,
            configurable: true,
        });
    }
    return out;
}

/**
 * Syllable templates.
 *
 * A template whose pattern will not parse is DROPPED, with the parser's own
 * message on the issue — there is no way to guess what the user meant by `CVX`,
 * and keeping an unparseable pattern would make the generator throw later,
 * far from the mistake. The parser's message is reused verbatim so the settings
 * warning and the shape editor's inline error say the same thing.
 */
function validateSyllables(raw: unknown, issues: SettingsIssue[]): SyllableTemplate[] {
    const defaults = cloneDefaultProfile().syllables;
    if (raw === undefined) return defaults;
    if (!Array.isArray(raw)) {
        issues.push({ path: 'profile.syllables', message: 'expected an array of templates' });
        return defaults;
    }

    const out: SyllableTemplate[] = [];
    raw.forEach((entry, index) => {
        const path = `profile.syllables[${index}]`;
        if (!isRecord(entry)) {
            issues.push({ path, message: 'expected an object with a pattern and a weight' });
            return;
        }
        const { pattern, weight } = entry;
        if (typeof pattern !== 'string') {
            issues.push({ path: `${path}.pattern`, message: 'expected a string' });
            return;
        }
        if (pattern.length > LIMITS.MAX_PATTERN_LENGTH) {
            issues.push({
                path: `${path}.pattern`,
                message: `expected at most ${LIMITS.MAX_PATTERN_LENGTH} characters`,
            });
            return;
        }
        const check = isValidTemplatePattern(pattern);
        if (!check.ok) {
            issues.push({ path: `${path}.pattern`, message: check.message });
            return;
        }

        let value = 1;
        if (typeof weight !== 'number' || !Number.isFinite(weight)) {
            if (weight !== undefined) issues.push({ path: `${path}.weight`, message: 'expected a number' });
        } else if (weight <= LIMITS.MIN_TEMPLATE_WEIGHT || weight > LIMITS.MAX_TEMPLATE_WEIGHT) {
            issues.push({
                path: `${path}.weight`,
                message: `expected a number above 0 and at most ${LIMITS.MAX_TEMPLATE_WEIGHT}`,
            });
            value = Math.min(LIMITS.MAX_TEMPLATE_WEIGHT, Math.max(0.0001, weight));
        } else {
            value = weight;
        }

        // A duplicate pattern is two rows the user cannot tell apart in the
        // editor; the later weight wins, which is what editing the second row
        // looks like it should do.
        const existing = out.findIndex((template) => template.pattern === pattern);
        if (existing >= 0) out[existing] = { pattern, weight: value };
        else out.push({ pattern, weight: value });
    });

    if (out.length > LIMITS.MAX_TEMPLATES) {
        issues.push({
            path: 'profile.syllables',
            message: `expected at most ${LIMITS.MAX_TEMPLATES} templates`,
        });
        out.length = LIMITS.MAX_TEMPLATES;
    }
    if (out.length === 0) {
        issues.push({ path: 'profile.syllables', message: 'expected at least one syllable template' });
        return defaults;
    }
    // Without a vowel slot anywhere, every word the profile can produce is a
    // consonant run — the generator would not fail, it would succeed at
    // producing nonsense, which is far harder for a user to diagnose.
    if (!out.some((template) => templateHasVowelSlot(parseTemplate(template.pattern)))) {
        issues.push({
            path: 'profile.syllables',
            message: 'expected at least one template with a vowel slot (V, or a literal group of vowels)',
        });
        return defaults;
    }
    return out;
}

function validateSyllableCount(
    raw: unknown,
    issues: SettingsIssue[],
    fallback: { min: number; max: number },
): { min: number; max: number } {
    if (raw === undefined) return { ...fallback };
    if (!isRecord(raw)) {
        issues.push({ path: 'profile.syllableCount', message: 'expected an object with min and max' });
        return { ...fallback };
    }
    reportUnknownKeys(raw, ['min', 'max'], 'profile.syllableCount', issues);
    const min = validateInt(
        raw.min, 'profile.syllableCount.min', issues, fallback.min,
        LIMITS.MIN_SYLLABLE_COUNT, LIMITS.MAX_SYLLABLE_COUNT,
    );
    const max = validateInt(
        raw.max, 'profile.syllableCount.max', issues, fallback.max,
        LIMITS.MIN_SYLLABLE_COUNT, LIMITS.MAX_SYLLABLE_COUNT,
    );
    if (max < min) {
        // Raising the max is the correction that keeps the user's floor: a
        // request for "at least 3" with a stale max of 2 means 3, not 2.
        issues.push({ path: 'profile.syllableCount', message: 'expected max to be at least min' });
        return { min, max: min };
    }
    return { min, max };
}

function validateClusters(
    raw: unknown,
    issues: SettingsIssue[],
    fallback: ClusterRules,
): ClusterRules {
    if (raw === undefined) return { ...fallback };
    if (!isRecord(raw)) {
        issues.push({ path: 'profile.clusters', message: 'expected an object' });
        return { ...fallback };
    }
    reportUnknownKeys(raw, CLUSTER_KEYS as readonly string[], 'profile.clusters', issues);
    return {
        sonority: validateBoolean(raw.sonority, 'profile.clusters.sonority', issues, fallback.sonority),
        sibilantOnsetException: validateBoolean(
            raw.sibilantOnsetException, 'profile.clusters.sibilantOnsetException', issues,
            fallback.sibilantOnsetException,
        ),
        allowGeminates: validateBoolean(
            raw.allowGeminates, 'profile.clusters.allowGeminates', issues, fallback.allowGeminates,
        ),
        maxPerWord: validateInt(
            raw.maxPerWord, 'profile.clusters.maxPerWord', issues, fallback.maxPerWord,
            0, LIMITS.MAX_CLUSTERS_PER_WORD,
        ),
    };
}

/** A probability. Out of range clamps; not a number at all falls back. */
function validateChance(raw: unknown, path: string, issues: SettingsIssue[], fallback: number): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        if (raw !== undefined) issues.push({ path, message: 'expected a number between 0 and 1' });
        return fallback;
    }
    if (raw < 0 || raw > 1) {
        issues.push({ path, message: 'expected a number between 0 and 1' });
        return Math.min(1, Math.max(0, raw));
    }
    return raw;
}

function validateForbidden(raw: unknown, issues: SettingsIssue[]): string[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) {
        issues.push({ path: 'profile.forbidden', message: 'expected an array of sequences' });
        return [];
    }
    const out: string[] = [];
    raw.forEach((entry, index) => {
        if (typeof entry !== 'string' || entry.trim().length === 0) {
            issues.push({ path: `profile.forbidden[${index}]`, message: 'expected a non-empty string' });
            return;
        }
        const sequence = entry.trim();
        if (sequence.length > LIMITS.MAX_FORBIDDEN_LENGTH) {
            issues.push({
                path: `profile.forbidden[${index}]`,
                message: `expected at most ${LIMITS.MAX_FORBIDDEN_LENGTH} characters`,
            });
            return;
        }
        if (!out.includes(sequence)) out.push(sequence);
    });
    if (out.length > LIMITS.MAX_FORBIDDEN) {
        issues.push({
            path: 'profile.forbidden',
            message: `expected at most ${LIMITS.MAX_FORBIDDEN} sequences`,
        });
        out.length = LIMITS.MAX_FORBIDDEN;
    }
    return out;
}

function validateProfile(raw: unknown, issues: SettingsIssue[]): WordGeneratorProfile {
    const defaults = cloneDefaultProfile();
    if (raw === undefined) return defaults;
    if (!isRecord(raw)) {
        issues.push({ path: 'profile', message: 'expected an object' });
        return defaults;
    }
    reportUnknownKeys(raw, PROFILE_KEYS as readonly string[], 'profile', issues);

    if (raw.version !== undefined && raw.version !== 1) {
        issues.push({ path: 'profile.version', message: 'expected version 1' });
    }

    return {
        version: 1,
        presetId: validateNullableId(raw.presetId, 'profile.presetId', issues),
        inventory: validateInventory(raw.inventory, issues),
        phonemeTilt: validatePhonemeTilt(raw.phonemeTilt, issues),
        frequencyCurve: validateEnum(
            raw.frequencyCurve, CURVE_VALUES, 'profile.frequencyCurve', issues, defaults.frequencyCurve,
        ),
        syllables: validateSyllables(raw.syllables, issues),
        syllableCount: validateSyllableCount(raw.syllableCount, issues, defaults.syllableCount),
        clusters: validateClusters(raw.clusters, issues, defaults.clusters),
        vowelHarmony: validateEnum(
            raw.vowelHarmony, HARMONY_VALUES, 'profile.vowelHarmony', issues, defaults.vowelHarmony,
        ),
        longVowelChance: validateChance(
            raw.longVowelChance, 'profile.longVowelChance', issues, defaults.longVowelChance,
        ),
        forbidden: validateForbidden(raw.forbidden, issues),
    };
}

/**
 * Validate an arbitrary value as the `wordGenerator` settings key.
 *
 * Always returns a complete, fully owned `WordGeneratorSettings`. `issues` lists
 * every correction; an EMPTY list is the contract for `undefined`/`null` input,
 * because a settings object without the key is a settings object from an older
 * build, not a broken one.
 *
 * Issue paths are relative to the key itself (`profile.syllables[0].pattern`);
 * `src/db/api/settingsSchema.ts` prefixes them with `wordGenerator.`.
 */
export function validateGeneratorSettings(raw: unknown): GeneratorSettingsValidation {
    const issues: SettingsIssue[] = [];

    if (raw === undefined || raw === null) {
        return { settings: { profile: cloneDefaultProfile(), guidePresetId: null }, issues };
    }
    if (!isRecord(raw)) {
        issues.push({ path: '', message: 'expected an object' });
        return { settings: { profile: cloneDefaultProfile(), guidePresetId: null }, issues };
    }

    reportUnknownKeys(raw, SETTINGS_KEYS as readonly string[], '', issues);

    return {
        settings: {
            profile: validateProfile(raw.profile, issues),
            guidePresetId: validateNullableId(raw.guidePresetId, 'guidePresetId', issues),
        },
        issues,
    };
}
