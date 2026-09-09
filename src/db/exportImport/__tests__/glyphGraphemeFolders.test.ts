/**
 * Glyph + grapheme folder export/import + create-with-folder_id (Phase 1)
 * -----------------------------------------------------------------------
 * `glyph_folders` / `grapheme_folders` + `glyphs.folder_id` /
 * `graphemes.folder_id` arrived at schema v8 / export version 3. This suite
 * proves:
 *
 *  - the create API files a new glyph/grapheme into a folder and rejects a
 *    dangling folder_id;
 *  - a v3 export carries the two new folder tables and their assignments, and a
 *    full serialize → parse → import → export cycle reproduces them;
 *  - a hand-crafted v2 envelope (lexicon folders only, no glyph/grapheme ones)
 *    still imports — with empty glyph/grapheme folders and null folder_id;
 *  - a corrupt v3 envelope whose glyph/grapheme points at a missing folder
 *    imports with that folder_id nulled rather than failing the FK check.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase, getDatabase, getGlyphById, getGraphemeById } from '../../index';
import { etymologApi } from '../../api';
import { exportAsJson } from '../exportService';
import { importFromJson } from '../importService';
import { collectExportData, parseAndValidateJson, importExportData } from '../jsonCodec';
import { EXPORT_SCHEMA_VERSION } from '../../../config/version';

describe('glyph + grapheme folders', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    describe('create-with-folder_id (API)', () => {
        it('files a new glyph into an existing glyph folder', () => {
            const folder = etymologApi.glyphFolder.create({ name: 'Shapes' });
            expect(folder.success).toBe(true);
            const created = etymologApi.glyph.create({ name: 'circle', svg_data: '<svg/>', folder_id: folder.data!.id });
            expect(created.success).toBe(true);
            expect(getGlyphById(created.data!.id)!.folder_id).toBe(folder.data!.id);
        });

        it('files a new grapheme into an existing grapheme folder', () => {
            const glyph = etymologApi.glyph.create({ name: 'g', svg_data: '<svg/>' });
            const folder = etymologApi.graphemeFolder.create({ name: 'Consonants' });
            const created = etymologApi.grapheme.create({
                name: 'k',
                glyphs: [{ glyph_id: glyph.data!.id, position: 0 }],
                folder_id: folder.data!.id,
            });
            expect(created.success).toBe(true);
            expect(getGraphemeById(created.data!.id)!.folder_id).toBe(folder.data!.id);
        });

        it('rejects a create pointing at a non-existent folder (glyph and grapheme)', () => {
            const g = etymologApi.glyph.create({ name: 'x', svg_data: '<svg/>', folder_id: 999 });
            expect(g.success).toBe(false);
            expect(g.error?.code).toBe('VALIDATION_ERROR');

            const glyph = etymologApi.glyph.create({ name: 'g', svg_data: '<svg/>' });
            const gr = etymologApi.grapheme.create({
                name: 'k',
                glyphs: [{ glyph_id: glyph.data!.id, position: 0 }],
                folder_id: 999,
            });
            expect(gr.success).toBe(false);
            expect(gr.error?.code).toBe('VALIDATION_ERROR');
        });

        it('word-symbol auto-created glyph + grapheme land at ROOT (folder_id null)', () => {
            const res = etymologApi.wordSymbol.create({ name: 'sun', svgData: '<svg><circle/></svg>' });
            expect(res.success).toBe(true);
            expect(getGlyphById(res.data!.glyphId)!.folder_id).toBe(null);
            expect(getGraphemeById(res.data!.graphemeId)!.folder_id).toBe(null);
        });
    });

    /** A glyph folder + filed glyph, and a grapheme folder + filed grapheme. */
    function seedGlyphGraphemeFolders() {
        const db = getDatabase();
        db.run("INSERT INTO glyph_folders (id, name, parent_id, position) VALUES (1, 'Shapes', NULL, 0)");
        db.run("INSERT INTO glyph_folders (id, name, parent_id, position) VALUES (2, 'Round', 1, 0)");
        db.run("INSERT INTO glyphs (id, name, svg_data, folder_id) VALUES (1, 'circle', '<svg/>', 2)");
        db.run("INSERT INTO glyphs (id, name, svg_data, folder_id) VALUES (2, 'square', '<svg/>', NULL)");
        db.run("INSERT INTO grapheme_folders (id, name, parent_id, position) VALUES (1, 'Vowels', NULL, 0)");
        db.run("INSERT INTO graphemes (id, name, folder_id) VALUES (1, 'a', 1)");
        db.run("INSERT INTO graphemes (id, name, folder_id) VALUES (2, 'b', NULL)");
        db.run("INSERT INTO grapheme_glyphs (grapheme_id, glyph_id, position) VALUES (1, 1, 0)");
        db.run("INSERT INTO grapheme_glyphs (grapheme_id, glyph_id, position) VALUES (2, 2, 0)");
    }

    describe('export v3', () => {
        it('stamps version 3 and includes glyph_folders + grapheme_folders + folder_id', () => {
            seedGlyphGraphemeFolders();
            const data = collectExportData();
            expect(data.version).toBe(EXPORT_SCHEMA_VERSION);
            expect(EXPORT_SCHEMA_VERSION).toBe(3);
            expect(data.tables.glyph_folders).toHaveLength(2);
            expect(data.tables.grapheme_folders).toHaveLength(1);
            expect(data.tables.glyphs.find(g => g.id === 1)!.folder_id).toBe(2);
            expect(data.tables.glyphs.find(g => g.id === 2)!.folder_id).toBe(null);
            expect(data.tables.graphemes.find(g => g.id === 1)!.folder_id).toBe(1);
        });

        it('round-trips glyph/grapheme folders + assignments through the JSON services', async () => {
            seedGlyphGraphemeFolders();
            const before = collectExportData();
            const json = exportAsJson();

            await importFromJson(json);

            const after = collectExportData();
            for (const table of Object.keys(before.tables) as (keyof typeof before.tables)[]) {
                expect(after.tables[table]).toEqual(before.tables[table]);
            }
            expect(after.tables.glyph_folders).toEqual(before.tables.glyph_folders);
            expect(after.tables.grapheme_folders).toEqual(before.tables.grapheme_folders);
            expect(after.tables.glyphs.find(g => g.id === 1)!.folder_id).toBe(2);
            expect(after.tables.graphemes.find(g => g.id === 1)!.folder_id).toBe(1);
        });

        it('coerces a dangling glyph/grapheme folder_id to root on import', async () => {
            const data = collectExportData();
            const json = JSON.stringify({
                ...data,
                tables: {
                    ...data.tables,
                    glyph_folders: [],
                    grapheme_folders: [],
                    glyphs: [
                        { id: 1, name: 'g', svg_data: '<svg/>', category: null, notes: null, folder_id: 42, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' },
                    ],
                    graphemes: [
                        { id: 1, name: 'gr', category: null, notes: null, folder_id: 77, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' },
                    ],
                    grapheme_glyphs: [{ id: 1, grapheme_id: 1, glyph_id: 1, position: 0, transform: null }],
                },
            });
            const report = await importFromJson(json);
            expect(report.warnings.some(w => w.includes('glyph(s) referenced a missing folder'))).toBe(true);
            expect(report.warnings.some(w => w.includes('grapheme(s) referenced a missing folder'))).toBe(true);
            const after = collectExportData();
            expect(after.tables.glyphs[0].folder_id).toBe(null);
            expect(after.tables.graphemes[0].folder_id).toBe(null);
        });
    });

    describe('moved-folder round-trip (child folder id < parent folder id)', () => {
        // Regression: a folder MOVED under a later-created folder ends up with a
        // lower id than its parent. Export reads rows in id (rowid) order, so the
        // child row is written BEFORE its parent; importing it back used to abort
        // with "FOREIGN KEY constraint failed" (immediate FK enforcement, parent
        // row not inserted yet), making an otherwise-valid backup unrestorable.
        // The import now defers FK enforcement to commit. UC-2 lists "move" as a
        // first-class folder operation, so this is a reachable data-loss path.
        it('lexicon: create A, create B, move A under B → import preserves the chain', async () => {
            const a = etymologApi.folder.create({ name: 'A' });
            const b = etymologApi.folder.create({ name: 'B' });
            expect(etymologApi.folder.move(a.data!.id, b.data!.id).success).toBe(true);
            expect(a.data!.id).toBeLessThan(b.data!.id); // child id < parent id

            const report = await importFromJson(exportAsJson());
            // A clean move must not coerce anything to root.
            expect(report.warnings.some(w => w.includes('missing'))).toBe(false);
            const after = collectExportData();
            expect(after.tables.lexicon_folders.find(f => f.id === a.data!.id)!.parent_id).toBe(b.data!.id);
        });

        it('glyph: create A, create B, move A under B → import preserves the chain', async () => {
            const a = etymologApi.glyphFolder.create({ name: 'A' });
            const b = etymologApi.glyphFolder.create({ name: 'B' });
            expect(etymologApi.glyphFolder.move(a.data!.id, b.data!.id).success).toBe(true);
            const glyph = etymologApi.glyph.create({ name: 'g', svg_data: '<svg/>', folder_id: a.data!.id });

            await importFromJson(exportAsJson());
            const after = collectExportData();
            expect(after.tables.glyph_folders.find(f => f.id === a.data!.id)!.parent_id).toBe(b.data!.id);
            expect(after.tables.glyphs.find(g => g.id === glyph.data!.id)!.folder_id).toBe(a.data!.id);
        });

        it('grapheme: create A, create B, move A under B → import preserves the chain', async () => {
            const glyph = etymologApi.glyph.create({ name: 'g', svg_data: '<svg/>' });
            const a = etymologApi.graphemeFolder.create({ name: 'A' });
            const b = etymologApi.graphemeFolder.create({ name: 'B' });
            expect(etymologApi.graphemeFolder.move(a.data!.id, b.data!.id).success).toBe(true);
            const gr = etymologApi.grapheme.create({
                name: 'k',
                glyphs: [{ glyph_id: glyph.data!.id, position: 0 }],
                folder_id: a.data!.id,
            });

            await importFromJson(exportAsJson());
            const after = collectExportData();
            expect(after.tables.grapheme_folders.find(f => f.id === a.data!.id)!.parent_id).toBe(b.data!.id);
            expect(after.tables.graphemes.find(g => g.id === gr.data!.id)!.folder_id).toBe(a.data!.id);
        });
    });

    describe('v2 backward compatibility (hand-crafted fixture)', () => {
        /** A version-2 envelope: lexicon folders exist, but no glyph/grapheme ones. */
        function v2Envelope(): string {
            return JSON.stringify({
                magic: 'ETYMOLOG_EXPORT',
                version: 2,
                exportedAt: '2026-01-01T00:00:00Z',
                conlangName: 'Legacy2',
                settings: { conlangName: 'Legacy2' },
                tables: {
                    // No folder_id on glyphs/graphemes, and no glyph_folders /
                    // grapheme_folders keys at all.
                    glyphs: [{ id: 1, name: 'g', svg_data: '<svg/>', category: null, notes: null, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' }],
                    graphemes: [{ id: 1, name: 'gr', category: null, notes: null, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' }],
                    grapheme_glyphs: [{ id: 1, grapheme_id: 1, glyph_id: 1, position: 0, transform: null }],
                    phonemes: [],
                    lexicon_folders: [{ id: 1, name: 'Nouns', parent_id: null, position: 0, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' }],
                    lexicon: [{ id: 1, lemma: 'w', pronunciation: null, is_native: 1, auto_spell: 1, meaning: null, part_of_speech: null, notes: null, glyph_order: '[]', needs_attention: 0, folder_id: 1, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' }],
                    lexicon_spelling: [],
                    lexicon_meanings: [],
                    lexicon_ancestry: [],
                    lexicon_ancestry_closure: [],
                },
            });
        }

        it('accepts a v2 envelope and defaults the new folder tables to empty / folder_id null', async () => {
            const parsed = parseAndValidateJson(v2Envelope());
            expect(parsed.version).toBe(2);
            // Missing tables defaulted to [] by the shape validator.
            expect(parsed.tables.glyph_folders).toEqual([]);
            expect(parsed.tables.grapheme_folders).toEqual([]);

            await importExportData(parsed);

            const after = collectExportData();
            expect(after.tables.glyph_folders).toEqual([]);
            expect(after.tables.grapheme_folders).toEqual([]);
            expect(after.tables.glyphs.every(g => g.folder_id === null)).toBe(true);
            expect(after.tables.graphemes.every(g => g.folder_id === null)).toBe(true);
            // The lexicon folder from the v2 file survived.
            expect(after.tables.lexicon_folders).toHaveLength(1);
            expect(after.tables.lexicon[0].folder_id).toBe(1);
            // Re-export now stamps the CURRENT version.
            expect(after.version).toBe(EXPORT_SCHEMA_VERSION);
        });
    });
});
