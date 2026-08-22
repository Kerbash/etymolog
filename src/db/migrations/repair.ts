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
 * Safe to run on a consistent database: every count comes back zero and the
 * closure rebuild is a no-op in effect.
 */

import type { Database } from 'sql.js';
import { rebuildClosureTable } from '../closureService';
import {
    deserializeGlyphOrder,
    extractGraphemeId,
    serializeGlyphOrder,
} from '../utils/spellingUtils';

/** Placeholder written into `glyph_order` where a grapheme reference could not be resolved. */
export const MISSING_GRAPHEME_PLACEHOLDER = '?';

export interface RepairReport {
    /** `grapheme_glyphs` rows whose grapheme or glyph no longer exists. */
    graphemeGlyphsPruned: number;
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

/**
 * Rewrite every `glyph_order` entry that references a grapheme which does not
 * exist. Returns the entry and row counts.
 */
function repairGlyphOrders(database: Database): { entries: number; rows: number } {
    const graphemeIds = existingGraphemeIds(database);
    const result = database.exec('SELECT id, glyph_order FROM lexicon');
    let entries = 0;
    let rows = 0;

    if (result.length === 0) {
        return { entries, rows };
    }

    for (const row of result[0].values) {
        const lexiconId = row[0] as number;
        const stored = row[1] as string | null;
        const glyphOrder = deserializeGlyphOrder(stored);
        let changed = 0;

        const repaired = glyphOrder.map(entry => {
            const graphemeId = extractGraphemeId(entry);
            if (graphemeId === null || graphemeIds.has(graphemeId)) {
                return entry;
            }
            changed++;
            return MISSING_GRAPHEME_PLACEHOLDER;
        });

        if (changed === 0) {
            continue;
        }

        database.run(
            'UPDATE lexicon SET glyph_order = ?, needs_attention = 1 WHERE id = ?',
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
        rows++;
    }

    return { entries, rows };
}

/**
 * Remove every row whose parent is missing, fix dangling spelling references
 * and rebuild the closure table. See the module comment.
 */
export function repairOrphans(database: Database): RepairReport {
    const graphemeGlyphsPruned = deleteWhere(database, `
        DELETE FROM grapheme_glyphs
        WHERE NOT EXISTS (SELECT 1 FROM graphemes g WHERE g.id = grapheme_glyphs.grapheme_id)
           OR NOT EXISTS (SELECT 1 FROM glyphs gl WHERE gl.id = grapheme_glyphs.glyph_id)
    `);

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
        phonemesPruned +
        lexiconSpellingPruned +
        lexiconMeaningsPruned +
        lexiconAncestryPruned +
        glyphOrders.entries +
        glyphOrders.rows +
        closureRowsPruned;

    return report;
}
