/**
 * Variant Service — grapheme variants and variant groups (schema v9)
 *
 * A VARIANT is one visual form of a grapheme: an ordered glyph list. Same
 * sound, different look — phonemes stay on the grapheme. A VARIANT GROUP is a
 * script-level named bucket ("head", "geometric", …); block-scheme template
 * slots name a group to pick which form is drawn in that slot.
 *
 * Invariants this service (with `graphemeService`) preserves:
 *   - every grapheme has exactly ONE default variant — enforced by the partial
 *     unique index `idx_grapheme_variants_default`, so swapping the default
 *     clears the old one BEFORE setting the new one (`setDefaultVariant`);
 *   - every variant has ≥ 1 glyph (`createVariant` / `setVariantGlyphs`
 *     refuse an empty list; the default is only deleted with its grapheme);
 *   - at most one variant per (grapheme, group) — `idx_grapheme_variants_group`,
 *     checked up front here so the caller gets a readable error;
 *   - `grapheme_glyphs.grapheme_id` always equals its variant's grapheme.
 *
 * `GraphemeComplete.glyphs` keeps meaning "the DEFAULT variant's glyphs";
 * this module adds the `variants` list next to it and never changes `glyphs`.
 *
 * Dependency direction: `graphemeService` → `variantService` → `lexiconService`.
 * Nothing here imports `graphemeService`, so the glyph-row writer
 * (`writeVariantGlyphs`) lives here and `graphemeService` reuses it.
 */

import { getDatabase } from './database';
import { withTransaction } from './utils/transaction';
import { execRows, execOne, execScalar, lastInsertId, type SqlRecord } from './utils/sql';
import { validateStringLength, LIMITS } from './utils/sanitize';
import { getLexiconEntriesPinningVariant, handleVariantDeletion } from './lexiconService';
import type {
    Glyph,
    VariantGroup,
    GraphemeVariant,
    GraphemeVariantWithGlyphs,
    CreateGraphemeGlyphInput,
    CreateGraphemeVariantInput,
    UpdateGraphemeVariantInput,
    CreateVariantGroupInput,
    UpdateVariantGroupInput,
} from './types';

/** Name given to the variant every grapheme is created with. */
export const DEFAULT_VARIANT_NAME = 'Default';

// =============================================================================
// ROW MAPPING
// =============================================================================

const GROUP_COLUMNS = 'id, name, sort_order, created_at, updated_at';
const VARIANT_COLUMNS = 'id, grapheme_id, group_id, name, is_default, sort_order, created_at, updated_at';

function mapGroup(rec: SqlRecord): VariantGroup {
    return {
        id: rec.id as number,
        name: rec.name as string,
        sort_order: rec.sort_order as number,
        created_at: rec.created_at as string,
        updated_at: rec.updated_at as string,
    };
}

function mapVariant(rec: SqlRecord, prefix = ''): GraphemeVariant {
    return {
        id: rec[`${prefix}id`] as number,
        grapheme_id: rec[`${prefix}grapheme_id`] as number,
        group_id: (rec[`${prefix}group_id`] as number | null) ?? null,
        name: rec[`${prefix}name`] as string,
        is_default: rec[`${prefix}is_default`] === 1,
        sort_order: rec[`${prefix}sort_order`] as number,
        created_at: rec[`${prefix}created_at`] as string,
        updated_at: rec[`${prefix}updated_at`] as string,
    };
}

function mapGlyph(rec: SqlRecord, prefix = ''): Glyph {
    return {
        id: rec[`${prefix}id`] as number,
        name: rec[`${prefix}name`] as string,
        svg_data: rec[`${prefix}svg_data`] as string,
        category: (rec[`${prefix}category`] as string | null) ?? null,
        notes: (rec[`${prefix}notes`] as string | null) ?? null,
        folder_id: (rec[`${prefix}folder_id`] as number | null) ?? null,
        created_at: rec[`${prefix}created_at`] as string,
        updated_at: rec[`${prefix}updated_at`] as string,
    };
}

function touchGrapheme(graphemeId: number): void {
    getDatabase().run(`UPDATE graphemes SET updated_at = datetime('now') WHERE id = ?`, [graphemeId]);
}

