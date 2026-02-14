/**
 * Import Service — High-Level Import Orchestrators
 *
 * Provides two top-level import functions that coordinate the full pipeline
 * from a user-provided file through to a fully restored database:
 *
 * - `importFromJson()` — Validates a JSON string, wipes the database, and restores
 *   all tables and settings from the parsed data.
 *
 * - `importFromImage()` — Extracts pixel data from a decorated PNG, decodes and
 *   decompresses back to JSON, validates, then restores the database.
 *
 * Both are destructive operations — they completely replace the current database
 * and settings. The caller should prompt for user confirmation before invoking.
 *
 * Both accept an optional `ProgressCallback` for driving progress bar UI.
 */

import { parseAndValidateJson, importExportData } from './jsonCodec';
import { extractDataFromPngFrame } from './pngFrame';
import { pixelDataToJson } from './imageCodec';
import type { ProgressCallback } from './types';

/**
 * Import conlang data from a JSON string, replacing all current data.
 *
 * Pipeline:
 *   1. Parse and validate the JSON against the `EtymologExportData` schema
 *   2. Wipe the database and re-import all rows in FK-safe order
 *   3. Fix autoincrement sequences and persist to localStorage
 *   4. Restore settings to localStorage
 *
 * After this function returns, the caller should trigger a React state refresh
 * (e.g. `refresh()` from `useEtymolog()`) to reload all components with the
 * newly imported data.
 *
 * @param json       — the raw JSON string from a `.etymolog.json` file
 * @param onProgress — optional callback for progress reporting
 * @throws Error if validation fails (invalid JSON, wrong magic/version, missing tables)
 */
export function importFromJson(json: string, onProgress?: ProgressCallback): void {
    onProgress?.('validate', 0, 'Validating...');
    const data = parseAndValidateJson(json);
    onProgress?.('import', 0.2, 'Importing data...');
    importExportData(data, onProgress);
    onProgress?.('done', 1.0, 'Import complete');
}

/**
 * Import conlang data from a decorated PNG image, replacing all current data.
 *
 * Pipeline:
 *   1. Extract the data pixel region from the PNG frame (reads metadata header
 *      at pixel (0,0) to locate the data rectangle)
 *   2. Decode pixels back to compressed bytes, decompress, verify CRC-32
 *   3. Parse and validate the resulting JSON
 *   4. Wipe the database and re-import all rows
 *   5. Fix autoincrement sequences, persist, and restore settings
 *
 * After this function returns, the caller should trigger a React state refresh.
 *
 * @param file       — the PNG file (Blob or File) from a `.etymolog.png` export
 * @param onProgress — optional callback for progress reporting
 * @throws Error if the PNG is not a valid Etymolog image, CRC check fails,
 *         or the decoded JSON fails validation
 */
export async function importFromImage(file: Blob, onProgress?: ProgressCallback): Promise<void> {
    onProgress?.('extract', 0, 'Extracting image data...');
    const { pixels, width, height } = await extractDataFromPngFrame(file);
    onProgress?.('decode', 0.15, 'Decoding image data...');
    const json = await pixelDataToJson(pixels, width, height);
    onProgress?.('validate', 0.6, 'Validating...');
    const data = parseAndValidateJson(json);
    onProgress?.('import', 0.7, 'Importing data...');
    importExportData(data, onProgress);
    onProgress?.('done', 1.0, 'Import complete');
}
