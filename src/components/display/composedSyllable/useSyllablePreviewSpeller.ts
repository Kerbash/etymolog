/**
 * useSyllablePreviewSpeller — spell an EMPTY syllabary cell from existing signs.
 *
 * Returns a function `(consonant, vowel) => SpellingDisplayEntry[] | null`
 * while the script's block scheme is ENABLED (inside `EtymologProvider`), and
 * `null` otherwise — so a chart without blocks renders exactly as before and
 * does no spelling work at all.
 *
 * Built from the provider's in-memory graphemes (`useOptionalGraphemeMap`), not
 * the database: the phoneme map is derived once per grapheme refresh and each
 * cell is a pure DP over two or three characters. The function's identity
 * changes only when the scheme's `enabled` flag or the graphemes change, so a
 * chart can list it as a memo dependency.
 *
 * @module display/composedSyllable/useSyllablePreviewSpeller
 */

import { useMemo } from 'react';

import { useOptionalBlockScheme, useOptionalGraphemeMap } from '../../../db/context/useOptionalBlockScheme';
import { autoSpellMappingsFromGraphemes } from '../../../db/autoSpellService';
import { spellSyllablePreview } from '../../../db/phraseService';
import type { SpellingDisplayEntry } from '../../../db/types';

export type SyllablePreviewSpeller = (consonant: string, vowel: string) => SpellingDisplayEntry[] | null;

export function useSyllablePreviewSpeller(): SyllablePreviewSpeller | null {
    const scheme = useOptionalBlockScheme();
    const graphemeMap = useOptionalGraphemeMap();
    const enabled = scheme !== null && scheme.enabled;

    return useMemo(() => {
        if (!enabled || !graphemeMap || graphemeMap.size === 0) return null;
        const mappings = autoSpellMappingsFromGraphemes(graphemeMap.values());
        return (consonant: string, vowel: string) => spellSyllablePreview(consonant, vowel, mappings, graphemeMap);
    }, [enabled, graphemeMap]);
}
