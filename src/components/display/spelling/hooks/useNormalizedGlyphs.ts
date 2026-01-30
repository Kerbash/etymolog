/**
 * useNormalizedGlyphs Hook
 *
 * Memoized hook for normalizing glyph input data.
 *
 * @module display/spelling/hooks/useNormalizedGlyphs
 */

import { useMemo } from 'react';
import type { Glyph, GraphemeComplete, SpellingDisplayEntry } from '../../../../db/types';
import type { RenderableGlyph, NormalizationContext } from '../types';
import { normalizeGlyphInput } from '../utils/normalization';

/**
 * Hook to normalize various input formats to RenderableGlyph[].
 *
 * Memoizes the result based on input and context changes.
 *
 * @param input - Input data in any supported format
 * @param context - Context containing optional maps for resolution
 * @returns Array of normalized glyphs ready for rendering
 */
export function useNormalizedGlyphs(
    input: SpellingDisplayEntry[] | Glyph[] | GraphemeComplete[] | number[],
    context: NormalizationContext = {}
): RenderableGlyph[] {
    return useMemo(
        () => normalizeGlyphInput(input, context),
        [input, context.glyphMap, context.graphemeMap]
    );
}
