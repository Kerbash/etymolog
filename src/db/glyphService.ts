/**
 * Glyph Service
 *
 * CRUD operations for glyphs (atomic visual symbols) — the building blocks
 * graphemes are composed from.
 *
 * Deletion has three strengths, each of which preserves the "a grapheme has
 * ≥ 1 glyphs" and "a word's spelling points at real graphemes" invariants:
 *   - `deleteGlyph`        refuses when any grapheme uses the glyph
 *   - `forceDeleteGlyph`   unlinks it from graphemes, but refuses when that
 *                          would leave a grapheme empty
 *   - `cascadeDeleteGlyph` deletes the graphemes too, via `deleteGrapheme`,
 *                          so a grapheme still spelling a word blocks it
 */

import { getDatabase } from './database';
import { withTransaction } from './utils/transaction';
import { execRows, execOne, execScalar, lastInsertId, type SqlRecord } from './utils/sql';
import { sanitizeSvg, validateStringLength, LIMITS } from './utils/sanitize';
import { deleteGrapheme } from './graphemeService';
import type {
    Glyph,
    CreateGlyphInput,
    UpdateGlyphInput,
    GlyphWithUsage,
    GlyphReference,
} from './types';

const GLYPH_COLUMNS = 'id, name, svg_data, category, notes, created_at, updated_at';

function mapGlyph(rec: SqlRecord): Glyph {
    return {
        id: rec.id as number,
        name: rec.name as string,
        svg_data: rec.svg_data as string,
        category: (rec.category as string | null) ?? null,
        notes: (rec.notes as string | null) ?? null,
        created_at: rec.created_at as string,
        updated_at: rec.updated_at as string,
    };
}

// =============================================================================
// GLYPH CRUD OPERATIONS
// =============================================================================

/** Create a new glyph. */
export function createGlyph(input: CreateGlyphInput): Glyph {
    const db = getDatabase();

    validateStringLength(input.name, LIMITS.GLYPH_NAME, 'Glyph name');
    validateStringLength(input.svg_data, LIMITS.SVG_DATA, 'SVG data');
    if (input.category) validateStringLength(input.category, LIMITS.CATEGORY, 'Category');
    if (input.notes) validateStringLength(input.notes, LIMITS.NOTES, 'Notes');

    const sanitizedSvg = sanitizeSvg(input.svg_data);

    const glyphId = withTransaction(db, () => {
        db.run(
            `INSERT INTO glyphs (name, svg_data, category, notes) VALUES (?, ?, ?, ?)`,
            [input.name, sanitizedSvg, input.category ?? null, input.notes ?? null],
        );
        return lastInsertId(db);
    });

    const glyph = getGlyphById(glyphId);
    if (!glyph) {
        throw new Error('Failed to create glyph');
    }
    return glyph;
}

export function getGlyphById(id: number): Glyph | null {
    const rec = execOne(getDatabase(), `SELECT ${GLYPH_COLUMNS} FROM glyphs WHERE id = ?`, [id]);
    return rec ? mapGlyph(rec) : null;
}

/** All glyphs, newest first. */
export function getAllGlyphs(): Glyph[] {
    return execRows(getDatabase(), `SELECT ${GLYPH_COLUMNS} FROM glyphs ORDER BY created_at DESC`).map(mapGlyph);
}

/** All glyphs with the number of graphemes using each. */
export function getAllGlyphsWithUsage(): GlyphWithUsage[] {
    return execRows(getDatabase(), `
        SELECT g.id, g.name, g.svg_data, g.category, g.notes, g.created_at, g.updated_at,
               COUNT(gg.id) AS usage_count
        FROM glyphs g
        LEFT JOIN grapheme_glyphs gg ON g.id = gg.glyph_id
        GROUP BY g.id
        ORDER BY g.created_at DESC
    `).map(rec => ({ ...mapGlyph(rec), usageCount: rec.usage_count as number }));
}

/** Lightweight references for selection UI. */
export function getGlyphReferences(): GlyphReference[] {
    return execRows(getDatabase(), 'SELECT id, name, svg_data FROM glyphs ORDER BY name').map(rec => ({
        id: rec.id as number,
        name: rec.name as string,
        svg_data: rec.svg_data as string,
    }));
}

export function searchGlyphsByName(query: string): Glyph[] {
    return execRows(
        getDatabase(),
        `SELECT ${GLYPH_COLUMNS} FROM glyphs WHERE name LIKE ? ORDER BY name`,
        [`%${query}%`],
    ).map(mapGlyph);
}