/** Trimmed, non-empty, within `limit` — or throw with `field` in the message. */
function requireName(raw: string | undefined, limit: number, field: string): string {
    const name = (raw ?? '').trim();
    if (name.length === 0) {
        throw new Error(`${field} is required`);
    }
    validateStringLength(name, limit, field);
    return name;
}

// =============================================================================
// VARIANT GROUPS
// =============================================================================

export function getVariantGroupById(id: number): VariantGroup | null {
    const rec = execOne(getDatabase(), `SELECT ${GROUP_COLUMNS} FROM variant_groups WHERE id = ?`, [id]);
    return rec ? mapGroup(rec) : null;
}

/** Every group, in the user's order. */
export function getAllVariantGroups(): VariantGroup[] {
    return execRows(getDatabase(), `SELECT ${GROUP_COLUMNS} FROM variant_groups ORDER BY sort_order ASC, id ASC`)
        .map(mapGroup);
}

/** Group names compare trimmed and case-insensitively; two "Head" groups would be indistinguishable in a picker. */
function assertGroupNameFree(name: string, excludeId?: number): void {
    const clash = execScalar<number>(
        getDatabase(),
        `SELECT id FROM variant_groups WHERE lower(trim(name)) = lower(?) AND id <> ? LIMIT 1`,
        [name, excludeId ?? -1],
    );
    if (clash !== undefined) {
        throw new Error(`A variant group named "${name}" already exists`);
    }
}

export function createVariantGroup(input: CreateVariantGroupInput): VariantGroup {
    const db = getDatabase();
    const name = requireName(input.name, LIMITS.VARIANT_GROUP_NAME, 'Variant group name');
    assertGroupNameFree(name);
    const id = withTransaction(db, () => {
        const sortOrder = input.sort_order
            ?? ((execScalar<number>(db, 'SELECT MAX(sort_order) FROM variant_groups') ?? -1) + 1);
        db.run('INSERT INTO variant_groups (name, sort_order) VALUES (?, ?)', [name, sortOrder]);
        return lastInsertId(db);
    });
    const group = getVariantGroupById(id);
    if (!group) throw new Error('Failed to create variant group');
    return group;
}

export function updateVariantGroup(id: number, input: UpdateVariantGroupInput): VariantGroup | null {
    const db = getDatabase();
    if (!getVariantGroupById(id)) return null;

    const updates: string[] = [];
    const values: (string | number)[] = [];
    if (input.name !== undefined) {
        const name = requireName(input.name, LIMITS.VARIANT_GROUP_NAME, 'Variant group name');
        assertGroupNameFree(name, id);
        updates.push('name = ?');
        values.push(name);
    }
    if (input.sort_order !== undefined) {
        updates.push('sort_order = ?');
        values.push(input.sort_order);
    }
    if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        withTransaction(db, () => {
            db.run(`UPDATE variant_groups SET ${updates.join(', ')} WHERE id = ?`, [...values, id]);
        });
    }
    return getVariantGroupById(id);
}

/** Number of variants currently in a group (for "used by N forms" confirms). */
export function getVariantGroupUsageCount(id: number): number {
    return execScalar<number>(getDatabase(), 'SELECT COUNT(*) FROM grapheme_variants WHERE group_id = ?', [id]) ?? 0;
}

export interface VariantGroupDeletionResult {
    deleted: boolean;
    /** Variants that were in the group; they survive, ungrouped (`group_id = NULL`). */
    variantsDetached: number;
}

/**
 * Delete a group. Its variants KEEP existing with `group_id = NULL` (the FK is
 * `ON DELETE SET NULL`; the explicit UPDATE makes that hold even on a
 * connection with foreign keys off). Block-scheme template slots naming the
 * group are NOT touched — the composer falls back to the default variant.
 */
export function deleteVariantGroup(id: number): VariantGroupDeletionResult {
    const db = getDatabase();
    return withTransaction(db, () => {
        db.run(
            `UPDATE grapheme_variants SET group_id = NULL, updated_at = datetime('now') WHERE group_id = ?`,
            [id],
        );
        const variantsDetached = db.getRowsModified();
        db.run('DELETE FROM variant_groups WHERE id = ?', [id]);
        return { deleted: db.getRowsModified() > 0, variantsDetached };
    });
}

