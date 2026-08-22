/**
 * Settings schema — validation + defaults
 *
 * Settings arrive from three untrusted places: localStorage (possibly written
 * by an older build), an import envelope (hand-editable JSON), and `update()`
 * calls from UI code. All three pass through `validateSettings()`, which
 * returns a COMPLETE `EtymologSettings` (every key present, every nested object
 * deep-cloned from defaults when missing) plus the list of issues it had to
 * correct.
 *
 * Callers decide strictness: loading/importing logs the issues and keeps the
 * corrected values; `update()` rejects when any issue is present so a typo in
 * UI code cannot silently write a default.
 *
 * Hand-written on purpose — no schema-library dependency for ~10 fields.
 */

import {
    DEFAULT_PUNCTUATION_CONFIG,
    DEFAULT_SETTINGS,
    DEFAULT_WRITING_SYSTEM_SETTINGS,
    type CustomChartDefinition,
    type DirectionValue,
    type EtymologSettings,
    type PunctuationConfig,
    type PunctuationSettings,
    type WritingSystemSettings,
} from './types';
import { validateGeneratorSettings } from '../../generator/profile/validate';
import type { WordGeneratorSettings } from '../../generator/profile/types';

export interface SettingsIssue {
    path: string;
    message: string;
}

export interface SettingsValidation {
    settings: EtymologSettings;
    issues: SettingsIssue[];
}

const DIRECTION_VALUES: readonly DirectionValue[] = ['ltr', 'rtl', 'ttb', 'btt'];
/** Accepted spellings of the legacy bottom-to-top value. */
const LEGACY_DIRECTION_ALIASES: Record<string, DirectionValue> = { btu: 'btt' };
const WORD_WRAP_VALUES = ['word', 'glyph', 'none'] as const;
const BASELINE_VALUES = ['top', 'center', 'bottom'] as const;
const GALLERY_VIEW_VALUES = ['compact', 'detailed', 'expanded'] as const;

export const PUNCTUATION_KEYS: readonly (keyof PunctuationSettings)[] = [
    'wordSeparator',
    'sentenceSeparator',
    'comma',
    'questionMark',
    'exclamationMark',
    'colon',
    'semicolon',
    'ellipsis',
    'quotationOpen',
    'quotationClose',
];

const KNOWN_KEYS: readonly (keyof EtymologSettings)[] = [
    'conlangName',
    'simpleScriptSystem',
    'defaultGalleryView',
    'autoManageGlyphs',
    'punctuation',
    'writingSystem',
    'customCharts',
    'wordGenerator',
];

/** Keys older builds wrote that no longer exist; dropped silently. */
const RETIRED_KEYS = new Set(['autoSaveInterval']);
/** Nested writing-system keys older builds wrote; `glyphStacking` was never read by any layout code. */
const RETIRED_WRITING_SYSTEM_KEYS = new Set(['glyphStacking']);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A fresh, unshared copy of the defaults. Never hand out `DEFAULT_SETTINGS` itself. */
export function cloneDefaultSettings(): EtymologSettings {
    return structuredClone(DEFAULT_SETTINGS);
}

function validatePunctuationConfig(
    raw: unknown,
    path: string,
    issues: SettingsIssue[],
): PunctuationConfig {
    const out: PunctuationConfig = { ...DEFAULT_PUNCTUATION_CONFIG };
    if (!isRecord(raw)) {
        if (raw !== undefined) issues.push({ path, message: 'expected an object' });
        return out;
    }
    const { graphemeId, useNoGlyph } = raw;
    if (graphemeId === null || graphemeId === undefined) {
        out.graphemeId = null;
    } else if (typeof graphemeId === 'number' && Number.isInteger(graphemeId) && graphemeId > 0) {
        out.graphemeId = graphemeId;
    } else {
        issues.push({ path: `${path}.graphemeId`, message: 'expected a positive integer or null' });
    }
    if (useNoGlyph === undefined) {
        out.useNoGlyph = false;
    } else if (typeof useNoGlyph === 'boolean') {
        out.useNoGlyph = useNoGlyph;
    } else {
        issues.push({ path: `${path}.useNoGlyph`, message: 'expected a boolean' });
    }
    return out;
}

