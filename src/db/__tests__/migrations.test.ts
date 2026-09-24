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
import { withTransaction } from '../utils/transaction';
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
    V8_SEED,
    buildLegacyBytes,
    buildV8Bytes,
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
        expect(CURRENT_SCHEMA_VERSION).toBe(9);
    });

    it('only the table rebuilds (v6 lexicon_ancestry, v9 grapheme_glyphs) need foreign keys off', () => {
        expect(MIGRATIONS.filter(m => m.foreignKeysOff).map(m => m.version)).toEqual([6, 9]);
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
                    'glyph_folders', 'glyphs', 'grapheme_folders', 'graphemes',
                    'variant_groups', 'grapheme_variants', 'grapheme_glyphs', 'block_scheme', 'phonemes',
                    'lexicon', 'lexicon_spelling', 'lexicon_ancestry',
                    'lexicon_ancestry_closure', 'lexicon_meanings', 'lexicon_folders',
                ]) {
                    expect(tableExists(db, table), table).toBe(true);
                }
                expect(columnExists(db, 'glyphs', 'category')).toBe(true);
                expect(columnExists(db, 'graphemes', 'category')).toBe(true);
                expect(columnExists(db, 'glyphs', 'folder_id')).toBe(true);
                expect(columnExists(db, 'graphemes', 'folder_id')).toBe(true);
                expect(columnExists(db, 'lexicon', 'glyph_order')).toBe(true);
                expect(columnExists(db, 'lexicon', 'needs_attention')).toBe(true);
                expect(columnExists(db, 'lexicon', 'folder_id')).toBe(true);
                expect(columnExists(db, 'grapheme_glyphs', 'variant_id')).toBe(true);
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
                // v9: one default variant per grapheme, every glyph row on it.
                expect(count(db, 'grapheme_variants')).toBe(SEED.graphemeCount);
                expect(scalar(db, 'SELECT COUNT(*) FROM grapheme_variants WHERE is_default = 1')).toBe(SEED.graphemeCount);
                expect(scalar(db, `
                    SELECT COUNT(*) FROM grapheme_glyphs gg
                    JOIN grapheme_variants v ON v.id = gg.variant_id AND v.grapheme_id = gg.grapheme_id AND v.is_default = 1
                `)).toBe(3);
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
        expect(result.applied).toEqual([6, 7, 8, 9]);
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

// =============================================================================
// SCHEMA-STRUCTURE SNAPSHOT (formatting-independent fresh-vs-migrated equality)
// =============================================================================

/**
 * A structural fingerprint of the whole schema that ignores the SQL TEXT (so
 * `IF NOT EXISTS`, whitespace, and inline-vs-ALTER column placement do not
 * matter) but captures everything that affects behaviour: the set of tables,
 * each table's columns (name/type/notnull/default/pk), its foreign keys, and
 * its indexes with their columns. Two databases with the same fingerprint are
 * schema-equivalent.
 */
function schemaFingerprint(db: Database): unknown {
    const tableRows = db.exec(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
    const tables = tableRows.length > 0 ? tableRows[0].values.map(r => r[0] as string) : [];

    const perTable: Record<string, unknown> = {};
    for (const table of tables) {
        const columns = (db.exec(`PRAGMA table_info(${table})`)[0]?.values ?? [])
            .map(r => ({ name: r[1], type: r[2], notnull: r[3], dflt: r[4], pk: r[5] }))
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));

        const fks = (db.exec(`PRAGMA foreign_key_list(${table})`)[0]?.values ?? [])
            .map(r => ({ table: r[2], from: r[3], to: r[4], on_update: r[5], on_delete: r[6] }))
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

        const indexes = (db.exec(`PRAGMA index_list(${table})`)[0]?.values ?? [])
            .map(r => {
                const indexName = r[1] as string;
                const cols = (db.exec(`PRAGMA index_info(${indexName})`)[0]?.values ?? []).map(c => c[2]);
                return { name: indexName, unique: r[2], origin: r[3], columns: cols };
            })
            .sort((a, b) => a.name.localeCompare(b.name));

        perTable[table] = { columns, fks, indexes };
    }

    return { tables, perTable };
}

