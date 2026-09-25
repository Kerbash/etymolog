/**
 * composeBlock / pickVariant / variantSvg / blockKey — BLOCK_SCRIPT_PLAN.md §3.3.
 */

import { describe, expect, it } from 'vitest';
import { combineSvgRow, nestSvg, textSvg } from '../../db/utils/svgCompose';
import { generateVirtualGlyphId } from '../../db/utils/virtualGlyph';
import { blockKey, composeBlock, composeLoneConsonant, pickVariant, variantSvg } from '../compose';
import { segmentEntries } from '../segment';
import { LONE_CONSONANT_TEMPLATE_ID } from '../validate';
import { GLYPH_GUIDE_INSET } from '../../db/utils/glyphMetrics';
import type { BlockGraphemeInfo, BlockLeftovers, BlockSegment } from '../types';
import { fakeGrapheme, gEntry, indexOf, ipaEntry, markGrapheme, roles, scheme, svg, template } from './fixtures';

const HEAD = 7; // variant group "head"
const TAIL = 8; // variant group "tail"

const withVariants: BlockGraphemeInfo = fakeGrapheme(1, 'k', {
    glyphs: [svg('k-default')],
    variants: [
        { id: 10, group_id: null, is_default: true, glyphs: [{ svg_data: svg('k-default') }] },
        { id: 11, group_id: HEAD, is_default: false, glyphs: [{ svg_data: svg('k-head') }] },
        { id: 12, group_id: TAIL, is_default: false, glyphs: [{ svg_data: svg('k-tail-1', '0 0 48 48') }, { svg_data: svg('k-tail-2') }] },
    ],
});
const plainVowel = fakeGrapheme(2, 'a', { glyphs: [svg('a')] });

const index = indexOf(withVariants, plainVowel);

describe('pickVariant', () => {
    it('picks the variant in the requested group', () => {
        expect(pickVariant(withVariants, HEAD)).toEqual({ variantId: 11, glyphs: [{ svg_data: svg('k-head') }], missingGroup: false });
    });

    it('groupId null → the default variant, no missing flag', () => {
        expect(pickVariant(withVariants, null)).toMatchObject({ variantId: 10, missingGroup: false });
    });

    it('a group the grapheme has no variant in → default + missingGroup', () => {
        expect(pickVariant(withVariants, 99)).toMatchObject({ variantId: 10, missingGroup: true });
    });

    it('variants absent ⇒ default only, drawn from grapheme.glyphs (P5)', () => {
        expect(pickVariant(plainVowel, null)).toEqual({ variantId: null, glyphs: plainVowel.glyphs, missingGroup: false });
        expect(pickVariant(plainVowel, HEAD)).toEqual({ variantId: null, glyphs: plainVowel.glyphs, missingGroup: true });
    });

    it('an existing pin beats the group, and is never "missing"', () => {
        expect(pickVariant(withVariants, HEAD, 12)).toMatchObject({ variantId: 12, missingGroup: false });
        expect(pickVariant(withVariants, 99, 11)).toMatchObject({ variantId: 11, missingGroup: false });
    });

    it('a stale pin (deleted variant) is ignored', () => {
        expect(pickVariant(withVariants, HEAD, 404)).toMatchObject({ variantId: 11 });
        expect(pickVariant(withVariants, null, 404)).toMatchObject({ variantId: 10 });
    });

    it('variants present but none default (broken invariant) → grapheme.glyphs', () => {
        const broken = { ...withVariants, variants: withVariants.variants!.filter((v) => !v.is_default) };
        expect(pickVariant(broken, 99)).toEqual({ variantId: null, glyphs: broken.glyphs, missingGroup: true });
    });
});

describe('variantSvg', () => {
    it('none → empty, one → unchanged, several → a combined row', () => {
        expect(variantSvg([])).toBe('');
        expect(variantSvg([{ svg_data: svg('x') }])).toBe(svg('x'));
        expect(variantSvg([{ svg_data: svg('x') }, { svg_data: svg('y') }])).toBe(combineSvgRow([svg('x'), svg('y')]));
    });

    it('skips glyphs with no svg data', () => {
        expect(variantSvg([{ svg_data: '' }, { svg_data: svg('x') }])).toBe(svg('x'));
    });
});

