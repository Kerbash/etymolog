/**
 * SQL.js Database Setup
 *
 * Owns the single in-memory SQLite connection and its lifecycle:
 *
 *   - `initDatabase()`        — idempotent, concurrency-safe boot (loads the last
 *                               good snapshot, falls back to the previous one on
 *                               CRC mismatch, creates a fresh schema otherwise)
 *   - `exportDatabaseBytes()` — THE one place `Database.export()` is called
 *   - `persistDatabase()`     — schedules a debounced durable write
 *   - `persistDatabaseNow()`  — flushes immediately (import / reset / close)
 *   - `getDatabaseHealth()`   — what init found (FK violations, recovery used)
 *
 * Two sql.js facts shape this file — see `exportDatabaseBytes()`:
 *   1. `Database.export()` CLOSES and REOPENS the underlying connection, which
 *      resets every per-connection PRAGMA (`foreign_keys` included). Every
 *      export therefore re-applies `applyConnectionPragmas()`.
 *   2. An `export()` issued inside an open transaction rolls that transaction
 *      back. Exports are refused while `getTransactionDepth() > 0`.
 *
 * Schema DDL lives in `src/db/migrations/schema.ts` and the versioned upgrade
 * path in `src/db/migrations/index.ts` (`PRAGMA user_version` stamping). This
 * file only decides WHEN they run: fresh boot → `createSchema`, loaded
 * snapshot / imported file → `runMigrations` (+ `repairOrphans` on demand).
 */

import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { crc32 } from './exportImport/crc32';
import { dbLog } from './utils/logger';
import { getTransactionDepth, withTransaction } from './utils/transaction';
import {
    CURRENT_SCHEMA_VERSION,
    createSchema,
    repairOrphans,
    runMigrations,
    type MigrationResult,
    type RepairReport,
} from './migrations';
import {
    configurePersistence,
    detachPersistence,
    flushPersist,
    schedulePersist,
    selectStorageAdapter,
    type DbStorageAdapter,
    type StoredDb,
} from './persistence';

// Singleton state
let db: Database | null = null;
let SQL: SqlJsStatic | null = null;
let initPromise: Promise<Database> | null = null;
let activeAdapter: DbStorageAdapter | null = null;

/**
 * Stamped into every persisted snapshot. Always the migration registry's
 * current version — the bytes inside carry the same number in `user_version`.
 */
export const PERSISTED_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

export interface DatabaseHealth {
    /**
     * Rows returned by `PRAGMA foreign_key_check` at boot (or after the last
     * import / repair). Non-zero = orphaned references exist.
     */
    fkViolations: number;
    /** What `runMigrations` did to the loaded snapshot; null for a fresh database. */
    schemaMigration: MigrationResult | null;
    /** The `current` snapshot failed its CRC check. */
    crcMismatch: boolean;
    /** The `previous` snapshot was loaded because `current` was unusable. */
    restoredFromBackup: boolean;
    /** Neither snapshot could be opened; a fresh empty database was created. */
    startedFresh: boolean;
    /** A localStorage database was migrated into IndexedDB during this boot. */
    migratedFromLocalStorage: boolean;
}

let health: DatabaseHealth = {
    fkViolations: 0,
    schemaMigration: null,
    crcMismatch: false,
    restoredFromBackup: false,
    startedFresh: false,
    migratedFromLocalStorage: false,
};

export function getDatabaseHealth(): DatabaseHealth {
    return { ...health };
}

// =============================================================================
// CONNECTION HELPERS
// =============================================================================

/**
 * Per-connection settings. MUST be re-applied after anything that reopens the
 * connection (`export()`), and on every freshly constructed `Database`.
 */
export function applyConnectionPragmas(database: Database): void {
    database.run('PRAGMA foreign_keys = ON');
}

function requireSql(): SqlJsStatic {
    if (!SQL) {
        throw new Error('SQL.js not initialized. Call initDatabase() first.');
    }
    return SQL;
}

/** Construct a connection with the pragmas applied. */
function openConnection(bytes?: Uint8Array): Database {
    const database = bytes ? new (requireSql().Database)(bytes) : new (requireSql().Database)();
    applyConnectionPragmas(database);
    return database;
}

