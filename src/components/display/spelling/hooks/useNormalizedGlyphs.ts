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
    input: SpellingDisplayEntry[] | Glyph[] | RenderableGlyph[] | GraphemeComplete[] | number[],
    context: NormalizationContext = {}
): RenderableGlyph[] {
    // The whole `context` object is the dependency, not its two fields: the
    // React compiler cannot match `context.glyphMap` in the dep list against
    // the `context` referenced in the body, and refuses to preserve the
    // memoization at all. Callers already memoize the object they pass
    // (`GlyphSpellingDisplay` builds it in a `useMemo`), so this is the same
    // number of recomputations, correctly declared.
    return useMemo(() => normalizeGlyphInput(input, context), [input, context]);
}