describe('composeBlock', () => {
    const CV = { ...template('CV', ['C1', 'V']), slots: [
        { roleId: 'C1', groupId: HEAD, x: 0, y: 0, w: 0.5, h: 1 },
        { roleId: 'V', groupId: null, x: 0.5, y: 0.25, w: 0.5, h: 0.75 },
    ] };
    const s = scheme([roles.C1, roles.V], [CV]);
    const segment: BlockSegment = { kind: 'block', templateId: 'CV', entryIndices: [0, 1] };

    it('outputs one svg with viewBox 0 0 100 100 and nested cells at rect × 100', () => {
        const composed = composeBlock(segment, [gEntry(1, 0), gEntry(2, 1)], s, index);
        expect(composed.svg).toBe(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            + nestSvg(svg('k-head'), { x: 0, y: 0, w: 50, h: 100 })
            + nestSvg(svg('a'), { x: 50, y: 25, w: 50, h: 75 })
            + '</svg>',
        );
        expect(composed.svg).toContain('<svg x="50" y="25" width="50" height="75" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">');
        expect(composed).toMatchObject({ templateId: 'CV', entryIndices: [0, 1], containsVirtual: false });
    });

    it('fits a drawn sign\'s INK into its slot, not its square editor canvas', () => {
        // A wide head form drawn across the 300 × 300 glyph canvas.
        const wideHead = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><path d="M 40 140 L 260 140 L 260 160 L 40 160 Z"></path></svg>';
        const drawn = fakeGrapheme(3, 'p', {
            glyphs: [svg('p-default')],
            variants: [
                { id: 30, group_id: null, is_default: true, glyphs: [{ svg_data: svg('p-default') }] },
                { id: 31, group_id: HEAD, is_default: false, glyphs: [{ svg_data: wideHead }] },
            ],
        });
        const composed = composeBlock(segment, [gEntry(3, 0), gEntry(2, 1)], s, indexOf(drawn, plainVowel));
        // The slot (x 0, w 0.5, full height) mapped into the glyph cell — the
        // middle half of the box — so fitted ink never reaches the margins
        // neighbouring glyphs overlap.
        const cell = composed.svg.match(/<svg x="25" y="25" width="25" height="50" viewBox="([^"]+)"/);
        expect(cell).not.toBeNull();
        expect(cell![1]).not.toBe('0 0 300 300');
        const [, , w, h] = cell![1].split(' ').map(Number);
        expect(w / h).toBeGreaterThan(5);
    });

    it('reports every slot in pattern order: role, entry, chosen variant, missing flag', () => {
        const composed = composeBlock(segment, [gEntry(1, 0), gEntry(2, 1)], s, index);
        expect(composed.slots).toEqual([
            { roleId: 'C1', entryIndex: 0, variantId: 11, missingGroup: false, entryKey: 'grapheme-1' },
            { roleId: 'V', entryIndex: 1, variantId: null, missingGroup: false, entryKey: 'grapheme-2' },
        ]);
    });

    it('falls back to the default variant with missingGroup when the group is absent', () => {
        const other = scheme([roles.C1, roles.V], [{ ...CV, slots: [{ ...CV.slots[0], groupId: 99 }, CV.slots[1]] }]);
        const composed = composeBlock(segment, [gEntry(1), gEntry(2)], other, index);
        expect(composed.slots[0]).toMatchObject({ variantId: 10, missingGroup: true });
        expect(composed.svg).toContain('k-default');
        expect(composed.svg).not.toContain('k-head');
    });

    it('combines a multi-glyph variant into one row inside its cell', () => {
        const tail = scheme([roles.C1, roles.V], [{ ...CV, slots: [{ ...CV.slots[0], groupId: TAIL }, CV.slots[1]] }]);
        const composed = composeBlock(segment, [gEntry(1), gEntry(2)], tail, index);
        const row = combineSvgRow([svg('k-tail-1', '0 0 48 48'), svg('k-tail-2')]);
        expect(composed.svg).toContain(nestSvg(row, { x: 0, y: 0, w: 50, h: 100 }));
        expect(composed.slots[0].variantId).toBe(12);
    });

    it('a pinned entry draws its pinned variant regardless of the slot group', () => {
        const composed = composeBlock(segment, [gEntry(1, 0, 12), gEntry(2, 1)], s, index);
        expect(composed.slots[0]).toMatchObject({ variantId: 12, missingGroup: false, entryKey: 'grapheme-1@12' });
    });

    it('renders a virtual (IPA) entry as the text svg and flags containsVirtual', () => {
        const composed = composeBlock(segment, [gEntry(1), ipaEntry('ɑ')], s, index);
        expect(composed.containsVirtual).toBe(true);
        expect(composed.svg).toContain(nestSvg(textSvg('ɑ'), { x: 50, y: 25, w: 50, h: 75 }));
        expect(composed.slots[1]).toEqual({ roleId: 'V', entryIndex: 1, variantId: null, missingGroup: false, entryKey: 'ipa:ɑ' });
    });

    it('a grapheme with no glyph data draws an empty cell and still reports its slot', () => {
        const empty = indexOf(withVariants, fakeGrapheme(2, 'a', { glyphs: [] }));
        const composed = composeBlock(segment, [gEntry(1), gEntry(2)], s, empty);
        expect(composed.svg).not.toContain('x="50"');
        expect(composed.slots).toHaveLength(2);
    });

    it('rounds float noise out of coordinates', () => {
        const thirds = scheme([roles.C1, roles.V], [template('CV', ['C1', 'V'])]); // y = 0.5, h = 0.5
        const odd = scheme([roles.C1, roles.V], [{ ...thirds.templates[0], slots: [
            { roleId: 'C1', groupId: null, x: 0.07, y: 0, w: 1 / 3, h: 1 },
            { roleId: 'V', groupId: null, x: 0, y: 0, w: 1, h: 1 },
        ] }]);
        const composed = composeBlock(segment, [gEntry(2), gEntry(2)], odd, index);
        expect(composed.svg).toContain('x="7" y="0" width="33.3333" height="100"');
    });

    it('draws cells in pattern order, independent of the slots array order', () => {
        const reversed = scheme([roles.C1, roles.V], [{ ...CV, slots: [CV.slots[1], CV.slots[0]] }]);
        const a = composeBlock(segment, [gEntry(1), gEntry(2)], s, index);
        const b = composeBlock(segment, [gEntry(1), gEntry(2)], reversed, index);
        expect(b.svg).toBe(a.svg);
        expect(b.slots).toEqual(a.slots);
    });

    it('throws on a segment from another scheme (unknown template / wrong length)', () => {
        expect(() => composeBlock({ ...segment, templateId: 'nope' }, [gEntry(1), gEntry(2)], s, index)).toThrow(/not in the scheme/);
        expect(() => composeBlock({ ...segment, entryIndices: [0] }, [gEntry(1)], s, index)).toThrow(/roles/);
    });

    it('is deterministic — same input ⇒ same svg, same blockKey', () => {
        const entries = [gEntry(1), gEntry(2)];
        const a = composeBlock(segment, entries, s, index);
        const b = composeBlock(segment, entries, s, index);
        expect(b.svg).toBe(a.svg);
        expect(blockKey(b)).toBe(blockKey(a));
        expect(generateVirtualGlyphId(blockKey(a))).toBe(generateVirtualGlyphId(blockKey(b)));
        expect(generateVirtualGlyphId(blockKey(a))).toBeLessThan(0);
    });
});

