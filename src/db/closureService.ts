/**
 * Closure Table Service
 *
 * Manages the transitive closure table (`lexicon_ancestry_closure`), which
 * gives O(1) ancestry lookups and cycle detection over the adjacency list in
 * `lexicon_ancestry`.
 *
 * The closure is DERIVED data. It is never persisted independently: callers
 * run these functions inside their own transaction (see
 * `utils/transaction.ts`), which schedules the single persist on commit.
 * Export ignores it on import and rebuilds it from `lexicon_ancestry`.
 *
 * Algorithm reference: https://vadimtropanko.com/closure-table-pattern/
 */

import type { Database } from 'sql.js';
import { getDatabase } from './database';

/** Cap on path length when rebuilding — a real cycle would otherwise recurse forever. */
export const CLOSURE_MAX_DEPTH = 50;

/**
 * Add the closure paths created by a new ancestor edge (child → parent).
 *
 * Four insertions cover every new path:
 *   1. parent → child                       (depth 1)
 *   2. A → child      for every A → parent   (depth + 1)
 *   3. parent → D     for every child → D    (depth + 1)
 *   4. A → D          for every A → parent and child → D (depth_A + 1 + depth_D)
 *
 * Upserts keep the SHORTEST depth, so a diamond (a path that already exists
 * through another route) ends up exactly as `rebuildClosureTable` would build
 * it. (The `AND TRUE` after each WHERE is SQLite's documented way to keep the
 * parser from reading `ON CONFLICT` as a join clause after a SELECT.)
 *
 * @param childId  The ID of the lexicon entry (descendant)
 * @param parentId The ID of the ancestor entry (parent)
 */
export function addClosurePaths(childId: number, parentId: number, database: Database = getDatabase()): void {
    database.run(`
        INSERT INTO lexicon_ancestry_closure (ancestor_id, descendant_id, depth)
        VALUES (?, ?, 1)
        ON CONFLICT(ancestor_id, descendant_id) DO UPDATE SET depth = MIN(depth, excluded.depth)
    `, [parentId, childId]);

    database.run(`
        INSERT INTO lexicon_ancestry_closure (ancestor_id, descendant_id, depth)
        SELECT closure.ancestor_id, ? AS descendant_id, closure.depth + 1
        FROM lexicon_ancestry_closure closure
        WHERE closure.descendant_id = ? AND TRUE
        ON CONFLICT(ancestor_id, descendant_id) DO UPDATE SET depth = MIN(depth, excluded.depth)
    `, [childId, parentId]);

    database.run(`
        INSERT INTO lexicon_ancestry_closure (ancestor_id, descendant_id, depth)
        SELECT ? AS ancestor_id, closure.descendant_id, closure.depth + 1
        FROM lexicon_ancestry_closure closure
        WHERE closure.ancestor_id = ? AND TRUE
        ON CONFLICT(ancestor_id, descendant_id) DO UPDATE SET depth = MIN(depth, excluded.depth)
    `, [parentId, childId]);

    database.run(`
        INSERT INTO lexicon_ancestry_closure (ancestor_id, descendant_id, depth)
        SELECT super.ancestor_id, sub.descendant_id, super.depth + 1 + sub.depth
        FROM lexicon_ancestry_closure super
        CROSS JOIN lexicon_ancestry_closure sub
        WHERE super.descendant_id = ? AND sub.ancestor_id = ? AND TRUE
        ON CONFLICT(ancestor_id, descendant_id) DO UPDATE SET depth = MIN(depth, excluded.depth)
    `, [parentId, childId]);
}

/**
 * Recompute the closure after an edge is removed.
 *
 * Removing an edge cannot be done incrementally without path counts (a
 * diamond may keep A → D alive through another route), so the table is
 * rebuilt from the adjacency list. One recursive CTE — fast for thousands of
 * words, and it runs inside the caller's transaction.
 */
export function rebuildClosureAfterEdgeChange(database: Database = getDatabase()): void {
    rebuildClosureTable(database);
}

/**
 * Full rebuild of the closure table from the adjacency list (`lexicon_ancestry`).
 */
export function rebuildClosureTable(database: Database = getDatabase()): void {
    database.run('DELETE FROM lexicon_ancestry_closure');

    database.run(`
        INSERT INTO lexicon_ancestry_closure (ancestor_id, descendant_id, depth)
        WITH RECURSIVE paths(ancestor_id, descendant_id, depth) AS (
            SELECT ancestor_id, lexicon_id, 1
            FROM lexicon_ancestry

            UNION ALL

            SELECT p.ancestor_id, la.lexicon_id, p.depth + 1
            FROM paths p
            JOIN lexicon_ancestry la ON p.descendant_id = la.ancestor_id
            WHERE p.depth < ${CLOSURE_MAX_DEPTH}
        )
        SELECT ancestor_id, descendant_id, MIN(depth)
        FROM paths
        GROUP BY ancestor_id, descendant_id
    `);
}

/**
 * Check if adding parentId as ancestor of childId would create a cycle.
 * O(1) check using closure table.
 */
export function wouldCreateCycleClosure(childId: number, parentId: number): boolean {
    const db = getDatabase();

    if (childId === parentId) return true;

    // Cycle exists if childId is already an ancestor of parentId
    const result = db.exec(`
        SELECT 1 FROM lexicon_ancestry_closure
        WHERE ancestor_id = ? AND descendant_id = ?
        LIMIT 1
    `, [childId, parentId]);

    return result.length > 0 && result[0].values.length > 0;
}

/**
 * Get all descendant IDs for a given ancestor.
 * O(1) lookup.
 */
export function getAllDescendantIdsClosure(ancestorId: number, maxDepth: number = CLOSURE_MAX_DEPTH): number[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT descendant_id FROM lexicon_ancestry_closure
        WHERE ancestor_id = ? AND depth <= ?
    `, [ancestorId, maxDepth]);

    if (result.length === 0) return [];

    return result[0].values.map(row => row[0] as number);
}

/**
 * Get all ancestor IDs for a given descendant.
 * O(1) lookup.
 */
export function getAllAncestorIdsClosure(descendantId: number, maxDepth: number = CLOSURE_MAX_DEPTH): number[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT ancestor_id FROM lexicon_ancestry_closure
        WHERE descendant_id = ? AND depth <= ?
    `, [descendantId, maxDepth]);

    if (result.length === 0) return [];

    return result[0].values.map(row => row[0] as number);
}
