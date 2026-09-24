/**
 * Grapheme Service
 *
 * CRUD operations for graphemes, their glyph composition and their phonemes.
 *
 * - Grapheme: a written character composed of ≥ 1 glyphs (the invariant every
 *   writer here preserves — `createGrapheme`, `setGraphemeGlyphs` and
 *   `removeGlyphFromGrapheme` refuse to leave a grapheme empty).
 * - Variant (schema v9): a grapheme has one or more visual forms; exactly one
 *   is the DEFAULT. Every glyph writer here (`addGlyphToGrapheme`,
 *   `setGraphemeGlyphs`, `reorderGraphemeGlyphs`, `removeGlyphFromGrapheme`)
 *   acts on the default unless an explicit `variantId` is passed, and every
 *   `glyphs` field this module returns is the DEFAULT variant's glyphs — the
 *   meaning it had before variants existed. The full list rides in the
 *   optional `variants` field. Variant CRUD lives in `variantService`.
 * - GraphemeGlyph: junction rows with `position` ordering, one set per variant.
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
import {
    DEFAULT_VARIANT_NAME,
    getDefaultVariantId,
    getVariantsByGraphemeId,
    insertVariantRow,
    loadVariantsByGrapheme,
    pickDefaultVariant,
    validateVariantInput,
    writeVariantGlyphs,
} from './variantService';
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

const GRAPHEME_COLUMNS = 'id, name, category, notes, folder_id, created_at, updated_at';
const PHONEME_COLUMNS = 'id, grapheme_id, phoneme, use_in_auto_spelling, context';

function mapGrapheme(rec: SqlRecord): Grapheme {
    return {
        id: rec.id as number,
        name: rec.name as string,
        category: (rec.category as string | null) ?? null,
        notes: (rec.notes as string | null) ?? null,
        folder_id: (rec.folder_id as number | null) ?? null,
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
        folder_id: (rec.folder_id as number | null) ?? null,
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

/**
 * The variant a glyph writer acts on: `variantId` when given (it must belong
 * to `graphemeId`), otherwise the grapheme's default.
 * @throws when the grapheme has no default or the variant is not its own
 */
function resolveVariantId(graphemeId: number, variantId?: number): number {
    if (variantId !== undefined) {
        const owner = execScalar<number>(getDatabase(), 'SELECT grapheme_id FROM grapheme_variants WHERE id = ?', [variantId]);
        if (owner !== graphemeId) {
            throw new Error(`Variant ${variantId} does not belong to grapheme ${graphemeId}`);
        }
        return variantId;
    }
    const defaultId = getDefaultVariantId(graphemeId);
    if (defaultId === null) {
        throw new Error(`Grapheme ${graphemeId} not found (or has no default variant)`);
    }
    return defaultId;
}

// =============================================================================
// GRAPHEME CRUD OPERATIONS
// =============================================================================

/**
 * Create a new grapheme with its glyph composition and optional phonemes.
 *
 * The grapheme gets a 'Default' variant holding `input.glyphs`; every entry
 * of `input.variants` becomes an additional (non-default) variant. Every
 * variant input is validated before the first write, and the whole creation
 * is one transaction — a bad variant (empty, or a second form in the same
 * group) creates nothing.
 */
