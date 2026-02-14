/**
 * Phrase API
 *
 * Standardized API layer for phrase translation operations.
 * Wraps the internal phrase service with consistent ApiResponse format.
 *
 * Note: Phrase translations are ephemeral and not persisted to the database.
 */

import type { ApiResponse, ApiErrorCode } from './types';
import type { PhraseTranslationResult } from '../types';
import { translatePhrase } from '../phraseService';
import { getAllLexiconComplete } from '../lexiconService';
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
 * @returns ApiResponse with PhraseTranslationResult
 */
function translate(phrase: string): ApiResponse<PhraseTranslationResult> {
    const dbError = checkDbInitialized<PhraseTranslationResult>();
    if (dbError) return dbError;

    // Validation
    if (!phrase || !phrase.trim()) {
        return errorResponse('VALIDATION_ERROR', 'Phrase is empty');
    }

    try {
        // Get all lexicon entries
        const lexiconEntries = getAllLexiconComplete();

        // Translate the phrase
        const result = translatePhrase(phrase, lexiconEntries);

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
     */
    translate(phrase: string): ApiResponse<PhraseTranslationResult>;
}

/**
 * Phrase API implementation.
 */
export const phraseApi: PhraseApi = {
    translate,
};
