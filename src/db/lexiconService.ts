/**
 * Lexicon Service
 *
 * CRUD operations for managing lexicon entries and their relationships
 * to graphemes (spelling) and other lexicon entries (ancestry).
 *
 * Two-List Architecture:
 * - glyph_order: JSON array storing the true ordered spelling (source of truth)
 *   - Grapheme references: "grapheme-{id}"
 *   - IPA characters: Stored as-is
 * - lexicon_spelling: Junction table for relational queries only
 *
 * Architecture:
 * - Lexicon: A vocabulary entry with lemma, pronunciation, meaning
 * - LexiconSpelling: Junction table linking graphemes to lexicon (for queries)
 * - LexiconAncestry: Self-referential junction table for etymological relationships
 */

import { getDatabase, persistDatabase } from './database';
import {
    serializeGlyphOrder,
    deserializeGlyphOrder,
    extractGraphemeIds,
    parseGlyphOrder,
    createGraphemeEntry,
    type SpellingEntry,
} from './utils/spellingUtils';
import type {
    Lexicon,
    CreateLexiconInput,
    UpdateLexiconInput,
    LexiconSpelling,
    LexiconAncestry,
    LexiconWithSpelling,
    LexiconWithAncestry,
    LexiconWithDescendants,
    LexiconComplete,
    LexiconAncestorEntry,
    LexiconDescendantEntry,
    LexiconAncestryNode,
    LexiconWithUsage,
    Grapheme,
    CreateLexiconSpellingInput,
    CreateLexiconAncestryInput,
    AncestryType,
    SpellingDisplayEntry,
} from './types';
import {
    addClosurePaths,
    removeClosurePaths,
    rebuildClosureTable,
    wouldCreateCycleClosure
} from './closureService';

// =============================================================================
// LEXICON CRUD OPERATIONS
// =============================================================================

/**
 * Create a new lexicon entry with optional spelling and ancestry.
 *
 * Supports both new glyph_order format and legacy spelling format.
 * The glyph_order is stored as the source of truth, and lexicon_spelling
 * is updated for relational queries.
 */
export function createLexicon(input: CreateLexiconInput): LexiconComplete {
    const db = getDatabase();

    // Determine glyph_order from input
    let glyphOrder: SpellingEntry[] = [];

    if (input.glyph_order && input.glyph_order.length > 0) {
        // New format: use glyph_order directly
        glyphOrder = input.glyph_order;
        // console.log('DEBUG: glyphOrder from input:', glyphOrder);
    } else if (input.spelling && input.spelling.length > 0) {
        // Legacy format: convert spelling to glyph_order
        // Sort by position first to ensure correct order
        const sortedSpelling = [...input.spelling].sort((a, b) => a.position - b.position);
        glyphOrder = sortedSpelling.map(s => createGraphemeEntry(s.grapheme_id));
    }

    const glyphOrderJson = serializeGlyphOrder(glyphOrder);

    // Insert the lexicon entry
    db.run(
        `INSERT INTO lexicon (lemma, pronunciation, is_native, auto_spell, meaning, part_of_speech, notes, glyph_order, needs_attention) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            input.lemma !== undefined ? input.lemma : null,
            input.pronunciation !== undefined ? input.pronunciation : null,
            input.is_native !== false ? 1 : 0,
            input.auto_spell !== false ? 1 : 0,
            input.meaning !== undefined ? input.meaning : null,
            input.part_of_speech !== undefined ? input.part_of_speech : null,
            input.notes !== undefined ? input.notes : null,
            glyphOrderJson,
            0, // needs_attention defaults to false
        ]
    );

    const result = db.exec('SELECT last_insert_rowid() as id');
    const lexiconId = result[0].values[0][0] as number;

    // Sync lexicon_spelling junction table from glyph_order
    syncLexiconSpellingFromGlyphOrder(lexiconId, glyphOrder);

    // Add ancestry if provided
    if (input.ancestry && input.ancestry.length > 0) {
        for (const ancestryInput of input.ancestry) {
            addAncestorToLexicon(lexiconId, ancestryInput);
        }
    }

    persistDatabase();

    const lexicon = getLexiconComplete(lexiconId);
    if (!lexicon) {
        throw new Error('Failed to create lexicon entry');
    }

    return lexicon;
}

/**
 * Get a lexicon entry by ID (without spelling or ancestry).
 */
export function getLexiconById(id: number): Lexicon | null {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, lemma, pronunciation, is_native, auto_spell, meaning, part_of_speech, notes, glyph_order, needs_attention, created_at, updated_at 
         FROM lexicon WHERE id = ?`,
        [id]
    );

    if (result.length === 0 || result[0].values.length === 0) {
        return null;
    }

    const row = result[0].values[0];
    return mapRowToLexicon(row);
}

