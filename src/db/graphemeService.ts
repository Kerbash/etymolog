/**
 * Grapheme Service
 *
 * CRUD operations for managing graphemes (script characters) and their
 * associated phonemes (pronunciations) in the database.
 *
 * Terminology:
 * - Grapheme = visual symbol (UI: "logogram")
 * - Phoneme = pronunciation (UI: "pronunciation")
 */

import { getDatabase, persistDatabase } from './database';
import type {
    Grapheme,
    CreateGraphemeInput,
    UpdateGraphemeInput,
    Phoneme,
    CreatePhonemeInput,
    UpdatePhonemeInput,
    GraphemeWithPhonemes
} from './types';

// =============================================================================
// GRAPHEME CRUD OPERATIONS
// =============================================================================

/**
 * Create a new grapheme with optional phonemes.
 *
 * @param input - Grapheme data including optional phonemes array
 * @returns The created grapheme with all its phonemes
 *
 * @example
 * const grapheme = createGrapheme({
 *   name: 'A',
 *   svg_data: '<svg>...</svg>',
 *   notes: 'First letter',
 *   phonemes: [
 *     { phoneme: 'a', use_in_auto_spelling: true },
 *     { phoneme: 'æ', use_in_auto_spelling: false }
 *   ]
 * });
 */
export function createGrapheme(input: CreateGraphemeInput): GraphemeWithPhonemes {
    const db = getDatabase();

    // Insert the grapheme
    db.run(
        `INSERT INTO graphemes (name, svg_data, notes) VALUES (?, ?, ?)`,
        [input.name, input.svg_data, input.notes ?? null]
    );

    // Get the auto-generated ID
    const result = db.exec('SELECT last_insert_rowid() as id');
    const graphemeId = result[0].values[0][0] as number;

    // Create associated phonemes if provided
    const phonemes: Phoneme[] = [];
    if (input.phonemes && input.phonemes.length > 0) {
        for (const phonemeInput of input.phonemes) {
            const phoneme = addPhoneme(graphemeId, phonemeInput);
            phonemes.push(phoneme);
        }
    }

    // Persist changes
    persistDatabase();

    // Return complete grapheme with phonemes
    const grapheme = getGraphemeById(graphemeId);
    if (!grapheme) {
        throw new Error('Failed to create grapheme');
    }

    return { ...grapheme, phonemes };
}

/**
 * Get a grapheme by its ID.
 *
 * @param id - The grapheme ID
 * @returns The grapheme or null if not found
 */
export function getGraphemeById(id: number): Grapheme | null {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, name, svg_data, notes, created_at, updated_at 
         FROM graphemes WHERE id = ?`,
        [id]
    );

    if (result.length === 0 || result[0].values.length === 0) {
        return null;
    }

    const row = result[0].values[0];
    return {
        id: row[0] as number,
        name: row[1] as string,
        svg_data: row[2] as string,
        notes: row[3] as string | null,
        created_at: row[4] as string,
        updated_at: row[5] as string
    };
}

/**
 * Get a grapheme with all its phonemes.
 *
 * @param id - The grapheme ID
 * @returns The grapheme with phonemes or null if not found
 */
export function getGraphemeWithPhonemes(id: number): GraphemeWithPhonemes | null {
    const grapheme = getGraphemeById(id);
    if (!grapheme) return null;

    const phonemes = getPhonemesByGraphemeId(id);
    return { ...grapheme, phonemes };
}

/**
 * Get all graphemes ordered by creation date (newest first).
 *
 * @returns Array of all graphemes
 */
export function getAllGraphemes(): Grapheme[] {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, name, svg_data, notes, created_at, updated_at 
         FROM graphemes 
         ORDER BY created_at DESC`
    );

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => ({
        id: row[0] as number,
        name: row[1] as string,
        svg_data: row[2] as string,
        notes: row[3] as string | null,
        created_at: row[4] as string,
        updated_at: row[5] as string
    }));
}

