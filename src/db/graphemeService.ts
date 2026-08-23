/**
 * Grapheme Service
 *
 * CRUD operations for graphemes, their glyph composition and their phonemes.
 *
 * - Grapheme: a written character composed of ≥ 1 glyphs (the invariant every
 *   writer here preserves — `createGrapheme`, `setGraphemeGlyphs` and
 *   `removeGlyphFromGrapheme` refuse to leave a grapheme empty).
 * - GraphemeGlyph: junction rows with `position` ordering.
 * - Phoneme: a pronunciation attached to a grapheme.
 *
 * Every multi-statement write runs in `withTransaction()`; inner helpers
 * (`addGlyphToGrapheme`, `addPhoneme`) open their own transaction so they
 * compose as savepoints when called from `createGrapheme` and still persist
 * when called standalone.
 */

import { getDatabase } from './database';
import { withTransaction } from './utils/transaction';
import { execRows, execOne, execScalar, lastInsertId, type SqlRecord } from './utils/sql';
import { validateStringLength, LIMITS } from './utils/sanitize';
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
    CreateGraphemeGlyphInput,
} from './types';

// =============================================================================
// ROW MAPPING
// =============================================================================

const GRAPHEME_COLUMNS = 'id, name, category, notes, created_at, updated_at';
const PHONEME_COLUMNS = 'id, grapheme_id, phoneme, use_in_auto_spelling, context';

function mapGrapheme(rec: SqlRecord): Grapheme {
    return {
        id: rec.id as number,
        name: rec.name as string,
        category: (rec.category as string | null) ?? null,
        notes: (rec.notes as string | null) ?? null,
        created_at: rec.created_at as string,
        updated_at: rec.updated_at as string,
    };
}

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

function mapPhoneme(rec: SqlRecord): Phoneme {
    return {
        id: rec.id as number,
        grapheme_id: rec.grapheme_id as number,
        phoneme: rec.phoneme as string,
        use_in_auto_spelling: rec.use_in_auto_spelling === 1,
        context: (rec.context as string | null) ?? null,
    };
}

function touchGrapheme(graphemeId: number): void {
    getDatabase().run(`UPDATE graphemes SET updated_at = datetime('now') WHERE id = ?`, [graphemeId]);
}

// =============================================================================
// GRAPHEME CRUD OPERATIONS
// =============================================================================

/**
 * Create a new grapheme with its glyph composition and optional phonemes.
 */
export function createGrapheme(input: CreateGraphemeInput): GraphemeComplete {
    const db = getDatabase();

    if (!input.glyphs || input.glyphs.length === 0) {
        throw new Error('At least one glyph is required to create a grapheme');
    }
    validateStringLength(input.name, LIMITS.GRAPHEME_NAME, 'Grapheme name');
    if (input.category) validateStringLength(input.category, LIMITS.CATEGORY, 'Category');
    if (input.notes) validateStringLength(input.notes, LIMITS.NOTES, 'Notes');

    const graphemeId = withTransaction(db, () => {
        db.run(
            `INSERT INTO graphemes (name, category, notes) VALUES (?, ?, ?)`,
            [input.name, input.category ?? null, input.notes ?? null],
        );
        const id = lastInsertId(db);
        for (const glyphInput of input.glyphs) {
            addGlyphToGrapheme(id, glyphInput);
        }
        for (const phonemeInput of input.phonemes ?? []) {
            addPhoneme(id, phonemeInput);
        }
        return id;
    });

    const grapheme = getGraphemeComplete(graphemeId);
    if (!grapheme) {
        throw new Error('Failed to create grapheme');
    }
    return grapheme;
}

/** Get a grapheme by ID (without glyphs or phonemes). */
export function getGraphemeById(id: number): Grapheme | null {
    const rec = execOne(getDatabase(), `SELECT ${GRAPHEME_COLUMNS} FROM graphemes WHERE id = ?`, [id]);
    return rec ? mapGrapheme(rec) : null;
}

