import { describe, it, expect } from 'vitest';
import { encodeToPixels, decodeFromPixels } from '../pixelCodec';

describe('pixelCodec', () => {
    it('should round-trip small data (10 bytes)', () => {
        const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const crc = 0xDEADBEEF;
        const { pixels, width, height } = encodeToPixels(data, crc);

        const result = decodeFromPixels(pixels, width, height);
        expect(result.compressedData).toEqual(data);
        expect(result.crc).toBe(crc);
    });

    it('should round-trip medium data (1000 bytes)', () => {
        const data = new Uint8Array(1000);
        for (let i = 0; i < 1000; i++) data[i] = i & 0xFF;
        const crc = 0x12345678;
        const { pixels, width, height } = encodeToPixels(data, crc);

        const result = decodeFromPixels(pixels, width, height);
        expect(result.compressedData).toEqual(data);
        expect(result.crc).toBe(crc);
    });

    it('should place markers at correct positions', () => {
        const data = new Uint8Array([0xAA, 0xBB]);
        const crc = 0x00000000;
        const { pixels, width, height } = encodeToPixels(data, crc);

        // Extract raw bytes from pixels
        const totalPixels = width * height;
        const bytes = new Uint8Array(totalPixels * 3);
        for (let i = 0; i < totalPixels; i++) {
            bytes[i * 3 + 0] = pixels[i * 4 + 0];
            bytes[i * 3 + 1] = pixels[i * 4 + 1];
            bytes[i * 3 + 2] = pixels[i * 4 + 2];
        }

        // Check START marker "ETYMOLOG"
        expect(Array.from(bytes.slice(0, 8))).toEqual([0x45, 0x54, 0x59, 0x4D, 0x4F, 0x4C, 0x4F, 0x47]);
        // Check version
        expect(bytes[8]).toBe(1);
        // Check data length = 2 (big-endian)
        expect(bytes[9]).toBe(0);
        expect(bytes[10]).toBe(0);
        expect(bytes[11]).toBe(0);
        expect(bytes[12]).toBe(2);
        // Check data
        expect(bytes[13]).toBe(0xAA);
        expect(bytes[14]).toBe(0xBB);
        // Check CRC = 0
        expect(bytes[15]).toBe(0);
        expect(bytes[16]).toBe(0);
        expect(bytes[17]).toBe(0);
        expect(bytes[18]).toBe(0);
        // Check END marker "ENDETYMO"
        expect(Array.from(bytes.slice(19, 27))).toEqual([0x45, 0x4E, 0x44, 0x45, 0x54, 0x59, 0x4D, 0x4F]);
    });

    it('should throw on missing start marker', () => {
        const pixels = new Uint8ClampedArray(100);
        pixels.fill(255); // All white — no valid marker
        expect(() => decodeFromPixels(pixels, 5, 5)).toThrow('missing start marker');
    });

    it('should throw on wrong data length', () => {
        // Build valid header with a too-large data length
        const data = new Uint8Array(0);
        const crc = 0;
        const { pixels, width, height } = encodeToPixels(data, crc);

        // Corrupt the data length field to a huge value
        // Byte index 9-12 in the stream → pixel positions
        // byte 9 = pixel 3, R channel
        pixels[3 * 4 + 0] = 0xFF; // Make length = 0xFF000000+
        expect(() => decodeFromPixels(pixels, width, height)).toThrow();
    });

    it('should throw on missing end marker', () => {
        const data = new Uint8Array([1, 2, 3]);
        const crc = 0;
        const { pixels, width, height } = encodeToPixels(data, crc);

        // Corrupt end marker area (last 8 bytes of stream)
        // Total bytes = 13 + 3 + 12 = 28
        // End marker starts at byte 24
        // byte 24 = pixel 8, R channel
        pixels[8 * 4 + 0] = 0x00; // Corrupt first byte of END marker
        expect(() => decodeFromPixels(pixels, width, height)).toThrow('missing end marker');
    });
});
