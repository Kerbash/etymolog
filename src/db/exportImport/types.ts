/**
 * Export/Import Type Definitions
 *
 * Defines the complete data schema for Etymolog export files. Each row interface
 * mirrors the exact column layout of its corresponding SQLite table, using raw
 * database types (e.g. integers for booleans, TEXT for dates). This ensures
 * lossless round-trip fidelity when exporting and re-importing data.
 *
 * The `EtymologExportData` envelope wraps all 8 tables plus the user's settings
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
 * Object containing arrays of raw rows for all 8 database tables.
 * Used as the `tables` field inside `EtymologExportData`.
 */
export interface ExportTables {
    glyphs: GlyphRow[];
    graphemes: GraphemeRow[];
    grapheme_glyphs: GraphemeGlyphRow[];
    phonemes: PhonemeRow[];
    lexicon: LexiconRow[];
    lexicon_spelling: LexiconSpellingRow[];
    lexicon_ancestry: LexiconAncestryRow[];
    lexicon_ancestry_closure: LexiconAncestryClosureRow[];
}

/**
 * Top-level export envelope. This is the JSON structure written to `.etymolog.json`
 * files and also the intermediate representation before image encoding.
 *
 * - `magic` — fixed string `"ETYMOLOG_EXPORT"` for file-type identification.
 * - `version` — schema version (currently `1`); used for future migration support.
 * - `exportedAt` — ISO 8601 timestamp of when the export was created.
 * - `conlangName` — human-readable name of the conlang, from settings.
 * - `settings` — full `EtymologSettings` snapshot (persisted in localStorage).
 * - `tables` — all 8 SQLite tables as raw row arrays.
 */
export interface EtymologExportData {
    magic: 'ETYMOLOG_EXPORT';
    version: 1;
    exportedAt: string;
    conlangName: string;
    settings: EtymologSettings;
    tables: ExportTables;
}

/**
 * Foreign-key-safe insertion order for the 8 tables.
 *
 * Parent tables (glyphs, graphemes) come first so that child tables
 * (grapheme_glyphs, phonemes, lexicon_spelling, etc.) can safely reference them
 * via foreign keys during import. Inserting in this order avoids FK constraint
 * violations when restoring a database from an export.
 */
export const TABLE_INSERTION_ORDER: (keyof ExportTables)[] = [
    'glyphs',
    'graphemes',
    'grapheme_glyphs',
    'phonemes',
    'lexicon',
    'lexicon_spelling',
    'lexicon_ancestry',
    'lexicon_ancestry_closure',
];

/**
 * Tables that use SQLite AUTOINCREMENT and need their `sqlite_sequence`
 * entry updated after bulk import. Without this fix, newly created rows
 * after import could collide with imported IDs.
 */
export const AUTOINCREMENT_TABLES: (keyof ExportTables)[] = [
    'glyphs',
    'graphemes',
    'grapheme_glyphs',
    'phonemes',
    'lexicon',
    'lexicon_spelling',
    'lexicon_ancestry',
];

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
