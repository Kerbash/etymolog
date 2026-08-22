/**
 * Grapheme API
 *
 * Standardized API layer for grapheme and phoneme operations.
 * Wraps the internal grapheme service with consistent ApiResponse format.
 */

import type {
    ApiResponse,
    ApiErrorCode,
    CreateGraphemeRequest,
    UpdateGraphemeRequest,
    UpdateGraphemeGlyphsRequest,
    GraphemeListResponse,
    GraphemeCompleteListResponse,
    AddPhonemeRequest,
    UpdatePhonemeRequest,
    GraphemeApi,
    PhonemeApi,
    DeleteGraphemeOptions,
    DeleteGraphemeResult,
} from './types';
import type { Grapheme, GraphemeComplete, Phoneme, Lexicon } from '../types';
import {
    createGrapheme as serviceCreateGrapheme,
    getGraphemeById as serviceGetGraphemeById,
    getGraphemeComplete as serviceGetGraphemeComplete,
    getAllGraphemes,
    getAllGraphemesComplete,
    searchGraphemesByName,
    updateGrapheme as serviceUpdateGrapheme,
    deleteGrapheme as serviceDeleteGrapheme,
    setGraphemeGlyphs,
    addPhoneme as serviceAddPhoneme,
    getPhonemeById as serviceGetPhonemeById,
    getPhonemesByGraphemeId as serviceGetPhonemesByGraphemeId,
    updatePhoneme as serviceUpdatePhoneme,
    deletePhoneme as serviceDeletePhoneme,
    deleteAllPhonemesForGrapheme as serviceDeleteAllPhonemesForGrapheme,
    getAutoSpellingPhonemes as serviceGetAutoSpellingPhonemes,
    getGraphemeByPhoneme as serviceGetGraphemeByPhoneme,
    getAllPhonemeGraphemeMappings as serviceGetAllPhonemeGraphemeMappings,
    getGraphemeLexiconUsageCount,
} from '../graphemeService';
import { getLexiconEntriesUsingGrapheme, handleGraphemeDeletion } from '../lexiconService';
import { cleanupOrphanedGlyphs } from '../glyphService';
import { isDatabaseInitialized, getDatabase } from '../database';
import { withTransaction } from '../utils/transaction';
import { getCurrentSettings } from './settingsApi';
import { serviceLog } from '../utils/logger';

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
// GRAPHEME API IMPLEMENTATION
// =============================================================================

/**
 * Create a new grapheme.
 */
function createGrapheme(request: CreateGraphemeRequest): ApiResponse<GraphemeComplete> {
    const dbError = checkDbInitialized<GraphemeComplete>();
    if (dbError) return dbError;

    // Validation
    if (!request.name || request.name.trim() === '') {
        return errorResponse('VALIDATION_ERROR', 'Grapheme name is required');
    }
    if (!request.glyphs || request.glyphs.length === 0) {
        return errorResponse('VALIDATION_ERROR', 'At least one glyph is required');
    }

    try {
        const grapheme = serviceCreateGrapheme({
            name: request.name.trim(),
            category: request.category?.trim(),
            notes: request.notes?.trim(),
            glyphs: request.glyphs.map(g => ({
                glyph_id: g.glyph_id,
                position: g.position,
                transform: g.transform,
            })),
            phonemes: request.phonemes?.map(p => ({
                phoneme: p.phoneme.trim(),
                use_in_auto_spelling: p.use_in_auto_spelling,
                context: p.context?.trim(),
            })),
        });
        return successResponse(grapheme);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to create grapheme'
        );
    }
}

/**
 * Get a grapheme by ID (basic info only).
 */
function getGraphemeById(id: number): ApiResponse<Grapheme> {
    const dbError = checkDbInitialized<Grapheme>();
    if (dbError) return dbError;

    try {
        const grapheme = serviceGetGraphemeById(id);
        if (!grapheme) {
            return errorResponse('NOT_FOUND', `Grapheme with ID ${id} not found`);
        }
        return successResponse(grapheme);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to get grapheme'
        );
    }
}

/**
 * Get a grapheme by ID with full data (glyphs + phonemes).
 */
