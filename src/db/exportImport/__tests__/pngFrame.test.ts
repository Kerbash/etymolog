/**
 * PNG frame layout — the square, floored share card and its metadata header.
 *
 * What is pinned here, all without a canvas (the layout and the header codec
 * are pure so that they CAN be):
 *
 *  - the frame is never smaller than `MIN_FRAME_SIZE` and is always square —
 *    an empty conlang used to export as a ~60×116 thumbnail with the labels
 *    clipped off;
 *  - it still grows to fit a data block bigger than the floor, on either axis;
 *  - the block is centred between the label bands at integer offsets;
 *  - the header round-trips the layout, and a header from the ORIGINAL layout
 *    (version byte 0, no offset pixels) still resolves to the legacy fixed
 *    offset — every export made before this change must keep importing;
 *  - `extractDataRegion` copies exactly the block the header names.
 */

import { describe, expect, it } from 'vitest';

import {
    FRAME_LAYOUT_VERSION,
    MIN_FRAME_SIZE,
    computeFrameLayout,
    encodeFrameMetadata,
    extractDataRegion,
    fitLabel,
    readFrameMetadata,
} from '../pngFrame';

/** The offsets the original painter hard-coded — the legacy contract. */
const LEGACY_X = 20;
const LEGACY_Y = 48;
const TOP_BAND = 48;
const BOTTOM_BAND = 48;

/** A frame's pixel buffer with the header written and the block filled with a pattern. */
function paintFrame(
    size: number,
    dataX: number,
    dataY: number,
    dataW: number,
    dataH: number,
    header: Uint8ClampedArray,
): Uint8ClampedArray {
    const full = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < dataH; y++) {
        for (let x = 0; x < dataW; x++) {
            const i = ((y + dataY) * size + (x + dataX)) * 4;
            full[i] = x & 0xff;
            full[i + 1] = y & 0xff;
            full[i + 2] = (x * 7 + y * 13) & 0xff;
            full[i + 3] = 255;
        }
    }
    full.set(header, 0);
    return full;
}

describe('computeFrameLayout — square with a floor', () => {
    it('floors an empty conlang to the minimum square instead of a thumbnail', () => {
        const layout = computeFrameLayout(20, 20);
        expect(layout.size).toBe(MIN_FRAME_SIZE);
        expect(MIN_FRAME_SIZE).toBeGreaterThanOrEqual(256);
    });

    it('is square for every data shape', () => {
        for (const [w, h] of [
            [1, 1],
            [20, 20],
            [300, 40],
            [40, 300],
            [600, 20],
            [20, 900],
            [1000, 1000],
        ] as const) {
            const layout = computeFrameLayout(w, h);
            expect(layout.size).toBeGreaterThanOrEqual(MIN_FRAME_SIZE);
            // The block plus its padding fits on both axes.
            expect(layout.dataX + w).toBeLessThanOrEqual(layout.size - LEGACY_X);
            expect(layout.dataY + h).toBeLessThanOrEqual(layout.size - BOTTOM_BAND);
        }
    });

    it('grows past the floor when the data block needs it, on either axis', () => {
        const wide = computeFrameLayout(700, 30);
        expect(wide.size).toBe(700 + LEGACY_X * 2);
        const tall = computeFrameLayout(30, 700);
        expect(tall.size).toBe(700 + TOP_BAND + BOTTOM_BAND);
    });

    it('centres the block between the label bands at integer offsets', () => {
        const layout = computeFrameLayout(100, 50);
        expect(Number.isInteger(layout.dataX)).toBe(true);
        expect(Number.isInteger(layout.dataY)).toBe(true);
        // Horizontally centred on the canvas.
        expect(layout.dataX).toBe(Math.floor((MIN_FRAME_SIZE - 100) / 2));
        // Vertically centred in the area under the name band and above the branding band.
        const inner = MIN_FRAME_SIZE - TOP_BAND - BOTTOM_BAND;
        expect(layout.dataY).toBe(TOP_BAND + Math.floor((inner - 50) / 2));
        expect(layout.dataY).toBeGreaterThanOrEqual(TOP_BAND);
    });

    it('never puts the block under the name band, even when it fills the frame', () => {
        const layout = computeFrameLayout(MIN_FRAME_SIZE - 40, MIN_FRAME_SIZE - 96);
        expect(layout.dataY).toBe(TOP_BAND);
        expect(layout.dataX).toBe(LEGACY_X);
    });

    it('rejects impossible dimensions', () => {
        expect(() => computeFrameLayout(0, 10)).toThrow();
        expect(() => computeFrameLayout(10, -1)).toThrow();
        expect(() => computeFrameLayout(10.5, 10)).toThrow();
        expect(() => computeFrameLayout(Number.NaN, 10)).toThrow();
    });
});

