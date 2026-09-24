/**
 * Grapheme variants + variant groups (schema v9) — service, API and spelling
 *
 * Real sql.js database, like every other db test. Covers the Phase-1 list in
 * `BLOCK_SCRIPT_PLAN.md`: the default variant a grapheme is born with,
 * `GraphemeComplete.glyphs` keeping its meaning, the re-keyed UNIQUE that lets
 * a second form reuse a glyph at the same position, one-form-per-group, group
 * deletion ungrouping, the refusal to delete a default, the atomic default
 * swap, and pin stripping when a form is deleted.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase, getDatabase } from '../database';
import { createGlyph, forceDeleteGlyph } from '../glyphService';
import {
    createGrapheme,
    deleteGrapheme,
    getAllGraphemesComplete,
    getAllGraphemesWithGlyphs,
    getGraphemeComplete,
    getGraphemeWithGlyphs,
    getGlyphsByGraphemeId,
    getGraphemeGlyphEntries,
    addGlyphToGrapheme,
    removeGlyphFromGrapheme,
    reorderGraphemeGlyphs,
    setGraphemeGlyphs,
} from '../graphemeService';
import {
    DEFAULT_VARIANT_NAME,
    createVariant,
    createVariantGroup,
    deleteVariant,
    deleteVariantGroup,
    getAllVariantGroups,
    getDefaultVariantId,
    getVariantById,
    getVariantGroupUsageCount,
    getVariantPinUsageCount,
    getVariantsByGraphemeId,
    loadVariantsByGrapheme,
    setDefaultVariant,
    setVariantGlyphs,
    updateVariant,
    updateVariantGroup,
} from '../variantService';
import { createLexicon, getLexiconById, getLexiconComplete, getLexiconSpellingEntries } from '../lexiconService';
import { variantApi, variantGroupApi } from '../api/variantApi';
import { graphemeApi } from '../api/graphemeApi';
import { createGraphemeEntry, deserializeGlyphOrder } from '../utils/spellingUtils';
import type { Glyph } from '../types';

function glyph(name: string): Glyph {
    return createGlyph({ name, svg_data: `<svg data-name="${name}"/>` });
}

function count(sql: string, params: (string | number)[] = []): number {
    return getDatabase().exec(sql, params)[0]?.values[0]?.[0] as number;
}

/** Grapheme "A" whose default form is [g1, g2]. */
function makeGrapheme(name = 'A') {
    const g1 = glyph(`${name}-1`);
    const g2 = glyph(`${name}-2`);
    const grapheme = createGrapheme({
        name,
        glyphs: [{ glyph_id: g1.id, position: 0 }, { glyph_id: g2.id, position: 1 }],
        phonemes: [{ phoneme: name.toLowerCase(), use_in_auto_spelling: true }],
    });
    return { grapheme, g1, g2 };
}

