/**
 * Current schema DDL
 *
 * `createSchema(db)` builds every table and index of the CURRENT schema on an
 * empty connection and stamps `PRAGMA user_version = CURRENT_SCHEMA_VERSION`.
 * It is the fast path for a brand-new database; existing files reach the same
 * shape by running the registry in `./index.ts`.
 *
 * Keep this DDL and the last migration in sync: a fresh database and a fully
 * migrated one must have identical `sqlite_master` content (modulo index
 * names created by `IF NOT EXISTS`), or `detectLegacySchemaVersion` probes and
 * `PRAGMA foreign_key_check` will disagree between the two paths.
 *
 * Architecture:
 *   glyph_folders    — nested folders for organising glyphs (schema v8)
 *   glyphs           — atomic visual symbols (SVG drawings)
 *   grapheme_folders — nested folders for organising graphemes (schema v8)
 *   graphemes        — compositions of glyphs (via grapheme_glyphs)
 *   phonemes         — pronunciations linked to graphemes
 *   lexicon          — vocabulary entries; `glyph_order` is the spelling source of truth
 *   lexicon_spelling — derived junction (one row per grapheme occurrence)
 *   lexicon_ancestry — etymological adjacency list
 *   lexicon_ancestry_closure — derived transitive closure of the adjacency list
 *   lexicon_meanings — multiple meanings per entry
 *   lexicon_folders  — nested folders for organising lexicon entries (adjacency list)
 */

import type { Database } from 'sql.js';
import { dbLog } from '../utils/logger';
import { CURRENT_SCHEMA_VERSION } from './version';

export function createSchema(database: Database): void {
    // Nested folders for organising glyphs (schema v8). Created BEFORE `glyphs`
    // so the `glyphs.folder_id` foreign key resolves. Shared verbatim with
    // migration v8 so the fresh and migrated tables match.
    createGlyphFoldersTable(database);
    createGlyphFoldersIndex(database);

    // Glyphs table - atomic visual symbols
    // folder_id: nesting folder (schema v8); ON DELETE SET NULL so removing a
    //   folder never deletes a glyph (the service reparents them first anyway).
    //   Declared LAST so a fresh table's column order matches a migrated one,
    //   where `ALTER TABLE ... ADD COLUMN` always appends.
    database.run(`
        CREATE TABLE IF NOT EXISTS glyphs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            svg_data TEXT NOT NULL,
            category TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            folder_id INTEGER NULL REFERENCES glyph_folders(id) ON DELETE SET NULL
        )
    `);

    // Index for glyph name searches
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_glyphs_name
        ON glyphs(name)
    `);
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_glyphs_folder
        ON glyphs(folder_id)
    `);

    // Nested folders for organising graphemes (schema v8). Created BEFORE
    // `graphemes` so the `graphemes.folder_id` foreign key resolves. Shared
    // verbatim with migration v8 so the fresh and migrated tables match.
    createGraphemeFoldersTable(database);
    createGraphemeFoldersIndex(database);

    // Graphemes table - compositions of glyphs
    // folder_id: nesting folder (schema v8); ON DELETE SET NULL. Declared LAST
    //   so a fresh table's column order matches a migrated one (ADD COLUMN
    //   appends).
    database.run(`
        CREATE TABLE IF NOT EXISTS graphemes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            folder_id INTEGER NULL REFERENCES grapheme_folders(id) ON DELETE SET NULL
        )
    `);

    // Index for grapheme name searches
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_graphemes_name
        ON graphemes(name)
    `);
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_graphemes_folder
        ON graphemes(folder_id)
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

    // =========================================================================
    // LEXICON TABLES
    // =========================================================================

    // Nested folders for organising lexicon entries (schema v7). Created BEFORE
    // `lexicon` so the `lexicon.folder_id` foreign key resolves. Shared with
    // migration v7 (identical DDL) so a fresh table and a migrated one match.
    createLexiconFoldersTable(database);
    createLexiconFoldersIndex(database);

    // Lexicon table - vocabulary entries
    // glyph_order: JSON array storing the true ordered spelling (grapheme refs + IPA chars)
    // needs_attention: Flag for entries that need manual review (e.g., after grapheme deletion)
    // folder_id: nesting folder (schema v7); ON DELETE SET NULL so removing a
    //   folder never deletes a word (the service reparents them first anyway).
    //   Declared LAST so a fresh table's column order matches a migrated one,
    //   where `ALTER TABLE ... ADD COLUMN` always appends.
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
            glyph_order TEXT DEFAULT '[]',
            needs_attention INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            folder_id INTEGER NULL REFERENCES lexicon_folders(id) ON DELETE SET NULL
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
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_lexicon_needs_attention
        ON lexicon(needs_attention)
    `);
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_lexicon_folder
        ON lexicon(folder_id)
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
    // Schema v6: `ancestor_id` cascades. The pre-v6 definition was
    // `NOT NULL ... ON DELETE SET NULL`, which can never be satisfied — deleting
    // an ancestor would fail the NOT NULL constraint instead of unlinking.
    createLexiconAncestryTable(database, 'lexicon_ancestry');
    createLexiconAncestryIndexes(database);

    // Meanings table - multiple meanings per lexicon entry
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

    // Indexes for lexicon_meanings
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_lexicon_meanings_lexicon
        ON lexicon_meanings(lexicon_id)
    `);
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_lexicon_meanings_order
        ON lexicon_meanings(lexicon_id, definition_order)
    `);

    // TRANSITIVE CLOSURE TABLE
    // Stores all ancestor-descendant paths (distance > 0)
    // Used for O(1) cycle detection and descendant retrieval
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

    database.run(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);

    dbLog.info(`Schema created (user_version ${CURRENT_SCHEMA_VERSION})`);
}