function validatePunctuation(raw: unknown, issues: SettingsIssue[]): PunctuationSettings {
    const source = isRecord(raw) ? raw : {};
    if (raw !== undefined && !isRecord(raw)) {
        issues.push({ path: 'punctuation', message: 'expected an object' });
    }
    const out = {} as PunctuationSettings;
    for (const key of PUNCTUATION_KEYS) {
        out[key] = validatePunctuationConfig(source[key], `punctuation.${key}`, issues);
    }
    return out;
}

function validateDirection(raw: unknown, path: string, issues: SettingsIssue[], fallback: DirectionValue): DirectionValue {
    if (typeof raw === 'string') {
        if ((DIRECTION_VALUES as readonly string[]).includes(raw)) return raw as DirectionValue;
        const alias = LEGACY_DIRECTION_ALIASES[raw];
        if (alias) return alias;
    }
    if (raw !== undefined) {
        issues.push({ path, message: `expected one of ${DIRECTION_VALUES.join(', ')}` });
    }
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
    if (raw !== undefined) {
        issues.push({ path, message: `expected one of ${allowed.join(', ')}` });
    }
    return fallback;
}

function validateWritingSystem(raw: unknown, issues: SettingsIssue[]): WritingSystemSettings {
    const source = isRecord(raw) ? raw : {};
    if (raw !== undefined && !isRecord(raw)) {
        issues.push({ path: 'writingSystem', message: 'expected an object' });
    }
    for (const key of Object.keys(source)) {
        if (!(key in DEFAULT_WRITING_SYSTEM_SETTINGS) && !RETIRED_WRITING_SYSTEM_KEYS.has(key)) {
            issues.push({ path: `writingSystem.${key}`, message: 'unknown setting (dropped)' });
        }
    }
    const d = DEFAULT_WRITING_SYSTEM_SETTINGS;
    return {
        glyphDirection: validateDirection(source.glyphDirection, 'writingSystem.glyphDirection', issues, d.glyphDirection),
        wordOrder: validateDirection(source.wordOrder, 'writingSystem.wordOrder', issues, d.wordOrder),
        lineProgression: validateDirection(source.lineProgression, 'writingSystem.lineProgression', issues, d.lineProgression),
        wordWrap: validateEnum(source.wordWrap, WORD_WRAP_VALUES, 'writingSystem.wordWrap', issues, d.wordWrap),
        baselineAlignment: validateEnum(source.baselineAlignment, BASELINE_VALUES, 'writingSystem.baselineAlignment', issues, d.baselineAlignment),
    };
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(v => typeof v === 'string');
}

function validateCustomChart(raw: unknown, path: string, issues: SettingsIssue[]): CustomChartDefinition | null {
    if (!isRecord(raw)) {
        issues.push({ path, message: 'expected an object' });
        return null;
    }
    const { id, name, createdAt, type } = raw;
    if (typeof id !== 'string' || id.length === 0) {
        issues.push({ path: `${path}.id`, message: 'expected a non-empty string' });
        return null;
    }
    if (typeof name !== 'string') {
        issues.push({ path: `${path}.name`, message: 'expected a string' });
        return null;
    }
    const created = typeof createdAt === 'string' ? createdAt : new Date(0).toISOString();
    if (typeof createdAt !== 'string') {
        issues.push({ path: `${path}.createdAt`, message: 'expected an ISO date string' });
    }
    if (type === 'basic') {
        if (!isStringArray(raw.ipaCharacters)) {
            issues.push({ path: `${path}.ipaCharacters`, message: 'expected a string array' });
            return null;
        }
        return { id, name, createdAt: created, type: 'basic', ipaCharacters: [...raw.ipaCharacters] };
    }
    if (type === 'syllabary') {
        if (!isStringArray(raw.xAxis) || !isStringArray(raw.yAxis)) {
            issues.push({ path: `${path}.axes`, message: 'expected xAxis and yAxis string arrays' });
            return null;
        }
        return { id, name, createdAt: created, type: 'syllabary', xAxis: [...raw.xAxis], yAxis: [...raw.yAxis] };
    }
    issues.push({ path: `${path}.type`, message: "expected 'basic' or 'syllabary'" });
    return null;
}