/**
 * Serialise the live database. The ONLY sanctioned call site of `db.export()`.
 *
 * @throws if a transaction is open (export would roll it back)
 */
export function exportDatabaseBytes(): Uint8Array {
    if (!db) {
        throw new Error('Database not initialized');
    }
    if (getTransactionDepth() > 0) {
        throw new Error('Cannot export the database while a transaction is open');
    }
    const bytes = db.export();
    // export() closed and reopened the connection — restore per-connection state.
    applyConnectionPragmas(db);
    return bytes;
}

/** Count of rows from `PRAGMA foreign_key_check` (0 = consistent). */
export function countForeignKeyViolations(database: Database = getDatabase()): number {
    const result = database.exec('PRAGMA foreign_key_check');
    return result.length === 0 ? 0 : result[0].values.length;
}

// =============================================================================
// INITIALISATION
// =============================================================================

/**
 * True under Node (vitest, including happy-dom, which defines `window` but still
 * runs on Node's filesystem). sql.js must then locate its WASM itself rather
 * than through the Vite base URL.
 */
function isNodeRuntime(): boolean {
    const proc = (globalThis as { process?: { versions?: { node?: string } } }).process;
    return typeof proc?.versions?.node === 'string';
}

async function loadSqlJs(): Promise<SqlJsStatic> {
    if (SQL) return SQL;
    SQL = await initSqlJs(isNodeRuntime() ? undefined : {
        locateFile: (file: string) => `${import.meta.env.BASE_URL}${file}`,
    });
    return SQL;
}

interface OpenedSnapshot {
    database: Database;
    migration: MigrationResult;
}

function tryOpenStored(stored: StoredDb, label: string): OpenedSnapshot | null {
    let database: Database | null = null;
    try {
        database = openConnection(stored.bytes);
        const migration = runMigrations(database);
        return { database, migration };
    } catch (error) {
        dbLog.warn(`Failed to open the ${label} snapshot:`, error);
        database?.close();
        return null;
    }
}

function crcMatches(stored: StoredDb): boolean {
    // -1 = no checksum recorded (pre-CRC installs); accept.
    return stored.crc === -1 || crc32(stored.bytes) === stored.crc;
}

async function boot(): Promise<Database> {
    await loadSqlJs();

    const { adapter, migratedFromLocalStorage } = await selectStorageAdapter();
    activeAdapter = adapter;

    const nextHealth: DatabaseHealth = {
        fkViolations: 0,
        schemaMigration: null,
        crcMismatch: false,
        restoredFromBackup: false,
        startedFresh: false,
        migratedFromLocalStorage,
    };

    let opened: OpenedSnapshot | null = null;

    const current = await adapter.load();
    if (current) {
        if (crcMatches(current)) {
            opened = tryOpenStored(current, 'current');
        } else {
            nextHealth.crcMismatch = true;
            dbLog.warn('CRC32 mismatch on the saved database — trying the previous snapshot');
        }
        if (!opened) {
            const previous = await adapter.loadPrevious();
            if (previous && crcMatches(previous)) {
                opened = tryOpenStored(previous, 'previous');
                if (opened) {
                    nextHealth.restoredFromBackup = true;
                    dbLog.warn('Restored the database from the previous snapshot');
                }
            }
            if (!opened && !nextHealth.crcMismatch) {
                // current opened but threw — still treat as recovery attempt
                nextHealth.crcMismatch = true;
            }
        }
    }

    let database: Database;
    if (opened) {
        database = opened.database;
        nextHealth.schemaMigration = opened.migration;
        const { from, to, applied } = opened.migration;
        if (applied.length > 0) {
            dbLog.info(`Schema migrated v${from} -> v${to} (applied v${applied.join(', v')})`);
        } else {
            dbLog.info(`Schema is current (v${to})`);
        }
    } else {
        database = openConnection();
        createSchema(database);
        nextHealth.startedFresh = current !== null;
        if (current) {
            dbLog.warn('Neither snapshot could be opened; starting with an empty database (the bad bytes stay in storage until the next save rotates them out)');
        }
    }

    nextHealth.fkViolations = countForeignKeyViolations(database);
    if (nextHealth.fkViolations > 0) {
        dbLog.warn(`Database has ${nextHealth.fkViolations} foreign-key violation(s); repair is available from the database API`);
    }

    db = database;
    health = nextHealth;

    configurePersistence({
        adapter,
        exportBytes: exportDatabaseBytes,
        schemaVersion: PERSISTED_SCHEMA_VERSION,
    });

    // A recovered, storage-migrated or schema-migrated boot should be written
    // back promptly so the good (and now upgraded) bytes become `current`.
    const schemaChanged = (nextHealth.schemaMigration?.applied.length ?? 0) > 0;
    if (nextHealth.restoredFromBackup || migratedFromLocalStorage || schemaChanged) {
        schedulePersist();
    }

    return database;
}