/**
 * Get a lexicon entry with its spelling (ordered graphemes).
 */
export function getLexiconWithSpelling(id: number): LexiconWithSpelling | null {
    const lexicon = getLexiconById(id);
    if (!lexicon) return null;

    const spelling = getSpellingByLexiconId(id);
    return { ...lexicon, spelling };
}

/**
 * Get a lexicon entry with its direct ancestors.
 */
export function getLexiconWithAncestry(id: number): LexiconWithAncestry | null {
    const lexicon = getLexiconById(id);
    if (!lexicon) return null;

    const ancestors = getAncestorsByLexiconId(id);
    return { ...lexicon, ancestors };
}

/**
 * Get a lexicon entry with its descendants.
 */
export function getLexiconWithDescendants(id: number): LexiconWithDescendants | null {
    const lexicon = getLexiconById(id);
    if (!lexicon) return null;

    const descendants = getDescendantsByLexiconId(id);
    return { ...lexicon, descendants };
}

/**
 * Get a lexicon entry with spelling, ancestors, and descendants.
 * Uses glyph_order as the source of truth for spelling display.
 */
export function getLexiconComplete(id: number): LexiconComplete | null {
    const lexicon = getLexiconById(id);
    if (!lexicon) return null;

    // Build spelling display from glyph_order
    const { entries: spellingDisplay, hasIpaFallbacks } = buildSpellingDisplay(lexicon.glyph_order);

    // Legacy spelling field (graphemes only)
    const spelling = spellingDisplay
        .filter(e => e.type === 'grapheme' && e.grapheme)
        .map(e => e.grapheme!);

    const ancestors = getAncestorsByLexiconId(id);
    const descendants = getDescendantsByLexiconId(id);

    return { ...lexicon, spellingDisplay, spelling, ancestors, descendants, hasIpaFallbacks };
}

/**
 * Get all lexicon entries (without related data).
 */
export function getAllLexicon(): Lexicon[] {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, lemma, pronunciation, is_native, auto_spell, meaning, part_of_speech, notes, glyph_order, needs_attention, created_at, updated_at 
         FROM lexicon 
         ORDER BY needs_attention DESC, COALESCE(pronunciation, lemma) ASC`
    );

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map(mapRowToLexicon);
}

/**
 * Get all lexicon entries with their spelling.
 */
export function getAllLexiconWithSpelling(): LexiconWithSpelling[] {
    const entries = getAllLexicon();

    return entries.map(entry => ({
        ...entry,
        spelling: getSpellingByLexiconId(entry.id),
    }));
}

/**
 * Get all lexicon entries with full data.
 * Entries needing attention are sorted to the top.
 */
export function getAllLexiconComplete(): LexiconComplete[] {
    const entries = getAllLexicon();

    return entries.map(entry => {
        const { entries: spellingDisplay, hasIpaFallbacks } = buildSpellingDisplay(entry.glyph_order);
        const spelling = spellingDisplay
            .filter(e => e.type === 'grapheme' && e.grapheme)
            .map(e => e.grapheme!);

        return {
            ...entry,
            spellingDisplay,
            spelling,
            ancestors: getAncestorsByLexiconId(entry.id),
            descendants: getDescendantsByLexiconId(entry.id),
            hasIpaFallbacks,
        };
    });
}

/**
 * Get all lexicon entries with usage (descendant count).
 */
export function getAllLexiconWithUsage(): LexiconWithUsage[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT l.id, l.lemma, l.pronunciation, l.is_native, l.auto_spell, l.meaning, 
               l.part_of_speech, l.notes, l.glyph_order, l.needs_attention, l.created_at, l.updated_at,
               COUNT(la.id) as descendant_count
        FROM lexicon l
        LEFT JOIN lexicon_ancestry la ON l.id = la.ancestor_id
        GROUP BY l.id
        ORDER BY l.needs_attention DESC, COALESCE(l.pronunciation, l.lemma) ASC
    `);

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => ({
        ...mapRowToLexicon(row),
        descendantCount: row[12] as number,
    }));
}

/**
 * Search lexicon entries by lemma, pronunciation, or meaning.
 */
