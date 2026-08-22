/**
 * Spelling source-of-truth tests
 *
 * `glyph_order` is the ONLY spelling writers touch; `lexicon_spelling` is a
 * derived index with one row per grapheme occurrence. Before Phase 2,
 * `setLexiconSpelling` / `applyAutoSpelling` wrote the index only — so the
 * displayed spelling never changed and the next `updateLexicon` wiped the
 * index again.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase } from '../database';
import { createGlyph } from '../glyphService';
import { createGrapheme } from '../graphemeService';
import {
    createLexicon,
    getLexiconComplete,
    getLexiconSpellingEntries,
    getSpellingByLexiconId,
    setLexiconSpelling,
    addSpellingToLexicon,
    clearLexiconSpelling,
    updateLexicon,
    getLexiconEntriesUsingGrapheme,
} from '../lexiconService';
import { lexiconApi } from '../api/lexiconApi';
import { createGraphemeEntry } from '../utils/spellingUtils';

function makeGrapheme(name: string, phoneme: string) {
    const glyph = createGlyph({ name: `${name}-glyph`, svg_data: '<svg/>' });
    return createGrapheme({ name, glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [{ phoneme, use_in_auto_spelling: true }] });
}

describe('spelling source of truth', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    it('setLexiconSpelling changes the displayed spelling', () => {
        const ka = makeGrapheme('ka', 'ka');
        const to = makeGrapheme('to', 'to');
        const word = createLexicon({ lemma: 'kato', glyph_order: [createGraphemeEntry(ka.id)] });

        setLexiconSpelling(word.id, [{ grapheme_id: to.id, position: 1 }, { grapheme_id: ka.id, position: 0 }]);

        const complete = getLexiconComplete(word.id)!;
        expect(complete.glyph_order).toBe(JSON.stringify([createGraphemeEntry(ka.id), createGraphemeEntry(to.id)]));
        expect(complete.spellingDisplay.map(e => e.grapheme?.name)).toEqual(['ka', 'to']);
        expect(getLexiconSpellingEntries(word.id).map(e => [e.grapheme_id, e.position])).toEqual([[ka.id, 0], [to.id, 1]]);
    });

    it('api.lexicon.updateSpelling is visible through getByIdComplete', () => {
        const ka = makeGrapheme('ka', 'ka');
        const word = createLexicon({ lemma: 'w' });
        const res = lexiconApi.updateSpelling(word.id, { spelling: [{ grapheme_id: ka.id, position: 0 }] });
        expect(res.success).toBe(true);
        expect(lexiconApi.getByIdComplete(word.id).data?.spellingDisplay[0].grapheme?.id).toBe(ka.id);
    });

    it('applyAutoSpelling writes glyph_order and survives a later unrelated update', () => {
        const ka = makeGrapheme('ka', 'ka');
        const to = makeGrapheme('to', 'to');
        const word = createLexicon({ lemma: 'kato', pronunciation: 'kato' });

        const applied = lexiconApi.applyAutoSpelling(word.id);
        expect(applied.success).toBe(true);
        expect(getLexiconComplete(word.id)!.spellingDisplay.map(e => e.grapheme?.id)).toEqual([ka.id, to.id]);

        updateLexicon(word.id, { notes: 'unrelated edit' });
        expect(getLexiconComplete(word.id)!.spellingDisplay.map(e => e.grapheme?.id)).toEqual([ka.id, to.id]);
        expect(getLexiconSpellingEntries(word.id)).toHaveLength(2);
    });

    it('keeps duplicate graphemes as separate occurrences with true positions', () => {
        const ka = makeGrapheme('ka', 'ka');
        const word = createLexicon({ lemma: 'kaəka', glyph_order: [createGraphemeEntry(ka.id), 'ə', createGraphemeEntry(ka.id)] });

        expect(getSpellingByLexiconId(word.id).map(g => g.id)).toEqual([ka.id, ka.id]);
        expect(getLexiconSpellingEntries(word.id).map(e => e.position)).toEqual([0, 2]);
        const complete = getLexiconComplete(word.id)!;
        expect(complete.spellingDisplay.map(e => e.position)).toEqual([0, 1, 2]);
        expect(complete.hasIpaFallbacks).toBe(true);
    });

    it('addSpellingToLexicon inserts into glyph_order at the requested position', () => {
        const ka = makeGrapheme('ka', 'ka');
        const to = makeGrapheme('to', 'to');
        const word = createLexicon({ lemma: 'w', glyph_order: [createGraphemeEntry(ka.id)] });

        const row = addSpellingToLexicon(word.id, { grapheme_id: to.id, position: 0 });
        expect(row.position).toBe(0);
        expect(row.grapheme_id).toBe(to.id);
        expect(getLexiconComplete(word.id)!.spellingDisplay.map(e => e.grapheme?.name)).toEqual(['to', 'ka']);

        // Out-of-range positions clamp to the end.
        addSpellingToLexicon(word.id, { grapheme_id: ka.id, position: 99 });
        expect(getLexiconComplete(word.id)!.spellingDisplay.map(e => e.grapheme?.name)).toEqual(['to', 'ka', 'ka']);
    });

    it('clearLexiconSpelling empties glyph_order and the index', () => {
        const ka = makeGrapheme('ka', 'ka');
        const word = createLexicon({ lemma: 'w', glyph_order: [createGraphemeEntry(ka.id), createGraphemeEntry(ka.id)] });
        expect(clearLexiconSpelling(word.id)).toBe(2);
        expect(getLexiconComplete(word.id)!.glyph_order).toBe('[]');
        expect(getLexiconSpellingEntries(word.id)).toEqual([]);
    });

    it('the index answers "which words use this grapheme" after every writer', () => {
        const ka = makeGrapheme('ka', 'ka');
        const to = makeGrapheme('to', 'to');
        const w1 = createLexicon({ lemma: 'one', glyph_order: [createGraphemeEntry(ka.id)] });
        const w2 = createLexicon({ lemma: 'two' });
        setLexiconSpelling(w2.id, [{ grapheme_id: ka.id, position: 0 }]);
        updateLexicon(w1.id, { glyph_order: [createGraphemeEntry(to.id)] });

        expect(getLexiconEntriesUsingGrapheme(ka.id).map(l => l.id)).toEqual([w2.id]);
        expect(getLexiconEntriesUsingGrapheme(to.id).map(l => l.id)).toEqual([w1.id]);
    });

    it('rejects a spelling that references a missing grapheme and leaves the word untouched', () => {
        const ka = makeGrapheme('ka', 'ka');
        const word = createLexicon({ lemma: 'w', glyph_order: [createGraphemeEntry(ka.id)] });
        expect(() => setLexiconSpelling(word.id, [{ grapheme_id: 9999, position: 0 }])).toThrow(/FOREIGN KEY/);
        expect(getLexiconComplete(word.id)!.spellingDisplay[0].grapheme?.id).toBe(ka.id);
        expect(getLexiconSpellingEntries(word.id)).toHaveLength(1);
    });
});
