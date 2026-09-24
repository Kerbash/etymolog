/**
 * Logograms from EXISTING glyphs
 * ------------------------------
 * The word form's Logogram tab can make a word's spelling from a glyph already
 * in the script instead of a new drawing. Underneath it is the same system: a
 * phoneme-less, single-glyph `'logogram'` grapheme. What this pins:
 *
 *  - the glyph is WRAPPED, not copied (no new glyph row);
 *  - picking the same glyph again REUSES that logogram grapheme — one shared
 *    logogram, never a pile of duplicates;
 *  - a glyph that only appears inside a phonetic grapheme (or a multi-glyph
 *    one) is not "already a logogram": a new logogram grapheme is made;
 *  - drawing + glyph together, or neither, is rejected; a missing glyph fails;
 *  - the composite `lexicon.create({ symbol: { glyphId } })` spells the word
 *    with the logogram in one transaction, auto-spell off.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import {
    initDatabase,
    clearDatabase,
    createGlyph,
    createGrapheme,
    getGlyphCount,
    getGraphemeCount,
    getGraphemeComplete,
    createGraphemeEntry,
} from '../index';
import { createWordSymbol, logogramForGlyph, WORD_SYMBOL_CATEGORY } from '../wordSymbolService';
import { lexiconApi } from '../api/lexiconApi';
import { wordSymbolApi } from '../api/wordSymbolApi';

const SVG = '<svg viewBox="0 0 100 100"><path d="M10 10 L90 90" stroke="currentColor"/></svg>';

describe('Logograms from existing glyphs', () => {
    beforeAll(async () => {
        await initDatabase();
    });
    beforeEach(() => {
        clearDatabase();
    });

    it('wraps the glyph in a new logogram grapheme without copying it', () => {
        const glyph = createGlyph({ name: 'moon', svg_data: SVG });
        const glyphsBefore = getGlyphCount();

        const refs = createWordSymbol({ name: 'moon', glyphId: glyph.id });

        expect(refs.glyphId).toBe(glyph.id);
        expect(getGlyphCount()).toBe(glyphsBefore);
        const grapheme = getGraphemeComplete(refs.graphemeId);
        expect(grapheme?.category).toBe(WORD_SYMBOL_CATEGORY);
        expect(grapheme?.glyphs.map((g) => g.id)).toEqual([glyph.id]);
        expect(grapheme?.phonemes).toHaveLength(0);
    });

    it('reuses the logogram that already wraps the glyph', () => {
        const glyph = createGlyph({ name: 'moon', svg_data: SVG });
        const first = logogramForGlyph(glyph.id, 'moon');
        const graphemesAfterFirst = getGraphemeCount();

        const second = logogramForGlyph(glyph.id, 'lunar');

        expect(second.graphemeId).toBe(first.graphemeId);
        expect(getGraphemeCount()).toBe(graphemesAfterFirst);
    });

    it('does not mistake a phonetic or multi-glyph grapheme for the glyph\'s logogram', () => {
        const glyph = createGlyph({ name: 'ka', svg_data: SVG });
        const other = createGlyph({ name: 'dot', svg_data: SVG });
        // A phonetic grapheme using the glyph (it even carries the logogram category).
        const phonetic = createGrapheme({
            name: 'ka',
            category: WORD_SYMBOL_CATEGORY,
            glyphs: [{ glyph_id: glyph.id, position: 0 }],
            phonemes: [{ phoneme: 'ka', use_in_auto_spelling: true }],
        });
        // A two-glyph logogram that merely contains it.
        const pair = createGrapheme({
            name: 'ka-dot',
            category: WORD_SYMBOL_CATEGORY,
            glyphs: [{ glyph_id: glyph.id, position: 0 }, { glyph_id: other.id, position: 1 }],
        });

        const refs = logogramForGlyph(glyph.id, 'ka-word');

        expect(refs.graphemeId).not.toBe(phonetic.id);
        expect(refs.graphemeId).not.toBe(pair.id);
        expect(getGraphemeComplete(refs.graphemeId)?.glyphs.map((g) => g.id)).toEqual([glyph.id]);
    });

    it('rejects a drawing AND a glyph, and a missing glyph', () => {
        const glyph = createGlyph({ name: 'moon', svg_data: SVG });
        expect(() => createWordSymbol({ name: 'x', svgData: SVG, glyphId: glyph.id })).toThrow(/not both/i);
        expect(() => createWordSymbol({ name: 'x', glyphId: 99999 })).toThrow(/not found/i);
    });

    it('the api validates the one-source rule', () => {
        const glyph = createGlyph({ name: 'moon', svg_data: SVG });
        expect(wordSymbolApi.create({ name: 'x' }).success).toBe(false);
        expect(wordSymbolApi.create({ name: 'x', svgData: SVG, glyphId: glyph.id }).success).toBe(false);

        const ok = wordSymbolApi.create({ name: 'moon', glyphId: glyph.id });
        expect(ok.success).toBe(true);
        expect(ok.data?.glyphId).toBe(glyph.id);
    });

    it('lexicon.create with symbol.glyphId spells the word with that logogram, auto-spell off', () => {
        const glyph = createGlyph({ name: 'moon', svg_data: SVG });
        const glyphsBefore = getGlyphCount();

        const result = lexiconApi.create({
            meanings: [{ meaning: 'moon' }],
            auto_spell: true,
            symbol: { glyphId: glyph.id },
        });

        expect(result.success).toBe(true);
        expect(result.data!.auto_spell).toBe(false);
        const [entry] = JSON.parse(result.data!.glyph_order) as string[];
        const graphemeId = Number(entry.replace('grapheme-', ''));
        expect(entry).toBe(createGraphemeEntry(graphemeId));
        expect(getGraphemeComplete(graphemeId)?.glyphs.map((g) => g.id)).toEqual([glyph.id]);
        expect(getGlyphCount()).toBe(glyphsBefore);

        // A second word picking the same glyph shares the SAME logogram.
        const again = lexiconApi.create({ meanings: [{ meaning: 'lunar' }], symbol: { glyphId: glyph.id } });
        expect(again.data!.glyph_order).toBe(result.data!.glyph_order);
    });
});