describe('blockKey', () => {
    const s = scheme([roles.C1, roles.V], [template('CV', ['C1', 'V'], [HEAD, null])]);
    const segment: BlockSegment = { kind: 'block', templateId: 'CV', entryIndices: [0, 1] };
    const key = (...entries: Parameters<typeof composeBlock>[1]) => blockKey(composeBlock(segment, [...entries], s, index));

    it('changes with the entries, the pins and the chosen variants', () => {
        const base = key(gEntry(1), gEntry(2));
        expect(base.startsWith('block:')).toBe(true);
        expect(key(gEntry(1), ipaEntry('a'))).not.toBe(base);
        expect(key(gEntry(1, 0, 12), gEntry(2))).not.toBe(base);
        expect(key(gEntry(2), gEntry(2))).not.toBe(base);
    });

    it('changes with the template', () => {
        const other = scheme([roles.C1, roles.V], [template('CV2', ['C1', 'V'], [HEAD, null])]);
        const a = blockKey(composeBlock(segment, [gEntry(1), gEntry(2)], s, index));
        const b = blockKey(composeBlock({ ...segment, templateId: 'CV2' }, [gEntry(1), gEntry(2)], other, index));
        expect(a).not.toBe(b);
    });

    it('ignores entry positions (identical blocks share an identity, like virtual glyphs)', () => {
        expect(key(gEntry(1, 0), gEntry(2, 1))).toBe(key(gEntry(1, 5), gEntry(2, 6)));
    });
});

describe('segment → compose end to end', () => {
    it('Mayan-style logogram + k a t a composes two blocks', () => {
        const logo = fakeGrapheme(9, null, { category: 'logogram', glyphs: [svg('logo')] });
        const t = fakeGrapheme(3, 't');
        const idx = indexOf(withVariants, plainVowel, logo, t);
        const s = scheme([roles.LOGO, roles.C1, roles.V], [template('LCV', ['LOGO', 'C1', 'V']), template('CV', ['C1', 'V'])]);
        const entries = [gEntry(9, 0), gEntry(1, 1), gEntry(2, 2), gEntry(3, 3), gEntry(2, 4)];
        const segments = segmentEntries(entries, s, idx);
        const composed = segments.map((seg) => {
            if (seg.kind !== 'block') throw new Error('expected blocks only');
            return composeBlock(seg, entries, s, idx);
        });
        expect(composed.map((c) => [c.templateId, c.entryIndices])).toEqual([['LCV', [0, 1, 2]], ['CV', [3, 4]]]);
        expect(composed[0].svg).toContain('logo');
    });
});

// =============================================================================
// SYLLABLE_BLOCKS_PLAN.md §3.4 — slots holding several entries
// =============================================================================

