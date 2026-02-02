/**
 * Closure Table Service
 *
 * Manages the Transitive Closure Table (lexicon_ancestry_closure)
 * which facilitates O(1) ancestry lookups and cycle detection.
 *
 * Algorithm references:
 * - https://vadimtropanko.com/closure-table-pattern/
 */

import { getDatabase, persistDatabase } from './database';

/**
 * Rebuilds the entries in the closure table for a specific relationship.
 * Should be called when a new ancestor edge (child -> parent) is added.
 *
 * @param childId The ID of the lexicon entry (descendant)
 * @param parentId The ID of the ancestor entry (parent)
 */
export function addClosurePaths(childId: number, parentId: number): void {
    const db = getDatabase();

    // 1. Add direct path
    try {
        db.run(`
            INSERT OR IGNORE INTO lexicon_ancestry_closure (ancestor_id, descendant_id, depth)
            VALUES (?, ?, 1)
        `, [parentId, childId]);
    } catch (e) {
        // Ignore duplicate key error if path exists (shouldn't happen with proper unique keys)
    }

    // 2. Add transitive paths:
    //    For every ancestor of parent (A -> Parent), create A -> Child
    //    Depth = (A -> Parent).depth + 1
    db.run(`
        INSERT OR IGNORE INTO lexicon_ancestry_closure (ancestor_id, descendant_id, depth)
        SELECT 
            closure.ancestor_id,
            ? as descendant_id,
            closure.depth + 1
        FROM lexicon_ancestry_closure closure
        WHERE closure.descendant_id = ?
    `, [childId, parentId]);

    // 3. Add paths for descendants of child (if any exist - unlikely during creation usually, but possible):
    //    For every descendant of child (Child -> D), create Parent -> D
    //    And (A -> Parent) -> (Child -> D)

    // We handle the case where the 'child' is already an ancestor of others (sub-tree attachment)
    // 3a. Parent -> Child -> D
    db.run(`
        INSERT OR IGNORE INTO lexicon_ancestry_closure (ancestor_id, descendant_id, depth)
        SELECT 
            ? as ancestor_id,
            closure.descendant_id,
            closure.depth + 1
        FROM lexicon_ancestry_closure closure
        WHERE closure.ancestor_id = ?
    `, [parentId, childId]);

    // 3b. (Ancestors of Parent) -> Parent -> Child -> D
    // Cross join: All super-ancestors (A) of parent (P) AND all descendants (D) of child (C)
    // New Path: A -> D with depth = (A->P) + 1 + (C->D)
    // Actually the logic is: For each A where A->P, and each D where C->D, insert A->D.
    // Distance(A, D) = Distance(A, P) + 1 + Distance(C, D)
    db.run(`
        INSERT OR IGNORE INTO lexicon_ancestry_closure (ancestor_id, descendant_id, depth)
        SELECT 
            super.ancestor_id,
            sub.descendant_id,
            super.depth + 1 + sub.depth
        FROM lexicon_ancestry_closure super
        CROSS JOIN lexicon_ancestry_closure sub
        WHERE super.descendant_id = ? AND sub.ancestor_id = ?
    `, [parentId, childId]);

    persistDatabase();
}

/**
 * Removes closure paths when a direct relationship is removed.
 *
 * @param childId The ID of the lexicon entry
 * @param parentId The ID of the ancestor entry being removed
 */
export function removeClosurePaths(childId: number, parentId: number): void {
    const db = getDatabase();

    // We only remove paths that strictly rely on the edge Parent->Child.
    // However, in a DAG, there might be alternate paths from A to D not involving P->C.
    // Closure table maintenance normally deletes ALL paths involving the edge,
    // and then re-inserts ones that are still valid.
    // But since this is a simple "Lexicon" case, alternate paths are rare (but possible with Diamond inheritance).

    // Simple approach:
    // Delete paths where the path goes through P->C.
    // This is hard to identify without storing the "path" itself.
    // Standard approach: Delete everything and rebuild for the affected subgraph,
    // OR track path counts.

    // Given we are using SQLite and want simplicity:
    // We will just fully rebuild the closure table because it's safer and our dataset is small (<100k words likely).
    // Or we can rebuild just for the descendants of C.

    // BUT, since user asked for "improvement", maybe we should try to be smart.
    // Let's do a full rebuild of the closure table to be safe. It's fast enough for thousands of words.
    rebuildClosureTable();
}

/**
 * Full rebuild of the closure table from the adjacency list (lexicon_ancestry).
 * Uses Recursive CTE to find all paths.
 */
export function rebuildClosureTable(): void {
    const db = getDatabase();

    db.run('DELETE FROM lexicon_ancestry_closure');

    // Use Recursive CTE to generate all paths
    db.run(`
        INSERT INTO lexicon_ancestry_closure (ancestor_id, descendant_id, depth)
        WITH RECURSIVE paths(ancestor_id, descendant_id, depth) AS (
            -- Base case: direct parents
            SELECT ancestor_id, lexicon_id, 1
            FROM lexicon_ancestry
            
            UNION ALL
            
            -- Recursive case: path -> child
            SELECT p.ancestor_id, la.lexicon_id, p.depth + 1
            FROM paths p
            JOIN lexicon_ancestry la ON p.descendant_id = la.ancestor_id
            WHERE p.depth < 50 -- fail-safe against cycles
        )
        SELECT DISTINCT ancestor_id, descendant_id, depth FROM paths
    `);

    persistDatabase();
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
export function getAllDescendantIdsClosure(ancestorId: number): number[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT descendant_id FROM lexicon_ancestry_closure
        WHERE ancestor_id = ?
    `, [ancestorId]);

    if (result.length === 0) return [];

    return result[0].values.map(row => row[0] as number);
}

/**
 * Get all ancestor IDs for a given descendant.
 * O(1) lookup.
 */
export function getAllAncestorIdsClosure(descendantId: number): number[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT ancestor_id FROM lexicon_ancestry_closure
        WHERE descendant_id = ?
    `, [descendantId]);

    if (result.length === 0) return [];

    return result[0].values.map(row => row[0] as number);
}