export function getGraphemeWithGlyphs(id: number): GraphemeWithGlyphs | null {
    const grapheme = getGraphemeById(id);
    if (!grapheme) return null;
    return { ...grapheme, glyphs: getGlyphsByGraphemeId(id) };
}

export function getGraphemeWithPhonemes(id: number): GraphemeWithPhonemes | null {
    const grapheme = getGraphemeById(id);
    if (!grapheme) return null;
    return { ...grapheme, phonemes: getPhonemesByGraphemeId(id) };
}

export function getGraphemeComplete(id: number): GraphemeComplete | null {
    const grapheme = getGraphemeById(id);
    if (!grapheme) return null;
    return { ...grapheme, glyphs: getGlyphsByGraphemeId(id), phonemes: getPhonemesByGraphemeId(id) };
}

/** All graphemes, newest first. */
export function getAllGraphemes(): Grapheme[] {
    return execRows(getDatabase(), `SELECT ${GRAPHEME_COLUMNS} FROM graphemes ORDER BY created_at DESC`).map(mapGrapheme);
}

export function getAllGraphemesWithGlyphs(): GraphemeWithGlyphs[] {
    const glyphsOf = loadGlyphsByGrapheme();
    return getAllGraphemes().map(grapheme => ({ ...grapheme, glyphs: glyphsOf.get(grapheme.id) ?? [] }));
}

export function getAllGraphemesWithPhonemes(): GraphemeWithPhonemes[] {
    const phonemesOf = loadPhonemesByGrapheme();
    return getAllGraphemes().map(grapheme => ({ ...grapheme, phonemes: phonemesOf.get(grapheme.id) ?? [] }));
}

/**
 * All graphemes with glyphs and phonemes — THREE statements regardless of
 * grapheme count.
 */
export function getAllGraphemesComplete(): GraphemeComplete[] {
    const glyphsOf = loadGlyphsByGrapheme();
    const phonemesOf = loadPhonemesByGrapheme();
    return getAllGraphemes().map(grapheme => ({
        ...grapheme,
        glyphs: glyphsOf.get(grapheme.id) ?? [],
        phonemes: phonemesOf.get(grapheme.id) ?? [],
    }));
}

/** grapheme id → ordered glyphs, one statement. */
function loadGlyphsByGrapheme(): Map<number, Glyph[]> {
    const out = new Map<number, Glyph[]>();
    for (const rec of execRows(getDatabase(), `
        SELECT gg.grapheme_id, g.id, g.name, g.svg_data, g.category, g.notes, g.created_at, g.updated_at
        FROM grapheme_glyphs gg
        JOIN glyphs g ON g.id = gg.glyph_id
        ORDER BY gg.grapheme_id, gg.position ASC
    `)) {
        const graphemeId = rec.grapheme_id as number;
        if (!out.has(graphemeId)) out.set(graphemeId, []);
        out.get(graphemeId)!.push(mapGlyph(rec));
    }
    return out;
}

/** grapheme id → phonemes, one statement. */
function loadPhonemesByGrapheme(): Map<number, Phoneme[]> {
    const out = new Map<number, Phoneme[]>();
    for (const rec of execRows(getDatabase(), `SELECT ${PHONEME_COLUMNS} FROM phonemes ORDER BY grapheme_id, id ASC`)) {
        const p = mapPhoneme(rec);
        if (!out.has(p.grapheme_id)) out.set(p.grapheme_id, []);
        out.get(p.grapheme_id)!.push(p);
    }
    return out;
}

export function searchGraphemesByName(query: string): Grapheme[] {
    return execRows(
        getDatabase(),
        `SELECT ${GRAPHEME_COLUMNS} FROM graphemes WHERE name LIKE ? ORDER BY name`,
        [`%${query}%`],
    ).map(mapGrapheme);
}

/** Update a grapheme's basic info (not its glyph composition). */
export function updateGrapheme(id: number, input: UpdateGraphemeInput): Grapheme | null {
    const db = getDatabase();

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.name !== undefined) {
        validateStringLength(input.name, LIMITS.GRAPHEME_NAME, 'Grapheme name');
        updates.push('name = ?');
        values.push(input.name);
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
        return getGraphemeById(id);
    }

    updates.push("updated_at = datetime('now')");
    withTransaction(db, () => {
        db.run(`UPDATE graphemes SET ${updates.join(', ')} WHERE id = ?`, [...values, id]);
    });
    return getGraphemeById(id);
}

