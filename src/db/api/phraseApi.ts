/**
 * Phrase API
 *
 * Standardized API layer for phrase translation operations.
 * Wraps the internal phrase service with consistent ApiResponse format.
 *
 * Note: Phrase translations are ephemeral and not persisted to the database.
 */

import type { ApiResponse, ApiErrorCode, PunctuationSettings } from './types';
import type { PhraseTranslationResult, GraphemeComplete } from '../types';
import { translatePhrase, type TranslationConfig } from '../phraseService';
import { getAllLexiconComplete } from '../lexiconService';
import { getAllGraphemesComplete } from '../graphemeService';
import { isDatabaseInitialized } from '../database';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Helper to create a standardized error response.
 */
function errorResponse<T>(
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>
): ApiResponse<T> {
    return {
        success: false,
        error: { code, message, details },
    };
}

/**
 * Helper to create a successful response.
 */
function successResponse<T>(data: T): ApiResponse<T> {
    return {
        success: true,
        data,
    };
}

/**
 * Check if database is initialized, return error response if not.
 */
function checkDbInitialized<T>(): ApiResponse<T> | null {
    if (!isDatabaseInitialized()) {
        return errorResponse('DB_NOT_INITIALIZED', 'Database not initialized. Call initDatabase() first.');
    }
    return null;
}

// =============================================================================
// PHRASE API IMPLEMENTATION
// =============================================================================

/**
 * Translate a phrase to conlang spelling.
 *
 * Algorithm:
 * 1. Validate input phrase
 * 2. Get all lexicon entries
 * 3. Translate phrase word-by-word (lexicon lookup or autospell)
 * 4. Combine with word separators
 *
 * @param phrase - The English phrase to translate
 * @param punctuationSettings - Optional punctuation settings from global settings
 * @returns ApiResponse with PhraseTranslationResult
 */
function translate(
    phrase: string,
    punctuationSettings?: PunctuationSettings
): ApiResponse<PhraseTranslationResult> {
    const dbError = checkDbInitialized<PhraseTranslationResult>();
    if (dbError) return dbError;

    // Validation
    if (!phrase || !phrase.trim()) {
        return errorResponse('VALIDATION_ERROR', 'Phrase is empty');
    }

    try {
        // Get all lexicon entries
        const lexiconEntries = getAllLexiconComplete();

        // Build translation config if punctuation settings provided
        let config: TranslationConfig | undefined;
        if (punctuationSettings) {
            // Get all graphemes to resolve punctuation grapheme IDs
            const allGraphemes = getAllGraphemesComplete();
            const punctuationGraphemes = new Map<number, GraphemeComplete>();

            // Build map of grapheme IDs for punctuation
            for (const grapheme of allGraphemes) {
                punctuationGraphemes.set(grapheme.id, grapheme);
            }

            config = {
                punctuationSettings,
                punctuationGraphemes,
            };
        }

        // Translate the phrase
        const result = translatePhrase(phrase, lexiconEntries, config);

        return successResponse(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Translation failed';
        return errorResponse('OPERATION_FAILED', message);
    }
}

// =============================================================================
// PHRASE API INTERFACE
// =============================================================================

/**
 * Phrase API interface.
 */
export interface PhraseApi {
    /**
     * Translate a phrase to conlang spelling.
     * Uses lexicon lookup for known words and autospeller for unknown words.
     * @param phrase - The phrase to translate
     * @param punctuationSettings - Optional punctuation settings for word/sentence separators
     */
    translate(phrase: string, punctuationSettings?: PunctuationSettings): ApiResponse<PhraseTranslationResult>;
}

/**
 * Phrase API implementation.
 */
export const phraseApi: PhraseApi = {
    translate,
};