export function searchLexicon(query: string): Lexicon[] {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, lemma, pronunciation, is_native, auto_spell, meaning, part_of_speech, notes, glyph_order, needs_attention, created_at, updated_at 
         FROM lexicon 
         WHERE pronunciation LIKE ? OR meaning LIKE ? OR lemma LIKE ?
         ORDER BY needs_attention DESC, COALESCE(pronunciation, lemma) ASC`,
        [`%${query}%`, `%${query}%`, `%${query}%`]
    );

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map(mapRowToLexicon);
}

/**
 * Get lexicon entries filtered by is_native flag.
 */
export function getLexiconByNative(isNative: boolean): Lexicon[] {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, lemma, pronunciation, is_native, auto_spell, meaning, part_of_speech, notes, glyph_order, needs_attention, created_at, updated_at 
         FROM lexicon 
         WHERE is_native = ?
         ORDER BY needs_attention DESC, COALESCE(pronunciation, lemma) ASC`,
        [isNative ? 1 : 0]
    );

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map(mapRowToLexicon);
}

/**
 * Update a lexicon entry's basic info.
 * If glyph_order is provided, also syncs the lexicon_spelling junction table.
 */
export function updateLexicon(id: number, input: UpdateLexiconInput): Lexicon | null {
    const db = getDatabase();

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.lemma !== undefined) {
        updates.push('lemma = ?');
        values.push(input.lemma);
    }
    if (input.pronunciation !== undefined) {
        updates.push('pronunciation = ?');
        values.push(input.pronunciation);
    }
    if (input.is_native !== undefined) {
        updates.push('is_native = ?');
        values.push(input.is_native ? 1 : 0);
    }
    if (input.auto_spell !== undefined) {
        updates.push('auto_spell = ?');
        values.push(input.auto_spell ? 1 : 0);
    }
    if (input.meaning !== undefined) {
        updates.push('meaning = ?');
        values.push(input.meaning);
    }
    if (input.part_of_speech !== undefined) {
        updates.push('part_of_speech = ?');
        values.push(input.part_of_speech);
    }
    if (input.notes !== undefined) {
        updates.push('notes = ?');
        values.push(input.notes);
    }
    if (input.glyph_order !== undefined) {
        const glyphOrderJson = serializeGlyphOrder(input.glyph_order);
        updates.push('glyph_order = ?');
        values.push(glyphOrderJson);
    }
    if (input.needs_attention !== undefined) {
        updates.push('needs_attention = ?');
        values.push(input.needs_attention ? 1 : 0);
    }

    if (updates.length === 0) {
        return getLexiconById(id);
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.run(`UPDATE lexicon SET ${updates.join(', ')} WHERE id = ?`, values);

    // If glyph_order was updated, sync the junction table
    if (input.glyph_order !== undefined) {
        syncLexiconSpellingFromGlyphOrder(id, input.glyph_order);
    }

    persistDatabase();

    return getLexiconById(id);
}

/**
 * Delete a lexicon entry.
 * Cascades to spelling and ancestry.
 * Safely removes relationships where this lexicon is an ancestor.
 */
export function deleteLexicon(id: number): boolean {
    const db = getDatabase();

    // Check if lexicon exists
    const existing = getLexiconById(id);
    if (!existing) {
        throw new Error(`Lexicon entry with id ${id} not found`);
    }

    // Manual cascade deletion (required if FKs are disabled/unreliable)

    // 1. Delete spelling
    db.run('DELETE FROM lexicon_spelling WHERE lexicon_id = ?', [id]);

    // 2. Delete ancestry where this is the child
    db.run('DELETE FROM lexicon_ancestry WHERE lexicon_id = ?', [id]);

    // 3. Delete ancestry where this is the ancestor
    // This effectively acts as CASCADE (removing the relationship)
    db.run('DELETE FROM lexicon_ancestry WHERE ancestor_id = ?', [id]);

    // 4. Delete the lexicon entry
    db.run('DELETE FROM lexicon WHERE id = ?', [id]);

    const changes = db.getRowsModified();
    if (changes > 0) {
        persistDatabase();
    }

    return changes > 0;
}

/**
 * Get count of lexicon entries.
 */
export function getLexiconCount(): number {
    const db = getDatabase();

    const result = db.exec('SELECT COUNT(*) FROM lexicon');
    return result[0]?.values[0]?.[0] as number ?? 0;
}

// =============================================================================
// LEXICON SPELLING OPERATIONS
// =============================================================================

