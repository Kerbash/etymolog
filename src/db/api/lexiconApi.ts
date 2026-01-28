/**
 * Lexicon API
 *
 * Standardized API layer for lexicon operations.
 * Wraps the internal lexicon service with consistent ApiResponse format.
 */

import type {
    ApiResponse,
    ApiErrorCode,
} from './types';
import type {
    Lexicon,
    LexiconComplete,
    LexiconWithSpelling,
    LexiconWithUsage,
    LexiconAncestryNode,
    CreateLexiconInput,
    UpdateLexiconInput,
    CreateLexiconSpellingInput,
    CreateLexiconAncestryInput,
} from '../types';
import {
    createLexicon as serviceCreateLexicon,
    getLexiconById as serviceGetLexiconById,
    getLexiconComplete as serviceGetLexiconComplete,
    getLexiconWithSpelling as serviceGetLexiconWithSpelling,
    getAllLexicon,
    getAllLexiconComplete,
    getAllLexiconWithUsage,
    searchLexicon as serviceSearchLexicon,
    getLexiconByNative,
    updateLexicon as serviceUpdateLexicon,
    deleteLexicon as serviceDeleteLexicon,
    setLexiconSpelling as serviceSetLexiconSpelling,
    setLexiconAncestry as serviceSetLexiconAncestry,
    getFullAncestryTree as serviceGetFullAncestryTree,
    getAllAncestorIds as serviceGetAllAncestorIds,
    getAllDescendantIds as serviceGetAllDescendantIds,
    wouldCreateCycle as serviceWouldCreateCycle,
} from '../lexiconService';
import {
    generateSpellingFromPronunciation,
    generateSpellingWithFallback,
    previewAutoSpellingWithFallback,
    type AutoSpellResult,
} from '../autoSpellService';
import type { AutoSpellResultExtended } from '../types';
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
// LEXICON API IMPLEMENTATION
// =============================================================================

/**
 * Create a new lexicon entry.
 */