/** Number of words whose spelling uses this grapheme. */
export function getGraphemeLexiconUsageCount(id: number): number {
    return execScalar<number>(getDatabase(), 'SELECT COUNT(DISTINCT lexicon_id) FROM lexicon_spelling WHERE grapheme_id = ?', [id]) ?? 0;
}

/**
 * Delete a grapheme and its glyph links and phonemes.
 *
 * @throws if any word still spells with it — callers that want to proceed
 *         must respell first (`graphemeApi.delete(id, { respellLexicon: true })`).
 */
export function deleteGrapheme(id: number): boolean {
    const db = getDatabase();

    const usage = getGraphemeLexiconUsageCount(id);
    if (usage > 0) {
        throw new Error(`Cannot delete grapheme: it is used in ${usage} lexicon entries. Constraint failed.`);
    }

    return withTransaction(db, () => {
        db.run('DELETE FROM phonemes WHERE grapheme_id = ?', [id]);
        db.run('DELETE FROM grapheme_glyphs WHERE grapheme_id = ?', [id]);
        db.run('DELETE FROM graphemes WHERE id = ?', [id]);
        return db.getRowsModified() > 0;
    });
}

export function getGraphemeCount(): number {
    return execScalar<number>(getDatabase(), 'SELECT COUNT(*) FROM graphemes') ?? 0;
}

// =============================================================================
// GRAPHEME-GLYPH RELATIONSHIP OPERATIONS
// =============================================================================

/** Glyphs for a grapheme, ordered by position. */
export function getGlyphsByGraphemeId(graphemeId: number): Glyph[] {
    return execRows(getDatabase(), `
        SELECT g.id, g.name, g.svg_data, g.category, g.notes, g.created_at, g.updated_at
        FROM glyphs g
        JOIN grapheme_glyphs gg ON g.id = gg.glyph_id
        WHERE gg.grapheme_id = ?
        ORDER BY gg.position ASC
    `, [graphemeId]).map(mapGlyph);
}

/** Junction rows for a grapheme. */
export function getGraphemeGlyphEntries(graphemeId: number): GraphemeGlyph[] {
    return execRows(getDatabase(), `
        SELECT id, grapheme_id, glyph_id, position, transform
        FROM grapheme_glyphs WHERE grapheme_id = ? ORDER BY position ASC
    `, [graphemeId]).map(rec => ({
        id: rec.id as number,
        grapheme_id: rec.grapheme_id as number,
        glyph_id: rec.glyph_id as number,
        position: rec.position as number,
        transform: (rec.transform as string | null) ?? null,
    }));
}

/** Add a glyph to a grapheme at a specific position. */
export function addGlyphToGrapheme(graphemeId: number, input: CreateGraphemeGlyphInput): GraphemeGlyph {
    const db = getDatabase();
    return withTransaction(db, () => {
        db.run(
            `INSERT INTO grapheme_glyphs (grapheme_id, glyph_id, position, transform) VALUES (?, ?, ?, ?)`,
            [graphemeId, input.glyph_id, input.position, input.transform ?? null],
        );
        const id = lastInsertId(db);
        touchGrapheme(graphemeId);
        return { id, grapheme_id: graphemeId, glyph_id: input.glyph_id, position: input.position, transform: input.transform ?? null };
    });
}

/**
 * Remove a glyph from a grapheme.
 * @throws if it is the grapheme's last glyph
 */