function getGraphemeByIdComplete(id: number): ApiResponse<GraphemeComplete> {
    const dbError = checkDbInitialized<GraphemeComplete>();
    if (dbError) return dbError;

    try {
        const grapheme = serviceGetGraphemeComplete(id);
        if (!grapheme) {
            return errorResponse('NOT_FOUND', `Grapheme with ID ${id} not found`);
        }
        return successResponse(grapheme);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to get complete grapheme'
        );
    }
}

/**
 * Get all graphemes (basic info only).
 */
function getGraphemeAll(): ApiResponse<GraphemeListResponse> {
    const dbError = checkDbInitialized<GraphemeListResponse>();
    if (dbError) return dbError;

    try {
        const graphemes = getAllGraphemes();
        return successResponse({
            graphemes,
            total: graphemes.length,
        });
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to get graphemes'
        );
    }
}

/**
 * Get all graphemes with full data.
 */
function getGraphemeAllComplete(): ApiResponse<GraphemeCompleteListResponse> {
    const dbError = checkDbInitialized<GraphemeCompleteListResponse>();
    if (dbError) return dbError;

    try {
        const graphemes = getAllGraphemesComplete();
        return successResponse({
            graphemes,
            total: graphemes.length,
        });
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to get complete graphemes'
        );
    }
}

/**
 * Search graphemes by name.
 */
function searchGraphemes(query: string): ApiResponse<GraphemeListResponse> {
    const dbError = checkDbInitialized<GraphemeListResponse>();
    if (dbError) return dbError;

    try {
        const graphemes = searchGraphemesByName(query);
        return successResponse({
            graphemes,
            total: graphemes.length,
        });
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to search graphemes'
        );
    }
}

/**
 * Update a grapheme's basic info.
 */
function updateGrapheme(id: number, request: UpdateGraphemeRequest): ApiResponse<Grapheme> {
    const dbError = checkDbInitialized<Grapheme>();
    if (dbError) return dbError;

    try {
        const grapheme = serviceUpdateGrapheme(id, {
            name: request.name?.trim(),
            category: request.category !== undefined ? (request.category?.trim() || null) : undefined,
            notes: request.notes,
        });
        if (!grapheme) {
            return errorResponse('NOT_FOUND', `Grapheme with ID ${id} not found`);
        }
        return successResponse(grapheme);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to update grapheme'
        );
    }
}

/**
 * Update a grapheme's glyph composition.
 * If autoManageGlyphs setting is enabled, also cleans up orphaned glyphs.
 */
function updateGraphemeGlyphs(id: number, request: UpdateGraphemeGlyphsRequest): ApiResponse<void> {
    const dbError = checkDbInitialized<void>();
    if (dbError) return dbError;

    // Validation
    if (!request.glyphs || request.glyphs.length === 0) {
        return errorResponse('VALIDATION_ERROR', 'At least one glyph is required');
    }

    try {
        // First check if grapheme exists
        const existing = serviceGetGraphemeById(id);
        if (!existing) {
            return errorResponse('NOT_FOUND', `Grapheme with ID ${id} not found`);
        }

        setGraphemeGlyphs(id, request.glyphs.map(g => ({
            glyph_id: g.glyph_id,
            position: g.position,
            transform: g.transform,
        })));

        // Check if auto-manage is enabled and cleanup orphaned glyphs
        const settings = getCurrentSettings();
        if (settings.autoManageGlyphs) {
            const deletedCount = cleanupOrphanedGlyphs();
            if (deletedCount > 0) {
                serviceLog.info(`Auto-manage: Cleaned up ${deletedCount} orphaned glyph(s)`);
            }
        }

        return successResponse(undefined);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to update grapheme glyphs'
        );
    }
}

/**
 * Delete a grapheme.
 *
 * When words still spell with it the call fails with CONSTRAINT_VIOLATION
 * (details.lexiconCount) unless `respellLexicon` is set — then the words are
 * rewritten (auto-spelled ones with the grapheme's primary phoneme, manual
 * ones flagged for review) and the grapheme removed, all in one transaction.
 * With `autoManageGlyphs` on, glyphs orphaned by the delete are cleaned up.
 */
