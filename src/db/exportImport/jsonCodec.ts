/**
 * JSON Codec — Export Data Collection, Serialization, Validation & Import
 *
 * This is the core module for Etymolog's data portability. It handles:
 *
 * 1. **Collection** — Reading all 8 SQLite tables + localStorage settings into
 *    a single `EtymologExportData` envelope via `collectExportData()`.
 *
 * 2. **Serialization** — Converting that envelope to a pretty-printed JSON string
 *    via `exportDataToJson()`.
 *
 * 3. **Validation** — Parsing a JSON string and verifying it has the correct magic
 *    string, version number, all 8 expected tables (as arrays), and a settings
 *    object, via `parseAndValidateJson()`.
 *
 * 4. **Import** — Wiping the database to a clean schema, inserting all rows in
 *    foreign-key-safe order, fixing autoincrement sequences, persisting to
 *    localStorage, and restoring settings, via `importExportData()`.
 *
 * This module is pure logic (no React, no DOM). It is used by both the JSON
 * export/import path and the image export/import path (which converts JSON
 * to/from pixel data as an intermediate step).
 */

import { getDatabase } from '../database';
import { getCurrentSettings } from '../api/settingsApi';
import { resetDatabase, persistDatabase } from '../database';
import type { EtymologExportData, ExportTables, ProgressCallback } from './types';
import { TABLE_INSERTION_ORDER, AUTOINCREMENT_TABLES } from './types';

const EXPECTED_TABLES: (keyof ExportTables)[] = TABLE_INSERTION_ORDER;

/**
 * Run `SELECT * FROM <tableName>` and return the result as an array of plain
 * objects, one per row, keyed by column name. Returns an empty array if the
 * table has no rows. This is used internally by `collectExportData()` to
 * snapshot each table's raw contents.
 *
 * @param db — the sql.js Database instance
 * @param tableName — the exact SQLite table name to query
 * @returns an array of row objects with column-name keys and raw SQLite values
 */
function queryTable(db: ReturnType<typeof getDatabase>, tableName: string): Record<string, unknown>[] {
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
 *
 * Reads all rows from each of the 8 SQLite tables and snapshots the current
 * `EtymologSettings` from the in-memory settings store. Wraps everything in
 * an `EtymologExportData` envelope with magic string, version, timestamp,
 * and conlang name.
 *
 * This is a synchronous operation (sql.js runs in-memory).
 *
 * @returns a fully-populated `EtymologExportData` ready for serialization
 */
export function collectExportData(): EtymologExportData {
    const db = getDatabase();
    const settings = getCurrentSettings();

    const tables = {} as ExportTables;
    for (const tableName of EXPECTED_TABLES) {
        (tables as any)[tableName] = queryTable(db, tableName);
    }

    return {
        magic: 'ETYMOLOG_EXPORT',
        version: 1,
        exportedAt: new Date().toISOString(),
        conlangName: settings.conlangName,
        settings,
        tables,
    };
}

/**
 * Serialize an `EtymologExportData` object to a pretty-printed JSON string.
 *
 * Uses 2-space indentation for human readability. The output is suitable for
 * writing directly to a `.etymolog.json` file or for feeding into the image
 * encoding pipeline.
 *
 * @param data — the export data envelope to serialize
 * @returns a formatted JSON string
 */
export function exportDataToJson(data: EtymologExportData): string {
    return JSON.stringify(data, null, 2);
}

/**
 * Parse a JSON string and validate it as a well-formed Etymolog export.
 *
 * Performs the following checks in order:
 *   1. Valid JSON syntax (throws "Invalid JSON: could not parse the input")
 *   2. Magic string is `"ETYMOLOG_EXPORT"` (throws "Not an Etymolog export file")
 *   3. Version is `1` (throws "Unsupported export version: {v}")
 *   4. `tables` is a non-null object (throws "Missing tables object")
 *   5. All 8 expected table keys exist (throws "Missing table: {name}")
 *   6. Each table value is an array (throws "Table {name} is not an array")
 *   7. `settings` is a non-null object (throws "Missing settings")
 *
 * @param json — the raw JSON string to parse and validate
 * @returns the validated `EtymologExportData` object
 * @throws Error with a descriptive message if any check fails
 */
export function parseAndValidateJson(json: string): EtymologExportData {
    let data: any;
    try {
        data = JSON.parse(json);
    } catch {
        throw new Error('Invalid JSON: could not parse the input');
    }

    if (data.magic !== 'ETYMOLOG_EXPORT') {
        throw new Error('Not an Etymolog export file');
    }
    if (data.version !== 1) {
        throw new Error(`Unsupported export version: ${data.version}`);
    }
    if (!data.tables || typeof data.tables !== 'object') {
        throw new Error('Missing tables object');
    }
    for (const name of EXPECTED_TABLES) {
        if (!(name in data.tables)) {
            throw new Error(`Missing table: ${name}`);
        }
        if (!Array.isArray(data.tables[name])) {
            throw new Error(`Table ${name} is not an array`);
        }
    }
    if (!data.settings || typeof data.settings !== 'object') {
        throw new Error('Missing settings');
    }

    return data as EtymologExportData;
}

/**
 * Import validated export data into the database, replacing ALL existing data.
 *
 * This is a destructive operation — it wipes the database first. The steps are:
 *
 *   1. **Reset** — Drop all tables and recreate the empty schema via `resetDatabase()`.
 *   2. **Insert** — For each table (in FK-safe order), build a parameterized
 *      `INSERT INTO` statement from the first row's column names and execute it
 *      for every row. Progress is reported via the callback.
 *   3. **Fix sequences** — For tables with AUTOINCREMENT, update `sqlite_sequence`
 *      so the next auto-generated ID won't collide with imported IDs.
 *   4. **Persist** — Write the database binary to localStorage via `persistDatabase()`.
 *   5. **Restore settings** — Write the exported settings JSON to the
 *      `etymolog_settings_v1` localStorage key.
 *
 * @param data       — the validated export data to import
 * @param onProgress — optional callback for progress reporting during row insertion
 */
export function importExportData(data: EtymologExportData, onProgress?: ProgressCallback): void {
    // Step 1: Reset to clean schema
    resetDatabase();
    const db = getDatabase();

    // Step 2: Insert rows for each table in FK-safe order
    const totalRows = TABLE_INSERTION_ORDER.reduce(
        (sum, t) => sum + data.tables[t].length, 0
    );
    let insertedRows = 0;

    for (const tableName of TABLE_INSERTION_ORDER) {
        const rows = data.tables[tableName];
        if (rows.length === 0) continue;

        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => '?').join(', ');
        const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;

        for (const row of rows) {
            const values = columns.map(col => (row as any)[col]);
            db.run(sql, values);
            insertedRows++;
            onProgress?.('import', 0.2 + 0.7 * (insertedRows / totalRows), `Importing ${tableName}...`);
        }
    }

    // Step 3: Fix autoincrement sequences
    for (const tableName of AUTOINCREMENT_TABLES) {
        if (data.tables[tableName].length > 0) {
            db.run(
                `UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM ${tableName}) WHERE name = '${tableName}'`
            );
        }
    }

    // Step 4: Persist database
    persistDatabase();

    // Step 5: Write settings to localStorage
    localStorage.setItem('etymolog_settings_v1', JSON.stringify(data.settings));
}
