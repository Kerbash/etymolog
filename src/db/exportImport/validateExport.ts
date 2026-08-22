/**
 * Export validation — row shapes, value types, referential integrity
 *
 * `parseAndValidateJson()` only proves the envelope is the right SHAPE (magic,
 * version, table keys are arrays). This module proves the CONTENT can be
 * inserted: every row has the right column types, primary keys are unique, and
 * every foreign key points at a row that exists in the same envelope.
 *
 * It runs entirely in memory BEFORE the database is touched, which is what
 * makes `importExportData()` atomic: a malformed file is rejected with the
 * user's current data still intact.
 *
 * Dangling CHILD rows (a spelling row whose word no longer exists) are pruned
 * and counted rather than failing the whole import — old exports contain them
 * because foreign keys were never enforced. A missing PARENT table or a
 * duplicate primary key is fatal.
 *
 * `lexicon_ancestry_closure` is accepted but IGNORED: it is derived data and
 * is rebuilt from `lexicon_ancestry` after insertion.
 */

import type { EtymologExportData, ExportTables } from './types';
import { deserializeGlyphOrder, serializeGlyphOrder, extractGraphemeId } from '../utils/spellingUtils';

/** What a dangling `"grapheme-<id>"` spelling entry becomes on import. */
export const MISSING_GRAPHEME_PLACEHOLDER = '?';

type ColumnType =
    /** Positive integer primary key. */
    | 'id'
    /** Integer (any sign). */
    | 'int'
    /** Integer or null. */
    | 'int?'
    /** Non-null string. */
    | 'text'
    /** String or null. */
    | 'text?'
    /** 0/1 integer; booleans are coerced. */
    | 'bool'
    /** JSON-encoded string array (the `glyph_order` column); arrays are stringified. */
    | 'jsonArray';

interface ColumnSpec {
    type: ColumnType;
    /** When the column is absent from a row, use this instead of failing. */
    default?: unknown;
}

type TableSpec = Record<string, ColumnSpec>;

/** Tables whose rows are inserted (closure is rebuilt, never inserted). */
export type InsertableTable = Exclude<keyof ExportTables, 'lexicon_ancestry_closure'>;

export const INSERTABLE_TABLES: readonly InsertableTable[] = [
    'glyphs',
    'graphemes',
    'grapheme_glyphs',
    'phonemes',
    'lexicon',
    'lexicon_spelling',
    'lexicon_meanings',
    'lexicon_ancestry',
];

const NOW = "datetime('now')"; // marker: column omitted so SQLite applies its DEFAULT

const TABLE_SPECS: Record<InsertableTable, TableSpec> = {
    glyphs: {
        id: { type: 'id' },
        name: { type: 'text' },
        svg_data: { type: 'text' },
        category: { type: 'text?', default: null },
        notes: { type: 'text?', default: null },
        created_at: { type: 'text', default: NOW },
        updated_at: { type: 'text', default: NOW },
    },
    graphemes: {
        id: { type: 'id' },
        name: { type: 'text' },
        category: { type: 'text?', default: null },
        notes: { type: 'text?', default: null },
        created_at: { type: 'text', default: NOW },
        updated_at: { type: 'text', default: NOW },
    },
    grapheme_glyphs: {
        id: { type: 'id' },
        grapheme_id: { type: 'int' },
        glyph_id: { type: 'int' },
        position: { type: 'int', default: 0 },
        transform: { type: 'text?', default: null },
    },
    phonemes: {
        id: { type: 'id' },
        grapheme_id: { type: 'int' },
        phoneme: { type: 'text' },
        use_in_auto_spelling: { type: 'bool', default: 0 },
        context: { type: 'text?', default: null },
    },
    lexicon: {
        id: { type: 'id' },
        lemma: { type: 'text' },
        pronunciation: { type: 'text?', default: null },
        is_native: { type: 'bool', default: 1 },
        auto_spell: { type: 'bool', default: 1 },
        meaning: { type: 'text?', default: null },
        part_of_speech: { type: 'text?', default: null },
        notes: { type: 'text?', default: null },
        glyph_order: { type: 'jsonArray', default: '[]' },
        needs_attention: { type: 'bool', default: 0 },
        created_at: { type: 'text', default: NOW },
        updated_at: { type: 'text', default: NOW },
    },
    lexicon_spelling: {
        id: { type: 'id' },
        lexicon_id: { type: 'int' },
        grapheme_id: { type: 'int' },
        position: { type: 'int', default: 0 },
    },
    lexicon_meanings: {
        id: { type: 'id' },
        lexicon_id: { type: 'int' },
        meaning: { type: 'text' },
        part_of_speech: { type: 'text?', default: null },
        usage_notes: { type: 'text?', default: null },
        definition_order: { type: 'int', default: 0 },
    },
    lexicon_ancestry: {
        id: { type: 'id' },
        lexicon_id: { type: 'int' },
        ancestor_id: { type: 'int' },
        position: { type: 'int', default: 0 },
        ancestry_type: { type: 'text', default: 'derived' },
    },
};

