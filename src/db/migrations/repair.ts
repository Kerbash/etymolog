/**
 * Orphan repair
 *
 * Foreign keys were never enforced before Phase 1 (the pragma ran only in
 * `createTables()` and was reset by every `export()`), so any database older
 * than that may hold rows whose parent is gone: junction rows for deleted
 * graphemes, spellings for deleted words, `glyph_order` entries naming a
 * grapheme that no longer exists, closure rows for deleted lexicon ids.
 *
 * With FKs ON those rows do not merely look wrong — a later `DELETE` on the
 * parent table can fail with "FOREIGN KEY constraint failed" because the
 * constraint is checked against rows that should never have survived.
 *
 * `repairOrphans(db)` prunes every such row, rewrites dangling `glyph_order`
 * references to `'?'` (flagging the word for review), and rebuilds the closure
 * table from the repaired adjacency list. It is pure SQL + spelling helpers:
 * no service layer, no persistence, no transaction of its own — the caller
 * wraps it (`withTransaction` on the live DB, the migration runner for v6).
 *
 * Schema v9 adds the variant invariants (every grapheme has exactly one
 * default variant; every glyph row belongs to a variant of ITS grapheme; no
 * empty non-default variant; no `@<variantId>` pin naming a variant the
 * grapheme does not have). Those steps are skipped on a database that has no
 * `grapheme_variants` table yet — migration v6 calls this against a v5 shape.
 *
 * Safe to run on a consistent database: every count comes back zero and the
 * closure rebuild is a no-op in effect.
 */

import type { Database } from 'sql.js';
import { rebuildClosureTable } from '../closureService';
import {
    createGraphemeEntry,
    deserializeGlyphOrder,
    extractGraphemeId,
    extractVariantId,
    serializeGlyphOrder,
} from '../utils/spellingUtils';
import { columnExists, tableExists } from './probes';

/** Placeholder written into `glyph_order` where a grapheme reference could not be resolved. */
export const MISSING_GRAPHEME_PLACEHOLDER = '?';

export interface RepairReport {
    /**
     * `grapheme_glyphs` rows whose grapheme or glyph no longer exists — or
     * (schema v9) whose variant no longer exists or belongs to another grapheme.
     */
    graphemeGlyphsPruned: number;
    /** `grapheme_variants` rows whose grapheme is gone, plus empty non-default variants. */
    graphemeVariantsPruned: number;
    /** `grapheme_variants.group_id` values naming a missing group, cleared to NULL. */
    variantGroupRefsCleared: number;
    /** 'Default' variants created for graphemes that had no variant at all. */
    defaultVariantsCreated: number;
    /** Existing variants promoted to default for graphemes that had variants but no default. */
    defaultVariantsPromoted: number;
    /** `grapheme_glyphs` rows with a NULL `variant_id` attached to their grapheme's default. */
    glyphRowsAttachedToDefault: number;
    /** `@<variantId>` pins removed from `glyph_order` because the variant is not the grapheme's. */
    variantPinsStripped: number;
    /** `phonemes` rows whose grapheme no longer exists. */
    phonemesPruned: number;
    /** `lexicon_spelling` rows whose word or grapheme no longer exists. */
    lexiconSpellingPruned: number;
    /** `lexicon_meanings` rows whose word no longer exists. */
    lexiconMeaningsPruned: number;
    /** `lexicon_ancestry` rows whose word or ancestor no longer exists. */
    lexiconAncestryPruned: number;
    /** Individual `glyph_order` entries rewritten to `'?'`. */
    glyphOrderEntriesReplaced: number;
    /** Lexicon rows that received at least one rewrite (and `needs_attention = 1`). */
    lexiconEntriesFlagged: number;
    /** `lexicon_ancestry_closure` rows referencing a missing lexicon id (before the rebuild). */
    closureRowsPruned: number;
    /** Sum of every count above — zero means the database was already consistent. */
    total: number;
}

/** Rows deleted by the most recent statement. */
function rowsModified(database: Database): number {
    return database.getRowsModified();
}

function deleteWhere(database: Database, sql: string): number {
    database.run(sql);
    return rowsModified(database);
}

function existingGraphemeIds(database: Database): Set<number> {
    const result = database.exec('SELECT id FROM graphemes');
    const ids = new Set<number>();
    if (result.length > 0) {
        for (const row of result[0].values) {
            ids.add(row[0] as number);
        }
    }
    return ids;
}