export function removeGlyphFromGrapheme(graphemeId: number, glyphId: number): boolean {
    const db = getDatabase();
    return withTransaction(db, () => {
        const total = execScalar<number>(db, 'SELECT COUNT(*) FROM grapheme_glyphs WHERE grapheme_id = ?', [graphemeId]) ?? 0;
        const present = execScalar<number>(db, 'SELECT COUNT(*) FROM grapheme_glyphs WHERE grapheme_id = ? AND glyph_id = ?', [graphemeId, glyphId]) ?? 0;
        if (present === 0) return false;
        if (total - present <= 0) {
            throw new Error('Cannot remove the last glyph from a grapheme');
        }
        db.run('DELETE FROM grapheme_glyphs WHERE grapheme_id = ? AND glyph_id = ?', [graphemeId, glyphId]);
        touchGrapheme(graphemeId);
        return true;
    });
}

/**
 * Replace all glyphs for a grapheme with a new ordered list.
 * @throws if the list is empty
 */
export function setGraphemeGlyphs(graphemeId: number, glyphs: CreateGraphemeGlyphInput[]): void {
    if (glyphs.length === 0) {
        throw new Error('At least one glyph is required for a grapheme');
    }
    const db = getDatabase();
    withTransaction(db, () => {
        db.run('DELETE FROM grapheme_glyphs WHERE grapheme_id = ?', [graphemeId]);
        for (const glyphInput of glyphs) {
            db.run(
                `INSERT INTO grapheme_glyphs (grapheme_id, glyph_id, position, transform) VALUES (?, ?, ?, ?)`,
                [graphemeId, glyphInput.glyph_id, glyphInput.position, glyphInput.transform ?? null],
            );
        }
        touchGrapheme(graphemeId);
    });
}

/** Reorder glyphs within a grapheme. */
export function reorderGraphemeGlyphs(graphemeId: number, glyphIds: number[]): void {
    const db = getDatabase();
    withTransaction(db, () => {
        // Match each requested glyph to ONE junction row (first unused occurrence),
        // so a grapheme that uses the same glyph twice keeps two rows. Two passes
        // keep UNIQUE(grapheme_id, glyph_id, position) satisfied mid-update.
        const rows = getGraphemeGlyphEntries(graphemeId);
        const used = new Set<number>();
        const rowIds = glyphIds.map(glyphId => {
            const row = rows.find(r => r.glyph_id === glyphId && !used.has(r.id));
            if (!row) {
                throw new Error(`Glyph ${glyphId} is not part of grapheme ${graphemeId}`);
            }
            used.add(row.id);
            return row.id;
        });
        rowIds.forEach((rowId, index) => {
            db.run('UPDATE grapheme_glyphs SET position = ? WHERE id = ?', [-(index + 1), rowId]);
        });
        rowIds.forEach((rowId, index) => {
            db.run('UPDATE grapheme_glyphs SET position = ? WHERE id = ?', [index, rowId]);
        });
        touchGrapheme(graphemeId);
    });
}

// =============================================================================
// PHONEME CRUD OPERATIONS
// =============================================================================

/** Add a phoneme to a grapheme. */
export function addPhoneme(graphemeId: number, input: CreatePhonemeInput): Phoneme {
    const db = getDatabase();
    validateStringLength(input.phoneme, LIMITS.PHONEME, 'Phoneme');
    const phonemeId = withTransaction(db, () => {
        db.run(
            `INSERT INTO phonemes (grapheme_id, phoneme, use_in_auto_spelling, context) VALUES (?, ?, ?, ?)`,
            [graphemeId, input.phoneme, input.use_in_auto_spelling ? 1 : 0, input.context ?? null],
        );
        return lastInsertId(db);
    });
    const phoneme = getPhonemeById(phonemeId);
    if (!phoneme) {
        throw new Error('Failed to create phoneme');
    }
    return phoneme;
}

export function getPhonemeById(id: number): Phoneme | null {
    const rec = execOne(getDatabase(), `SELECT ${PHONEME_COLUMNS} FROM phonemes WHERE id = ?`, [id]);
    return rec ? mapPhoneme(rec) : null;
}

export function getPhonemesByGraphemeId(graphemeId: number): Phoneme[] {
    return execRows(
        getDatabase(),
        `SELECT ${PHONEME_COLUMNS} FROM phonemes WHERE grapheme_id = ? ORDER BY id ASC`,
        [graphemeId],
    ).map(mapPhoneme);
}

