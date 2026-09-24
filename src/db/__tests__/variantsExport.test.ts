/**
 * Variants through export / import (schema v9, export envelope v4)
 *
 *   - a JSON export carries `variant_groups`, `grapheme_variants`,
 *     `grapheme_glyphs.variant_id` and `block_scheme`, and round-trips them;
 *   - a v1–v3 envelope (no variant tables, no `variant_id`) imports: every
 *     grapheme gets a default variant holding its glyph rows (P4);
 *   - a corrupt v4 envelope is normalised instead of aborting at the
 *     database's variant constraints;
 *   - a `.sqlite` file from the last pre-variant build (schema v8) imports
 *     through `importDatabaseFile` and is migrated.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase, getDatabase, importDatabaseFile } from '../database';
import { collectExportData, importExportData, parseAndValidateJson, exportDataToJson } from '../exportImport/jsonCodec';
import { resetSettingsForTests } from '../api/settingsApi';
import { createGlyph } from '../glyphService';
import { createGrapheme, getAllGraphemesComplete, getGraphemeComplete } from '../graphemeService';
import { createVariant, createVariantGroup, getDefaultVariantId, getVariantsByGraphemeId } from '../variantService';
import { createLexicon, getLexiconById } from '../lexiconService';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, readUserVersion } from '../migrations';
import { EXPORT_SCHEMA_VERSION } from '../../config/version';
import { createGraphemeEntry, deserializeGlyphOrder } from '../utils/spellingUtils';
import { buildV8Bytes, SEED, V8_SEED } from './fixtures/legacySchemas';
import type { EtymologExportData } from '../exportImport/types';

const TS = '2026-01-01 00:00:00';

function rows(sql: string, params: (string | number)[] = []): unknown[][] {
    return getDatabase().exec(sql, params)[0]?.values ?? [];
}

function scalar(sql: string, params: (string | number)[] = []): unknown {
    return rows(sql, params)[0]?.[0];
}

/** A pre-variant (v3) envelope: two graphemes, one with two glyphs, a word spelled with both. */
function v3Envelope(): string {
    return JSON.stringify({
        magic: 'ETYMOLOG_EXPORT',
        version: 3,
        exportedAt: '2026-01-01T00:00:00Z',
        conlangName: 'Legacy',
        settings: { conlangName: 'Legacy' },
        tables: {
            glyph_folders: [],
            glyphs: [
                { id: 1, name: 'one', svg_data: '<svg/>', category: null, notes: null, folder_id: null, created_at: TS, updated_at: TS },
                { id: 2, name: 'two', svg_data: '<svg/>', category: null, notes: null, folder_id: null, created_at: TS, updated_at: TS },
                { id: 3, name: 'three', svg_data: '<svg/>', category: null, notes: null, folder_id: null, created_at: TS, updated_at: TS },
            ],
            grapheme_folders: [],
            graphemes: [
                { id: 1, name: 'A', category: null, notes: null, folder_id: null, created_at: TS, updated_at: TS },
                { id: 2, name: 'B', category: null, notes: null, folder_id: null, created_at: TS, updated_at: TS },
            ],
            grapheme_glyphs: [
                { id: 1, grapheme_id: 1, glyph_id: 1, position: 0, transform: null },
                { id: 2, grapheme_id: 1, glyph_id: 2, position: 1, transform: null },
                { id: 3, grapheme_id: 2, glyph_id: 3, position: 0, transform: null },
            ],
            phonemes: [
                { id: 1, grapheme_id: 1, phoneme: 'a', use_in_auto_spelling: 1, context: null },
                { id: 2, grapheme_id: 2, phoneme: 'b', use_in_auto_spelling: 1, context: null },
            ],
            lexicon_folders: [],
            lexicon: [{
                id: 1, lemma: 'ab', pronunciation: null, is_native: 1, auto_spell: 0, meaning: null,
                part_of_speech: null, notes: null, glyph_order: '["grapheme-1","grapheme-2"]',
                needs_attention: 0, folder_id: null, created_at: TS, updated_at: TS,
            }],
            lexicon_spelling: [
                { id: 1, lexicon_id: 1, grapheme_id: 1, position: 0 },
                { id: 2, lexicon_id: 1, grapheme_id: 2, position: 1 },
            ],
            lexicon_meanings: [],
            lexicon_ancestry: [],
            lexicon_ancestry_closure: [],
        },
    });
}