/**
 * Get the ordered graphemes for a lexicon entry's spelling.
 */
export function getSpellingByLexiconId(lexiconId: number): Grapheme[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT g.id, g.name, g.category, g.notes, g.created_at, g.updated_at
        FROM graphemes g
        JOIN lexicon_spelling ls ON g.id = ls.grapheme_id
        WHERE ls.lexicon_id = ?
        ORDER BY ls.position ASC
    `, [lexiconId]);

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => ({
        id: row[0] as number,
        name: row[1] as string,
        category: row[2] as string | null,
        notes: row[3] as string | null,
        created_at: row[4] as string,
        updated_at: row[5] as string,
    }));
}

/**
 * Get the junction table entries for a lexicon's spelling.
 */
export function getLexiconSpellingEntries(lexiconId: number): LexiconSpelling[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT id, lexicon_id, grapheme_id, position
        FROM lexicon_spelling
        WHERE lexicon_id = ?
        ORDER BY position ASC
    `, [lexiconId]);

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => ({
        id: row[0] as number,
        lexicon_id: row[1] as number,
        grapheme_id: row[2] as number,
        position: row[3] as number,
    }));
}

/**
 * Add a grapheme to a lexicon's spelling at a specific position.
 */
export function addSpellingToLexicon(lexiconId: number, input: CreateLexiconSpellingInput): LexiconSpelling {
    const db = getDatabase();

    db.run(`
        INSERT INTO lexicon_spelling (lexicon_id, grapheme_id, position)
        VALUES (?, ?, ?)
    `, [lexiconId, input.grapheme_id, input.position]);

    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result[0].values[0][0] as number;

    // Update lexicon's updated_at
    db.run(`UPDATE lexicon SET updated_at = datetime('now') WHERE id = ?`, [lexiconId]);

    persistDatabase();

    return {
        id,
        lexicon_id: lexiconId,
        grapheme_id: input.grapheme_id,
        position: input.position,
    };
}

/**
 * Replace a lexicon's entire spelling (delete all and re-add).
 */
export function setLexiconSpelling(lexiconId: number, spelling: CreateLexiconSpellingInput[]): void {
    const db = getDatabase();

    // Delete existing spelling
    db.run('DELETE FROM lexicon_spelling WHERE lexicon_id = ?', [lexiconId]);

    // Add new spelling
    for (const input of spelling) {
        db.run(`
            INSERT INTO lexicon_spelling (lexicon_id, grapheme_id, position)
            VALUES (?, ?, ?)
        `, [lexiconId, input.grapheme_id, input.position]);
    }

    // Update lexicon's updated_at
    db.run(`UPDATE lexicon SET updated_at = datetime('now') WHERE id = ?`, [lexiconId]);

    persistDatabase();
}

/**
 * Remove all spelling from a lexicon entry.
 */
export function clearLexiconSpelling(lexiconId: number): number {
    const db = getDatabase();

    db.run('DELETE FROM lexicon_spelling WHERE lexicon_id = ?', [lexiconId]);

    const changes = db.getRowsModified();
    if (changes > 0) {
        db.run(`UPDATE lexicon SET updated_at = datetime('now') WHERE id = ?`, [lexiconId]);
        persistDatabase();
    }

    return changes;
}

// =============================================================================
// LEXICON ANCESTRY OPERATIONS
// =============================================================================

/**
 * Get the direct ancestors of a lexicon entry.
 */
export function getAncestorsByLexiconId(lexiconId: number): LexiconAncestorEntry[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT l.id, l.lemma, l.pronunciation, l.is_native, l.auto_spell, l.meaning, 
               l.part_of_speech, l.notes, l.created_at, l.updated_at,
               la.position, la.ancestry_type
        FROM lexicon l
        JOIN lexicon_ancestry la ON l.id = la.ancestor_id
        WHERE la.lexicon_id = ?
        ORDER BY la.position ASC
    `, [lexiconId]);

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => ({
        ancestor: mapRowToLexicon(row),
        position: row[10] as number,
        ancestry_type: row[11] as AncestryType,
    }));
}

/**
 * Get the descendants of a lexicon entry (words derived from this word).
 */
export function getDescendantsByLexiconId(ancestorId: number): LexiconDescendantEntry[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT l.id, l.lemma, l.pronunciation, l.is_native, l.auto_spell, l.meaning, 
               l.part_of_speech, l.notes, l.created_at, l.updated_at,
               la.ancestry_type
        FROM lexicon l
        JOIN lexicon_ancestry la ON l.id = la.lexicon_id
        WHERE la.ancestor_id = ?
        ORDER BY COALESCE(l.pronunciation, l.lemma) ASC
    `, [ancestorId]);

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => ({
        descendant: mapRowToLexicon(row),
        ancestry_type: row[10] as AncestryType,
    }));
}

