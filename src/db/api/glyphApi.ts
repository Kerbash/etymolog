/**
 * Glyph API
 *
 * Standardized API layer for glyph operations.
 * Wraps the internal glyph service with consistent ApiResponse format.
 */

import type {
    ApiResponse,
    ApiErrorCode,
    CreateGlyphRequest,
    UpdateGlyphRequest,
    GlyphListResponse,
    GlyphWithUsageListResponse,
    GlyphApi,
} from './types';
import type { Glyph } from '../types';
import {
    createGlyph as serviceCreateGlyph,
    getGlyphById as serviceGetGlyphById,
    getAllGlyphs,
    getAllGlyphsWithUsage,
    searchGlyphsByName,
    updateGlyph as serviceUpdateGlyph,
    deleteGlyph as serviceDeleteGlyph,
    forceDeleteGlyph as serviceForceDeleteGlyph,
    cascadeDeleteGlyph as serviceCascadeDeleteGlyph,
    glyphNameExists as serviceGlyphNameExists,
} from '../glyphService';
import { isDatabaseInitialized } from '../database';

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

/**
 * Create a new glyph.
 */
function create(request: CreateGlyphRequest): ApiResponse<Glyph> {
    const dbError = checkDbInitialized<Glyph>();
    if (dbError) return dbError;

    // Validation
    if (!request.name || request.name.trim() === '') {
        return errorResponse('VALIDATION_ERROR', 'Glyph name is required');
    }
    if (!request.svg_data || request.svg_data.trim() === '') {
        return errorResponse('VALIDATION_ERROR', 'SVG data is required');
    }

    try {
        const glyph = serviceCreateGlyph({
            name: request.name.trim(),
            svg_data: request.svg_data,
            category: request.category?.trim(),
            notes: request.notes?.trim(),
        });
        return successResponse(glyph);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to create glyph'
        );
    }
}

/**
 * Get a glyph by ID.
 */
function getById(id: number): ApiResponse<Glyph> {
    const dbError = checkDbInitialized<Glyph>();
    if (dbError) return dbError;

    try {
        const glyph = serviceGetGlyphById(id);
        if (!glyph) {
            return errorResponse('NOT_FOUND', `Glyph with ID ${id} not found`);
        }
        return successResponse(glyph);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to get glyph'
        );
    }
}

/**
 * Get all glyphs.
 */
function getAll(): ApiResponse<GlyphListResponse> {
    const dbError = checkDbInitialized<GlyphListResponse>();
    if (dbError) return dbError;

    try {
        const glyphs = getAllGlyphs();
        return successResponse({
            glyphs,
            total: glyphs.length,
        });
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to get glyphs'
        );
    }
}

/**
 * Get all glyphs with usage count.
 */
function getAllWithUsage(): ApiResponse<GlyphWithUsageListResponse> {
    const dbError = checkDbInitialized<GlyphWithUsageListResponse>();
    if (dbError) return dbError;

    try {
        const glyphs = getAllGlyphsWithUsage();
        return successResponse({
            glyphs,
            total: glyphs.length,
        });
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to get glyphs with usage'
        );
    }
}

/**
 * Search glyphs by name.
 */
function search(query: string): ApiResponse<GlyphListResponse> {
    const dbError = checkDbInitialized<GlyphListResponse>();
    if (dbError) return dbError;

    try {
        const glyphs = searchGlyphsByName(query);
        return successResponse({
            glyphs,
            total: glyphs.length,
        });
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to search glyphs'
        );
    }
}

/**
 * Update a glyph.
 */
function update(id: number, request: UpdateGlyphRequest): ApiResponse<Glyph> {
    const dbError = checkDbInitialized<Glyph>();
    if (dbError) return dbError;

    try {
        const glyph = serviceUpdateGlyph(id, {
            name: request.name?.trim(),
            svg_data: request.svg_data,
            notes: request.notes,
        });
        if (!glyph) {
            return errorResponse('NOT_FOUND', `Glyph with ID ${id} not found`);
        }
        return successResponse(glyph);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to update glyph'
        );
    }
}

/**
 * Delete a glyph (fails if in use).
 */
function deleteGlyph(id: number): ApiResponse<void> {
    const dbError = checkDbInitialized<void>();
    if (dbError) return dbError;

    try {
        const success = serviceDeleteGlyph(id);
        if (!success) {
            return errorResponse('NOT_FOUND', `Glyph with ID ${id} not found`);
        }
        return successResponse(undefined);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete glyph';
        // Check if it's a constraint violation (glyph in use)
        if (message.includes('used by')) {
            return errorResponse('CONSTRAINT_VIOLATION', message);
        }
        return errorResponse('OPERATION_FAILED', message);
    }
}

/**
 * Force delete a glyph (removes from graphemes but keeps graphemes).
 */
function forceDelete(id: number): ApiResponse<void> {
    const dbError = checkDbInitialized<void>();
    if (dbError) return dbError;

    try {
        const success = serviceForceDeleteGlyph(id);
        if (!success) {
            return errorResponse('NOT_FOUND', `Glyph with ID ${id} not found`);
        }
        return successResponse(undefined);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to force delete glyph'
        );
    }
}

/**
 * Cascade delete a glyph (deletes all graphemes that use it).
 */
function cascadeDelete(id: number): ApiResponse<void> {
    const dbError = checkDbInitialized<void>();
    if (dbError) return dbError;

    try {
        const success = serviceCascadeDeleteGlyph(id);
        if (!success) {
            return errorResponse('NOT_FOUND', `Glyph with ID ${id} not found`);
        }
        return successResponse(undefined);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to cascade delete glyph'
        );
    }
}

/**
 * Check if a glyph name already exists.
 */
function checkNameExists(name: string, excludeId?: number): ApiResponse<boolean> {
    const dbError = checkDbInitialized<boolean>();
    if (dbError) return dbError;

    try {
        const exists = serviceGlyphNameExists(name, excludeId);
        return successResponse(exists);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to check glyph name'
        );
    }
}

/**
 * Glyph API implementation.
 */
export const glyphApi: GlyphApi = {
    create,
    getById,
    getAll,
    getAllWithUsage,
    search,
    update,
    delete: deleteGlyph,
    forceDelete,
    cascadeDelete,
    checkNameExists,
};
