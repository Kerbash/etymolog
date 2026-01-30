/**
 * Input Normalization Utilities
 *
 * Functions to convert various input formats to RenderableGlyph[].
 *
 * @module display/spelling/utils/normalization
 */

import type { Glyph, GraphemeComplete, SpellingDisplayEntry } from '../../../../db/types';
import type { RenderableGlyph, NormalizationContext, InputType } from '../types';

/**
 * Generate a consistent negative ID for a virtual IPA glyph.
 * Uses a simple hash of the IPA character.
 */
function generateVirtualId(ipaChar: string): number {
    let hash = 0;
    for (let i = 0; i < ipaChar.length; i++) {
        const char = ipaChar.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    // Ensure negative ID
    return hash < 0 ? hash : -hash - 1;
}

/**
 * Generate SVG data for a virtual IPA glyph.
 * Creates a simple text display of the IPA character.
 */
function generateVirtualSvg(ipaChar: string): string {
    // Escape special XML characters
    const escaped = ipaChar
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect x="5" y="5" width="90" height="90" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5,5" rx="8"/>
        <text x="50" y="60" font-family="serif" font-size="48" text-anchor="middle" fill="currentColor">${escaped}</text>
    </svg>`;
}

/**
 * Create a virtual glyph for an IPA character.
 */
function createVirtualGlyph(ipaChar: string, sourceIndex: number): RenderableGlyph {
    return {
        id: generateVirtualId(ipaChar),
        name: ipaChar,
        svg_data: generateVirtualSvg(ipaChar),
        isVirtual: true,
        ipaCharacter: ipaChar,
        sourceIndex,
    };
}

/**
 * Convert a Glyph to RenderableGlyph.
 */
function glyphToRenderable(glyph: Glyph, sourceIndex: number): RenderableGlyph {
    return {
        id: glyph.id,
        name: glyph.name,
        svg_data: glyph.svg_data,
        isVirtual: false,
        sourceIndex,
    };
}

/**
 * Detect the input type from the array.
 */
export function detectInputType(input: unknown[]): InputType | null {
    if (input.length === 0) {
        return null;
    }

    const first = input[0];

    // Check for SpellingDisplayEntry (has 'type' property with 'grapheme' or 'ipa')
    if (typeof first === 'object' && first !== null && 'type' in first) {
        const entry = first as SpellingDisplayEntry;
        if (entry.type === 'grapheme' || entry.type === 'ipa') {
            return 'spelling-display';
        }
    }

    // Check for GraphemeComplete (has 'glyphs' array property)
    if (typeof first === 'object' && first !== null && 'glyphs' in first && Array.isArray((first as GraphemeComplete).glyphs)) {
        return 'graphemes';
    }

    // Check for Glyph (has 'svg_data' property)
    if (typeof first === 'object' && first !== null && 'svg_data' in first) {
        return 'glyphs';
    }

    // Check for number (glyph ID)
    if (typeof first === 'number') {
        return 'ids';
    }

    return null;
}

/**
 * Normalize SpellingDisplayEntry[] to RenderableGlyph[].
 */
function normalizeSpellingDisplay(
    entries: SpellingDisplayEntry[],
    context: NormalizationContext
): RenderableGlyph[] {
    const result: RenderableGlyph[] = [];
    let glyphIndex = 0;

    for (const entry of entries) {
        if (entry.type === 'grapheme' && entry.grapheme) {
            // Look up full grapheme data if available
            const fullGrapheme = context.graphemeMap?.get(entry.grapheme.id);
            const glyphs = fullGrapheme?.glyphs ?? (entry.grapheme as GraphemeComplete).glyphs;

            if (glyphs && glyphs.length > 0) {
                for (const glyph of glyphs) {
                    result.push(glyphToRenderable(glyph, glyphIndex++));
                }
            }
        } else if (entry.type === 'ipa' && entry.ipaCharacter) {
            // Create virtual glyph for IPA character
            result.push(createVirtualGlyph(entry.ipaCharacter, glyphIndex++));
        }
    }

    return result;
}

/**
 * Normalize Glyph[] to RenderableGlyph[].
 */
function normalizeGlyphs(glyphs: Glyph[]): RenderableGlyph[] {
    return glyphs.map((glyph, index) => glyphToRenderable(glyph, index));
}

/**
 * Normalize GraphemeComplete[] to RenderableGlyph[].
 * Extracts all glyphs from all graphemes in order.
 */
function normalizeGraphemes(graphemes: GraphemeComplete[]): RenderableGlyph[] {
    const result: RenderableGlyph[] = [];
    let glyphIndex = 0;

    for (const grapheme of graphemes) {
        if (grapheme.glyphs) {
            for (const glyph of grapheme.glyphs) {
                result.push(glyphToRenderable(glyph, glyphIndex++));
            }
        }
    }

    return result;
}

/**
 * Normalize number[] (glyph IDs) to RenderableGlyph[].
 * Requires glyphMap in context.
 */
function normalizeIds(
    ids: number[],
    context: NormalizationContext
): RenderableGlyph[] {
    if (!context.glyphMap) {
        console.warn('normalizeIds: glyphMap is required but not provided');
        return [];
    }

    return ids
        .map((id, index) => {
            const glyph = context.glyphMap?.get(id);
            if (!glyph) {
                console.warn(`normalizeIds: Glyph with id ${id} not found in glyphMap`);
                return null;
            }
            // Handle both Glyph and RenderableGlyph in the map
            if ('isVirtual' in glyph) {
                return { ...glyph, sourceIndex: index } as RenderableGlyph;
            }
            return glyphToRenderable(glyph as Glyph, index);
        })
        .filter((g): g is RenderableGlyph => g !== null);
}

/**
 * Normalize any supported input format to RenderableGlyph[].
 *
 * @param input - Input data in any supported format
 * @param context - Context containing optional maps for resolution
 * @returns Array of normalized glyphs ready for rendering
 */
export function normalizeGlyphInput(
    input: SpellingDisplayEntry[] | Glyph[] | GraphemeComplete[] | number[],
    context: NormalizationContext = {}
): RenderableGlyph[] {
    if (!input || input.length === 0) {
        return [];
    }

    const inputType = detectInputType(input);

    switch (inputType) {
        case 'spelling-display':
            return normalizeSpellingDisplay(input as SpellingDisplayEntry[], context);
        case 'glyphs':
            return normalizeGlyphs(input as Glyph[]);
        case 'graphemes':
            return normalizeGraphemes(input as GraphemeComplete[]);
        case 'ids':
            return normalizeIds(input as number[], context);
        default:
            console.warn('normalizeGlyphInput: Unknown input type');
            return [];
    }
}