describe('composeBlock with slot counts', () => {
    // s p ɛ l t k — fixture paths carry no measurable ink, so each cell is
    // nested at its fallback rect (the part in full-box coordinates), and each
    // weighs 1 when parts share a slot — so these split it EQUALLY.
    const [S, P, E, L, T, K] = [20, 21, 22, 23, 24, 25];
    const idx = indexOf(
        fakeGrapheme(S, 's', { glyphs: [svg('s')] }),
        fakeGrapheme(P, 'p', { glyphs: [svg('p')] }),
        fakeGrapheme(E, 'ɛ', { glyphs: [svg('e')] }),
        fakeGrapheme(L, 'l', { glyphs: [svg('l')] }),
        fakeGrapheme(T, 't', { glyphs: [svg('t')] }),
        fakeGrapheme(K, 'k', { glyphs: [svg('k')] }),
    );
    // C1 (0–3, side by side) top-left, V along the bottom, C2 (0–3, stacked) top-right.
    const FLEX = {
        ...template('CVC', ['C1', 'V', 'C2']),
        slots: [
            { roleId: 'C1', groupId: null, x: 0, y: 0, w: 0.6, h: 0.5, min: 0 as const, max: 3 as const },
            { roleId: 'V', groupId: null, x: 0, y: 0.5, w: 1, h: 0.5 },
            { roleId: 'C2', groupId: null, x: 0.6, y: 0, w: 0.4, h: 0.5, min: 0 as const, max: 3 as const, arrange: 'column' as const },
        ],
    };
    const s = scheme([roles.C1, roles.V, roles.C2], [FLEX]);
    const entriesOf = (...ids: number[]) => ids.map((id, position) => gEntry(id, position));
    const composeWord = (...ids: number[]) => {
        const entries = entriesOf(...ids);
        const [segment] = segmentEntries(entries, s, idx);
        if (segment.kind !== 'block') throw new Error('expected a block');
        return composeBlock(segment, entries, s, idx);
    };
    const open = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">';

    it("'row' splits the slot across; 'column' splits it down (2 and 3 entries)", () => {
        const composed = composeWord(S, P, E, L, T, K);
        expect(composed.svg).toBe(
            open
            + nestSvg(svg('s'), { x: 0, y: 0, w: 30, h: 50 })
            + nestSvg(svg('p'), { x: 30, y: 0, w: 30, h: 50 })
            + nestSvg(svg('e'), { x: 0, y: 50, w: 100, h: 50 })
            + nestSvg(svg('l'), { x: 60, y: 0, w: 40, h: 16.6667 })
            + nestSvg(svg('t'), { x: 60, y: 16.6667, w: 40, h: 16.6667 })
            + nestSvg(svg('k'), { x: 60, y: 33.3333, w: 40, h: 16.6667 })
            + '</svg>',
        );
    });

    it('three side by side share the width in thirds', () => {
        const composed = composeWord(S, T, K, E);
        expect(composed.svg).toContain(nestSvg(svg('s'), { x: 0, y: 0, w: 20, h: 50 }));
        expect(composed.svg).toContain(nestSvg(svg('t'), { x: 20, y: 0, w: 20, h: 50 }));
        expect(composed.svg).toContain(nestSvg(svg('k'), { x: 40, y: 0, w: 20, h: 50 }));
    });

    it('a single entry in a many-sign slot takes the whole rectangle', () => {
        const composed = composeWord(S, E);
        expect(composed.svg).toBe(open + nestSvg(svg('s'), { x: 0, y: 0, w: 60, h: 50 }) + nestSvg(svg('e'), { x: 0, y: 50, w: 100, h: 50 }) + '</svg>');
    });

    it('an empty optional slot draws nothing', () => {
        const composed = composeWord(E);
        expect(composed.svg).toBe(open + nestSvg(svg('e'), { x: 0, y: 50, w: 100, h: 50 }) + '</svg>');
        expect(composed.slots).toEqual([{ roleId: 'V', entryIndex: 0, variantId: null, missingGroup: false, entryKey: `grapheme-${E}` }]);
    });

    it('reports one slot per entry, in entry order, with its role', () => {
        const composed = composeWord(S, P, E, L);
        expect(composed.slots.map((slot) => [slot.roleId, slot.entryIndex])).toEqual([['C1', 0], ['C1', 1], ['V', 2], ['C2', 3]]);
        expect(composed.entryIndices).toEqual([0, 1, 2, 3]);
    });

    it('slots follow ENTRY order while cells follow PATTERN order', () => {
        const entries = entriesOf(E, S);
        const segment: BlockSegment = { kind: 'block', templateId: 'CVC', entryIndices: [0, 1], roleIds: ['V', 'C1'] };
        const composed = composeBlock(segment, entries, s, idx);
        expect(composed.slots.map((slot) => [slot.roleId, slot.entryIndex])).toEqual([['V', 0], ['C1', 1]]);
        expect(composed.svg.indexOf('d="s"')).toBeLessThan(composed.svg.indexOf('d="e"'));
    });

    it('roleIds absent ⇒ pattern order, one entry per role (hand-built segments)', () => {
        const entries = entriesOf(S, E, L);
        const bare: BlockSegment = { kind: 'block', templateId: 'CVC', entryIndices: [0, 1, 2] };
        const explicit: BlockSegment = { ...bare, roleIds: ['C1', 'V', 'C2'] };
        expect(composeBlock(bare, entries, s, idx)).toEqual(composeBlock(explicit, entries, s, idx));
        expect(() => composeBlock({ ...bare, entryIndices: [0, 1] }, entries, s, idx)).toThrow(/roles/);
    });

    it('throws on role ids that do not fit the template (a caller bug)', () => {
        const entries = entriesOf(S, E);
        expect(() => composeBlock({ kind: 'block', templateId: 'CVC', entryIndices: [0, 1], roleIds: ['C1', 'NOPE'] }, entries, s, idx))
            .toThrow(/not in template/);
        expect(() => composeBlock({ kind: 'block', templateId: 'CVC', entryIndices: [0, 1], roleIds: ['C1'] }, entries, s, idx))
            .toThrow(/role ids/);
    });

    it('a count-less template composes byte-identically with or without roleIds', () => {
        const plain = scheme([roles.C1, roles.V], [template('CV', ['C1', 'V'])]);
        const entries = entriesOf(S, E);
        const bare: BlockSegment = { kind: 'block', templateId: 'CV', entryIndices: [0, 1] };
        const a = composeBlock(bare, entries, plain, idx);
        const b = composeBlock({ ...bare, roleIds: ['C1', 'V'] }, entries, plain, idx);
        expect(b.svg).toBe(a.svg);
        expect(blockKey(b)).toBe(blockKey(a));
    });

    it('a diphthong in a count-less V slot: two entries via roleIds share the V rect (DIPHTHONG_BLOCKS_PLAN.md §3.6)', () => {
        const I = 26;
        const withI = indexOf(...idx.values(), fakeGrapheme(I, 'i', { glyphs: [svg('i')] }));
        // Stacked strips: C1 on top, V (no count fields) below.
        const plain = scheme([roles.C1, roles.V], [template('CV', ['C1', 'V'])]);
        const entries = entriesOf(T, E, I);
        const composed = composeBlock(
            { kind: 'block', templateId: 'CV', entryIndices: [0, 1, 2], roleIds: ['C1', 'V', 'V'] },
            entries,
            plain,
            withI,
        );
        expect(composed.svg).toBe(
            open
            + nestSvg(svg('t'), { x: 0, y: 0, w: 100, h: 50 })
            + nestSvg(svg('e'), { x: 0, y: 50, w: 50, h: 50 })
            + nestSvg(svg('i'), { x: 50, y: 50, w: 50, h: 50 })
            + '</svg>',
        );
        expect(composed.slots.map((slot) => [slot.roleId, slot.entryIndex])).toEqual([['C1', 0], ['V', 1], ['V', 2]]);
        // End to end: the segmenter produces exactly that segment by syllable.
        const bySyllable = { ...plain, split: { mode: 'syllables' as const, diphthongs: ['ɛi'] } };
        const [segment] = segmentEntries(entries, bySyllable, withI);
        expect(segment.kind === 'block' && composeBlock(segment, entries, bySyllable, withI).svg).toBe(composed.svg);
    });

    it('blockKey tells apart the same letters split differently between roles', () => {
        const entries = entriesOf(S, E, L);
        const a = composeBlock({ kind: 'block', templateId: 'CVC', entryIndices: [0, 1, 2], roleIds: ['C1', 'V', 'C2'] }, entries, s, idx);
        const b = composeBlock({ kind: 'block', templateId: 'CVC', entryIndices: [0, 1, 2], roleIds: ['C1', 'C1', 'V'] }, entriesOf(S, L, E), s, idx);
        expect(blockKey(a)).not.toBe(blockKey(b));
    });
});

