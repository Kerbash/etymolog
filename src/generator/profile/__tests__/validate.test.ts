/**
 * `wordGenerator` settings validation.
 *
 * The two properties that matter most are at the top of the file: ABSENT IS NOT
 * INVALID (every boot runs this on a stored object that may predate the
 * generator, and `settingsApi.update()` rejects on any issue), and the returned
 * value never shares structure with the module defaults.
 *
 * Node environment.
 */

import { describe, expect, it } from 'vitest';
import { validateGeneratorSettings } from '../validate';
import { cloneDefaultProfile, DEFAULT_PROFILE, LIMITS } from '../defaults';
import type { WordGeneratorProfile } from '../types';

/** A complete, valid profile to mutate one field of per test. */
function goodProfile(overrides: Partial<WordGeneratorProfile> = {}): Record<string, unknown> {
    return { ...cloneDefaultProfile(), ...overrides } as unknown as Record<string, unknown>;
}

/** Validate a raw profile and return only the issues. */
function profileIssues(profile: unknown): { path: string; message: string }[] {
    return validateGeneratorSettings({ profile }).issues;
}

describe('validateGeneratorSettings — absence', () => {
    it('returns defaults with NO issues for undefined', () => {
        const result = validateGeneratorSettings(undefined);
        expect(result.issues).toEqual([]);
        expect(result.settings).toEqual({ profile: DEFAULT_PROFILE, guidePresetId: null });
    });

    it('returns defaults with NO issues for null', () => {
        const result = validateGeneratorSettings(null);
        expect(result.issues).toEqual([]);
        expect(result.settings.profile).toEqual(DEFAULT_PROFILE);
    });

    it('returns defaults with NO issues for an empty object', () => {
        const result = validateGeneratorSettings({});
        expect(result.issues).toEqual([]);
        expect(result.settings).toEqual({ profile: DEFAULT_PROFILE, guidePresetId: null });
    });

    it('fills every missing profile field silently', () => {
        const result = validateGeneratorSettings({ profile: { syllables: [{ pattern: 'CV', weight: 2 }] } });
        expect(result.issues).toEqual([]);
        expect(result.settings.profile.syllables).toEqual([{ pattern: 'CV', weight: 2 }]);
        expect(result.settings.profile.clusters).toEqual(DEFAULT_PROFILE.clusters);
        expect(result.settings.profile.syllableCount).toEqual(DEFAULT_PROFILE.syllableCount);
    });

    it('never shares structure with the module default', () => {
        const result = validateGeneratorSettings(undefined);
        result.settings.profile.syllables.push({ pattern: 'V', weight: 9 });
        result.settings.profile.clusters.sonority = false;
        expect(DEFAULT_PROFILE.syllables).toHaveLength(3);
        expect(DEFAULT_PROFILE.clusters.sonority).toBe(true);
    });

    it('is structuredClone-able (plain data only)', () => {
        const { settings } = validateGeneratorSettings(undefined);
        expect(structuredClone(settings)).toEqual(settings);
    });
});

describe('validateGeneratorSettings — the key itself', () => {
    it('reports a non-object at the empty path so the db layer can name the key', () => {
        expect(validateGeneratorSettings('nope').issues).toEqual([
            { path: '', message: 'expected an object' },
        ]);
        expect(validateGeneratorSettings(42).issues).toEqual([{ path: '', message: 'expected an object' }]);
        expect(validateGeneratorSettings([]).issues).toEqual([{ path: '', message: 'expected an object' }]);
    });

    it('reports an unknown key with no dot prefix', () => {
        expect(validateGeneratorSettings({ bogus: 1 }).issues).toEqual([
            { path: 'bogus', message: 'unknown setting (dropped)' },
        ]);
    });

    it('accepts a guidePresetId and trims it', () => {
        const result = validateGeneratorSettings({ guidePresetId: ' island ' });
        expect(result.issues).toEqual([]);
        expect(result.settings.guidePresetId).toBe('island');
    });

    it('rejects a non-string guidePresetId', () => {
        const result = validateGeneratorSettings({ guidePresetId: 7 });
        expect(result.issues).toEqual([
            { path: 'guidePresetId', message: 'expected a non-empty string or null' },
        ]);
        expect(result.settings.guidePresetId).toBeNull();
    });

    it('treats an explicit null guidePresetId as "no guide", silently', () => {
        expect(validateGeneratorSettings({ guidePresetId: null }).issues).toEqual([]);
    });

    it('reports a non-object profile', () => {
        expect(profileIssues('CV')).toEqual([{ path: 'profile', message: 'expected an object' }]);
    });

    it('reports an unknown profile key', () => {
        expect(profileIssues(goodProfile({ tones: 4 } as never))).toEqual([
            { path: 'profile.tones', message: 'unknown setting (dropped)' },
        ]);
    });
});