/** What `backfillDefaultVariants` did. */
export interface DefaultVariantBackfill {
    /** 'Default' variants created for graphemes that had no variant at all. */
    created: number;
    /** Existing variants promoted to default (grapheme had variants, none default). */
    promoted: number;
    /** `grapheme_glyphs` rows whose NULL `variant_id` now names the default. */
    glyphRowsAttached: number;
}

/**
 * Establish "every grapheme has exactly one default variant" and attach
 * variant-less glyph rows to it. Shared by migration v9, `repairOrphans` and
 * the JSON import (a v1–v3 envelope carries no variants at all).
 *
 * 1. A grapheme with variants but no default gets its first variant (lowest
 *    `sort_order`, then id) promoted — creating an empty 'Default' next to a
 *    real form would break "every variant has ≥ 1 glyph".
 * 2. A grapheme with no variant at all gets a 'Default' (`is_default = 1`,
 *    `sort_order = 0`).
 * 3. When `grapheme_glyphs.variant_id` exists (the v9 table), every row with
 *    a NULL `variant_id` is pointed at its grapheme's default. The column is
 *    ABSENT while migration v9 runs this (the rebuild that adds it comes
 *    next and fills it by joining on the default), so the step is skipped.
 *
 * No-op without a `grapheme_variants` table (a pre-v9 shape). No transaction
 * of its own — the caller wraps it.
 */
export function backfillDefaultVariants(database: Database): DefaultVariantBackfill {
    const report: DefaultVariantBackfill = { created: 0, promoted: 0, glyphRowsAttached: 0 };
    if (!tableExists(database, 'grapheme_variants')) {
        return report;
    }

    // The partial unique index allows one default per grapheme; promoting ONE
    // row per default-less grapheme can never collide with it.
    database.run(`
        UPDATE grapheme_variants SET is_default = 1, updated_at = datetime('now')
        WHERE id IN (
            SELECT (
                SELECT v2.id FROM grapheme_variants v2
                WHERE v2.grapheme_id = v.grapheme_id
                ORDER BY v2.sort_order ASC, v2.id ASC
                LIMIT 1
            )
            FROM grapheme_variants v
            GROUP BY v.grapheme_id
            HAVING MAX(v.is_default) = 0
        )
    `);
    report.promoted = rowsModified(database);

    database.run(`
        INSERT INTO grapheme_variants (grapheme_id, name, is_default, sort_order)
        SELECT g.id, 'Default', 1, 0
        FROM graphemes g
        WHERE NOT EXISTS (SELECT 1 FROM grapheme_variants v WHERE v.grapheme_id = g.id)
        ORDER BY g.id
    `);
    report.created = rowsModified(database);

    if (columnExists(database, 'grapheme_glyphs', 'variant_id')) {
        database.run(`
            UPDATE grapheme_glyphs
            SET variant_id = (
                SELECT v.id FROM grapheme_variants v
                WHERE v.grapheme_id = grapheme_glyphs.grapheme_id AND v.is_default = 1
            )
            WHERE variant_id IS NULL
              AND EXISTS (
                SELECT 1 FROM grapheme_variants v
                WHERE v.grapheme_id = grapheme_glyphs.grapheme_id AND v.is_default = 1
              )
        `);
        report.glyphRowsAttached = rowsModified(database);
    }

    return report;
}

/** variant id → its grapheme id, or null when there is no variant table (pre-v9). */
function variantOwners(database: Database): Map<number, number> | null {
    if (!tableExists(database, 'grapheme_variants')) return null;
    const owners = new Map<number, number>();
    const result = database.exec('SELECT id, grapheme_id FROM grapheme_variants');
    if (result.length > 0) {
        for (const row of result[0].values) {
            owners.set(row[0] as number, row[1] as number);
        }
    }
    return owners;
}

/**
 * Rewrite every `glyph_order` entry that references a grapheme which does not
 * exist (→ `'?'`, word flagged), and strip every `@<variantId>` pin naming a
 * variant that is not one of that grapheme's (→ `grapheme-<id>`, word NOT
 * flagged: the spelling still names the right sign, it just loses a styling
 * choice). Returns the counts.
 */