function validateCustomCharts(raw: unknown, issues: SettingsIssue[]): CustomChartDefinition[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) {
        issues.push({ path: 'customCharts', message: 'expected an array' });
        return [];
    }
    const out: CustomChartDefinition[] = [];
    const seen = new Set<string>();
    raw.forEach((entry, index) => {
        const chart = validateCustomChart(entry, `customCharts[${index}]`, issues);
        if (!chart) return;
        if (seen.has(chart.id)) {
            issues.push({ path: `customCharts[${index}].id`, message: `duplicate chart id "${chart.id}"` });
            return;
        }
        seen.add(chart.id);
        out.push(chart);
    });
    return out;
}

/**
 * The `wordGenerator` key is owned by `src/generator/profile/validate.ts` — the
 * generator defines its own shape, so it validates it, and this layer only
 * re-homes the issue paths under the key they belong to.
 *
 * `undefined` in, zero issues out: settings written before the generator existed
 * have no such key, `validateSettings` runs on every boot, and `update()` is
 * strict — an issue for a missing key would make every settings write fail for
 * anyone with an older stored object.
 */
function validateWordGenerator(raw: unknown, issues: SettingsIssue[]): WordGeneratorSettings {
    const result = validateGeneratorSettings(raw);
    for (const issue of result.issues) {
        issues.push({
            path: issue.path ? `wordGenerator.${issue.path}` : 'wordGenerator',
            message: issue.message,
        });
    }
    return result.settings;
}

/**
 * Validate an arbitrary value as settings. Always returns a complete, fully
 * owned `EtymologSettings`; `issues` lists every correction that was made.
 */
export function validateSettings(raw: unknown): SettingsValidation {
    const issues: SettingsIssue[] = [];
    const defaults = cloneDefaultSettings();

    if (!isRecord(raw)) {
        if (raw !== undefined && raw !== null) {
            issues.push({ path: '', message: 'expected a settings object' });
        }
        return { settings: defaults, issues };
    }

    for (const key of Object.keys(raw)) {
        if (!(KNOWN_KEYS as readonly string[]).includes(key) && !RETIRED_KEYS.has(key)) {
            issues.push({ path: key, message: 'unknown setting (dropped)' });
        }
    }

    const settings: EtymologSettings = {
        conlangName: typeof raw.conlangName === 'string'
            ? raw.conlangName
            : (raw.conlangName === undefined ? defaults.conlangName : (issues.push({ path: 'conlangName', message: 'expected a string' }), defaults.conlangName)),
        simpleScriptSystem: typeof raw.simpleScriptSystem === 'boolean'
            ? raw.simpleScriptSystem
            : (raw.simpleScriptSystem === undefined ? defaults.simpleScriptSystem : (issues.push({ path: 'simpleScriptSystem', message: 'expected a boolean' }), defaults.simpleScriptSystem)),
        defaultGalleryView: validateEnum(raw.defaultGalleryView, GALLERY_VIEW_VALUES, 'defaultGalleryView', issues, defaults.defaultGalleryView),
        autoManageGlyphs: typeof raw.autoManageGlyphs === 'boolean'
            ? raw.autoManageGlyphs
            : (raw.autoManageGlyphs === undefined ? defaults.autoManageGlyphs : (issues.push({ path: 'autoManageGlyphs', message: 'expected a boolean' }), defaults.autoManageGlyphs)),
        punctuation: validatePunctuation(raw.punctuation, issues),
        writingSystem: validateWritingSystem(raw.writingSystem, issues),
        customCharts: validateCustomCharts(raw.customCharts, issues),
        wordGenerator: validateWordGenerator(raw.wordGenerator, issues),
    };

    return { settings, issues };
}