function deleteGrapheme(id: number, options: DeleteGraphemeOptions = {}): ApiResponse<DeleteGraphemeResult> {
    const dbError = checkDbInitialized<DeleteGraphemeResult>();
    if (dbError) return dbError;

    try {
        const grapheme = serviceGetGraphemeComplete(id);
        if (!grapheme) {
            return errorResponse('NOT_FOUND', `Grapheme with ID ${id} not found`);
        }

        const lexiconCount = getGraphemeLexiconUsageCount(id);
        if (lexiconCount > 0 && !options.respellLexicon) {
            return errorResponse(
                'CONSTRAINT_VIOLATION',
                `Cannot delete grapheme "${grapheme.name}": it is used in ${lexiconCount} word${lexiconCount === 1 ? '' : 's'}`,
                { lexiconCount },
            );
        }

        const result = withTransaction(getDatabase(), () => {
            let lexiconRespelled = 0;
            let lexiconMarked = 0;
            if (lexiconCount > 0) {
                const primaryPhoneme = grapheme.phonemes.find(p => p.use_in_auto_spelling)?.phoneme
                    ?? grapheme.phonemes[0]?.phoneme;
                const report = handleGraphemeDeletion(id, primaryPhoneme);
                lexiconRespelled = report.respelledCount;
                lexiconMarked = report.markedForAttentionCount;
            }
            serviceDeleteGrapheme(id);
            let orphanGlyphsRemoved = 0;
            if (getCurrentSettings().autoManageGlyphs) {
                orphanGlyphsRemoved = cleanupOrphanedGlyphs();
                if (orphanGlyphsRemoved > 0) {
                    serviceLog.info(`Auto-manage: Cleaned up ${orphanGlyphsRemoved} orphaned glyph(s)`);
                }
            }
            return { lexiconRespelled, lexiconMarked, orphanGlyphsRemoved };
        });

        return successResponse(result);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to delete grapheme'
        );
    }
}

/** Words whose spelling uses a grapheme. */
function getLexiconUsage(id: number): ApiResponse<Lexicon[]> {
    const dbError = checkDbInitialized<Lexicon[]>();
    if (dbError) return dbError;
    try {
        return successResponse(getLexiconEntriesUsingGrapheme(id));
    } catch (error) {
        return errorResponse('OPERATION_FAILED', error instanceof Error ? error.message : 'Failed to load grapheme usage');
    }
}

/**
 * Get a grapheme by its associated phoneme (IPA character).
 */
function getGraphemeByPhoneme(phoneme: string): ApiResponse<GraphemeComplete | null> {
    const dbError = checkDbInitialized<GraphemeComplete | null>();
    if (dbError) return dbError;

    try {
        const grapheme = serviceGetGraphemeByPhoneme(phoneme);
        return successResponse(grapheme);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to get grapheme by phoneme'
        );
    }
}

/**
 * Get a mapping of all phonemes to their graphemes.
 */
function getPhonemeGraphemeMap(): ApiResponse<Map<string, GraphemeComplete>> {
    const dbError = checkDbInitialized<Map<string, GraphemeComplete>>();
    if (dbError) return dbError;

    try {
        const mappings = serviceGetAllPhonemeGraphemeMappings();
        return successResponse(mappings);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to get phoneme-grapheme mappings'
        );
    }
}

/**
 * Grapheme API implementation.
 */
export const graphemeApi: GraphemeApi = {
    create: createGrapheme,
    getById: getGraphemeById,
    getByIdComplete: getGraphemeByIdComplete,
    getAll: getGraphemeAll,
    getAllComplete: getGraphemeAllComplete,
    search: searchGraphemes,
    update: updateGrapheme,
    updateGlyphs: updateGraphemeGlyphs,
    delete: deleteGrapheme,
    getLexiconUsage,
    getByPhoneme: getGraphemeByPhoneme,
    getPhonemeMap: getPhonemeGraphemeMap,
};

// =============================================================================
// PHONEME API IMPLEMENTATION
// =============================================================================

/**
 * Add a phoneme to a grapheme.
 */