// =============================================================================
// VARIANT READS
// =============================================================================

export function getVariantById(id: number): GraphemeVariant | null {
    const rec = execOne(getDatabase(), `SELECT ${VARIANT_COLUMNS} FROM grapheme_variants WHERE id = ?`, [id]);
    return rec ? mapVariant(rec) : null;
}

/** The id of a grapheme's default variant, or null when the grapheme has none (does not exist). */
export function getDefaultVariantId(graphemeId: number): number | null {
    return execScalar<number>(
        getDatabase(),
        'SELECT id FROM grapheme_variants WHERE grapheme_id = ? AND is_default = 1',
        [graphemeId],
    ) ?? null;
}

/**
 * Variant rows joined to their glyph rows and glyphs, ONE statement. A LEFT
 * JOIN so a variant without glyphs (only possible for the default of an empty
 * legacy grapheme) still appears, with `glyphs: []`.
 */
function variantsWithGlyphsQuery(where: string): string {
    return `
        SELECT v.id AS v_id, v.grapheme_id AS v_grapheme_id, v.group_id AS v_group_id, v.name AS v_name,
               v.is_default AS v_is_default, v.sort_order AS v_sort_order,
               v.created_at AS v_created_at, v.updated_at AS v_updated_at,
               g.id AS g_id, g.name AS g_name, g.svg_data AS g_svg_data, g.category AS g_category,
               g.notes AS g_notes, g.folder_id AS g_folder_id, g.created_at AS g_created_at, g.updated_at AS g_updated_at
        FROM grapheme_variants v
        LEFT JOIN grapheme_glyphs gg ON gg.variant_id = v.id
        LEFT JOIN glyphs g ON g.id = gg.glyph_id
        ${where}
        ORDER BY v.grapheme_id ASC, v.is_default DESC, v.sort_order ASC, v.id ASC, gg.position ASC
    `;
}

/** Group the joined rows into grapheme id → ordered variants with glyphs. */
function groupVariantRows(records: SqlRecord[]): Map<number, GraphemeVariantWithGlyphs[]> {
    const out = new Map<number, GraphemeVariantWithGlyphs[]>();
    let current: GraphemeVariantWithGlyphs | null = null;
    for (const rec of records) {
        const variantId = rec.v_id as number;
        if (current === null || current.id !== variantId) {
            current = { ...mapVariant(rec, 'v_'), glyphs: [] };
            const list = out.get(current.grapheme_id);
            if (list) list.push(current);
            else out.set(current.grapheme_id, [current]);
        }
        if (rec.g_id !== null && rec.g_id !== undefined) {
            current.glyphs.push(mapGlyph(rec, 'g_'));
        }
    }
    return out;
}

/** A grapheme's variants with glyphs: default first, then `sort_order`. One statement. */
export function getVariantsByGraphemeId(graphemeId: number): GraphemeVariantWithGlyphs[] {
    const records = execRows(getDatabase(), variantsWithGlyphsQuery('WHERE v.grapheme_id = ?'), [graphemeId]);
    return groupVariantRows(records).get(graphemeId) ?? [];
}

/**
 * grapheme id → its variants with glyphs, for EVERY grapheme — ONE statement.
 * The bulk loaders (`getAllGraphemesComplete`, `getAllGraphemesWithGlyphs`)
 * derive `glyphs` from the default entry of this map.
 */
export function loadVariantsByGrapheme(): Map<number, GraphemeVariantWithGlyphs[]> {
    return groupVariantRows(execRows(getDatabase(), variantsWithGlyphsQuery('')));
}

/** The default variant of an already-loaded list (the first one, by the load order). */
export function pickDefaultVariant(
    variants: GraphemeVariantWithGlyphs[] | undefined,
): GraphemeVariantWithGlyphs | undefined {
    return variants?.find(v => v.is_default) ?? variants?.[0];
}

/** Number of words whose spelling pins this variant (for "N words pin this form" confirms). */
export function getVariantPinUsageCount(variantId: number): number {
    return getLexiconEntriesPinningVariant(variantId).length;
}

// =============================================================================
// SHARED WRITERS (also used by graphemeService)
// =============================================================================

