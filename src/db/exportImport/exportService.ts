/**
 * Export Service — High-Level Export Orchestrators
 *
 * Provides two top-level export functions that coordinate the full pipeline
 * from database collection through to a downloadable artifact:
 *
 * - `exportAsJson()` — Collects all data and returns a pretty-printed JSON string
 *   suitable for saving as a `.etymolog.json` file.
 *
 * - `exportAsImage()` — Collects data, serializes to JSON, compresses + encodes
 *   into pixel data, wraps in a decorative PNG frame, and returns a PNG Blob
 *   suitable for saving as a `.etymolog.png` file.
 *
 * Both accept an optional `ProgressCallback` for driving progress bar UI.
 */

import { collectExportData, exportDataToJson } from './jsonCodec';
import { jsonToPixelData } from './imageCodec';
import { wrapInPngFrame } from './pngFrame';
import type { ProgressCallback } from './types';

/**
 * Export all conlang data as a pretty-printed JSON string.
 *
 * Reads all 8 database tables and settings, wraps them in the versioned
 * `EtymologExportData` envelope, and serializes to JSON with 2-space indent.
 *
 * This is a synchronous operation (sql.js is in-memory). Progress callbacks
 * are still invoked for UI consistency.
 *
 * @param onProgress — optional callback for progress reporting
 * @returns the JSON string ready to be wrapped in a Blob and downloaded
 */
export function exportAsJson(onProgress?: ProgressCallback): string {
    onProgress?.('collect', 0, 'Reading database...');
    const data = collectExportData();
    onProgress?.('serialize', 0.5, 'Serializing...');
    const json = exportDataToJson(data);
    onProgress?.('done', 1.0);
    return json;
}

/**
 * Export all conlang data as a decorated PNG image Blob.
 *
 * Pipeline:
 *   1. Collect all database tables and settings
 *   2. Serialize to JSON
 *   3. Compress (gzip) and encode into RGBA pixel data with CRC integrity check
 *   4. Wrap pixel data in a decorative PNG frame with conlang name and branding
 *
 * The resulting PNG contains the full export data embedded losslessly in its
 * pixel values. It can be re-imported via `importFromImage()`.
 *
 * @param onProgress — optional callback for progress reporting
 * @returns a Promise resolving to a PNG Blob ready for download
 */
export async function exportAsImage(onProgress?: ProgressCallback): Promise<Blob> {
    onProgress?.('collect', 0, 'Reading database...');
    const data = collectExportData();
    onProgress?.('serialize', 0.15, 'Serializing...');
    const json = exportDataToJson(data);
    onProgress?.('compress', 0.3, 'Encoding image...');
    const { pixels, width, height } = await jsonToPixelData(json);
    onProgress?.('frame', 0.8, 'Building PNG frame...');
    const blob = await wrapInPngFrame(pixels, width, height, data.conlangName);
    onProgress?.('done', 1.0);
    return blob;
}