/**
 * Get all graphemes with their phonemes.
 *
 * @returns Array of all graphemes with their phonemes
 */
export function getAllGraphemesWithPhonemes(): GraphemeWithPhonemes[] {
    const graphemes = getAllGraphemes();

    return graphemes.map(grapheme => ({
        ...grapheme,
        phonemes: getPhonemesByGraphemeId(grapheme.id)
    }));
}

/**
 * Search graphemes by name (case-insensitive partial match).
 *
 * @param query - Search string
 * @returns Matching graphemes
 */
export function searchGraphemesByName(query: string): Grapheme[] {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, name, svg_data, notes, created_at, updated_at 
         FROM graphemes 
         WHERE name LIKE ?
         ORDER BY name`,
        [`%${query}%`]
    );

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => ({
        id: row[0] as number,
        name: row[1] as string,
        svg_data: row[2] as string,
        notes: row[3] as string | null,
        created_at: row[4] as string,
        updated_at: row[5] as string
    }));
}

/**
 * Update an existing grapheme.
 * Only provided fields will be updated.
 *
 * @param id - The grapheme ID
 * @param input - Fields to update
 * @returns The updated grapheme or null if not found
 */
export function updateGrapheme(id: number, input: UpdateGraphemeInput): Grapheme | null {
    const db = getDatabase();

    // Build dynamic UPDATE query based on provided fields
    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (input.name !== undefined) {
        updates.push('name = ?');
        values.push(input.name);
    }

    if (input.svg_data !== undefined) {
        updates.push('svg_data = ?');
        values.push(input.svg_data);
    }

    if (input.notes !== undefined) {
        updates.push('notes = ?');
        values.push(input.notes);
    }

    // If no fields to update, just return current state
    if (updates.length === 0) {
        return getGraphemeById(id);
    }

    // Always update the updated_at timestamp
    updates.push("updated_at = datetime('now')");
    values.push(id.toString());

    db.run(
        `UPDATE graphemes SET ${updates.join(', ')} WHERE id = ?`,
        values
    );

    persistDatabase();
    return getGraphemeById(id);
}

/**
 * Delete a grapheme and all its associated phonemes.
 *
 * @param id - The grapheme ID
 * @returns true if deleted, false if not found
 */
export function deleteGrapheme(id: number): boolean {
    const db = getDatabase();

    // Delete phonemes first (in case CASCADE doesn't work in sql.js)
    db.run('DELETE FROM phonemes WHERE grapheme_id = ?', [id]);

    // Delete the grapheme
    db.run('DELETE FROM graphemes WHERE id = ?', [id]);

    const changes = db.getRowsModified();

    if (changes > 0) {
        persistDatabase();
        return true;
    }

    return false;
}

/**
 * Get the total count of graphemes.
 *
 * @returns Number of graphemes in the database
 */
export function getGraphemeCount(): number {
    const db = getDatabase();
    const result = db.exec('SELECT COUNT(*) FROM graphemes');
    return result[0]?.values[0]?.[0] as number ?? 0;
}

// =============================================================================
// PHONEME CRUD OPERATIONS
// =============================================================================

/**
 * Add a phoneme to a grapheme.
 *
 * @param graphemeId - The parent grapheme ID
 * @param input - Phoneme data
 * @returns The created phoneme
 */
export function addPhoneme(graphemeId: number, input: CreatePhonemeInput): Phoneme {
    const db = getDatabase();

    db.run(
        `INSERT INTO phonemes (grapheme_id, phoneme, use_in_auto_spelling, context) 
         VALUES (?, ?, ?, ?)`,
        [
            graphemeId,
            input.phoneme,
            input.use_in_auto_spelling ? 1 : 0,
            input.context ?? null
        ]
    );

    // Get the auto-generated ID
    const result = db.exec('SELECT last_insert_rowid() as id');
    const phonemeId = result[0].values[0][0] as number;

    persistDatabase();

    const phoneme = getPhonemeById(phonemeId);
    if (!phoneme) {
        throw new Error('Failed to create phoneme');
    }

    return phoneme;
}

/**
 * Get a phoneme by its ID.
 *
 * @param id - The phoneme ID
 * @returns The phoneme or null if not found
 */
export function getPhonemeById(id: number): Phoneme | null {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, grapheme_id, phoneme, use_in_auto_spelling, context 
         FROM phonemes WHERE id = ?`,
        [id]
    );

    if (result.length === 0 || result[0].values.length === 0) {
        return null;
    }

    const row = result[0].values[0];
    return {
        id: row[0] as number,
        grapheme_id: row[1] as number,
        phoneme: row[2] as string,
        use_in_auto_spelling: (row[3] as number) === 1,
        context: row[4] as string | null
    };
}

