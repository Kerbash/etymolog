/**
 * The `wordGenerator` settings key, end to end through the settings API.
 *
 * The generator owns the SHAPE (`src/generator/profile/validate.ts` has its own
 * suite); this file is about the seam: that the key is known, that its issue
 * paths arrive prefixed, that a settings object written before the generator
 * existed still validates silently, and that the key rides the export envelope
 * without any codec change.
 *
 * Node environment (localStorage is stubbed in `setup.ts`).
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
    settingsApi,
    getCurrentSettings,
    resetSettingsForTests,
    SETTINGS_STORAGE_KEY,
} from '../api/settingsApi';
import { validateSettings, cloneDefaultSettings } from '../api/settingsSchema';
import { DEFAULT_SETTINGS } from '../api/types';
import { DEFAULT_WORD_GENERATOR_SETTINGS } from '../../generator/profile/defaults';
import { applyPreset, getPreset } from '../../generator/presets';
import { collectExportData, exportDataToJson, parseAndValidateJson } from '../exportImport/jsonCodec';
import { initDatabase } from '../api/databaseApi';
import type { EtymologSettings } from '../api/types';

/** A settings object exactly as a build from before the generator would have written it. */
function legacyStoredSettings(): Record<string, unknown> {
    const { wordGenerator: _wordGenerator, ...rest } = cloneDefaultSettings();
    return { ...rest, conlangName: 'Old' } as unknown as Record<string, unknown>;
}

describe('validateSettings — the wordGenerator key', () => {
    it('supplies the default for an empty settings object, with no issues', () => {
        const { settings, issues } = validateSettings({});
        expect(issues).toEqual([]);
        expect(settings.wordGenerator).toEqual(DEFAULT_WORD_GENERATOR_SETTINGS);
    });

    it('validates a settings object from an older build with ZERO issues', () => {
        const { settings, issues } = validateSettings(legacyStoredSettings());
        expect(issues).toEqual([]);
        expect(settings.conlangName).toBe('Old');
        expect(settings.wordGenerator).toEqual(DEFAULT_WORD_GENERATOR_SETTINGS);
    });

    it('no longer reports `wordGenerator` as an unknown key', () => {
        const { issues } = validateSettings({ wordGenerator: DEFAULT_WORD_GENERATOR_SETTINGS });
        expect(issues).toEqual([]);
    });

    it('prefixes the generator\'s issue paths with the key', () => {
        const { issues } = validateSettings({
            wordGenerator: { profile: { longVowelChance: 9 } },
        });
        expect(issues).toEqual([
            { path: 'wordGenerator.profile.longVowelChance', message: 'expected a number between 0 and 1' },
        ]);
    });

    it('names the key itself when the whole value is the wrong type', () => {
        const { issues } = validateSettings({ wordGenerator: 'flowing' });
        expect(issues).toEqual([{ path: 'wordGenerator', message: 'expected an object' }]);
    });

    it('reports a template failure at the exact template index', () => {
        const { issues } = validateSettings({
            wordGenerator: { profile: { syllables: [{ pattern: 'CVX', weight: 1 }] } },
        });
        expect(issues[0].path).toBe('wordGenerator.profile.syllables[0].pattern');
        expect(issues[0].message).toContain('"X"');
    });

    it('keeps a valid preset profile verbatim', () => {
        const profile = applyPreset(getPreset('flowing')!, DEFAULT_SETTINGS.wordGenerator.profile);
        const { settings, issues } = validateSettings({
            wordGenerator: { profile, guidePresetId: 'flowing' },
        });
        expect(issues).toEqual([]);
        expect(settings.wordGenerator.profile).toEqual(profile);
        expect(settings.wordGenerator.guidePresetId).toBe('flowing');
    });

    it('hands out a value that shares nothing with DEFAULT_SETTINGS', () => {
        const first = validateSettings({}).settings;
        first.wordGenerator.profile.syllables.push({ pattern: 'V', weight: 1 });
        first.wordGenerator.guidePresetId = 'island';
        expect(DEFAULT_SETTINGS.wordGenerator.profile.syllables).toHaveLength(3);
        expect(DEFAULT_SETTINGS.wordGenerator.guidePresetId).toBeNull();
        expect(validateSettings({}).settings.wordGenerator).toEqual(DEFAULT_WORD_GENERATOR_SETTINGS);
    });
});

