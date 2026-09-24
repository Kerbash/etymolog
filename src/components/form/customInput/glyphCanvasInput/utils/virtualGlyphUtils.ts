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

// The id hash is shared with the display normaliser and the auto-speller —
// one function, one id per character everywhere.
import { generateVirtualGlyphId, isVirtualGlyphId } from '../../../../../db/utils/virtualGlyph';
import { BLOCK_BOUNDARY, BLOCK_JOIN } from '../../../../../blocks/classify';
export { generateVirtualGlyphId, isVirtualGlyphId };

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
 * The word separator a spelling stores for a space.
 *
 * A space is not a new entry kind: it is the same bare-character IPA entry
 * the auto-speller already emits when a pronunciation has two words
 * (`tokenizeIpa` returns whitespace as its own token, and `buildSkipUnits`
 * turns it into one virtual glyph). The keyboard's space bar produces exactly
 * that entry, so a hand-typed space and an auto-spelled one are identical in
 * `glyph_order` and render the same way.
 */
export const SPACE_CHARACTER = ' ';

/** Create the virtual glyph the keyboard's space bar inserts. */
export function createSpaceGlyph(): VirtualGlyph {
    return createVirtualGlyph(SPACE_CHARACTER, 'Word separator (space)');
}

/** True when a virtual glyph's character is whitespace (a word separator). */
export function isWhitespaceGlyphName(name: string): boolean {
    return name.length > 0 && name.trim().length === 0;
}

/**
 * The explicit block break a spelling stores inside a word: the IPA syllable
 * separator `.` (`BLOCK_BOUNDARY` in `src/blocks`). Like the space, it is not
 * a new entry kind — a bare-character IPA entry — so a hand-typed boundary
 * and one the auto-speller emitted from a `ka.ta` pronunciation are the same
 * `glyph_order` value.
 */
export const BOUNDARY_CHARACTER = BLOCK_BOUNDARY;

/** Create the virtual glyph the keyboard's boundary key (and the `.` key) inserts. */
export function createBoundaryGlyph(): VirtualGlyph {
    return createVirtualGlyph(BOUNDARY_CHARACTER, 'Block boundary');
}

/** True when a virtual glyph's character is the block boundary `.`. */
export function isBoundaryGlyphName(name: string): boolean {
    return name === BOUNDARY_CHARACTER;
}

/**
 * The mirror of the boundary: the IPA undertie `‿` (`BLOCK_JOIN` in
 * `src/blocks`) keeps the signs on both sides in ONE block. Also a
 * bare-character IPA entry, so a hand-typed join and one the auto-speller
 * carried over from an `a‿i` pronunciation are the same `glyph_order` value.
 */
export const JOIN_CHARACTER = BLOCK_JOIN;

/** Create the virtual glyph the keyboard's Join key inserts. */
export function createJoinGlyph(): VirtualGlyph {
    return createVirtualGlyph(JOIN_CHARACTER, 'Block join');
}

/** True when a virtual glyph's character is the block join `‿`. */
export function isJoinGlyphName(name: string): boolean {
    return name === JOIN_CHARACTER;
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
