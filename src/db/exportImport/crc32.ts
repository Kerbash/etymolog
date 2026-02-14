/**
 * CRC-32 Checksum
 *
 * Computes the standard CRC-32 checksum (ISO 3309 / ITU-T V.42) used to verify
 * data integrity during image-based export/import. The checksum is computed over
 * the raw (uncompressed) JSON bytes before gzip compression, and stored alongside
 * the compressed data in the pixel stream. On import, the CRC is recomputed after
 * decompression and compared to detect corruption.
 *
 * Uses the reflected polynomial 0xEDB88320 (bit-reversed form of 0x04C11DB7)
 * with a pre-computed 256-entry lookup table for performance.
 */

/** Pre-computed CRC-32 lookup table (256 entries, polynomial 0xEDB88320). */
const TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
        crc = crc & 1 ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
    }
    TABLE[i] = crc;
}

/**
 * Compute the CRC-32 checksum of a byte array.
 *
 * Returns an unsigned 32-bit integer. For the standard check value,
 * `crc32(encode("123456789"))` produces `0xCBF43926`.
 *
 * @param data — the raw bytes to checksum
 * @returns the CRC-32 value as an unsigned 32-bit number
 */
export function crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ TABLE[(crc ^ data[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
