/**
 * Variant API — grapheme variants and variant groups (schema v9)
 *
 * Standardized ApiResponse layer over `variantService`. Two namespaces:
 *
 *   - `variantGroup.*` — script-level named buckets ("head", "geometric", …).
 *     Deleting a group keeps its variants (ungrouped).
 *   - `variant.*`      — a grapheme's visual forms. The default form is what
 *     every renderer shows; the others are picked by block-template slots or
 *     pinned in a spelling (`grapheme-<id>@<variantId>`).
 *
 * Glyph edits here honour `autoManageGlyphs` exactly like
 * `grapheme.updateGlyphs`: a glyph no variant uses any more is cleaned up.
 * No phoneme ever changes here, so no respell is needed — a variant only
 * changes how a sign looks, never what it sounds like.
 */

import type {
    ApiResponse,
    ApiErrorCode,
    CreateVariantGroupRequest,
    UpdateVariantGroupRequest,
    VariantGroupListResponse,
    DeleteVariantGroupResult,
    CreateVariantRequest,
    UpdateVariantRequest,
    VariantGlyphsRequest,
    DeleteVariantResult,
    VariantGroupApi,
    VariantApi,
} from './types';
import type { GraphemeVariant, GraphemeVariantWithGlyphs, VariantGroup } from '../types';
import {
    createVariantGroup as serviceCreateVariantGroup,
    updateVariantGroup as serviceUpdateVariantGroup,
    deleteVariantGroup as serviceDeleteVariantGroup,
    getAllVariantGroups as serviceGetAllVariantGroups,
    getVariantGroupUsageCount as serviceGetVariantGroupUsageCount,
    getVariantById as serviceGetVariantById,
    getVariantsByGraphemeId as serviceGetVariantsByGraphemeId,
    createVariant as serviceCreateVariant,
    updateVariant as serviceUpdateVariant,
    setVariantGlyphs as serviceSetVariantGlyphs,
    setDefaultVariant as serviceSetDefaultVariant,
    deleteVariant as serviceDeleteVariant,
    getVariantPinUsageCount as serviceGetVariantPinUsageCount,
} from '../variantService';
import { getGraphemeById } from '../graphemeService';
import { cleanupOrphanedGlyphs } from '../glyphService';
import { isDatabaseInitialized } from '../database';
import { getCurrentSettings } from './settingsApi';
import { serviceLog } from '../utils/logger';

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

function failure<T>(error: unknown, fallback: string): ApiResponse<T> {
    return errorResponse('OPERATION_FAILED', error instanceof Error ? error.message : fallback);
}

/** Same auto-manage rule as `grapheme.updateGlyphs`. */
function cleanupGlyphsIfAutoManaged(cause: string): void {
    if (!getCurrentSettings().autoManageGlyphs) return;
    const deletedCount = cleanupOrphanedGlyphs();
    if (deletedCount > 0) {
        serviceLog.info(`Auto-manage (${cause}): cleaned up ${deletedCount} orphaned glyph(s)`);
    }
}

function mapGlyphs(glyphs: VariantGlyphsRequest) {
    return glyphs.map(g => ({ glyph_id: g.glyph_id, position: g.position, transform: g.transform }));
}

// =============================================================================
// VARIANT GROUPS
// =============================================================================

function createGroup(request: CreateVariantGroupRequest): ApiResponse<VariantGroup> {
    const dbError = checkDbInitialized<VariantGroup>();
    if (dbError) return dbError;
    if (!request.name || request.name.trim() === '') {
        return errorResponse('VALIDATION_ERROR', 'Variant group name is required');
    }
    try {
        return successResponse(serviceCreateVariantGroup({ name: request.name, sort_order: request.sort_order }));
    } catch (error) {
        return failure(error, 'Failed to create variant group');
    }
}

function updateGroup(id: number, request: UpdateVariantGroupRequest): ApiResponse<VariantGroup> {
    const dbError = checkDbInitialized<VariantGroup>();
    if (dbError) return dbError;
    if (request.name !== undefined && request.name.trim() === '') {
        return errorResponse('VALIDATION_ERROR', 'Variant group name is required');
    }
    try {
        const group = serviceUpdateVariantGroup(id, request);
        if (!group) {
            return errorResponse('NOT_FOUND', `Variant group with ID ${id} not found`);
        }
        return successResponse(group);
    } catch (error) {
        return failure(error, 'Failed to update variant group');
    }
}

function deleteGroup(id: number): ApiResponse<DeleteVariantGroupResult> {
    const dbError = checkDbInitialized<DeleteVariantGroupResult>();
    if (dbError) return dbError;
    try {
        const result = serviceDeleteVariantGroup(id);
        if (!result.deleted) {
            return errorResponse('NOT_FOUND', `Variant group with ID ${id} not found`);
        }
        return successResponse({ variantsDetached: result.variantsDetached });
    } catch (error) {
        return failure(error, 'Failed to delete variant group');
    }
}

function getAllGroups(): ApiResponse<VariantGroupListResponse> {
    const dbError = checkDbInitialized<VariantGroupListResponse>();
    if (dbError) return dbError;
    try {
        const groups = serviceGetAllVariantGroups();
        return successResponse({ groups, total: groups.length });
    } catch (error) {
        return failure(error, 'Failed to get variant groups');
    }
}

