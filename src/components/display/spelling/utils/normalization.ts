/**
 * Input Normalization Utilities
 *
 * Functions to convert various input formats to RenderableGlyph[].
 *
 * A grapheme expands to N renderable glyphs, so indices in the OUTPUT are not
 * indices in the INPUT. Two fields keep the relationship explicit:
 *   - `sourceIndex` — the index of the input entry a glyph came from
 *   - `role`        — copied from `SpellingDisplayEntry.role`, so layout
 *                     strategies can find separators and line breaks without
 *                     being handed index arrays computed in the wrong space
 *
 * @module display/spelling/utils/normalization
 */

import type { Glyph, GraphemeComplete, SpellingDisplayEntry } from '../../../../db/types';
import type { RenderableGlyph, NormalizationContext, InputType } from '../types';
import { generateVirtualGlyphId } from '../../../../db/utils/virtualGlyph';

/**
 * Generate SVG data for a virtual IPA glyph.
 * Creates a simple text display of the IPA character.
 */
function generateVirtualSvg(ipaChar: string): string {
    const escaped = ipaChar
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <text x="50" y="60" font-family="serif" font-size="48" text-anchor="middle" fill="currentColor">${escaped}</text>
    </svg>`;
}

function createVirtualGlyph(ipaChar: string, sourceIndex: number, role?: SpellingDisplayEntry['role']): RenderableGlyph {
    return {
        id: generateVirtualGlyphId(ipaChar),
        name: ipaChar,
        svg_data: generateVirtualSvg(ipaChar),
        isVirtual: true,
        ipaCharacter: ipaChar,
        sourceIndex,
        ...(role ? { role } : {}),
    };
}

function glyphToRenderable(glyph: Glyph, sourceIndex: number, role?: SpellingDisplayEntry['role']): RenderableGlyph {
    return {
        id: glyph.id,
        name: glyph.name,
        svg_data: glyph.svg_data,
        isVirtual: false,
        sourceIndex,
        ...(role ? { role } : {}),
    };
}

/**
 * Detect the input type from the array.
 */
export function detectInputType(input: unknown[]): InputType | 'renderable' | null {
    if (input.length === 0) {
        return null;
    }

    const first = input[0];

    if (typeof first === 'object' && first !== null && 'type' in first) {
        const entry = first as SpellingDisplayEntry;
        if (entry.type === 'grapheme' || entry.type === 'ipa') {
            return 'spelling-display';
        }
    }

    if (typeof first === 'object' && first !== null && 'glyphs' in first && Array.isArray((first as GraphemeComplete).glyphs)) {
        return 'graphemes';
    }

    if (typeof first === 'object' && first !== null && 'isVirtual' in first && 'sourceIndex' in first) {
        return 'renderable';
    }

    if (typeof first === 'object' && first !== null && 'svg_data' in first) {
        return 'glyphs';
    }

    if (typeof first === 'number') {
        return 'ids';
    }

    return null;
}

/**
 * Normalize SpellingDisplayEntry[] to RenderableGlyph[].
 * `sourceIndex` is the index of the ENTRY each glyph came from.
 */
function normalizeSpellingDisplay(
    entries: SpellingDisplayEntry[],
    context: NormalizationContext
): RenderableGlyph[] {
    const result: RenderableGlyph[] = [];

    entries.forEach((entry, entryIndex) => {
        if (entry.type === 'grapheme' && entry.grapheme) {
            const fullGrapheme = context.graphemeMap?.get(entry.grapheme.id);
            const glyphs = fullGrapheme?.glyphs ?? (entry.grapheme as GraphemeComplete).glyphs;
            if (glyphs && glyphs.length > 0) {
                for (const glyph of glyphs) {
                    result.push(glyphToRenderable(glyph, entryIndex, entry.role));
                }
            }
        } else if (entry.type === 'ipa' && entry.ipaCharacter) {
            result.push(createVirtualGlyph(entry.ipaCharacter, entryIndex, entry.role));
        }
    });

    return result;
}

function normalizeGlyphs(glyphs: Glyph[]): RenderableGlyph[] {
    return glyphs.map((glyph, index) => glyphToRenderable(glyph, index));
}

function normalizeGraphemes(graphemes: GraphemeComplete[]): RenderableGlyph[] {
    const result: RenderableGlyph[] = [];
    graphemes.forEach((grapheme, graphemeIndex) => {
        for (const glyph of grapheme.glyphs ?? []) {
            result.push(glyphToRenderable(glyph, graphemeIndex));
        }
    });
    return result;
}

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
            if ('isVirtual' in glyph) {
                return { ...glyph, sourceIndex: index } as RenderableGlyph;
            }
            return glyphToRenderable(glyph as Glyph, index);
        })
        .filter((g): g is RenderableGlyph => g !== null);
}

/**
 * Normalize any supported input format to RenderableGlyph[].
 */
export function normalizeGlyphInput(
    input: SpellingDisplayEntry[] | Glyph[] | RenderableGlyph[] | GraphemeComplete[] | number[],
    context: NormalizationContext = {}
): RenderableGlyph[] {
    if (!input || input.length === 0) {
        return [];
    }

    switch (detectInputType(input)) {
        case 'spelling-display':
            return normalizeSpellingDisplay(input as SpellingDisplayEntry[], context);
        case 'renderable':
            return input as RenderableGlyph[];
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