/** Validate a variant input before the first write. */
export function validateVariantInput(input: CreateGraphemeVariantInput): void {
    requireName(input.name, LIMITS.VARIANT_NAME, 'Variant name');
    if (!input.glyphs || input.glyphs.length === 0) {
        throw new Error('At least one glyph is required for a variant');
    }
}

/** Throw a readable error when `groupId` does not exist or the grapheme already has a variant in it. */
function assertGroupAssignable(graphemeId: number, groupId: number | null, excludeVariantId?: number): void {
    if (groupId === null) return;
    const group = getVariantGroupById(groupId);
    if (!group) {
        throw new Error(`Variant group ${groupId} does not exist`);
    }
    const clash = execScalar<number>(
        getDatabase(),
        'SELECT id FROM grapheme_variants WHERE grapheme_id = ? AND group_id = ? AND id <> ? LIMIT 1',
        [graphemeId, groupId, excludeVariantId ?? -1],
    );
    if (clash !== undefined) {
        throw new Error(`This grapheme already has a form in the "${group.name}" group; a grapheme has at most one form per group`);
    }
}

export interface VariantRowInput {
    name: string;
    group_id?: number | null;
    is_default: boolean;
    sort_order?: number;
}

/**
 * Insert one `grapheme_variants` row (no glyphs) and return its id. Runs in the
 * caller's transaction. `sort_order` defaults to one past the grapheme's
 * current maximum.
 */
export function insertVariantRow(graphemeId: number, input: VariantRowInput): number {
    const db = getDatabase();
    const name = requireName(input.name, LIMITS.VARIANT_NAME, 'Variant name');
    const groupId = input.group_id ?? null;
    assertGroupAssignable(graphemeId, groupId);
    const sortOrder = input.sort_order
        ?? ((execScalar<number>(db, 'SELECT MAX(sort_order) FROM grapheme_variants WHERE grapheme_id = ?', [graphemeId]) ?? -1) + 1);
    db.run(
        `INSERT INTO grapheme_variants (grapheme_id, group_id, name, is_default, sort_order) VALUES (?, ?, ?, ?, ?)`,
        [graphemeId, groupId, name, input.is_default ? 1 : 0, sortOrder],
    );
    return lastInsertId(db);
}

/**
 * Replace a variant's glyph rows with `glyphs` (in the caller's transaction).
 * The rows carry the variant's grapheme id, keeping the denormalised
 * `grapheme_glyphs.grapheme_id` equal to the variant's.
 */
export function writeVariantGlyphs(graphemeId: number, variantId: number, glyphs: CreateGraphemeGlyphInput[]): void {
    const db = getDatabase();
    db.run('DELETE FROM grapheme_glyphs WHERE variant_id = ?', [variantId]);
    for (const glyph of glyphs) {
        db.run(
            `INSERT INTO grapheme_glyphs (grapheme_id, variant_id, glyph_id, position, transform) VALUES (?, ?, ?, ?, ?)`,
            [graphemeId, variantId, glyph.glyph_id, glyph.position, glyph.transform ?? null],
        );
    }
}

function requireVariant(id: number): GraphemeVariant {
    const variant = getVariantById(id);
    if (!variant) {
        throw new Error(`Variant ${id} not found`);
    }
    return variant;
}

// =============================================================================
// VARIANT WRITES
// =============================================================================

/**
 * Add a (non-default) variant to a grapheme.
 * @throws if the grapheme does not exist, the glyph list is empty, or the
 *         grapheme already has a form in `group_id`
 */
export function createVariant(graphemeId: number, input: CreateGraphemeVariantInput): GraphemeVariantWithGlyphs {
    const db = getDatabase();
    validateVariantInput(input);
    if (execScalar<number>(db, 'SELECT 1 FROM graphemes WHERE id = ?', [graphemeId]) === undefined) {
        throw new Error(`Grapheme ${graphemeId} not found`);
    }
    const variantId = withTransaction(db, () => {
        const id = insertVariantRow(graphemeId, {
            name: input.name,
            group_id: input.group_id ?? null,
            is_default: false,
            sort_order: input.sort_order,
        });
        writeVariantGlyphs(graphemeId, id, input.glyphs);
        touchGrapheme(graphemeId);
        return id;
    });
    const created = getVariantsByGraphemeId(graphemeId).find(v => v.id === variantId);
    if (!created) throw new Error('Failed to create variant');
    return created;
}

