/**
 * Query-count ratchet — the list endpoints must not regress to N+1.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { initDatabase, clearDatabase, getDatabase } from '../database';
import { createGlyph } from '../glyphService';
import {
    createGrapheme,
    getAllGraphemesComplete,
    getAllGraphemesWithGlyphs,
    getAllPhonemeGraphemeMappings,
    getGraphemeComplete,
} from '../graphemeService';
import { createVariant } from '../variantService';
import { createLexicon, getAllLexiconComplete, getLexiconComplete, getAllLexiconWithUsage } from '../lexiconService';
import { createGraphemeEntry } from '../utils/spellingUtils';

function countStatements(fn: () => void): number {
    const db = getDatabase();
    const exec = vi.spyOn(db, 'exec');
    const run = vi.spyOn(db, 'run');
    try {
        fn();
        return exec.mock.calls.length + run.mock.calls.length;
    } finally {
        exec.mockRestore();
        run.mockRestore();
    }
}

describe('query counts', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
        const graphemes = Array.from({ length: 12 }, (_, i) => {
            const glyph = createGlyph({ name: `g${i}`, svg_data: '<svg/>' });
            const grapheme = createGrapheme({ name: `gr${i}`, glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [{ phoneme: `p${i}`, use_in_auto_spelling: true }] });
            // Half of them carry extra forms, so a per-variant query would show.
            if (i % 2 === 0) {
                createVariant(grapheme.id, { name: 'alt', glyphs: [{ glyph_id: glyph.id, position: 0 }] });
                createVariant(grapheme.id, { name: 'alt2', glyphs: [{ glyph_id: glyph.id, position: 0 }, { glyph_id: glyph.id, position: 1 }] });
            }
            return grapheme;
        });
        let previous: number | null = null;
        for (let i = 0; i < 50; i++) {
            const order = [0, 1, 2].map(k => createGraphemeEntry(graphemes[(i + k) % graphemes.length].id));
            const word = createLexicon({
                lemma: `w${i}`,
                pronunciation: `p${i}`,
                glyph_order: order,
                meanings: [{ meaning: `m${i}` }, { meaning: `m${i}b` }],
                ancestry: previous === null ? [] : [{ ancestor_id: previous, position: 0 }],
            });
            previous = i % 5 === 0 ? word.id : previous;
        }
    });

    it('getAllLexiconComplete issues a constant number of statements', () => {
        let rows = 0;
        const statements = countStatements(() => {
            rows = getAllLexiconComplete().length;
        });
        expect(rows).toBe(50);
        expect(statements).toBeLessThanOrEqual(6);
    });

    it('getAllGraphemesComplete issues a constant number of statements', () => {
        let graphemes: ReturnType<typeof getAllGraphemesComplete> = [];
        const statements = countStatements(() => {
            graphemes = getAllGraphemesComplete();
        });
        expect(graphemes).toHaveLength(12);
        expect(graphemes.reduce((n, g) => n + g.variants!.length, 0)).toBe(12 + 6 * 2);
        // graphemes + variants-with-glyphs (ONE join; `glyphs` is derived from
        // its default entry, so loading variants did not add a statement) +
        // phonemes. The plan budgeted four; the variant loader subsumed the
        // old per-grapheme glyph loader, so it is three.
        expect(statements).toBe(3);
    });

    it('getAllGraphemesWithGlyphs is two statements, getGraphemeComplete three', () => {
        expect(countStatements(() => getAllGraphemesWithGlyphs())).toBe(2);
        const id = getAllGraphemesComplete()[0].id;
        // grapheme row, variants-with-glyphs, phonemes
        expect(countStatements(() => getGraphemeComplete(id))).toBe(3);
    });

    it('getLexiconComplete resolves its graphemes with one IN query', () => {
        const id = getAllLexiconComplete()[0].id;
        const statements = countStatements(() => {
            getLexiconComplete(id);
        });
        // lexicon row, graphemes IN, ancestors, descendants, meanings
        expect(statements).toBeLessThanOrEqual(5);
    });

    it('getAllLexiconWithUsage and the phoneme map are batched too', () => {
        expect(countStatements(() => getAllLexiconWithUsage())).toBeLessThanOrEqual(3);
        expect(countStatements(() => getAllPhonemeGraphemeMappings())).toBeLessThanOrEqual(5);
    });
});
