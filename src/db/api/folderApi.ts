/**
 * Folder API (Phase 5a, UC-D; generalised for glyph/grapheme folders in v8)
 *
 * Standardized API layer for nested folders. `createFolderApi(domain)` wraps
 * ONE `FolderDomain` (see `folderDomain.ts`) with the consistent ApiResponse
 * envelope, mirroring the other api modules (checkDbInitialized, error/success
 * helpers, error-code mapping). Three instances are exported — one per domain.
 *
 * The lexicon instance additionally keeps the historical `setLexiconFolder`
 * method name so callers written before the generalisation keep working; all
 * three instances share the domain-neutral `setItemFolder`.
 */

import type { ApiResponse, ApiErrorCode } from './types';
import type { FolderRecord } from '../types';
import {
    lexiconFolderDomain,
    glyphFolderDomain,
    graphemeFolderDomain,
    type FolderDomain,
} from '../folderDomain';
import { isDatabaseInitialized } from '../database';

// =============================================================================
// REQUEST / RESPONSE TYPES
// =============================================================================

/** Create a folder, optionally under a parent. */
export interface CreateFolderRequest {
    name: string;
    parent_id?: number | null;
    position?: number;
}

/** Rename and/or reorder a folder. */
export interface UpdateFolderRequest {
    name?: string;
    position?: number;
}

/** File an item into a folder (null = root) — domain-neutral. */
export interface SetItemFolderRequest {
    itemId: number;
    folderId: number | null;
}

/**
 * File a word into a folder (null = root). Historical shape kept for the
 * lexicon instance's `setLexiconFolder`.
 */
export interface SetLexiconFolderRequest {
    lexiconId: number;
    folderId: number | null;
}

// =============================================================================
// HELPERS
// =============================================================================

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

/**
 * Map a thrown service error onto an ApiError code + message.
 *
 * STRING-SNIFFS the folder engine's messages: the five substrings below are
 * kept byte-identical in `folderDomain.ts` — keep the two in step.
 */
function fromError<T>(err: unknown, fallback: string): ApiResponse<T> {
    const message = err instanceof Error ? err.message : fallback;
    if (message.includes('not found')) {
        return errorResponse('NOT_FOUND', message);
    }
    if (
        message.includes('cannot exceed') ||
        message.includes('into itself') ||
        message.includes('own descendant') ||
        message.includes('needs a name') ||
        message.includes('exceeds maximum length')
    ) {
        return errorResponse('VALIDATION_ERROR', message);
    }
    return errorResponse('OPERATION_FAILED', message);
}

// =============================================================================
// INTERFACE
// =============================================================================

/**
 * Folder API interface — nested folder operations for one domain.
 *
 * `create`/`move` enforce the cycle guard and depth cap; `delete` reparents
 * children and items to the deleted folder's parent (never deletes an item);
 * `setItemFolder` files an item (null = root).
 */
export interface FolderApi {
    list(): ApiResponse<FolderRecord[]>;
    getById(id: number): ApiResponse<FolderRecord>;
    create(request: CreateFolderRequest): ApiResponse<FolderRecord>;
    update(id: number, request: UpdateFolderRequest): ApiResponse<FolderRecord>;
    rename(id: number, name: string): ApiResponse<FolderRecord>;
    move(id: number, newParentId: number | null): ApiResponse<FolderRecord>;
    delete(id: number): ApiResponse<void>;
    setItemFolder(request: SetItemFolderRequest): ApiResponse<void>;
    getPath(id: number): ApiResponse<FolderRecord[]>;
}

/**
 * The lexicon folder API: the base surface plus the historical
 * `setLexiconFolder` alias, kept so pre-v8 callers keep compiling.
 */
export interface LexiconFolderApi extends FolderApi {
    /** @deprecated Historical alias of {@link FolderApi.setItemFolder}. */
    setLexiconFolder(request: SetLexiconFolderRequest): ApiResponse<void>;
}

// =============================================================================
// FACTORY
// =============================================================================

