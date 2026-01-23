/**
 * Glyph Service
 *
 * CRUD operations for managing glyphs (atomic visual symbols).
 * Glyphs are the building blocks that can be composed into graphemes.
 */

import { getDatabase, persistDatabase } from './database';
import type {
    Glyph,
    CreateGlyphInput,
    UpdateGlyphInput,
    GlyphWithUsage,
    GlyphReference
} from './types';

// =============================================================================
// GLYPH CRUD OPERATIONS
// =============================================================================

/**
 * Create a new glyph.
 *
 * @param input - Glyph data (name, svg_data, category, notes)
 * @returns The created glyph
 */
export function createGlyph(input: CreateGlyphInput): Glyph {
    const db = getDatabase();

    db.run(
        `INSERT INTO glyphs (name, svg_data, category, notes) VALUES (?, ?, ?, ?)`,
        [input.name, input.svg_data, input.category ?? null, input.notes ?? null]
    );

    const result = db.exec('SELECT last_insert_rowid() as id');
    const glyphId = result[0].values[0][0] as number;

    persistDatabase();

    const glyph = getGlyphById(glyphId);
    if (!glyph) {
        throw new Error('Failed to create glyph');
    }

    return glyph;
}

/**
 * Get a glyph by ID.
 */
export function getGlyphById(id: number): Glyph | null {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, name, svg_data, category, notes, created_at, updated_at 
         FROM glyphs WHERE id = ?`,
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
        category: row[3] as string | null,
        notes: row[4] as string | null,
        created_at: row[5] as string,
        updated_at: row[6] as string
    };
}

/**
 * Get all glyphs ordered by creation date (newest first).
 */
export function getAllGlyphs(): Glyph[] {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, name, svg_data, category, notes, created_at, updated_at 
         FROM glyphs 
         ORDER BY created_at DESC`
    );

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
 * Get all glyphs with their usage count (how many graphemes use each).
 */
export function getAllGlyphsWithUsage(): GlyphWithUsage[] {
    const db = getDatabase();

    const result = db.exec(`
        SELECT g.id, g.name, g.svg_data, g.category, g.notes, g.created_at, g.updated_at,
               COUNT(gg.id) as usage_count
        FROM glyphs g
        LEFT JOIN grapheme_glyphs gg ON g.id = gg.glyph_id
        GROUP BY g.id
        ORDER BY g.created_at DESC
    `);

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
        updated_at: row[6] as string,
        usageCount: row[7] as number
    }));
}

/**
 * Get lightweight glyph references for selection UI.
 */
export function getGlyphReferences(): GlyphReference[] {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, name, svg_data FROM glyphs ORDER BY name`
    );

    if (result.length === 0) {
        return [];
    }

    return result[0].values.map((row: unknown[]) => ({
        id: row[0] as number,
        name: row[1] as string,
        svg_data: row[2] as string
    }));
}

/**
 * Search glyphs by name (case-insensitive partial match).
 */
export function searchGlyphsByName(query: string): Glyph[] {
    const db = getDatabase();

    const result = db.exec(
        `SELECT id, name, svg_data, category, notes, created_at, updated_at 
         FROM glyphs 
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
        category: row[3] as string | null,
        notes: row[4] as string | null,
        created_at: row[5] as string,
        updated_at: row[6] as string
    }));
}

/**
 * Update a glyph.
 */
export function updateGlyph(id: number, input: UpdateGlyphInput): Glyph | null {
    const db = getDatabase();

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

    if (input.category !== undefined) {
        updates.push('category = ?');
        values.push(input.category);
    }

    if (input.notes !== undefined) {
        updates.push('notes = ?');
        values.push(input.notes);
    }

    if (updates.length === 0) {
        return getGlyphById(id);
    }

    updates.push("updated_at = datetime('now')");
    values.push(id.toString());

    db.run(
        `UPDATE glyphs SET ${updates.join(', ')} WHERE id = ?`,
        values
    );

    persistDatabase();
    return getGlyphById(id);
}

/**
 * Delete a glyph.
 * Will fail if the glyph is used by any graphemes (foreign key constraint).
 *
 * @returns true if deleted, false if not found
 * @throws Error if glyph is in use
 */
export function deleteGlyph(id: number): boolean {
    const db = getDatabase();

    // Check if glyph is in use
    const usageResult = db.exec(
        `SELECT COUNT(*) FROM grapheme_glyphs WHERE glyph_id = ?`,
        [id]
    );
    const usageCount = usageResult[0]?.values[0]?.[0] as number ?? 0;

    if (usageCount > 0) {
        throw new Error(`Cannot delete glyph: it is used by ${usageCount} grapheme(s)`);
    }

    db.run('DELETE FROM glyphs WHERE id = ?', [id]);

    const changes = db.getRowsModified();

    if (changes > 0) {
        persistDatabase();
        return true;
    }

    return false;
}

/**
 * Force delete a glyph and remove it from all graphemes.
 * Use with caution - this will affect existing graphemes.
 */
export function forceDeleteGlyph(id: number): boolean {
    const db = getDatabase();

    // Remove from all grapheme associations first
    db.run('DELETE FROM grapheme_glyphs WHERE glyph_id = ?', [id]);

    // Then delete the glyph
    db.run('DELETE FROM glyphs WHERE id = ?', [id]);

    const changes = db.getRowsModified();

    if (changes > 0) {
        persistDatabase();
        return true;
    }

    return false;
}

/**
 * Cascade delete a glyph and all graphemes that reference it.
 * Use with caution - this will delete graphemes permanently.
 *
 * @returns true if deleted, false if glyph not found
 */
export function cascadeDeleteGlyph(id: number): boolean {
    const db = getDatabase();

    // Get all grapheme IDs that reference this glyph
    const result = db.exec(
        `SELECT DISTINCT grapheme_id FROM grapheme_glyphs WHERE glyph_id = ?`,
        [id]
    );

    const graphemeIds: number[] = result.length > 0
        ? result[0].values.map((row: unknown[]) => row[0] as number)
        : [];

    // Delete each grapheme (this handles phonemes and grapheme_glyphs cascade)
    for (const graphemeId of graphemeIds) {
        db.run('DELETE FROM phonemes WHERE grapheme_id = ?', [graphemeId]);
        db.run('DELETE FROM grapheme_glyphs WHERE grapheme_id = ?', [graphemeId]);
        db.run('DELETE FROM graphemes WHERE id = ?', [graphemeId]);
    }

    // Delete the glyph itself
    db.run('DELETE FROM glyphs WHERE id = ?', [id]);

    const changes = db.getRowsModified();

    if (changes > 0) {
        persistDatabase();
        return true;
    }

    return false;
}

/**
 * Get total count of glyphs.
 */
export function getGlyphCount(): number {
    const db = getDatabase();
    const result = db.exec('SELECT COUNT(*) FROM glyphs');
    return result[0]?.values[0]?.[0] as number ?? 0;
}

/**
 * Check if a glyph with the given name already exists.
 */
export function glyphNameExists(name: string, excludeId?: number): boolean {
    const db = getDatabase();

    const query = excludeId
        ? `SELECT COUNT(*) FROM glyphs WHERE name = ? AND id != ?`
        : `SELECT COUNT(*) FROM glyphs WHERE name = ?`;

    const params = excludeId ? [name, excludeId] : [name];
    const result = db.exec(query, params);

    return (result[0]?.values[0]?.[0] as number ?? 0) > 0;
}
