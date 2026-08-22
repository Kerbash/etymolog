/**
 * Import Service — High-Level Import Orchestrators
 *
 * - `importFromJson()`  — validates a JSON string and atomically replaces the
 *   database + settings with its contents.
 * - `importFromImage()` — extracts the pixel payload from a decorated PNG,
 *   decodes/decompresses it to JSON, then does the same.
 *
 * Both are destructive (replace-all) — the caller prompts for confirmation —
 * but both are ATOMIC: a file that fails validation or insertion leaves the
 * current conlang untouched. Both resolve after the result is durably saved
 * and return an `ImportReport` the UI can summarise ("312 words imported, 2
 * orphaned spelling rows dropped").
 *
 * After either resolves, the caller should refresh the React context so
 * components reload with the imported data.
 */

import { parseAndValidateJson, importExportData } from './jsonCodec';
import { extractDataFromPngFrame } from './pngFrame';
import { pixelDataToJson } from './imageCodec';
import type { ImportReport, ProgressCallback } from './types';

/**
 * Import conlang data from a JSON string, replacing all current data.
 *
 * @throws Error if validation fails (invalid JSON, wrong magic/version,
 *         missing tables, malformed rows) — the current data is intact
 */
export async function importFromJson(json: string, onProgress?: ProgressCallback): Promise<ImportReport> {
    onProgress?.('validate', 0, 'Validating...');
    const data = parseAndValidateJson(json);
    onProgress?.('import', 0.1, 'Importing data...');
    const report = await importExportData(data, onProgress);
    onProgress?.('done', 1.0, 'Import complete');
    return report;
}

/**
 * Import conlang data from a decorated PNG image, replacing all current data.
 *
 * @throws Error if the PNG is not a valid Etymolog image, CRC check fails,
 *         or the decoded JSON fails validation — the current data is intact
 */
export async function importFromImage(file: Blob, onProgress?: ProgressCallback): Promise<ImportReport> {
    onProgress?.('extract', 0, 'Extracting image data...');
    const { pixels, width, height } = await extractDataFromPngFrame(file);
    onProgress?.('decode', 0.15, 'Decoding image data...');
    const json = await pixelDataToJson(pixels, width, height);
    onProgress?.('validate', 0.6, 'Validating...');
    const data = parseAndValidateJson(json);
    onProgress?.('import', 0.7, 'Importing data...');
    const report = await importExportData(data, onProgress);
    onProgress?.('done', 1.0, 'Import complete');
    return report;
}
