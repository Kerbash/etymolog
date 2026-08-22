/**
 * Schema migration registry
 *
 * Every database carries its schema version in `PRAGMA user_version`:
 *
 *   - `createSchema()` (fresh databases) stamps `CURRENT_SCHEMA_VERSION`.
 *   - `runMigrations()` reads the stamp, applies every `MIGRATIONS` entry with
 *     a higher version — each inside its own transaction together with the
 *     `user_version` bump, so a crash mid-migration leaves the previous stamp
 *     and the previous data — and reports what it did.
 *   - Files written before Phase 2 have `user_version = 0`. For those,
 *     `detectLegacySchemaVersion()` probes `sqlite_master` / `table_info` the
 *     way the old boot-time if-chains did and returns the version the file is
 *     AT, so the registry resumes from the right entry.
 *
 * Numbering: migration `N` upgrades a version `N-1` database to version `N`.
 * Version 0 is the original Glyph/Grapheme/Phoneme schema without category
 * columns (or no Etymolog schema at all).
 *
 * `PRAGMA foreign_keys` is a no-op inside a transaction, so a migration that
 * rebuilds a table sets `foreignKeysOff: true` and the runner toggles the
 * pragma OUTSIDE the transaction; the migration itself must finish with a
 * `PRAGMA foreign_key_check` so an inconsistent rebuild rolls back instead
 * of committing.
 *
 * Adding a migration: append to `MIGRATIONS`, bump `CURRENT_SCHEMA_VERSION`
 * in `./version.ts`, and update `createSchema()` so a fresh database matches
 * a migrated one. `migrations.test.ts` covers both paths.
 */

import type { Database } from 'sql.js';
import { dbLog } from '../utils/logger';
import { withTransaction } from '../utils/transaction';
import { createLexiconAncestryIndexes, createLexiconAncestryTable, createSchema } from './schema';
import { repairOrphans } from './repair';
import { CURRENT_SCHEMA_VERSION } from './version';

export { CURRENT_SCHEMA_VERSION } from './version';
export { createSchema } from './schema';
export { repairOrphans, MISSING_GRAPHEME_PLACEHOLDER, type RepairReport } from './repair';

export interface Migration {
    /** The schema version this migration produces. */
    version: number;
    description: string;
    /**
     * Run with `PRAGMA foreign_keys = OFF` (toggled outside the transaction).
     * Required for the SQLite table-rebuild recipe; the migration must end
     * with its own `PRAGMA foreign_key_check`.
     */
    foreignKeysOff?: boolean;
    up(database: Database): void;
}

export interface MigrationResult {
    /** Version the database was at before the run (detected for unversioned files). */
    from: number;
    /** Version after the run — always `CURRENT_SCHEMA_VERSION` on success. */
    to: number;
    /** Versions applied during this run, in order. Empty when nothing was pending. */
    applied: number[];
}

// =============================================================================
// PROBES
// =============================================================================

export function readUserVersion(database: Database): number {
    const result = database.exec('PRAGMA user_version');
    return result.length > 0 ? Number(result[0].values[0][0]) : 0;
}

