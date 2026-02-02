/**
 * Grapheme Service
 *
 * CRUD operations for managing graphemes and their relationships to glyphs and phonemes.
 *
 * Architecture:
 * - Grapheme: A composition of one or more glyphs
 * - GraphemeGlyph: Junction table linking glyphs to graphemes with position
 * - Phoneme: Pronunciation associated with a grapheme
 */

import { getDatabase, persistDatabase } from './database';
import type {
    Grapheme,
    CreateGraphemeInput,
    UpdateGraphemeInput,
    Phoneme,
    CreatePhonemeInput,
    UpdatePhonemeInput,
    GraphemeWithGlyphs,
    GraphemeWithPhonemes,
    GraphemeComplete,
    Glyph,
    GraphemeGlyph,
    CreateGraphemeGlyphInput
} from './types';

// =============================================================================
// GRAPHEME CRUD OPERATIONS
// =============================================================================

/**
 * Create a new grapheme with its glyph composition and optional phonemes.
 *
 * @param input - Grapheme data including glyphs array and optional phonemes
 * @returns The created grapheme with all its data
 */
export function createGrapheme(input: CreateGraphemeInput): GraphemeComplete {
    const db = getDatabase();

    // Validate at least one glyph is provided
    if (!input.glyphs || input.glyphs.length === 0) {
        throw new Error('At least one glyph is required to create a grapheme');
    }

    // Insert the grapheme
    db.run(
        `INSERT INTO graphemes (name, category, notes) VALUES (?, ?, ?)`,
        [input.name, input.category ?? null, input.notes ?? null]
    );

    const result = db.exec('SELECT last_insert_rowid() as id');
    const graphemeId = result[0].values[0][0] as number;

    // Link glyphs to grapheme
    for (const glyphInput of input.glyphs) {
        addGlyphToGrapheme(graphemeId, glyphInput);
    }

    // Create phonemes if provided
    const phonemes: Phoneme[] = [];
    if (input.phonemes && input.phonemes.length > 0) {
        for (const phonemeInput of input.phonemes) {
            const phoneme = addPhoneme(graphemeId, phonemeInput);
            phonemes.push(phoneme);
        }
    }

    persistDatabase();

    const grapheme = getGraphemeById(graphemeId);
    if (!grapheme) {
        throw new Error('Failed to create grapheme');
    }

    const glyphs = getGlyphsByGraphemeId(graphemeId);

    return { ...grapheme, glyphs, phonemes };
}

/**
 * Get a grapheme by ID (without glyphs or phonemes).
 */
export function getGraphemeById(id: number): Grapheme | null {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, name, category, notes, created_at, updated_at 
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
        category: row[2] as string | null,
        notes: row[3] as string | null,
        created_at: row[4] as string,
        updated_at: row[5] as string
    };
}

/**
 * Get a grapheme with its ordered glyphs.
 */
export function getGraphemeWithGlyphs(id: number): GraphemeWithGlyphs | null {
    const grapheme = getGraphemeById(id);
    if (!grapheme) return null;

    const glyphs = getGlyphsByGraphemeId(id);
    return { ...grapheme, glyphs };
}

/**
 * Get a grapheme with its phonemes.
 */
export function getGraphemeWithPhonemes(id: number): GraphemeWithPhonemes | null {
    const grapheme = getGraphemeById(id);
    if (!grapheme) return null;

    const phonemes = getPhonemesByGraphemeId(id);
    return { ...grapheme, phonemes };
}

/**
 * Get a grapheme with both glyphs and phonemes.
 */
export function getGraphemeComplete(id: number): GraphemeComplete | null {
    const grapheme = getGraphemeById(id);
    if (!grapheme) return null;

    const glyphs = getGlyphsByGraphemeId(id);
    const phonemes = getPhonemesByGraphemeId(id);
    return { ...grapheme, glyphs, phonemes };
}

/**
 * Get all graphemes (without related data).
 */