describe('metadata header', () => {
    it('round-trips the layout through encode → read', () => {
        const layout = computeFrameLayout(123, 45);
        const header = encodeFrameMetadata(layout);
        const full = paintFrame(layout.size, layout.dataX, layout.dataY, 123, 45, header);
        const read = readFrameMetadata(full, layout.size, layout.size);
        expect(read.dataX).toBe(layout.dataX);
        expect(read.dataY).toBe(layout.dataY);
        expect(read.dataW).toBe(123);
        expect(read.dataH).toBe(45);
    });

    it('stamps the current layout version and keeps alpha opaque on every header pixel', () => {
        const header = encodeFrameMetadata(computeFrameLayout(10, 10));
        expect(header[9]).toBe(FRAME_LAYOUT_VERSION);
        for (let p = 0; p < header.length / 4; p++) {
            expect(header[p * 4 + 3]).toBe(255);
        }
    });

    it('survives offsets and dimensions above 255 (16-bit fields)', () => {
        const layout = computeFrameLayout(300, 2000);
        expect(layout.dataY).toBeGreaterThan(0);
        const header = encodeFrameMetadata(layout);
        const read = readFrameMetadata(header, layout.size, layout.size);
        expect(read).toMatchObject({ dataX: layout.dataX, dataY: layout.dataY, dataW: 300, dataH: 2000 });
    });

    it('reads a LEGACY header (version 0, three pixels) at the fixed offset', () => {
        // Exactly what the original painter wrote: marker, dims, dataH low byte, zeros.
        const legacy = new Uint8ClampedArray(12);
        legacy.set([0x45, 0x58, 0x50, 255, 0, 64, 0, 255, 32, 0, 0, 255]);
        const fullW = 64 + LEGACY_X * 2;
        const fullH = 32 + LEGACY_Y + BOTTOM_BAND;
        const full = paintFrame(Math.max(fullW, fullH), LEGACY_X, LEGACY_Y, 64, 32, legacy);
        const read = readFrameMetadata(full, fullW, fullH);
        expect(read).toMatchObject({ dataX: LEGACY_X, dataY: LEGACY_Y, dataW: 64, dataH: 32 });
    });

    it('rejects a missing marker and an out-of-bounds block', () => {
        const junk = new Uint8ClampedArray(20 * 4);
        expect(() => readFrameMetadata(junk, 20, 20)).toThrow(/missing metadata marker/);

        const layout = computeFrameLayout(100, 100);
        const header = encodeFrameMetadata(layout);
        // Claim the frame is smaller than the block needs.
        expect(() => readFrameMetadata(header, 100, 100)).toThrow(/out of bounds/);
    });
});

describe('extractDataRegion', () => {
    it('copies exactly the block the header names, byte for byte', () => {
        const layout = computeFrameLayout(37, 11);
        const header = encodeFrameMetadata(layout);
        const full = paintFrame(layout.size, layout.dataX, layout.dataY, 37, 11, header);
        const region = extractDataRegion(full, layout.size, readFrameMetadata(full, layout.size, layout.size));
        expect(region.length).toBe(37 * 11 * 4);
        for (let y = 0; y < 11; y++) {
            for (let x = 0; x < 37; x++) {
                const i = (y * 37 + x) * 4;
                expect(region[i]).toBe(x & 0xff);
                expect(region[i + 1]).toBe(y & 0xff);
                expect(region[i + 2]).toBe((x * 7 + y * 13) & 0xff);
                expect(region[i + 3]).toBe(255);
            }
        }
    });
});

describe('fitLabel', () => {
    const measure = (text: string) => Array.from(text).length * 10;

    it('returns the text unchanged when it fits', () => {
        expect(fitLabel(measure, 'Scrolltest', 200)).toBe('Scrolltest');
    });

    it('shortens with an ellipsis until it fits', () => {
        const label = fitLabel(measure, 'A very long conlang name indeed', 100);
        expect(label.endsWith('…')).toBe(true);
        expect(measure(label)).toBeLessThanOrEqual(100);
    });

    it('never returns an empty string', () => {
        expect(fitLabel(measure, 'abc', 5)).toBe('…');
    });
});
