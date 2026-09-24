/**
 * Block Scheme API — the script's block-script scheme (schema v9)
 *
 * `ApiResponse` layer over `blockSchemeService`. The scheme is one JSON
 * document per script; every read and write passes through
 * `validateBlockScheme`, so what callers receive is always complete and
 * self-consistent.
 *
 * `save` is LENIENT (same contract as `settings.import`): the corrected scheme
 * is stored and the corrections come back in `issues`, for the designer to
 * show inline. `validate` runs the same check without writing.
 */

import type { ApiResponse, ApiErrorCode, BlockSchemeApi, BlockSchemeSaveResult } from './types';
import type { BlockScheme } from '../../blocks/types';
import { validateBlockScheme } from '../../blocks/validate';
import { formatSchemeIssues, getBlockScheme, saveBlockScheme } from '../blockSchemeService';
import { isDatabaseInitialized } from '../database';
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

function get(): ApiResponse<BlockScheme> {
    const dbError = checkDbInitialized<BlockScheme>();
    if (dbError) return dbError;
    try {
        return successResponse(getBlockScheme());
    } catch (error) {
        return failure(error, 'Failed to load the block scheme');
    }
}

function save(scheme: unknown): ApiResponse<BlockSchemeSaveResult> {
    const dbError = checkDbInitialized<BlockSchemeSaveResult>();
    if (dbError) return dbError;
    try {
        const result = saveBlockScheme(scheme);
        const issues = formatSchemeIssues(result.issues);
        if (issues.length > 0) {
            serviceLog.warn('Block scheme saved with corrections:', issues);
        }
        return successResponse({ scheme: result.scheme, issues });
    } catch (error) {
        return failure(error, 'Failed to save the block scheme');
    }
}

function validate(scheme: unknown): ApiResponse<BlockSchemeSaveResult> {
    const result = validateBlockScheme(scheme);
    return successResponse({ scheme: result.scheme, issues: formatSchemeIssues(result.issues) });
}

export const blockSchemeApi: BlockSchemeApi = {
    get,
    save,
    validate,
};