/**
 * Initialise SQL.js and the database. Safe to call concurrently and repeatedly:
 * every caller during boot shares the same in-flight promise (React StrictMode
 * double-invokes effects; several hooks used to race here and the loser's
 * writes went to a discarded instance).
 */
export function initDatabase(): Promise<Database> {
    if (db) return Promise.resolve(db);
    if (initPromise) return initPromise;
    initPromise = boot().catch(error => {
        initPromise = null;
        throw error;
    });
    return initPromise;
}

/**
 * A fresh, independent `Database` with the schema applied and pragmas set.
 * Not the singleton — for migration fixtures and isolated tests.
 */
export async function createDetachedDatabase(bytes?: Uint8Array): Promise<Database> {
    await loadSqlJs();
    const database = openConnection(bytes);
    if (!bytes) {
        createSchema(database);
    }
    return database;
}

// =============================================================================
// ACCESSORS
// =============================================================================

/**
 * Get the database instance
 * @throws Error if database not initialized
 */
export function getDatabase(): Database {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
    return db !== null;
}

/** The storage backend chosen at boot (null before init). */
export function getActiveStorageAdapter(): DbStorageAdapter | null {
    return activeAdapter;
}

// =============================================================================
// PERSISTENCE
// =============================================================================

/**
 * Schedule a durable write of the current database state. Debounced — calling
 * this after every statement is fine and costs nothing until the timer fires.
 * Use `persistDatabaseNow()` when the write must have landed before continuing.
 */
export function persistDatabase(): void {
    if (!db) {
        dbLog.warn('Cannot persist: database not initialized');
        return;
    }
    schedulePersist();
}

/** Write immediately and resolve once the backend has acknowledged. */
export function persistDatabaseNow(): Promise<void> {
    return flushPersist();
}

/**
 * Export database as a downloadable Blob
 */
export function exportDatabaseFile(): Blob {
    const bytes = exportDatabaseBytes();
    return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/x-sqlite3' });
}

/** Maximum database file size: 50MB */
const MAX_DB_FILE_SIZE = 50 * 1024 * 1024;

/** SQLite file header magic bytes: "SQLite format 3\0" */
const SQLITE_HEADER = new Uint8Array([
    0x53, 0x51, 0x4C, 0x69, 0x74, 0x65, 0x20, 0x66,
    0x6F, 0x72, 0x6D, 0x61, 0x74, 0x20, 0x33, 0x00,
]);

/** Tables that must exist after a valid Etymolog database import */
const REQUIRED_TABLES = ['glyphs', 'graphemes', 'grapheme_glyphs', 'phonemes', 'lexicon'];

/**
 * Import a raw SQLite file, replacing the live database.
 *
 * The candidate is opened and migrated on a SEPARATE connection first; the
 * live database is only swapped out once the candidate has proven valid, so a
 * bad file can never leave the app without data.
 */
