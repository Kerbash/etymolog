/**
 * Virtual Glyph Utilities
 *
 * Utilities for creating and managing virtual IPA glyphs.
 * Virtual glyphs are auto-generated SVG representations of IPA characters
 * used as fallbacks when no real glyph exists for a phoneme.
 *
 * @module glyphCanvasInput/utils/virtualGlyphUtils
 */

import type { VirtualGlyph } from '../types';

/**
 * Maximum range for virtual glyph IDs.
 * IDs are negative to distinguish from real database IDs.
 */
const VIRTUAL_ID_RANGE = 1_000_000;

/**
 * Simple string hash function for generating deterministic IDs.
 * Uses djb2 algorithm for reasonable distribution.
 *
 * @param str - String to hash
 * @returns Positive integer hash
 */
function hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return Math.abs(hash);
}

/**
 * Generate a deterministic negative ID for a virtual glyph.
 * Same IPA character always produces the same ID.
 *
 * @param ipaCharacter - The IPA character to generate an ID for
 * @returns Negative integer ID
 *
 * @example
 * ```ts
 * generateVirtualGlyphId('ə') // Returns consistent negative number, e.g., -259831
 * generateVirtualGlyphId('ʃ') // Returns different consistent negative number
 * ```
 */
export function generateVirtualGlyphId(ipaCharacter: string): number {
    const hash = hashString(ipaCharacter);
    // Ensure ID is negative and within range
    return -(1 + (hash % VIRTUAL_ID_RANGE));
}

/**
 * Check if a glyph ID represents a virtual glyph.
 * Virtual glyphs always have negative IDs.
 *
 * @param id - Glyph ID to check
 * @returns true if the ID is for a virtual glyph
 *
 * @example
 * ```ts
 * isVirtualGlyphId(-12345) // true
 * isVirtualGlyphId(123)    // false
 * isVirtualGlyphId(0)      // false
 * ```
 */
export function isVirtualGlyphId(id: number): boolean {
    return id < 0;
}

/**
 * Escape special XML characters for safe SVG embedding.
 *
 * @param str - String to escape
 * @returns Escaped string safe for XML/SVG
 */
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Generate an SVG string displaying an IPA character.
 * Uses a standard font stack with IPA-capable fonts.
 *
 * @param ipaCharacter - The IPA character to render
 * @returns SVG markup string
 *
 * @example
 * ```ts
 * const svg = generateIpaSvg('ə');
 * // Returns: '<svg viewBox="0 0 48 48" ...><text ...>ə</text></svg>'
 * ```
 */
export function generateIpaSvg(ipaCharacter: string): string {
    const escaped = escapeXml(ipaCharacter);

    // SVG with IPA character rendered as text
    // Uses font stack prioritizing IPA-capable fonts
    return `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <style>
    .ipa-char {
      font-family: "Doulos SIL", "Charis SIL", "Gentium Plus", "DejaVu Sans", "Lucida Sans Unicode", "Arial Unicode MS", sans-serif;
      font-size: 28px;
      fill: currentColor;
      dominant-baseline: central;
      text-anchor: middle;
    }
  </style>
  <text x="24" y="24" class="ipa-char">${escaped}</text>
</svg>`;
}

/**
 * Create a virtual glyph for an IPA character.
 *
 * Virtual glyphs are used as fallbacks when auto-spell cannot find
 * a real grapheme mapping for a pronunciation character.
 *
 * @param ipaCharacter - The IPA character to create a virtual glyph for
 * @param description - Optional description/notes for the glyph
 * @returns VirtualGlyph object
 *
 * @example
 * ```ts
 * const virtualGlyph = createVirtualGlyph('ə', 'Mid central vowel (schwa)');
 * // Returns: {
 * //   id: -259831,
 * //   ipaCharacter: 'ə',
 * //   name: 'ə',
 * //   svg_data: '<svg ...>...</svg>',
 * //   category: 'IPA Fallback',
 * //   notes: 'Mid central vowel (schwa)',
 * //   source: 'virtual-ipa'
 * // }
 * ```
 */
export function createVirtualGlyph(ipaCharacter: string, description?: string): VirtualGlyph {
    return {
        id: generateVirtualGlyphId(ipaCharacter),
        ipaCharacter,
        name: ipaCharacter,
        svg_data: generateIpaSvg(ipaCharacter),
        category: 'IPA Fallback',
        notes: description ?? null,
        source: 'virtual-ipa',
    };
}

/**
 * Create virtual glyphs for multiple IPA characters.
 *
 * @param ipaCharacters - Array of IPA characters
 * @returns Array of VirtualGlyph objects
 */
export function createVirtualGlyphs(ipaCharacters: string[]): VirtualGlyph[] {
    return ipaCharacters.map(char => createVirtualGlyph(char));
}

/**
 * Type guard to check if an object is a VirtualGlyph.
 *
 * @param obj - Object to check
 * @returns true if the object is a VirtualGlyph
 */
export function isVirtualGlyph(obj: unknown): obj is VirtualGlyph {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'source' in obj &&
        (obj as VirtualGlyph).source === 'virtual-ipa' &&
        'ipaCharacter' in obj
    );
}
