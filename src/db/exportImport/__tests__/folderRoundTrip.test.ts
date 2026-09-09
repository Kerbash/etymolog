/**
 * Folder export/import round-trip (Phase 5a, UC-D)
 * ------------------------------------------------
 * `lexicon_folders` + `lexicon.folder_id` were added at schema v7 / export
 * version 2. This suite proves:
 *
 *  - a v2 export carries folders and folder assignments, and importing it back
 *    reproduces them exactly (full serialize → string → parse → import → export
 *    persistence cycle);
 *  - the exporter stamps version 2 and emits `lexicon_folders`;
 *  - a hand-crafted v1 envelope (no folders, no folder_id) still imports — with
 *    zero folders and every folder_id null — the backward-compat contract.
 *
 * The v1 fixture is authored BY HAND (not synthesised by the current exporter)
 * so it genuinely exercises the old shape.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase, getDatabase } from '../../database';
import { exportAsJson } from '../exportService';
import { importFromJson } from '../importService';
import { collectExportData, parseAndValidateJson, importExportData } from '../jsonCodec';
import { EXPORT_SCHEMA_VERSION } from '../../../config/version';

describe('folder export/import round-trip', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    /** Two nested folders and two words, one filed, one at the root. */
    function seedFolders() {
        const db = getDatabase();
        // No `meaning` column / lexicon_meanings rows here: this suite is about
        // folders, and a bare `meaning` would trip the legacy-meanings backfill
        // on import (a separate, already-tested concern) and skew the compare.
        db.run("INSERT INTO lexicon_folders (id, name, parent_id, position) VALUES (1, 'Nouns', NULL, 0)");
        db.run("INSERT INTO lexicon_folders (id, name, parent_id, position) VALUES (2, 'People', 1, 0)");
        db.run("INSERT INTO lexicon (id, lemma, folder_id) VALUES (1, 'filed', 2)");
        db.run("INSERT INTO lexicon (id, lemma, folder_id) VALUES (2, 'unfiled', NULL)");
    }

    describe('current version', () => {
        it('stamps the current version and includes lexicon_folders + folder_id', () => {
            seedFolders();
            const data = collectExportData();
            expect(data.version).toBe(EXPORT_SCHEMA_VERSION);
            expect(EXPORT_SCHEMA_VERSION).toBe(3);
            expect(data.tables.lexicon_folders).toHaveLength(2);
            expect(data.tables.lexicon.find(l => l.id === 1)!.folder_id).toBe(2);
            expect(data.tables.lexicon.find(l => l.id === 2)!.folder_id).toBe(null);
        });

        it('round-trips folders and folder assignments through the JSON services', async () => {
            seedFolders();
            const before = collectExportData();
            const json = exportAsJson();

            await importFromJson(json);

            const after = collectExportData();
            for (const table of Object.keys(before.tables) as (keyof typeof before.tables)[]) {
                expect(after.tables[table]).toEqual(before.tables[table]);
            }
            // Explicit: the nesting and the assignment survived.
            expect(after.tables.lexicon_folders).toEqual(before.tables.lexicon_folders);
            expect(after.tables.lexicon.find(l => l.id === 1)!.folder_id).toBe(2);
        });

        it('reparents a word to root when its folder is pruned as dangling', async () => {
            // A corrupt v2 envelope whose word points at a missing folder must
            // import with folder_id nulled rather than aborting on FK check.
            const data = collectExportData();
            const json = JSON.stringify({
                ...data,
                tables: {
                    ...data.tables,
                    lexicon_folders: [],
                    lexicon: [
                        { id: 1, lemma: 'w', pronunciation: null, is_native: 1, auto_spell: 1, meaning: 'm', part_of_speech: null, notes: null, glyph_order: '[]', needs_attention: 0, folder_id: 42, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' },
                    ],
                },
            });
            const report = await importFromJson(json);
            expect(report.warnings.some(w => w.includes('missing folder'))).toBe(true);
            expect(collectExportData().tables.lexicon[0].folder_id).toBe(null);
        });
    });

    describe('v1 backward compatibility (hand-crafted fixture)', () => {
        /** A version-1 envelope: no lexicon_folders table, no folder_id column. */
        function v1Envelope(): string {
            return JSON.stringify({
                magic: 'ETYMOLOG_EXPORT',
                version: 1,
                exportedAt: '2026-01-01T00:00:00Z',
                conlangName: 'Legacy',
                settings: { conlangName: 'Legacy' },
                tables: {
                    glyphs: [{ id: 1, name: 'g', svg_data: '<svg/>', category: null, notes: null, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' }],
                    graphemes: [{ id: 1, name: 'gr', category: null, notes: null, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' }],
                    grapheme_glyphs: [{ id: 1, grapheme_id: 1, glyph_id: 1, position: 0, transform: null }],
                    phonemes: [{ id: 1, grapheme_id: 1, phoneme: 'a', use_in_auto_spelling: 1, context: null }],
                    // NOTE: no folder_id on these rows, and no lexicon_folders key at all.
                    lexicon: [
                        { id: 1, lemma: 'root', pronunciation: null, is_native: 1, auto_spell: 1, meaning: 'm', part_of_speech: null, notes: null, glyph_order: '["grapheme-1"]', needs_attention: 0, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' },
                        { id: 2, lemma: 'child', pronunciation: null, is_native: 1, auto_spell: 1, meaning: 'm', part_of_speech: null, notes: null, glyph_order: '[]', needs_attention: 0, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' },
                    ],
                    lexicon_spelling: [{ id: 1, lexicon_id: 1, grapheme_id: 1, position: 0 }],
                    lexicon_meanings: [{ id: 1, lexicon_id: 1, meaning: 'm', part_of_speech: null, usage_notes: null, definition_order: 0 }],
                    lexicon_ancestry: [{ id: 1, lexicon_id: 2, ancestor_id: 1, position: 0, ancestry_type: 'derived' }],
                    lexicon_ancestry_closure: [],
                },
            });
        }

        it('accepts a v1 envelope and defaults folders to empty / folder_id to null', async () => {
            const parsed = parseAndValidateJson(v1Envelope());
            expect(parsed.version).toBe(1);
            // Missing table defaulted to [] by the shape validator.
            expect(parsed.tables.lexicon_folders).toEqual([]);

            await importExportData(parsed);

            const after = collectExportData();
            expect(after.tables.lexicon_folders).toEqual([]);
            expect(after.tables.lexicon).toHaveLength(2);
            expect(after.tables.lexicon.every(l => l.folder_id === null)).toBe(true);
            // Re-export now stamps the CURRENT version.
            expect(after.version).toBe(EXPORT_SCHEMA_VERSION);
        });

        it('still rejects a version above the current one', () => {
            expect(() => parseAndValidateJson('{"magic":"ETYMOLOG_EXPORT","version":99}'))
                .toThrow('Unsupported export version: 99');
        });
    });
});
