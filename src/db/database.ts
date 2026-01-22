/**
 * SQL.js Database Setup
 *
 * Initializes and manages the in-browser SQLite database for storing
 * conlang graphemes (script characters) and their associated phonemes.
 *
 * Terminology:
 * - Grapheme: A visual symbol in the writing system (UI: "grapheme")
 * - Phoneme: A sound/pronunciation associated with a grapheme (UI: "pronunciation")
 */

import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

// Singleton instance
let db: Database | null = null;
let SQL: SqlJsStatic | null = null;

// Storage key for persisting database to localStorage
const DB_STORAGE_KEY = 'etymolog_db';

/**
 * Initialize the SQL.js library and database
 */
export async function initDatabase(): Promise<Database> {
    if (db) return db;

    // Initialize SQL.js with WASM
    // In browser: load from CDN
    // In Node.js (tests): let sql.js find the WASM file automatically
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
        console.log('[DB] Created new database');
    }

    return db!;
}

/**
 * Create database tables
 *
 * Schema Design:
 * - graphemes: Stores the visual representation of script characters
 * - phonemes: Stores pronunciation data linked to graphemes (1:N relationship)
 */
function createTables(database: Database): void {
    // Graphemes table - stores individual script characters
    // UI calls these "graphemes" or "script characters"
    database.run(`
        CREATE TABLE IF NOT EXISTS graphemes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            svg_data TEXT NOT NULL,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);

    // Phonemes table - stores pronunciations for each grapheme
    // UI calls these "pronunciations"
    // Each grapheme can have multiple phonemes (1:N relationship)
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

    // Create index for faster phoneme lookups by grapheme
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_phonemes_grapheme_id 
        ON phonemes(grapheme_id)
    `);

    console.log('[DB] Tables created successfully');
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
 * Called automatically after mutations, but can be called manually
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
 * Use with URL.createObjectURL() for download links
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
 * Replaces the current database entirely
 */
export async function importDatabaseFile(file: File): Promise<void> {
    if (!SQL) {
        throw new Error('SQL.js not initialized');
    }

    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);

    // Close existing database
    if (db) {
        db.close();
    }

    // Create new database from imported file
    db = new SQL.Database(data);
    persistDatabase();
    console.log('[DB] Database imported successfully');
}

/**
 * Close the database connection
 * Persists data before closing
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
 * Useful for testing or user-initiated reset
 */
export function clearDatabase(): void {
    if (!db) return;

    db.run('DELETE FROM phonemes');
    db.run('DELETE FROM graphemes');
    db.run('DELETE FROM sqlite_sequence WHERE name IN ("graphemes", "phonemes")');
    persistDatabase();
    console.log('[DB] Database cleared');
}