export function updateGlyph(id: number, input: UpdateGlyphInput): Glyph | null {
    const db = getDatabase();

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.name !== undefined) {
        validateStringLength(input.name, LIMITS.GLYPH_NAME, 'Glyph name');
        updates.push('name = ?');
        values.push(input.name);
    }
    if (input.svg_data !== undefined) {
        validateStringLength(input.svg_data, LIMITS.SVG_DATA, 'SVG data');
        updates.push('svg_data = ?');
        values.push(sanitizeSvg(input.svg_data));
    }
    if (input.category !== undefined) {
        if (input.category) validateStringLength(input.category, LIMITS.CATEGORY, 'Category');
        updates.push('category = ?');
        values.push(input.category);
    }
    if (input.notes !== undefined) {
        if (input.notes) validateStringLength(input.notes, LIMITS.NOTES, 'Notes');
        updates.push('notes = ?');
        values.push(input.notes);
    }

    if (updates.length === 0) {
        return getGlyphById(id);
    }

    updates.push("updated_at = datetime('now')");
    withTransaction(db, () => {
        db.run(`UPDATE glyphs SET ${updates.join(', ')} WHERE id = ?`, [...values, id]);
    });
    return getGlyphById(id);
}

/** Names of graphemes that use a glyph. */
export function getGraphemesUsingGlyph(glyphId: number): { id: number; name: string; glyphCount: number }[] {
    return execRows(getDatabase(), `
        SELECT gr.id, gr.name,
               (SELECT COUNT(*) FROM grapheme_glyphs x WHERE x.grapheme_id = gr.id) AS glyph_count
        FROM graphemes gr
        WHERE gr.id IN (SELECT grapheme_id FROM grapheme_glyphs WHERE glyph_id = ?)
        ORDER BY gr.name
    `, [glyphId]).map(rec => ({ id: rec.id as number, name: rec.name as string, glyphCount: rec.glyph_count as number }));
}

/**
 * Delete a glyph.
 * @returns true if deleted, false if not found
 * @throws if any grapheme uses it
 */
export function deleteGlyph(id: number): boolean {
    const db = getDatabase();

    const usageCount = execScalar<number>(db, 'SELECT COUNT(*) FROM grapheme_glyphs WHERE glyph_id = ?', [id]) ?? 0;
    if (usageCount > 0) {
        throw new Error(`Cannot delete glyph: it is used by ${usageCount} grapheme(s)`);
    }

    return withTransaction(db, () => {
        db.run('DELETE FROM glyphs WHERE id = ?', [id]);
        return db.getRowsModified() > 0;
    });
}

/**
 * Delete a glyph and unlink it from every grapheme that uses it.
 * @throws if any grapheme would be left with no glyphs
 */
export function forceDeleteGlyph(id: number): boolean {
    const db = getDatabase();
    return withTransaction(db, () => {
        const wouldEmpty = getGraphemesUsingGlyph(id).filter(g => g.glyphCount <= 1);
        if (wouldEmpty.length > 0) {
            throw new Error(
                `Cannot remove glyph: it is the only glyph in ${wouldEmpty.map(g => `"${g.name}"`).join(', ')}. Delete or recompose those graphemes first.`,
            );
        }
        db.run('DELETE FROM grapheme_glyphs WHERE glyph_id = ?', [id]);
        db.run('DELETE FROM glyphs WHERE id = ?', [id]);
        return db.getRowsModified() > 0;
    });
}

/**
 * Delete a glyph AND every grapheme that uses it.
 * @throws if any of those graphemes still spells a word (the lexicon guard in
 *         `deleteGrapheme` applies; nothing is deleted)
 */
export function cascadeDeleteGlyph(id: number): boolean {
    const db = getDatabase();
    return withTransaction(db, () => {
        for (const grapheme of getGraphemesUsingGlyph(id)) {
            deleteGrapheme(grapheme.id);
        }
        db.run('DELETE FROM glyphs WHERE id = ?', [id]);
        return db.getRowsModified() > 0;
    });
}

export function getGlyphCount(): number {
    return execScalar<number>(getDatabase(), 'SELECT COUNT(*) FROM glyphs') ?? 0;
}

export function glyphNameExists(name: string, excludeId?: number): boolean {
    const db = getDatabase();
    const count = excludeId
        ? execScalar<number>(db, 'SELECT COUNT(*) FROM glyphs WHERE name = ? AND id != ?', [name, excludeId])
        : execScalar<number>(db, 'SELECT COUNT(*) FROM glyphs WHERE name = ?', [name]);
    return (count ?? 0) > 0;
}

/**
 * Delete glyphs no grapheme uses (the `autoManageGlyphs` setting).
 * @returns number deleted
 */
export function cleanupOrphanedGlyphs(): number {
    const db = getDatabase();
    return withTransaction(db, () => {
        db.run('DELETE FROM glyphs WHERE id NOT IN (SELECT glyph_id FROM grapheme_glyphs)');
        return db.getRowsModified();
    });
}