export function updatePhoneme(id: number, input: UpdatePhonemeInput): Phoneme | null {
    const db = getDatabase();

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.phoneme !== undefined) {
        validateStringLength(input.phoneme, LIMITS.PHONEME, 'Phoneme');
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

    withTransaction(db, () => {
        db.run(`UPDATE phonemes SET ${updates.join(', ')} WHERE id = ?`, [...values, id]);
    });
    return getPhonemeById(id);
}

export function deletePhoneme(id: number): boolean {
    const db = getDatabase();
    return withTransaction(db, () => {
        db.run('DELETE FROM phonemes WHERE id = ?', [id]);
        return db.getRowsModified() > 0;
    });
}

export function deleteAllPhonemesForGrapheme(graphemeId: number): number {
    const db = getDatabase();
    return withTransaction(db, () => {
        db.run('DELETE FROM phonemes WHERE grapheme_id = ?', [graphemeId]);
        return db.getRowsModified();
    });
}

/**
 * Replace a grapheme's phonemes with `inputs`, in order, in ONE transaction.
 *
 * The grapheme edit form used to do this as a delete-all followed by one add
 * per row, so a rejected row (too long, say) left the grapheme with a partial
 * list and no way to tell. Here a bad row rolls the whole replacement back
 * and the previous phonemes stay. Every input is validated before the first
 * write.
 */
export function setGraphemePhonemes(graphemeId: number, inputs: CreatePhonemeInput[]): Phoneme[] {
    const db = getDatabase();
    for (const input of inputs) {
        validateStringLength(input.phoneme, LIMITS.PHONEME, 'Phoneme');
    }
    return withTransaction(db, () => {
        db.run('DELETE FROM phonemes WHERE grapheme_id = ?', [graphemeId]);
        for (const input of inputs) {
            db.run(
                `INSERT INTO phonemes (grapheme_id, phoneme, use_in_auto_spelling, context) VALUES (?, ?, ?, ?)`,
                [graphemeId, input.phoneme, input.use_in_auto_spelling ? 1 : 0, input.context ?? null],
            );
        }
        touchGrapheme(graphemeId);
        return getPhonemesByGraphemeId(graphemeId);
    });
}

/** All phonemes marked for auto-spelling. */
export function getAutoSpellingPhonemes(): Phoneme[] {
    return execRows(
        getDatabase(),
        `SELECT ${PHONEME_COLUMNS} FROM phonemes WHERE use_in_auto_spelling = 1 ORDER BY grapheme_id, id`,
    ).map(mapPhoneme);
}

// =============================================================================
// PHONEME LOOKUP OPERATIONS (for IPA Chart)
// =============================================================================

/** First grapheme carrying the given phoneme, or null. */
export function getGraphemeByPhoneme(phoneme: string): GraphemeComplete | null {
    const graphemeId = execScalar<number>(getDatabase(), 'SELECT grapheme_id FROM phonemes WHERE phoneme = ? LIMIT 1', [phoneme]);
    return graphemeId === undefined ? null : getGraphemeComplete(graphemeId);
}

/**
 * phoneme → first grapheme carrying it, for bulk IPA-chart rendering.
 * Four statements total.
 */
export function getAllPhonemeGraphemeMappings(): Map<string, GraphemeComplete> {
    const mappings = new Map<string, GraphemeComplete>();
    const firstGraphemeFor = new Map<string, number>();
    for (const rec of execRows(getDatabase(), 'SELECT phoneme, grapheme_id FROM phonemes ORDER BY grapheme_id, id')) {
        const phoneme = rec.phoneme as string;
        if (!firstGraphemeFor.has(phoneme)) {
            firstGraphemeFor.set(phoneme, rec.grapheme_id as number);
        }
    }
    if (firstGraphemeFor.size === 0) return mappings;

    const byId = new Map(getAllGraphemesComplete().map(g => [g.id, g]));
    for (const [phoneme, graphemeId] of firstGraphemeFor) {
        const grapheme = byId.get(graphemeId);
        if (grapheme) mappings.set(phoneme, grapheme);
    }
    return mappings;
}
