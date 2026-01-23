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

import type { EtymologApi } from './types';

export { DEFAULT_SETTINGS } from './types';

// Import API implementations
import { glyphApi } from './glyphApi';
import { graphemeApi, phonemeApi } from './graphemeApi';
import { settingsApi, getCurrentSettings, subscribeToSettings } from './settingsApi';
import { databaseApi, initDatabase } from './databaseApi';

/**
 * Complete Etymolog API.
 * Provides a unified interface for all operations.
 */
export const etymologApi: EtymologApi = {
    glyph: glyphApi,
    grapheme: graphemeApi,
    phoneme: phonemeApi,
    settings: settingsApi,
    database: databaseApi,
};

// Re-export individual APIs for direct access if needed
export { glyphApi, graphemeApi, phonemeApi, settingsApi, databaseApi };

// Re-export utility functions
export { getCurrentSettings, subscribeToSettings, initDatabase };