/** Seed a populated v9 database: groups, a grapheme with a grouped second form, a pinned word, a scheme row. */
function seedVariantConlang() {
    const g1 = createGlyph({ name: 'g1', svg_data: '<svg/>' });
    const g2 = createGlyph({ name: 'g2', svg_data: '<svg/>' });
    const head = createVariantGroup({ name: 'head' });
    const body = createVariantGroup({ name: 'body' });
    const grapheme = createGrapheme({
        name: 'K',
        glyphs: [{ glyph_id: g1.id, position: 0 }, { glyph_id: g2.id, position: 1 }],
        variants: [{ name: 'Head', group_id: head.id, glyphs: [{ glyph_id: g1.id, position: 0 }] }],
    });
    const headVariant = grapheme.variants!.find(v => v.name === 'Head')!;
    const bodyVariant = createVariant(grapheme.id, { name: 'Body', group_id: body.id, glyphs: [{ glyph_id: g2.id, position: 0 }] });
    const word = createLexicon({
        lemma: 'kk',
        auto_spell: false,
        glyph_order: [createGraphemeEntry(grapheme.id, headVariant.id), createGraphemeEntry(grapheme.id)],
    });
    getDatabase().run(`INSERT INTO block_scheme (id, definition) VALUES (1, '{"version":1,"enabled":false,"roles":[],"templates":[]}')`);
    return { g1, g2, head, body, grapheme, headVariant, bodyVariant, word };
}

