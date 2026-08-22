/**
 * JSON Codec — Export Data Collection, Serialization, Validation & Import
 *
 * This is the core module for Etymolog's data portability. It handles:
 *
 * 1. **Collection** — Reading all SQLite tables + the current settings into a
 *    single `EtymologExportData` envelope via `collectExportData()`.
 *
 * 2. **Serialization** — Converting that envelope to a pretty-printed JSON string
 *    via `exportDataToJson()`.
 *
 * 3. **Shape validation** — Parsing a JSON string and verifying magic, version,
 *    table keys and settings object, via `parseAndValidateJson()`.
 *
 * 4. **Import** — Replacing ALL data atomically via `importExportData()`:
 *    content validation happens in memory first (`validateExport.ts`), the
 *    existing bytes are snapshotted, and the wipe + insert + closure rebuild
 *    + integrity check run inside ONE transaction. Any failure rolls back to
 *    the pre-import state; if even the rollback fails, the snapshot is
 *    reloaded. Settings are applied through `settingsApi.import()` (listeners
 *    notified) and the result is flushed to durable storage before returning.
 *
 * This module is pure logic (no React, no DOM). It is used by both the JSON
 * export/import path and the image export/import path.
 */

import {
    getDatabase,
    exportDatabaseBytes,
    clearAllTables,
    countForeignKeyViolations,
    persistDatabaseNow,
    replaceDatabaseFromBytes,
} from '../database';
import { getCurrentSettings, settingsApi } from '../api/settingsApi';
import { withTransaction, TransactionRollbackFailed } from '../utils/transaction';
import { rebuildClosureTable } from '../closureService';
import type { EtymologExportData, ExportTables, ImportReport, ProgressCallback } from './types';
import { TABLE_INSERTION_ORDER, AUTOINCREMENT_TABLES } from './types';
import { APP_VERSION, EXPORT_SCHEMA_VERSION } from '../../config/version';
import { validateExportData, INSERTABLE_TABLES, type ValidatedExport } from './validateExport';

const EXPECTED_TABLES: (keyof ExportTables)[] = TABLE_INSERTION_ORDER;

export class ImportIntegrityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ImportIntegrityError';
    }
}

/**
 * Run `SELECT * FROM <tableName>` and return the rows as plain objects keyed by
 * column name. `tableName` is always one of the module constants — never user
 * input.
 */
function queryTable(db: ReturnType<typeof getDatabase>, tableName: keyof ExportTables): Record<string, unknown>[] {
    const result = db.exec(`SELECT * FROM ${tableName}`);
    if (result.length === 0) return [];
    const { columns, values } = result[0];
    return values.map(row => {
        const obj: Record<string, unknown> = {};
        columns.forEach((col, i) => {
            obj[col] = row[i];
        });
        return obj;
    });
}

/**
 * Collect all exportable data from the current database and settings.
 */
export function collectExportData(): EtymologExportData {
    const db = getDatabase();
    const settings = getCurrentSettings();

    const tables = {} as Record<keyof ExportTables, Record<string, unknown>[]>;
    for (const tableName of EXPECTED_TABLES) {
        tables[tableName] = queryTable(db, tableName);
    }

    return {
        magic: 'ETYMOLOG_EXPORT',
        version: EXPORT_SCHEMA_VERSION,
        appVersion: APP_VERSION,
        exportedAt: new Date().toISOString(),
        conlangName: settings.conlangName,
        settings,
        tables: tables as unknown as ExportTables,
    };
}

/**
 * Serialize an `EtymologExportData` object to a pretty-printed JSON string.
 */
export function exportDataToJson(data: EtymologExportData): string {
    return JSON.stringify(data, null, 2);
}

/**
 * Parse a JSON string and validate it as a well-formed Etymolog export envelope.
 *
 * Checks, in order: JSON syntax, magic string, version, `tables` object, every
 * expected table key (with `lexicon_meanings` and `lexicon_ancestry_closure`
 * optional for older exports), each table is an array, `settings` is an object.
 * Row CONTENT is validated later by `validateExportData()`.
 *
 * @throws Error with a descriptive message if any check fails
 */
export function parseAndValidateJson(json: string): EtymologExportData {
    let data: unknown;
    try {
        data = JSON.parse(json);
    } catch {
        throw new Error('Invalid JSON: could not parse the input');
    }

    if (typeof data !== 'object' || data === null) {
        throw new Error('Not an Etymolog export file');
    }
    const envelope = data as Record<string, unknown>;

    if (envelope.magic !== 'ETYMOLOG_EXPORT') {
        throw new Error('Not an Etymolog export file');
    }
    if (envelope.version !== EXPORT_SCHEMA_VERSION) {
        throw new Error(`Unsupported export version: ${String(envelope.version)}`);
    }
    if (!envelope.tables || typeof envelope.tables !== 'object') {
        throw new Error('Missing tables object');
    }
    const tables = envelope.tables as Record<string, unknown>;
    for (const name of EXPECTED_TABLES) {
        if (!(name in tables)) {
            // Optional for backward compatibility with older exports
            if (name === 'lexicon_meanings' || name === 'lexicon_ancestry_closure') {
                tables[name] = [];
                continue;
            }
            throw new Error(`Missing table: ${name}`);
        }
        if (!Array.isArray(tables[name])) {
            throw new Error(`Table ${name} is not an array`);
        }
    }
    if (!envelope.settings || typeof envelope.settings !== 'object') {
        throw new Error('Missing settings');
    }

    return envelope as unknown as EtymologExportData;
}