function addPhoneme(request: AddPhonemeRequest): ApiResponse<Phoneme> {
    const dbError = checkDbInitialized<Phoneme>();
    if (dbError) return dbError;

    // Validation
    if (!request.phoneme || request.phoneme.trim() === '') {
        return errorResponse('VALIDATION_ERROR', 'Phoneme is required');
    }

    try {
        // Check if grapheme exists
        const grapheme = serviceGetGraphemeById(request.grapheme_id);
        if (!grapheme) {
            return errorResponse('NOT_FOUND', `Grapheme with ID ${request.grapheme_id} not found`);
        }

        const phoneme = serviceAddPhoneme(request.grapheme_id, {
            phoneme: request.phoneme.trim(),
            use_in_auto_spelling: request.use_in_auto_spelling,
            context: request.context?.trim(),
        });
        return successResponse(phoneme);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to add phoneme'
        );
    }
}

/**
 * Get a phoneme by ID.
 */
function getPhonemeById(id: number): ApiResponse<Phoneme> {
    const dbError = checkDbInitialized<Phoneme>();
    if (dbError) return dbError;

    try {
        const phoneme = serviceGetPhonemeById(id);
        if (!phoneme) {
            return errorResponse('NOT_FOUND', `Phoneme with ID ${id} not found`);
        }
        return successResponse(phoneme);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to get phoneme'
        );
    }
}

/**
 * Get all phonemes for a grapheme.
 */
function getPhonemesByGraphemeId(graphemeId: number): ApiResponse<Phoneme[]> {
    const dbError = checkDbInitialized<Phoneme[]>();
    if (dbError) return dbError;

    try {
        const phonemes = serviceGetPhonemesByGraphemeId(graphemeId);
        return successResponse(phonemes);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to get phonemes'
        );
    }
}

/**
 * Update a phoneme.
 */
function updatePhoneme(id: number, request: UpdatePhonemeRequest): ApiResponse<Phoneme> {
    const dbError = checkDbInitialized<Phoneme>();
    if (dbError) return dbError;

    try {
        const phoneme = serviceUpdatePhoneme(id, {
            phoneme: request.phoneme?.trim(),
            use_in_auto_spelling: request.use_in_auto_spelling,
            context: request.context,
        });
        if (!phoneme) {
            return errorResponse('NOT_FOUND', `Phoneme with ID ${id} not found`);
        }
        return successResponse(phoneme);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to update phoneme'
        );
    }
}

/**
 * Delete a phoneme.
 */
function deletePhoneme(id: number): ApiResponse<void> {
    const dbError = checkDbInitialized<void>();
    if (dbError) return dbError;

    try {
        const success = serviceDeletePhoneme(id);
        if (!success) {
            return errorResponse('NOT_FOUND', `Phoneme with ID ${id} not found`);
        }
        return successResponse(undefined);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to delete phoneme'
        );
    }
}

/**
 * Delete all phonemes for a grapheme.
 */
function deleteAllPhonemesForGrapheme(graphemeId: number): ApiResponse<number> {
    const dbError = checkDbInitialized<number>();
    if (dbError) return dbError;

    try {
        const count = serviceDeleteAllPhonemesForGrapheme(graphemeId);
        return successResponse(count);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to delete phonemes'
        );
    }
}

/**
 * Get all phonemes marked for auto-spelling.
 */
function getAutoSpellingPhonemes(): ApiResponse<Phoneme[]> {
    const dbError = checkDbInitialized<Phoneme[]>();
    if (dbError) return dbError;

    try {
        const phonemes = serviceGetAutoSpellingPhonemes();
        return successResponse(phonemes);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to get auto-spelling phonemes'
        );
    }
}

/**
 * Phoneme API implementation.
 */
export const phonemeApi: PhonemeApi = {
    add: addPhoneme,
    getById: getPhonemeById,
    getByGraphemeId: getPhonemesByGraphemeId,
    update: updatePhoneme,
    delete: deletePhoneme,
    deleteAllForGrapheme: deleteAllPhonemesForGrapheme,
    getAutoSpelling: getAutoSpellingPhonemes,
};