describe('variants through JSON export / import', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
        localStorage.removeItem('etymolog_settings_v1');
        resetSettingsForTests();
    });

    it('an export is version 4 and carries the variant tables, variant_id and the scheme row', () => {
        const { grapheme, headVariant } = seedVariantConlang();
        const data = collectExportData();
        expect(EXPORT_SCHEMA_VERSION).toBe(4);
        expect(data.version).toBe(4);
        expect(data.tables.variant_groups.map(g => g.name)).toEqual(['head', 'body']);
        expect(data.tables.grapheme_variants).toHaveLength(3);
        expect(data.tables.grapheme_variants.filter(v => v.is_default === 1)).toHaveLength(1);
        expect(data.tables.grapheme_glyphs.every(r => typeof r.variant_id === 'number')).toBe(true);
        expect(data.tables.grapheme_glyphs.filter(r => r.variant_id === headVariant.id)).toHaveLength(1);
        expect(data.tables.grapheme_glyphs.filter(r => r.grapheme_id === grapheme.id)).toHaveLength(4);
        expect(data.tables.block_scheme).toHaveLength(1);
    });

    it('round-trips groups, variants (defaults, groups, glyph lists), pins and the scheme row', async () => {
        const seeded = seedVariantConlang();
        const before = collectExportData();
        const json = exportDataToJson(before);

        clearDatabase();
        const report = await importExportData(parseAndValidateJson(json));

        expect(report.defaultVariantsCreated).toBe(0);
        expect(report.inserted.grapheme_variants).toBe(3);
        expect(report.inserted.variant_groups).toBe(2);
        expect(report.inserted.block_scheme).toBe(1);
        expect(report.warnings).toEqual([]);

        const after = collectExportData();
        for (const table of ['variant_groups', 'grapheme_variants', 'grapheme_glyphs', 'block_scheme', 'lexicon'] as const) {
            expect(after.tables[table], table).toEqual(before.tables[table]);
        }
        const variants = getVariantsByGraphemeId(seeded.grapheme.id);
        expect(variants.map(v => [v.name, v.is_default, v.group_id])).toEqual([
            ['Default', true, null],
            ['Head', false, seeded.head.id],
            ['Body', false, seeded.body.id],
        ]);
        expect(deserializeGlyphOrder(getLexiconById(seeded.word.id)!.glyph_order)[0])
            .toBe(createGraphemeEntry(seeded.grapheme.id, seeded.headVariant.id));
        expect(getDatabase().exec('PRAGMA foreign_key_check')).toEqual([]);
    });

    it('the autoincrement counters are advanced past imported variant / group ids', async () => {
        seedVariantConlang();
        const json = exportDataToJson(collectExportData());
        clearDatabase();
        await importExportData(parseAndValidateJson(json));
        const maxVariant = scalar('SELECT MAX(id) FROM grapheme_variants') as number;
        const maxGroup = scalar('SELECT MAX(id) FROM variant_groups') as number;
        const g = createGrapheme({ name: 'new', glyphs: [{ glyph_id: 1, position: 0 }] });
        expect(getDefaultVariantId(g.id)).toBe(maxVariant + 1);
        expect(createVariantGroup({ name: 'third' }).id).toBe(maxGroup + 1);
    });

    it('a v3 envelope (no variant tables) imports: each grapheme gets a Default variant holding its glyph rows', async () => {
        const parsed = parseAndValidateJson(v3Envelope());
        expect(parsed.tables.grapheme_variants).toEqual([]);
        expect(parsed.tables.variant_groups).toEqual([]);
        expect(parsed.tables.block_scheme).toEqual([]);

        const report = await importExportData(parsed);

        expect(report.defaultVariantsCreated).toBe(2);
        expect(report.inserted.grapheme_glyphs).toBe(3);
        expect(report.warnings).toEqual([]);
        expect(rows('SELECT grapheme_id, name, is_default FROM grapheme_variants ORDER BY grapheme_id'))
            .toEqual([[1, 'Default', 1], [2, 'Default', 1]]);
        expect(rows(`
            SELECT gg.id, gg.grapheme_id, v.grapheme_id, v.is_default
            FROM grapheme_glyphs gg JOIN grapheme_variants v ON v.id = gg.variant_id ORDER BY gg.id
        `)).toEqual([[1, 1, 1, 1], [2, 1, 1, 1], [3, 2, 2, 1]]);
        expect(getGraphemeComplete(1)!.glyphs.map(g => g.id)).toEqual([1, 2]);
        expect(getAllGraphemesComplete().every(g => g.variants!.length === 1)).toBe(true);
        expect(getDatabase().exec('PRAGMA foreign_key_check')).toEqual([]);
    });

    it('accepts envelope versions 1–4 and rejects 5', () => {
        for (const version of [1, 2, 3, 4]) {
            const env = JSON.parse(v3Envelope());
            env.version = version;
            expect(() => parseAndValidateJson(JSON.stringify(env)), `v${version}`).not.toThrow();
        }
        const future = JSON.parse(v3Envelope());
        future.version = 5;
        expect(() => parseAndValidateJson(JSON.stringify(future))).toThrow(/Unsupported export version/);
    });

    it('normalises a corrupt v4 envelope instead of aborting at the variant constraints', async () => {
        const data = JSON.parse(v3Envelope()) as EtymologExportData;
        data.version = 4;
        data.tables.variant_groups = [{ id: 1, name: 'head', sort_order: 0, created_at: TS, updated_at: TS }];
        data.tables.grapheme_variants = [
            // Grapheme 1: TWO defaults (10 wins, lowest sort_order) and two forms in group 1.
            { id: 10, grapheme_id: 1, group_id: null, name: 'Default', is_default: 1, sort_order: 0, created_at: TS, updated_at: TS },
            { id: 11, grapheme_id: 1, group_id: 1, name: 'Also default', is_default: 1, sort_order: 1, created_at: TS, updated_at: TS },
            { id: 12, grapheme_id: 1, group_id: 1, name: 'Same group', is_default: 0, sort_order: 2, created_at: TS, updated_at: TS },
            // Dangling group → ungrouped. Grapheme 2 has NO default → 20 promoted.
            { id: 20, grapheme_id: 2, group_id: 99, name: 'Only', is_default: 0, sort_order: 0, created_at: TS, updated_at: TS },
            // Empty non-default → dropped (and the pin on it stripped).
            { id: 21, grapheme_id: 2, group_id: null, name: 'Empty', is_default: 0, sort_order: 1, created_at: TS, updated_at: TS },
        ];
        data.tables.grapheme_glyphs = [
            { id: 1, grapheme_id: 1, variant_id: 10, glyph_id: 1, position: 0, transform: null },
            { id: 2, grapheme_id: 1, variant_id: null, glyph_id: 2, position: 1, transform: null }, // → default 10
            { id: 3, grapheme_id: 2, variant_id: 20, glyph_id: 3, position: 0, transform: null },
            { id: 4, grapheme_id: 1, variant_id: 11, glyph_id: 1, position: 0, transform: null },
            { id: 5, grapheme_id: 1, variant_id: 12, glyph_id: 2, position: 0, transform: null },
            { id: 6, grapheme_id: 1, variant_id: 20, glyph_id: 3, position: 5, transform: null }, // foreign variant → pruned
            { id: 7, grapheme_id: 2, variant_id: 777, glyph_id: 3, position: 6, transform: null }, // missing variant → pruned
        ];
        data.tables.lexicon[0].glyph_order = JSON.stringify(['grapheme-1@11', 'grapheme-2@21', 'grapheme-2@10']);
        data.tables.block_scheme = [
            { id: 1, definition: '{}', updated_at: TS },
            { id: 2, definition: '{}', updated_at: TS },
        ];

        const report = await importExportData(parseAndValidateJson(JSON.stringify(data)));

        expect(rows('SELECT id, grapheme_id, group_id, is_default FROM grapheme_variants ORDER BY id')).toEqual([
            [10, 1, null, 1],
            [11, 1, 1, 0],
            [12, 1, null, 0],
            [20, 2, null, 1],
        ]);
        expect(rows('SELECT id, variant_id FROM grapheme_glyphs ORDER BY id')).toEqual([[1, 10], [2, 10], [3, 20], [4, 11], [5, 12]]);
        expect(report.pruned.grapheme_glyphs).toBe(2);
        expect(report.pruned.grapheme_variants).toBe(1);
        expect(report.pruned.block_scheme).toBe(1);
        expect(report.defaultVariantsCreated).toBe(0);
        // Valid pin kept, pin on the dropped form and pin on another grapheme's form stripped.
        expect(deserializeGlyphOrder(getLexiconById(1)!.glyph_order)).toEqual(['grapheme-1@11', 'grapheme-2', 'grapheme-2']);
        expect(getLexiconById(1)!.needs_attention).toBe(false);
        expect(report.warnings.length).toBeGreaterThan(0);
        expect(getDatabase().exec('PRAGMA foreign_key_check')).toEqual([]);
    });
});

