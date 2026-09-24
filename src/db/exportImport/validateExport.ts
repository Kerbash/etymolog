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
 *
 * Variants (schema v9 / export v4): a v1–v3 envelope has no `grapheme_variants`
 * and no `grapheme_glyphs.variant_id`; its glyph rows keep `variant_id = null`
 * and are attached to a default variant created at insert time
 * (`backfillDefaultVariants`). A v4 envelope is normalised here so the
 * database's variant invariants cannot abort the insert: one default per
 * grapheme, one variant per (grapheme, group), glyph rows on a variant of
 * THEIR grapheme, no empty non-default variant, and no `@<variantId>` pin
 * naming a variant its grapheme does not have.
 */

import type { EtymologExportData, ExportTables } from './types';
import {
    createGraphemeEntry,
    deserializeGlyphOrder,
    extractGraphemeId,
    extractVariantId,
    serializeGlyphOrder,
} from '../utils/spellingUtils';
import { formatSchemeIssues, parseBlockSchemeDefinition, serializeBlockScheme } from '../utils/blockSchemeCodec';

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
    'variant_groups',
    'glyph_folders',
    'glyphs',
    'grapheme_folders',
    'graphemes',
    'grapheme_variants',
    'grapheme_glyphs',
    'phonemes',
    'lexicon_folders',
    'lexicon',
    'lexicon_spelling',
    'lexicon_meanings',
    'lexicon_ancestry',
    'block_scheme',
];

const NOW = "datetime('now')"; // marker: column omitted so SQLite applies its DEFAULT

/** Column spec shared by every folder table (lexicon/glyph/grapheme). */
const FOLDER_TABLE_SPEC: TableSpec = {
    id: { type: 'id' },
    name: { type: 'text' },
    // Self-referencing; null at the root. Older envelopes have no folders at all.
    parent_id: { type: 'int?', default: null },
    position: { type: 'int', default: 0 },
    created_at: { type: 'text', default: NOW },
    updated_at: { type: 'text', default: NOW },
};