export function getAllGraphemes(): Grapheme[] {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, name, category, notes, created_at, updated_at 
         FROM graphemes 
         ORDER BY created_at DESC`
    );

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => ({
        id: row[0] as number,
        name: row[1] as string,
        category: row[2] as string | null,
        notes: row[3] as string | null,
        created_at: row[4] as string,
        updated_at: row[5] as string
    }));
}

/**
 * Get all graphemes with their glyphs.
 */
export function getAllGraphemesWithGlyphs(): GraphemeWithGlyphs[] {
    const graphemes = getAllGraphemes();

    return graphemes.map(grapheme => ({
        ...grapheme,
        glyphs: getGlyphsByGraphemeId(grapheme.id)
    }));
}

/**
 * Get all graphemes with their phonemes.
 */
export function getAllGraphemesWithPhonemes(): GraphemeWithPhonemes[] {
    const graphemes = getAllGraphemes();

    return graphemes.map(grapheme => ({
        ...grapheme,
        phonemes: getPhonemesByGraphemeId(grapheme.id)
    }));
}

/**
 * Get all graphemes with full data (glyphs and phonemes).
 */
export function getAllGraphemesComplete(): GraphemeComplete[] {
    const graphemes = getAllGraphemes();

    return graphemes.map(grapheme => ({
        ...grapheme,
        glyphs: getGlyphsByGraphemeId(grapheme.id),
        phonemes: getPhonemesByGraphemeId(grapheme.id)
    }));
}

/**
 * Search graphemes by name.
 */
export function searchGraphemesByName(query: string): Grapheme[] {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, name, category, notes, created_at, updated_at 
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
        category: row[2] as string | null,
        notes: row[3] as string | null,
        created_at: row[4] as string,
        updated_at: row[5] as string
    }));
}

/**
 * Update a grapheme's basic info (not glyph composition).
 */
export function updateGrapheme(id: number, input: UpdateGraphemeInput): Grapheme | null {
    const db = getDatabase();

    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (input.name !== undefined) {
        updates.push('name = ?');
        values.push(input.name);
    }

    if (input.category !== undefined) {
        updates.push('category = ?');
        values.push(input.category);
    }

    if (input.notes !== undefined) {
        updates.push('notes = ?');
        values.push(input.notes);
    }

    if (updates.length === 0) {
        return getGraphemeById(id);
    }

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
 * Delete a grapheme and all its associations.
 */
export function deleteGrapheme(id: number): boolean {
    const db = getDatabase();

    // Check if used in lexicon
    const lexiconUsage = db.exec('SELECT COUNT(*) FROM lexicon_spelling WHERE grapheme_id = ?', [id]);
    const count = lexiconUsage[0]?.values[0]?.[0] as number ?? 0;

    if (count > 0) {
        throw new Error(`Cannot delete grapheme: it is used in ${count} lexicon entries. Constraint failed.`);
    }

    // Phonemes and grapheme_glyphs will cascade delete
    db.run('DELETE FROM phonemes WHERE grapheme_id = ?', [id]);
    db.run('DELETE FROM grapheme_glyphs WHERE grapheme_id = ?', [id]);
    db.run('DELETE FROM graphemes WHERE id = ?', [id]);

    const changes = db.getRowsModified();

    if (changes > 0) {
        persistDatabase();
        return true;
    }

    return false;
}

/**
 * Get grapheme count.
 */
export function getGraphemeCount(): number {
    const db = getDatabase();
    const result = db.exec('SELECT COUNT(*) FROM graphemes');
    return result[0]?.values[0]?.[0] as number ?? 0;
}

// =============================================================================
// GRAPHEME-GLYPH RELATIONSHIP OPERATIONS
// =============================================================================

/**
 * Get glyphs for a grapheme, ordered by position.
 */
export function getGlyphsByGraphemeId(graphemeId: number): Glyph[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT g.id, g.name, g.svg_data, g.category, g.notes, g.created_at, g.updated_at
        FROM glyphs g
        JOIN grapheme_glyphs gg ON g.id = gg.glyph_id
        WHERE gg.grapheme_id = ?
        ORDER BY gg.position ASC
    `, [graphemeId]);

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => ({
        id: row[0] as number,
        name: row[1] as string,
        svg_data: row[2] as string,
        category: row[3] as string | null,
        notes: row[4] as string | null,
        created_at: row[5] as string,
        updated_at: row[6] as string
    }));
}