/** Build a `FolderApi` bound to one {@link FolderDomain}. */
export function createFolderApi(domain: FolderDomain): FolderApi {
    function list(): ApiResponse<FolderRecord[]> {
        const dbError = checkDbInitialized<FolderRecord[]>();
        if (dbError) return dbError;
        try {
            return successResponse(domain.getAllFolders());
        } catch (err) {
            return fromError(err, 'Failed to list folders');
        }
    }

    function getById(id: number): ApiResponse<FolderRecord> {
        const dbError = checkDbInitialized<FolderRecord>();
        if (dbError) return dbError;
        const folder = domain.getFolderById(id);
        if (!folder) {
            return errorResponse('NOT_FOUND', `Folder with id ${id} not found`);
        }
        return successResponse(folder);
    }

    function create(request: CreateFolderRequest): ApiResponse<FolderRecord> {
        const dbError = checkDbInitialized<FolderRecord>();
        if (dbError) return dbError;
        if (!request.name || request.name.trim() === '') {
            return errorResponse('VALIDATION_ERROR', 'A folder needs a name');
        }
        try {
            return successResponse(domain.createFolder({
                name: request.name,
                parent_id: request.parent_id ?? null,
                position: request.position,
            }));
        } catch (err) {
            return fromError(err, 'Failed to create folder');
        }
    }

    function update(id: number, request: UpdateFolderRequest): ApiResponse<FolderRecord> {
        const dbError = checkDbInitialized<FolderRecord>();
        if (dbError) return dbError;
        try {
            return successResponse(domain.updateFolder(id, request));
        } catch (err) {
            return fromError(err, 'Failed to update folder');
        }
    }

    function rename(id: number, name: string): ApiResponse<FolderRecord> {
        const dbError = checkDbInitialized<FolderRecord>();
        if (dbError) return dbError;
        if (!name || name.trim() === '') {
            return errorResponse('VALIDATION_ERROR', 'A folder needs a name');
        }
        try {
            return successResponse(domain.renameFolder(id, name));
        } catch (err) {
            return fromError(err, 'Failed to rename folder');
        }
    }

    function move(id: number, newParentId: number | null): ApiResponse<FolderRecord> {
        const dbError = checkDbInitialized<FolderRecord>();
        if (dbError) return dbError;
        try {
            return successResponse(domain.moveFolder(id, newParentId));
        } catch (err) {
            return fromError(err, 'Failed to move folder');
        }
    }

    function remove(id: number): ApiResponse<void> {
        const dbError = checkDbInitialized<void>();
        if (dbError) return dbError;
        try {
            const deleted = domain.deleteFolder(id);
            if (!deleted) {
                return errorResponse('NOT_FOUND', `Folder with id ${id} not found`);
            }
            return successResponse(undefined);
        } catch (err) {
            return fromError(err, 'Failed to delete folder');
        }
    }

    function setItemFolder(request: SetItemFolderRequest): ApiResponse<void> {
        const dbError = checkDbInitialized<void>();
        if (dbError) return dbError;
        try {
            domain.setItemFolder(request.itemId, request.folderId);
            return successResponse(undefined);
        } catch (err) {
            return fromError(err, 'Failed to move item to folder');
        }
    }

    function getPath(id: number): ApiResponse<FolderRecord[]> {
        const dbError = checkDbInitialized<FolderRecord[]>();
        if (dbError) return dbError;
        try {
            return successResponse(domain.getFolderPath(id));
        } catch (err) {
            return fromError(err, 'Failed to get folder path');
        }
    }

    return { list, getById, create, update, rename, move, delete: remove, setItemFolder, getPath };
}

// =============================================================================
// INSTANCES
// =============================================================================

const lexiconBase = createFolderApi(lexiconFolderDomain);

/**
 * Lexicon folder API — the `api.folder` namespace. Carries the historical
 * `setLexiconFolder({ lexiconId, folderId })` alias in addition to the shared
 * `setItemFolder`.
 */
export const folderApi: LexiconFolderApi = {
    ...lexiconBase,
    setLexiconFolder(request: SetLexiconFolderRequest): ApiResponse<void> {
        return lexiconBase.setItemFolder({ itemId: request.lexiconId, folderId: request.folderId });
    },
};

/** Glyph folder API — the `api.glyphFolder` namespace. */
export const glyphFolderApi: FolderApi = createFolderApi(glyphFolderDomain);

/** Grapheme folder API — the `api.graphemeFolder` namespace. */
export const graphemeFolderApi: FolderApi = createFolderApi(graphemeFolderDomain);