describe('fresh createSchema vs fully-migrated schema equality', () => {
    it('a fresh database is structurally identical to a migrated one (modulo SQL text)', async () => {
        const fresh = await openFresh();
        const migrated = await openFixture('preV6');
        runMigrations(migrated);

        expect(readUserVersion(fresh)).toBe(CURRENT_SCHEMA_VERSION);
        expect(readUserVersion(migrated)).toBe(CURRENT_SCHEMA_VERSION);
        expect(schemaFingerprint(migrated)).toEqual(schemaFingerprint(fresh));
    });
});

describe('migration v7 (nested folders) on a populated v6 database', () => {
    /** Bring an unversioned preV6 fixture to a stamped, populated schema v6. */
    async function openPopulatedV6(): Promise<Database> {
        const db = await openFixture('preV6');
        const v6 = MIGRATIONS.find(m => m.version === 6)!;
        db.run('PRAGMA foreign_keys = OFF');
        try {
            withTransaction(db, () => {
                v6.up(db);
                db.run('PRAGMA user_version = 6');
            });
        } finally {
            db.run('PRAGMA foreign_keys = ON');
        }
        return db;
    }

    it('a populated v6 DB has neither the folders table nor folder_id yet', async () => {
        const db = await openPopulatedV6();
        expect(readUserVersion(db)).toBe(6);
        expect(tableExists(db, 'lexicon_folders')).toBe(false);
        expect(columnExists(db, 'lexicon', 'folder_id')).toBe(false);
    });

    it('applies exactly v7 (then v8) and adds the folders table + column, data intact', async () => {
        const db = await openPopulatedV6();
        const result = runMigrations(db);
        expect(result).toEqual({ from: 6, to: CURRENT_SCHEMA_VERSION, applied: [7, 8, 9] });

        expect(tableExists(db, 'lexicon_folders')).toBe(true);
        expect(columnExists(db, 'lexicon', 'folder_id')).toBe(true);
        expect(fkViolations(db)).toBe(0);
        expect(scalar(db, 'PRAGMA foreign_keys')).toBe(1);

        // The seeded words survive and default to the root (folder_id NULL).
        expect(count(db, 'lexicon')).toBe(SEED.lexiconCount);
        expect(scalar(db, 'SELECT COUNT(*) FROM lexicon WHERE folder_id IS NULL')).toBe(SEED.lexiconCount);
        expect(count(db, 'lexicon_folders')).toBe(0);

        // folder_id honours the FK once folders exist.
        db.run(`INSERT INTO lexicon_folders (id, name) VALUES (1, 'Nouns')`);
        db.run('UPDATE lexicon SET folder_id = 1 WHERE id = 1');
        expect(scalar(db, 'SELECT folder_id FROM lexicon WHERE id = 1')).toBe(1);
        // Deleting the folder SET-NULLs the word (never deletes it).
        db.run('DELETE FROM lexicon_folders WHERE id = 1');
        expect(scalar(db, 'SELECT folder_id FROM lexicon WHERE id = 1')).toBe(null);
        expect(count(db, 'lexicon')).toBe(SEED.lexiconCount);
        expect(fkViolations(db)).toBe(0);
    });

    it('is idempotent: a second run after v7 applies nothing', async () => {
        const db = await openPopulatedV6();
        runMigrations(db);
        expect(runMigrations(db)).toEqual({
            from: CURRENT_SCHEMA_VERSION,
            to: CURRENT_SCHEMA_VERSION,
            applied: [],
        });
    });
});