/** child table → [column, parent table] pairs that must resolve. */
const REFERENCES: Partial<Record<InsertableTable, [string, InsertableTable][]>> = {
    grapheme_glyphs: [['grapheme_id', 'graphemes'], ['glyph_id', 'glyphs']],
    phonemes: [['grapheme_id', 'graphemes']],
    lexicon_spelling: [['lexicon_id', 'lexicon'], ['grapheme_id', 'graphemes']],
    lexicon_meanings: [['lexicon_id', 'lexicon']],
    lexicon_ancestry: [['lexicon_id', 'lexicon'], ['ancestor_id', 'lexicon']],
};

export type ValidatedRow = Record<string, string | number | null>;

export interface ExportValidationReport {
    /** Rows that will be inserted, per table. */
    accepted: Record<InsertableTable, number>;
    /** Rows dropped because a referenced parent row does not exist, per table. */
    pruned: Record<InsertableTable, number>;
    warnings: string[];
}

export interface ValidatedExport {
    tables: Record<InsertableTable, ValidatedRow[]>;
    /** Column order used for the INSERT of each table (all spec columns). */
    columns: Record<InsertableTable, string[]>;
    report: ExportValidationReport;
}

export class ExportValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ExportValidationError';
    }
}

function isInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value);
}

function coerce(table: string, column: string, spec: ColumnSpec, raw: unknown, rowIndex: number): string | number | null {
    const where = `${table}[${rowIndex}].${column}`;
    switch (spec.type) {
        case 'id':
            if (isInteger(raw) && raw > 0) return raw;
            throw new ExportValidationError(`${where}: expected a positive integer id`);
        case 'int':
            if (isInteger(raw)) return raw;
            throw new ExportValidationError(`${where}: expected an integer`);
        case 'int?':
            if (raw === null) return null;
            if (isInteger(raw)) return raw;
            throw new ExportValidationError(`${where}: expected an integer or null`);
        case 'text':
            if (typeof raw === 'string') return raw;
            throw new ExportValidationError(`${where}: expected a string`);
        case 'text?':
            if (raw === null) return null;
            if (typeof raw === 'string') return raw;
            throw new ExportValidationError(`${where}: expected a string or null`);
        case 'bool':
            if (raw === 0 || raw === 1) return raw;
            if (typeof raw === 'boolean') return raw ? 1 : 0;
            throw new ExportValidationError(`${where}: expected 0/1 or a boolean`);
        case 'jsonArray': {
            if (Array.isArray(raw)) {
                if (!raw.every(v => typeof v === 'string')) {
                    throw new ExportValidationError(`${where}: expected an array of strings`);
                }
                return JSON.stringify(raw);
            }
            if (typeof raw === 'string') {
                let parsed: unknown;
                try {
                    parsed = JSON.parse(raw);
                } catch {
                    throw new ExportValidationError(`${where}: expected a JSON array string`);
                }
                if (!Array.isArray(parsed) || !parsed.every(v => typeof v === 'string')) {
                    throw new ExportValidationError(`${where}: expected a JSON array of strings`);
                }
                return raw;
            }
            throw new ExportValidationError(`${where}: expected a JSON array`);
        }
    }
}