function repairGlyphOrders(database: Database): { entries: number; rows: number; pins: number } {
    const graphemeIds = existingGraphemeIds(database);
    const owners = variantOwners(database);
    const result = database.exec('SELECT id, glyph_order FROM lexicon');
    let entries = 0;
    let rows = 0;
    let pins = 0;

    if (result.length === 0) {
        return { entries, rows, pins };
    }

    for (const row of result[0].values) {
        const lexiconId = row[0] as number;
        const stored = row[1] as string | null;
        const glyphOrder = deserializeGlyphOrder(stored);
        let changed = 0;
        let pinsStripped = 0;

        const repaired = glyphOrder.map(entry => {
            const graphemeId = extractGraphemeId(entry);
            if (graphemeId === null) {
                return entry;
            }
            if (!graphemeIds.has(graphemeId)) {
                changed++;
                return MISSING_GRAPHEME_PLACEHOLDER;
            }
            const variantId = extractVariantId(entry);
            if (variantId !== null && owners !== null && owners.get(variantId) !== graphemeId) {
                pinsStripped++;
                return createGraphemeEntry(graphemeId);
            }
            return entry;
        });

        if (changed === 0 && pinsStripped === 0) {
            continue;
        }

        database.run(
            changed > 0
                ? 'UPDATE lexicon SET glyph_order = ?, needs_attention = 1 WHERE id = ?'
                : 'UPDATE lexicon SET glyph_order = ? WHERE id = ?',
            [serializeGlyphOrder(repaired), lexiconId]
        );
        // lexicon_spelling is DERIVED from glyph_order (one row per grapheme
        // occurrence at its index); rebuild it so positions line up again.
        database.run('DELETE FROM lexicon_spelling WHERE lexicon_id = ?', [lexiconId]);
        repaired.forEach((entry, index) => {
            const graphemeId = extractGraphemeId(entry);
            if (graphemeId !== null) {
                database.run(
                    'INSERT INTO lexicon_spelling (lexicon_id, grapheme_id, position) VALUES (?, ?, ?)',
                    [lexiconId, graphemeId, index]
                );
            }
        });
        entries += changed;
        pins += pinsStripped;
        if (changed > 0) rows++;
    }

    return { entries, rows, pins };
}

interface VariantRepair {
    glyphRowsPruned: number;
    variantsPruned: number;
    groupRefsCleared: number;
    backfill: DefaultVariantBackfill;
}

/**
 * The schema-v9 half of the repair (skipped entirely on a pre-v9 shape):
 * orphaned variants, glyph rows whose variant is missing or foreign, dangling
 * group references, empty non-default variants, then the default backfill.
 * Runs after the per-grapheme glyph-row prune and BEFORE `repairGlyphOrders`,
 * so pins naming a variant pruned here are stripped in the same pass.
 */
function repairVariants(database: Database): VariantRepair {
    const empty: VariantRepair = {
        glyphRowsPruned: 0,
        variantsPruned: 0,
        groupRefsCleared: 0,
        backfill: { created: 0, promoted: 0, glyphRowsAttached: 0 },
    };
    if (!tableExists(database, 'grapheme_variants')) {
        return empty;
    }

    let variantsPruned = deleteWhere(database, `
        DELETE FROM grapheme_variants
        WHERE NOT EXISTS (SELECT 1 FROM graphemes g WHERE g.id = grapheme_variants.grapheme_id)
    `);

    let glyphRowsPruned = 0;
    if (columnExists(database, 'grapheme_glyphs', 'variant_id')) {
        // A row naming a missing variant, or a variant of ANOTHER grapheme,
        // cannot be placed without guessing — prune it. NULL rows are left for
        // the backfill below to attach.
        glyphRowsPruned = deleteWhere(database, `
            DELETE FROM grapheme_glyphs
            WHERE variant_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM grapheme_variants v
                WHERE v.id = grapheme_glyphs.variant_id AND v.grapheme_id = grapheme_glyphs.grapheme_id
              )
        `);
        // "Every variant has ≥ 1 glyph": an empty NON-default variant is
        // meaningless and is deleted. An empty default is left alone (the
        // grapheme itself is empty — a pre-existing condition the import
        // validator warns about, not something repair can invent glyphs for).
        variantsPruned += deleteWhere(database, `
            DELETE FROM grapheme_variants
            WHERE is_default = 0
              AND NOT EXISTS (SELECT 1 FROM grapheme_glyphs gg WHERE gg.variant_id = grapheme_variants.id)
        `);
    }

    let groupRefsCleared = 0;
    if (tableExists(database, 'variant_groups')) {
        database.run(`
            UPDATE grapheme_variants SET group_id = NULL
            WHERE group_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM variant_groups vg WHERE vg.id = grapheme_variants.group_id)
        `);
        groupRefsCleared = rowsModified(database);
    }

    const backfill = backfillDefaultVariants(database);
    return { glyphRowsPruned, variantsPruned, groupRefsCleared, backfill };
}