describe('migration v8 (glyph + grapheme folders) on a populated v7 database', () => {
    /** Bring an unversioned preV6 fixture to a stamped, populated schema v7. */
    async function openPopulatedV7(): Promise<Database> {
        const db = await openFixture('preV6');
        for (const version of [6, 7]) {
            const migration = MIGRATIONS.find(m => m.version === version)!;
            if (migration.foreignKeysOff) db.run('PRAGMA foreign_keys = OFF');
            try {
                withTransaction(db, () => {
                    migration.up(db);
                    db.run(`PRAGMA user_version = ${version}`);
                });
            } finally {
                if (migration.foreignKeysOff) db.run('PRAGMA foreign_keys = ON');
            }
        }
        return db;
    }

    it('a populated v7 DB has neither glyph/grapheme folder tables nor their folder_id yet', async () => {
        const db = await openPopulatedV7();
        expect(readUserVersion(db)).toBe(7);
        expect(tableExists(db, 'glyph_folders')).toBe(false);
        expect(tableExists(db, 'grapheme_folders')).toBe(false);
        expect(columnExists(db, 'glyphs', 'folder_id')).toBe(false);
        expect(columnExists(db, 'graphemes', 'folder_id')).toBe(false);
        // The lexicon side (v7) is already there.
        expect(tableExists(db, 'lexicon_folders')).toBe(true);
        expect(columnExists(db, 'lexicon', 'folder_id')).toBe(true);
    });

    it('applies exactly v8 and adds the two folder tables + columns, data intact', async () => {
        const db = await openPopulatedV7();
        const result = runMigrations(db);
        expect(result).toEqual({ from: 7, to: CURRENT_SCHEMA_VERSION, applied: [8, 9] });

        expect(tableExists(db, 'glyph_folders')).toBe(true);
        expect(tableExists(db, 'grapheme_folders')).toBe(true);
        expect(columnExists(db, 'glyphs', 'folder_id')).toBe(true);
        expect(columnExists(db, 'graphemes', 'folder_id')).toBe(true);
        expect(fkViolations(db)).toBe(0);
        expect(scalar(db, 'PRAGMA foreign_keys')).toBe(1);

        // The seeded glyphs/graphemes survive and default to the root (NULL).
        expect(count(db, 'glyphs')).toBe(SEED.glyphCount);
        expect(count(db, 'graphemes')).toBe(SEED.graphemeCount);
        expect(scalar(db, 'SELECT COUNT(*) FROM glyphs WHERE folder_id IS NULL')).toBe(SEED.glyphCount);
        expect(scalar(db, 'SELECT COUNT(*) FROM graphemes WHERE folder_id IS NULL')).toBe(SEED.graphemeCount);
        expect(count(db, 'glyph_folders')).toBe(0);
        expect(count(db, 'grapheme_folders')).toBe(0);

        // folder_id honours the FK once folders exist; deleting the folder
        // SET-NULLs the item (never deletes it).
        db.run(`INSERT INTO glyph_folders (id, name) VALUES (1, 'Shapes')`);
        db.run('UPDATE glyphs SET folder_id = 1 WHERE id = 1');
        expect(scalar(db, 'SELECT folder_id FROM glyphs WHERE id = 1')).toBe(1);
        db.run('DELETE FROM glyph_folders WHERE id = 1');
        expect(scalar(db, 'SELECT folder_id FROM glyphs WHERE id = 1')).toBe(null);
        expect(count(db, 'glyphs')).toBe(SEED.glyphCount);
        expect(fkViolations(db)).toBe(0);
    });

    it('is a full path from v6: preV6 migrates straight to the current version', async () => {
        const db = await openFixture('preV6');
        const result = runMigrations(db);
        expect(result).toEqual({ from: 5, to: CURRENT_SCHEMA_VERSION, applied: [6, 7, 8, 9] });
        expect(tableExists(db, 'glyph_folders')).toBe(true);
        expect(tableExists(db, 'grapheme_folders')).toBe(true);
    });
});

// =============================================================================
// MIGRATION v9 (grapheme variants, variant groups, block scheme)
// =============================================================================

