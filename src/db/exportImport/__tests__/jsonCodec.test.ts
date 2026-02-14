import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase, getDatabase } from '../../database';
import { getCurrentSettings } from '../../api/settingsApi';
import { collectExportData, exportDataToJson, parseAndValidateJson, importExportData } from '../jsonCodec';

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
        db.run("INSERT INTO lexicon_ancestry (lexicon_id, ancestor_id, position) VALUES (1, 1, 0)");
        db.run("INSERT INTO lexicon_ancestry_closure (ancestor_id, descendant_id, depth) VALUES (1, 1, 0)");
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
            expect(data.tables.lexicon).toHaveLength(1);
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
            const tables: any = {};
            for (const t of ['glyphs', 'graphemes', 'grapheme_glyphs', 'phonemes', 'lexicon', 'lexicon_spelling', 'lexicon_ancestry', 'lexicon_ancestry_closure']) {
                tables[t] = [];
            }
            tables.glyphs = 'not an array';
            const data = { magic: 'ETYMOLOG_EXPORT', version: 1, tables, settings: {} };
            expect(() => parseAndValidateJson(JSON.stringify(data))).toThrow('Table glyphs is not an array');
        });

        it('should reject missing settings', () => {
            const tables: any = {};
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
        it('should preserve data through export → import → export cycle', () => {
            insertTestData();
            const data1 = collectExportData();
            const json1 = exportDataToJson(data1);
            const parsed = parseAndValidateJson(json1);

            importExportData(parsed);

            const data2 = collectExportData();

            // Compare table contents (ignoring exportedAt timestamp)
            for (const table of Object.keys(data1.tables) as (keyof typeof data1.tables)[]) {
                expect(data2.tables[table]).toEqual(data1.tables[table]);
            }
        });

        it('should handle empty database round-trip', () => {
            const data1 = collectExportData();
            const json = exportDataToJson(data1);
            importExportData(parseAndValidateJson(json));
            const data2 = collectExportData();

            for (const table of Object.keys(data1.tables) as (keyof typeof data1.tables)[]) {
                expect(data2.tables[table]).toEqual(data1.tables[table]);
            }
        });
    });
});