/**
 * Get all phonemes for a grapheme.
 *
 * @param graphemeId - The parent grapheme ID
 * @returns Array of phonemes for this grapheme
 */
export function getPhonemesByGraphemeId(graphemeId: number): Phoneme[] {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, grapheme_id, phoneme, use_in_auto_spelling, context 
         FROM phonemes 
         WHERE grapheme_id = ?
         ORDER BY id ASC`,
        [graphemeId]
    );

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => ({
        id: row[0] as number,
        grapheme_id: row[1] as number,
        phoneme: row[2] as string,
        use_in_auto_spelling: (row[3] as number) === 1,
        context: row[4] as string | null
    }));
}

/**
 * Update a phoneme.
 *
 * @param id - The phoneme ID
 * @param input - Fields to update
 * @returns The updated phoneme or null if not found
 */
export function updatePhoneme(id: number, input: UpdatePhonemeInput): Phoneme | null {
    const db = getDatabase();

    // Build dynamic UPDATE query
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.phoneme !== undefined) {
        updates.push('phoneme = ?');
        values.push(input.phoneme);
    }

    if (input.use_in_auto_spelling !== undefined) {
        updates.push('use_in_auto_spelling = ?');
        values.push(input.use_in_auto_spelling ? 1 : 0);
    }

    if (input.context !== undefined) {
        updates.push('context = ?');
        values.push(input.context);
    }

    if (updates.length === 0) {
        return getPhonemeById(id);
    }

    values.push(id);

    db.run(
        `UPDATE phonemes SET ${updates.join(', ')} WHERE id = ?`,
        values
    );

    persistDatabase();
    return getPhonemeById(id);
}

/**
 * Delete a phoneme.
 *
 * @param id - The phoneme ID
 * @returns true if deleted, false if not found
 */
export function deletePhoneme(id: number): boolean {
    const db = getDatabase();

    db.run('DELETE FROM phonemes WHERE id = ?', [id]);

    const changes = db.getRowsModified();

    if (changes > 0) {
        persistDatabase();
        return true;
    }

    return false;
}

/**
 * Delete all phonemes for a grapheme.
 *
 * @param graphemeId - The parent grapheme ID
 * @returns Number of phonemes deleted
 */
export function deleteAllPhonemesForGrapheme(graphemeId: number): number {
    const db = getDatabase();

    db.run('DELETE FROM phonemes WHERE grapheme_id = ?', [graphemeId]);

    const changes = db.getRowsModified();

    if (changes > 0) {
        persistDatabase();
    }

    return changes;
}

/**
 * Get all phonemes that are marked for auto-spelling.
 * Useful for building transliteration tables.
 *
 * @returns Array of phonemes with use_in_auto_spelling = true
 */
export function getAutoSpellingPhonemes(): Phoneme[] {
    const db = getDatabase();

    const result = db.exec(
        `SELECT p.id, p.grapheme_id, p.phoneme, p.use_in_auto_spelling, p.context 
         FROM phonemes p
         WHERE p.use_in_auto_spelling = 1
         ORDER BY p.grapheme_id, p.id`
    );

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => ({
        id: row[0] as number,
        grapheme_id: row[1] as number,
        phoneme: row[2] as string,
        use_in_auto_spelling: true,
        context: row[4] as string | null
    }));
}
