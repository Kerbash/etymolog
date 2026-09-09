/**
 * Sanitization Utilities
 *
 * Shared sanitization functions for SVG data and input validation.
 * Uses DOMPurify for XSS protection.
 */

import DOMPurify from 'dompurify';

/** Maximum SVG data size in bytes (500KB) */
const MAX_SVG_SIZE = 500 * 1024;

/** SVG sanitization profile for DOMPurify */
const SVG_PROFILE = { USE_PROFILES: { svg: true, svgFilters: true } };

/**
 * The ONLY `data:` URI a glyph may carry: a base64 RASTER image on an
 * `<image>` element — a downscaled PNG (or jpeg/webp/gif) the raster-import
 * codec embeds as `<image href="data:image/png;base64,…">`.
 *
 * IMPORTANT — this is a RESTRICTION, not a permission. Contrary to the older
 * DOMPurify behaviour the plan anticipated (default `ALLOWED_URI_REGEXP`
 * rejecting every `data:`), DOMPurify 3.3 treats `<image>` as a data-URI tag
 * and by default keeps ANY `data:image/*` on it — INCLUDING
 * `data:image/svg+xml`, which is a `<script>`/`on*` XSS payload wearing an
 * image content-type. So the hook below must actively STRIP every `data:` URI
 * on `<image>` that is not one of these raster subtypes, and force-keep the
 * ones that are (belt-and-braces, so a future DOMPurify that flips back to
 * default-deny cannot silently drop a legitimate import either). Excluded:
 *  - `data:image/svg+xml` — inline SVG, an XSS vector, NOT a raster;
 *  - `data:text/html`, `data:application/*`, any non-image type;
 *  - non-base64 (e.g. `data:image/png,<utf8>`), which can hide markup.
 */
const RASTER_IMAGE_DATA_URI = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i;

/** Any `data:` URI, raster or not — the values the hook must adjudicate. */
const ANY_DATA_URI = /^\s*data:/i;

/**
 * Attributes that carry an image reference on an `<image>` element. `href` is
 * the SVG2 form; `xlink:href` the legacy form DOMPurify still parses.
 */
const IMAGE_HREF_ATTRS = new Set(['href', 'xlink:href']);

/**
 * Global flag the TEST setup sets so service tests can run without a DOM.
 * Production code never sets it: an environment without DOMPurify fails
 * loudly rather than storing unsanitised markup.
 */
export const ALLOW_UNSANITIZED_SVG_FLAG = '__ETYMOLOG_ALLOW_UNSANITIZED_SVG__';

/**
 * DOMPurify hooks are GLOBAL to the module instance, so the raster-data-URI
 * policy is registered exactly once and guarded to be idempotent. It cannot
 * be registered at module load: outside a DOM DOMPurify's default export is a
 * factory with no `addHook`, which is the same reason `sanitizeSvg` guards on
 * `typeof DOMPurify?.sanitize`.
 */
let imageDataUriHookInstalled = false;

function ensureImageDataUriHook(): void {
    if (imageDataUriHookInstalled) return;
    if (typeof DOMPurify?.addHook !== 'function') return;

    DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
        if (!IMAGE_HREF_ATTRS.has(data.attrName)) return;
        const value = data.attrValue ?? '';

        // On an actual <image>, a base64 raster data URI is the ONE thing a
        // glyph may carry — and it is the ONLY thing. Everything else is
        // stripped: not just the `data:image/svg+xml` / `data:text/html` script
        // vectors, but ALSO external `http(s)`/protocol-relative references. An
        // external `<image href>` is a tracking beacon (and a client-side fetch
        // to arbitrary hosts) that fires on every render — the plan's "raster
        // and NOTHING else" rule. Raster imports only ever produce a data URI,
        // so nothing legitimate is lost.
        if ((node.nodeName || '').toLowerCase() === 'image') {
            if (RASTER_IMAGE_DATA_URI.test(value)) {
                data.forceKeepAttr = true; // pin it, in case a future default flips to deny
            } else {
                data.keepAttr = false;
            }
            return;
        }

        // A non-<image> element: only `data:` URIs are adjudicated (dropped).
        // Fragment refs (`<use href="#id">`, gradient `xlink:href="#grad">`) and
        // ordinary URL refs stay with the base policy.
        if (!ANY_DATA_URI.test(value)) return;
        data.keepAttr = false;
    });

    imageDataUriHookInstalled = true;
}

/**
 * Sanitize SVG data using DOMPurify with the SVG profile.
 * Rejects oversized SVGs to prevent memory abuse.
 *
 * Raster `<image>` payloads (`data:image/{png,jpeg,webp,gif};base64,…`) are
 * preserved and every other `data:` URI is stripped — see
 * {@link ensureImageDataUriHook}, which tightens DOMPurify 3.3's default that
 * would otherwise keep `data:image/svg+xml`. Scripts and event handlers are
 * stripped by the SVG profile as always.
 *
 * @throws Error if SVG exceeds size limit, or if no sanitiser is available
 *         and the test-only bypass flag is not set
 */
export function sanitizeSvg(svgData: string): string {
    if (svgData.length > MAX_SVG_SIZE) {
        throw new Error(`SVG data exceeds maximum size of ${MAX_SVG_SIZE} bytes`);
    }

    // DOMPurify's default export is a factory (no `sanitize`) outside a DOM.
    if (typeof DOMPurify?.sanitize === 'function') {
        ensureImageDataUriHook();
        return DOMPurify.sanitize(svgData, SVG_PROFILE);
    }

    if ((globalThis as Record<string, unknown>)[ALLOW_UNSANITIZED_SVG_FLAG] === true) {
        return svgData;
    }
    throw new Error('SVG sanitisation is unavailable in this environment');
}

/** Input length limits for various fields */
export const LIMITS = {
    GLYPH_NAME: 200,
    GRAPHEME_NAME: 200,
    LEMMA: 500,
    PRONUNCIATION: 500,
    MEANING: 2000,
    NOTES: 5000,
    CATEGORY: 200,
    FOLDER_NAME: 200,
    PART_OF_SPEECH: 100,
    PHONEME: 100,
    SVG_DATA: MAX_SVG_SIZE,
} as const;

/**
 * Validate that a string does not exceed the specified maximum length.
 *
 * @param value - The string to validate
 * @param maxLength - Maximum allowed length
 * @param fieldName - Name of the field (for error messages)
 * @throws Error if the string exceeds the maximum length
 */
export function validateStringLength(value: string, maxLength: number, fieldName: string): void {
    if (value.length > maxLength) {
        throw new Error(`${fieldName} exceeds maximum length of ${maxLength} characters`);
    }
}
