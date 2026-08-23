/**
 * Grapheme API
 *
 * Standardized API layer for grapheme and phoneme operations.
 * Wraps the internal grapheme service with consistent ApiResponse format.
 *
 * THIS LAYER KEEPS AUTO-SPELLED WORDS CURRENT. A word with `auto_spell` on
 * has a derived spelling, and the thing it derives from — the phoneme table —
 * changes only through the writes in this file: creating a grapheme with
 * phonemes, adding / editing / removing phonemes, deleting a grapheme. Each of
 * those finishes by handing the phoneme strings it touched to
 * `respellAutoSpelledWords`, which regenerates just the words whose
 * pronunciation mentions one of them (see `respellService`). The service
 * functions underneath stay single-purpose; the cross-entity consequence lives
 * here, next to the other one this layer already owns (`autoManageGlyphs`).
 */

import type {
    ApiResponse,
    ApiErrorCode,
    CreateGraphemeRequest,
    CreateGraphemeResult,
    UpdateGraphemeRequest,
    UpdateGraphemeGlyphsRequest,
    GraphemeListResponse,
    GraphemeCompleteListResponse,
    AddPhonemeRequest,
    UpdatePhonemeRequest,
    ReplacePhonemesRequest,
    ReplacePhonemesResult,
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
    setGraphemePhonemes as serviceSetGraphemePhonemes,
    getAutoSpellingPhonemes as serviceGetAutoSpellingPhonemes,
    getGraphemeByPhoneme as serviceGetGraphemeByPhoneme,
    getAllPhonemeGraphemeMappings as serviceGetAllPhonemeGraphemeMappings,
    getGraphemeLexiconUsageCount,
} from '../graphemeService';
import { getLexiconEntriesUsingGrapheme, handleGraphemeDeletion } from '../lexiconService';
import { cleanupOrphanedGlyphs } from '../glyphService';
import { phonemePatterns, respellAutoSpelledWords, type RespellReport } from '../respellService';
import { isDatabaseInitialized, getDatabase } from '../database';
import { withTransaction } from '../utils/transaction';
import { getCurrentSettings } from './settingsApi';
import { serviceLog } from '../utils/logger';

/**
 * Respell after a phoneme change and log what happened. `patterns` are the
 * phoneme strings the change touched — old AND new for an edit.
 */
function respellAfterPhonemeChange(patterns: string[], cause: string): RespellReport {
    const report = respellAutoSpelledWords(patterns);
    if (report.respelled > 0) {
        serviceLog.info(`${cause}: respelled ${report.respelled} of ${report.scanned} auto-spelled word(s)`);
    }
    return report;
}

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
 * Create a new grapheme. Words already using one of its auto-spelling
 * phonemes (as a placeholder, or spelled with another grapheme the DP now
 * prefers differently) are respelled in the same transaction.
 */
