/**
 * Settings API tests — validation, deep defaults, notification on every
 * change path, and legacy coercion.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    settingsApi,
    getCurrentSettings,
    subscribeToSettings,
    resetSettingsForTests,
    SETTINGS_STORAGE_KEY,
} from '../api/settingsApi';
import { validateSettings, cloneDefaultSettings } from '../api/settingsSchema';
import { DEFAULT_SETTINGS } from '../api/types';

describe('validateSettings', () => {
    it('returns complete defaults for undefined/null', () => {
        expect(validateSettings(undefined).settings).toEqual(DEFAULT_SETTINGS);
        expect(validateSettings(null).settings).toEqual(DEFAULT_SETTINGS);
        expect(validateSettings(undefined).issues).toEqual([]);
    });

    it('fills missing nested punctuation keys from defaults (older builds lacked ellipsis/quotation)', () => {
        const { settings, issues } = validateSettings({
            punctuation: { wordSeparator: { graphemeId: 3, useNoGlyph: false } },
        });
        expect(settings.punctuation.wordSeparator.graphemeId).toBe(3);
        expect(settings.punctuation.ellipsis).toEqual({ graphemeId: null, useNoGlyph: false });
        expect(settings.punctuation.quotationOpen).toEqual({ graphemeId: null, useNoGlyph: false });
        expect(issues).toEqual([]);
    });

    it("coerces the legacy 'btu' direction to 'btt' without an issue", () => {
        const { settings, issues } = validateSettings({
            writingSystem: { glyphDirection: 'btu', wordOrder: 'rtl', lineProgression: 'btu' },
        });
        expect(settings.writingSystem.glyphDirection).toBe('btt');
        expect(settings.writingSystem.lineProgression).toBe('btt');
        expect(settings.writingSystem.wordOrder).toBe('rtl');
        expect(issues).toEqual([]);
    });

    it('drops retired keys silently and reports unknown keys', () => {
        const { settings, issues } = validateSettings({ autoSaveInterval: 500, bogus: 1 });
        expect('autoSaveInterval' in settings).toBe(false);
        expect(issues).toEqual([{ path: 'bogus', message: 'unknown setting (dropped)' }]);
    });

    it('replaces invalid enum values with defaults and reports them', () => {
        const { settings, issues } = validateSettings({
            defaultGalleryView: 'huge',
            writingSystem: { wordWrap: 'maybe' },
        });
        expect(settings.defaultGalleryView).toBe('compact');
        expect(settings.writingSystem.wordWrap).toBe('word');
        expect(issues.map(i => i.path)).toEqual(['defaultGalleryView', 'writingSystem.wordWrap']);
    });

    it('validates custom charts and skips malformed / duplicate entries', () => {
        const { settings, issues } = validateSettings({
            customCharts: [
                { id: 'a', name: 'A', createdAt: 'x', type: 'basic', ipaCharacters: ['p', 'b'] },
                { id: 'a', name: 'dup', createdAt: 'x', type: 'basic', ipaCharacters: [] },
                { id: 'b', name: 'B', createdAt: 'x', type: 'syllabary', xAxis: ['a'], yAxis: ['k'] },
                { id: 'c', name: 'C', createdAt: 'x', type: 'unknown' },
                'not an object',
            ],
        });
        expect(settings.customCharts.map(c => c.id)).toEqual(['a', 'b']);
        expect(issues).toHaveLength(3);
    });

    it('never shares nested objects with DEFAULT_SETTINGS', () => {
        const a = cloneDefaultSettings();
        a.punctuation.comma.useNoGlyph = true;
        expect(DEFAULT_SETTINGS.punctuation.comma.useNoGlyph).toBe(false);
        expect(cloneDefaultSettings().punctuation.comma.useNoGlyph).toBe(false);
    });
});

describe('settingsApi', () => {
    beforeEach(() => {
        localStorage.clear();
        resetSettingsForTests();
    });

    it('update rejects invalid values with VALIDATION_ERROR and leaves state untouched', () => {
        settingsApi.update({ conlangName: 'Eldrin' });
        const result = settingsApi.update({ defaultGalleryView: 'nope' as never });
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('VALIDATION_ERROR');
        expect(getCurrentSettings().conlangName).toBe('Eldrin');
        expect(getCurrentSettings().defaultGalleryView).toBe('compact');
    });

    it('update, reset and import all notify subscribers', () => {
        const seen: string[] = [];
        subscribeToSettings(s => seen.push(s.conlangName));
        settingsApi.update({ conlangName: 'One' });
        settingsApi.import({ conlangName: 'Two' });
        settingsApi.reset();
        expect(seen).toEqual(['One', 'Two', '']);
    });

    it('import corrects malformed input and returns the warnings', () => {
        const result = settingsApi.import({
            conlangName: 'Imported',
            autoSaveInterval: 0,
            writingSystem: { glyphDirection: 'btu', wordWrap: 'sideways' },
            unknownThing: true,
        });
        expect(result.success).toBe(true);
        expect(result.data?.settings.conlangName).toBe('Imported');
        expect(result.data?.settings.writingSystem.glyphDirection).toBe('btt');
        expect(result.data?.warnings).toEqual([
            'unknownThing: unknown setting (dropped)',
            'writingSystem.wordWrap: expected one of word, glyph, none',
        ]);
    });

    it('persists to localStorage and reloads through the validator', () => {
        settingsApi.update({ conlangName: 'Persisted' });
        const raw = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!);
        expect(raw.conlangName).toBe('Persisted');

        // Simulate an older build's blob: missing nested keys, legacy direction.
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            conlangName: 'Legacy',
            punctuation: { comma: { graphemeId: 2, useNoGlyph: true } },
            writingSystem: { lineProgression: 'btu' },
        }));
        resetSettingsForTests();
        const loaded = getCurrentSettings();
        expect(loaded.conlangName).toBe('Legacy');
        expect(loaded.punctuation.comma.graphemeId).toBe(2);
        expect(loaded.punctuation.wordSeparator.graphemeId).toBeNull();
        expect(loaded.writingSystem.lineProgression).toBe('btt');
        expect(loaded.writingSystem.glyphDirection).toBe('ltr');
    });

    it('get returns a copy — mutating it does not affect state', () => {
        const copy = getCurrentSettings();
        copy.punctuation.comma.useNoGlyph = true;
        expect(getCurrentSettings().punctuation.comma.useNoGlyph).toBe(false);
    });
});