describe('validateGeneratorSettings — scalar fields', () => {
    it('reports a version other than 1 but keeps the profile', () => {
        const result = validateGeneratorSettings({ profile: goodProfile({ version: 2 as never }) });
        expect(result.issues).toEqual([{ path: 'profile.version', message: 'expected version 1' }]);
        expect(result.settings.profile.version).toBe(1);
    });

    it('accepts a presetId and rejects an empty one', () => {
        expect(validateGeneratorSettings({ profile: goodProfile({ presetId: 'flowing' }) }).settings.profile.presetId)
            .toBe('flowing');
        expect(profileIssues(goodProfile({ presetId: '' }))).toEqual([
            { path: 'profile.presetId', message: 'expected a non-empty string or null' },
        ]);
    });

    it('validates frequencyCurve as an enum', () => {
        expect(profileIssues(goodProfile({ frequencyCurve: 'flat' }))).toEqual([]);
        expect(profileIssues(goodProfile({ frequencyCurve: 'gaussian' as never }))).toEqual([
            { path: 'profile.frequencyCurve', message: 'expected one of zipf, flat' },
        ]);
    });

    it('validates vowelHarmony as an enum', () => {
        expect(profileIssues(goodProfile({ vowelHarmony: 'frontBack' }))).toEqual([]);
        expect(profileIssues(goodProfile({ vowelHarmony: 'roundness' as never }))).toEqual([
            { path: 'profile.vowelHarmony', message: 'expected one of off, frontBack' },
        ]);
    });

    it('clamps longVowelChance into 0..1 and reports it', () => {
        const high = validateGeneratorSettings({ profile: goodProfile({ longVowelChance: 4 }) });
        expect(high.settings.profile.longVowelChance).toBe(1);
        expect(high.issues).toHaveLength(1);
        const low = validateGeneratorSettings({ profile: goodProfile({ longVowelChance: -1 }) });
        expect(low.settings.profile.longVowelChance).toBe(0);
    });

    it('falls back for a non-numeric longVowelChance', () => {
        const result = validateGeneratorSettings({ profile: goodProfile({ longVowelChance: '0.5' as never }) });
        expect(result.settings.profile.longVowelChance).toBe(0);
        expect(result.issues[0].path).toBe('profile.longVowelChance');
    });

    it('rejects NaN and Infinity as a chance', () => {
        expect(profileIssues(goodProfile({ longVowelChance: NaN }))).toHaveLength(1);
        expect(profileIssues(goodProfile({ longVowelChance: Infinity }))).toHaveLength(1);
    });
});

describe('validateGeneratorSettings — inventory and tilt', () => {
    it('keeps a good inventory, trimmed and de-duplicated', () => {
        const result = validateGeneratorSettings({ profile: goodProfile({ inventory: [' k ', 'a', 'k'] }) });
        expect(result.issues).toEqual([]);
        expect(result.settings.profile.inventory).toEqual(['k', 'a']);
    });

    it('reports a non-array inventory', () => {
        expect(profileIssues(goodProfile({ inventory: 'ka' as never }))).toEqual([
            { path: 'profile.inventory', message: 'expected an array of sounds' },
        ]);
    });

    it('reports each bad entry by index and keeps the good ones', () => {
        const result = validateGeneratorSettings({ profile: goodProfile({ inventory: ['k', 3 as never, '  '] }) });
        expect(result.settings.profile.inventory).toEqual(['k']);
        expect(result.issues.map((issue) => issue.path))
            .toEqual(['profile.inventory[1]', 'profile.inventory[2]']);
    });

    it('caps the inventory at the limit', () => {
        const many = Array.from({ length: LIMITS.MAX_INVENTORY + 5 }, (_, index) => `x${index}`);
        const result = validateGeneratorSettings({ profile: goodProfile({ inventory: many }) });
        expect(result.settings.profile.inventory).toHaveLength(LIMITS.MAX_INVENTORY);
        expect(result.issues).toHaveLength(1);
    });

    it('keeps valid tilts and drops invalid ones by key', () => {
        const result = validateGeneratorSettings({
            profile: goodProfile({ phonemeTilt: { k: 'common', s: 'louder' as never, a: 'off' } }),
        });
        expect(result.settings.profile.phonemeTilt).toEqual({ k: 'common', a: 'off' });
        expect(result.issues).toEqual([
            { path: 'profile.phonemeTilt.s', message: 'expected one of common, normal, rare, off' },
        ]);
    });

    it('reports a non-object phonemeTilt', () => {
        expect(profileIssues(goodProfile({ phonemeTilt: ['common'] as never }))).toEqual([
            { path: 'profile.phonemeTilt', message: 'expected an object' },
        ]);
    });
});