export function createGrapheme(input: CreateGraphemeInput): GraphemeComplete {
    const db = getDatabase();

    if (!input.glyphs || input.glyphs.length === 0) {
        throw new Error('At least one glyph is required to create a grapheme');
    }
    validateStringLength(input.name, LIMITS.GRAPHEME_NAME, 'Grapheme name');
    if (input.category) validateStringLength(input.category, LIMITS.CATEGORY, 'Category');
    if (input.notes) validateStringLength(input.notes, LIMITS.NOTES, 'Notes');
    for (const variantInput of input.variants ?? []) {
        validateVariantInput(variantInput);
    }

    const graphemeId = withTransaction(db, () => {
        db.run(
            `INSERT INTO graphemes (name, category, notes, folder_id) VALUES (?, ?, ?, ?)`,
            [input.name, input.category ?? null, input.notes ?? null, input.folder_id ?? null],
        );
        const id = lastInsertId(db);
        const defaultVariantId = insertVariantRow(id, { name: DEFAULT_VARIANT_NAME, is_default: true, sort_order: 0 });
        for (const glyphInput of input.glyphs) {
            addGlyphToGrapheme(id, glyphInput, defaultVariantId);
        }
        (input.variants ?? []).forEach((variantInput, index) => {
            const variantId = insertVariantRow(id, {
                name: variantInput.name,
                group_id: variantInput.group_id ?? null,
                is_default: false,
                sort_order: variantInput.sort_order ?? index + 1,
            });
            writeVariantGlyphs(id, variantId, variantInput.glyphs);
        });
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
    const variants = getVariantsByGraphemeId(id);
    return { ...grapheme, glyphs: pickDefaultVariant(variants)?.glyphs ?? [], variants };
}

export function getGraphemeWithPhonemes(id: number): GraphemeWithPhonemes | null {
    const grapheme = getGraphemeById(id);
    if (!grapheme) return null;
    return { ...grapheme, phonemes: getPhonemesByGraphemeId(id) };
}

/**
 * A grapheme with its default-variant glyphs, phonemes and every variant.
 * `glyphs` is derived from the default entry of `variants` (one query loads
 * both), so the two can never disagree.
 */
export function getGraphemeComplete(id: number): GraphemeComplete | null {
    const grapheme = getGraphemeById(id);
    if (!grapheme) return null;
    const variants = getVariantsByGraphemeId(id);
    return {
        ...grapheme,
        glyphs: pickDefaultVariant(variants)?.glyphs ?? [],
        phonemes: getPhonemesByGraphemeId(id),
        variants,
    };
}

/** All graphemes, newest first. */
export function getAllGraphemes(): Grapheme[] {
    return execRows(getDatabase(), `SELECT ${GRAPHEME_COLUMNS} FROM graphemes ORDER BY created_at DESC`).map(mapGrapheme);
}

/** All graphemes with default-variant glyphs and every variant — TWO statements. */
export function getAllGraphemesWithGlyphs(): GraphemeWithGlyphs[] {
    const variantsOf = loadVariantsByGrapheme();
    return getAllGraphemes().map(grapheme => {
        const variants = variantsOf.get(grapheme.id) ?? [];
        return { ...grapheme, glyphs: pickDefaultVariant(variants)?.glyphs ?? [], variants };
    });
}

export function getAllGraphemesWithPhonemes(): GraphemeWithPhonemes[] {
    const phonemesOf = loadPhonemesByGrapheme();
    return getAllGraphemes().map(grapheme => ({ ...grapheme, phonemes: phonemesOf.get(grapheme.id) ?? [] }));
}

/**
 * All graphemes with glyphs, phonemes and variants — THREE statements
 * regardless of grapheme count: graphemes, variants-with-glyphs (one JOIN;
 * `glyphs` is the default entry of it), phonemes. Loading the variants did
 * not add a statement because the old per-grapheme glyph loader is subsumed
 * by the variant loader.
 */
export function getAllGraphemesComplete(): GraphemeComplete[] {
    const variantsOf = loadVariantsByGrapheme();
    const phonemesOf = loadPhonemesByGrapheme();
    return getAllGraphemes().map(grapheme => {
        const variants = variantsOf.get(grapheme.id) ?? [];
        return {
            ...grapheme,
            glyphs: pickDefaultVariant(variants)?.glyphs ?? [],
            phonemes: phonemesOf.get(grapheme.id) ?? [],
            variants,
        };
    });
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
        // Explicit child-first order (CASCADE covers it with FKs on; this keeps
        // an FK-off connection consistent too): glyph rows → variants → grapheme.
        // No word pins one of its variants: a pin names the grapheme, and the
        // lexicon guard above refused any word that spells with it.
        db.run('DELETE FROM phonemes WHERE grapheme_id = ?', [id]);
        db.run('DELETE FROM grapheme_glyphs WHERE grapheme_id = ?', [id]);
        db.run('DELETE FROM grapheme_variants WHERE grapheme_id = ?', [id]);
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

/**
 * Glyphs of a grapheme's DEFAULT variant (or of `variantId`, which must be one
 * of its variants), ordered by position. Empty for an unknown grapheme.
 */
export function getGlyphsByGraphemeId(graphemeId: number, variantId?: number): Glyph[] {
    const variantFilter = variantId === undefined ? 'v.is_default = 1' : 'v.id = ?';
    const params = variantId === undefined ? [graphemeId] : [graphemeId, variantId];
    return execRows(getDatabase(), `
        SELECT g.id, g.name, g.svg_data, g.category, g.notes, g.folder_id, g.created_at, g.updated_at
        FROM grapheme_variants v
        JOIN grapheme_glyphs gg ON gg.variant_id = v.id
        JOIN glyphs g ON g.id = gg.glyph_id
        WHERE v.grapheme_id = ? AND ${variantFilter}
        ORDER BY gg.position ASC
    `, params).map(mapGlyph);
}

/**
 * Junction rows of a grapheme's DEFAULT variant (or of `variantId`), ordered
 * by position. Empty for an unknown grapheme.
 */
export function getGraphemeGlyphEntries(graphemeId: number, variantId?: number): GraphemeGlyph[] {
    const variantFilter = variantId === undefined ? 'v.is_default = 1' : 'v.id = ?';
    const params = variantId === undefined ? [graphemeId] : [graphemeId, variantId];
    return execRows(getDatabase(), `
        SELECT gg.id, gg.grapheme_id, gg.variant_id, gg.glyph_id, gg.position, gg.transform
        FROM grapheme_glyphs gg
        JOIN grapheme_variants v ON v.id = gg.variant_id
        WHERE v.grapheme_id = ? AND ${variantFilter}
        ORDER BY gg.position ASC
    `, params).map(rec => ({
        id: rec.id as number,
        grapheme_id: rec.grapheme_id as number,
        variant_id: rec.variant_id as number,
        glyph_id: rec.glyph_id as number,
        position: rec.position as number,
        transform: (rec.transform as string | null) ?? null,
    }));
}

/**
 * Add a glyph at a specific position of the grapheme's DEFAULT variant (or of
 * `variantId`).
 * @throws if the grapheme does not exist or `variantId` is not one of its variants
 */
export function addGlyphToGrapheme(graphemeId: number, input: CreateGraphemeGlyphInput, variantId?: number): GraphemeGlyph {
    const db = getDatabase();
    return withTransaction(db, () => {
        const targetVariantId = resolveVariantId(graphemeId, variantId);
        db.run(
            `INSERT INTO grapheme_glyphs (grapheme_id, variant_id, glyph_id, position, transform) VALUES (?, ?, ?, ?, ?)`,
            [graphemeId, targetVariantId, input.glyph_id, input.position, input.transform ?? null],
        );
        const id = lastInsertId(db);
        touchGrapheme(graphemeId);
        return {
            id,
            grapheme_id: graphemeId,
            variant_id: targetVariantId,
            glyph_id: input.glyph_id,
            position: input.position,
            transform: input.transform ?? null,
        };
    });
}

/**
 * Remove a glyph from the grapheme's DEFAULT variant (or from `variantId`).
 * @returns false when the glyph is not in that variant (or the grapheme does not exist)
 * @throws if it is the variant's last glyph
 */
export function removeGlyphFromGrapheme(graphemeId: number, glyphId: number, variantId?: number): boolean {
    const db = getDatabase();
    return withTransaction(db, () => {
        if (variantId === undefined && getDefaultVariantId(graphemeId) === null) return false;
        const targetVariantId = resolveVariantId(graphemeId, variantId);
        const total = execScalar<number>(db, 'SELECT COUNT(*) FROM grapheme_glyphs WHERE variant_id = ?', [targetVariantId]) ?? 0;
        const present = execScalar<number>(db, 'SELECT COUNT(*) FROM grapheme_glyphs WHERE variant_id = ? AND glyph_id = ?', [targetVariantId, glyphId]) ?? 0;
        if (present === 0) return false;
        if (total - present <= 0) {
            throw new Error('Cannot remove the last glyph from a grapheme');
        }
        db.run('DELETE FROM grapheme_glyphs WHERE variant_id = ? AND glyph_id = ?', [targetVariantId, glyphId]);
        touchGrapheme(graphemeId);
        return true;
    });
}

/**
 * Replace all glyphs of the grapheme's DEFAULT variant (or of `variantId`)
 * with a new ordered list. Other variants are untouched.
 * @throws if the list is empty, the grapheme does not exist, or `variantId`
 *         is not one of its variants
 */
export function setGraphemeGlyphs(graphemeId: number, glyphs: CreateGraphemeGlyphInput[], variantId?: number): void {
    if (glyphs.length === 0) {
        throw new Error('At least one glyph is required for a grapheme');
    }
    const db = getDatabase();
    withTransaction(db, () => {
        writeVariantGlyphs(graphemeId, resolveVariantId(graphemeId, variantId), glyphs);
        touchGrapheme(graphemeId);
    });
}

/** Reorder the glyphs of the grapheme's DEFAULT variant (or of `variantId`). */
export function reorderGraphemeGlyphs(graphemeId: number, glyphIds: number[], variantId?: number): void {
    const db = getDatabase();
    withTransaction(db, () => {
        // Match each requested glyph to ONE junction row (first unused occurrence),
        // so a variant that uses the same glyph twice keeps two rows. Two passes
        // keep UNIQUE(variant_id, glyph_id, position) satisfied mid-update.
        const rows = getGraphemeGlyphEntries(graphemeId, resolveVariantId(graphemeId, variantId));
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