function createGrapheme(request: CreateGraphemeRequest): ApiResponse<CreateGraphemeResult> {
    const dbError = checkDbInitialized<CreateGraphemeResult>();
    if (dbError) return dbError;

    // Validation
    if (!request.name || request.name.trim() === '') {
        return errorResponse('VALIDATION_ERROR', 'Grapheme name is required');
    }
    if (!request.glyphs || request.glyphs.length === 0) {
        return errorResponse('VALIDATION_ERROR', 'At least one glyph is required');
    }

    try {
        const result = withTransaction(getDatabase(), () => {
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
            // Only the auto-spelling phonemes can change a spelling.
            const patterns = phonemePatterns(grapheme.phonemes.filter(p => p.use_in_auto_spelling));
            const respell = respellAfterPhonemeChange(patterns, `Created grapheme "${grapheme.name}"`);
            return { ...grapheme, lexiconRespelled: respell.respelled };
        });
        return successResponse(result);
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
 * rewritten and the grapheme removed, all in one transaction:
 *
 *  1. every occurrence of the grapheme becomes its primary phoneme as a
 *     placeholder, and manually spelled words are flagged for review
 *     (`handleGraphemeDeletion`);
 *  2. the grapheme and its phonemes are deleted;
 *  3. auto-spelled words whose pronunciation mentions one of those phonemes
 *     are regenerated against the graphemes that REMAIN — so a sound another
 *     grapheme also covers is spelled with that grapheme, not left as the
 *     placeholder. (Step 1's placeholder is what an auto-spelled word with
 *     no pronunciation keeps; it has nothing to regenerate from.)
 *
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
            const respelledIds = new Set<number>();
            let lexiconMarked = 0;
            if (lexiconCount > 0) {
                const primaryPhoneme = grapheme.phonemes.find(p => p.use_in_auto_spelling)?.phoneme
                    ?? grapheme.phonemes[0]?.phoneme;
                const report = handleGraphemeDeletion(id, primaryPhoneme);
                for (const lexiconId of report.respelledLexiconIds) respelledIds.add(lexiconId);
                lexiconMarked = report.markedForAttentionCount;
            }
            serviceDeleteGrapheme(id);
            // AFTER the delete, so the speller sees the phoneme table without
            // this grapheme. Every phoneme, not only the auto-spelling ones: a
            // word may have been spelled with this grapheme by hand while
            // auto-spell was on, and its pronunciation still names the sound.
            const regenerated = respellAfterPhonemeChange(
                phonemePatterns(grapheme.phonemes),
                `Deleted grapheme "${grapheme.name}"`,
            );
            for (const lexiconId of regenerated.respelledLexiconIds) respelledIds.add(lexiconId);
            const lexiconRespelled = respelledIds.size;
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

        const phoneme = withTransaction(getDatabase(), () => {
            const added = serviceAddPhoneme(request.grapheme_id, {
                phoneme: request.phoneme.trim(),
                use_in_auto_spelling: request.use_in_auto_spelling,
                context: request.context?.trim(),
            });
            if (added.use_in_auto_spelling) {
                respellAfterPhonemeChange([added.phoneme], `Added phoneme "${added.phoneme}"`);
            }
            return added;
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
        const before = serviceGetPhonemeById(id);
        if (!before) {
            return errorResponse('NOT_FOUND', `Phoneme with ID ${id} not found`);
        }
        const phoneme = withTransaction(getDatabase(), () => {
            const after = serviceUpdatePhoneme(id, {
                phoneme: request.phoneme?.trim(),
                use_in_auto_spelling: request.use_in_auto_spelling,
                context: request.context,
            });
            if (!after) return null;
            // Only the text and the auto-spelling flag reach the speller; a
            // `context` note does not. Both the old and the new text are
            // patterns: words that were spelled with the old value need
            // regenerating as much as words that will match the new one.
            const affectsSpelling =
                after.phoneme !== before.phoneme
                || after.use_in_auto_spelling !== before.use_in_auto_spelling;
            if (affectsSpelling) {
                respellAfterPhonemeChange(
                    [before.phoneme, after.phoneme],
                    `Updated phoneme "${before.phoneme}" → "${after.phoneme}"`,
                );
            }
            return after;
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
        const existing = serviceGetPhonemeById(id);
        if (!existing) {
            return errorResponse('NOT_FOUND', `Phoneme with ID ${id} not found`);
        }
        withTransaction(getDatabase(), () => {
            serviceDeletePhoneme(id);
            if (existing.use_in_auto_spelling) {
                respellAfterPhonemeChange([existing.phoneme], `Deleted phoneme "${existing.phoneme}"`);
            }
        });
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
        const count = withTransaction(getDatabase(), () => {
            const existing = serviceGetPhonemesByGraphemeId(graphemeId);
            const deleted = serviceDeleteAllPhonemesForGrapheme(graphemeId);
            respellAfterPhonemeChange(
                phonemePatterns(existing.filter(p => p.use_in_auto_spelling)),
                `Cleared phonemes of grapheme ${graphemeId}`,
            );
            return deleted;
        });
        return successResponse(count);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to delete phonemes'
        );
    }
}

/**
 * Replace every phoneme of a grapheme at once.
 *
 * One transaction and ONE respell pass over the union of the old and new
 * phoneme strings — where a delete-all followed by one add per row would
 * respell after each step and briefly leave every affected word spelled
 * against an empty list.
 */
function replaceAllPhonemes(request: ReplacePhonemesRequest): ApiResponse<ReplacePhonemesResult> {
    const dbError = checkDbInitialized<ReplacePhonemesResult>();
    if (dbError) return dbError;

    const rows = request.phonemes
        .map(p => ({
            phoneme: p.phoneme.trim(),
            use_in_auto_spelling: p.use_in_auto_spelling,
            context: p.context?.trim(),
        }))
        .filter(p => p.phoneme.length > 0);

    try {
        const grapheme = serviceGetGraphemeById(request.grapheme_id);
        if (!grapheme) {
            return errorResponse('NOT_FOUND', `Grapheme with ID ${request.grapheme_id} not found`);
        }

        const result = withTransaction(getDatabase(), () => {
            const before = serviceGetPhonemesByGraphemeId(request.grapheme_id);
            const phonemes = serviceSetGraphemePhonemes(request.grapheme_id, rows);
            const patterns = phonemePatterns([
                ...before.filter(p => p.use_in_auto_spelling),
                ...phonemes.filter(p => p.use_in_auto_spelling),
            ]);
            const respell = respellAfterPhonemeChange(patterns, `Replaced phonemes of "${grapheme.name}"`);
            return { phonemes, lexiconRespelled: respell.respelled };
        });
        return successResponse(result);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to replace phonemes'
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
    replaceAll: replaceAllPhonemes,
    getAutoSpelling: getAutoSpellingPhonemes,
};