const TABLE_SPECS: Record<InsertableTable, TableSpec> = {
    // Schema v9; absent (→ []) in a v1–v3 envelope.
    variant_groups: {
        id: { type: 'id' },
        name: { type: 'text' },
        sort_order: { type: 'int', default: 0 },
        created_at: { type: 'text', default: NOW },
        updated_at: { type: 'text', default: NOW },
    },
    glyph_folders: FOLDER_TABLE_SPEC,
    glyphs: {
        id: { type: 'id' },
        name: { type: 'text' },
        svg_data: { type: 'text' },
        category: { type: 'text?', default: null },
        notes: { type: 'text?', default: null },
        // Absent (null) in a v1–v2 envelope; a real folder id in a v3 one.
        folder_id: { type: 'int?', default: null },
        created_at: { type: 'text', default: NOW },
        updated_at: { type: 'text', default: NOW },
    },
    grapheme_folders: FOLDER_TABLE_SPEC,
    graphemes: {
        id: { type: 'id' },
        name: { type: 'text' },
        category: { type: 'text?', default: null },
        notes: { type: 'text?', default: null },
        // Absent (null) in a v1–v2 envelope; a real folder id in a v3 one.
        folder_id: { type: 'int?', default: null },
        created_at: { type: 'text', default: NOW },
        updated_at: { type: 'text', default: NOW },
    },
    // Schema v9; absent (→ []) in a v1–v3 envelope.
    grapheme_variants: {
        id: { type: 'id' },
        grapheme_id: { type: 'int' },
        group_id: { type: 'int?', default: null },
        name: { type: 'text' },
        is_default: { type: 'bool', default: 0 },
        sort_order: { type: 'int', default: 0 },
        created_at: { type: 'text', default: NOW },
        updated_at: { type: 'text', default: NOW },
    },
    grapheme_glyphs: {
        id: { type: 'id' },
        grapheme_id: { type: 'int' },
        // Absent (null) in a v1–v3 envelope → attached to the default at insert.
        variant_id: { type: 'int?', default: null },
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
    lexicon_folders: {
        id: { type: 'id' },
        name: { type: 'text' },
        // Self-referencing; null at the root. A v1 export has no folders at all.
        parent_id: { type: 'int?', default: null },
        position: { type: 'int', default: 0 },
        created_at: { type: 'text', default: NOW },
        updated_at: { type: 'text', default: NOW },
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
        // Absent (null) in a v1 envelope; a real folder id in a v2 one.
        folder_id: { type: 'int?', default: null },
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
    // Schema v9; at most one row, `id = 1` (a CHECK in the DDL). The
    // `definition` JSON is validated by the block-scheme layer, not here.
    block_scheme: {
        id: { type: 'int' },
        definition: { type: 'text' },
        updated_at: { type: 'text', default: NOW },
    },
};

/** child table → [column, parent table] pairs that must resolve. */
const REFERENCES: Partial<Record<InsertableTable, [string, InsertableTable][]>> = {
    grapheme_variants: [['grapheme_id', 'graphemes']],
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

    // Each `<folder>.parent_id` and `<item>.folder_id` is a NULLABLE self/cross
    // reference, so the REFERENCES prune loop above (which assumes a non-null
    // FK) cannot police them without dropping every root folder and every
    // unfiled item. Repair dangling ones in place instead — a corrupt file that
    // names a missing parent/folder becomes null rather than aborting the whole
    // import at the final foreign_key_check. A well-formed export has none, and
    // an older envelope has no such folders at all so this is a no-op there.
    const coerceFolderDomain = (
        folderTable: InsertableTable,
        itemTable: InsertableTable,
        itemNoun: string,
    ) => {
        const folderIds = ids[folderTable]!;
        let orphanedFolders = 0;
        for (const row of tables[folderTable]) {
            const parentId = row.parent_id as number | null;
            if (parentId !== null && !folderIds.has(parentId)) {
                row.parent_id = null;
                orphanedFolders++;
            }
        }
        if (orphanedFolders > 0) {
            warnings.push(`${orphanedFolders} folder(s) referenced a missing parent folder and were moved to the root`);
        }
        let unfiledItems = 0;
        for (const row of tables[itemTable]) {
            const folderId = row.folder_id as number | null;
            if (folderId !== null && !folderIds.has(folderId)) {
                row.folder_id = null;
                unfiledItems++;
            }
        }
        if (unfiledItems > 0) {
            warnings.push(`${unfiledItems} ${itemNoun}(s) referenced a missing folder and were moved to the root`);
        }
    };
    coerceFolderDomain('lexicon_folders', 'lexicon', 'word');
    coerceFolderDomain('glyph_folders', 'glyphs', 'glyph');
    coerceFolderDomain('grapheme_folders', 'graphemes', 'grapheme');

    const variantOwner = normaliseVariants(tables, pruned, warnings);
    accepted.grapheme_variants = tables.grapheme_variants.length;
    accepted.grapheme_glyphs = tables.grapheme_glyphs.length;

    // block_scheme is a single-row table (`CHECK (id = 1)`): anything else
    // would abort the insert, so it is dropped here.
    const schemeRows = tables.block_scheme;
    tables.block_scheme = schemeRows.filter(row => row.id === 1);
    if (tables.block_scheme.length !== schemeRows.length) {
        pruned.block_scheme += schemeRows.length - tables.block_scheme.length;
        warnings.push(`${schemeRows.length - tables.block_scheme.length} block_scheme row(s) with an id other than 1 were dropped`);
    }
    // The surviving row's `definition` is a JSON document no column type can
    // police. Run it through the block-scheme validator and store the
    // CANONICAL form: a corrupt or hand-edited document imports as whatever
    // the validator makes of it (the empty scheme at worst) with a warning —
    // it never fails the import, and it never lands in the database unvalidated.
    for (const row of tables.block_scheme) {
        const { scheme, issues } = parseBlockSchemeDefinition(String(row.definition ?? ''));
        row.definition = serializeBlockScheme(scheme);
        if (issues.length > 0) {
            const shown = formatSchemeIssues(issues.slice(0, 3)).join('; ');
            const more = issues.length > 3 ? ` (+${issues.length - 3} more)` : '';
            warnings.push(`The block scheme needed ${issues.length} correction(s) and was imported as corrected: ${shown}${more}`);
        }
    }
    accepted.block_scheme = tables.block_scheme.length;

    // `lexicon.glyph_order` is a JSON column, so no foreign key can see inside
    // it. Resolve every "grapheme-<id>" entry against the graphemes that are
    // actually being imported; a dangling one becomes the placeholder and the
    // word is flagged for review. Left alone, the word would render as "[?N]"
    // and then become UNEDITABLE: the first update re-syncs lexicon_spelling,
    // whose FK to graphemes fails, and the whole save rolls back.
    //
    // A `grapheme-<id>@<variantId>` pin naming a variant that is not one of
    // that grapheme's (after the normalisation above) loses only its pin: the
    // word still names the right sign, so it is NOT flagged.
    let repairedWords = 0;
    let repairedEntries = 0;
    let strippedPins = 0;
    for (const row of tables.lexicon) {
        const order = deserializeGlyphOrder(row.glyph_order as string);
        let changed = 0;
        let pinsChanged = 0;
        const repaired = order.map(entry => {
            const graphemeId = extractGraphemeId(entry);
            if (graphemeId === null) return entry;
            if (!ids.graphemes!.has(graphemeId)) {
                changed++;
                return MISSING_GRAPHEME_PLACEHOLDER;
            }
            const variantId = extractVariantId(entry);
            if (variantId !== null && variantOwner.get(variantId) !== graphemeId) {
                pinsChanged++;
                return createGraphemeEntry(graphemeId);
            }
            return entry;
        });
        if (changed > 0 || pinsChanged > 0) {
            row.glyph_order = serializeGlyphOrder(repaired);
        }
        if (changed > 0) {
            row.needs_attention = 1;
            repairedWords++;
            repairedEntries += changed;
        }
        strippedPins += pinsChanged;
    }
    if (repairedWords > 0) {
        warnings.push(`${repairedWords} word(s) spelled with ${repairedEntries} missing grapheme(s); those entries were replaced with "${MISSING_GRAPHEME_PLACEHOLDER}" and the words flagged for review`);
    }
    if (strippedPins > 0) {
        warnings.push(`${strippedPins} spelling pin(s) named a form their grapheme does not have; those entries now use the automatic form`);
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

/**
 * Bring `grapheme_variants` / `grapheme_glyphs` rows in line with the
 * schema-v9 invariants, in place (see the module comment). Parents were
 * already pruned by the REFERENCES pass. Returns variant id → grapheme id of
 * the surviving variants, for the pin check.
 */
function normaliseVariants(
    tables: Record<InsertableTable, ValidatedRow[]>,
    pruned: Record<InsertableTable, number>,
    warnings: string[],
): Map<number, number> {
    const groupIds = new Set(tables.variant_groups.map(row => row.id as number));
    let clearedGroups = 0;
    let demotedDefaults = 0;
    let promotedDefaults = 0;

    // Per-grapheme lists in (sort_order, id) order, so "the first variant" is
    // the same one `backfillDefaultVariants` would promote.
    const byGrapheme = new Map<number, ValidatedRow[]>();
    for (const row of [...tables.grapheme_variants].sort(
        (a, b) => (a.sort_order as number) - (b.sort_order as number) || (a.id as number) - (b.id as number),
    )) {
        // A dangling group becomes "no group", like a dangling folder.
        if (row.group_id !== null && !groupIds.has(row.group_id as number)) {
            row.group_id = null;
            clearedGroups++;
        }
        const list = byGrapheme.get(row.grapheme_id as number);
        if (list) list.push(row);
        else byGrapheme.set(row.grapheme_id as number, [row]);
    }

    const defaultOf = new Map<number, number>();
    for (const [graphemeId, variants] of byGrapheme) {
        // Exactly one default: the first flagged one wins, others are demoted;
        // none flagged → the first variant is promoted.
        const flagged = variants.filter(v => v.is_default === 1);
        const chosen = flagged[0] ?? variants[0];
        if (flagged.length === 0) promotedDefaults++;
        demotedDefaults += Math.max(0, flagged.length - 1);
        for (const v of variants) v.is_default = v === chosen ? 1 : 0;
        defaultOf.set(graphemeId, chosen.id as number);

        // At most one variant per (grapheme, group): later duplicates are ungrouped.
        const seenGroups = new Set<number>();
        for (const v of variants) {
            if (v.group_id === null) continue;
            if (seenGroups.has(v.group_id as number)) {
                v.group_id = null;
                clearedGroups++;
            } else {
                seenGroups.add(v.group_id as number);
            }
        }
    }

    // Glyph rows: attach null rows of a grapheme that HAS variants to its
    // default here (a grapheme with none gets its default at insert time),
    // and drop rows naming a missing variant or another grapheme's. A
    // duplicate (variant_id, glyph_id, position) slot is deliberately NOT
    // repaired: it violates the table's UNIQUE and fails the import cleanly
    // (rolled back), exactly like a duplicate slot did before variants.
    const variantOwner = new Map(tables.grapheme_variants.map(v => [v.id as number, v.grapheme_id as number]));
    let droppedGlyphRows = 0;
    tables.grapheme_glyphs = tables.grapheme_glyphs.filter(row => {
        const graphemeId = row.grapheme_id as number;
        if (row.variant_id === null && defaultOf.has(graphemeId)) {
            row.variant_id = defaultOf.get(graphemeId)!;
        }
        if (row.variant_id !== null && variantOwner.get(row.variant_id as number) !== graphemeId) {
            droppedGlyphRows++;
            return false;
        }
        return true;
    });
    if (droppedGlyphRows > 0) {
        pruned.grapheme_glyphs += droppedGlyphRows;
        warnings.push(`${droppedGlyphRows} grapheme_glyphs row(s) named a missing form (or another grapheme's) and were dropped`);
    }

    // "Every variant has ≥ 1 glyph": an empty NON-default variant is dropped.
    const glyphedVariants = new Set(tables.grapheme_glyphs.map(row => row.variant_id as number | null));
    const before = tables.grapheme_variants.length;
    tables.grapheme_variants = tables.grapheme_variants.filter(v => v.is_default === 1 || glyphedVariants.has(v.id as number));
    const emptyDropped = before - tables.grapheme_variants.length;
    if (emptyDropped > 0) {
        pruned.grapheme_variants += emptyDropped;
        warnings.push(`${emptyDropped} grapheme form(s) had no glyphs and were dropped`);
    }

    if (clearedGroups > 0) {
        warnings.push(`${clearedGroups} grapheme form(s) referenced a missing or already-used variant group and were ungrouped`);
    }
    if (demotedDefaults > 0 || promotedDefaults > 0) {
        warnings.push(`${demotedDefaults + promotedDefaults} grapheme(s) did not have exactly one default form; the first form was made the default`);
    }

    return new Map(tables.grapheme_variants.map(v => [v.id as number, v.grapheme_id as number]));
}
