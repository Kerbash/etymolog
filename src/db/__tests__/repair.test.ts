/**
 * Orphan repair tests (live database)
 *
 * `repairOrphans` on the singleton connection, `repairDatabase()` (health
 * refresh) and the `databaseApi.repair()` / `getStatus().schemaVersion`
 * surface. Orphans are seeded with `PRAGMA foreign_keys = OFF` the way the
 * pre-Phase-1 builds produced them.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Database } from 'sql.js';
import {
    initDatabase,
    clearDatabase,
    getDatabase,
    getDatabaseHealth,
    repairDatabase,
    countForeignKeyViolations,
} from '../database';
import { withTransaction } from '../utils/transaction';
import {
    CURRENT_SCHEMA_VERSION,
    MISSING_GRAPHEME_PLACEHOLDER,
    repairOrphans,
    type RepairReport,
} from '../migrations';
import { databaseApi } from '../api/databaseApi';

const ZERO_REPORT: RepairReport = {
    graphemeGlyphsPruned: 0,
    phonemesPruned: 0,
    lexiconSpellingPruned: 0,
    lexiconMeaningsPruned: 0,
    lexiconAncestryPruned: 0,
    glyphOrderEntriesReplaced: 0,
    lexiconEntriesFlagged: 0,
    closureRowsPruned: 0,
    total: 0,
};

function scalar(db: Database, sql: string, params: (string | number)[] = []): unknown {
    const result = db.exec(sql, params);
    return result.length > 0 ? result[0].values[0][0] : undefined;
}

function count(db: Database, table: string): number {
    return scalar(db, `SELECT COUNT(*) FROM ${table}`) as number;
}

/** A consistent base: 2 glyphs, 2 graphemes, 2 words (2 derived from 1). */
function seedConsistent(db: Database): void {
    db.run(`INSERT INTO glyphs (id, name, svg_data) VALUES (1, 'g1', '<svg/>'), (2, 'g2', '<svg/>')`);
    db.run(`INSERT INTO graphemes (id, name) VALUES (1, 'A'), (2, 'B')`);
    db.run(`INSERT INTO grapheme_glyphs (grapheme_id, glyph_id, position) VALUES (1, 1, 0), (2, 2, 0)`);
    db.run(`INSERT INTO phonemes (grapheme_id, phoneme) VALUES (1, 'a'), (2, 'b')`);
    db.run(`INSERT INTO lexicon (id, lemma, glyph_order) VALUES (1, 'a', '["grapheme-1"]'), (2, 'ab', '["grapheme-1","grapheme-2"]')`);
    db.run(`INSERT INTO lexicon_spelling (lexicon_id, grapheme_id, position) VALUES (1, 1, 0), (2, 1, 0), (2, 2, 1)`);
    db.run(`INSERT INTO lexicon_meanings (lexicon_id, meaning) VALUES (1, 'one'), (2, 'two')`);
    db.run(`INSERT INTO lexicon_ancestry (lexicon_id, ancestor_id) VALUES (2, 1)`);
    db.run(`INSERT INTO lexicon_ancestry_closure (ancestor_id, descendant_id, depth) VALUES (1, 2, 1)`);
}

/** Every category of orphan the FK-off era could produce. */
function seedOrphans(db: Database): void {
    db.run('PRAGMA foreign_keys = OFF');
    try {
        db.run(`INSERT INTO grapheme_glyphs (grapheme_id, glyph_id, position) VALUES (999, 1, 0)`); // missing grapheme
        db.run(`INSERT INTO grapheme_glyphs (grapheme_id, glyph_id, position) VALUES (1, 999, 5)`); // missing glyph
        db.run(`INSERT INTO phonemes (grapheme_id, phoneme) VALUES (999, 'x')`);
        db.run(`INSERT INTO lexicon_spelling (lexicon_id, grapheme_id, position) VALUES (999, 1, 0)`); // missing word
        db.run(`INSERT INTO lexicon_spelling (lexicon_id, grapheme_id, position) VALUES (1, 999, 7)`); // missing grapheme
        db.run(`INSERT INTO lexicon_meanings (lexicon_id, meaning) VALUES (999, 'ghost')`);
        db.run(`INSERT INTO lexicon_ancestry (lexicon_id, ancestor_id) VALUES (999, 1)`);
        db.run(`INSERT INTO lexicon_ancestry (lexicon_id, ancestor_id) VALUES (1, 998)`);
        db.run(`INSERT INTO lexicon_ancestry_closure (ancestor_id, descendant_id, depth) VALUES (999, 2, 1)`);
        // two dangling refs in one word, one in another
        db.run(`UPDATE lexicon SET glyph_order = '["grapheme-1","grapheme-555","grapheme-556"]' WHERE id = 1`);
        db.run(`UPDATE lexicon SET glyph_order = '["grapheme-1","ə","grapheme-555"]' WHERE id = 2`);
    } finally {
        db.run('PRAGMA foreign_keys = ON');
    }
}