describe('.sqlite import of a schema-v8 file', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    it('migrates it through v9: default variants, attached glyph rows, words intact', async () => {
        const bytes = await buildV8Bytes(MIGRATIONS);
        // Copy into a plain ArrayBuffer-backed view (a BlobPart); sql.js hands
        // back an ArrayBufferLike-typed array.
        const file = new File([new Uint8Array(bytes)], 'old.sqlite', { type: 'application/x-sqlite3' });

        await importDatabaseFile(file);

        const db = getDatabase();
        expect(readUserVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
        expect(scalar('SELECT COUNT(*) FROM graphemes')).toBe(SEED.graphemeCount);
        expect(scalar('SELECT COUNT(*) FROM grapheme_variants WHERE is_default = 1')).toBe(SEED.graphemeCount);
        expect(scalar('SELECT COUNT(*) FROM grapheme_glyphs')).toBe(V8_SEED.glyphRows.length);
        expect(scalar(`
            SELECT COUNT(*) FROM grapheme_glyphs gg
            JOIN grapheme_variants v ON v.id = gg.variant_id AND v.grapheme_id = gg.grapheme_id AND v.is_default = 1
        `)).toBe(V8_SEED.glyphRows.length);
        expect(getGraphemeComplete(1)!.glyphs.map(g => g.id)).toEqual([1, 2]);
        expect(deserializeGlyphOrder(getLexiconById(3)!.glyph_order)).toEqual(V8_SEED.word3GlyphOrder);
        expect(db.exec('PRAGMA foreign_key_check')).toEqual([]);
    });
});