export async function importDatabaseFile(file: File): Promise<void> {
    requireSql();

    if (file.size > MAX_DB_FILE_SIZE) {
        throw new Error(`Database file too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 50MB.`);
    }

    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);

    // Validate SQLite header
    if (data.length < 16 || !SQLITE_HEADER.every((byte, i) => data[i] === byte)) {
        throw new Error('Invalid database file: not a valid SQLite database');
    }

    let candidate: Database;
    try {
        candidate = openConnection(data);
    } catch (error) {
        throw new Error(`Invalid database file: ${error instanceof Error ? error.message : 'could not be opened'}`);
    }

    let migration: MigrationResult;
    try {
        const tables = candidate.exec(`SELECT name FROM sqlite_master WHERE type='table'`);
        const tableNames = new Set(
            tables.length > 0 ? tables[0].values.map(row => row[0] as string) : []
        );
        const missingTables = REQUIRED_TABLES.filter(t => !tableNames.has(t));
        if (missingTables.length > 0) {
            throw new Error(`Invalid Etymolog database: missing tables: ${missingTables.join(', ')}`);
        }

        // Same pipeline as boot. Migration v6 repairs orphans itself; a file
        // already at the current version gets the same repair only if it
        // needs it, and a file that is still inconsistent afterwards is
        // refused rather than swapped in with FK enforcement on.
        migration = runMigrations(candidate);
        if (countForeignKeyViolations(candidate) > 0) {
            withTransaction(candidate, () => repairOrphans(candidate));
        }
        const remaining = countForeignKeyViolations(candidate);
        if (remaining > 0) {
            throw new Error(
                `Invalid Etymolog database: ${remaining} foreign-key violation(s) remain after repair`
            );
        }
    } catch (error) {
        candidate.close();
        throw error;
    }

    if (db) {
        db.close();
    }
    db = candidate;
    health = { ...health, fkViolations: 0, schemaMigration: migration };
    schedulePersist();
    await flushPersist();
}

/**
 * Replace the live database with a previously exported byte snapshot. Used to
 * recover from a failed rollback during import. No migrations run — the bytes
 * came from this same build.
 */
export function replaceDatabaseFromBytes(bytes: Uint8Array): void {
    const next = openConnection(bytes);
    if (db) {
        db.close();
    }
    db = next;
    schedulePersist();
}

/**
 * Close the database connection after flushing pending writes.
 */
export async function closeDatabase(): Promise<void> {
    if (!db) return;
    await flushPersist();
    detachPersistence();
    db.close();
    db = null;
    initPromise = null;
    dbLog.info('Database closed');
}

// =============================================================================
// BULK OPERATIONS
// =============================================================================

/** Every application table, children first — the FK-safe deletion order. */
export const ALL_TABLES_CHILDREN_FIRST = [
    'lexicon_ancestry_closure',
    'lexicon_ancestry',
    'lexicon_spelling',
    'lexicon_meanings',
    'lexicon',
    'phonemes',
    'grapheme_glyphs',
    'graphemes',
    'glyphs',
] as const;

/**
 * Delete every row from every table and reset the autoincrement counters.
 * Runs inside the caller's transaction (or its own when called bare).
 */
export function clearAllTables(database: Database): void {
    for (const table of ALL_TABLES_CHILDREN_FIRST) {
        database.run(`DELETE FROM ${table}`);
    }
    database.run(
        `DELETE FROM sqlite_sequence WHERE name IN (${ALL_TABLES_CHILDREN_FIRST.map(t => `'${t}'`).join(', ')})`
    );
}

/**
 * Clear all data from the database (schema kept).
 */
export function clearDatabase(): void {
    if (!db) return;
    const database = db;
    withTransaction(database, () => clearAllTables(database));
    dbLog.info('Database cleared');
}

/**
 * Reset database to fresh state (drops and recreates all tables)
 */
export function resetDatabase(): void {
    if (!db) return;
    const database = db;
    withTransaction(database, () => {
        for (const table of ALL_TABLES_CHILDREN_FIRST) {
            database.run(`DROP TABLE IF EXISTS ${table}`);
        }
        createSchema(database);
    });
    dbLog.info('Database reset to fresh state');
}

// =============================================================================
// REPAIR
// =============================================================================

/**
 * Prune orphaned rows, rewrite dangling `glyph_order` references and rebuild
 * the closure table on the live database, in one transaction. Refreshes
 * `getDatabaseHealth().fkViolations` so a health banner can clear itself.
 */
export function repairDatabase(): RepairReport {
    const database = getDatabase();
    const report = withTransaction(database, () => repairOrphans(database));
    health = { ...health, fkViolations: countForeignKeyViolations(database) };
    if (report.total > 0) {
        dbLog.info('Database repaired:', report);
    }
    return report;
}
