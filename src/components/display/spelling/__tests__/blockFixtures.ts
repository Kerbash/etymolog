/**
 * Shared fixtures for the block-rendering tests of the spelling display:
 * complete graphemes (with variants), spelling entries and a C1-V-C2 scheme.
 * Pure data — no DB. The DB-backed tests build their own through the API.
 */

import type { Glyph, GraphemeComplete, GraphemeVariantWithGlyphs, SpellingDisplayEntry, SpellingRole } from '../../../../db/types';
import type { BlockScheme } from '../../../../blocks';

export const TS = '2026-01-01 00:00:00';

/** A glyph whose path data names it, so tests can find it in an SVG string. */
export function glyph(id: number, tag = `glyph${id}`): Glyph {
    return {
        id,
        name: tag,
        svg_data: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${tag}"/></svg>`,
        category: null,
        notes: null,
        created_at: TS,
        updated_at: TS,
    };
}

function variant(
    id: number,
    graphemeId: number,
    glyphs: Glyph[],
    options: { isDefault?: boolean; groupId?: number | null; name?: string } = {},
): GraphemeVariantWithGlyphs {
    return {
        id,
        grapheme_id: graphemeId,
        group_id: options.groupId ?? null,
        name: options.name ?? (options.isDefault ? 'Default' : `v${id}`),
        is_default: options.isDefault ?? false,
        sort_order: 0,
        created_at: TS,
        updated_at: TS,
        glyphs,
    };
}

export interface GraphemeSpec {
    id: number;
    phoneme: string | null;
    glyphs: Glyph[];
    /** Extra (non-default) variants: [variantId, groupId, glyphs]. */
    extra?: [number, number | null, Glyph[]][];
    category?: string | null;
}

/**
 * A complete grapheme. Its default variant is id `id * 100`; `glyphs` is that
 * variant's glyph list (pitfall P3).
 */
export function grapheme(spec: GraphemeSpec): GraphemeComplete {
    return {
        id: spec.id,
        name: `G${spec.id}`,
        category: spec.category ?? null,
        notes: null,
        created_at: TS,
        updated_at: TS,
        glyphs: spec.glyphs,
        phonemes: spec.phoneme === null
            ? []
            : [{ id: spec.id, grapheme_id: spec.id, phoneme: spec.phoneme, use_in_auto_spelling: true, context: null }],
        variants: [
            variant(spec.id * 100, spec.id, spec.glyphs, { isDefault: true }),
            ...(spec.extra ?? []).map(([variantId, groupId, glyphs]) => variant(variantId, spec.id, glyphs, { groupId })),
        ],
    };
}

export function mapOf(...graphemes: GraphemeComplete[]): Map<number, GraphemeComplete> {
    return new Map(graphemes.map((g) => [g.id, g]));
}

/** A grapheme entry carrying only the grapheme ROW (as `buildSpellingDisplay` does). */
export function gEntry(g: GraphemeComplete, position: number, variantId?: number): SpellingDisplayEntry {
    const row = { id: g.id, name: g.name, category: g.category, notes: g.notes, created_at: g.created_at, updated_at: g.updated_at };
    return variantId === undefined
        ? { type: 'grapheme', position, grapheme: row }
        : { type: 'grapheme', position, grapheme: row, variantId };
}

export function ipa(char: string, position: number, role?: SpellingRole): SpellingDisplayEntry {
    return role ? { type: 'ipa', position, ipaCharacter: char, role } : { type: 'ipa', position, ipaCharacter: char };
}

/** Group ids the fixtures use. */
export const HEAD_GROUP = 7;

/**
 * k, a, t graphemes. k and t have a "head" (group 7) variant; a does not.
 */
export const K = grapheme({ id: 1, phoneme: 'k', glyphs: [glyph(11, 'k-default')], extra: [[150, HEAD_GROUP, [glyph(12, 'k-head')]]] });
export const A = grapheme({ id: 2, phoneme: 'a', glyphs: [glyph(21, 'a-default')] });
export const T = grapheme({ id: 3, phoneme: 't', glyphs: [glyph(31, 't-default'), glyph(32, 't-second')], extra: [[350, HEAD_GROUP, [glyph(33, 't-head')]]] });

/** C1 V C2 then C1 V; the onset slot draws the "head" group. */
export function cvcScheme(enabled = true): BlockScheme {
    return {
        version: 1,
        enabled,
        roles: [
            { id: 'C1', label: 'Onset', matcher: { kind: 'class', letter: 'C' } },
            { id: 'V', label: 'Nucleus', matcher: { kind: 'class', letter: 'V' } },
            { id: 'C2', label: 'Coda', matcher: { kind: 'class', letter: 'C' } },
        ],
        templates: [
            {
                id: 'cvc',
                name: 'CVC',
                pattern: ['C1', 'V', 'C2'],
                slots: [
                    { roleId: 'C1', groupId: HEAD_GROUP, x: 0, y: 0, w: 1, h: 0.5 },
                    { roleId: 'V', groupId: null, x: 0, y: 0.5, w: 0.5, h: 0.5 },
                    { roleId: 'C2', groupId: null, x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
                ],
            },
            {
                id: 'cv',
                name: 'CV',
                pattern: ['C1', 'V'],
                slots: [
                    { roleId: 'C1', groupId: HEAD_GROUP, x: 0, y: 0, w: 1, h: 0.5 },
                    { roleId: 'V', groupId: null, x: 0, y: 0.5, w: 1, h: 0.5 },
                ],
            },
        ],
    };
}
