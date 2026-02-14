import { describe, it, expect } from 'vitest';
import { crc32 } from '../crc32';

describe('crc32', () => {
    it('should compute the standard check value for "123456789"', () => {
        const data = new TextEncoder().encode('123456789');
        expect(crc32(data)).toBe(0xCBF43926);
    });

    it('should return 0x00000000 for empty input', () => {
        expect(crc32(new Uint8Array(0))).toBe(0x00000000);
    });

    it('should handle a single byte', () => {
        const result = crc32(new Uint8Array([0x61])); // 'a'
        expect(result).toBe(0xE8B7BE43);
    });

    it('should produce consistent results', () => {
        const data = new TextEncoder().encode('hello world');
        expect(crc32(data)).toBe(crc32(data));
    });
});
