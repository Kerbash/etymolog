/**
 * SQL.js Database Setup
 *
 * Initializes and manages the in-browser SQLite database for storing
 * conlang glyphs, graphemes, and phonemes.
 *
 * Architecture:
 * - Glyph: Atomic visual symbol (SVG drawing) - reusable
 * - Grapheme: Composition of glyphs with order (via junction table)
 * - Phoneme: Pronunciation associated with a grapheme
 */

import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

// Singleton instance
let db: Database | null = null;
let SQL: SqlJsStatic | null = null;

// Storage key for persisting database to localStorage
const DB_STORAGE_KEY = 'etymolog_db_v2'; // Versioned key for new schema

/**
 * Initialize the SQL.js library and database
 */
export async function initDatabase(): Promise<Database> {
    if (db) return db;

    // Initialize SQL.js with WASM
    const isNode = typeof window === 'undefined';

    SQL = await initSqlJs(isNode ? undefined : {
        locateFile: (file: string) => `https://sql.js.org/dist/${file}`
    });

    // Try to load existing database from localStorage
    const savedDb = localStorage.getItem(DB_STORAGE_KEY);

    if (savedDb) {
        try {
            const binaryArray = Uint8Array.from(atob(savedDb), c => c.charCodeAt(0));
            db = new SQL.Database(binaryArray);
            console.log('[DB] Loaded existing database from localStorage');

            // Run migrations if needed
            if (db) {
                runMigrations(db);
            }
        } catch (error) {
            console.warn('[DB] Failed to load saved database, creating new one:', error);
            const newDb = new SQL.Database();
            createTables(newDb);
            db = newDb;
        }
    } else {
        const newDb = new SQL.Database();
        createTables(newDb);
        db = newDb;
        console.log('[DB] Created new database with v2 schema');
    }

    return db!;
}

/**
 * Create database tables
 *
 * Schema v2: Glyph → Grapheme → Phoneme architecture
 * - glyphs: Atomic visual symbols (SVG drawings)
 * - graphemes: Compositions of glyphs
 * - grapheme_glyphs: Junction table with position ordering
 * - phonemes: Pronunciations linked to graphemes
 */
function createTables(database: Database): void {
    // Enable foreign key support
    database.run('PRAGMA foreign_keys = ON');

    // Glyphs table - atomic visual symbols
    database.run(`
        CREATE TABLE IF NOT EXISTS glyphs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            svg_data TEXT NOT NULL,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Index for glyph name searches
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_glyphs_name 
        ON glyphs(name)
    `);

    // Graphemes table - compositions of glyphs
    database.run(`
        CREATE TABLE IF NOT EXISTS graphemes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Index for grapheme name searches
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_graphemes_name 
        ON graphemes(name)
    `);

    // Junction table: grapheme_glyphs
    // Links glyphs to graphemes with position for ordering
    database.run(`
        CREATE TABLE IF NOT EXISTS grapheme_glyphs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            grapheme_id INTEGER NOT NULL,
            glyph_id INTEGER NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            transform TEXT,
            FOREIGN KEY (grapheme_id) REFERENCES graphemes(id) ON DELETE CASCADE,
            FOREIGN KEY (glyph_id) REFERENCES glyphs(id) ON DELETE RESTRICT,
            UNIQUE(grapheme_id, glyph_id, position)
        )
    `);

    // Indexes for junction table
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_grapheme_glyphs_grapheme 
        ON grapheme_glyphs(grapheme_id)
    `);
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_grapheme_glyphs_glyph 
        ON grapheme_glyphs(glyph_id)
    `);
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_grapheme_glyphs_position 
        ON grapheme_glyphs(grapheme_id, position)
    `);

    // Phonemes table - pronunciations for graphemes
    database.run(`
        CREATE TABLE IF NOT EXISTS phonemes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            grapheme_id INTEGER NOT NULL,
            phoneme TEXT NOT NULL,
            use_in_auto_spelling INTEGER DEFAULT 0,
            context TEXT,
            FOREIGN KEY (grapheme_id) REFERENCES graphemes(id) ON DELETE CASCADE
        )
    `);

    // Index for phoneme lookups
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_phonemes_grapheme_id 
        ON phonemes(grapheme_id)
    `);

    console.log('[DB] Tables created successfully (v2 schema)');
}

/**
 * Run any necessary migrations
 */
function runMigrations(database: Database): void {
    // Check if glyphs table exists (v2 schema)
    const result = database.exec(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='glyphs'
    `);

    if (result.length === 0 || result[0].values.length === 0) {
        console.log('[DB] Migrating from v1 to v2 schema...');
        // Old schema detected, need to migrate
        // For now, just recreate tables (user will lose data)
        // TODO: Implement proper migration if needed
        createTables(database);
    }
}

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

/**
 * Save the current database state to localStorage
 */
export function persistDatabase(): void {
    if (!db) {
        console.warn('[DB] Cannot persist: database not initialized');
        return;
    }

    try {
        const data = db.export();
        const binaryString = Array.from(data as Uint8Array)
            .map((byte: number) => String.fromCharCode(byte))
            .join('');
        const base64 = btoa(binaryString);
        localStorage.setItem(DB_STORAGE_KEY, base64);
        console.log('[DB] Database persisted to localStorage');
    } catch (error) {
        console.error('[DB] Failed to persist database:', error);
    }
}

/**
 * Export database as a downloadable Blob
 */
export function exportDatabaseFile(): Blob {
    if (!db) {
        throw new Error('Database not initialized');
    }

    const data = db.export();
    return new Blob([new Uint8Array(data).buffer], { type: 'application/x-sqlite3' });
}

/**
 * Import database from a file
 */
export async function importDatabaseFile(file: File): Promise<void> {
    if (!SQL) {
        throw new Error('SQL.js not initialized');
    }

    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);

    if (db) {
        db.close();
    }

    db = new SQL.Database(data);
    if (db) {
        runMigrations(db);
        persistDatabase();
    }
    console.log('[DB] Database imported successfully');
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
    if (db) {
        persistDatabase();
        db.close();
        db = null;
        console.log('[DB] Database closed');
    }
}

/**
 * Clear all data from the database
 */
export function clearDatabase(): void {
    if (!db) return;

    // Delete in order respecting foreign keys
    db.run('DELETE FROM phonemes');
    db.run('DELETE FROM grapheme_glyphs');
    db.run('DELETE FROM graphemes');
    db.run('DELETE FROM glyphs');
    db.run(`DELETE FROM sqlite_sequence WHERE name IN ('glyphs', 'graphemes', 'grapheme_glyphs', 'phonemes')`);
    persistDatabase();
    console.log('[DB] Database cleared');
}

/**
 * Reset database to fresh state (drops and recreates all tables)
 */
export function resetDatabase(): void {
    if (!db) return;

    db.run('DROP TABLE IF EXISTS phonemes');
    db.run('DROP TABLE IF EXISTS grapheme_glyphs');
    db.run('DROP TABLE IF EXISTS graphemes');
    db.run('DROP TABLE IF EXISTS glyphs');

    createTables(db);
    persistDatabase();
    console.log('[DB] Database reset to fresh state');
}