describe('validateGeneratorSettings — syllable templates', () => {
    it('keeps good templates untouched', () => {
        const syllables = [{ pattern: 'CV', weight: 6 }, { pattern: 'CV[nŋ]', weight: 4 }];
        const result = validateGeneratorSettings({ profile: goodProfile({ syllables }) });
        expect(result.issues).toEqual([]);
        expect(result.settings.profile.syllables).toEqual(syllables);
    });

    it('drops an unparseable pattern and carries the PARSER\'s message on the issue', () => {
        const result = validateGeneratorSettings({
            profile: goodProfile({ syllables: [{ pattern: 'CVX', weight: 1 }, { pattern: 'CV', weight: 1 }] }),
        });
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].path).toBe('profile.syllables[0].pattern');
        expect(result.issues[0].message).toContain('"X"');
        expect(result.settings.profile.syllables).toEqual([{ pattern: 'CV', weight: 1 }]);
    });

    it('indexes issues by the ORIGINAL position, not the surviving one', () => {
        const result = validateGeneratorSettings({
            profile: goodProfile({
                syllables: [{ pattern: 'CV', weight: 1 }, { pattern: '(CC)', weight: 1 }],
            }),
        });
        expect(result.issues[0].path).toBe('profile.syllables[1].pattern');
    });

    it('defaults a missing weight to 1 without an issue', () => {
        const result = validateGeneratorSettings({
            profile: goodProfile({ syllables: [{ pattern: 'CV' } as never] }),
        });
        expect(result.issues).toEqual([]);
        expect(result.settings.profile.syllables).toEqual([{ pattern: 'CV', weight: 1 }]);
    });

    it('rejects a zero or negative weight', () => {
        const zero = validateGeneratorSettings({
            profile: goodProfile({ syllables: [{ pattern: 'CV', weight: 0 }] }),
        });
        expect(zero.issues[0].path).toBe('profile.syllables[0].weight');
        expect(zero.settings.profile.syllables[0].weight).toBeGreaterThan(0);
        expect(profileIssues(goodProfile({ syllables: [{ pattern: 'CV', weight: -3 }] }))).toHaveLength(1);
    });

    it('reports a non-numeric weight and a non-object entry', () => {
        expect(profileIssues(goodProfile({ syllables: [{ pattern: 'CV', weight: 'lots' as never }] })))
            .toEqual([{ path: 'profile.syllables[0].weight', message: 'expected a number' }]);
        expect(profileIssues(goodProfile({ syllables: ['CV' as never] }))[0].path)
            .toBe('profile.syllables[0]');
    });

    it('reports a non-string pattern', () => {
        // The list is then empty, so the fallback issue follows it.
        expect(profileIssues(goodProfile({ syllables: [{ pattern: 7 as never, weight: 1 }] })))
            .toEqual([
                { path: 'profile.syllables[0].pattern', message: 'expected a string' },
                { path: 'profile.syllables', message: 'expected at least one syllable template' },
            ]);
    });

    it('rejects an over-long pattern before parsing it', () => {
        const pattern = 'CV'.repeat(LIMITS.MAX_PATTERN_LENGTH);
        const issues = profileIssues(goodProfile({ syllables: [{ pattern, weight: 1 }] }));
        expect(issues[0].message).toContain(`${LIMITS.MAX_PATTERN_LENGTH} characters`);
    });

    it('collapses a duplicated pattern, keeping the later weight', () => {
        const result = validateGeneratorSettings({
            profile: goodProfile({ syllables: [{ pattern: 'CV', weight: 1 }, { pattern: 'CV', weight: 9 }] }),
        });
        expect(result.settings.profile.syllables).toEqual([{ pattern: 'CV', weight: 9 }]);
    });

    it('caps the template count', () => {
        const many = Array.from(
            { length: LIMITS.MAX_TEMPLATES + 3 },
            (_, index) => ({ pattern: `${'C'.repeat(index + 1)}V`, weight: 1 }),
        );
        const result = validateGeneratorSettings({ profile: goodProfile({ syllables: many }) });
        expect(result.settings.profile.syllables).toHaveLength(LIMITS.MAX_TEMPLATES);
        expect(result.issues.some((issue) => issue.path === 'profile.syllables')).toBe(true);
    });

    it('falls back to the defaults when every template is unusable', () => {
        const result = validateGeneratorSettings({
            profile: goodProfile({ syllables: [{ pattern: 'CVX', weight: 1 }] }),
        });
        expect(result.settings.profile.syllables).toEqual(DEFAULT_PROFILE.syllables);
        expect(result.issues.map((issue) => issue.path))
            .toEqual(['profile.syllables[0].pattern', 'profile.syllables']);
    });

    it('falls back for an empty template list', () => {
        const result = validateGeneratorSettings({ profile: goodProfile({ syllables: [] }) });
        expect(result.issues).toEqual([
            { path: 'profile.syllables', message: 'expected at least one syllable template' },
        ]);
        expect(result.settings.profile.syllables).toEqual(DEFAULT_PROFILE.syllables);
    });

    it('reports a non-array template list', () => {
        expect(profileIssues(goodProfile({ syllables: 'CV' as never }))).toEqual([
            { path: 'profile.syllables', message: 'expected an array of templates' },
        ]);
    });

    it('refuses a template set that could never produce a vowel', () => {
        const result = validateGeneratorSettings({
            profile: goodProfile({ syllables: [{ pattern: 'CN', weight: 1 }, { pattern: 'CL', weight: 1 }] }),
        });
        expect(result.issues).toEqual([
            { path: 'profile.syllables', message: expect.stringContaining('vowel slot') },
        ]);
        expect(result.settings.profile.syllables).toEqual(DEFAULT_PROFILE.syllables);
    });

    it('accepts a vowel supplied only by a literal group', () => {
        const result = validateGeneratorSettings({
            profile: goodProfile({ syllables: [{ pattern: 'C[a e i]', weight: 1 }] }),
        });
        expect(result.issues).toEqual([]);
        expect(result.settings.profile.syllables).toEqual([{ pattern: 'C[a e i]', weight: 1 }]);
    });
});