/**
 * Get the junction table entries for a lexicon's ancestry.
 */
export function getLexiconAncestryEntries(lexiconId: number): LexiconAncestry[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT id, lexicon_id, ancestor_id, position, ancestry_type
        FROM lexicon_ancestry
        WHERE lexicon_id = ?
        ORDER BY position ASC
    `, [lexiconId]);

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => ({
        id: row[0] as number,
        lexicon_id: row[1] as number,
        ancestor_id: row[2] as number,
        position: row[3] as number,
        ancestry_type: row[4] as AncestryType,
    }));
}

/**
 * Add an ancestor to a lexicon entry.
 */
export function addAncestorToLexicon(lexiconId: number, input: CreateLexiconAncestryInput): LexiconAncestry {
    // Check for cycles
    if (wouldCreateCycleClosure(lexiconId, input.ancestor_id)) {
        throw new Error(`Cannot add ancestor: would create a cycle (lexicon ${lexiconId} is an ancestor of ${input.ancestor_id})`);
    }

    const db = getDatabase();

    db.run(`
        INSERT INTO lexicon_ancestry (lexicon_id, ancestor_id, position, ancestry_type)
        VALUES (?, ?, ?, ?)
    `, [lexiconId, input.ancestor_id, input.position, input.ancestry_type ?? 'derived']);

    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result[0].values[0][0] as number;

    // Update lexicon's updated_at
    db.run(`UPDATE lexicon SET updated_at = datetime('now') WHERE id = ?`, [lexiconId]);

    // Update closure table
    addClosurePaths(lexiconId, input.ancestor_id);

    persistDatabase();

    return {
        id,
        lexicon_id: lexiconId,
        ancestor_id: input.ancestor_id,
        position: input.position,
        ancestry_type: input.ancestry_type ?? 'derived',
    };
}

/**
 * Replace a lexicon's entire ancestry (delete all and re-add).
 */
export function setLexiconAncestry(lexiconId: number, ancestry: CreateLexiconAncestryInput[]): void {
    const db = getDatabase();

    // Delete existing ancestry
    db.run('DELETE FROM lexicon_ancestry WHERE lexicon_id = ?', [lexiconId]);

    // Add new ancestry
    for (const input of ancestry) {
        db.run(`
            INSERT INTO lexicon_ancestry (lexicon_id, ancestor_id, position, ancestry_type)
            VALUES (?, ?, ?, ?)
        `, [lexiconId, input.ancestor_id, input.position, input.ancestry_type ?? 'derived']);
    }

    // Update lexicon's updated_at
    db.run(`UPDATE lexicon SET updated_at = datetime('now') WHERE id = ?`, [lexiconId]);

    // Rebuild closure table to be safe since we did a bulk change involving deletes
    rebuildClosureTable();

    persistDatabase();
}

/**
 * Remove an ancestor from a lexicon entry.
 */
export function removeAncestorFromLexicon(lexiconId: number, ancestorId: number): boolean {
    const db = getDatabase();

    db.run('DELETE FROM lexicon_ancestry WHERE lexicon_id = ? AND ancestor_id = ?', [lexiconId, ancestorId]);

    const changes = db.getRowsModified();
    if (changes > 0) {
        db.run(`UPDATE lexicon SET updated_at = datetime('now') WHERE id = ?`, [lexiconId]);

        // Remove closure paths (currently implemented as full rebuild in closureService)
        removeClosurePaths(lexiconId, ancestorId);

        persistDatabase();
    }

    return changes > 0;
}

/**
 * Clear all ancestry for a lexicon entry.
 */
export function clearLexiconAncestry(lexiconId: number): number {
    const db = getDatabase();

    db.run('DELETE FROM lexicon_ancestry WHERE lexicon_id = ?', [lexiconId]);

    const changes = db.getRowsModified();
    if (changes > 0) {
        db.run(`UPDATE lexicon SET updated_at = datetime('now') WHERE id = ?`, [lexiconId]);

        // Ancestry cleared, rebuild closure (simplest approach for now)
        rebuildClosureTable();

        persistDatabase();
    }

    return changes;
}

// =============================================================================
// RECURSIVE ANCESTRY QUERIES
// =============================================================================

/**
 * Get the full ancestry tree for a lexicon entry (recursive).
 * Uses a recursive CTE for efficient querying.
 *
 * @param id - The lexicon entry ID to get ancestry for
 * @param maxDepth - Maximum depth to traverse (default: 50, to prevent infinite loops)
 */
export function getFullAncestryTree(id: number, maxDepth: number = 50): LexiconAncestryNode {
    const lexicon = getLexiconById(id);
    if (!lexicon) {
        throw new Error(`Lexicon entry with id ${id} not found`);
    }

    // Build the tree recursively
    const visited = new Set<number>();

    function buildNode(entryId: number, ancestryType: AncestryType | null, position: number | null, depth: number): LexiconAncestryNode {
        const entry = getLexiconById(entryId);
        if (!entry || visited.has(entryId) || depth > maxDepth) {
            return {
                entry: entry ?? { id: entryId, lemma: '[Not Found]' } as Lexicon,
                ancestry_type: ancestryType,
                position: position,
                ancestors: [],
            };
        }

        visited.add(entryId);

        const ancestorEntries = getAncestorsByLexiconId(entryId);
        const ancestorNodes = ancestorEntries.map(ae =>
            buildNode(ae.ancestor.id, ae.ancestry_type, ae.position, depth + 1)
        );

        return {
            entry,
            ancestry_type: ancestryType,
            position: position,
            ancestors: ancestorNodes,
        };
    }

    return buildNode(id, null, null, 0);
}

/**
 * Get all ancestor IDs for a lexicon entry (flattened, recursive).
 * Useful for checking if adding an ancestor would create a cycle.
 */
export function getAllAncestorIds(id: number, maxDepth: number = 50): number[] {
    const db = getDatabase();

    // Use recursive CTE for efficiency
    const result = db.exec(`
        WITH RECURSIVE ancestors AS (
            SELECT ancestor_id, 1 as depth
            FROM lexicon_ancestry
            WHERE lexicon_id = ?
            
            UNION ALL
            
            SELECT la.ancestor_id, a.depth + 1
            FROM lexicon_ancestry la
            JOIN ancestors a ON la.lexicon_id = a.ancestor_id
            WHERE a.depth < ?
        )
        SELECT DISTINCT ancestor_id FROM ancestors
    `, [id, maxDepth]);

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => row[0] as number);
}

/**
 * Get all descendant IDs for a lexicon entry (flattened, recursive).
 */
export function getAllDescendantIds(id: number, maxDepth: number = 50): number[] {
    const db = getDatabase();

    // Use closure table for O(1) if available
    const closureResult = db.exec(`
        SELECT descendant_id FROM lexicon_ancestry_closure
        WHERE ancestor_id = ?
    `, [id]);

    if (closureResult.length > 0) {
        return closureResult[0].values.map(row => row[0] as number);
    }

    // Fallback to recursive CTE (if closure table empty/broken)
    const result = db.exec(`
        WITH RECURSIVE descendants AS (
            SELECT lexicon_id, 1 as depth
            FROM lexicon_ancestry
            WHERE ancestor_id = ?
            
            UNION ALL
            
            SELECT la.lexicon_id, d.depth + 1
            FROM lexicon_ancestry la
            JOIN descendants d ON la.ancestor_id = d.lexicon_id
            WHERE d.depth < ?
        )
        SELECT DISTINCT lexicon_id FROM descendants
    `, [id, maxDepth]);

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => row[0] as number);
}

/**
 * Check if adding an ancestor would create a cycle.
 *
 * Adding `ancestorId` as an ancestor of `lexiconId` would create a cycle if:
 * 1. lexiconId === ancestorId (self-reference)
 * 2. lexiconId is already an ancestor of ancestorId (because then we'd have:
 *    ancestorId -> ... -> lexiconId -> ancestorId, creating a loop)
 *
 * In other words: if lexiconId appears in the ancestry chain of ancestorId,
 * we cannot make ancestorId an ancestor of lexiconId.
 */
export function wouldCreateCycle(lexiconId: number, ancestorId: number): boolean {
    return wouldCreateCycleClosure(lexiconId, ancestorId);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Map a database row to a Lexicon object.
 * Expected column order: id, lemma, pronunciation, is_native, auto_spell, meaning,
 *                        part_of_speech, notes, glyph_order, needs_attention, created_at, updated_at
 */
function mapRowToLexicon(row: unknown[]): Lexicon {
    return {
        id: row[0] as number,
        lemma: row[1] as string,
        pronunciation: row[2] as string | null,
        is_native: (row[3] as number) === 1,
        auto_spell: (row[4] as number) === 1,
        meaning: row[5] as string | null,
        part_of_speech: row[6] as string | null,
        notes: row[7] as string | null,
        glyph_order: row[8] as string ?? '[]',
        needs_attention: (row[9] as number) === 1,
        created_at: row[10] as string,
        updated_at: row[11] as string,
    };
}

/**
 * Sync the lexicon_spelling junction table from glyph_order.
 * This extracts unique grapheme IDs from glyph_order and updates the junction table.
 *
 * @param lexiconId - The lexicon entry ID
 * @param glyphOrder - The glyph_order array
 */
export function syncLexiconSpellingFromGlyphOrder(lexiconId: number, glyphOrder: SpellingEntry[]): void {
    const db = getDatabase();

    // Delete existing spelling entries
    db.run('DELETE FROM lexicon_spelling WHERE lexicon_id = ?', [lexiconId]);

    // Extract unique grapheme IDs from glyph_order
    const extracted = extractGraphemeIds(glyphOrder);

    // Add new entries (position just for ordering, we use grapheme_id uniqueness)
    // Note: Since glyph_order is the source of truth for ordering, we just need
    // the junction table for queries like "which words use grapheme X?"
    // We'll assign position based on first occurrence in glyph_order
    const positionMap = new Map<number, number>();
    let position = 0;
    for (const entry of parseGlyphOrder(glyphOrder)) {
        if (entry.type === 'grapheme' && entry.graphemeId && !positionMap.has(entry.graphemeId)) {
            positionMap.set(entry.graphemeId, position++);
        }
    }

    for (const graphemeId of extracted.graphemeIds) {
        const pos = positionMap.get(graphemeId) ?? 0;
        try {
            db.run(`
                INSERT INTO lexicon_spelling (lexicon_id, grapheme_id, position)
                VALUES (?, ?, ?)
            `, [lexiconId, graphemeId, pos]);
        } catch (error) {
            // Ignore constraint violations (shouldn't happen with unique grapheme IDs)
            console.warn(`[LexiconService] Failed to sync spelling for lexicon ${lexiconId}, grapheme ${graphemeId}:`, error);
        }
    }
}

/**
 * Build spelling display entries from glyph_order.
 * Resolves grapheme references to full grapheme data.
 *
 * @param glyphOrder - The glyph_order JSON string
 * @returns Array of SpellingDisplayEntry
 */
export function buildSpellingDisplay(glyphOrder: string): { entries: SpellingDisplayEntry[]; hasIpaFallbacks: boolean } {
    const db = getDatabase();
    const entries: SpellingDisplayEntry[] = [];
    const parsed = parseGlyphOrder(deserializeGlyphOrder(glyphOrder));
    let hasIpaFallbacks = false;

    for (let i = 0; i < parsed.length; i++) {
        const entry = parsed[i];

        if (entry.type === 'grapheme' && entry.graphemeId) {
            // Resolve grapheme from database
            const result = db.exec(`
                SELECT id, name, category, notes, created_at, updated_at
                FROM graphemes WHERE id = ?
            `, [entry.graphemeId]);

            if (result.length > 0 && result[0].values.length > 0) {
                const row = result[0].values[0];
                entries.push({
                    type: 'grapheme',
                    position: i,
                    grapheme: {
                        id: row[0] as number,
                        name: row[1] as string,
                        category: row[2] as string | null,
                        notes: row[3] as string | null,
                        created_at: row[4] as string,
                        updated_at: row[5] as string,
                    },
                });
            } else {
                // Grapheme not found - might have been deleted
                // Convert to IPA fallback if we have the character info
                entries.push({
                    type: 'ipa',
                    position: i,
                    ipaCharacter: `[?${entry.graphemeId}]`, // Placeholder for missing grapheme
                });
                hasIpaFallbacks = true;
            }
        } else if (entry.type === 'ipa' && entry.ipaCharacter) {
            entries.push({
                type: 'ipa',
                position: i,
                ipaCharacter: entry.ipaCharacter,
            });
            hasIpaFallbacks = true;
        }
    }

    return { entries, hasIpaFallbacks };
}

// =============================================================================
// GRAPHEME DELETION HANDLING
// =============================================================================

/**
 * Get all lexicon entries that use a specific grapheme in their spelling.
 *
 * @param graphemeId - The grapheme ID to check
 * @returns Array of lexicon entries using this grapheme
 */
export function getLexiconEntriesUsingGrapheme(graphemeId: number): Lexicon[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT DISTINCT l.id, l.lemma, l.pronunciation, l.is_native, l.auto_spell, 
                l.meaning, l.part_of_speech, l.notes, l.glyph_order, l.needs_attention, 
                l.created_at, l.updated_at
         FROM lexicon l
         JOIN lexicon_spelling ls ON l.id = ls.lexicon_id
         WHERE ls.grapheme_id = ?
         ORDER BY COALESCE(l.pronunciation, l.lemma) ASC
     `, [graphemeId]);

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map(mapRowToLexicon);
}

