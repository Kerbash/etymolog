/**
 * Export/Import Type Definitions
 *
 * Defines the complete data schema for Etymolog export files. Each row interface
 * mirrors the exact column layout of its corresponding SQLite table, using raw
 * database types (e.g. integers for booleans, TEXT for dates). This ensures
 * lossless round-trip fidelity when exporting and re-importing data.
 *
 * The `EtymologExportData` envelope wraps all tables plus the user's settings
 * into a single versioned, self-identifying JSON structure (magic + version).
 */

import type { EtymologSettings } from '../api/types';

/**
 * Raw row from the `glyphs` table.
 * Glyphs are atomic SVG visual symbols — the smallest drawable unit.
 */
export interface GlyphRow {
    id: number;
    name: string;
    svg_data: string;
    category: string | null;
    notes: string | null;
    /** Nesting folder (schema v8); null / absent in a v1–v2 envelope. */
    folder_id: number | null;
    created_at: string;
    updated_at: string;
}

/**
 * Raw row from the `graphemes` table.
 * Graphemes are compositions of one or more glyphs that represent a written character.
 */
export interface GraphemeRow {
    id: number;
    name: string;
    category: string | null;
    notes: string | null;
    /** Nesting folder (schema v8); null / absent in a v1–v2 envelope. */
    folder_id: number | null;
    created_at: string;
    updated_at: string;
}

/**
 * Raw row from the `grapheme_glyphs` junction table.
 * Links glyphs to graphemes with a positional order and optional SVG transform.
 */
export interface GraphemeGlyphRow {
    id: number;
    grapheme_id: number;
    glyph_id: number;
    position: number;
    transform: string | null;
}

/**
 * Raw row from the `phonemes` table.
 * Maps a pronunciation string (IPA) to a grapheme, optionally used for auto-spelling.
 * `use_in_auto_spelling` is an integer boolean (0 or 1) as stored in SQLite.
 */
export interface PhonemeRow {
    id: number;
    grapheme_id: number;
    phoneme: string;
    use_in_auto_spelling: number;
    context: string | null;
}

/**
 * Raw row from the `lexicon` table.
 * Each entry is a word in the conlang with metadata about spelling, pronunciation,
 * etymology, and part of speech. Boolean fields (`is_native`, `auto_spell`,
 * `needs_attention`) are stored as integer 0/1 in SQLite.
 */
export interface LexiconRow {
    id: number;
    lemma: string;
    pronunciation: string | null;
    is_native: number;
    auto_spell: number;
    meaning: string | null;
    part_of_speech: string | null;
    notes: string | null;
    glyph_order: string;
    needs_attention: number;
    /** Nesting folder (schema v7); null / absent in a v1 envelope. */
    folder_id: number | null;
    created_at: string;
    updated_at: string;
}

/**
 * Raw row from the `lexicon_folders` table (schema v7 / export version 2).
 * Nested folders for organising lexicon entries; `parent_id` self-references
 * (null at the root level).
 */
export interface LexiconFolderRow {
    id: number;
    name: string;
    parent_id: number | null;
    position: number;
    created_at: string;
    updated_at: string;
}

/**
 * Raw row from the `glyph_folders` table (schema v8 / export version 3).
 * Structural clone of `LexiconFolderRow` for glyphs.
 */
export interface GlyphFolderRow {
    id: number;
    name: string;
    parent_id: number | null;
    position: number;
    created_at: string;
    updated_at: string;
}

/**
 * Raw row from the `grapheme_folders` table (schema v8 / export version 3).
 * Structural clone of `LexiconFolderRow` for graphemes.
 */
export interface GraphemeFolderRow {
    id: number;
    name: string;
    parent_id: number | null;
    position: number;
    created_at: string;
    updated_at: string;
}

/**
 * Raw row from the `lexicon_spelling` table.
 * Links a lexicon entry to its grapheme-based spelling in positional order.
 */
export interface LexiconSpellingRow {
    id: number;
    lexicon_id: number;
    grapheme_id: number;
    position: number;
}

/**
 * Raw row from the `lexicon_ancestry` table.
 * Represents a direct parent-child derivation relationship between words.
 */
export interface LexiconAncestryRow {
    id: number;
    lexicon_id: number;
    ancestor_id: number;
    position: number;
    ancestry_type: string;
}

/**
 * Raw row from the `lexicon_meanings` table.
 * Stores multiple meanings for each lexicon entry.
 */
export interface LexiconMeaningRow {
    id: number;
    lexicon_id: number;
    meaning: string;
    part_of_speech: string | null;
    usage_notes: string | null;
    definition_order: number;
}