export function tableExists(database: Database, table: string): boolean {
    const result = database.exec(
        `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
        [table]
    );
    return result.length > 0 && result[0].values.length > 0;
}

export function columnExists(database: Database, table: string, column: string): boolean {
    const result = database.exec(`PRAGMA table_info(${table})`);
    return result.length > 0 && result[0].values.some(row => row[1] === column);
}

function foreignKeyViolationCount(database: Database): number {
    const result = database.exec('PRAGMA foreign_key_check');
    return result.length === 0 ? 0 : result[0].values.length;
}

/**
 * Which schema version an UNVERSIONED (`user_version = 0`) file is at, decided
 * by the same structural probes the pre-Phase-2 boot code used. Returns 0 for
 * a database without a `glyphs` table — callers treat that as "no Etymolog
 * schema" and create one rather than migrate.
 */
export function detectLegacySchemaVersion(database: Database): number {
    if (!tableExists(database, 'glyphs')) return 0;
    if (!columnExists(database, 'glyphs', 'category')) return 0;
    if (!tableExists(database, 'lexicon')) return 1;
    if (!tableExists(database, 'lexicon_ancestry_closure')) return 2;
    if (!columnExists(database, 'lexicon', 'glyph_order')) return 3;
    if (!tableExists(database, 'lexicon_meanings')) return 4;
    return 5;
}

// =============================================================================
// REGISTRY
// =============================================================================

export const MIGRATIONS: Migration[] = [
    {
        version: 1,
        description: 'Add category columns to glyphs and graphemes',
        up(database) {
            // Add category column to glyphs table
            database.run(`ALTER TABLE glyphs ADD COLUMN category TEXT`);
            // Add category column to graphemes table
            database.run(`ALTER TABLE graphemes ADD COLUMN category TEXT`);
        },
    },
    {
        version: 2,
        description: 'Create lexicon, lexicon_spelling and lexicon_ancestry tables',
        up(database) {
            // Lexicon table - vocabulary entries
            database.run(`
                CREATE TABLE IF NOT EXISTS lexicon (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    lemma TEXT NOT NULL,
                    pronunciation TEXT,
                    is_native INTEGER DEFAULT 1,
                    auto_spell INTEGER DEFAULT 1,
                    meaning TEXT,
                    part_of_speech TEXT,
                    notes TEXT,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                )
            `);

            // Indexes for lexicon
            database.run(`
                CREATE INDEX IF NOT EXISTS idx_lexicon_lemma
                ON lexicon(lemma)
            `);
            database.run(`
                CREATE INDEX IF NOT EXISTS idx_lexicon_is_native
                ON lexicon(is_native)
            `);

            // Junction table: lexicon_spelling (ordered grapheme spelling)
            database.run(`
                CREATE TABLE IF NOT EXISTS lexicon_spelling (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    lexicon_id INTEGER NOT NULL,
                    grapheme_id INTEGER NOT NULL,
                    position INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (lexicon_id) REFERENCES lexicon(id) ON DELETE CASCADE,
                    FOREIGN KEY (grapheme_id) REFERENCES graphemes(id) ON DELETE RESTRICT,
                    UNIQUE(lexicon_id, grapheme_id, position)
                )
            `);

            // Indexes for lexicon_spelling
            database.run(`
                CREATE INDEX IF NOT EXISTS idx_lexicon_spelling_lexicon
                ON lexicon_spelling(lexicon_id)
            `);
            database.run(`
                CREATE INDEX IF NOT EXISTS idx_lexicon_spelling_position
                ON lexicon_spelling(lexicon_id, position)
            `);

            // Junction table: lexicon_ancestry (etymological relationships)
            // Historical definition, kept verbatim: the contradictory
            // `NOT NULL ... ON DELETE SET NULL` on ancestor_id is fixed by v6.
            database.run(`
                CREATE TABLE IF NOT EXISTS lexicon_ancestry (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    lexicon_id INTEGER NOT NULL,
                    ancestor_id INTEGER NOT NULL,
                    position INTEGER NOT NULL DEFAULT 0,
                    ancestry_type TEXT DEFAULT 'derived',
                    FOREIGN KEY (lexicon_id) REFERENCES lexicon(id) ON DELETE CASCADE,
                    FOREIGN KEY (ancestor_id) REFERENCES lexicon(id) ON DELETE SET NULL,
                    UNIQUE(lexicon_id, ancestor_id)
                )
            `);

            // Indexes for lexicon_ancestry
            database.run(`
                CREATE INDEX IF NOT EXISTS idx_lexicon_ancestry_lexicon
                ON lexicon_ancestry(lexicon_id)
            `);
            database.run(`
                CREATE INDEX IF NOT EXISTS idx_lexicon_ancestry_ancestor
                ON lexicon_ancestry(ancestor_id)
            `);
        },
    },
    {
        version: 3,
        description: 'Create the lexicon_ancestry_closure table',
        up(database) {
            database.run(`
                CREATE TABLE IF NOT EXISTS lexicon_ancestry_closure (
                    ancestor_id INTEGER NOT NULL,
                    descendant_id INTEGER NOT NULL,
                    depth INTEGER NOT NULL,
                    PRIMARY KEY (ancestor_id, descendant_id),
                    FOREIGN KEY (ancestor_id) REFERENCES lexicon(id) ON DELETE CASCADE,
                    FOREIGN KEY (descendant_id) REFERENCES lexicon(id) ON DELETE CASCADE
                )
            `);
            database.run(`
                CREATE INDEX IF NOT EXISTS idx_closure_ancestor
                ON lexicon_ancestry_closure(ancestor_id)
            `);
            database.run(`
                CREATE INDEX IF NOT EXISTS idx_closure_descendant
                ON lexicon_ancestry_closure(descendant_id)
            `);
        },
    },
    {
        version: 4,
        description: 'Add lexicon.glyph_order and needs_attention, backfill from lexicon_spelling',
        up(database) {
            // Add glyph_order column
            database.run(`ALTER TABLE lexicon ADD COLUMN glyph_order TEXT DEFAULT '[]'`);
            // Add needs_attention column
            database.run(`ALTER TABLE lexicon ADD COLUMN needs_attention INTEGER DEFAULT 0`);

            // Migrate existing lexicon_spelling data to glyph_order
            // For each lexicon entry, read its spelling and convert to glyph_order format
            const lexiconEntries = database.exec(`SELECT id FROM lexicon`);
            if (lexiconEntries.length > 0 && lexiconEntries[0].values.length > 0) {
                for (const row of lexiconEntries[0].values) {
                    const lexiconId = row[0] as number;
                    // Get ordered grapheme IDs for this lexicon
                    const spellingResult = database.exec(`
                        SELECT grapheme_id FROM lexicon_spelling
                        WHERE lexicon_id = ?
                        ORDER BY position ASC
                    `, [lexiconId]);

                    if (spellingResult.length > 0 && spellingResult[0].values.length > 0) {
                        const graphemeIds = spellingResult[0].values.map(r => r[0] as number);
                        // Convert to glyph_order format: ["grapheme-1", "grapheme-2", ...]
                        const glyphOrder = graphemeIds.map(id => `grapheme-${id}`);
                        const glyphOrderJson = JSON.stringify(glyphOrder);
                        database.run(`UPDATE lexicon SET glyph_order = ? WHERE id = ?`, [glyphOrderJson, lexiconId]);
                    }
                }
                dbLog.info('Migrated existing lexicon spelling to glyph_order format');
            }

            // Index for needs_attention (the old boot code created it unconditionally)
            database.run(`
                CREATE INDEX IF NOT EXISTS idx_lexicon_needs_attention
                ON lexicon(needs_attention)
            `);
        },
    },
    {
        version: 5,
        description: 'Create lexicon_meanings and backfill from lexicon.meaning',
        up(database) {
            // Create lexicon_meanings table
            database.run(`
                CREATE TABLE IF NOT EXISTS lexicon_meanings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    lexicon_id INTEGER NOT NULL,
                    meaning TEXT NOT NULL,
                    part_of_speech TEXT,
                    usage_notes TEXT,
                    definition_order INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (lexicon_id) REFERENCES lexicon(id) ON DELETE CASCADE
                )
            `);

            // Create indexes
            database.run(`
                CREATE INDEX IF NOT EXISTS idx_lexicon_meanings_lexicon
                ON lexicon_meanings(lexicon_id)
            `);
            database.run(`
                CREATE INDEX IF NOT EXISTS idx_lexicon_meanings_order
                ON lexicon_meanings(lexicon_id, definition_order)
            `);

            // Migrate existing meanings from lexicon.meaning to lexicon_meanings
            // For each lexicon entry with a non-null meaning, create a corresponding row
            const lexiconEntries = database.exec(`
                SELECT id, meaning FROM lexicon WHERE meaning IS NOT NULL
            `);

            if (lexiconEntries.length > 0 && lexiconEntries[0].values.length > 0) {
                for (const row of lexiconEntries[0].values) {
                    const lexiconId = row[0] as number;
                    const meaning = row[1] as string;

                    database.run(
                        `INSERT INTO lexicon_meanings (lexicon_id, meaning, definition_order)
                         VALUES (?, ?, 0)`,
                        [lexiconId, meaning]
                    );
                }
                dbLog.info('Migrated existing meanings to lexicon_meanings table');
            }
        },
    },
    {
        version: 6,
        description: 'Rebuild lexicon_ancestry with ON DELETE CASCADE on ancestor_id; repair orphans; rebuild closure',
        foreignKeysOff: true,
        up(database) {
            // SQLite table-rebuild recipe (lang_altertable.html#otheralter):
            // create the new shape under a temporary name, copy, drop, rename,
            // recreate indexes. The runner has FKs OFF so the DROP/RENAME do
            // not trip constraint checks against the half-built state.
            const temp = 'lexicon_ancestry_v6';
            database.run(`DROP TABLE IF EXISTS ${temp}`);
            createLexiconAncestryTable(database, temp);
            database.run(`
                INSERT INTO ${temp} (id, lexicon_id, ancestor_id, position, ancestry_type)
                SELECT id, lexicon_id, ancestor_id, position, ancestry_type
                FROM lexicon_ancestry
                WHERE ancestor_id IS NOT NULL
            `);
            database.run('DROP TABLE lexicon_ancestry');
            database.run(`ALTER TABLE ${temp} RENAME TO lexicon_ancestry`);
            createLexiconAncestryIndexes(database);

            // FKs were never enforced before Phase 1, so older files may carry
            // orphans that would make a later DELETE fail. Prune them now; this
            // also rebuilds the closure table from the repaired adjacency list.
            const report = repairOrphans(database);
            if (report.total > 0) {
                dbLog.info('Migration v6 repaired orphaned rows:', report);
            }

            // The runner cannot check inside the transaction for us (the
            // pragma toggle lives outside it); an inconsistent result must
            // throw here so the whole migration rolls back.
            const violations = foreignKeyViolationCount(database);
            if (violations > 0) {
                throw new Error(`Migration v6 left ${violations} foreign-key violation(s)`);
            }
        },
    },
];

// Registry sanity: consecutive versions from 1, ending at CURRENT_SCHEMA_VERSION.
MIGRATIONS.forEach((migration, index) => {
    if (migration.version !== index + 1) {
        throw new Error(`MIGRATIONS[${index}] has version ${migration.version}, expected ${index + 1}`);
    }
});
if (MIGRATIONS[MIGRATIONS.length - 1].version !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
        `CURRENT_SCHEMA_VERSION is ${CURRENT_SCHEMA_VERSION} but the last migration is v${MIGRATIONS[MIGRATIONS.length - 1].version}`
    );
}

// =============================================================================
// RUNNER
// =============================================================================

/**
 * Bring `database` to `CURRENT_SCHEMA_VERSION`.
 *
 * - Unversioned files are detected (see `detectLegacySchemaVersion`); one
 *   without any Etymolog schema gets `createSchema()` instead.
 * - Each pending migration runs in its own transaction together with its
 *   `PRAGMA user_version` bump.
 * - Idempotent: a second call applies nothing.
 *
 * @throws if the file is from a NEWER build than this one, or a migration fails
 *         (the failing migration is rolled back; earlier ones stay applied).
 */
export function runMigrations(database: Database): MigrationResult {
    let from = readUserVersion(database);

    if (from === 0) {
        if (!tableExists(database, 'glyphs')) {
            dbLog.info('No Etymolog schema found; creating the current schema');
            withTransaction(database, () => createSchema(database));
            return { from: 0, to: readUserVersion(database), applied: [] };
        }
        from = detectLegacySchemaVersion(database);
        dbLog.info(`Unversioned database detected as schema v${from}`);
    }

    if (from > CURRENT_SCHEMA_VERSION) {
        throw new Error(
            `Database schema v${from} is newer than this build supports (v${CURRENT_SCHEMA_VERSION})`
        );
    }

    const applied: number[] = [];
    for (const migration of MIGRATIONS) {
        if (migration.version <= from) continue;

        dbLog.info(`Applying migration v${migration.version}: ${migration.description}`);
        if (migration.foreignKeysOff) {
            database.run('PRAGMA foreign_keys = OFF');
        }
        try {
            withTransaction(database, () => {
                migration.up(database);
                database.run(`PRAGMA user_version = ${migration.version}`);
            });
        } finally {
            if (migration.foreignKeysOff) {
                database.run('PRAGMA foreign_keys = ON');
            }
        }
        applied.push(migration.version);
    }

    const to = readUserVersion(database);
    if (applied.length > 0) {
        dbLog.info(`Schema migrated v${from} -> v${to} (applied: ${applied.join(', ')})`);
    }
    return { from, to, applied };
}
