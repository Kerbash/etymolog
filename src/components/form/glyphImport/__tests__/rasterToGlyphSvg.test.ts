// @vitest-environment happy-dom
/**
 * rasterToGlyphSvg — the pure, canvas-free half of the import codec.
 *
 * happy-dom has no `<canvas>`, `Image` or `createImageBitmap`, so the decode /
 * downscale / PNG-encode path (`rasterFileToGlyphSvg`) is exercised by the
 * browser and the form-integration stubs, NOT here. What IS pinned here is
 * everything the correctness of an import rests on and that CAN run without a
 * canvas: the line-art pixel maths on synthetic `ImageData`, the SVG envelopes,
 * the dimension fit, the size-budget fallback, and the SVG-file pipeline
 * (which needs the real DOMPurify happy-dom provides). See LOGOGRAPH_PLAN §6.5.
 */

import { describe, it, expect } from 'vitest';

import {
    fitWithin,
    toLineArtMaskImageData,
    buildLineArtSvg,
    buildKeepColorsSvg,
    encodeWithBudget,
    svgHasContent,
    svgFileToGlyphSvg,
    importFileToGlyphSvg,
    TOO_LARGE_MESSAGE,
    EMPTY_SVG_MESSAGE,
    type ImageLike,
} from '../rasterToGlyphSvg';
import { sanitizeSvg, LIMITS } from '../../../../db/utils/sanitize';
import { normalizeGlyphSvg } from '../../glyphForm/normalizeGlyphSvg';

/** Build a 1-pixel ImageLike from an RGBA quad. */
function onePixel(r: number, g: number, b: number, a: number): ImageLike {
    return { data: new Uint8ClampedArray([r, g, b, a]), width: 1, height: 1 };
}

describe('fitWithin', () => {
    it('shrinks a landscape image so its longest side hits maxSide', () => {
        expect(fitWithin(1000, 500, 512)).toEqual({ width: 512, height: 256 });
    });
    it('shrinks a portrait image on its height', () => {
        expect(fitWithin(500, 1000, 512)).toEqual({ width: 256, height: 512 });
    });
    it('leaves a square at the cap exactly at the cap', () => {
        expect(fitWithin(512, 512, 512)).toEqual({ width: 512, height: 512 });
    });
    it('never enlarges an image smaller than the cap', () => {
        expect(fitWithin(120, 80, 512)).toEqual({ width: 120, height: 80 });
    });
    it('rounds to whole pixels with a floor of 1', () => {
        // 3×1 scaled to maxSide 2 → 2 × 0.66… → rounds to 2 × 1 (floor keeps the tiny axis visible)
        expect(fitWithin(3, 1, 2)).toEqual({ width: 2, height: 1 });
    });
});

describe('toLineArtMaskImageData — ink = alpha × (1 − luminance)', () => {
    it('turns opaque black into full white ink', () => {
        const out = toLineArtMaskImageData(onePixel(0, 0, 0, 255));
        expect([...out.data]).toEqual([255, 255, 255, 255]);
    });
    it('turns opaque white into no ink', () => {
        const out = toLineArtMaskImageData(onePixel(255, 255, 255, 255));
        expect(out.data[3]).toBe(0);
        expect([out.data[0], out.data[1], out.data[2]]).toEqual([255, 255, 255]);
    });
    it('turns a fully transparent pixel into no ink regardless of colour', () => {
        expect(toLineArtMaskImageData(onePixel(0, 0, 0, 0)).data[3]).toBe(0);
        expect(toLineArtMaskImageData(onePixel(255, 0, 0, 0)).data[3]).toBe(0);
    });
    it('scales a mid-grey by its darkness', () => {
        // luminance(128)=0.502 → ink = 1 × (1−0.502) = 0.498 → 127
        expect(toLineArtMaskImageData(onePixel(128, 128, 128, 255)).data[3]).toBe(127);
    });
    it('multiplies by the source alpha (semi-transparent black)', () => {
        // alpha 128/255=0.502, luminance 0 → ink 0.502 → 128
        expect(toLineArtMaskImageData(onePixel(0, 0, 0, 128)).data[3]).toBe(128);
    });
    it('always paints RGB pure white so the mask is a clean luminance channel', () => {
        const out = toLineArtMaskImageData(onePixel(200, 30, 90, 200));
        expect([out.data[0], out.data[1], out.data[2]]).toEqual([255, 255, 255]);
    });
    it('processes every pixel of a multi-pixel buffer', () => {
        const src: ImageLike = {
            width: 2,
            height: 1,
            data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
        };
        const out = toLineArtMaskImageData(src);
        expect(out.data[3]).toBe(255); // black → full ink
        expect(out.data[7]).toBe(0); // white → none
    });
    it('throws on a mis-sized buffer', () => {
        expect(() => toLineArtMaskImageData({ data: new Uint8ClampedArray(3), width: 1, height: 1 })).toThrow();
    });
});

