/**
 * Database API
 *
 * Standardized API layer for database management operations.
 * Wraps internal database functions with consistent ApiResponse format.
 */

import type {
    ApiResponse,
    ApiErrorCode,
    DatabaseStatus,
    ExportFormat,
    DatabaseApi,
} from './types';
import {
    initDatabase,
    isDatabaseInitialized,
    exportDatabaseFile,
    importDatabaseFile as serviceImportDatabaseFile,
    clearDatabase as serviceClearDatabase,
    resetDatabase as serviceResetDatabase,
} from '../database';
import { getGlyphCount } from '../glyphService';
import { getGraphemeCount } from '../graphemeService';

function errorResponse<T>(
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>
): ApiResponse<T> {
    return { success: false, error: { code, message, details } };
}

function successResponse<T>(data: T): ApiResponse<T> {
    return { success: true, data };
}

function getStatus(): ApiResponse<DatabaseStatus> {
    try {
        const initialized = isDatabaseInitialized();
        let glyphCount = 0;
        let graphemeCount = 0;

        if (initialized) {
            try {
                glyphCount = getGlyphCount();
                graphemeCount = getGraphemeCount();
            } catch { /* counts remain 0 */ }
        }

        return successResponse({ initialized, glyphCount, graphemeCount });
    } catch (error) {
        return errorResponse('OPERATION_FAILED', error instanceof Error ? error.message : 'Failed to get database status');
    }
}

function exportDatabase(format: ExportFormat = 'sqlite'): ApiResponse<Blob> {
    if (!isDatabaseInitialized()) {
        return errorResponse('DB_NOT_INITIALIZED', 'Database not initialized');
    }
    try {
        if (format === 'json') {
            return errorResponse('OPERATION_FAILED', 'JSON export not yet implemented');
        }
        const blob = exportDatabaseFile();
        return successResponse(blob);
    } catch (error) {
        return errorResponse('OPERATION_FAILED', error instanceof Error ? error.message : 'Failed to export database');
    }
}

async function importDatabase(file: File): Promise<ApiResponse<void>> {
    try {
        await serviceImportDatabaseFile(file);
        return successResponse(undefined);
    } catch (error) {
        return errorResponse('OPERATION_FAILED', error instanceof Error ? error.message : 'Failed to import database');
    }
}

function clearDatabase(): ApiResponse<void> {
    if (!isDatabaseInitialized()) {
        return errorResponse('DB_NOT_INITIALIZED', 'Database not initialized');
    }
    try {
        serviceClearDatabase();
        return successResponse(undefined);
    } catch (error) {
        return errorResponse('OPERATION_FAILED', error instanceof Error ? error.message : 'Failed to clear database');
    }
}

function resetDatabase(): ApiResponse<void> {
    if (!isDatabaseInitialized()) {
        return errorResponse('DB_NOT_INITIALIZED', 'Database not initialized');
    }
    try {
        serviceResetDatabase();
        return successResponse(undefined);
    } catch (error) {
        return errorResponse('OPERATION_FAILED', error instanceof Error ? error.message : 'Failed to reset database');
    }
}

export const databaseApi: DatabaseApi = {
    getStatus,
    export: exportDatabase,
    import: importDatabase,
    clear: clearDatabase,
    reset: resetDatabase,
};

export { initDatabase };