describe('grapheme variants', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    // =========================================================================
    // The default variant
    // =========================================================================

    describe('the default variant', () => {
        it('createGrapheme gives the grapheme exactly one default variant holding its glyphs', () => {
            const { grapheme, g1, g2 } = makeGrapheme();
            expect(grapheme.variants).toHaveLength(1);
            const [only] = grapheme.variants!;
            expect(only.is_default).toBe(true);
            expect(only.name).toBe(DEFAULT_VARIANT_NAME);
            expect(only.group_id).toBeNull();
            expect(only.glyphs.map(g => g.id)).toEqual([g1.id, g2.id]);
            expect(getDefaultVariantId(grapheme.id)).toBe(only.id);
        });

        it('GraphemeComplete.glyphs keeps meaning "the default variant\'s glyphs"', () => {
            const { grapheme, g1, g2 } = makeGrapheme();
            const alt = glyph('alt');
            createVariant(grapheme.id, { name: 'Alt', glyphs: [{ glyph_id: alt.id, position: 0 }] });

            const complete = getGraphemeComplete(grapheme.id)!;
            expect(complete.glyphs.map(g => g.id)).toEqual([g1.id, g2.id]);
            expect(complete.variants!.map(v => v.name)).toEqual([DEFAULT_VARIANT_NAME, 'Alt']);
            expect(complete.variants![0].is_default).toBe(true);
            expect(getGlyphsByGraphemeId(grapheme.id).map(g => g.id)).toEqual([g1.id, g2.id]);
            expect(getGraphemeWithGlyphs(grapheme.id)!.glyphs.map(g => g.id)).toEqual([g1.id, g2.id]);
        });

        it('every glyph row carries its variant id and its grapheme id', () => {
            const { grapheme } = makeGrapheme();
            const entries = getGraphemeGlyphEntries(grapheme.id);
            expect(entries).toHaveLength(2);
            for (const entry of entries) {
                expect(entry.variant_id).toBe(getDefaultVariantId(grapheme.id));
                expect(entry.grapheme_id).toBe(grapheme.id);
            }
        });

        it('the bulk loaders populate variants and derive glyphs from the default', () => {
            const { grapheme, g1, g2 } = makeGrapheme();
            const alt = glyph('alt');
            createVariant(grapheme.id, { name: 'Alt', glyphs: [{ glyph_id: alt.id, position: 0 }] });
            makeGrapheme('B');

            const all = getAllGraphemesComplete();
            const a = all.find(g => g.id === grapheme.id)!;
            expect(a.glyphs.map(g => g.id)).toEqual([g1.id, g2.id]);
            expect(a.variants!.map(v => v.glyphs.map(g => g.id))).toEqual([[g1.id, g2.id], [alt.id]]);
            expect(all.every(g => g.variants!.filter(v => v.is_default).length === 1)).toBe(true);

            const withGlyphs = getAllGraphemesWithGlyphs().find(g => g.id === grapheme.id)!;
            expect(withGlyphs.glyphs.map(g => g.id)).toEqual([g1.id, g2.id]);
            expect(withGlyphs.variants).toHaveLength(2);

            expect(loadVariantsByGrapheme().get(grapheme.id)!.map(v => v.name)).toEqual([DEFAULT_VARIANT_NAME, 'Alt']);
        });

        it('deleteGrapheme removes its variants and every glyph row', () => {
            const { grapheme } = makeGrapheme();
            const alt = glyph('alt');
            createVariant(grapheme.id, { name: 'Alt', glyphs: [{ glyph_id: alt.id, position: 0 }] });
            expect(deleteGrapheme(grapheme.id)).toBe(true);
            expect(count('SELECT COUNT(*) FROM grapheme_variants WHERE grapheme_id = ?', [grapheme.id])).toBe(0);
            expect(count('SELECT COUNT(*) FROM grapheme_glyphs WHERE grapheme_id = ?', [grapheme.id])).toBe(0);
        });
    });

    // =========================================================================
    // Additional variants
    // =========================================================================

    describe('additional variants', () => {
        it('a second variant in group "head" may reuse the SAME glyph at position 0 (the re-keyed UNIQUE)', () => {
            const { grapheme, g1 } = makeGrapheme();
            const head = createVariantGroup({ name: 'head' });
            const variant = createVariant(grapheme.id, {
                name: 'Head form',
                group_id: head.id,
                glyphs: [{ glyph_id: g1.id, position: 0 }],
            });
            expect(variant.group_id).toBe(head.id);
            expect(variant.is_default).toBe(false);
            expect(variant.glyphs.map(g => g.id)).toEqual([g1.id]);
            // Two rows now share (grapheme, glyph, position) — impossible pre-v9.
            expect(count(
                'SELECT COUNT(*) FROM grapheme_glyphs WHERE grapheme_id = ? AND glyph_id = ? AND position = 0',
                [grapheme.id, g1.id],
            )).toBe(2);
        });

        it('createGrapheme routes input.variants to new non-default rows, in order', () => {
            const g1 = glyph('g1');
            const g2 = glyph('g2');
            const head = createVariantGroup({ name: 'head' });
            const body = createVariantGroup({ name: 'body' });
            const grapheme = createGrapheme({
                name: 'K',
                glyphs: [{ glyph_id: g1.id, position: 0 }],
                variants: [
                    { name: 'Head', group_id: head.id, glyphs: [{ glyph_id: g1.id, position: 0 }] },
                    { name: 'Body', group_id: body.id, glyphs: [{ glyph_id: g2.id, position: 0 }, { glyph_id: g1.id, position: 1 }] },
                ],
            });
            expect(grapheme.variants!.map(v => [v.name, v.is_default, v.group_id])).toEqual([
                [DEFAULT_VARIANT_NAME, true, null],
                ['Head', false, head.id],
                ['Body', false, body.id],
            ]);
            expect(grapheme.variants![2].glyphs.map(g => g.id)).toEqual([g2.id, g1.id]);
            expect(grapheme.glyphs.map(g => g.id)).toEqual([g1.id]);
        });

        it('createGrapheme with an invalid variant creates NOTHING', () => {
            const g1 = glyph('g1');
            const head = createVariantGroup({ name: 'head' });
            const before = count('SELECT COUNT(*) FROM graphemes');
            expect(() => createGrapheme({
                name: 'K',
                glyphs: [{ glyph_id: g1.id, position: 0 }],
                variants: [
                    { name: 'One', group_id: head.id, glyphs: [{ glyph_id: g1.id, position: 0 }] },
                    { name: 'Two', group_id: head.id, glyphs: [{ glyph_id: g1.id, position: 0 }] },
                ],
            })).toThrow(/at most one form per group/);
            expect(() => createGrapheme({
                name: 'K',
                glyphs: [{ glyph_id: g1.id, position: 0 }],
                variants: [{ name: 'Empty', glyphs: [] }],
            })).toThrow(/At least one glyph/);
            expect(count('SELECT COUNT(*) FROM graphemes')).toBe(before);
            expect(count('SELECT COUNT(*) FROM grapheme_variants')).toBe(0);
        });

        it('variants list default first, then by sort_order', () => {
            const { grapheme, g1 } = makeGrapheme();
            createVariant(grapheme.id, { name: 'Late', sort_order: 9, glyphs: [{ glyph_id: g1.id, position: 0 }] });
            createVariant(grapheme.id, { name: 'Early', sort_order: 2, glyphs: [{ glyph_id: g1.id, position: 0 }] });
            expect(getVariantsByGraphemeId(grapheme.id).map(v => v.name)).toEqual([DEFAULT_VARIANT_NAME, 'Early', 'Late']);
        });

        it('createVariant validates: glyphs ≥ 1, known grapheme, known group, non-empty name', () => {
            const { grapheme, g1 } = makeGrapheme();
            expect(() => createVariant(grapheme.id, { name: 'X', glyphs: [] })).toThrow(/At least one glyph/);
            expect(() => createVariant(9999, { name: 'X', glyphs: [{ glyph_id: g1.id, position: 0 }] })).toThrow(/not found/);
            expect(() => createVariant(grapheme.id, { name: 'X', group_id: 404, glyphs: [{ glyph_id: g1.id, position: 0 }] }))
                .toThrow(/does not exist/);
            expect(() => createVariant(grapheme.id, { name: '   ', glyphs: [{ glyph_id: g1.id, position: 0 }] }))
                .toThrow(/name is required/);
            expect(getVariantsByGraphemeId(grapheme.id)).toHaveLength(1);
        });

        it('setVariantGlyphs replaces only that variant\'s glyphs and refuses an empty list', () => {
            const { grapheme, g1, g2 } = makeGrapheme();
            const alt = createVariant(grapheme.id, { name: 'Alt', glyphs: [{ glyph_id: g1.id, position: 0 }] });
            setVariantGlyphs(alt.id, [{ glyph_id: g2.id, position: 0 }, { glyph_id: g2.id, position: 1 }]);
            const variants = getVariantsByGraphemeId(grapheme.id);
            expect(variants[1].glyphs.map(g => g.id)).toEqual([g2.id, g2.id]);
            expect(variants[0].glyphs.map(g => g.id)).toEqual([g1.id, g2.id]);
            expect(() => setVariantGlyphs(alt.id, [])).toThrow(/At least one glyph/);
            expect(getVariantsByGraphemeId(grapheme.id)[1].glyphs).toHaveLength(2);
        });

        it('updateVariant renames and regroups; an occupied group is a clean error', () => {
            const { grapheme, g1 } = makeGrapheme();
            const head = createVariantGroup({ name: 'head' });
            const tail = createVariantGroup({ name: 'tail' });
            const a = createVariant(grapheme.id, { name: 'A', group_id: head.id, glyphs: [{ glyph_id: g1.id, position: 0 }] });
            const b = createVariant(grapheme.id, { name: 'B', glyphs: [{ glyph_id: g1.id, position: 0 }] });

            expect(updateVariant(b.id, { name: 'Bee', group_id: tail.id })).toMatchObject({ name: 'Bee', group_id: tail.id });
            expect(() => updateVariant(b.id, { group_id: head.id })).toThrow(/already has a form in the "head" group/);
            // Re-assigning a variant to its OWN group is not a clash.
            expect(updateVariant(a.id, { group_id: head.id })!.group_id).toBe(head.id);
            expect(updateVariant(b.id, { group_id: null })!.group_id).toBeNull();
            expect(updateVariant(123456, { name: 'nope' })).toBeNull();
        });

        it('one variant per (grapheme, group) — but different graphemes may share a group', () => {
            const a = makeGrapheme('A');
            const b = makeGrapheme('B');
            const head = createVariantGroup({ name: 'head' });
            createVariant(a.grapheme.id, { name: 'Head', group_id: head.id, glyphs: [{ glyph_id: a.g1.id, position: 0 }] });
            expect(() => createVariant(a.grapheme.id, { name: 'Head 2', group_id: head.id, glyphs: [{ glyph_id: a.g2.id, position: 0 }] }))
                .toThrow(/at most one form per group/);
            expect(() => createVariant(b.grapheme.id, { name: 'Head', group_id: head.id, glyphs: [{ glyph_id: b.g1.id, position: 0 }] }))
                .not.toThrow();
            expect(getVariantGroupUsageCount(head.id)).toBe(2);
        });
    });

    // =========================================================================
    // Default swap + deletion
    // =========================================================================

    describe('setDefaultVariant', () => {
        it('swaps the default atomically: exactly one default, and glyphs follow it', () => {
            const { grapheme, g1, g2 } = makeGrapheme();
            const alt = glyph('alt');
            const variant = createVariant(grapheme.id, { name: 'Alt', glyphs: [{ glyph_id: alt.id, position: 0 }] });
            const oldDefault = getDefaultVariantId(grapheme.id)!;

            setDefaultVariant(grapheme.id, variant.id);

            expect(count('SELECT COUNT(*) FROM grapheme_variants WHERE grapheme_id = ? AND is_default = 1', [grapheme.id])).toBe(1);
            expect(getDefaultVariantId(grapheme.id)).toBe(variant.id);
            expect(getVariantById(oldDefault)!.is_default).toBe(false);
            const complete = getGraphemeComplete(grapheme.id)!;
            expect(complete.glyphs.map(g => g.id)).toEqual([alt.id]);
            expect(complete.variants![0].id).toBe(variant.id);
            expect(complete.variants![1].glyphs.map(g => g.id)).toEqual([g1.id, g2.id]);
        });

        it('refuses a variant of another grapheme and changes nothing', () => {
            const a = makeGrapheme('A');
            const b = makeGrapheme('B');
            const bDefault = getDefaultVariantId(b.grapheme.id)!;
            const aDefault = getDefaultVariantId(a.grapheme.id)!;
            expect(() => setDefaultVariant(a.grapheme.id, bDefault)).toThrow(/does not belong/);
            expect(getDefaultVariantId(a.grapheme.id)).toBe(aDefault);
            expect(getDefaultVariantId(b.grapheme.id)).toBe(bDefault);
        });

        it('is a no-op on the current default', () => {
            const { grapheme } = makeGrapheme();
            const current = getDefaultVariantId(grapheme.id)!;
            expect(() => setDefaultVariant(grapheme.id, current)).not.toThrow();
            expect(getDefaultVariantId(grapheme.id)).toBe(current);
        });
    });

    describe('deleteVariant', () => {
        it('refuses the default variant', () => {
            const { grapheme } = makeGrapheme();
            expect(() => deleteVariant(getDefaultVariantId(grapheme.id)!)).toThrow(/Cannot delete the default form/);
            expect(getVariantsByGraphemeId(grapheme.id)).toHaveLength(1);
        });

        it('strips ITS pins from every word first (other pins and entries untouched), then deletes it', () => {
            const { grapheme, g1 } = makeGrapheme();
            const gone = createVariant(grapheme.id, { name: 'Gone', glyphs: [{ glyph_id: g1.id, position: 0 }] });
            const kept = createVariant(grapheme.id, { name: 'Kept', glyphs: [{ glyph_id: g1.id, position: 0 }] });
            const pinning = createLexicon({
                lemma: 'pinning',
                auto_spell: false,
                glyph_order: [createGraphemeEntry(grapheme.id, gone.id), 'ə', createGraphemeEntry(grapheme.id, kept.id)],
            });
            const other = createLexicon({ lemma: 'other', auto_spell: false, glyph_order: [createGraphemeEntry(grapheme.id, kept.id)] });
            expect(getVariantPinUsageCount(gone.id)).toBe(1);

            const result = deleteVariant(gone.id);

            expect(result).toEqual({ deleted: true, affectedLexiconIds: [pinning.id] });
            expect(getVariantById(gone.id)).toBeNull();
            expect(deserializeGlyphOrder(getLexiconById(pinning.id)!.glyph_order)).toEqual([
                createGraphemeEntry(grapheme.id), 'ə', createGraphemeEntry(grapheme.id, kept.id),
            ]);
            expect(getLexiconById(pinning.id)!.needs_attention).toBe(false);
            expect(deserializeGlyphOrder(getLexiconById(other.id)!.glyph_order)).toEqual([createGraphemeEntry(grapheme.id, kept.id)]);
            // The derived index still has both grapheme occurrences at their positions.
            expect(getLexiconSpellingEntries(pinning.id).map(e => [e.grapheme_id, e.position])).toEqual([
                [grapheme.id, 0], [grapheme.id, 2],
            ]);
            expect(count('SELECT COUNT(*) FROM grapheme_glyphs WHERE variant_id = ?', [gone.id])).toBe(0);
        });

        it('the LIKE prefilter cannot confuse @3 with @34 (candidates are re-parsed)', () => {
            const { grapheme, g1 } = makeGrapheme();
            // Burn ids so one variant id is a prefix of another.
            const variants = Array.from({ length: 25 }, (_, i) =>
                createVariant(grapheme.id, { name: `v${i}`, glyphs: [{ glyph_id: g1.id, position: 0 }] }));
            const prefixOf = (a: number, b: number) => a !== b && String(b).startsWith(String(a));
            const short = variants.find(v => variants.some(w => prefixOf(v.id, w.id)))!;
            const long = variants.find(w => prefixOf(short.id, w.id))!;
            expect(short).toBeDefined();
            expect(long).toBeDefined();
            const word = createLexicon({ lemma: 'w', auto_spell: false, glyph_order: [createGraphemeEntry(grapheme.id, long.id)] });

            expect(deleteVariant(short.id).affectedLexiconIds).toEqual([]);
            expect(deserializeGlyphOrder(getLexiconById(word.id)!.glyph_order)).toEqual([createGraphemeEntry(grapheme.id, long.id)]);
        });

        it('an unknown id reports deleted: false', () => {
            expect(deleteVariant(424242)).toEqual({ deleted: false, affectedLexiconIds: [] });
        });
    });

    // =========================================================================
    // Variant groups
    // =========================================================================

    describe('variant groups', () => {
        it('creates in order, lists by sort_order, renames and reorders', () => {
            const head = createVariantGroup({ name: 'head' });
            const body = createVariantGroup({ name: 'body' });
            expect(getAllVariantGroups().map(g => g.name)).toEqual(['head', 'body']);
            expect(body.sort_order).toBe(head.sort_order + 1);
            updateVariantGroup(body.id, { sort_order: -1 });
            expect(getAllVariantGroups().map(g => g.name)).toEqual(['body', 'head']);
            expect(updateVariantGroup(head.id, { name: 'Head' })!.name).toBe('Head');
            expect(updateVariantGroup(999, { name: 'x' })).toBeNull();
        });

        it('rejects empty and duplicate (case-insensitive) names', () => {
            createVariantGroup({ name: 'head' });
            expect(() => createVariantGroup({ name: '  ' })).toThrow(/required/);
            expect(() => createVariantGroup({ name: ' HEAD ' })).toThrow(/already exists/);
            const other = createVariantGroup({ name: 'body' });
            expect(() => updateVariantGroup(other.id, { name: 'Head' })).toThrow(/already exists/);
        });

        it('deleting a group keeps its variants, ungrouped, and reports how many', () => {
            const a = makeGrapheme('A');
            const b = makeGrapheme('B');
            const head = createVariantGroup({ name: 'head' });
            const va = createVariant(a.grapheme.id, { name: 'H', group_id: head.id, glyphs: [{ glyph_id: a.g1.id, position: 0 }] });
            const vb = createVariant(b.grapheme.id, { name: 'H', group_id: head.id, glyphs: [{ glyph_id: b.g1.id, position: 0 }] });

            expect(deleteVariantGroup(head.id)).toEqual({ deleted: true, variantsDetached: 2 });
            expect(getVariantById(va.id)!.group_id).toBeNull();
            expect(getVariantById(vb.id)!.group_id).toBeNull();
            expect(getAllVariantGroups()).toEqual([]);
            expect(deleteVariantGroup(head.id)).toEqual({ deleted: false, variantsDetached: 0 });
        });
    });

    // =========================================================================
    // graphemeService glyph writers act on the DEFAULT variant
    // =========================================================================

    describe('glyph writers target the default variant', () => {
        function setup() {
            const base = makeGrapheme();
            const alt = createVariant(base.grapheme.id, { name: 'Alt', glyphs: [{ glyph_id: base.g1.id, position: 0 }] });
            const altGlyphs = () => getVariantsByGraphemeId(base.grapheme.id).find(v => v.id === alt.id)!.glyphs.map(g => g.id);
            return { ...base, alt, altGlyphs };
        }

        it('addGlyphToGrapheme adds to the default only (or to an explicit variant)', () => {
            const { grapheme, g1, g2, alt, altGlyphs } = setup();
            const extra = glyph('extra');
            const row = addGlyphToGrapheme(grapheme.id, { glyph_id: extra.id, position: 2 });
            expect(row.variant_id).toBe(getDefaultVariantId(grapheme.id));
            expect(getGlyphsByGraphemeId(grapheme.id).map(g => g.id)).toEqual([g1.id, g2.id, extra.id]);
            expect(altGlyphs()).toEqual([g1.id]);

            addGlyphToGrapheme(grapheme.id, { glyph_id: extra.id, position: 1 }, alt.id);
            expect(altGlyphs()).toEqual([g1.id, extra.id]);
        });

        it('setGraphemeGlyphs replaces the default only', () => {
            const { grapheme, g2, g1, altGlyphs } = setup();
            setGraphemeGlyphs(grapheme.id, [{ glyph_id: g2.id, position: 0 }]);
            expect(getGlyphsByGraphemeId(grapheme.id).map(g => g.id)).toEqual([g2.id]);
            expect(altGlyphs()).toEqual([g1.id]);
        });

        it('reorderGraphemeGlyphs reorders the default only', () => {
            const { grapheme, g1, g2, altGlyphs } = setup();
            reorderGraphemeGlyphs(grapheme.id, [g2.id, g1.id]);
            expect(getGlyphsByGraphemeId(grapheme.id).map(g => g.id)).toEqual([g2.id, g1.id]);
            expect(altGlyphs()).toEqual([g1.id]);
        });

        it('removeGlyphFromGrapheme removes from the default and guards its last glyph', () => {
            const { grapheme, g1, g2, alt, altGlyphs } = setup();
            expect(removeGlyphFromGrapheme(grapheme.id, g1.id)).toBe(true);
            expect(getGlyphsByGraphemeId(grapheme.id).map(g => g.id)).toEqual([g2.id]);
            expect(altGlyphs()).toEqual([g1.id]);
            expect(() => removeGlyphFromGrapheme(grapheme.id, g2.id)).toThrow(/last glyph/);
            // The alt variant's only glyph is guarded too.
            expect(() => removeGlyphFromGrapheme(grapheme.id, g1.id, alt.id)).toThrow(/last glyph/);
            expect(removeGlyphFromGrapheme(9999, g1.id)).toBe(false);
        });

        it('an explicit variant of ANOTHER grapheme is refused', () => {
            const { grapheme, g1 } = setup();
            const other = makeGrapheme('B');
            const foreign = getDefaultVariantId(other.grapheme.id)!;
            expect(() => addGlyphToGrapheme(grapheme.id, { glyph_id: g1.id, position: 5 }, foreign)).toThrow(/does not belong/);
            expect(() => setGraphemeGlyphs(grapheme.id, [{ glyph_id: g1.id, position: 0 }], foreign)).toThrow(/does not belong/);
        });

        it('forceDeleteGlyph deletes a non-default variant made only of that glyph, but protects the default', () => {
            const { grapheme, g1, g2, alt } = setup();
            // alt = [g1] only → deleted with g1; default [g1, g2] keeps g2.
            expect(forceDeleteGlyph(g1.id)).toBe(true);
            expect(getVariantById(alt.id)).toBeNull();
            expect(getGlyphsByGraphemeId(grapheme.id).map(g => g.id)).toEqual([g2.id]);
            // Now g2 is the default's only glyph → refused.
            expect(() => forceDeleteGlyph(g2.id)).toThrow(/only glyph/);
        });
    });

    // =========================================================================
    // Spelling display carries pins
    // =========================================================================

    describe('pinned spellings', () => {
        it('buildSpellingDisplay passes the pinned variant id through (and only when pinned)', () => {
            const { grapheme, g1 } = makeGrapheme();
            const alt = createVariant(grapheme.id, { name: 'Alt', glyphs: [{ glyph_id: g1.id, position: 0 }] });
            const word = createLexicon({
                lemma: 'w',
                auto_spell: false,
                glyph_order: [createGraphemeEntry(grapheme.id, alt.id), createGraphemeEntry(grapheme.id)],
            });
            const display = getLexiconComplete(word.id)!.spellingDisplay;
            expect(display[0]).toMatchObject({ type: 'grapheme', position: 0, variantId: alt.id });
            expect(display[0].grapheme!.id).toBe(grapheme.id);
            expect('variantId' in display[1]).toBe(false);
            expect(getLexiconComplete(word.id)!.hasIpaFallbacks).toBe(false);
        });

        it('a pinned entry indexes its grapheme in lexicon_spelling like an unpinned one', () => {
            const { grapheme, g1 } = makeGrapheme();
            const alt = createVariant(grapheme.id, { name: 'Alt', glyphs: [{ glyph_id: g1.id, position: 0 }] });
            const word = createLexicon({ lemma: 'w', auto_spell: false, glyph_order: ['ə', createGraphemeEntry(grapheme.id, alt.id)] });
            expect(getLexiconSpellingEntries(word.id).map(e => [e.grapheme_id, e.position])).toEqual([[grapheme.id, 1]]);
        });
    });
});

