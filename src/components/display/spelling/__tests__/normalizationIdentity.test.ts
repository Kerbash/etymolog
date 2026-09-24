/**
 * Normalization identity — no scheme ⇒ byte-identical output (BLOCK_SCRIPT_PLAN §4)
 * ---------------------------------------------------------------------------
 * The snapshot in `__snapshots__/` was RECORDED FROM THE PRE-BLOCK CODE (before
 * `normalizeSpellingDisplay` learned about block schemes) and must never be
 * regenerated to make a change pass: it is the proof that a script without an
 * enabled scheme renders exactly as it always has.
 *
 * Covered: every input format, grapheme entries resolved through the map and
 * through their own inline glyphs, multi-glyph graphemes, a PINNED entry
 * (ignored without a scheme, as before), IPA entries including the `.`
 * boundary (today drawn as a text glyph — phase 6 may hide it on the canvas),
 * structural roles, an empty IPA character and a glyph-less grapheme.
 */

import { describe, it, expect } from 'vitest';

import { normalizeGlyphInput } from '../utils/normalization';
import type { NormalizationContext, RenderableGlyph } from '../types';
import type { GraphemeComplete, SpellingDisplayEntry } from '../../../../db/types';
import { A, K, T, cvcScheme, gEntry, glyph, grapheme, ipa, mapOf } from './blockFixtures';

const EMPTY = grapheme({ id: 9, phoneme: 'x', glyphs: [] });
const INLINE = grapheme({ id: 8, phoneme: 'n', glyphs: [glyph(81, 'n-inline')] });

const ENTRIES: SpellingDisplayEntry[] = [
    gEntry(K, 0),
    gEntry(A, 1),
    gEntry(T, 2),
    ipa(' ', 3, 'word-separator'),
    gEntry(K, 4, 150), // pinned to the head variant
    ipa('.', 5),
    gEntry(A, 6),
    ipa('ə', 7),
    ipa('', 8),
    gEntry(EMPTY, 9),
    // Not in the map, but carries complete data inline (translator output shape).
    { type: 'grapheme', position: 10, grapheme: INLINE as GraphemeComplete },
    ipa('\n', 11, 'line-break'),
    ipa('!', 12, 'punctuation'),
];

const MAP = mapOf(K, A, T, EMPTY);

function run(context: NormalizationContext): Record<string, RenderableGlyph[]> {
    return {
        spelling: normalizeGlyphInput(ENTRIES, context),
        spellingWithoutMap: normalizeGlyphInput(ENTRIES, { ...context, graphemeMap: undefined }),
        glyphs: normalizeGlyphInput([glyph(1), glyph(2)], context),
        graphemes: normalizeGlyphInput([K, T], context),
        ids: normalizeGlyphInput([11, 99, 21], { ...context, glyphMap: new Map([[11, glyph(11)], [21, glyph(21)]]) }),
    };
}

describe('normalization without an enabled block scheme', () => {
    it('matches the output recorded from the pre-block code', () => {
        expect(run({ graphemeMap: MAP })).toMatchSnapshot();
    });

    it('matches the pre-block output as a raw JSON string (key order included — truly byte-identical)', () => {
        expect(JSON.stringify(run({ graphemeMap: MAP }))).toMatchSnapshot();
    });

    it.each([
        ['blockScheme: null', { blockScheme: null }],
        ['blockScheme: undefined', { blockScheme: undefined }],
        ['a DISABLED scheme with templates that would match', { blockScheme: cvcScheme(false) }],
    ] as const)('%s is byte-identical to no scheme at all', (_label, extra) => {
        const baseline = JSON.stringify(run({ graphemeMap: MAP }));
        expect(JSON.stringify(run({ graphemeMap: MAP, ...extra }))).toBe(baseline);
    });

    it('an ENABLED scheme never touches Glyph[], GraphemeComplete[], ids or renderables', () => {
        const baseline = run({ graphemeMap: MAP });
        const enabled = run({ graphemeMap: MAP, blockScheme: cvcScheme(true) });
        expect(enabled.glyphs).toEqual(baseline.glyphs);
        expect(enabled.graphemes).toEqual(baseline.graphemes);
        expect(enabled.ids).toEqual(baseline.ids);
        const renderables = baseline.glyphs;
        expect(normalizeGlyphInput(renderables, { graphemeMap: MAP, blockScheme: cvcScheme(true) })).toBe(renderables);
    });
});
