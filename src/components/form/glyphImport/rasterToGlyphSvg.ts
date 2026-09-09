/**
 * rasterToGlyphSvg
 * ----------------
 * Turn an uploaded image (PNG / JPEG / WebP / GIF, or an SVG file) into a glyph
 * SVG string — the same shape the drawing canvas produces, so it flows through
 * `normalizeGlyphSvg` and `sanitizeSvg` unchanged and stores in `glyph.svg_data`.
 *
 * Two raster modes:
 *
 *  - **Line-art (default)** — the author's symbols are dark strokes on a light
 *    ground (Google Drawings PNGs, in the feedback that drove this). We turn
 *    the drawing into a THEME-FOLLOWING mask: each pixel's ink strength is
 *    `alpha × (1 − luminance)` (opaque + dark ⇒ full ink; white or transparent
 *    ⇒ none), painted as a WHITE PNG whose alpha carries that strength. That
 *    PNG becomes an SVG `<mask>`, and a single `<rect fill="currentColor">`
 *    shows through it — so the imported symbol recolours with the reader's text
 *    colour exactly like a drawn glyph, in either theme. (SVG masks are
 *    luminance × alpha by default; a white mask pixel of alpha A yields
 *    coverage A, which is why the PNG is painted white.)
 *
 *  - **Keep-colors** — embed the downscaled PNG as-is under an `<image>`. It
 *    does NOT adapt to dark mode; the UI warns about that.
 *
 * The heavy lifting (decode, downscale, PNG encode) needs a real canvas and so
 * lives in the browser-only orchestration at the bottom. Everything the tests
 * pin — the pixel math, the SVG envelopes, the dimension fit and the size
 * budget — is a PURE function above it, because the test DOM (happy-dom) has no
 * canvas, `Image` or `createImageBitmap`. See LOGOGRAPH_PLAN §6.5.
 */

import { sanitizeSvg, LIMITS } from '../../../db/utils/sanitize';
import { normalizeGlyphSvg } from '../glyphForm/normalizeGlyphSvg';

/** The longest side of the downscaled raster, in px, on the first attempt. */
export const RASTER_MAX_SIDE = 512;
/** The fallback longest side used when the 512px encode blows the size budget. */
export const RASTER_RETRY_SIDE = 256;

/** How a raster was interpreted. Reported to the UI for the preview label. */
export type GlyphImportMode = 'line-art' | 'keep-colors' | 'svg';

/** Raster subtypes accepted for import (matches the sanitizer allow-list). */
export const ACCEPTED_RASTER_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

/** A minimal, canvas-free stand-in for `ImageData` — what the pixel math needs. */
export interface ImageLike {
    data: Uint8ClampedArray;
    width: number;
    height: number;
}

export interface RasterImportOptions {
    /** Embed the PNG as-is (no theme-following mask). Default false. */
    keepColors?: boolean;
    /** Override the primary longest-side target (px). Default {@link RASTER_MAX_SIDE}. */
    maxSide?: number;
    /** Override the fallback longest-side target (px). Default {@link RASTER_RETRY_SIDE}. */
    retrySide?: number;
    /** Override the byte budget for the encoded SVG. Default `LIMITS.SVG_DATA`. */
    sizeLimit?: number;
}

// ───────────────────────── pure helpers (unit-tested) ─────────────────────────

/**
 * Scale `w × h` down so its longest side is at most `maxSide`, preserving the
 * aspect ratio and never enlarging (a smaller image imports at native size).
 * Dimensions are rounded to whole pixels with a floor of 1.
 */
export function fitWithin(w: number, h: number, maxSide: number): { width: number; height: number } {
    const longest = Math.max(w, h);
    const scale = longest > maxSide ? maxSide / longest : 1;
    return {
        width: Math.max(1, Math.round(w * scale)),
        height: Math.max(1, Math.round(h * scale)),
    };
}