function insertValidatedRows(
    db: ReturnType<typeof getDatabase>,
    validated: ValidatedExport,
    onProgress: ProgressCallback | undefined,
): void {
    const totalRows = INSERTABLE_TABLES.reduce((sum, t) => sum + validated.tables[t].length, 0);
    let insertedRows = 0;

    for (const tableName of INSERTABLE_TABLES) {
        const rows = validated.tables[tableName];
        if (rows.length === 0) continue;
        const columns = validated.columns[tableName];
        const placeholders = columns.map(() => '?').join(', ');
        const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
        const stmt = db.prepare(sql);
        try {
            for (const row of rows) {
                stmt.run(columns.map(col => row[col]));
                insertedRows++;
                if (insertedRows % 50 === 0 || insertedRows === totalRows) {
                    onProgress?.('import', 0.2 + 0.6 * (insertedRows / Math.max(totalRows, 1)), `Importing ${tableName}...`);
                }
            }
        } finally {
            stmt.free();
        }
    }
}

/** Old exports predate `lexicon_meanings`; derive rows from `lexicon.meaning`. */
function backfillLegacyMeanings(db: ReturnType<typeof getDatabase>, validated: ValidatedExport): number {
    if (validated.tables.lexicon_meanings.length > 0 || validated.tables.lexicon.length === 0) {
        return 0;
    }
    let created = 0;
    for (const lexicon of validated.tables.lexicon) {
        const meaning = lexicon.meaning;
        if (typeof meaning === 'string' && meaning.trim() !== '') {
            db.run(
                `INSERT INTO lexicon_meanings (lexicon_id, meaning, part_of_speech, usage_notes, definition_order)
                 VALUES (?, ?, NULL, NULL, 0)`,
                [lexicon.id, meaning]
            );
            created++;
        }
    }
    return created;
}

function fixAutoincrementSequences(db: ReturnType<typeof getDatabase>): void {
    for (const tableName of AUTOINCREMENT_TABLES) {
        // `tableName` comes from the module constant list, never from input.
        db.run(
            `INSERT OR REPLACE INTO sqlite_sequence (name, seq)
             SELECT '${tableName}', COALESCE(MAX(id), 0) FROM ${tableName}`
        );
    }
}

/**
 * Import validated export data into the database, replacing ALL existing data.
 *
 * Atomic: either the whole envelope is imported, or the database is exactly as
 * it was. Resolves once the result has been durably written.
 *
 * @param data       — the envelope from `parseAndValidateJson()`
 * @param onProgress — optional progress callback
 * @returns a report of what was inserted/pruned and any settings corrections
 * @throws ExportValidationError | ImportIntegrityError | Error
 */
export async function importExportData(data: EtymologExportData, onProgress?: ProgressCallback): Promise<ImportReport> {
    const db = getDatabase();

    onProgress?.('validate', 0.1, 'Checking rows...');
    const validated = validateExportData(data);

    // Snapshot BEFORE anything is touched. If a rollback ever fails, this is
    // what the user gets back.
    const snapshot = exportDatabaseBytes();

    let legacyMeanings = 0;
    try {
        withTransaction(db, () => {
            onProgress?.('import', 0.2, 'Clearing existing data...');
            clearAllTables(db);
            insertValidatedRows(db, validated, onProgress);
            onProgress?.('import', 0.85, 'Finalising...');
            legacyMeanings = backfillLegacyMeanings(db, validated);
            fixAutoincrementSequences(db);
            rebuildClosureTable(db);
            const violations = countForeignKeyViolations(db);
            if (violations > 0) {
                throw new ImportIntegrityError(`Import produced ${violations} foreign-key violation(s); aborted`);
            }
        });
    } catch (error) {
        if (error instanceof TransactionRollbackFailed) {
            replaceDatabaseFromBytes(snapshot);
            throw error.original instanceof Error ? error.original : error;
        }
        throw error;
    }

    onProgress?.('import', 0.92, 'Restoring settings...');
    const settingsResult = settingsApi.import(data.settings);
    if (!settingsResult.success) {
        throw new Error(settingsResult.error?.message ?? 'Failed to restore settings');
    }
    const settingsWarnings = settingsResult.data?.warnings ?? [];

    onProgress?.('import', 0.96, 'Saving...');
    await persistDatabaseNow();

    const report: ImportReport = {
        inserted: { ...validated.report.accepted, lexicon_ancestry_closure: 0 },
        pruned: { ...validated.report.pruned, lexicon_ancestry_closure: 0 },
        legacyMeaningsCreated: legacyMeanings,
        warnings: [...validated.report.warnings, ...settingsWarnings],
    };
    return report;
}