function validateTable(table: InsertableTable, rows: unknown[]): { rows: ValidatedRow[]; columns: string[] } {
    const spec = TABLE_SPECS[table];
    const columns = Object.keys(spec);
    const seenIds = new Set<number>();
    const out: ValidatedRow[] = [];

    rows.forEach((raw, index) => {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
            throw new ExportValidationError(`${table}[${index}]: expected an object`);
        }
        const source = raw as Record<string, unknown>;
        const row: ValidatedRow = {};
        for (const column of columns) {
            const columnSpec = spec[column];
            const present = Object.prototype.hasOwnProperty.call(source, column) && source[column] !== undefined;
            if (!present) {
                if (columnSpec.default === undefined) {
                    throw new ExportValidationError(`${table}[${index}].${column}: missing required column`);
                }
                if (columnSpec.default === NOW) {
                    row[column] = new Date().toISOString().replace('T', ' ').slice(0, 19);
                } else {
                    row[column] = columnSpec.default as string | number | null;
                }
                continue;
            }
            row[column] = coerce(table, column, columnSpec, source[column], index);
        }
        const id = row.id as number;
        if (seenIds.has(id)) {
            throw new ExportValidationError(`${table}: duplicate id ${id}`);
        }
        seenIds.add(id);
        out.push(row);
    });

    return { rows: out, columns };
}

/**
 * Validate an already shape-checked envelope. Throws `ExportValidationError`
 * on anything that cannot be imported; prunes and reports dangling child rows.
 */
export function validateExportData(data: EtymologExportData): ValidatedExport {
    const tables = {} as Record<InsertableTable, ValidatedRow[]>;
    const columns = {} as Record<InsertableTable, string[]>;
    const accepted = {} as Record<InsertableTable, number>;
    const pruned = {} as Record<InsertableTable, number>;
    const warnings: string[] = [];

    for (const table of INSERTABLE_TABLES) {
        const raw = (data.tables as unknown as Record<string, unknown>)[table];
        const rows = Array.isArray(raw) ? raw : [];
        const validated = validateTable(table, rows);
        tables[table] = validated.rows;
        columns[table] = validated.columns;
        pruned[table] = 0;
    }

    // Referential integrity, in insertion order so a pruned parent also prunes
    // its children (e.g. a dropped grapheme_glyphs row never cascades further,
    // but a dropped lexicon row drops its spelling/meanings/ancestry rows).
    const ids: Partial<Record<InsertableTable, Set<number>>> = {};
    for (const table of INSERTABLE_TABLES) {
        const refs = REFERENCES[table];
        if (refs) {
            const kept: ValidatedRow[] = [];
            for (const row of tables[table]) {
                const missing = refs.find(([column, parent]) => !ids[parent]?.has(row[column] as number));
                if (missing) {
                    pruned[table]++;
                } else {
                    kept.push(row);
                }
            }
            if (pruned[table] > 0) {
                warnings.push(`${pruned[table]} ${table} row(s) referenced missing parents and were dropped`);
            }
            tables[table] = kept;
        }
        ids[table] = new Set(tables[table].map(row => row.id as number));
        accepted[table] = tables[table].length;
    }

    // `lexicon.glyph_order` is a JSON column, so no foreign key can see inside
    // it. Resolve every "grapheme-<id>" entry against the graphemes that are
    // actually being imported; a dangling one becomes the placeholder and the
    // word is flagged for review. Left alone, the word would render as "[?N]"
    // and then become UNEDITABLE: the first update re-syncs lexicon_spelling,
    // whose FK to graphemes fails, and the whole save rolls back.
    let repairedWords = 0;
    let repairedEntries = 0;
    for (const row of tables.lexicon) {
        const order = deserializeGlyphOrder(row.glyph_order as string);
        let changed = 0;
        const repaired = order.map(entry => {
            const graphemeId = extractGraphemeId(entry);
            if (graphemeId === null || ids.graphemes!.has(graphemeId)) return entry;
            changed++;
            return MISSING_GRAPHEME_PLACEHOLDER;
        });
        if (changed > 0) {
            row.glyph_order = serializeGlyphOrder(repaired);
            row.needs_attention = 1;
            repairedWords++;
            repairedEntries += changed;
        }
    }
    if (repairedWords > 0) {
        warnings.push(`${repairedWords} word(s) spelled with ${repairedEntries} missing grapheme(s); those entries were replaced with "${MISSING_GRAPHEME_PLACEHOLDER}" and the words flagged for review`);
    }

    // A grapheme with zero glyphs after pruning would violate the creation
    // invariant; warn (Phase 2's repair pass handles it structurally).
    const glyphedGraphemes = new Set(tables.grapheme_glyphs.map(r => r.grapheme_id as number));
    const emptyGraphemes = tables.graphemes.filter(g => !glyphedGraphemes.has(g.id as number)).length;
    if (emptyGraphemes > 0) {
        warnings.push(`${emptyGraphemes} grapheme(s) have no glyphs`);
    }

    return { tables, columns, report: { accepted, pruned, warnings } };
}