/** Rec. 709 relative luminance of an sRGB triple, normalised to 0…1. */
function luminance01(r: number, g: number, b: number): number {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * The line-art transform, as pure pixel math over an `ImageLike`.
 *
 * Produces a NEW `ImageLike` the same size, every pixel pure white
 * (`255,255,255`) with alpha `round(srcAlpha × (1 − luminance) )`. Encoded as a
 * PNG and used as an SVG luminance mask, that makes dark/opaque input show ink
 * and light/transparent input show nothing — the imported drawing's ink,
 * ready to be painted in `currentColor`.
 *
 * @throws if `data.length` is not `4 × width × height` (guards a mis-sized buffer).
 */
export function toLineArtMaskImageData(src: ImageLike): ImageLike {
    const { data, width, height } = src;
    const expected = width * height * 4;
    if (data.length !== expected) {
        throw new Error(`ImageData buffer is ${data.length} bytes, expected ${expected}`);
    }
    const out = new Uint8ClampedArray(expected);
    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        const lum = luminance01(data[i], data[i + 1], data[i + 2]);
        const ink = alpha * (1 - lum); // 0…1
        out[i] = 255;
        out[i + 1] = 255;
        out[i + 2] = 255;
        out[i + 3] = Math.round(ink * 255);
    }
    return { data: out, width, height };
}

/**
 * Wrap a raster data URI as a theme-following line-art glyph: a white-ink mask
 * PNG driving a single `currentColor` rect. The mask id is unique-ish per call
 * so two imported glyphs on one page cannot collide.
 */
export function buildLineArtSvg(maskPngDataUri: string, width: number, height: number, idSuffix = ''): string {
    const id = `glyphimg${idSuffix}`;
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
        `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">` +
        `<image x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" href="${maskPngDataUri}" />` +
        `</mask>` +
        `<rect x="0" y="0" width="${width}" height="${height}" fill="currentColor" mask="url(#${id})" />` +
        `</svg>`
    );
}

/** Wrap a raster data URI as an as-is (colour-preserving) glyph. */
export function buildKeepColorsSvg(pngDataUri: string, width: number, height: number): string {
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
        `<image x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" href="${pngDataUri}" />` +
        `</svg>`
    );
}

/** The human-facing message when even the 256px fallback busts the budget. */
export const TOO_LARGE_MESSAGE =
    'This image is too detailed to store as a glyph even after shrinking. ' +
    'Try a simpler image, flatten it to fewer colours, or use the drawing tool instead.';

/**
 * Encode at each candidate side in turn, returning the first result within
 * `sizeLimit`. The budget is enforced at IMPORT time on purpose (see
 * LOGOGRAPH_PLAN §6.11): the limit is never raised, because a fat glyph
 * multiplies export size and IndexedDB pressure for every reader.
 *
 * @throws {@link TOO_LARGE_MESSAGE} when no candidate fits.
 */
export async function encodeWithBudget(
    sides: readonly number[],
    encode: (side: number) => Promise<string>,
    sizeLimit: number,
): Promise<string> {
    let smallest = '';
    for (const side of sides) {
        const svg = await encode(side);
        if (svg.length <= sizeLimit) return svg;
        if (!smallest || svg.length < smallest.length) smallest = svg;
    }
    throw new Error(TOO_LARGE_MESSAGE);
}

// ───────────────────────── browser orchestration ─────────────────────────

/** A decoded bitmap plus its intrinsic size, from whichever loader was available. */
interface DecodedImage {
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
    width: number;
    height: number;
    close: () => void;
}

/** Decode a raster file to something drawable, preferring `createImageBitmap`. */
async function decodeRaster(file: Blob): Promise<DecodedImage> {
    if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file);
        return {
            draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
            width: bitmap.width,
            height: bitmap.height,
            close: () => bitmap.close(),
        };
    }
    // Fallback for browsers without createImageBitmap: an <img> + object URL.
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('The image could not be decoded.'));
            element.src = url;
        });
        return {
            draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
            width: img.naturalWidth,
            height: img.naturalHeight,
            close: () => {},
        };
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Draw the decoded image into a fresh canvas at the target size, return its 2D context. */
function drawToCanvas(image: DecodedImage, width: number, height: number): CanvasRenderingContext2D {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot process images (no 2D canvas).');
    ctx.clearRect(0, 0, width, height);
    image.draw(ctx, width, height);
    return ctx;
}

/** Encode a canvas region as a PNG data URI. */
function canvasToPngDataUri(ctx: CanvasRenderingContext2D): string {
    return ctx.canvas.toDataURL('image/png');
}

/**
 * Decode → downscale → (line-art transform or not) → SVG, enforcing the size
 * budget by retrying at a smaller side. Browser-only.
 */
