/**
 * Schema migration tests
 *
 * Every legacy fixture (see `fixtures/legacySchemas.ts`) must reach
 * `CURRENT_SCHEMA_VERSION` with its data intact and `PRAGMA foreign_key_check`
 * empty; a second run must apply nothing; a fresh `createSchema()` must be
 * stamped; migration v6 must fix the `lexicon_ancestry.ancestor_id` FK and
 * repair orphans left behind by the FK-off era.
 */

import { describe, it, expect, afterEach } from 'vitest';
import type { Database } from 'sql.js';
import { createDetachedDatabase } from '../database';
import {
    CURRENT_SCHEMA_VERSION,
    MIGRATIONS,
    MISSING_GRAPHEME_PLACEHOLDER,
    columnExists,
    createSchema,
    detectLegacySchemaVersion,
    readUserVersion,
    runMigrations,
    tableExists,
} from '../migrations';
import {
    LEGACY_FIXTURE_KEYS,
    LEGACY_FIXTURES,
    SEED,
    buildLegacyBytes,
    openRawDatabase,
    type LegacyFixtureKey,
} from './fixtures/legacySchemas';

const open: Database[] = [];

async function openFixture(key: LegacyFixtureKey, mutate?: (db: Database) => void): Promise<Database> {
    const bytes = await buildLegacyBytes(key, mutate);
    const db = await createDetachedDatabase(bytes);
    open.push(db);
    return db;
}

async function openFresh(bytes?: Uint8Array): Promise<Database> {
    const db = await createDetachedDatabase(bytes);
    open.push(db);
    return db;
}

function scalar(db: Database, sql: string, params: (string | number)[] = []): unknown {
    const result = db.exec(sql, params);
    return result.length > 0 ? result[0].values[0][0] : undefined;
}

function count(db: Database, table: string): number {
    return scalar(db, `SELECT COUNT(*) FROM ${table}`) as number;
}

function fkViolations(db: Database): number {
    const result = db.exec('PRAGMA foreign_key_check');
    return result.length === 0 ? 0 : result[0].values.length;
}

function ancestorFkOnDelete(db: Database): string | undefined {
    // PRAGMA foreign_key_list columns: id, seq, table, from, to, on_update, on_delete, match
    const result = db.exec('PRAGMA foreign_key_list(lexicon_ancestry)');
    const row = result[0]?.values.find(r => r[3] === 'ancestor_id');
    return row?.[6] as string | undefined;
}

function glyphOrderOf(db: Database, lexiconId: number): string[] {
    return JSON.parse(scalar(db, 'SELECT glyph_order FROM lexicon WHERE id = ?', [lexiconId]) as string);
}

afterEach(() => {
    while (open.length > 0) {
        open.pop()?.close();
    }
});

describe('migration registry', () => {
    it('is consecutive from v1 and ends at CURRENT_SCHEMA_VERSION', () => {
        expect(MIGRATIONS.map(m => m.version)).toEqual(
            Array.from({ length: CURRENT_SCHEMA_VERSION }, (_, i) => i + 1)
        );
        expect(CURRENT_SCHEMA_VERSION).toBe(6);
    });

    it('only v6 needs foreign keys off', () => {
        expect(MIGRATIONS.filter(m => m.foreignKeysOff).map(m => m.version)).toEqual([6]);
    });
});

