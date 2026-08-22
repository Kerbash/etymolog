/**
 * Regression tests for the defects found by the final fresh-eyes review.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase, getDatabase } from '../database';
import { createLocalStorageAdapter, LS_CURRENT_KEY, LS_PREVIOUS_KEY } from '../persistence';
import { crc32 } from '../exportImport/crc32';
import { parseAndValidateJson, importExportData } from '../exportImport/jsonCodec';
import { validateExportData } from '../exportImport/validateExport';
import { repairOrphans } from '../migrations/repair';
import { createGlyph } from '../glyphService';
import { createGrapheme, reorderGraphemeGlyphs, getGraphemeGlyphEntries } from '../graphemeService';
import { createLexicon, updateLexicon, getLexiconById, getLexiconComplete, getLexiconSpellingEntries, handleGraphemeDeletion } from '../lexiconService';
import { createGraphemeEntry } from '../utils/spellingUtils';

/** A Storage whose total content is capped, like a real browser's quota. */
function cappedStorage(maxChars: number): Storage {
    const store = new Map<string, string>();
    const total = () => [...store.values()].reduce((n, v) => n + v.length, 0);
    return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
            const without = total() - (store.get(k)?.length ?? 0);
            if (without + v.length > maxChars) {
                const err = new Error('quota');
                err.name = 'QuotaExceededError';
                throw err;
            }
            store.set(k, v);
        },
        removeItem: (k: string) => {
            store.delete(k);
        },
        clear: () => store.clear(),
        key: () => null,
        get length() {
            return store.size;
        },
    } as Storage;
}

describe('A1 — localStorage keeps saving past half the quota by giving up the backup', () => {
    it('drops the previous slot instead of failing forever', async () => {
        // 1 MB quota; a 600 KB payload fits alone but not twice.
        const storage = cappedStorage(1024 * 1024);
        const adapter = createLocalStorageAdapter(storage);
        const payload = () => new Uint8Array(450 * 1024).map((_, i) => i % 256); // ~600 KB base64

        const a = payload();
        await adapter.save({ bytes: a, crc: crc32(a), savedAt: '1', schemaVersion: 6 });
        expect(storage.getItem(LS_CURRENT_KEY)).not.toBeNull();

        const b = payload();
        b[0] = 7;
        await expect(adapter.save({ bytes: b, crc: crc32(b), savedAt: '2', schemaVersion: 6 })).resolves.toBeUndefined();
        expect((await adapter.load())!.savedAt).toBe('2');
        expect(storage.getItem(LS_PREVIOUS_KEY)).toBeNull();

        // And it keeps working on the next save too.
        const c = payload();
        c[1] = 9;
        await expect(adapter.save({ bytes: c, crc: crc32(c), savedAt: '3', schemaVersion: 6 })).resolves.toBeUndefined();
        expect((await adapter.load())!.savedAt).toBe('3');
    });

    it('still reports QUOTA when even a single payload cannot fit', async () => {
        const storage = cappedStorage(100 * 1024);
        const adapter = createLocalStorageAdapter(storage);
        const big = new Uint8Array(200 * 1024);
        await expect(adapter.save({ bytes: big, crc: 0, savedAt: '', schemaVersion: 6 })).rejects.toMatchObject({ code: 'QUOTA' });
    });
});