/**
 * Handle grapheme deletion by respelling affected lexicon entries.
 *
 * For entries with auto_spell=true:
 * - Trigger auto-respelling using the pronunciation
 * - Replace deleted grapheme with IPA fallback if respelling fails
 *
 * For entries with auto_spell=false:
 * - Mark needs_attention=true for manual review
 * - Replace deleted grapheme with IPA placeholder
 *
 * @param graphemeId - The ID of the deleted grapheme
 * @param deletedGraphemePronunciation - Optional primary phoneme of the deleted grapheme (for IPA fallback)
 * @returns Object with counts of affected entries
 */
export function handleGraphemeDeletion(
    graphemeId: number,
    deletedGraphemePronunciation?: string
): {
    respelledCount: number;
    markedForAttentionCount: number;
    affectedLexiconIds: number[];
} {
    const affectedEntries = getLexiconEntriesUsingGrapheme(graphemeId);
    const affectedLexiconIds: number[] = [];
    let respelledCount = 0;
    let markedForAttentionCount = 0;

    // Note: We don't use auto-spell here to avoid circular dependencies.
    // Instead, we replace the deleted grapheme with IPA fallback and let the user
    // re-spell manually if needed, or rely on auto_spell during the next edit.

    for (const entry of affectedEntries) {
        affectedLexiconIds.push(entry.id);

        // Parse current glyph_order
        const currentGlyphOrder = deserializeGlyphOrder(entry.glyph_order);

        // Replace the deleted grapheme with IPA fallback
        const graphemeEntry = createGraphemeEntry(graphemeId);
        const fallbackChar = deletedGraphemePronunciation || '?';

        const newGlyphOrder = currentGlyphOrder.map(e =>
            e === graphemeEntry ? fallbackChar : e
        );

        // For auto_spell entries, we'll mark them but not force attention
        // since they can be auto-respelled on next edit
        const shouldMarkAttention = !entry.auto_spell;

        updateLexicon(entry.id, {
            glyph_order: newGlyphOrder,
            needs_attention: shouldMarkAttention,
        });

        if (shouldMarkAttention) {
            markedForAttentionCount++;
        } else {
            respelledCount; // Count as "handled" since auto_spell entries will auto-fix
        }
    }

    return {
        respelledCount,
        markedForAttentionCount,
        affectedLexiconIds,
    };
}

/**
 * Get lexicon entries that need attention (manual review required).
 *
 * @returns Array of lexicon entries with needs_attention=true
 */
export function getLexiconEntriesNeedingAttention(): Lexicon[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT id, lemma, pronunciation, is_native, auto_spell, meaning, 
               part_of_speech, notes, glyph_order, needs_attention, created_at, updated_at
        FROM lexicon
        WHERE needs_attention = 1
        ORDER BY updated_at DESC
    `);

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map(mapRowToLexicon);
}

/**
 * Mark a lexicon entry as no longer needing attention.
 *
 * @param lexiconId - The lexicon entry ID
 * @returns The updated lexicon entry
 */
export function clearNeedsAttention(lexiconId: number): Lexicon | null {
    return updateLexicon(lexiconId, { needs_attention: false });
}

/**
 * Update a lexicon's glyph_order directly and sync the junction table.
 *
 * @param lexiconId - The lexicon entry ID
 * @param glyphOrder - The new glyph_order array
 * @returns The updated lexicon entry
 */
export function setLexiconGlyphOrder(lexiconId: number, glyphOrder: SpellingEntry[]): Lexicon | null {
    return updateLexicon(lexiconId, { glyph_order: glyphOrder, needs_attention: false });
}