describe('SVG envelope builders', () => {
    const dataUri = 'data:image/png;base64,AAAA';

    it('line-art wraps a mask + currentColor rect at the right size', () => {
        const svg = buildLineArtSvg(dataUri, 400, 300, 'abc');
        expect(svg).toContain('viewBox="0 0 400 300"');
        expect(svg).toContain('<mask id="glyphimgabc"');
        expect(svg).toContain(`href="${dataUri}"`);
        expect(svg).toContain('fill="currentColor"');
        expect(svg).toContain('mask="url(#glyphimgabc)"');
    });

    it('keep-colors wraps a bare image at the right size', () => {
        const svg = buildKeepColorsSvg(dataUri, 128, 64);
        expect(svg).toContain('viewBox="0 0 128 64"');
        expect(svg).toContain(`href="${dataUri}"`);
        expect(svg).not.toContain('<mask');
        expect(svg).not.toContain('currentColor');
    });

    it('produces distinct mask ids per import so two glyphs on a page cannot collide', () => {
        expect(buildLineArtSvg(dataUri, 10, 10, 'aaa')).not.toContain('glyphimgbbb');
        expect(buildLineArtSvg(dataUri, 10, 10, 'bbb')).toContain('glyphimgbbb');
    });
});

describe('codec output survives the save pipeline intact (normalize + sanitize)', () => {
    // A realistic line-art SVG with a real base64 PNG payload.
    const PNG =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

    it('normalizeGlyphSvg keeps the <image>+mask markup and the rect stays currentColor', () => {
        const svg = buildLineArtSvg(PNG, 64, 64, 'x1');
        const normalized = normalizeGlyphSvg(svg);
        expect(normalized).toContain('<image');
        expect(normalized).toContain('<mask');
        expect(normalized).toContain('fill="currentColor"');
        expect(normalized).toContain('data:image/png;base64,');
    });

    it('sanitizeSvg keeps the raster payload for both modes', () => {
        expect(sanitizeSvg(buildLineArtSvg(PNG, 64, 64, 'x2'))).toContain('data:image/png;base64,');
        expect(sanitizeSvg(buildKeepColorsSvg(PNG, 64, 64))).toContain('data:image/png;base64,');
    });
});

describe('encodeWithBudget — 512 then 256 then reject', () => {
    it('returns the first candidate that fits', async () => {
        const svg = await encodeWithBudget([512, 256], async (side) => `X`.repeat(side), 1000);
        expect(svg.length).toBe(512);
    });
    it('falls back to the smaller side when the first busts the budget', async () => {
        const svg = await encodeWithBudget([512, 256], async (side) => `X`.repeat(side), 300);
        expect(svg.length).toBe(256);
    });
    it('throws the human message when nothing fits', async () => {
        await expect(encodeWithBudget([512, 256], async (side) => `X`.repeat(side), 100)).rejects.toThrow(
            TOO_LARGE_MESSAGE,
        );
    });
    it('encodes each side only as needed (stops at the first fit)', async () => {
        const seen: number[] = [];
        await encodeWithBudget(
            [512, 256],
            async (side) => {
                seen.push(side);
                return 'x';
            },
            1000,
        );
        expect(seen).toEqual([512]);
    });
});

describe('svgHasContent', () => {
    it('is false for an empty root', () => {
        expect(svgHasContent('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe(false);
    });
    it('is false for whitespace-only content', () => {
        expect(svgHasContent('<svg>\n   \n</svg>')).toBe(false);
    });
    it('is true when there is an element inside', () => {
        expect(svgHasContent('<svg><path d="M0 0"/></svg>')).toBe(true);
    });
    it('is false for a non-svg string', () => {
        expect(svgHasContent('not svg')).toBe(false);
    });
});

describe('svgFileToGlyphSvg — direct SVG import runs the save pipeline', () => {
    const svgFile = (body: string) =>
        new File([body], 'symbol.svg', { type: 'image/svg+xml' });

    it('sanitises and normalises a hand-authored SVG', async () => {
        const out = await svgFileToGlyphSvg(
            svgFile('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1 L9 9" fill="#000000"/></svg>'),
        );
        expect(out).toContain('fill="currentColor"');
        expect(out).not.toContain('#000000');
        expect(out).toContain('d="M1 1 L9 9"');
    });

    it('strips a script smuggled into the SVG file', async () => {
        const out = await svgFileToGlyphSvg(
            svgFile('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4" fill="#000"/><script>alert(1)</script></svg>'),
        );
        expect(out).not.toContain('<script');
        expect(out).toContain('<rect');
    });

    it('rejects an SVG that is empty once cleaned', async () => {
        await expect(svgFileToGlyphSvg(svgFile('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).rejects.toThrow(
            EMPTY_SVG_MESSAGE,
        );
    });

    it('rejects an oversized SVG file before sanitising', async () => {
        const huge = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${'M0 0 '.repeat(LIMITS.SVG_DATA)}"/></svg>`;
        await expect(svgFileToGlyphSvg(svgFile(huge))).rejects.toThrow(/500KB/);
    });
});

describe('importFileToGlyphSvg — dispatch by type', () => {
    it('routes an .svg file to the SVG pipeline and reports mode "svg"', async () => {
        const file = new File(
            ['<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4" fill="#000"/></svg>'],
            'sym.svg',
            { type: 'image/svg+xml' },
        );
        const result = await importFileToGlyphSvg(file);
        expect(result.mode).toBe('svg');
        expect(result.svg).toContain('<rect');
    });

    it('rejects an unsupported type with a human message', async () => {
        const file = new File(['nope'], 'notes.txt', { type: 'text/plain' });
        await expect(importFileToGlyphSvg(file)).rejects.toThrow(/Unsupported file type/);
    });
});