/**
 * Raw row from the `lexicon_ancestry_closure` table.
 * Pre-computed transitive closure of the ancestry graph for efficient tree queries.
 * `depth` 0 = self, 1 = direct parent, 2 = grandparent, etc.
 */
export interface LexiconAncestryClosureRow {
    ancestor_id: number;
    descendant_id: number;
    depth: number;
}

/**
 * Object containing arrays of raw rows for all database tables.
 * Used as the `tables` field inside `EtymologExportData`.
 */
export interface ExportTables {
    glyph_folders: GlyphFolderRow[];
    glyphs: GlyphRow[];
    grapheme_folders: GraphemeFolderRow[];
    graphemes: GraphemeRow[];
    grapheme_glyphs: GraphemeGlyphRow[];
    phonemes: PhonemeRow[];
    lexicon_folders: LexiconFolderRow[];
    lexicon: LexiconRow[];
    lexicon_spelling: LexiconSpellingRow[];
    lexicon_meanings: LexiconMeaningRow[];
    lexicon_ancestry: LexiconAncestryRow[];
    lexicon_ancestry_closure: LexiconAncestryClosureRow[];
}

/**
 * Top-level export envelope. This is the JSON structure written to `.etymolog.json`
 * files and also the intermediate representation before image encoding.
 *
 * - `magic` — fixed string `"ETYMOLOG_EXPORT"` for file-type identification.
 * - `version` — export schema version (see `EXPORT_SCHEMA_VERSION` in
 *   `config/version.ts`); used for migration support on import.
 * - `appVersion` — informational semver of the app that produced the file
 *   (see `APP_VERSION`). Optional for backward compatibility with older
 *   exports that pre-date this field — never used for validation.
 * - `exportedAt` — ISO 8601 timestamp of when the export was created.
 * - `conlangName` — human-readable name of the conlang, from settings.
 * - `settings` — full `EtymologSettings` snapshot (persisted in localStorage).
 * - `tables` — all SQLite tables as raw row arrays.
 */
export interface EtymologExportData {
    magic: 'ETYMOLOG_EXPORT';
    version: number;
    appVersion?: string;
    exportedAt: string;
    conlangName: string;
    settings: EtymologSettings;
    tables: ExportTables;
}

/**
 * Foreign-key-safe insertion order for the database tables.
 *
 * Parent tables (glyphs, graphemes, lexicon) come first so that child tables
 * (grapheme_glyphs, phonemes, lexicon_spelling, lexicon_meanings, etc.) can safely reference them
 * via foreign keys during import. Inserting in this order avoids FK constraint
 * violations when restoring a database from an export.
 */
export const TABLE_INSERTION_ORDER: (keyof ExportTables)[] = [
    // Each folder table precedes the item table it references, so the item's
    // `folder_id` FK resolves on insert; folder rows are read in id (=
    // parent-before-child) order, so `parent_id` self-references are FK-safe
    // within each folder table too.
    'glyph_folders',
    'glyphs',
    'grapheme_folders',
    'graphemes',
    'grapheme_glyphs',
    'phonemes',
    'lexicon_folders',
    'lexicon',
    'lexicon_spelling',
    'lexicon_meanings',
    'lexicon_ancestry',
    'lexicon_ancestry_closure',
];

/**
 * Tables that use SQLite AUTOINCREMENT and need their `sqlite_sequence`
 * entry updated after bulk import. Without this fix, newly created rows
 * after import could collide with imported IDs.
 */
export const AUTOINCREMENT_TABLES: (keyof ExportTables)[] = [
    'glyph_folders',
    'glyphs',
    'grapheme_folders',
    'graphemes',
    'grapheme_glyphs',
    'phonemes',
    'lexicon_folders',
    'lexicon',
    'lexicon_spelling',
    'lexicon_meanings',
    'lexicon_ancestry',
];

/**
 * What an import did. Counts are per table; `lexicon_ancestry_closure` is
 * always 0 because the closure is rebuilt from `lexicon_ancestry`, never
 * inserted from the file.
 */
export interface ImportReport {
    inserted: Record<keyof ExportTables, number>;
    /** Rows dropped because they referenced a parent row absent from the file. */
    pruned: Record<keyof ExportTables, number>;
    /** `lexicon_meanings` rows synthesised from the legacy `lexicon.meaning` column. */
    legacyMeaningsCreated: number;
    /** Human-readable notes (pruned rows, corrected settings, empty graphemes). */
    warnings: string[];
}

/**
 * Callback for reporting progress during long-running export/import operations.
 *
 * @param stage   — short identifier for the current phase (e.g. "collect", "compress", "import")
 * @param progress — fractional progress from 0.0 to 1.0
 * @param message  — optional human-readable description of the current step
 */
export type ProgressCallback = (
    stage: string,
    progress: number,
    message?: string
) => void;
