/**
 * The translator composes blocks per WORD (BLOCK_SCRIPT_PLAN Phase 4)
 * ------------------------------------------------------------------
 * No translator code knows about blocks: `translatePhrase` emits the same
 * `SpellingDisplayEntry[]` as ever and the spelling display's normalization
 * composes them. What this pins is the contract between the two — word
 * separators, punctuation and line breaks carry a `role`, so they are
 * passthrough segments and a block can never merge the end of one word with
 * the start of the next.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import { initDatabase, clearDatabase } from '../../../../db/database';
import { glyphApi } from '../../../../db/api/glyphApi';
import { graphemeApi } from '../../../../db/api/graphemeApi';
import { lexiconApi } from '../../../../db/api/lexiconApi';
import { translatePhrase } from '../../../../db/phraseService';
import { normalizeGlyphInput } from '../../../display/spelling/utils/normalization';
import type { GraphemeComplete } from '../../../../db/types';
import type { BlockScheme } from '../../../../blocks';

const SCHEME: BlockScheme = {
    version: 1,
    enabled: true,
    roles: [
        { id: 'C1', label: 'Onset', matcher: { kind: 'class', letter: 'C' } },
        { id: 'V', label: 'Nucleus', matcher: { kind: 'class', letter: 'V' } },
    ],
    templates: [{
        id: 'cv',
        name: 'CV',
        pattern: ['C1', 'V'],
        slots: [
            { roleId: 'C1', groupId: null, x: 0, y: 0, w: 1, h: 0.5 },
            { roleId: 'V', groupId: null, x: 0, y: 0.5, w: 1, h: 0.5 },
        ],
    }],
};

function seed(phoneme: string): void {
    const glyph = glyphApi.create({ name: `${phoneme}-mark`, svg_data: `<svg viewBox="0 0 100 100"><path d="${phoneme}"/></svg>` });
    graphemeApi.create({
        name: phoneme,
        glyphs: [{ glyph_id: glyph.data!.id, position: 0 }],
        phonemes: [{ phoneme, use_in_auto_spelling: true }],
    });
}

function graphemeMap(): Map<number, GraphemeComplete> {
    return new Map(graphemeApi.getAllComplete().data!.graphemes.map((g) => [g.id, g]));
}

describe('translator output through block composition', () => {
    beforeAll(async () => {
        await initDatabase();
    });
    beforeEach(() => {
        clearDatabase();
        for (const p of ['k', 'a', 't']) seed(p);
    });

    it('each auto-spelled word composes into its own block; the separator passes through', () => {
        const map = graphemeMap();
        const result = translatePhrase('ka ta', [], { graphemeMap: map });
        expect(result.combinedSpelling.map((e) => e.role ?? e.type)).toEqual(['grapheme', 'grapheme', 'word-separator', 'grapheme', 'grapheme']);

        const out = normalizeGlyphInput(result.combinedSpelling, { graphemeMap: map, blockScheme: SCHEME });
        expect(out.map((g) => g.block?.templateId ?? g.role)).toEqual(['cv', 'word-separator', 'cv']);
        expect(out[0].block!.entryIndices).toEqual([0, 1]);
        expect(out[2].block!.entryIndices).toEqual([3, 4]);
    });

    it('a block never merges the end of one word with the start of the next', () => {
        const map = graphemeMap();
        // "k" then "a": C and V, adjacent but for the separator.
        const result = translatePhrase('k a', [], { graphemeMap: map });
        const out = normalizeGlyphInput(result.combinedSpelling, { graphemeMap: map, blockScheme: SCHEME });
        expect(out.some((g) => g.block)).toBe(false);
        expect(out.map((g) => g.role ?? g.name)).toEqual(['k-mark', 'word-separator', 'a-mark']);
    });

    it('punctuation and line breaks are passthrough too', () => {
        const map = graphemeMap();
        const result = translatePhrase('ka!\nta', [], { graphemeMap: map });
        const out = normalizeGlyphInput(result.combinedSpelling, { graphemeMap: map, blockScheme: SCHEME });
        expect(out.map((g) => g.block?.templateId ?? g.role)).toEqual(['cv', 'punctuation', 'line-break', 'cv']);
    });

    it('a word found in the lexicon composes from its stored spelling', () => {
        lexiconApi.create({ lemma: 'cat', pronunciation: 'ka', meanings: [{ meaning: 'cat' }] });
        const lexicon = lexiconApi.getAllComplete().data!.entries;
        const map = graphemeMap();
        const result = translatePhrase('cat', lexicon, { graphemeMap: map });
        expect(result.wordTranslations[0].type).toBe('lexicon');
        const out = normalizeGlyphInput(result.combinedSpelling, { graphemeMap: map, blockScheme: SCHEME });
        expect(out.map((g) => g.block?.templateId)).toEqual(['cv']);
    });

    it('with the scheme disabled the translation renders exactly as before', () => {
        const map = graphemeMap();
        const result = translatePhrase('ka ta', [], { graphemeMap: map });
        const off = normalizeGlyphInput(result.combinedSpelling, { graphemeMap: map, blockScheme: { ...SCHEME, enabled: false } });
        expect(off).toEqual(normalizeGlyphInput(result.combinedSpelling, { graphemeMap: map }));
        expect(off).toHaveLength(5);
    });
});
