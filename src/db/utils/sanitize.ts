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
 * Global flag the TEST setup sets so service tests can run without a DOM.
 * Production code never sets it: an environment without DOMPurify fails
 * loudly rather than storing unsanitised markup.
 */
export const ALLOW_UNSANITIZED_SVG_FLAG = '__ETYMOLOG_ALLOW_UNSANITIZED_SVG__';

/**
 * Sanitize SVG data using DOMPurify with the SVG profile.
 * Rejects oversized SVGs to prevent memory abuse.
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