/**
 * Get the junction table entries for a grapheme.
 */
export function getGraphemeGlyphEntries(graphemeId: number): GraphemeGlyph[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT id, grapheme_id, glyph_id, position, transform
        FROM grapheme_glyphs
        WHERE grapheme_id = ?
        ORDER BY position ASC
    `, [graphemeId]);

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => ({
        id: row[0] as number,
        grapheme_id: row[1] as number,
        glyph_id: row[2] as number,
        position: row[3] as number,
        transform: row[4] as string | null
    }));
}

/**
 * Add a glyph to a grapheme at a specific position.
 */
export function addGlyphToGrapheme(graphemeId: number, input: CreateGraphemeGlyphInput): GraphemeGlyph {
    const db = getDatabase();

    db.run(`
        INSERT INTO grapheme_glyphs (grapheme_id, glyph_id, position, transform)
        VALUES (?, ?, ?, ?)
    `, [graphemeId, input.glyph_id, input.position, input.transform ?? null]);

    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result[0].values[0][0] as number;

    // Update grapheme's updated_at
    db.run(`UPDATE graphemes SET updated_at = datetime('now') WHERE id = ?`, [graphemeId]);

    persistDatabase();

    return {
        id,
        grapheme_id: graphemeId,
        glyph_id: input.glyph_id,
        position: input.position,
        transform: input.transform ?? null
    };
}

/**
 * Remove a glyph from a grapheme.
 */
export function removeGlyphFromGrapheme(graphemeId: number, glyphId: number): boolean {
    const db = getDatabase();

    db.run(`
        DELETE FROM grapheme_glyphs 
        WHERE grapheme_id = ? AND glyph_id = ?
    `, [graphemeId, glyphId]);

    const changes = db.getRowsModified();

    if (changes > 0) {
        db.run(`UPDATE graphemes SET updated_at = datetime('now') WHERE id = ?`, [graphemeId]);
        persistDatabase();
        return true;
    }

    return false;
}

/**
 * Replace all glyphs for a grapheme with a new ordered list.
 */
export function setGraphemeGlyphs(graphemeId: number, glyphs: CreateGraphemeGlyphInput[]): void {
    const db = getDatabase();

    // Remove all existing glyph links
    db.run('DELETE FROM grapheme_glyphs WHERE grapheme_id = ?', [graphemeId]);

    // Add new glyphs
    for (const glyphInput of glyphs) {
        db.run(`
            INSERT INTO grapheme_glyphs (grapheme_id, glyph_id, position, transform)
            VALUES (?, ?, ?, ?)
        `, [graphemeId, glyphInput.glyph_id, glyphInput.position, glyphInput.transform ?? null]);
    }

    // Update grapheme's updated_at
    db.run(`UPDATE graphemes SET updated_at = datetime('now') WHERE id = ?`, [graphemeId]);

    persistDatabase();
}

/**
 * Reorder glyphs within a grapheme.
 */
export function reorderGraphemeGlyphs(graphemeId: number, glyphIds: number[]): void {
    const db = getDatabase();

    // Update positions based on array order
    glyphIds.forEach((glyphId, index) => {
        db.run(`
            UPDATE grapheme_glyphs 
            SET position = ?
            WHERE grapheme_id = ? AND glyph_id = ?
        `, [index, graphemeId, glyphId]);
    });

    db.run(`UPDATE graphemes SET updated_at = datetime('now') WHERE id = ?`, [graphemeId]);

    persistDatabase();
}

// =============================================================================
// PHONEME CRUD OPERATIONS
// =============================================================================

/**
 * Add a phoneme to a grapheme.
 */
export function addPhoneme(graphemeId: number, input: CreatePhonemeInput): Phoneme {
    const db = getDatabase();

    db.run(`
        INSERT INTO phonemes (grapheme_id, phoneme, use_in_auto_spelling, context) 
        VALUES (?, ?, ?, ?)
    `, [
        graphemeId,
        input.phoneme,
        input.use_in_auto_spelling ? 1 : 0,
        input.context ?? null
    ]);

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
 * Get a phoneme by ID.
 */
export function getPhonemeById(id: number): Phoneme | null {
    const db = getDatabase();

    const result = db.exec(`
        SELECT id, grapheme_id, phoneme, use_in_auto_spelling, context 
        FROM phonemes WHERE id = ?
    `, [id]);

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
 */
export function getPhonemesByGraphemeId(graphemeId: number): Phoneme[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT id, grapheme_id, phoneme, use_in_auto_spelling, context 
        FROM phonemes 
        WHERE grapheme_id = ?
        ORDER BY id ASC
    `, [graphemeId]);

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
 */