function createLexicon(request: CreateLexiconInput): ApiResponse<LexiconComplete> {
    const dbError = checkDbInitialized<LexiconComplete>();
    if (dbError) return dbError;

    // Validation
    if (!request.lemma || request.lemma.trim() === '') {
        return errorResponse('VALIDATION_ERROR', 'Lemma is required');
    }

    try {
        const lexicon = serviceCreateLexicon({
            ...request,
            lemma: request.lemma.trim(),
            pronunciation: request.pronunciation?.trim(),
            meaning: request.meaning?.trim(),
            part_of_speech: request.part_of_speech?.trim(),
            notes: request.notes?.trim(),
        });

        return successResponse(lexicon);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create lexicon entry';
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Get a lexicon entry by ID.
 */
function getLexiconById(id: number): ApiResponse<Lexicon> {
    const dbError = checkDbInitialized<Lexicon>();
    if (dbError) return dbError;

    try {
        const lexicon = serviceGetLexiconById(id);
        if (!lexicon) {
            return errorResponse('NOT_FOUND', `Lexicon entry with id ${id} not found`);
        }
        return successResponse(lexicon);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get lexicon entry';
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Get a lexicon entry by ID with full data.
 */
function getLexiconByIdComplete(id: number): ApiResponse<LexiconComplete> {
    const dbError = checkDbInitialized<LexiconComplete>();
    if (dbError) return dbError;

    try {
        const lexicon = serviceGetLexiconComplete(id);
        if (!lexicon) {
            return errorResponse('NOT_FOUND', `Lexicon entry with id ${id} not found`);
        }
        return successResponse(lexicon);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get lexicon entry';
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Response for lexicon list operations.
 */
export interface LexiconListResponse {
    entries: Lexicon[];
    total: number;
}

/**
 * Response for complete lexicon list operations.
 */
export interface LexiconCompleteListResponse {
    entries: LexiconComplete[];
    total: number;
}

/**
 * Response for lexicon with usage list operations.
 */
export interface LexiconWithUsageListResponse {
    entries: LexiconWithUsage[];
    total: number;
}

/**
 * Get all lexicon entries.
 */
function getAll(): ApiResponse<LexiconListResponse> {
    const dbError = checkDbInitialized<LexiconListResponse>();
    if (dbError) return dbError;

    try {
        const entries = getAllLexicon();
        return successResponse({
            entries,
            total: entries.length,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get lexicon entries';
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Get all lexicon entries with full data.
 */
function getAllComplete(): ApiResponse<LexiconCompleteListResponse> {
    const dbError = checkDbInitialized<LexiconCompleteListResponse>();
    if (dbError) return dbError;

    try {
        const entries = getAllLexiconComplete();
        return successResponse({
            entries,
            total: entries.length,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get lexicon entries';
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Get all lexicon entries with usage count.
 */
function getAllWithUsage(): ApiResponse<LexiconWithUsageListResponse> {
    const dbError = checkDbInitialized<LexiconWithUsageListResponse>();
    if (dbError) return dbError;

    try {
        const entries = getAllLexiconWithUsage();
        return successResponse({
            entries,
            total: entries.length,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get lexicon entries';
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Search lexicon entries.
 */
function search(query: string): ApiResponse<LexiconListResponse> {
    const dbError = checkDbInitialized<LexiconListResponse>();
    if (dbError) return dbError;

    try {
        const entries = serviceSearchLexicon(query);
        return successResponse({
            entries,
            total: entries.length,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to search lexicon entries';
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Get lexicon entries by native flag.
 */
function getByNative(isNative: boolean): ApiResponse<LexiconListResponse> {
    const dbError = checkDbInitialized<LexiconListResponse>();
    if (dbError) return dbError;

    try {
        const entries = getLexiconByNative(isNative);
        return successResponse({
            entries,
            total: entries.length,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get lexicon entries';
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Update a lexicon entry.
 */
function updateLexicon(id: number, request: UpdateLexiconInput): ApiResponse<Lexicon> {
    const dbError = checkDbInitialized<Lexicon>();
    if (dbError) return dbError;

    try {
        const lexicon = serviceUpdateLexicon(id, {
            ...request,
            lemma: request.lemma?.trim(),
            pronunciation: request.pronunciation?.trim(),
            meaning: request.meaning?.trim(),
            part_of_speech: request.part_of_speech?.trim(),
            notes: request.notes?.trim(),
        });

        if (!lexicon) {
            return errorResponse('NOT_FOUND', `Lexicon entry with id ${id} not found`);
        }
        return successResponse(lexicon);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update lexicon entry';
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Delete a lexicon entry.
 */
function deleteLexicon(id: number): ApiResponse<void> {
    const dbError = checkDbInitialized<void>();
    if (dbError) return dbError;

    try {
        const success = serviceDeleteLexicon(id);
        if (!success) {
            return errorResponse('NOT_FOUND', `Lexicon entry with id ${id} not found`);
        }
        return successResponse(undefined);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete lexicon entry';
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Update spelling request.
 */
export interface UpdateSpellingRequest {
    spelling: CreateLexiconSpellingInput[];
}

/**
 * Update a lexicon entry's spelling.
 */
function updateSpelling(id: number, request: UpdateSpellingRequest): ApiResponse<void> {
    const dbError = checkDbInitialized<void>();
    if (dbError) return dbError;

    try {
        // Verify lexicon exists
        const lexicon = serviceGetLexiconById(id);
        if (!lexicon) {
            return errorResponse('NOT_FOUND', `Lexicon entry with id ${id} not found`);
        }

        serviceSetLexiconSpelling(id, request.spelling);
        return successResponse(undefined);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update spelling';
        if (message.includes('FOREIGN KEY constraint failed')) {
            return errorResponse('CONSTRAINT_VIOLATION', 'One or more grapheme IDs do not exist');
        }
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Update ancestry request.
 */
export interface UpdateAncestryRequest {
    ancestry: CreateLexiconAncestryInput[];
}

/**
 * Update a lexicon entry's ancestry.
 */
function updateAncestry(id: number, request: UpdateAncestryRequest): ApiResponse<void> {
    const dbError = checkDbInitialized<void>();
    if (dbError) return dbError;

    try {
        // Verify lexicon exists
        const lexicon = serviceGetLexiconById(id);
        if (!lexicon) {
            return errorResponse('NOT_FOUND', `Lexicon entry with id ${id} not found`);
        }

        // Check for cycles
        for (const ancestor of request.ancestry) {
            if (serviceWouldCreateCycle(id, ancestor.ancestor_id)) {
                return errorResponse(
                    'CONSTRAINT_VIOLATION',
                    `Adding ancestor ${ancestor.ancestor_id} would create a cycle in the etymology tree`
                );
            }
        }

        serviceSetLexiconAncestry(id, request.ancestry);
        return successResponse(undefined);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update ancestry';
        if (message.includes('FOREIGN KEY constraint failed')) {
            return errorResponse('CONSTRAINT_VIOLATION', 'One or more ancestor IDs do not exist');
        }
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Get the full ancestry tree for a lexicon entry.
 */
function getAncestryTree(id: number, maxDepth?: number): ApiResponse<LexiconAncestryNode> {
    const dbError = checkDbInitialized<LexiconAncestryNode>();
    if (dbError) return dbError;

    try {
        const tree = serviceGetFullAncestryTree(id, maxDepth);
        return successResponse(tree);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get ancestry tree';
        if (message.includes('not found')) {
            return errorResponse('NOT_FOUND', message);
        }
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Get all ancestor IDs (flattened).
 */
function getAllAncestorIds(id: number): ApiResponse<number[]> {
    const dbError = checkDbInitialized<number[]>();
    if (dbError) return dbError;

    try {
        const ids = serviceGetAllAncestorIds(id);
        return successResponse(ids);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get ancestor IDs';
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Get all descendant IDs (flattened).
 */
function getAllDescendantIds(id: number): ApiResponse<number[]> {
    const dbError = checkDbInitialized<number[]>();
    if (dbError) return dbError;

    try {
        const ids = serviceGetAllDescendantIds(id);
        return successResponse(ids);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get descendant IDs';
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Check if adding an ancestor would create a cycle.
 */
function wouldCreateCycle(lexiconId: number, ancestorId: number): ApiResponse<boolean> {
    const dbError = checkDbInitialized<boolean>();
    if (dbError) return dbError;

    try {
        const result = serviceWouldCreateCycle(lexiconId, ancestorId);
        return successResponse(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to check for cycle';
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Generate auto-spelling from pronunciation.
 */
function generateAutoSpelling(pronunciation: string): ApiResponse<AutoSpellResult> {
    const dbError = checkDbInitialized<AutoSpellResult>();
    if (dbError) return dbError;

    try {
        const result = generateSpellingFromPronunciation(pronunciation);
        return successResponse(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate auto-spelling';
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Preview auto-spelling without saving.
 * Uses fallback mode to create virtual IPA glyphs for any unmatched characters,
 * ensuring every pronunciation can be spelled.
 */
function previewAutoSpelling(pronunciation: string): ApiResponse<AutoSpellResultExtended> {
    const dbError = checkDbInitialized<AutoSpellResultExtended>();
    if (dbError) return dbError;

    try {
        const result = previewAutoSpellingWithFallback(pronunciation);
        return successResponse(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to preview auto-spelling';
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Apply auto-spelling to a lexicon entry.
 * Generates spelling from the entry's pronunciation and saves it.
 */
function applyAutoSpelling(id: number): ApiResponse<LexiconWithSpelling> {
    const dbError = checkDbInitialized<LexiconWithSpelling>();
    if (dbError) return dbError;

    try {
        const lexicon = serviceGetLexiconById(id);
        if (!lexicon) {
            return errorResponse('NOT_FOUND', `Lexicon entry with id ${id} not found`);
        }

        if (!lexicon.pronunciation) {
            return errorResponse('VALIDATION_ERROR', 'Lexicon entry has no pronunciation to generate spelling from');
        }

        const result = generateSpellingFromPronunciation(lexicon.pronunciation);
        if (!result.success) {
            return errorResponse('OPERATION_FAILED', result.error ?? 'Failed to generate spelling');
        }

        serviceSetLexiconSpelling(id, result.spelling);

        const updated = serviceGetLexiconWithSpelling(id);
        if (!updated) {
            return errorResponse('OPERATION_FAILED', 'Failed to get updated lexicon entry');
        }

        return successResponse(updated);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to apply auto-spelling';
        return errorResponse('OPERATION_FAILED', message);
    }
}

// =============================================================================
// LEXICON API INTERFACE
// =============================================================================

/**
 * Lexicon API interface.
 */
export interface LexiconApi {
    create(request: CreateLexiconInput): ApiResponse<LexiconComplete>;
    getById(id: number): ApiResponse<Lexicon>;
    getByIdComplete(id: number): ApiResponse<LexiconComplete>;
    getAll(): ApiResponse<LexiconListResponse>;
    getAllComplete(): ApiResponse<LexiconCompleteListResponse>;
    getAllWithUsage(): ApiResponse<LexiconWithUsageListResponse>;
    search(query: string): ApiResponse<LexiconListResponse>;
    getByNative(isNative: boolean): ApiResponse<LexiconListResponse>;
    update(id: number, request: UpdateLexiconInput): ApiResponse<Lexicon>;
    delete(id: number): ApiResponse<void>;
    updateSpelling(id: number, request: UpdateSpellingRequest): ApiResponse<void>;
    updateAncestry(id: number, request: UpdateAncestryRequest): ApiResponse<void>;
    getAncestryTree(id: number, maxDepth?: number): ApiResponse<LexiconAncestryNode>;
    getAllAncestorIds(id: number): ApiResponse<number[]>;
    getAllDescendantIds(id: number): ApiResponse<number[]>;
    wouldCreateCycle(lexiconId: number, ancestorId: number): ApiResponse<boolean>;
    generateAutoSpelling(pronunciation: string): ApiResponse<AutoSpellResult>;
    /** Preview auto-spelling with virtual IPA glyph fallback for unmatched characters */
    previewAutoSpelling(pronunciation: string): ApiResponse<AutoSpellResultExtended>;
    applyAutoSpelling(id: number): ApiResponse<LexiconWithSpelling>;
}

/**
 * Lexicon API implementation.
 */
export const lexiconApi: LexiconApi = {
    create: createLexicon,
    getById: getLexiconById,
    getByIdComplete: getLexiconByIdComplete,
    getAll,
    getAllComplete,
    getAllWithUsage,
    search,
    getByNative,
    update: updateLexicon,
    delete: deleteLexicon,
    updateSpelling,
    updateAncestry,
    getAncestryTree,
    getAllAncestorIds,
    getAllDescendantIds,
    wouldCreateCycle,
    generateAutoSpelling,
    previewAutoSpelling,
    applyAutoSpelling,
};