describe('migration v9 (grapheme variants) on a populated v8 database', () => {
    async function openV8(mutate?: (db: Database) => void): Promise<Database> {
        return openFresh(await buildV8Bytes(MIGRATIONS, mutate));
    }

    /** `sqlite_master.sql` with runs of whitespace collapsed. */
    function masterSql(db: Database, type: 'table' | 'index', name: string): string | undefined {
        const sql = scalar(db, 'SELECT sql FROM sqlite_master WHERE type = ? AND name = ?', [type, name]) as string | undefined;
        return sql?.replace(/\s+/g, ' ').trim();
    }

    it('the v8 fixture is stamped v8 and has no variant tables yet', async () => {
        const db = await openV8();
        expect(readUserVersion(db)).toBe(8);
        expect(tableExists(db, 'grapheme_variants')).toBe(false);
        expect(tableExists(db, 'variant_groups')).toBe(false);
        expect(tableExists(db, 'block_scheme')).toBe(false);
        expect(columnExists(db, 'grapheme_glyphs', 'variant_id')).toBe(false);
    });

    it('applies exactly v9 and gives each grapheme one default variant holding its glyph rows', async () => {
        const db = await openV8();
        expect(runMigrations(db)).toEqual({ from: 8, to: CURRENT_SCHEMA_VERSION, applied: [9] });

        const variants = db.exec(
            'SELECT grapheme_id, name, is_default, sort_order, group_id FROM grapheme_variants ORDER BY grapheme_id'
        )[0].values;
        expect(variants).toEqual([
            [1, 'Default', 1, 0, null],
            [2, 'Default', 1, 0, null],
        ]);

        // Ids, graphemes, glyphs and positions preserved; each row points at
        // its grapheme's default variant.
        const rows = db.exec(`
            SELECT gg.id, gg.grapheme_id, gg.glyph_id, gg.position, v.grapheme_id AS owner, v.is_default
            FROM grapheme_glyphs gg JOIN grapheme_variants v ON v.id = gg.variant_id
            ORDER BY gg.id
        `)[0].values;
        expect(rows).toEqual(V8_SEED.glyphRows.map(([id, graphemeId, glyphId, position]) =>
            [id, graphemeId, glyphId, position, graphemeId, 1]
        ));
        expect(scalar(db, 'SELECT COUNT(*) FROM grapheme_glyphs WHERE variant_id IS NULL')).toBe(0);

        expect(fkViolations(db)).toBe(0);
        expect(scalar(db, 'PRAGMA foreign_keys')).toBe(1);
        expect(tableExists(db, 'grapheme_glyphs_v8')).toBe(false);
        expect(count(db, 'block_scheme')).toBe(0);
        expect(count(db, 'variant_groups')).toBe(0);
    });

    it('keeps the words, their spellings and the derived index intact', async () => {
        const db = await openV8();
        runMigrations(db);
        expect(glyphOrderOf(db, 1)).toEqual(SEED.word1GlyphOrder);
        expect(glyphOrderOf(db, 2)).toEqual(SEED.word2GlyphOrder);
        expect(glyphOrderOf(db, 3)).toEqual(V8_SEED.word3GlyphOrder);
        expect(db.exec('SELECT grapheme_id, position FROM lexicon_spelling WHERE lexicon_id = 3 ORDER BY position')[0].values)
            .toEqual([[2, 0], [1, 2]]);
    });

    it('preserves the grapheme_glyphs AUTOINCREMENT high-water mark across the rebuild', async () => {
        const db = await openV8();
        runMigrations(db);
        expect(scalar(db, `SELECT seq FROM sqlite_sequence WHERE name = 'grapheme_glyphs'`)).toBe(V8_SEED.graphemeGlyphsSeq);
        expect(scalar(db, `SELECT COUNT(*) FROM sqlite_sequence WHERE name = 'grapheme_glyphs_v8'`)).toBe(0);
        const defaultOf1 = scalar(db, 'SELECT id FROM grapheme_variants WHERE grapheme_id = 1 AND is_default = 1') as number;
        db.run('INSERT INTO grapheme_glyphs (grapheme_id, variant_id, glyph_id, position) VALUES (1, ?, 3, 2)', [defaultOf1]);
        expect(scalar(db, 'SELECT MAX(id) FROM grapheme_glyphs')).toBe(V8_SEED.graphemeGlyphsSeq + 1);
    });

    it('recreates every grapheme_glyphs index on the rebuilt table', async () => {
        const db = await openV8();
        runMigrations(db);
        const indexes = db.exec(
            `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'grapheme_glyphs' AND sql IS NOT NULL ORDER BY name`
        )[0].values.map(r => r[0]);
        expect(indexes).toEqual([
            'idx_grapheme_glyphs_glyph',
            'idx_grapheme_glyphs_grapheme',
            'idx_grapheme_glyphs_position',
            'idx_grapheme_glyphs_variant',
        ]);
    });

    it('drops glyph rows of a grapheme that no longer exists (FK-off era orphans) instead of failing', async () => {
        const db = await openV8(raw => {
            raw.run('PRAGMA foreign_keys = OFF');
            raw.run('INSERT INTO grapheme_glyphs (id, grapheme_id, glyph_id, position) VALUES (7, 99, 1, 0)');
            raw.run('PRAGMA foreign_keys = ON');
        });
        expect(runMigrations(db).applied).toEqual([9]);
        expect(scalar(db, 'SELECT COUNT(*) FROM grapheme_glyphs WHERE grapheme_id = 99')).toBe(0);
        expect(count(db, 'grapheme_glyphs')).toBe(3);
        expect(fkViolations(db)).toBe(0);
    });

    it('a failing v9 rolls back to an intact v8 file', async () => {
        // A column the rebuild's INSERT ... SELECT reads is gone → it throws.
        const db = await openV8(raw => {
            raw.run('ALTER TABLE grapheme_glyphs DROP COLUMN transform');
        });
        expect(() => runMigrations(db)).toThrow(/transform/);
        expect(readUserVersion(db)).toBe(8);
        expect(tableExists(db, 'grapheme_variants')).toBe(false);
        expect(tableExists(db, 'grapheme_glyphs_v8')).toBe(false);
        expect(count(db, 'grapheme_glyphs')).toBe(3);
        expect(scalar(db, 'PRAGMA foreign_keys')).toBe(1);
    });

    it('is idempotent: a second run applies nothing', async () => {
        const db = await openV8();
        runMigrations(db);
        expect(runMigrations(db)).toEqual({ from: CURRENT_SCHEMA_VERSION, to: CURRENT_SCHEMA_VERSION, applied: [] });
    });

    it('fresh and migrated sqlite_master text match for grapheme_glyphs and grapheme_variants (modulo whitespace)', async () => {
        const fresh = await openFresh();
        const migrated = await openV8();
        runMigrations(migrated);
        for (const table of ['grapheme_glyphs', 'grapheme_variants', 'variant_groups', 'block_scheme']) {
            const freshSql = masterSql(fresh, 'table', table);
            expect(freshSql, table).toBeDefined();
            expect(masterSql(migrated, 'table', table), table).toBe(freshSql);
        }
        for (const index of [
            'idx_grapheme_glyphs_grapheme', 'idx_grapheme_glyphs_glyph', 'idx_grapheme_glyphs_position',
            'idx_grapheme_glyphs_variant', 'idx_grapheme_variants_grapheme',
            'idx_grapheme_variants_default', 'idx_grapheme_variants_group',
        ]) {
            expect(masterSql(migrated, 'index', index), index).toBe(masterSql(fresh, 'index', index));
        }
        expect(schemaFingerprint(migrated)).toEqual(schemaFingerprint(fresh));
    });

    it('after v9 a second variant may reuse a glyph at the same position (the UNIQUE the rebuild re-keyed)', async () => {
        const db = await openV8();
        runMigrations(db);
        db.run(`INSERT INTO grapheme_variants (grapheme_id, name, is_default, sort_order) VALUES (1, 'Alt', 0, 1)`);
        const alt = scalar(db, 'SELECT last_insert_rowid()') as number;
        expect(() => db.run(
            'INSERT INTO grapheme_glyphs (grapheme_id, variant_id, glyph_id, position) VALUES (1, ?, 1, 0)', [alt]
        )).not.toThrow();
        // …while the same slot twice in ONE variant is still rejected.
        expect(() => db.run(
            'INSERT INTO grapheme_glyphs (grapheme_id, variant_id, glyph_id, position) VALUES (1, ?, 1, 0)', [alt]
        )).toThrow(/UNIQUE/);
    });

    it('enforces one default per grapheme and cascades a grapheme delete to its variants and glyph rows', async () => {
        const db = await openV8();
        runMigrations(db);
        expect(() => db.run(
            `INSERT INTO grapheme_variants (grapheme_id, name, is_default) VALUES (2, 'Second default', 1)`
        )).toThrow(/UNIQUE/);
        db.run('DELETE FROM lexicon_spelling WHERE grapheme_id = 2');
        db.run('DELETE FROM phonemes WHERE grapheme_id = 2');
        db.run('DELETE FROM graphemes WHERE id = 2');
        expect(scalar(db, 'SELECT COUNT(*) FROM grapheme_variants WHERE grapheme_id = 2')).toBe(0);
        expect(scalar(db, 'SELECT COUNT(*) FROM grapheme_glyphs WHERE grapheme_id = 2')).toBe(0);
        expect(fkViolations(db)).toBe(0);
    });
});