describe('repairOrphans on the live database', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
        seedConsistent(getDatabase());
    });

    it('reports all zeros on a consistent database and changes nothing', () => {
        const db = getDatabase();
        const report = withTransaction(db, () => repairOrphans(db));
        expect(report).toEqual(ZERO_REPORT);
        expect(count(db, 'lexicon_spelling')).toBe(3);
        expect(scalar(db, 'SELECT glyph_order FROM lexicon WHERE id = 2')).toBe('["grapheme-1","grapheme-2"]');
        expect(scalar(db, 'SELECT needs_attention FROM lexicon WHERE id = 2')).toBe(0);
        // closure rebuilt to the same content
        expect(db.exec('SELECT ancestor_id, descendant_id, depth FROM lexicon_ancestry_closure')[0].values)
            .toEqual([[1, 2, 1]]);
    });

    it('prunes every orphan category, rewrites dangling glyph_order refs and leaves foreign_key_check empty', () => {
        const db = getDatabase();
        seedOrphans(db);
        expect(countForeignKeyViolations(db)).toBeGreaterThan(0);

        const report = withTransaction(db, () => repairOrphans(db));

        expect(report).toEqual<RepairReport>({
            graphemeGlyphsPruned: 2,
            phonemesPruned: 1,
            lexiconSpellingPruned: 2,
            lexiconMeaningsPruned: 1,
            lexiconAncestryPruned: 2,
            glyphOrderEntriesReplaced: 3,
            lexiconEntriesFlagged: 2,
            closureRowsPruned: 1,
            total: 14,
        });
        expect(countForeignKeyViolations(db)).toBe(0);

        // consistent rows untouched
        expect(count(db, 'grapheme_glyphs')).toBe(2);
        expect(count(db, 'phonemes')).toBe(2);
        // lexicon_spelling is DERIVED from glyph_order: after the rewrite it holds
        // exactly one row per surviving grapheme entry (word 1 keeps one, word 2
        // keeps one — the seeded row for a grapheme no longer in word 2's
        // glyph_order is gone, which is the point of the resync).
        const graphemeEntries = (db.exec('SELECT glyph_order FROM lexicon')[0].values as [string][])
            .reduce((n, [order]) => n + (JSON.parse(order) as string[]).filter(e => e.startsWith('grapheme-')).length, 0);
        expect(count(db, 'lexicon_spelling')).toBe(graphemeEntries);
        expect(graphemeEntries).toBe(2);
        expect(count(db, 'lexicon_meanings')).toBe(2);
        expect(count(db, 'lexicon_ancestry')).toBe(1);
        expect(count(db, 'lexicon')).toBe(2);

        // dangling refs → '?', IPA literals and valid refs kept, words flagged
        expect(JSON.parse(scalar(db, 'SELECT glyph_order FROM lexicon WHERE id = 1') as string))
            .toEqual(['grapheme-1', MISSING_GRAPHEME_PLACEHOLDER, MISSING_GRAPHEME_PLACEHOLDER]);
        expect(JSON.parse(scalar(db, 'SELECT glyph_order FROM lexicon WHERE id = 2') as string))
            .toEqual(['grapheme-1', 'ə', MISSING_GRAPHEME_PLACEHOLDER]);
        expect(scalar(db, 'SELECT needs_attention FROM lexicon WHERE id = 1')).toBe(1);
        expect(scalar(db, 'SELECT needs_attention FROM lexicon WHERE id = 2')).toBe(1);

        // closure rebuilt from the repaired adjacency list
        expect(db.exec('SELECT ancestor_id, descendant_id, depth FROM lexicon_ancestry_closure')[0].values)
            .toEqual([[1, 2, 1]]);
    });

    it('is idempotent', () => {
        const db = getDatabase();
        seedOrphans(db);
        withTransaction(db, () => repairOrphans(db));
        expect(withTransaction(db, () => repairOrphans(db))).toEqual(ZERO_REPORT);
    });

    it('after repair, FK-enforced deletes that used to fail succeed', () => {
        const db = getDatabase();
        seedOrphans(db);
        withTransaction(db, () => repairOrphans(db));
        // grapheme 1 is used by the lexicon (RESTRICT) — delete the words first, then it goes
        db.run('DELETE FROM lexicon');
        expect(() => db.run('DELETE FROM graphemes WHERE id = 1')).not.toThrow();
        expect(count(db, 'grapheme_glyphs')).toBe(1);
        expect(countForeignKeyViolations(db)).toBe(0);
    });

    it('repairDatabase() refreshes the health counter', () => {
        const db = getDatabase();
        seedOrphans(db);
        const report = repairDatabase();
        expect(report.total).toBe(14);
        expect(getDatabaseHealth().fkViolations).toBe(0);
    });
});

describe('databaseApi.repair / getStatus', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
        seedConsistent(getDatabase());
    });

    it('repair() returns the report in the ApiResponse envelope', () => {
        seedOrphans(getDatabase());
        const response = databaseApi.repair();
        expect(response.success).toBe(true);
        expect(response.data?.total).toBe(14);
        expect(response.data?.lexiconSpellingPruned).toBe(2);
        expect(countForeignKeyViolations()).toBe(0);

        const again = databaseApi.repair();
        expect(again.success).toBe(true);
        expect(again.data).toEqual(ZERO_REPORT);
    });

    it('getStatus() reports the schema version', () => {
        const status = databaseApi.getStatus();
        expect(status.success).toBe(true);
        expect(status.data?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        expect(status.data?.initialized).toBe(true);
        expect(status.data?.glyphCount).toBe(2);
    });
});
