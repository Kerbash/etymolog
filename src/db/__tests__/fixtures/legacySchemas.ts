/**
 * Legacy schema fixtures
 *
 * Each fixture reproduces the on-disk shape of an Etymolog database written by
 * an earlier build — BEFORE `PRAGMA user_version` existed — with a small,
 * mutually consistent data set, so `runMigrations()` can be exercised against
 * every historical starting point.
 *
 * Keys are the schema version `detectLegacySchemaVersion()` must report
 * (migration N upgrades version N-1 to N). Historical names used elsewhere:
 *
 *   0  `preCategory`        "v2" era — glyphs/graphemes/grapheme_glyphs/phonemes, no category
 *   1  `categoryOnly`       category columns, no lexicon
 *   2  `lexiconNoClosure`   "v3" era — + lexicon/lexicon_spelling/lexicon_ancestry, spelling ONLY in lexicon_spelling
 *   3  `closureNoGlyphOrder` + closure table, still no glyph_order
 *   4  `noMeanings`         "v4" era — + glyph_order/needs_attention, `meaning` still a lexicon column
 *   5  `preV6`              "v5" era — current schema minus the v6 ancestor_id CASCADE
 *
 * Seed data (where the tables exist):
 *   glyphs      1..3            graphemes  1 = glyphs {1,2}, 2 = glyph {3}
 *   phonemes    g1 'a', g2 'b'
 *   lexicon     1 'ab' (meaning 'water'), 2 'aba' (no meaning) derived from 1
 *   spelling    1 → [g1, g2]      2 → [g1, g2, g1]
 *   ancestry    (lexicon 2, ancestor 1); closure left EMPTY (v6 rebuilds it)
 */

import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

let SQL: SqlJsStatic | null = null;

/** A raw, empty sql.js connection (no Etymolog schema, no pragmas beyond FK ON). */
export async function openRawDatabase(): Promise<Database> {
    if (!SQL) {
        SQL = await initSqlJs();
    }
    const db = new SQL.Database();
    db.run('PRAGMA foreign_keys = ON');
    return db;
}

export const SEED = {
    glyphCount: 3,
    graphemeCount: 2,
    phonemeCount: 2,
    lexiconCount: 2,
    word1GlyphOrder: ['grapheme-1', 'grapheme-2'],
    word2GlyphOrder: ['grapheme-1', 'grapheme-2', 'grapheme-1'],
    word1Meaning: 'water',
} as const;

// =============================================================================
// DDL BUILDING BLOCKS (verbatim historical definitions)
// =============================================================================

