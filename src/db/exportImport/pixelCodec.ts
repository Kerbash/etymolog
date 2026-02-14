/**
 * Pixel Codec — Binary-to-Pixel Encoding/Decoding
 *
 * Encodes an arbitrary byte stream into RGBA pixel data (and back) for storage
 * inside a PNG image. Each pixel stores 3 bytes of payload in its R, G, B channels;
 * the alpha channel is always 255 (fully opaque) to avoid premultiplied-alpha
 * artifacts during PNG encode/decode.
 *
 * The byte stream follows a self-describing binary layout:
 *
 *   [START_MARKER: 8 bytes "ETYMOLOG"]
 *   [VERSION:      1 byte]
 *   [DATA_LENGTH:  4 bytes, big-endian uint32]
 *   [GZIP_DATA:    N bytes of compressed payload]
 *   [CRC32:        4 bytes, big-endian uint32]
 *   [END_MARKER:   8 bytes "ENDETYMO"]
 *
 * The start/end markers allow detection and validation of the data region.
 * The version byte enables future format changes. The CRC-32 is computed
 * over the *uncompressed* JSON bytes (not the compressed data) and is used
 * by the imageCodec layer to verify data integrity after decompression.
 *
 * Pixel dimensions are calculated to be approximately square:
 *   totalPixels = ceil(totalBytes / 3)
 *   width  = ceil(sqrt(totalPixels))
 *   height = ceil(totalPixels / width)
 * Unused trailing pixels are zero-filled.
 */

/** 8-byte start marker: ASCII "ETYMOLOG" */
const START_MARKER = new Uint8Array([0x45, 0x54, 0x59, 0x4D, 0x4F, 0x4C, 0x4F, 0x47]);

/** 8-byte end marker: ASCII "ENDETYMO" */
const END_MARKER = new Uint8Array([0x45, 0x4E, 0x44, 0x45, 0x54, 0x59, 0x4D, 0x4F]);

/** Binary format version. Increment when the layout changes. */
const VERSION = 1;

/** Size of the header: START(8) + VERSION(1) + LEN(4) = 13 bytes */
const HEADER_SIZE = 13;

/** Size of the footer: CRC(4) + END(8) = 12 bytes */
const FOOTER_SIZE = 12;

/**
 * Encode compressed data and its CRC into an RGBA pixel array.
 *
 * Builds the binary stream (header + payload + footer), then packs every
 * 3 consecutive bytes into one RGBA pixel (R, G, B channels; A=255).
 * The resulting pixel array can be written directly to an ImageData for
 * rendering onto a canvas.
 *
 * @param compressedData — gzip-compressed payload bytes
 * @param crc — CRC-32 of the *uncompressed* source data
 * @returns an object with `pixels` (Uint8ClampedArray in RGBA order),
 *          `width`, and `height` suitable for `new ImageData(pixels, width, height)`
 */
export function encodeToPixels(
    compressedData: Uint8Array,
    crc: number
): { pixels: Uint8ClampedArray; width: number; height: number } {
    const totalBytes = HEADER_SIZE + compressedData.length + FOOTER_SIZE;

    // Build byte stream
    const stream = new Uint8Array(totalBytes);
    let offset = 0;

    // START marker
    stream.set(START_MARKER, offset); offset += 8;
    // Version
    stream[offset++] = VERSION;
    // Data length (4 bytes, big-endian uint32)
    stream[offset++] = (compressedData.length >>> 24) & 0xFF;
    stream[offset++] = (compressedData.length >>> 16) & 0xFF;
    stream[offset++] = (compressedData.length >>> 8) & 0xFF;
    stream[offset++] = compressedData.length & 0xFF;
    // Compressed data
    stream.set(compressedData, offset); offset += compressedData.length;
    // CRC (4 bytes, big-endian)
    stream[offset++] = (crc >>> 24) & 0xFF;
    stream[offset++] = (crc >>> 16) & 0xFF;
    stream[offset++] = (crc >>> 8) & 0xFF;
    stream[offset++] = crc & 0xFF;
    // END marker
    stream.set(END_MARKER, offset);

    // Calculate squarish dimensions
    const totalPixels = Math.ceil(totalBytes / 3);
    const width = Math.ceil(Math.sqrt(totalPixels));
    const height = Math.ceil(totalPixels / width);

    // Create RGBA pixel array (3 payload bytes per pixel, alpha always 255)
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const byteIdx = i * 3;
        pixels[i * 4 + 0] = byteIdx < totalBytes ? stream[byteIdx] : 0;        // R
        pixels[i * 4 + 1] = byteIdx + 1 < totalBytes ? stream[byteIdx + 1] : 0; // G
        pixels[i * 4 + 2] = byteIdx + 2 < totalBytes ? stream[byteIdx + 2] : 0; // B
        pixels[i * 4 + 3] = 255;                                                  // A
    }

    return { pixels, width, height };
}

/**
 * Decode RGBA pixel data back into compressed data and CRC.
 *
 * Reconstructs the byte stream from pixel RGB channels, then validates the
 * start/end markers and version byte before extracting the compressed payload
 * and CRC. Throws descriptive errors if any structural check fails.
 *
 * @param pixels — RGBA pixel data (Uint8ClampedArray, 4 bytes per pixel)
 * @param width  — image width in pixels
 * @param height — image height in pixels
 * @returns an object with `compressedData` (the gzip payload) and `crc`
 *          (the CRC-32 of the original uncompressed data)
 * @throws Error if markers are missing, version is unsupported, or length is invalid
 */
export function decodeFromPixels(
    pixels: Uint8ClampedArray,
    width: number,
    height: number
): { compressedData: Uint8Array; crc: number } {
    // Extract byte stream from RGB channels (skip alpha)
    const totalPixels = width * height;
    const stream = new Uint8Array(totalPixels * 3);
    for (let i = 0; i < totalPixels; i++) {
        stream[i * 3 + 0] = pixels[i * 4 + 0]; // R
        stream[i * 3 + 1] = pixels[i * 4 + 1]; // G
        stream[i * 3 + 2] = pixels[i * 4 + 2]; // B
    }

    // Verify START marker
    for (let i = 0; i < START_MARKER.length; i++) {
        if (stream[i] !== START_MARKER[i]) {
            throw new Error('Invalid data: missing start marker');
        }
    }

    // Read version
    const version = stream[8];
    if (version !== VERSION) {
        throw new Error(`Unsupported pixel codec version: ${version}`);
    }

    // Read data length (big-endian uint32)
    const dataLen = (stream[9] << 24) | (stream[10] << 16) | (stream[11] << 8) | stream[12];
    if (dataLen < 0 || HEADER_SIZE + dataLen + FOOTER_SIZE > stream.length) {
        throw new Error('Invalid data: wrong data length');
    }

    // Extract compressed data
    const compressedData = stream.slice(HEADER_SIZE, HEADER_SIZE + dataLen);

    // Read CRC (big-endian uint32)
    const crcOffset = HEADER_SIZE + dataLen;
    const crc = (
        ((stream[crcOffset] << 24) |
        (stream[crcOffset + 1] << 16) |
        (stream[crcOffset + 2] << 8) |
        stream[crcOffset + 3])
    ) >>> 0;

    // Verify END marker
    const endOffset = crcOffset + 4;
    for (let i = 0; i < END_MARKER.length; i++) {
        if (stream[endOffset + i] !== END_MARKER[i]) {
            throw new Error('Invalid data: missing end marker');
        }
    }

    return { compressedData, crc };
}
