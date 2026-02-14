import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase, getDatabase } from '../../database';
import { exportAsJson } from '../exportService';
import { importFromJson } from '../importService';
import { collectExportData } from '../jsonCodec';

describe('roundTrip (service layer)', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    it('should round-trip an empty database via JSON services', () => {
        const json1 = exportAsJson();
        importFromJson(json1);
        const json2 = exportAsJson();

        const data1 = JSON.parse(json1);
        const data2 = JSON.parse(json2);
        // Compare tables only (exportedAt will differ)
        expect(data2.tables).toEqual(data1.tables);
        expect(data2.settings).toEqual(data1.settings);
    });

    it('should round-trip a populated database via JSON services', () => {
        const db = getDatabase();
        db.run("INSERT INTO glyphs (name, svg_data, category) VALUES ('g1', '<svg>test</svg>', 'vowel')");
        db.run("INSERT INTO glyphs (name, svg_data) VALUES ('g2', '<svg>test2</svg>')");
        db.run("INSERT INTO graphemes (name, category) VALUES ('gr1', 'basic')");
        db.run("INSERT INTO grapheme_glyphs (grapheme_id, glyph_id, position) VALUES (1, 1, 0)");
        db.run("INSERT INTO grapheme_glyphs (grapheme_id, glyph_id, position) VALUES (1, 2, 1)");
        db.run("INSERT INTO phonemes (grapheme_id, phoneme, use_in_auto_spelling) VALUES (1, 'a', 1)");
        db.run("INSERT INTO lexicon (lemma, meaning, part_of_speech) VALUES ('hello', 'greeting', 'noun')");
        db.run("INSERT INTO lexicon_spelling (lexicon_id, grapheme_id, position) VALUES (1, 1, 0)");

        const before = collectExportData();
        const json = exportAsJson();

        // Wipe and re-import
        importFromJson(json);

        const after = collectExportData();
        for (const table of Object.keys(before.tables) as (keyof typeof before.tables)[]) {
            expect(after.tables[table]).toEqual(before.tables[table]);
        }
    });

    it('should report progress during import', () => {
        const json = exportAsJson();
        const stages: string[] = [];
        importFromJson(json, (stage) => { stages.push(stage); });
        expect(stages).toContain('validate');
        expect(stages).toContain('import');
        expect(stages).toContain('done');
    });
});