// =============================================================================
// Signs sharing a slot get room by their ink shape
// =============================================================================

describe('composeBlock: shared slots split by ink shape', () => {
    const inkSvg = (x: number, y: number, w: number, h: number) =>
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></svg>`;
    const SQUARE = inkSvg(10, 10, 80, 80);
    const WIDE = inkSvg(10, 40, 80, 20); // aspect > 2.5 once padded → clamped
    const TALL = inkSvg(40, 10, 20, 80); // inverse aspect > 2.5 → clamped in a column
    const MID = inkSvg(20, 30, 60, 40); // aspect 1.42…, inside the clamp
    const [SQ1, SQ2, WD, TL, MD, UNM, E] = [30, 31, 32, 33, 34, 35, 36];
    const idx = indexOf(
        fakeGrapheme(SQ1, 's', { glyphs: [SQUARE] }),
        fakeGrapheme(SQ2, 'p', { glyphs: [SQUARE] }),
        fakeGrapheme(WD, 't', { glyphs: [WIDE] }),
        fakeGrapheme(TL, 'k', { glyphs: [TALL] }),
        fakeGrapheme(MD, 'm', { glyphs: [MID] }),
        fakeGrapheme(UNM, 'n', { glyphs: [svg('n')] }), // unmeasurable ink
        fakeGrapheme(E, 'ɛ', { glyphs: [svg('e')] }),
    );
    // C1 (row) spans 0.6 of the unit width; C2 (column) 0.5 of its height.
    const FLEX = {
        ...template('CVC', ['C1', 'V', 'C2']),
        slots: [
            { roleId: 'C1', groupId: null, x: 0, y: 0, w: 0.6, h: 0.5, min: 0 as const, max: 3 as const },
            { roleId: 'V', groupId: null, x: 0, y: 0.5, w: 1, h: 0.5 },
            { roleId: 'C2', groupId: null, x: 0.6, y: 0, w: 0.4, h: 0.5, min: 0 as const, max: 3 as const, arrange: 'column' as const },
        ],
    };
    const s = scheme([roles.C1, roles.V, roles.C2], [FLEX]);
    const compose = (roleIds: string[], ...ids: number[]) => {
        const entries = ids.map((id, position) => gEntry(id, position));
        return composeBlock({ kind: 'block', templateId: 'CVC', entryIndices: ids.map((_, k) => k), roleIds }, entries, s, idx);
    };
    /** Measured cells `[x, y, w, h]` in drawing order (the outer document has no x attribute). */
    const cells = (doc: string) =>
        [...doc.matchAll(/<svg x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => m.slice(1, 5).map(Number));
    const round = (v: number) => Math.round(v * 10_000) / 10_000;
    // The slot's unit rect mapped into the glyph cell (the middle half of the box).
    const CELL = (1 - 2 * GLYPH_GUIDE_INSET) * 100;
    const C1_WIDTH = 0.6 * CELL;
    const C2_HEIGHT = 0.5 * CELL;

    it('two equal-shaped signs still split the slot equally', () => {
        const [a, b] = cells(compose(['C1', 'C1', 'V'], SQ1, SQ2, E).svg);
        expect(a[2]).toBe(round(C1_WIDTH / 2));
        expect(b[2]).toBe(round(C1_WIDTH / 2));
        expect(b[0]).toBe(round(a[0] + a[2]));
    });

    it('a wide sign next to a narrow one gets more width (weight clamped at 2.5)', () => {
        const [wide, square] = cells(compose(['C1', 'C1', 'V'], WD, SQ1, E).svg);
        expect(wide[2]).toBe(round(C1_WIDTH * 2.5 / 3.5));
        expect(square[2]).toBe(round(C1_WIDTH * 1 / 3.5));
        expect(square[0]).toBe(round(wide[0] + wide[2]));
        // Both keep the slot's full height.
        expect(wide[3]).toBe(square[3]);
    });

    it('inside the clamp, widths follow the ink aspect exactly', () => {
        const [mid, square] = cells(compose(['C1', 'C1', 'V'], MD, SQ1, E).svg);
        // 60 × 40 ink padded by 6 % of its larger side on every edge.
        const pad = 60 * 0.06 * 2;
        const weight = (60 + pad) / (40 + pad);
        expect(mid[2]).toBe(round(C1_WIDTH * weight / (weight + 1)));
        expect(square[2]).toBe(round(C1_WIDTH / (weight + 1)));
    });

    it("'column' mirrors it: a tall sign gets more height", () => {
        const drawn = cells(compose(['V', 'C2', 'C2'], E, TL, SQ1).svg);
        // The vowel's fixture path is unmeasurable (no measured cell); the two C2 cells follow.
        const [tall, square] = drawn.slice(-2);
        expect(tall[3]).toBe(round(C2_HEIGHT * 2.5 / 3.5));
        expect(square[3]).toBe(round(C2_HEIGHT / 3.5));
        expect(square[1]).toBe(round(tall[1] + tall[3]));
        expect(tall[2]).toBe(square[2]);
        // A wide sign in a column is the narrow case there: clamped at 0.4.
        const [, wideInColumn, sq] = cells(compose(['V', 'C2', 'C2'], E, WD, SQ1).svg);
        expect(wideInColumn[3]).toBe(round(C2_HEIGHT * 0.4 / 1.4));
        expect(sq[3]).toBe(round(C2_HEIGHT / 1.4));
    });

    it('a part whose ink cannot be measured weighs 1', () => {
        // Unmeasurable + square: both weigh 1 → equal halves (the unmeasurable
        // one nested at its full-box fallback rect).
        const even = compose(['C1', 'C1', 'V'], UNM, SQ1, E).svg;
        expect(even).toContain(nestSvg(svg('n'), { x: 0, y: 0, w: 30, h: 50 }));
        expect(cells(even)[1][2]).toBe(round(C1_WIDTH / 2));
        // Unmeasurable + wide: 1 against 2.5.
        const uneven = compose(['C1', 'C1', 'V'], UNM, WD, E).svg;
        expect(uneven).toContain(nestSvg(svg('n'), { x: 0, y: 0, w: round(60 / 3.5), h: 50 }));
        expect(cells(uneven)[1][2]).toBe(round(C1_WIDTH * 2.5 / 3.5));
    });

    it('an IPA sign (text stand-in) weighs 1', () => {
        const entries = [ipaEntry('t', 0), gEntry(WD, 1), gEntry(E, 2)];
        const composed = composeBlock({ kind: 'block', templateId: 'CVC', entryIndices: [0, 1, 2], roleIds: ['C1', 'C1', 'V'] }, entries, s, idx);
        expect(composed.svg).toContain(nestSvg(textSvg('t'), { x: 0, y: 0, w: round(60 / 3.5), h: 50 }));
    });

    it('one sign in the slot takes the exact rect, whatever its shape', () => {
        const [wide] = cells(compose(['C1', 'V'], WD, E).svg);
        expect(wide.slice(0, 4)).toEqual([25, 25, round(C1_WIDTH), round(0.5 * CELL)]);
    });
});

// =============================================================================
// BLOCK_PLACEMENT_PLAN.md §2 — slot pin + fill
// =============================================================================

describe('composeBlock: slot pin + fill', () => {
    const PIN_ALIGN = {
        'top-left': 'xMinYMin', top: 'xMidYMin', 'top-right': 'xMaxYMin',
        left: 'xMinYMid', center: 'xMidYMid', right: 'xMaxYMid',
        'bottom-left': 'xMinYMax', bottom: 'xMidYMax', 'bottom-right': 'xMaxYMax',
    } as const;
    const base = {
        ...template('CV', ['C1', 'V']),
        slots: [
            { roleId: 'C1', groupId: null, x: 0, y: 0, w: 0.5, h: 1 },
            { roleId: 'V', groupId: null, x: 0.5, y: 0, w: 0.5, h: 1 },
        ],
    };
    const segment: BlockSegment = { kind: 'block', templateId: 'CV', entryIndices: [0, 1] };
    const composeWith = (extra: Record<string, unknown>) => {
        const s = scheme([roles.C1, roles.V], [{ ...base, slots: [{ ...base.slots[0], ...extra }, base.slots[1]] }]);
        return composeBlock(segment, [gEntry(1, 0), gEntry(2, 1)], s, index).svg;
    };
    // The C1 cell is drawn first (pattern order) — the first nested <svg> with an x attribute.
    const c1Tag = (doc: string) => doc.match(/<svg x="[^"]*"[^>]*>/)![0];

    it('a slot with no pin/fill is byte-identical to an explicit center/fit (P1)', () => {
        expect(composeWith({})).toBe(composeWith({ pin: 'center', fill: 'fit' }));
        expect(c1Tag(composeWith({}))).toContain('preserveAspectRatio="xMidYMid meet"');
    });

    it('each of the nine pins with fit writes its align + meet, no overflow', () => {
        for (const [pin, align] of Object.entries(PIN_ALIGN)) {
            const tag = c1Tag(composeWith({ pin }));
            expect(tag).toContain(`preserveAspectRatio="${align} meet"`);
            expect(tag).not.toContain('overflow');
        }
    });

    it('each of the nine pins with fill writes its align + slice + overflow visible', () => {
        for (const [pin, align] of Object.entries(PIN_ALIGN)) {
            const tag = c1Tag(composeWith({ pin, fill: 'fill' }));
            expect(tag).toContain(`preserveAspectRatio="${align} slice"`);
            expect(tag).toContain('overflow="visible"');
        }
    });

    it('fill writes overflow="visible"; fit does not', () => {
        expect(c1Tag(composeWith({ fill: 'fill' }))).toContain('overflow="visible"');
        expect(c1Tag(composeWith({ fill: 'fit' }))).not.toContain('overflow');
        expect(c1Tag(composeWith({}))).not.toContain('overflow');
    });

    it('placement rides through the ink-fitted path too (measurable sign)', () => {
        const inkSign = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80"/></svg>';
        const drawn = fakeGrapheme(1, 'k', { glyphs: [inkSign] });
        const s = scheme([roles.C1, roles.V], [{ ...base, slots: [{ ...base.slots[0], pin: 'top-right', fill: 'fill' }, base.slots[1]] }]);
        const composed = composeBlock(segment, [gEntry(1, 0), gEntry(2, 1)], s, indexOf(drawn, plainVowel)).svg;
        const tag = c1Tag(composed);
        expect(tag).toContain('preserveAspectRatio="xMaxYMin slice"');
        expect(tag).toContain('overflow="visible"');
        // Fitted to the ink box, not the 0 0 100 100 canvas.
        expect(tag).not.toContain('viewBox="0 0 100 100"');
    });
});

// =============================================================================
// SYLLABLE_BLOCKS_PLAN.md §3.4 — lone consonant + vowel-killer mark
// =============================================================================

describe('composeLoneConsonant', () => {
    const MARK = 40;
    const idx = indexOf(withVariants, plainVowel, fakeGrapheme(MARK, null, { glyphs: [svg('mark')] }));
    const below: BlockLeftovers = { markGraphemeId: MARK, placement: 'below' };
    const open = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">';

    it.each([
        ['below', { x: 0, y: 0, w: 100, h: 70 }, { x: 0, y: 70, w: 100, h: 30 }],
        ['above', { x: 0, y: 30, w: 100, h: 70 }, { x: 0, y: 0, w: 100, h: 30 }],
        ['after', { x: 0, y: 0, w: 70, h: 100 }, { x: 70, y: 0, w: 30, h: 100 }],
        ['before', { x: 30, y: 0, w: 70, h: 100 }, { x: 0, y: 0, w: 30, h: 100 }],
    ] as const)('%s: consonant and mark at their preset rects', (placement, consonantRect, markRect) => {
        // Fixture paths carry no measurable ink ⇒ each is nested at its full-box rect.
        const composed = composeLoneConsonant(0, [gEntry(1)], idx, { markGraphemeId: MARK, placement });
        expect(composed?.svg).toBe(open + nestSvg(svg('k-default'), consonantRect) + nestSvg(svg('mark'), markRect) + '</svg>');
    });

    it('measurable ink goes through the same glyph-cell mapping composeBlock uses', () => {
        const ink = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80"/></svg>';
        const inked = indexOf(fakeGrapheme(5, 't', { glyphs: [ink] }), fakeGrapheme(MARK, null, { glyphs: [svg('mark')] }));
        const composed = composeLoneConsonant(0, [gEntry(5)], inked, below)!;
        const cell = 1 - 2 * GLYPH_GUIDE_INSET;
        const at = (v: number) => Math.round((GLYPH_GUIDE_INSET + v * cell) * 100 * 10_000) / 10_000;
        expect(composed.svg).toContain(`<svg x="${at(0)}" y="${at(0)}" width="${cell * 100}" height="${Math.round(0.7 * cell * 100 * 10_000) / 10_000}"`);
    });

    it('reports one slot, the reserved template id and the mark', () => {
        const composed = composeLoneConsonant(2, [gEntry(2), gEntry(2), gEntry(1, 2, 12)], idx, below)!;
        expect(composed).toMatchObject({
            templateId: LONE_CONSONANT_TEMPLATE_ID,
            entryIndices: [2],
            containsVirtual: false,
            slots: [{ roleId: LONE_CONSONANT_TEMPLATE_ID, entryIndex: 2, variantId: 12, missingGroup: false, entryKey: 'grapheme-1@12' }],
            mark: { graphemeId: MARK, variantId: null, placement: 'below' },
        });
        // The pinned variant is the one drawn.
        expect(composed.svg).toContain('k-tail-1');
    });

    it('an unpinned consonant draws its default variant', () => {
        const composed = composeLoneConsonant(0, [gEntry(1)], idx, below)!;
        expect(composed.slots[0].variantId).toBe(10);
        expect(composed.svg).toContain('k-default');
    });

    it('an IPA consonant draws its text stand-in and flags containsVirtual', () => {
        const composed = composeLoneConsonant(0, [ipaEntry('t')], idx, below)!;
        expect(composed.containsVirtual).toBe(true);
        expect(composed.svg).toContain(nestSvg(textSvg('t'), { x: 0, y: 0, w: 100, h: 70 }));
        expect(composed.slots[0]).toMatchObject({ entryKey: 'ipa:t', variantId: null });
    });

    it('null when the mark grapheme is gone, or the consonant draws nothing (never throws)', () => {
        expect(composeLoneConsonant(0, [gEntry(1)], idx, { markGraphemeId: 404, placement: 'below' })).toBeNull();
        expect(composeLoneConsonant(0, [gEntry(7)], idx, below)).toBeNull();
        expect(composeLoneConsonant(3, [gEntry(1)], idx, below)).toBeNull();
    });

    it('blockKey changes with the mark and its placement', () => {
        const other = indexOf(withVariants, fakeGrapheme(MARK, null), fakeGrapheme(41, null));
        const key = (leftovers: BlockLeftovers) => blockKey(composeLoneConsonant(0, [gEntry(1)], other, leftovers)!);
        const base = key(below);
        expect(key({ markGraphemeId: 41, placement: 'below' })).not.toBe(base);
        expect(key({ markGraphemeId: MARK, placement: 'after' })).not.toBe(base);
        expect(key(below)).toBe(base);
    });
});

// =============================================================================
// CONLANG_EDGES_PLAN.md §3.4 — a mark in its own slot
// =============================================================================

describe('composeBlock: marks (CONLANG_EDGES_PLAN.md §3.4)', () => {
    const tone = markGrapheme(50, { glyphs: [svg('tone')] });
    const n = fakeGrapheme(4, 'n', { glyphs: [svg('n')] });
    const idx = indexOf(withVariants, plainVowel, tone, n);
    const bySyllable = (templates: Parameters<typeof scheme>[1]) => ({
        ...scheme([roles.C1, roles.V, roles.MARK, roles.C2, roles.ANY], templates),
        split: { mode: 'syllables' as const },
    });

    it('a mark grapheme in a slot draws its glyph (k a MARK n → one C V MARK C2 block)', () => {
        const s = bySyllable([template('CVMC', ['C1', 'V', 'MARK', 'C2'])]);
        const entries = [gEntry(1, 0), gEntry(2, 1), gEntry(50, 2), gEntry(4, 3)];
        const [segment] = segmentEntries(entries, s, idx);
        if (segment.kind !== 'block') throw new Error('expected a block');
        const composed = composeBlock(segment, entries, s, idx);
        expect(composed.svg).toContain('tone');
        expect(composed.svg).toContain(nestSvg(svg('tone'), { x: 0, y: 50, w: 100, h: 25 }));
        expect(composed.slots.map((slot) => slot.roleId)).toEqual(['C1', 'V', 'MARK', 'C2']);
        expect(composed.slots[2]).toMatchObject({ entryIndex: 2, entryKey: 'grapheme-50' });
        expect(composed.containsVirtual).toBe(false);
    });

    it('an IPA mark draws its text stand-in and sets containsVirtual', () => {
        const s = bySyllable([template('CVX', ['C1', 'V', 'ANY'])]);
        const entries = [gEntry(1, 0), gEntry(2, 1), ipaEntry('ː', 2)];
        const [segment] = segmentEntries(entries, s, idx);
        if (segment.kind !== 'block') throw new Error('expected a block');
        const composed = composeBlock(segment, entries, s, idx);
        expect(composed.containsVirtual).toBe(true);
        expect(composed.svg).toContain(nestSvg(textSvg('ː'), { x: 0, y: 66.6667, w: 100, h: 33.3333 }));
        expect(composed.slots[2]).toMatchObject({ roleId: 'ANY', entryIndex: 2, entryKey: 'ipa:ː' });
    });
});