/** Rename / regroup / reorder a variant. Returns null when it does not exist. */
export function updateVariant(id: number, input: UpdateGraphemeVariantInput): GraphemeVariant | null {
    const db = getDatabase();
    const variant = getVariantById(id);
    if (!variant) return null;

    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (input.name !== undefined) {
        updates.push('name = ?');
        values.push(requireName(input.name, LIMITS.VARIANT_NAME, 'Variant name'));
    }
    if (input.group_id !== undefined) {
        const groupId = input.group_id ?? null;
        assertGroupAssignable(variant.grapheme_id, groupId, id);
        updates.push('group_id = ?');
        values.push(groupId);
    }
    if (input.sort_order !== undefined) {
        updates.push('sort_order = ?');
        values.push(input.sort_order);
    }
    if (updates.length === 0) return variant;

    updates.push("updated_at = datetime('now')");
    withTransaction(db, () => {
        db.run(`UPDATE grapheme_variants SET ${updates.join(', ')} WHERE id = ?`, [...values, id]);
        touchGrapheme(variant.grapheme_id);
    });
    return getVariantById(id);
}

/**
 * Replace a variant's glyphs with a new ordered list.
 * @throws if the list is empty or the variant does not exist
 */
export function setVariantGlyphs(id: number, glyphs: CreateGraphemeGlyphInput[]): void {
    if (glyphs.length === 0) {
        throw new Error('At least one glyph is required for a variant');
    }
    const variant = requireVariant(id);
    const db = getDatabase();
    withTransaction(db, () => {
        writeVariantGlyphs(variant.grapheme_id, id, glyphs);
        db.run(`UPDATE grapheme_variants SET updated_at = datetime('now') WHERE id = ?`, [id]);
        touchGrapheme(variant.grapheme_id);
    });
}

/**
 * Make `variantId` the grapheme's default. Two UPDATEs in ONE transaction —
 * the old default is cleared FIRST, because the partial unique index allows
 * only one `is_default = 1` row per grapheme at any instant.
 * @throws if the variant does not exist or belongs to another grapheme
 */
export function setDefaultVariant(graphemeId: number, variantId: number): void {
    const variant = requireVariant(variantId);
    if (variant.grapheme_id !== graphemeId) {
        throw new Error(`Variant ${variantId} does not belong to grapheme ${graphemeId}`);
    }
    if (variant.is_default) return;
    const db = getDatabase();
    withTransaction(db, () => {
        db.run(
            `UPDATE grapheme_variants SET is_default = 0, updated_at = datetime('now') WHERE grapheme_id = ? AND is_default = 1`,
            [graphemeId],
        );
        db.run(
            `UPDATE grapheme_variants SET is_default = 1, updated_at = datetime('now') WHERE id = ?`,
            [variantId],
        );
        touchGrapheme(graphemeId);
    });
}

export interface VariantDeletionResult {
    deleted: boolean;
    /** Words whose `@<id>` pins were stripped (they now use the automatic variant). */
    affectedLexiconIds: number[];
}

/**
 * Delete a non-default variant. Every word pinning it is rewritten FIRST
 * (`handleVariantDeletion` strips the `@<id>` pins), then its glyph rows and
 * the variant go — all in one transaction.
 * @throws when the variant is the grapheme's default
 */
export function deleteVariant(id: number): VariantDeletionResult {
    const variant = getVariantById(id);
    if (!variant) {
        return { deleted: false, affectedLexiconIds: [] };
    }
    if (variant.is_default) {
        throw new Error('Cannot delete the default form of a grapheme. Make another form the default first.');
    }
    const db = getDatabase();
    return withTransaction(db, () => {
        const affectedLexiconIds = handleVariantDeletion(id);
        db.run('DELETE FROM grapheme_glyphs WHERE variant_id = ?', [id]);
        db.run('DELETE FROM grapheme_variants WHERE id = ?', [id]);
        const deleted = db.getRowsModified() > 0;
        touchGrapheme(variant.grapheme_id);
        return { deleted, affectedLexiconIds };
    });
}