function ddlGlyphTables(db: Database, withCategory: boolean): void {
    const category = withCategory ? 'category TEXT,' : '';
    db.run(`
        CREATE TABLE glyphs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            svg_data TEXT NOT NULL,
            ${category}
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);
    db.run(`CREATE INDEX idx_glyphs_name ON glyphs(name)`);
    db.run(`
        CREATE TABLE graphemes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            ${category}
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);
    db.run(`CREATE INDEX idx_graphemes_name ON graphemes(name)`);
    db.run(`
        CREATE TABLE grapheme_glyphs (
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
    db.run(`CREATE INDEX idx_grapheme_glyphs_grapheme ON grapheme_glyphs(grapheme_id)`);
    db.run(`CREATE INDEX idx_grapheme_glyphs_glyph ON grapheme_glyphs(glyph_id)`);
    db.run(`CREATE INDEX idx_grapheme_glyphs_position ON grapheme_glyphs(grapheme_id, position)`);
    db.run(`
        CREATE TABLE phonemes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            grapheme_id INTEGER NOT NULL,
            phoneme TEXT NOT NULL,
            use_in_auto_spelling INTEGER DEFAULT 0,
            context TEXT,
            FOREIGN KEY (grapheme_id) REFERENCES graphemes(id) ON DELETE CASCADE
        )
    `);
    db.run(`CREATE INDEX idx_phonemes_grapheme_id ON phonemes(grapheme_id)`);
}

function ddlLexiconTables(db: Database, withGlyphOrder: boolean): void {
    const glyphOrderColumns = withGlyphOrder
        ? `glyph_order TEXT DEFAULT '[]', needs_attention INTEGER DEFAULT 0,`
        : '';
    db.run(`
        CREATE TABLE lexicon (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lemma TEXT NOT NULL,
            pronunciation TEXT,
            is_native INTEGER DEFAULT 1,
            auto_spell INTEGER DEFAULT 1,
            meaning TEXT,
            part_of_speech TEXT,
            notes TEXT,
            ${glyphOrderColumns}
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    `);
    db.run(`CREATE INDEX idx_lexicon_lemma ON lexicon(lemma)`);
    db.run(`CREATE INDEX idx_lexicon_is_native ON lexicon(is_native)`);
    if (withGlyphOrder) {
        db.run(`CREATE INDEX idx_lexicon_needs_attention ON lexicon(needs_attention)`);
    }
    db.run(`
        CREATE TABLE lexicon_spelling (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lexicon_id INTEGER NOT NULL,
            grapheme_id INTEGER NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (lexicon_id) REFERENCES lexicon(id) ON DELETE CASCADE,
            FOREIGN KEY (grapheme_id) REFERENCES graphemes(id) ON DELETE RESTRICT,
            UNIQUE(lexicon_id, grapheme_id, position)
        )
    `);
    db.run(`CREATE INDEX idx_lexicon_spelling_lexicon ON lexicon_spelling(lexicon_id)`);
    db.run(`CREATE INDEX idx_lexicon_spelling_position ON lexicon_spelling(lexicon_id, position)`);
    // The contradictory pre-v6 definition: NOT NULL + ON DELETE SET NULL.
    db.run(`
        CREATE TABLE lexicon_ancestry (
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
    db.run(`CREATE INDEX idx_lexicon_ancestry_lexicon ON lexicon_ancestry(lexicon_id)`);
    db.run(`CREATE INDEX idx_lexicon_ancestry_ancestor ON lexicon_ancestry(ancestor_id)`);
}

function ddlClosure(db: Database): void {
    db.run(`
        CREATE TABLE lexicon_ancestry_closure (
            ancestor_id INTEGER NOT NULL,
            descendant_id INTEGER NOT NULL,
            depth INTEGER NOT NULL,
            PRIMARY KEY (ancestor_id, descendant_id),
            FOREIGN KEY (ancestor_id) REFERENCES lexicon(id) ON DELETE CASCADE,
            FOREIGN KEY (descendant_id) REFERENCES lexicon(id) ON DELETE CASCADE
        )
    `);
    db.run(`CREATE INDEX idx_closure_ancestor ON lexicon_ancestry_closure(ancestor_id)`);
    db.run(`CREATE INDEX idx_closure_descendant ON lexicon_ancestry_closure(descendant_id)`);
}

function ddlMeanings(db: Database): void {
    db.run(`
        CREATE TABLE lexicon_meanings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lexicon_id INTEGER NOT NULL,
            meaning TEXT NOT NULL,
            part_of_speech TEXT,
            usage_notes TEXT,
            definition_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (lexicon_id) REFERENCES lexicon(id) ON DELETE CASCADE
        )
    `);
    db.run(`CREATE INDEX idx_lexicon_meanings_lexicon ON lexicon_meanings(lexicon_id)`);
    db.run(`CREATE INDEX idx_lexicon_meanings_order ON lexicon_meanings(lexicon_id, definition_order)`);
}

// =============================================================================
// SEEDS
// =============================================================================

function seedGlyphTables(db: Database): void {
    db.run(`INSERT INTO glyphs (id, name, svg_data) VALUES (1, 'one', '<svg/>'), (2, 'two', '<svg/>'), (3, 'three', '<svg/>')`);
    db.run(`INSERT INTO graphemes (id, name) VALUES (1, 'A'), (2, 'B')`);
    db.run(`INSERT INTO grapheme_glyphs (grapheme_id, glyph_id, position) VALUES (1, 1, 0), (1, 2, 1), (2, 3, 0)`);
    db.run(`INSERT INTO phonemes (grapheme_id, phoneme, use_in_auto_spelling) VALUES (1, 'a', 1), (2, 'b', 1)`);
}

function seedLexicon(db: Database, withGlyphOrder: boolean, withMeaningsTable: boolean): void {
    db.run(
        `INSERT INTO lexicon (id, lemma, meaning) VALUES (1, 'ab', ?), (2, 'aba', NULL)`,
        [SEED.word1Meaning]
    );
    db.run(`
        INSERT INTO lexicon_spelling (lexicon_id, grapheme_id, position)
        VALUES (1, 1, 0), (1, 2, 1), (2, 1, 0), (2, 2, 1), (2, 1, 2)
    `);
    db.run(`INSERT INTO lexicon_ancestry (lexicon_id, ancestor_id, position) VALUES (2, 1, 0)`);
    if (withGlyphOrder) {
        db.run(`UPDATE lexicon SET glyph_order = ? WHERE id = 1`, [JSON.stringify(SEED.word1GlyphOrder)]);
        db.run(`UPDATE lexicon SET glyph_order = ? WHERE id = 2`, [JSON.stringify(SEED.word2GlyphOrder)]);
    }
    if (withMeaningsTable) {
        db.run(`INSERT INTO lexicon_meanings (lexicon_id, meaning, definition_order) VALUES (1, ?, 0)`, [SEED.word1Meaning]);
    }
}

// =============================================================================
// FIXTURES
// =============================================================================

export type LegacyFixtureKey =
    | 'preCategory'
    | 'categoryOnly'
    | 'lexiconNoClosure'
    | 'closureNoGlyphOrder'
    | 'noMeanings'
    | 'preV6';

export interface LegacyFixture {
    /** Version `detectLegacySchemaVersion()` must report. */
    detectedVersion: number;
    hasLexicon: boolean;
    apply(db: Database): void;
}

export const LEGACY_FIXTURES: Record<LegacyFixtureKey, LegacyFixture> = {
    preCategory: {
        detectedVersion: 0,
        hasLexicon: false,
        apply(db) {
            ddlGlyphTables(db, false);
            seedGlyphTables(db);
        },
    },
    categoryOnly: {
        detectedVersion: 1,
        hasLexicon: false,
        apply(db) {
            ddlGlyphTables(db, true);
            seedGlyphTables(db);
        },
    },
    lexiconNoClosure: {
        detectedVersion: 2,
        hasLexicon: true,
        apply(db) {
            ddlGlyphTables(db, true);
            ddlLexiconTables(db, false);
            seedGlyphTables(db);
            seedLexicon(db, false, false);
        },
    },
    closureNoGlyphOrder: {
        detectedVersion: 3,
        hasLexicon: true,
        apply(db) {
            ddlGlyphTables(db, true);
            ddlLexiconTables(db, false);
            ddlClosure(db);
            seedGlyphTables(db);
            seedLexicon(db, false, false);
        },
    },
    noMeanings: {
        detectedVersion: 4,
        hasLexicon: true,
        apply(db) {
            ddlGlyphTables(db, true);
            ddlLexiconTables(db, true);
            ddlClosure(db);
            seedGlyphTables(db);
            seedLexicon(db, true, false);
        },
    },
    preV6: {
        detectedVersion: 5,
        hasLexicon: true,
        apply(db) {
            ddlGlyphTables(db, true);
            ddlLexiconTables(db, true);
            ddlClosure(db);
            ddlMeanings(db);
            seedGlyphTables(db);
            seedLexicon(db, true, true);
        },
    },
};

export const LEGACY_FIXTURE_KEYS = Object.keys(LEGACY_FIXTURES) as LegacyFixtureKey[];

/**
 * Build a fixture and return its on-disk bytes (what an older build would have
 * persisted). `user_version` is 0, as it was for every pre-Phase-2 file.
 *
 * @param mutate runs against the raw connection after the fixture is applied —
 *               for seeding orphans or corrupting the shape.
 */
export async function buildLegacyBytes(
    key: LegacyFixtureKey,
    mutate?: (db: Database) => void
): Promise<Uint8Array> {
    const db = await openRawDatabase();
    try {
        LEGACY_FIXTURES[key].apply(db);
        mutate?.(db);
        return db.export();
    } finally {
        db.close();
    }
}