describe('validateGeneratorSettings — counts and clusters', () => {
    it('keeps a valid syllable count', () => {
        const result = validateGeneratorSettings({ profile: goodProfile({ syllableCount: { min: 2, max: 4 } }) });
        expect(result.issues).toEqual([]);
        expect(result.settings.profile.syllableCount).toEqual({ min: 2, max: 4 });
    });

    it('clamps a count out of range', () => {
        const result = validateGeneratorSettings({ profile: goodProfile({ syllableCount: { min: 0, max: 12 } }) });
        expect(result.settings.profile.syllableCount).toEqual({
            min: LIMITS.MIN_SYLLABLE_COUNT,
            max: LIMITS.MAX_SYLLABLE_COUNT,
        });
        expect(result.issues).toHaveLength(2);
    });

    it('raises max to min when they are the wrong way round', () => {
        const result = validateGeneratorSettings({ profile: goodProfile({ syllableCount: { min: 4, max: 2 } }) });
        expect(result.settings.profile.syllableCount).toEqual({ min: 4, max: 4 });
        expect(result.issues).toEqual([
            { path: 'profile.syllableCount', message: 'expected max to be at least min' },
        ]);
    });

    it('falls back for a fractional or non-numeric count', () => {
        const result = validateGeneratorSettings({
            profile: goodProfile({ syllableCount: { min: 1.5, max: 'three' as never } }),
        });
        expect(result.settings.profile.syllableCount).toEqual(DEFAULT_PROFILE.syllableCount);
        expect(result.issues.map((issue) => issue.path))
            .toEqual(['profile.syllableCount.min', 'profile.syllableCount.max']);
    });

    it('reports an unknown key inside syllableCount', () => {
        expect(profileIssues(goodProfile({ syllableCount: { min: 1, max: 3, avg: 2 } as never })))
            .toEqual([{ path: 'profile.syllableCount.avg', message: 'unknown setting (dropped)' }]);
    });

    it('validates the four cluster switches', () => {
        const result = validateGeneratorSettings({
            profile: goodProfile({
                clusters: {
                    sonority: false,
                    sibilantOnsetException: true,
                    allowGeminates: true,
                    maxPerWord: 3,
                },
            }),
        });
        expect(result.issues).toEqual([]);
        expect(result.settings.profile.clusters.maxPerWord).toBe(3);
    });

    it('reports a non-boolean switch and keeps the default', () => {
        const result = validateGeneratorSettings({
            profile: goodProfile({ clusters: { ...DEFAULT_PROFILE.clusters, sonority: 'yes' as never } }),
        });
        expect(result.issues).toEqual([
            { path: 'profile.clusters.sonority', message: 'expected a boolean' },
        ]);
        expect(result.settings.profile.clusters.sonority).toBe(true);
    });

    it('clamps the cluster budget', () => {
        const result = validateGeneratorSettings({
            profile: goodProfile({ clusters: { ...DEFAULT_PROFILE.clusters, maxPerWord: 99 } }),
        });
        expect(result.settings.profile.clusters.maxPerWord).toBe(LIMITS.MAX_CLUSTERS_PER_WORD);
        expect(result.issues).toHaveLength(1);
    });

    it('reports a non-object clusters value and an unknown key inside it', () => {
        expect(profileIssues(goodProfile({ clusters: true as never })))
            .toEqual([{ path: 'profile.clusters', message: 'expected an object' }]);
        expect(profileIssues(goodProfile({ clusters: { ...DEFAULT_PROFILE.clusters, maxPerSyllable: 1 } as never })))
            .toEqual([{ path: 'profile.clusters.maxPerSyllable', message: 'unknown setting (dropped)' }]);
    });
});