describe('createSchema (fresh database)', () => {
    it('stamps user_version = CURRENT_SCHEMA_VERSION', async () => {
        const db = await openFresh();
        expect(readUserVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    });

    it('defines ancestor_id with ON DELETE CASCADE', async () => {
        const db = await openFresh();
        expect(ancestorFkOnDelete(db)).toBe('CASCADE');
    });

    it('runMigrations on a fresh database applies nothing', async () => {
        const db = await openFresh();
        expect(runMigrations(db)).toEqual({ from: CURRENT_SCHEMA_VERSION, to: CURRENT_SCHEMA_VERSION, applied: [] });
    });

    it('createSchema on an already-created database is a no-op (IF NOT EXISTS)', async () => {
        const db = await openFresh();
        db.run(`INSERT INTO glyphs (name, svg_data) VALUES ('g', '<svg/>')`);
        expect(() => createSchema(db)).not.toThrow();
        expect(count(db, 'glyphs')).toBe(1);
    });

    it('a database with no Etymolog schema gets the current schema created', async () => {
        const raw = await openRawDatabase();
        const bytes = raw.export();
        raw.close();
        const db = await openFresh(bytes);
        expect(tableExists(db, 'glyphs')).toBe(false);
        const result = runMigrations(db);
        expect(result).toEqual({ from: 0, to: CURRENT_SCHEMA_VERSION, applied: [] });
        expect(tableExists(db, 'lexicon_meanings')).toBe(true);
        expect(readUserVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    });
});

describe('detectLegacySchemaVersion', () => {
    for (const key of LEGACY_FIXTURE_KEYS) {
        it(`reports v${LEGACY_FIXTURES[key].detectedVersion} for ${key}`, async () => {
            const db = await openFixture(key);
            expect(readUserVersion(db)).toBe(0);
            expect(detectLegacySchemaVersion(db)).toBe(LEGACY_FIXTURES[key].detectedVersion);
        });
    }

    it('reports 0 when there is no glyphs table', async () => {
        const raw = await openRawDatabase();
        expect(detectLegacySchemaVersion(raw)).toBe(0);
        raw.close();
    });
});

describe('runMigrations across every legacy fixture', () => {
    for (const key of LEGACY_FIXTURE_KEYS) {
        const fixture = LEGACY_FIXTURES[key];

        describe(key, () => {
            it(`migrates v${fixture.detectedVersion} -> v${CURRENT_SCHEMA_VERSION} applying exactly the pending versions`, async () => {
                const db = await openFixture(key);
                const result = runMigrations(db);
                expect(result.from).toBe(fixture.detectedVersion);
                expect(result.to).toBe(CURRENT_SCHEMA_VERSION);
                expect(result.applied).toEqual(
                    MIGRATIONS.map(m => m.version).filter(v => v > fixture.detectedVersion)
                );
                expect(readUserVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
            });

            it('ends with the full current shape and no FK violations', async () => {
                const db = await openFixture(key);
                runMigrations(db);
                for (const table of [
                    'glyphs', 'graphemes', 'grapheme_glyphs', 'phonemes',
                    'lexicon', 'lexicon_spelling', 'lexicon_ancestry',
                    'lexicon_ancestry_closure', 'lexicon_meanings',
                ]) {
                    expect(tableExists(db, table), table).toBe(true);
                }
                expect(columnExists(db, 'glyphs', 'category')).toBe(true);
                expect(columnExists(db, 'graphemes', 'category')).toBe(true);
                expect(columnExists(db, 'lexicon', 'glyph_order')).toBe(true);
                expect(columnExists(db, 'lexicon', 'needs_attention')).toBe(true);
                expect(ancestorFkOnDelete(db)).toBe('CASCADE');
                expect(fkViolations(db)).toBe(0);
                expect(scalar(db, 'PRAGMA foreign_keys')).toBe(1);
            });

            it('preserves the seeded data', async () => {
                const db = await openFixture(key);
                runMigrations(db);
                expect(count(db, 'glyphs')).toBe(SEED.glyphCount);
                expect(count(db, 'graphemes')).toBe(SEED.graphemeCount);
                expect(count(db, 'grapheme_glyphs')).toBe(3);
                expect(count(db, 'phonemes')).toBe(SEED.phonemeCount);
                if (fixture.hasLexicon) {
                    expect(count(db, 'lexicon')).toBe(SEED.lexiconCount);
                    // v6's repair resyncs lexicon_spelling from glyph_order, so the
                    // index holds exactly the grapheme entries the words spell with.
                    const graphemeEntries = [SEED.word1GlyphOrder, SEED.word2GlyphOrder]
                        .flat()
                        .filter((e: string) => e.startsWith('grapheme-')).length;
                    expect(count(db, 'lexicon_spelling')).toBe(graphemeEntries);
                    expect(count(db, 'lexicon_ancestry')).toBe(1);
                    expect(glyphOrderOf(db, 1)).toEqual(SEED.word1GlyphOrder);
                    expect(glyphOrderOf(db, 2)).toEqual(SEED.word2GlyphOrder);
                    expect(scalar(db, 'SELECT meaning FROM lexicon_meanings WHERE lexicon_id = 1')).toBe(SEED.word1Meaning);
                    expect(count(db, 'lexicon_meanings')).toBe(1);
                    // closure rebuilt by v6 from the adjacency list
                    expect(db.exec('SELECT ancestor_id, descendant_id, depth FROM lexicon_ancestry_closure')[0].values)
                        .toEqual([[1, 2, 1]]);
                } else {
                    expect(count(db, 'lexicon')).toBe(0);
                }
            });

            it('is idempotent: a second run applies nothing', async () => {
                const db = await openFixture(key);
                runMigrations(db);
                expect(runMigrations(db)).toEqual({
                    from: CURRENT_SCHEMA_VERSION,
                    to: CURRENT_SCHEMA_VERSION,
                    applied: [],
                });
            });

            it('the stamp survives an export/open round trip', async () => {
                const db = await openFixture(key);
                runMigrations(db);
                const bytes = db.export();
                const reopened = await openFresh(bytes);
                expect(readUserVersion(reopened)).toBe(CURRENT_SCHEMA_VERSION);
                expect(runMigrations(reopened).applied).toEqual([]);
            });
        });
    }
});

describe('specific migration behaviours', () => {
    it('v4 backfills glyph_order from lexicon_spelling (spelling lived only in the junction)', async () => {
        const db = await openFixture('lexiconNoClosure');
        expect(columnExists(db, 'lexicon', 'glyph_order')).toBe(false);
        runMigrations(db);
        expect(glyphOrderOf(db, 1)).toEqual(['grapheme-1', 'grapheme-2']);
        expect(glyphOrderOf(db, 2)).toEqual(['grapheme-1', 'grapheme-2', 'grapheme-1']);
        expect(scalar(db, 'SELECT needs_attention FROM lexicon WHERE id = 1')).toBe(0);
    });

    it('v4 leaves glyph_order at the default for a word with no junction rows', async () => {
        const db = await openFixture('lexiconNoClosure', raw => {
            raw.run(`INSERT INTO lexicon (id, lemma) VALUES (3, 'unspelled')`);
        });
        runMigrations(db);
        expect(glyphOrderOf(db, 3)).toEqual([]);
    });

    it('v5 turns lexicon.meaning into a lexicon_meanings row (NULL meanings get none)', async () => {
        const db = await openFixture('noMeanings');
        expect(tableExists(db, 'lexicon_meanings')).toBe(false);
        runMigrations(db);
        expect(db.exec('SELECT lexicon_id, meaning, definition_order FROM lexicon_meanings')[0].values)
            .toEqual([[1, SEED.word1Meaning, 0]]);
    });

    it('v6 replaces the contradictory SET NULL FK with CASCADE and keeps the rows', async () => {
        const db = await openFixture('preV6');
        expect(ancestorFkOnDelete(db)).toBe('SET NULL');
        const before = db.exec('SELECT id, lexicon_id, ancestor_id, position, ancestry_type FROM lexicon_ancestry')[0].values;
        runMigrations(db);
        expect(ancestorFkOnDelete(db)).toBe('CASCADE');
        expect(db.exec('SELECT id, lexicon_id, ancestor_id, position, ancestry_type FROM lexicon_ancestry')[0].values)
            .toEqual(before);
        // Indexes were recreated on the renamed table
        const indexes = db.exec(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'lexicon_ancestry'`)[0].values.map(r => r[0]);
        expect(indexes).toEqual(expect.arrayContaining(['idx_lexicon_ancestry_lexicon', 'idx_lexicon_ancestry_ancestor']));
        expect(tableExists(db, 'lexicon_ancestry_v6')).toBe(false);
    });

    it('after v6, deleting an ancestor cascades to the ancestry row (it used to fail NOT NULL)', async () => {
        const db = await openFixture('preV6');
        runMigrations(db);
        db.run('DELETE FROM lexicon WHERE id = 1');
        expect(count(db, 'lexicon_ancestry')).toBe(0);
        expect(count(db, 'lexicon')).toBe(1);
        expect(fkViolations(db)).toBe(0);
    });

    it('v6 repairs orphans left by the FK-off era', async () => {
        const db = await openFixture('preV6', raw => {
            raw.run('PRAGMA foreign_keys = OFF');
            // spelling row for a word that no longer exists
            raw.run(`INSERT INTO lexicon_spelling (lexicon_id, grapheme_id, position) VALUES (99, 1, 0)`);
            // a word whose glyph_order names a grapheme that was deleted
            raw.run(`UPDATE lexicon SET glyph_order = ? WHERE id = 2`, [JSON.stringify(['grapheme-1', 'grapheme-77'])]);
            // closure row for a missing word
            raw.run(`INSERT INTO lexicon_ancestry_closure (ancestor_id, descendant_id, depth) VALUES (42, 2, 1)`);
            raw.run('PRAGMA foreign_keys = ON');
        });
        expect(fkViolations(db)).toBeGreaterThan(0);

        const result = runMigrations(db);
        expect(result.applied).toEqual([6]);
        expect(fkViolations(db)).toBe(0);
        // The repair resyncs the derived spelling index from the (repaired) glyph_order.
        const expectedSpellingRows = [glyphOrderOf(db, 1), glyphOrderOf(db, 2)]
            .flat()
            .filter((e: string) => e.startsWith('grapheme-')).length;
        expect(count(db, 'lexicon_spelling')).toBe(expectedSpellingRows);
        expect(glyphOrderOf(db, 2)).toEqual(['grapheme-1', MISSING_GRAPHEME_PLACEHOLDER]);
        expect(scalar(db, 'SELECT needs_attention FROM lexicon WHERE id = 2')).toBe(1);
        expect(scalar(db, 'SELECT needs_attention FROM lexicon WHERE id = 1')).toBe(0);
        expect(db.exec('SELECT ancestor_id, descendant_id, depth FROM lexicon_ancestry_closure')[0].values)
            .toEqual([[1, 2, 1]]);
    });

    it('a failing migration rolls back, keeps the previous stamp and restores foreign_keys', async () => {
        // Drop `ancestry_type` so v6's INSERT ... SELECT fails mid-rebuild.
        const db = await openFixture('preV6', raw => {
            raw.run('ALTER TABLE lexicon_ancestry DROP COLUMN ancestry_type');
        });
        expect(() => runMigrations(db)).toThrow(/ancestry_type/);
        // Nothing committed, so the (unversioned) file is still unstamped and
        // re-detects at the same version on the next attempt.
        expect(readUserVersion(db)).toBe(0);
        expect(detectLegacySchemaVersion(db)).toBe(5);
        expect(tableExists(db, 'lexicon_ancestry')).toBe(true);
        expect(tableExists(db, 'lexicon_ancestry_v6')).toBe(false);
        expect(count(db, 'lexicon_ancestry')).toBe(1);
        expect(scalar(db, 'PRAGMA foreign_keys')).toBe(1);
    });

    it('refuses a database from a newer build', async () => {
        const db = await openFresh();
        db.run(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 1}`);
        expect(() => runMigrations(db)).toThrow(/newer than this build/);
    });
});
