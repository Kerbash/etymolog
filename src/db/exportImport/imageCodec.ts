/**
 * Image Codec — JSON ↔ Pixel Data Conversion
 *
 * Bridges the gap between a JSON export string and raw RGBA pixel data that
 * can be embedded in a PNG image. This is the middle layer of the image
 * export/import pipeline:
 *
 *   Export:  JSON string  →  [imageCodec]  →  pixel data  →  [pngFrame]  →  PNG Blob
 *   Import:  PNG Blob  →  [pngFrame]  →  pixel data  →  [imageCodec]  →  JSON string
 *
 * The encoding pipeline is:
 *   1. UTF-8 encode the JSON string
 *   2. Compute CRC-32 over the raw bytes (for integrity verification on import)
 *   3. Gzip-compress the bytes (via compression.ts)
 *   4. Pack into RGBA pixel data (via pixelCodec.ts)
 *
 * The decoding pipeline reverses this:
 *   1. Unpack pixel data back to compressed bytes + CRC (via pixelCodec.ts)
 *   2. Gzip-decompress the bytes (via compression.ts)
 *   3. Verify CRC-32 matches the decompressed bytes
 *   4. UTF-8 decode back to JSON string
 */

import { crc32 } from './crc32';
import { compressData, decompressData } from './compression';
import { encodeToPixels, decodeFromPixels } from './pixelCodec';

/**
 * Encode a JSON string into RGBA pixel data for embedding in a PNG image.
 *
 * Compresses the JSON via gzip, computes a CRC-32 integrity checksum over
 * the uncompressed bytes, then packs everything into the pixel codec binary
 * layout. The returned pixel array and dimensions can be passed directly to
 * `new ImageData(pixels, width, height)` or to `pngFrame.wrapInPngFrame()`.
 *
 * @param json — the JSON string to encode (typically from `exportDataToJson`)
 * @returns a Promise resolving to `{ pixels, width, height }` where `pixels`
 *          is a Uint8ClampedArray in RGBA order
 */
export async function jsonToPixelData(json: string): Promise<{
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
}> {
    const jsonBytes = new TextEncoder().encode(json);
    const crc = crc32(jsonBytes);
    const compressed = await compressData(jsonBytes);
    return encodeToPixels(compressed, crc);
}

/**
 * Decode RGBA pixel data back into a JSON string, verifying data integrity.
 *
 * Extracts the compressed payload and stored CRC from the pixel data using
 * the pixel codec, decompresses via gzip, then verifies the CRC-32 of the
 * decompressed bytes matches the stored value. Throws if the data has been
 * corrupted (e.g. by lossy image compression or pixel modification).
 *
 * @param pixels — RGBA pixel data (Uint8ClampedArray, 4 bytes per pixel)
 * @param width  — pixel grid width
 * @param height — pixel grid height
 * @returns a Promise resolving to the decoded JSON string
 * @throws Error if CRC verification fails ("Data integrity check failed")
 */
export async function pixelDataToJson(
    pixels: Uint8ClampedArray,
    width: number,
    height: number
): Promise<string> {
    const { compressedData, crc } = decodeFromPixels(pixels, width, height);
    const jsonBytes = await decompressData(compressedData);

    const computedCrc = crc32(jsonBytes);
    if (computedCrc !== crc) {
        throw new Error('Data integrity check failed: CRC mismatch');
    }

    return new TextDecoder().decode(jsonBytes);
}
