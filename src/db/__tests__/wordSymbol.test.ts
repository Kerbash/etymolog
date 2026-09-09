/**
 * Word-level symbols (Phase 3, UC-B1)
 * -----------------------------------
 * A "word symbol" is a whole-word logograph: one drawn/imported symbol backed
 * by a single-glyph `'logogram'` grapheme, with the word's `glyph_order` being
 * exactly that grapheme. The invariants pinned here:
 *
 *  - `createWordSymbol` makes the glyph + grapheme in ONE transaction, both
 *    stamped `'logogram'`, glyph linked at position 0;
 *  - `updateWordSymbolDrawing` re-draws the grapheme's single glyph;
 *  - the composite `lexicon.create({ symbol })` is fully atomic — a failure
 *    mid-transaction (a bad ancestry FK) leaves NO orphan glyph/grapheme;
 *  - an explicit spelling wins over the symbol shortcut;
 *  - the symbol name defaults to the word's display name;
 *  - symbol words are `auto_spell = 0` and, being phoneme-less, are inert to
 *    respelling and absent from the phoneme→grapheme chart map;
 *  - deleting the word leaves the grapheme; deleting the grapheme via the Script
 *    Maker flow runs `handleGraphemeDeletion` on the word.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import {
    initDatabase,
    clearDatabase,
    createGlyph,
    createGrapheme,
    getGlyphById,
    getGlyphCount,
    getGraphemeCount,
    getGraphemeComplete,
    getLexiconById,
    deleteLexicon,
    getLexiconEntriesUsingGrapheme,
    createGraphemeEntry,
    deserializeGlyphOrder,
} from '../index';
import {
    createWordSymbol,
    updateWordSymbolDrawing,
    wordSymbolGraphemeId,
    WORD_SYMBOL_CATEGORY,
} from '../wordSymbolService';
import { getAllPhonemeGraphemeMappings } from '../graphemeService';
import { respellAutoSpelledWords } from '../respellService';
import { getAutoSpelledLexiconMentioning } from '../lexiconService';
import { lexiconApi } from '../api/lexiconApi';
import { wordSymbolApi } from '../api/wordSymbolApi';
import { graphemeApi } from '../api/graphemeApi';

const SVG = '<svg viewBox="0 0 100 100"><path d="M10 10 L90 90" stroke="currentColor"/></svg>';
const SVG2 = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="currentColor"/></svg>';

describe('Word symbols', () => {
    beforeAll(async () => {
        await initDatabase();
    });
    beforeEach(() => {
        clearDatabase();
    });

    describe('createWordSymbol service', () => {
        it('creates a logogram glyph + grapheme linked at position 0', () => {
            const { glyphId, graphemeId } = createWordSymbol({ name: 'night', svgData: SVG });

            const glyph = getGlyphById(glyphId);
            expect(glyph?.category).toBe(WORD_SYMBOL_CATEGORY);
            expect(glyph?.svg_data).toContain('<svg');

            const grapheme = getGraphemeComplete(graphemeId);
            expect(grapheme?.category).toBe(WORD_SYMBOL_CATEGORY);
            expect(grapheme?.name).toBe('night');
            expect(grapheme?.glyphs).toHaveLength(1);
            expect(grapheme?.glyphs[0].id).toBe(glyphId);
            expect(grapheme?.phonemes).toHaveLength(0);
        });

        it('rejects a blank name or empty svg', () => {
            expect(() => createWordSymbol({ name: '   ', svgData: SVG })).toThrow(/name/i);
            expect(() => createWordSymbol({ name: 'x', svgData: '  ' })).toThrow(/drawing or an image/i);
        });
    });

    describe('updateWordSymbolDrawing service', () => {
        it("replaces the grapheme's single glyph svg", () => {
            const { glyphId, graphemeId } = createWordSymbol({ name: 'night', svgData: SVG });
            const refs = updateWordSymbolDrawing(graphemeId, SVG2);
            expect(refs.glyphId).toBe(glyphId);
            expect(getGlyphById(glyphId)?.svg_data).toContain('circle');
        });

        it('throws on a missing grapheme', () => {
            expect(() => updateWordSymbolDrawing(999999, SVG)).toThrow(/not found/i);
        });
    });

    describe('wordSymbolGraphemeId inference', () => {
        const cat = (map: Record<number, string | null>) => (id: number) => map[id] ?? null;

        it('recognises exactly one logogram grapheme', () => {
            const order = [createGraphemeEntry(7)];
            expect(wordSymbolGraphemeId(order, cat({ 7: WORD_SYMBOL_CATEGORY }))).toBe(7);
        });

        it('rejects a non-logogram, an IPA fallback, or multiple entries', () => {
            expect(wordSymbolGraphemeId([createGraphemeEntry(7)], cat({ 7: 'Vowels' }))).toBeNull();
            expect(wordSymbolGraphemeId(['ə'], cat({}))).toBeNull();
            expect(
                wordSymbolGraphemeId([createGraphemeEntry(7), createGraphemeEntry(8)], cat({ 7: WORD_SYMBOL_CATEGORY, 8: WORD_SYMBOL_CATEGORY })),
            ).toBeNull();
        });
    });

    describe('api.wordSymbol', () => {
        it('creates and re-draws through the ApiResponse envelope', () => {
            const created = wordSymbolApi.create({ name: 'sun', svgData: SVG });
            expect(created.success).toBe(true);
            const { graphemeId, glyphId } = created.data!;

            const updated = wordSymbolApi.updateDrawing({ graphemeId, svgData: SVG2 });
            expect(updated.success).toBe(true);
            expect(getGlyphById(glyphId)?.svg_data).toContain('circle');
        });

        it('validates empty inputs and reports a missing grapheme', () => {
            expect(wordSymbolApi.create({ name: '', svgData: SVG }).error?.code).toBe('VALIDATION_ERROR');
            expect(wordSymbolApi.create({ name: 'x', svgData: '' }).error?.code).toBe('VALIDATION_ERROR');
            const res = wordSymbolApi.updateDrawing({ graphemeId: 999999, svgData: SVG });
            expect(res.success).toBe(false);
            expect(res.error?.code).toBe('NOT_FOUND');
        });
    });

    describe('composite lexicon.create with a symbol', () => {
        it('creates a symbol word: glyph_order is the one logogram, auto_spell off', () => {
            const res = lexiconApi.create({
                is_native: true,
                auto_spell: true, // request asks for it; the symbol path forces it off
                meanings: [{ meaning: 'boredom' }],
                symbol: { svgData: SVG },
            });
            expect(res.success).toBe(true);
            const word = res.data!;

            const order = deserializeGlyphOrder(word.glyph_order);
            expect(order).toHaveLength(1);
            const gid = wordSymbolGraphemeId(order, (id) => getGraphemeComplete(id)?.category ?? null);
            expect(gid).not.toBeNull();
            expect(word.auto_spell).toBe(false);
            expect(getGraphemeCount()).toBe(1);
            expect(getGlyphCount()).toBe(1);
        });

        it('defaults the symbol name to the display name (pronunciation, then meaning)', () => {
            const byPron = lexiconApi.create({ pronunciation: 'kato', symbol: { svgData: SVG } });
            const gidPron = deserializeGlyphOrder(byPron.data!.glyph_order)[0];
            expect(getGraphemeComplete(Number(gidPron.replace('grapheme-', '')))?.name).toBe('kato');

            const byMeaning = lexiconApi.create({ meanings: [{ meaning: 'night' }], symbol: { svgData: SVG } });
            const gidMean = deserializeGlyphOrder(byMeaning.data!.glyph_order)[0];
            expect(getGraphemeComplete(Number(gidMean.replace('grapheme-', '')))?.name).toBe('night');
        });

        it('honours an explicit symbol name over the display name', () => {
            const res = lexiconApi.create({
                meanings: [{ meaning: 'night' }],
                symbol: { name: 'NIGHT-glyph', svgData: SVG },
            });
            const gid = deserializeGlyphOrder(res.data!.glyph_order)[0];
            expect(getGraphemeComplete(Number(gid.replace('grapheme-', '')))?.name).toBe('NIGHT-glyph');
        });

        it('lets an explicit glyph_order win over the symbol shortcut', () => {
            const glyph = createGlyph({ name: 'g', svg_data: SVG });
            const grapheme = createGrapheme({ name: 'G', glyphs: [{ glyph_id: glyph.id, position: 0 }] });
            const before = getGraphemeCount();

            const res = lexiconApi.create({
                meanings: [{ meaning: 'x' }],
                glyph_order: [createGraphemeEntry(grapheme.id)],
                symbol: { svgData: SVG },
            });
            expect(res.success).toBe(true);
            // No NEW symbol grapheme was made — the explicit spelling was used.
            expect(getGraphemeCount()).toBe(before);
            expect(deserializeGlyphOrder(res.data!.glyph_order)).toEqual([createGraphemeEntry(grapheme.id)]);
        });

        it('is atomic: a mid-transaction failure leaves no orphan glyph/grapheme', () => {
            expect(getGlyphCount()).toBe(0);
            const res = lexiconApi.create({
                meanings: [{ meaning: 'boredom' }],
                symbol: { svgData: SVG },
                // A non-existent ancestor forces an FK failure INSIDE the word
                // insert transaction, after the symbol has been created.
                ancestry: [{ ancestor_id: 999999, position: 0 }],
            });
            expect(res.success).toBe(false);
            // The symbol create was rolled back with the word.
            expect(getGlyphCount()).toBe(0);
            expect(getGraphemeCount()).toBe(0);
        });
    });

    describe('downstream surfaces', () => {
        it('phoneme-less symbol graphemes are absent from the chart phoneme map, not crashing', () => {
            // A normal grapheme with a phoneme, plus a symbol grapheme with none.
            const glyph = createGlyph({ name: 'a_glyph', svg_data: SVG });
            const withPhoneme = createGrapheme({
                name: 'A',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'a', use_in_auto_spelling: true }],
            });
            const { graphemeId: symbolGid } = createWordSymbol({ name: 'sun', svgData: SVG });

            const map = getAllPhonemeGraphemeMappings();
            expect(map.get('a')?.id).toBe(withPhoneme.id);
            expect([...map.values()].some((g) => g.id === symbolGid)).toBe(false);

            // The chart api surface returns the same map without error.
            const apiMap = graphemeApi.getPhonemeMap();
            expect(apiMap.success).toBe(true);
        });

        it('a symbol word is not a respell candidate and survives a phoneme edit', () => {
            // A real grapheme whose phoneme a normal word uses.
            const glyph = createGlyph({ name: 'k_glyph', svg_data: SVG });
            createGrapheme({
                name: 'K',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'k', use_in_auto_spelling: true }],
            });
            const symbolWord = lexiconApi.create({
                pronunciation: 'ka', // has a pronunciation, but is a SYMBOL word
                symbol: { svgData: SVG },
            }).data!;
            const before = getLexiconById(symbolWord.id)!.glyph_order;

            // Symbol words are auto_spell=0, so they never appear as candidates…
            const candidates = getAutoSpelledLexiconMentioning(['k']);
            expect(candidates.some((c) => c.id === symbolWord.id)).toBe(false);

            // …and a respell pass leaves the hand-placed logogram spelling intact.
            respellAutoSpelledWords(['k']);
            expect(getLexiconById(symbolWord.id)!.glyph_order).toBe(before);
        });
    });

    describe('lifecycle', () => {
        it('deleting the word leaves the symbol grapheme in place', () => {
            const word = lexiconApi.create({ meanings: [{ meaning: 'night' }], symbol: { svgData: SVG } }).data!;
            const gid = Number(deserializeGlyphOrder(word.glyph_order)[0].replace('grapheme-', ''));
            expect(deleteLexicon(word.id)).toBe(true);
            expect(getLexiconById(word.id)).toBeNull();
            // The grapheme is a reusable script unit — it outlives the word.
            expect(getGraphemeComplete(gid)).not.toBeNull();
        });

        it('deleting the symbol grapheme via Script Maker flags the manual word', () => {
            const word = lexiconApi.create({ meanings: [{ meaning: 'night' }], symbol: { svgData: SVG } }).data!;
            const gid = Number(deserializeGlyphOrder(word.glyph_order)[0].replace('grapheme-', ''));

            // The word still spells with it, so a plain delete is refused…
            expect(graphemeApi.delete(gid).success).toBe(false);
            expect(getLexiconEntriesUsingGrapheme(gid).some((l) => l.id === word.id)).toBe(true);

            // …and the respell-through delete runs handleGraphemeDeletion: the
            // manual (auto_spell=0) word is flagged for attention, not silently
            // corrupted.
            const del = graphemeApi.delete(gid, { respellLexicon: true });
            expect(del.success).toBe(true);
            expect(getLexiconById(word.id)?.needs_attention).toBe(true);
        });
    });
});
