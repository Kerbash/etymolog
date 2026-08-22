/**
 * API Layer Barrel Export
 *
 * Combines all API modules into a unified EtymologApi interface.
 * This is the main entry point for the API layer.
 */

// Re-export all types
export type {
    ApiResponse,
    ApiError,
    ApiErrorCode,
    EtymologSettings,
    UpdateSettingsInput,
    PunctuationConfig,
    PunctuationSettings,
    DirectionValue,
    WritingSystemSettings,
    BasicChartDefinition,
    SyllabaryChartDefinition,
    CustomChartDefinition,
    SettingsImportResult,
    CreateGlyphRequest,
    UpdateGlyphRequest,
    GlyphListResponse,
    GlyphWithUsageListResponse,
    CreateGraphemeRequest,
    UpdateGraphemeRequest,
    UpdateGraphemeGlyphsRequest,
    GraphemeListResponse,
    GraphemeCompleteListResponse,
    AddPhonemeRequest,
    UpdatePhonemeRequest,
    DatabaseStatus,
    ExportFormat,
    GlyphApi,
    GraphemeApi,
    PhonemeApi,
    SettingsApi,
    DatabaseApi,
    EtymologApi,
} from './types';

export { DEFAULT_SETTINGS, DEFAULT_PUNCTUATION_CONFIG, DEFAULT_PUNCTUATION_SETTINGS, DEFAULT_WRITING_SYSTEM_SETTINGS } from './types';

// The `wordGenerator` settings key. Re-exported here so a settings consumer can
// type its own state without knowing where under `src/generator/` the shape is
// declared; the generator barrel stays the entry point for everything else it
// does (presets, coverage, the template parser).
export type {
    ClusterRules,
    FrequencyTilt,
    SyllableTemplate,
    WordGeneratorProfile,
    WordGeneratorSettings,
} from '../../generator/profile/types';
export {
    cloneDefaultProfile,
    cloneDefaultWordGeneratorSettings,
    DEFAULT_PROFILE,
    DEFAULT_WORD_GENERATOR_SETTINGS,
} from '../../generator/profile/defaults';

// Re-export lexicon API types
export type {
    LexiconApi,
    LexiconListResponse,
    LexiconCompleteListResponse,
    LexiconWithUsageListResponse,
    UpdateSpellingRequest,
    UpdateAncestryRequest,
} from './lexiconApi';

// Re-export phrase API types
export type {
    PhraseApi,
} from './phraseApi';

// Import API implementations
import { glyphApi } from './glyphApi';
import { graphemeApi, phonemeApi } from './graphemeApi';
import { settingsApi, getCurrentSettings, subscribeToSettings } from './settingsApi';
import { databaseApi, initDatabase } from './databaseApi';
import { lexiconApi } from './lexiconApi';
import { phraseApi } from './phraseApi';

/**
 * Complete Etymolog API.
 * Provides a unified interface for all operations.
 */
export const etymologApi = {
    glyph: glyphApi,
    grapheme: graphemeApi,
    phoneme: phonemeApi,
    settings: settingsApi,
    database: databaseApi,
    lexicon: lexiconApi,
    phrase: phraseApi,
} as const;

// Re-export individual APIs for direct access if needed
export { glyphApi, graphemeApi, phonemeApi, settingsApi, databaseApi, lexiconApi, phraseApi };

// Re-export utility functions
export { getCurrentSettings, subscribeToSettings, initDatabase };