// =============================================================================
// API layer
// =============================================================================

describe('variant API', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    it('variantGroup.* wraps the service in the ApiResponse envelope', () => {
        const created = variantGroupApi.create({ name: 'head' });
        expect(created.success).toBe(true);
        expect(variantGroupApi.create({ name: '' }).error?.code).toBe('VALIDATION_ERROR');
        expect(variantGroupApi.create({ name: 'HEAD' }).error?.code).toBe('OPERATION_FAILED');
        expect(variantGroupApi.getAll().data).toMatchObject({ total: 1, groups: [{ name: 'head' }] });
        expect(variantGroupApi.update(created.data!.id, { name: 'Head' }).data?.name).toBe('Head');
        expect(variantGroupApi.update(999, { name: 'x' }).error?.code).toBe('NOT_FOUND');
        expect(variantGroupApi.getUsageCount(created.data!.id).data).toBe(0);
        expect(variantGroupApi.delete(created.data!.id).data).toEqual({ variantsDetached: 0 });
        expect(variantGroupApi.delete(created.data!.id).error?.code).toBe('NOT_FOUND');
    });

    it('grapheme.create accepts variants; variant.* covers the lifecycle', () => {
        const g1 = glyph('g1');
        const g2 = glyph('g2');
        const head = variantGroupApi.create({ name: 'head' }).data!;
        const created = graphemeApi.create({
            name: 'K',
            glyphs: [{ glyph_id: g1.id, position: 0 }],
            variants: [{ name: ' Head ', group_id: head.id, glyphs: [{ glyph_id: g1.id, position: 0 }] }],
        });
        expect(created.success).toBe(true);
        const graphemeId = created.data!.id;
        expect(created.data!.variants!.map(v => v.name)).toEqual([DEFAULT_VARIANT_NAME, 'Head']);

        const listed = variantApi.getByGrapheme(graphemeId);
        expect(listed.data).toHaveLength(2);
        expect(variantApi.getByGrapheme(9999).error?.code).toBe('NOT_FOUND');

        const alt = variantApi.create(graphemeId, { name: 'Alt', glyphs: [{ glyph_id: g2.id, position: 0 }] });
        expect(alt.success).toBe(true);
        expect(variantApi.create(graphemeId, { name: 'X', glyphs: [] }).error?.code).toBe('VALIDATION_ERROR');
        expect(variantApi.create(graphemeId, { name: 'Dup', group_id: head.id, glyphs: [{ glyph_id: g2.id, position: 0 }] }).error?.message)
            .toMatch(/at most one form per group/);
        expect(variantApi.create(9999, { name: 'X', glyphs: [{ glyph_id: g2.id, position: 0 }] }).error?.code).toBe('NOT_FOUND');

        expect(variantApi.update(alt.data!.id, { name: 'Alt 2' }).data?.name).toBe('Alt 2');
        expect(variantApi.update(alt.data!.id, { name: ' ' }).error?.code).toBe('VALIDATION_ERROR');
        expect(variantApi.setGlyphs(alt.data!.id, [{ glyph_id: g1.id, position: 0 }]).success).toBe(true);
        expect(variantApi.setGlyphs(alt.data!.id, []).error?.code).toBe('VALIDATION_ERROR');
        expect(variantApi.setGlyphs(9999, [{ glyph_id: g1.id, position: 0 }]).error?.code).toBe('NOT_FOUND');

        const defaultId = listed.data![0].id;
        expect(variantApi.delete(defaultId).error?.code).toBe('CONSTRAINT_VIOLATION');
        expect(variantApi.setDefault(graphemeId, alt.data!.id).success).toBe(true);
        expect(variantApi.getPinUsageCount(defaultId).data).toBe(0);
        expect(variantApi.delete(defaultId).data).toEqual({ affectedLexiconIds: [] });
        expect(variantApi.getByGrapheme(graphemeId).data!.map(v => v.name)).toEqual(['Alt 2', 'Head']);
    });
});