describe('validateGeneratorSettings — forbidden sequences', () => {
    it('keeps, trims and de-duplicates', () => {
        const result = validateGeneratorSettings({
            profile: goodProfile({ forbidden: [' kk ', 'kk', 'tl'] }),
        });
        expect(result.issues).toEqual([]);
        expect(result.settings.profile.forbidden).toEqual(['kk', 'tl']);
    });

    it('reports empty and non-string entries by index', () => {
        const result = validateGeneratorSettings({
            profile: goodProfile({ forbidden: ['kk', '', 5 as never] }),
        });
        expect(result.settings.profile.forbidden).toEqual(['kk']);
        expect(result.issues.map((issue) => issue.path))
            .toEqual(['profile.forbidden[1]', 'profile.forbidden[2]']);
    });

    it('rejects an over-long sequence', () => {
        const long = 'x'.repeat(LIMITS.MAX_FORBIDDEN_LENGTH + 1);
        const result = validateGeneratorSettings({ profile: goodProfile({ forbidden: [long] }) });
        expect(result.settings.profile.forbidden).toEqual([]);
        expect(result.issues[0].message).toContain(`${LIMITS.MAX_FORBIDDEN_LENGTH} characters`);
    });

    it('caps the list', () => {
        const many = Array.from({ length: LIMITS.MAX_FORBIDDEN + 2 }, (_, index) => `s${index}`);
        const result = validateGeneratorSettings({ profile: goodProfile({ forbidden: many }) });
        expect(result.settings.profile.forbidden).toHaveLength(LIMITS.MAX_FORBIDDEN);
        expect(result.issues).toHaveLength(1);
    });

    it('reports a non-array', () => {
        expect(profileIssues(goodProfile({ forbidden: 'kk' as never })))
            .toEqual([{ path: 'profile.forbidden', message: 'expected an array of sequences' }]);
    });
});

describe('LIMITS', () => {
    it('pins the bounds the plan specified', () => {
        expect(LIMITS.MAX_INVENTORY).toBe(120);
        expect(LIMITS.MAX_TEMPLATES).toBe(12);
        expect(LIMITS.MAX_FORBIDDEN).toBe(40);
        expect(LIMITS.MAX_BATCH).toBe(100);
    });

    it('agrees with the default profile', () => {
        expect(DEFAULT_PROFILE.syllableCount.min).toBeGreaterThanOrEqual(LIMITS.MIN_SYLLABLE_COUNT);
        expect(DEFAULT_PROFILE.syllableCount.max).toBeLessThanOrEqual(LIMITS.MAX_SYLLABLE_COUNT);
        expect(DEFAULT_PROFILE.clusters.maxPerWord).toBeLessThanOrEqual(LIMITS.MAX_CLUSTERS_PER_WORD);
        expect(DEFAULT_PROFILE.syllables.length).toBeLessThanOrEqual(LIMITS.MAX_TEMPLATES);
    });

    it('validates the default profile with zero issues', () => {
        expect(validateGeneratorSettings({ profile: DEFAULT_PROFILE }).issues).toEqual([]);
    });
});