export async function rasterFileToGlyphSvg(file: Blob, options: RasterImportOptions = {}): Promise<string> {
    const { keepColors = false, maxSide = RASTER_MAX_SIDE, retrySide = RASTER_RETRY_SIDE } = options;
    const sizeLimit = options.sizeLimit ?? LIMITS.SVG_DATA;

    const image = await decodeRaster(file);
    try {
        const encode = async (side: number): Promise<string> => {
            const { width, height } = fitWithin(image.width, image.height, side);
            const ctx = drawToCanvas(image, width, height);
            if (keepColors) {
                return buildKeepColorsSvg(canvasToPngDataUri(ctx), width, height);
            }
            const source = ctx.getImageData(0, 0, width, height);
            const mask = toLineArtMaskImageData({ data: source.data, width, height });
            // Write the transformed pixels back into the real `ImageData` object
            // (same length) rather than constructing a new one — avoids the
            // typed-array buffer-generic mismatch on the `ImageData` ctor.
            source.data.set(mask.data);
            const maskCtx = drawToCanvas(
                { draw: () => {}, width, height, close: () => {} },
                width,
                height,
            );
            maskCtx.putImageData(source, 0, 0);
            return buildLineArtSvg(canvasToPngDataUri(maskCtx), width, height, uniqueSuffix());
        };

        // Distinct sides only — if the image is already ≤ retrySide the two
        // attempts would be identical, so there is nothing to fall back to.
        const sides = maxSide === retrySide ? [maxSide] : [maxSide, retrySide];
        return await encodeWithBudget(sides, encode, sizeLimit);
    } finally {
        image.close();
    }
}

/** A short, collision-resistant suffix for mask ids within one document. */
function uniqueSuffix(): string {
    return Math.random().toString(36).slice(2, 8);
}

/** The message shown when an uploaded SVG has no drawable content after sanitising. */
export const EMPTY_SVG_MESSAGE = 'That SVG file has no drawable content once cleaned up.';

/**
 * Import an SVG FILE directly: read its text, sanitise it (which strips scripts
 * and disallowed data URIs — see `sanitizeSvg`) and normalise its paint to
 * `currentColor`. This is the same pipeline drawn glyphs take on save, so a
 * hand-authored or exported SVG lands identically. Rejects a file that is empty
 * once cleaned.
 */
export async function svgFileToGlyphSvg(file: Blob): Promise<string> {
    const text = (await file.text()).trim();
    if (!text) throw new Error(EMPTY_SVG_MESSAGE);
    if (text.length > LIMITS.SVG_DATA) {
        throw new Error(
            'That SVG file is larger than a glyph may be (500KB). Simplify it or export a smaller version.',
        );
    }
    const cleaned = normalizeGlyphSvg(sanitizeSvg(text)).trim();
    if (!svgHasContent(cleaned)) throw new Error(EMPTY_SVG_MESSAGE);
    return cleaned;
}

/** True when a sanitised SVG string still has element content inside its root. */
export function svgHasContent(svg: string): boolean {
    const match = svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
    if (!match) return false;
    return match[1].trim() !== '';
}

/**
 * The single entry point the UI calls: dispatch by file type and return the
 * glyph SVG plus how it was interpreted.
 *
 * @throws a human-readable Error for an unsupported type, a decode failure, an
 *         empty SVG, or a raster too detailed to fit the budget.
 */
export async function importFileToGlyphSvg(
    file: File,
    options: RasterImportOptions = {},
): Promise<{ svg: string; mode: GlyphImportMode }> {
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();

    if (type === 'image/svg+xml' || name.endsWith('.svg')) {
        return { svg: await svgFileToGlyphSvg(file), mode: 'svg' };
    }
    if ((ACCEPTED_RASTER_MIME as readonly string[]).includes(type) || isRasterFilename(name)) {
        const svg = await rasterFileToGlyphSvg(file, options);
        return { svg, mode: options.keepColors ? 'keep-colors' : 'line-art' };
    }
    throw new Error('Unsupported file type. Import a PNG, JPEG, WebP, GIF or SVG image.');
}

/** Recognise a raster by extension when the browser gives no (or a wrong) MIME. */
function isRasterFilename(name: string): boolean {
    return /\.(png|jpe?g|webp|gif)$/i.test(name);
}