function getGroupUsageCount(id: number): ApiResponse<number> {
    const dbError = checkDbInitialized<number>();
    if (dbError) return dbError;
    try {
        return successResponse(serviceGetVariantGroupUsageCount(id));
    } catch (error) {
        return failure(error, 'Failed to count variant group usage');
    }
}

export const variantGroupApi: VariantGroupApi = {
    create: createGroup,
    update: updateGroup,
    delete: deleteGroup,
    getAll: getAllGroups,
    getUsageCount: getGroupUsageCount,
};

// =============================================================================
// VARIANTS
// =============================================================================

function getByGrapheme(graphemeId: number): ApiResponse<GraphemeVariantWithGlyphs[]> {
    const dbError = checkDbInitialized<GraphemeVariantWithGlyphs[]>();
    if (dbError) return dbError;
    try {
        if (!getGraphemeById(graphemeId)) {
            return errorResponse('NOT_FOUND', `Grapheme with ID ${graphemeId} not found`);
        }
        return successResponse(serviceGetVariantsByGraphemeId(graphemeId));
    } catch (error) {
        return failure(error, 'Failed to get variants');
    }
}

function create(graphemeId: number, request: CreateVariantRequest): ApiResponse<GraphemeVariantWithGlyphs> {
    const dbError = checkDbInitialized<GraphemeVariantWithGlyphs>();
    if (dbError) return dbError;
    if (!request.name || request.name.trim() === '') {
        return errorResponse('VALIDATION_ERROR', 'Variant name is required');
    }
    if (!request.glyphs || request.glyphs.length === 0) {
        return errorResponse('VALIDATION_ERROR', 'At least one glyph is required');
    }
    try {
        if (!getGraphemeById(graphemeId)) {
            return errorResponse('NOT_FOUND', `Grapheme with ID ${graphemeId} not found`);
        }
        return successResponse(serviceCreateVariant(graphemeId, {
            name: request.name,
            group_id: request.group_id ?? null,
            sort_order: request.sort_order,
            glyphs: mapGlyphs(request.glyphs),
        }));
    } catch (error) {
        return failure(error, 'Failed to create variant');
    }
}

function update(id: number, request: UpdateVariantRequest): ApiResponse<GraphemeVariant> {
    const dbError = checkDbInitialized<GraphemeVariant>();
    if (dbError) return dbError;
    if (request.name !== undefined && request.name.trim() === '') {
        return errorResponse('VALIDATION_ERROR', 'Variant name is required');
    }
    try {
        const variant = serviceUpdateVariant(id, request);
        if (!variant) {
            return errorResponse('NOT_FOUND', `Variant with ID ${id} not found`);
        }
        return successResponse(variant);
    } catch (error) {
        return failure(error, 'Failed to update variant');
    }
}

function setGlyphs(id: number, glyphs: VariantGlyphsRequest): ApiResponse<void> {
    const dbError = checkDbInitialized<void>();
    if (dbError) return dbError;
    if (!glyphs || glyphs.length === 0) {
        return errorResponse('VALIDATION_ERROR', 'At least one glyph is required');
    }
    try {
        if (!serviceGetVariantById(id)) {
            return errorResponse('NOT_FOUND', `Variant with ID ${id} not found`);
        }
        serviceSetVariantGlyphs(id, mapGlyphs(glyphs));
        cleanupGlyphsIfAutoManaged('variant glyphs');
        return successResponse(undefined);
    } catch (error) {
        return failure(error, 'Failed to update variant glyphs');
    }
}

function setDefault(graphemeId: number, variantId: number): ApiResponse<void> {
    const dbError = checkDbInitialized<void>();
    if (dbError) return dbError;
    try {
        if (!serviceGetVariantById(variantId)) {
            return errorResponse('NOT_FOUND', `Variant with ID ${variantId} not found`);
        }
        serviceSetDefaultVariant(graphemeId, variantId);
        return successResponse(undefined);
    } catch (error) {
        return failure(error, 'Failed to set the default variant');
    }
}

function remove(id: number): ApiResponse<DeleteVariantResult> {
    const dbError = checkDbInitialized<DeleteVariantResult>();
    if (dbError) return dbError;
    try {
        const variant = serviceGetVariantById(id);
        if (!variant) {
            return errorResponse('NOT_FOUND', `Variant with ID ${id} not found`);
        }
        if (variant.is_default) {
            return errorResponse(
                'CONSTRAINT_VIOLATION',
                'Cannot delete the default form of a grapheme. Make another form the default first.',
            );
        }
        const result = serviceDeleteVariant(id);
        cleanupGlyphsIfAutoManaged('variant deleted');
        return successResponse({ affectedLexiconIds: result.affectedLexiconIds });
    } catch (error) {
        return failure(error, 'Failed to delete variant');
    }
}

function getPinUsageCount(id: number): ApiResponse<number> {
    const dbError = checkDbInitialized<number>();
    if (dbError) return dbError;
    try {
        return successResponse(serviceGetVariantPinUsageCount(id));
    } catch (error) {
        return failure(error, 'Failed to count variant pins');
    }
}

export const variantApi: VariantApi = {
    getByGrapheme,
    create,
    update,
    setGlyphs,
    setDefault,
    delete: remove,
    getPinUsageCount,
};