/**
 * The v6 `lexicon_ancestry` definition. Shared with migration v6, which
 * creates it under a temporary name and renames it into place — so the
 * rebuilt table and a freshly created one are guaranteed identical.
 */
export function createLexiconAncestryTable(database: Database, tableName: string): void {
    database.run(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lexicon_id INTEGER NOT NULL,
            ancestor_id INTEGER NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            ancestry_type TEXT DEFAULT 'derived',
            FOREIGN KEY (lexicon_id) REFERENCES lexicon(id) ON DELETE CASCADE,
            FOREIGN KEY (ancestor_id) REFERENCES lexicon(id) ON DELETE CASCADE,
            UNIQUE(lexicon_id, ancestor_id)
        )
    `);
}

/** Indexes on `lexicon_ancestry`; recreated by migration v6 after the rename. */
export function createLexiconAncestryIndexes(database: Database): void {
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_lexicon_ancestry_lexicon
        ON lexicon_ancestry(lexicon_id)
    `);
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_lexicon_ancestry_ancestor
        ON lexicon_ancestry(ancestor_id)
    `);
}

/**
 * The `lexicon_folders` table (schema v7): an adjacency list of nesting folders
 * for lexicon entries. `parent_id` self-references with ON DELETE CASCADE as a
 * belt-and-braces backstop — the folder service reparents children and words to
 * the deleted folder's parent BEFORE deleting, so a word is never lost. Shared
 * verbatim between `createSchema` and migration v7 so the fresh and migrated
 * tables are byte-identical in `sqlite_master`.
 */
export function createLexiconFoldersTable(database: Database): void {
    database.run(`
        CREATE TABLE IF NOT EXISTS lexicon_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER NULL REFERENCES lexicon_folders(id) ON DELETE CASCADE,
            position INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);
}

/** Index on `lexicon_folders(parent_id)` for tree assembly; shared with v7. */
export function createLexiconFoldersIndex(database: Database): void {
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_lexicon_folders_parent
        ON lexicon_folders(parent_id)
    `);
}

/**
 * The `glyph_folders` table (schema v8): a structural clone of
 * `lexicon_folders` for organising glyphs. `parent_id` self-references with ON
 * DELETE CASCADE as a backstop — the folder service reparents children and
 * glyphs to the deleted folder's parent BEFORE deleting. Shared verbatim
 * between `createSchema` and migration v8.
 */
export function createGlyphFoldersTable(database: Database): void {
    database.run(`
        CREATE TABLE IF NOT EXISTS glyph_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER NULL REFERENCES glyph_folders(id) ON DELETE CASCADE,
            position INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);
}

/** Index on `glyph_folders(parent_id)` for tree assembly; shared with v8. */
export function createGlyphFoldersIndex(database: Database): void {
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_glyph_folders_parent
        ON glyph_folders(parent_id)
    `);
}

/**
 * The `grapheme_folders` table (schema v8): a structural clone of
 * `lexicon_folders` for organising graphemes. Same ON DELETE CASCADE backstop
 * as the other folder tables. Shared verbatim between `createSchema` and
 * migration v8.
 */
export function createGraphemeFoldersTable(database: Database): void {
    database.run(`
        CREATE TABLE IF NOT EXISTS grapheme_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER NULL REFERENCES grapheme_folders(id) ON DELETE CASCADE,
            position INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);
}

/** Index on `grapheme_folders(parent_id)` for tree assembly; shared with v8. */
export function createGraphemeFoldersIndex(database: Database): void {
    database.run(`
        CREATE INDEX IF NOT EXISTS idx_grapheme_folders_parent
        ON grapheme_folders(parent_id)
    `);
}