describe('A3 — import repairs dangling glyph_order references', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    function envelope() {
        return parseAndValidateJson(JSON.stringify({
            magic: 'ETYMOLOG_EXPORT',
            version: 1,
            exportedAt: '2026-01-01T00:00:00Z',
            conlangName: 'x',
            settings: {},
            tables: {
                glyphs: [{ id: 1, name: 'g', svg_data: '<svg/>', category: null, notes: null, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' }],
                graphemes: [{ id: 1, name: 'ka', category: null, notes: null, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' }],
                grapheme_glyphs: [{ id: 1, grapheme_id: 1, glyph_id: 1, position: 0, transform: null }],
                phonemes: [],
                lexicon: [{ id: 1, lemma: 'w', pronunciation: null, is_native: 1, auto_spell: 1, meaning: null, part_of_speech: null, notes: null, glyph_order: '["grapheme-1","grapheme-99","a"]', needs_attention: 0, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' }],
                lexicon_spelling: [{ id: 1, lexicon_id: 1, grapheme_id: 1, position: 0 }, { id: 2, lexicon_id: 1, grapheme_id: 99, position: 1 }],
                lexicon_meanings: [],
                lexicon_ancestry: [],
                lexicon_ancestry_closure: [],
            },
        }));
    }

    it('replaces the missing grapheme, flags the word and warns', () => {
        const validated = validateExportData(envelope());
        const word = validated.tables.lexicon[0];
        expect(word.glyph_order).toBe(JSON.stringify(['grapheme-1', '?', 'a']));
        expect(word.needs_attention).toBe(1);
        expect(validated.report.warnings.some(w => w.includes('missing grapheme'))).toBe(true);
    });

    it('leaves the imported word editable', async () => {
        await importExportData(envelope());
        const before = getLexiconById(1)!;
        expect(before.needs_attention).toBe(true);
        // This used to throw FOREIGN KEY constraint failed on the spelling resync.
        expect(() => updateLexicon(1, { notes: 'edited' })).not.toThrow();
        expect(getLexiconComplete(1)!.spellingDisplay.map(e => e.grapheme?.id ?? e.ipaCharacter)).toEqual([1, '?', 'a']);
    });
});

describe('D5 / D7 / D8 — service-level fixes', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    it('repairOrphans rebuilds the spelling index after rewriting glyph_order', () => {
        const glyph = createGlyph({ name: 'g', svg_data: '<svg/>' });
        const ka = createGrapheme({ name: 'ka', glyphs: [{ glyph_id: glyph.id, position: 0 }] });
        const word = createLexicon({ lemma: 'w', glyph_order: [createGraphemeEntry(ka.id), 'x', createGraphemeEntry(ka.id)] });
        const db = getDatabase();
        // Simulate a dangling reference written by an old build.
        db.run('UPDATE lexicon SET glyph_order = ? WHERE id = ?', [JSON.stringify(['grapheme-999', 'x', createGraphemeEntry(ka.id)]), word.id]);

        repairOrphans(db);

        expect(getLexiconById(word.id)!.glyph_order).toBe(JSON.stringify(['?', 'x', createGraphemeEntry(ka.id)]));
        expect(getLexiconSpellingEntries(word.id).map(e => [e.grapheme_id, e.position])).toEqual([[ka.id, 2]]);
    });

    it('handleGraphemeDeletion keeps an existing review flag on an auto-spelled word', () => {
        const glyph = createGlyph({ name: 'g', svg_data: '<svg/>' });
        const ka = createGrapheme({ name: 'ka', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [{ phoneme: 'ka', use_in_auto_spelling: true }] });
        const word = createLexicon({ lemma: 'w', glyph_order: [createGraphemeEntry(ka.id)], auto_spell: true });
        updateLexicon(word.id, { needs_attention: true });

        handleGraphemeDeletion(ka.id, 'ka');

        expect(getLexiconById(word.id)!.needs_attention).toBe(true);
    });

    it('reorderGraphemeGlyphs keeps both occurrences of a repeated glyph', () => {
        const a = createGlyph({ name: 'a', svg_data: '<svg/>' });
        const b = createGlyph({ name: 'b', svg_data: '<svg/>' });
        const grapheme = createGrapheme({ name: 'aab', glyphs: [{ glyph_id: a.id, position: 0 }, { glyph_id: a.id, position: 1 }, { glyph_id: b.id, position: 2 }] });

        reorderGraphemeGlyphs(grapheme.id, [b.id, a.id, a.id]);

        expect(getGraphemeGlyphEntries(grapheme.id).map(e => [e.glyph_id, e.position])).toEqual([[b.id, 0], [a.id, 1], [a.id, 2]]);
        expect(() => reorderGraphemeGlyphs(grapheme.id, [b.id, 999])).toThrow(/not part of grapheme/);
    });
});