/**
 * Remove every row whose parent is missing, fix dangling spelling references
 * and rebuild the closure table. See the module comment.
 */
export function repairOrphans(database: Database): RepairReport {
    const graphemeGlyphsOrphaned = deleteWhere(database, `
        DELETE FROM grapheme_glyphs
        WHERE NOT EXISTS (SELECT 1 FROM graphemes g WHERE g.id = grapheme_glyphs.grapheme_id)
           OR NOT EXISTS (SELECT 1 FROM glyphs gl WHERE gl.id = grapheme_glyphs.glyph_id)
    `);

    const variants = repairVariants(database);
    const graphemeGlyphsPruned = graphemeGlyphsOrphaned + variants.glyphRowsPruned;

    const phonemesPruned = deleteWhere(database, `
        DELETE FROM phonemes
        WHERE NOT EXISTS (SELECT 1 FROM graphemes g WHERE g.id = phonemes.grapheme_id)
    `);

    const lexiconSpellingPruned = deleteWhere(database, `
        DELETE FROM lexicon_spelling
        WHERE NOT EXISTS (SELECT 1 FROM lexicon l WHERE l.id = lexicon_spelling.lexicon_id)
           OR NOT EXISTS (SELECT 1 FROM graphemes g WHERE g.id = lexicon_spelling.grapheme_id)
    `);

    const lexiconMeaningsPruned = deleteWhere(database, `
        DELETE FROM lexicon_meanings
        WHERE NOT EXISTS (SELECT 1 FROM lexicon l WHERE l.id = lexicon_meanings.lexicon_id)
    `);

    const lexiconAncestryPruned = deleteWhere(database, `
        DELETE FROM lexicon_ancestry
        WHERE NOT EXISTS (SELECT 1 FROM lexicon l WHERE l.id = lexicon_ancestry.lexicon_id)
           OR NOT EXISTS (SELECT 1 FROM lexicon a WHERE a.id = lexicon_ancestry.ancestor_id)
    `);

    const glyphOrders = repairGlyphOrders(database);

    // The rebuild below replaces the whole closure table; the count is reported
    // so the caller can tell "stale closure" apart from "nothing was wrong".
    const closureRowsPruned = deleteWhere(database, `
        DELETE FROM lexicon_ancestry_closure
        WHERE NOT EXISTS (SELECT 1 FROM lexicon l WHERE l.id = lexicon_ancestry_closure.ancestor_id)
           OR NOT EXISTS (SELECT 1 FROM lexicon d WHERE d.id = lexicon_ancestry_closure.descendant_id)
    `);

    rebuildClosureTable(database);

    const report: RepairReport = {
        graphemeGlyphsPruned,
        graphemeVariantsPruned: variants.variantsPruned,
        variantGroupRefsCleared: variants.groupRefsCleared,
        defaultVariantsCreated: variants.backfill.created,
        defaultVariantsPromoted: variants.backfill.promoted,
        glyphRowsAttachedToDefault: variants.backfill.glyphRowsAttached,
        variantPinsStripped: glyphOrders.pins,
        phonemesPruned,
        lexiconSpellingPruned,
        lexiconMeaningsPruned,
        lexiconAncestryPruned,
        glyphOrderEntriesReplaced: glyphOrders.entries,
        lexiconEntriesFlagged: glyphOrders.rows,
        closureRowsPruned,
        total: 0,
    };
    report.total =
        graphemeGlyphsPruned +
        variants.variantsPruned +
        variants.groupRefsCleared +
        variants.backfill.created +
        variants.backfill.promoted +
        variants.backfill.glyphRowsAttached +
        glyphOrders.pins +
        phonemesPruned +
        lexiconSpellingPruned +
        lexiconMeaningsPruned +
        lexiconAncestryPruned +
        glyphOrders.entries +
        glyphOrders.rows +
        closureRowsPruned;

    return report;
}
