import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase, getDatabase } from '../../database';
import { collectExportData, exportDataToJson, parseAndValidateJson, importExportData } from '../jsonCodec';
import { APP_VERSION, EXPORT_SCHEMA_VERSION } from '../../../config/version';

describe('jsonCodec', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    function insertTestData() {
        const db = getDatabase();
        db.run("INSERT INTO glyphs (name, svg_data) VALUES ('g1', '<svg/>')");
        db.run("INSERT INTO graphemes (name) VALUES ('gr1')");
        db.run("INSERT INTO grapheme_glyphs (grapheme_id, glyph_id, position) VALUES (1, 1, 0)");
        db.run("INSERT INTO phonemes (grapheme_id, phoneme) VALUES (1, 'a')");
        db.run("INSERT INTO lexicon (lemma, meaning) VALUES ('word1', 'meaning1')");
        db.run("INSERT INTO lexicon_spelling (lexicon_id, grapheme_id, position) VALUES (1, 1, 0)");
        db.run("INSERT INTO lexicon_meanings (lexicon_id, meaning, definition_order) VALUES (1, 'meaning1', 0)");
        db.run("INSERT INTO lexicon (lemma, meaning) VALUES ('word2', 'meaning2')");
        db.run("INSERT INTO lexicon_ancestry (lexicon_id, ancestor_id, position) VALUES (2, 1, 0)");
        db.run("INSERT INTO lexicon_ancestry_closure (ancestor_id, descendant_id, depth) VALUES (1, 2, 1)");
    }

    describe('collectExportData', () => {
        it('should return valid structure with empty tables', () => {
            const data = collectExportData();
            expect(data.magic).toBe('ETYMOLOG_EXPORT');
            expect(data.version).toBe(1);
            expect(data.tables.glyphs).toEqual([]);
            expect(data.tables.graphemes).toEqual([]);
            expect(data.settings).toBeDefined();
        });

        it('should return correct row counts with data', () => {
            insertTestData();
            const data = collectExportData();
            expect(data.tables.glyphs).toHaveLength(1);
            expect(data.tables.graphemes).toHaveLength(1);
            expect(data.tables.grapheme_glyphs).toHaveLength(1);
            expect(data.tables.phonemes).toHaveLength(1);
            expect(data.tables.lexicon).toHaveLength(2);
            expect(data.tables.lexicon_spelling).toHaveLength(1);
            expect(data.tables.lexicon_ancestry).toHaveLength(1);
            expect(data.tables.lexicon_ancestry_closure).toHaveLength(1);
        });
    });

    describe('parseAndValidateJson', () => {
        it('should reject invalid JSON', () => {
            expect(() => parseAndValidateJson('{')).toThrow('Invalid JSON');
        });

        it('should reject wrong magic', () => {
            expect(() => parseAndValidateJson('{"magic":"WRONG"}')).toThrow('Not an Etymolog export file');
        });

        it('should reject wrong version', () => {
            expect(() => parseAndValidateJson('{"magic":"ETYMOLOG_EXPORT","version":99}')).toThrow('Unsupported export version: 99');
        });

        it('should reject missing tables', () => {
            const data = { magic: 'ETYMOLOG_EXPORT', version: 1, tables: {}, settings: {} };
            expect(() => parseAndValidateJson(JSON.stringify(data))).toThrow('Missing table');
        });

        it('should reject non-array table', () => {
            const tables: Record<string, unknown> = {};
            for (const t of ['glyphs', 'graphemes', 'grapheme_glyphs', 'phonemes', 'lexicon', 'lexicon_spelling', 'lexicon_ancestry', 'lexicon_ancestry_closure']) {
                tables[t] = [];
            }
            tables.glyphs = 'not an array';
            const data = { magic: 'ETYMOLOG_EXPORT', version: 1, tables, settings: {} };
            expect(() => parseAndValidateJson(JSON.stringify(data))).toThrow('Table glyphs is not an array');
        });

        it('should reject missing settings', () => {
            const tables: Record<string, unknown> = {};
            for (const t of ['glyphs', 'graphemes', 'grapheme_glyphs', 'phonemes', 'lexicon', 'lexicon_spelling', 'lexicon_ancestry', 'lexicon_ancestry_closure']) {
                tables[t] = [];
            }
            const data = { magic: 'ETYMOLOG_EXPORT', version: 1, tables };
            expect(() => parseAndValidateJson(JSON.stringify(data))).toThrow('Missing settings');
        });

        it('should accept valid export data', () => {
            insertTestData();
            const exported = collectExportData();
            const json = exportDataToJson(exported);
            const parsed = parseAndValidateJson(json);
            expect(parsed.magic).toBe('ETYMOLOG_EXPORT');
            expect(parsed.tables.glyphs).toHaveLength(1);
        });
    });

    describe('round-trip', () => {
        it('should preserve data through export → import → export cycle', async () => {
            insertTestData();
            const data1 = collectExportData();
            const json1 = exportDataToJson(data1);
            const parsed = parseAndValidateJson(json1);

            await importExportData(parsed);

            const data2 = collectExportData();

            // Compare table contents (ignoring exportedAt timestamp)
            for (const table of Object.keys(data1.tables) as (keyof typeof data1.tables)[]) {
                expect(data2.tables[table]).toEqual(data1.tables[table]);
            }
        });

        it('should handle empty database round-trip', async () => {
            const data1 = collectExportData();
            const json = exportDataToJson(data1);
            await importExportData(parseAndValidateJson(json));
            const data2 = collectExportData();

            for (const table of Object.keys(data1.tables) as (keyof typeof data1.tables)[]) {
                expect(data2.tables[table]).toEqual(data1.tables[table]);
            }
        });
    });

    describe('version stamping', () => {
        it('should stamp the current schema version and app version into exports', () => {
            const data = collectExportData();
            expect(data.version).toBe(EXPORT_SCHEMA_VERSION);
            expect(data.appVersion).toBe(APP_VERSION);
        });

        it('should accept exports without appVersion (older builds)', () => {
            const data = { ...collectExportData() };
            delete (data as { appVersion?: string }).appVersion;
            const json = JSON.stringify(data);
            const parsed = parseAndValidateJson(json);
            expect(parsed.appVersion).toBeUndefined();
        });
    });

    describe('legacy migration: lexicon_meanings missing from export', () => {
        // Pre-multi-meanings exports stored definitions only on lexicon.meaning.
        // The import path must back-fill lexicon_meanings from that legacy column.
        it('should back-fill lexicon_meanings from lexicon.meaning when key is missing', async () => {
            const db = getDatabase();
            db.run("INSERT INTO lexicon (lemma, meaning) VALUES ('legacy1', 'old meaning A')");
            db.run("INSERT INTO lexicon (lemma, meaning) VALUES ('legacy2', 'old meaning B')");
            db.run("INSERT INTO lexicon (lemma, meaning) VALUES ('blank', NULL)");

            const data = collectExportData();
            // Simulate an old export: drop the lexicon_meanings entries entirely.
            const legacyJson = JSON.stringify({ ...data, tables: { ...data.tables, lexicon_meanings: undefined } });

            // The validator must default missing lexicon_meanings to [] rather than throw.
            const parsed = parseAndValidateJson(legacyJson);
            expect(parsed.tables.lexicon_meanings).toEqual([]);

            await importExportData(parsed);

            const after = collectExportData();
            expect(after.tables.lexicon_meanings).toHaveLength(2);
            const meanings = after.tables.lexicon_meanings.map(m => m.meaning).sort();
            expect(meanings).toEqual(['old meaning A', 'old meaning B']);
        });
    });
});
