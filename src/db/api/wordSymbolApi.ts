/**
 * Word Symbol API
 *
 * Standardized API layer for whole-word symbol operations (Phase 3, UC-B1).
 * Wraps `wordSymbolService` with the consistent ApiResponse envelope.
 *
 * NOTE: the primary way a symbol is CREATED is the composite `lexicon.create`
 * with a `symbol` field (so word + symbol commit atomically). This namespace is
 * used directly for editing a symbol's drawing, and for the create-a-symbol-on-
 * edit case (switching an existing word into Symbol mode), where the word row
 * already exists.
 */

import type {
    ApiResponse,
    ApiErrorCode,
    CreateWordSymbolRequest,
    UpdateWordSymbolDrawingRequest,
    WordSymbolApi,
    WordSymbolRefs,
} from './types';
import {
    createWordSymbol as serviceCreateWordSymbol,
    updateWordSymbolDrawing as serviceUpdateWordSymbolDrawing,
} from '../wordSymbolService';
import { isDatabaseInitialized } from '../database';

function errorResponse<T>(
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>,
): ApiResponse<T> {
    return { success: false, error: { code, message, details } };
}

function successResponse<T>(data: T): ApiResponse<T> {
    return { success: true, data };
}

function checkDbInitialized<T>(): ApiResponse<T> | null {
    if (!isDatabaseInitialized()) {
        return errorResponse('DB_NOT_INITIALIZED', 'Database not initialized. Call initDatabase() first.');
    }
    return null;
}

function create(request: CreateWordSymbolRequest): ApiResponse<WordSymbolRefs> {
    const dbError = checkDbInitialized<WordSymbolRefs>();
    if (dbError) return dbError;

    if (!request.name || request.name.trim() === '') {
        return errorResponse('VALIDATION_ERROR', 'A word symbol needs a name');
    }
    if (!request.svgData || request.svgData.trim() === '') {
        return errorResponse('VALIDATION_ERROR', 'A word symbol needs a drawing or an image');
    }

    try {
        const refs = serviceCreateWordSymbol({ name: request.name.trim(), svgData: request.svgData });
        return successResponse(refs);
    } catch (error) {
        return errorResponse(
            'OPERATION_FAILED',
            error instanceof Error ? error.message : 'Failed to create word symbol',
        );
    }
}

function updateDrawing(request: UpdateWordSymbolDrawingRequest): ApiResponse<WordSymbolRefs> {
    const dbError = checkDbInitialized<WordSymbolRefs>();
    if (dbError) return dbError;

    if (!request.svgData || request.svgData.trim() === '') {
        return errorResponse('VALIDATION_ERROR', 'A word symbol needs a drawing or an image');
    }

    try {
        const refs = serviceUpdateWordSymbolDrawing(request.graphemeId, request.svgData);
        return successResponse(refs);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update word symbol';
        if (message.includes('not found') || message.includes('no glyph')) {
            return errorResponse('NOT_FOUND', message);
        }
        return errorResponse('OPERATION_FAILED', message);
    }
}

export const wordSymbolApi: WordSymbolApi = {
    create,
    updateDrawing,
};
