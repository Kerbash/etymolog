/**
 * Foreign-key enforcement tests
 *
 * Before Phase 1, `PRAGMA foreign_keys = ON` ran only in `createTables()` and
 * was silently reset by every `export()` — so every ON DELETE clause in the
 * schema was inert. These tests pin the pragma to the connection.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase, getDatabase, exportDatabaseBytes, countForeignKeyViolations } from '../database';
import { createGlyph } from '../glyphService';
import { createGrapheme } from '../graphemeService';
import { createLexicon } from '../lexiconService';

describe('foreign keys', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    it('are ON on the live connection', () => {
        expect(getDatabase().exec('PRAGMA foreign_keys')[0].values[0][0]).toBe(1);
    });

    it('stay ON across an export cycle', () => {
        exportDatabaseBytes();
        exportDatabaseBytes();
        expect(getDatabase().exec('PRAGMA foreign_keys')[0].values[0][0]).toBe(1);
    });

    it('RESTRICT: a glyph used by a grapheme cannot be deleted with raw SQL', () => {
        const glyph = createGlyph({ name: 'g', svg_data: '<svg/>' });
        createGrapheme({ name: 'gr', glyphs: [{ glyph_id: glyph.id, position: 0 }] });
        expect(() => getDatabase().run('DELETE FROM glyphs WHERE id = ?', [glyph.id])).toThrow(/FOREIGN KEY/);
    });

    it('CASCADE: deleting a grapheme removes its junction rows and phonemes', () => {
        const glyph = createGlyph({ name: 'g', svg_data: '<svg/>' });
        const grapheme = createGrapheme({
            name: 'gr',
            glyphs: [{ glyph_id: glyph.id, position: 0 }],
            phonemes: [{ phoneme: 'a' }],
        });
        const db = getDatabase();
        db.run('DELETE FROM graphemes WHERE id = ?', [grapheme.id]);
        expect(db.exec('SELECT COUNT(*) FROM grapheme_glyphs')[0].values[0][0]).toBe(0);
        expect(db.exec('SELECT COUNT(*) FROM phonemes')[0].values[0][0]).toBe(0);
    });

    it('CASCADE: deleting a word removes its closure rows', () => {
        const parent = createLexicon({ lemma: 'parent' });
        const child = createLexicon({ lemma: 'child', ancestry: [{ ancestor_id: parent.id, position: 0 }] });
        const db = getDatabase();
        expect(db.exec('SELECT COUNT(*) FROM lexicon_ancestry_closure')[0].values[0][0]).toBe(1);
        db.run('DELETE FROM lexicon_ancestry WHERE lexicon_id = ?', [child.id]);
        db.run('DELETE FROM lexicon WHERE id = ?', [child.id]);
        expect(db.exec('SELECT COUNT(*) FROM lexicon_ancestry_closure')[0].values[0][0]).toBe(0);
    });

    it('rejects an insert that references a missing parent', () => {
        expect(() => getDatabase().run(
            'INSERT INTO phonemes (grapheme_id, phoneme) VALUES (999, ?)', ['x'],
        )).toThrow(/FOREIGN KEY/);
    });

    it('reports zero violations on a consistent database', () => {
        const glyph = createGlyph({ name: 'g', svg_data: '<svg/>' });
        createGrapheme({ name: 'gr', glyphs: [{ glyph_id: glyph.id, position: 0 }] });
        expect(countForeignKeyViolations()).toBe(0);
    });
});