describe('settingsApi — updating the generator profile', () => {
    beforeEach(() => {
        localStorage.clear();
        resetSettingsForTests();
    });

    it('persists a whole preset profile', () => {
        const profile = applyPreset(getPreset('sinitic')!, getCurrentSettings().wordGenerator.profile);
        const result = settingsApi.update({ wordGenerator: { profile, guidePresetId: 'sinitic' } });
        expect(result.success).toBe(true);
        expect(getCurrentSettings().wordGenerator.profile.presetId).toBe('sinitic');

        const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!) as EtymologSettings;
        expect(stored.wordGenerator.profile.syllables).toEqual(profile.syllables);
        expect(stored.wordGenerator.guidePresetId).toBe('sinitic');
    });

    it('strict-rejects a bad template and names the path in the message', () => {
        settingsApi.update({ conlangName: 'Eldrin' });
        const current = getCurrentSettings().wordGenerator;
        const result = settingsApi.update({
            wordGenerator: {
                ...current,
                profile: { ...current.profile, syllables: [{ pattern: 'CVX', weight: 1 }] },
            },
        });
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('VALIDATION_ERROR');
        expect(result.error?.message).toContain('wordGenerator.profile.syllables[0].pattern');
        // Nothing was written.
        expect(getCurrentSettings().conlangName).toBe('Eldrin');
        expect(getCurrentSettings().wordGenerator.profile.syllables)
            .toEqual(DEFAULT_WORD_GENERATOR_SETTINGS.profile.syllables);
    });

    it('strict-rejects a template set with no vowel slot', () => {
        const current = getCurrentSettings().wordGenerator;
        const result = settingsApi.update({
            wordGenerator: {
                ...current,
                profile: { ...current.profile, syllables: [{ pattern: 'CNL', weight: 1 }] },
            },
        });
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('vowel slot');
    });

    it('strict-rejects an out-of-range long-vowel chance', () => {
        const current = getCurrentSettings().wordGenerator;
        const result = settingsApi.update({
            wordGenerator: { ...current, profile: { ...current.profile, longVowelChance: 2 } },
        });
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('wordGenerator.profile.longVowelChance');
    });

    it('leaves the generator key alone when an unrelated setting is updated', () => {
        const profile = applyPreset(getPreset('island')!, getCurrentSettings().wordGenerator.profile);
        settingsApi.update({ wordGenerator: { profile, guidePresetId: 'island' } });
        settingsApi.update({ conlangName: 'Kai' });
        expect(getCurrentSettings().wordGenerator.profile.presetId).toBe('island');
        expect(getCurrentSettings().wordGenerator.guidePresetId).toBe('island');
    });

    it('reset restores the default generator settings', () => {
        const profile = applyPreset(getPreset('guttural')!, getCurrentSettings().wordGenerator.profile);
        settingsApi.update({ wordGenerator: { profile, guidePresetId: 'guttural' } });
        settingsApi.reset();
        expect(getCurrentSettings().wordGenerator).toEqual(DEFAULT_WORD_GENERATOR_SETTINGS);
    });

    it('loads a stored generator profile back from localStorage', () => {
        const profile = applyPreset(getPreset('romance')!, getCurrentSettings().wordGenerator.profile);
        settingsApi.update({ wordGenerator: { profile, guidePresetId: null } });
        resetSettingsForTests();
        expect(getCurrentSettings().wordGenerator.profile).toEqual(profile);
    });

    it('boots silently from a stored object written before the generator existed', () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(legacyStoredSettings()));
        resetSettingsForTests();
        const settings = getCurrentSettings();
        expect(settings.conlangName).toBe('Old');
        expect(settings.wordGenerator).toEqual(DEFAULT_WORD_GENERATOR_SETTINGS);
        // And the next write succeeds — a stray issue here would have made
        // EVERY settings update fail for such a user.
        expect(settingsApi.update({ conlangName: 'New' }).success).toBe(true);
    });
});

describe('settingsApi.import — envelopes', () => {
    beforeEach(() => {
        localStorage.clear();
        resetSettingsForTests();
    });

    it('yields the default generator settings with NO warning when the key is absent', () => {
        const result = settingsApi.import(legacyStoredSettings());
        expect(result.success).toBe(true);
        expect(result.data?.warnings).toEqual([]);
        expect(result.data?.settings.wordGenerator).toEqual(DEFAULT_WORD_GENERATOR_SETTINGS);
    });

    it('restores a generator profile from an envelope', () => {
        const profile = applyPreset(getPreset('slavic')!, DEFAULT_SETTINGS.wordGenerator.profile);
        const result = settingsApi.import({
            conlangName: 'Imported',
            wordGenerator: { profile, guidePresetId: 'slavic' },
        });
        expect(result.data?.warnings).toEqual([]);
        expect(getCurrentSettings().wordGenerator.profile).toEqual(profile);
    });

    it('corrects a malformed generator profile and reports the prefixed warning', () => {
        const result = settingsApi.import({
            conlangName: 'Imported',
            wordGenerator: { profile: { syllableCount: { min: 9, max: 9 } } },
        });
        expect(result.success).toBe(true);
        expect(result.data?.warnings).toEqual([
            'wordGenerator.profile.syllableCount.min: expected a whole number between 1 and 5',
            'wordGenerator.profile.syllableCount.max: expected a whole number between 1 and 5',
        ]);
        expect(getCurrentSettings().wordGenerator.profile.syllableCount).toEqual({ min: 5, max: 5 });
    });
});

describe('the export envelope carries the key with no codec change', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        localStorage.clear();
        resetSettingsForTests();
    });

    it('round-trips a generator profile through collect -> JSON -> parse -> import', () => {
        const profile = applyPreset(getPreset('japanese')!, getCurrentSettings().wordGenerator.profile);
        settingsApi.update({ conlangName: 'Kaia', wordGenerator: { profile, guidePresetId: 'japanese' } });

        const envelope = parseAndValidateJson(exportDataToJson(collectExportData()));
        expect((envelope.settings as EtymologSettings).wordGenerator.profile).toEqual(profile);

        resetSettingsForTests();
        localStorage.clear();
        const restored = settingsApi.import(envelope.settings);
        expect(restored.data?.warnings).toEqual([]);
        expect(getCurrentSettings().wordGenerator.profile).toEqual(profile);
        expect(getCurrentSettings().wordGenerator.guidePresetId).toBe('japanese');
    });

    it('accepts an envelope from an older export whose settings lack the key', () => {
        const older = { ...legacyStoredSettings() };
        const restored = settingsApi.import(older);
        expect(restored.data?.warnings).toEqual([]);
        expect(getCurrentSettings().wordGenerator).toEqual(DEFAULT_WORD_GENERATOR_SETTINGS);
    });
});