export function updatePhoneme(id: number, input: UpdatePhonemeInput): Phoneme | null {
    const db = getDatabase();

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

    db.run(`UPDATE phonemes SET ${updates.join(', ')} WHERE id = ?`, values);

    persistDatabase();
    return getPhonemeById(id);
}

/**
 * Delete a phoneme.
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
 * Get all phonemes marked for auto-spelling.
 */
export function getAutoSpellingPhonemes(): Phoneme[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT id, grapheme_id, phoneme, use_in_auto_spelling, context
        FROM phonemes
        WHERE use_in_auto_spelling = 1
        ORDER BY grapheme_id, id
    `);

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

// =============================================================================
// PHONEME LOOKUP OPERATIONS (for IPA Chart)
// =============================================================================

/**
 * Find a grapheme by its associated phoneme.
 * Returns the first grapheme that has a phoneme matching the given IPA character.
 *
 * @param phoneme - The IPA character to search for
 * @returns The complete grapheme with glyphs and phonemes, or null if not found
 */
export function getGraphemeByPhoneme(phoneme: string): GraphemeComplete | null {
    const db = getDatabase();

    // Find the first phoneme entry matching the given phoneme
    const result = db.exec(`
        SELECT grapheme_id FROM phonemes WHERE phoneme = ? LIMIT 1
    `, [phoneme]);

    if (result.length === 0 || result[0].values.length === 0) {
        return null;
    }

    const graphemeId = result[0].values[0][0] as number;
    return getGraphemeComplete(graphemeId);
}

/**
 * Get a mapping of all phonemes to their associated graphemes.
 * Returns a Map where keys are phoneme strings and values are GraphemeComplete objects.
 *
 * This is useful for bulk lookups when rendering the IPA chart.
 *
 * @returns Map from phoneme string to GraphemeComplete
 */
export function getAllPhonemeGraphemeMappings(): Map<string, GraphemeComplete> {
    const db = getDatabase();
    const mappings = new Map<string, GraphemeComplete>();

    // Get all phonemes with their grapheme IDs
    const phonemeResult = db.exec(`
        SELECT DISTINCT phoneme, grapheme_id FROM phonemes ORDER BY grapheme_id, id
    `);

    if (phonemeResult.length === 0) {
        return mappings;
    }

    // Build a map of grapheme_id -> phonemes to batch load graphemes
    const graphemeIds = new Set<number>();
    const phonemeToGraphemeId = new Map<string, number>();

    for (const row of phonemeResult[0].values) {
        const phoneme = row[0] as string;
        const graphemeId = row[1] as number;

        // Only store the first grapheme for each phoneme
        if (!phonemeToGraphemeId.has(phoneme)) {
            phonemeToGraphemeId.set(phoneme, graphemeId);
            graphemeIds.add(graphemeId);
        }
    }

    // Batch load all needed graphemes
    const graphemeCache = new Map<number, GraphemeComplete>();
    for (const graphemeId of graphemeIds) {
        const grapheme = getGraphemeComplete(graphemeId);
        if (grapheme) {
            graphemeCache.set(graphemeId, grapheme);
        }
    }

    // Build the final mapping
    for (const [phoneme, graphemeId] of phonemeToGraphemeId) {
        const grapheme = graphemeCache.get(graphemeId);
        if (grapheme) {
            mappings.set(phoneme, grapheme);
        }
    }

    return mappings;
}

