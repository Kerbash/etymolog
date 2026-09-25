/**
 * Reviewer audit for BLOCK_PLACEMENT_PLAN.md — the owner's scenario end to
 * end: a square sign in a FLAT box. With `fit` it shrinks to the box height
 * and sits centred; pinned `bottom` with `fill` it spans the box width and
 * spills upward, measured up to the block's own edge.
 */
import { describe, expect, it } from 'vitest';

import { composeBlock, validateBlockScheme } from '..';
import type { BlockScheme, BlockSegment, BlockSlot } from '..';
import { estimateInkBounds } from '../../db/utils/svgInkBounds';
import { fakeGrapheme, gEntry, indexOf, roles, scheme, template } from './fixtures';

const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80"/></svg>';
const VOWEL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="40" y="40" width="20" height="20"/></svg>';

function flatScheme(c2: Partial<BlockSlot>): BlockScheme {
    const t = { ...template('CVC', ['C1', 'V', 'C2']), slots: [
        { roleId: 'C1', groupId: null, x: 0, y: 0, w: 0.7, h: 0.75 },
        { roleId: 'V', groupId: null, x: 0.7, y: 0, w: 0.3, h: 0.75 },
        { roleId: 'C2', groupId: null, x: 0, y: 0.75, w: 1, h: 0.25, ...c2 },
    ] };
    return scheme([roles.C1, roles.V, roles.C2], [t]);
}

const index = indexOf(fakeGrapheme(1, 'k', { glyphs: [SQUARE] }), fakeGrapheme(2, 'a', { glyphs: [VOWEL] }), fakeGrapheme(3, 't', { glyphs: [SQUARE] }));
const segment: BlockSegment = { kind: 'block', templateId: 'CVC', entryIndices: [0, 1, 2] };
const entries = [gEntry(1, 0), gEntry(2, 1), gEntry(3, 2)];

function c2Cell(svg: string): string {
    const cells = svg.match(/<svg x="[^"]*"[^>]*>/g) ?? [];
    return cells[2] ?? '';
}

describe('flat box: fit vs fill (owner scenario)', () => {
    it('fit: the square sign is centred in the flat box and the block measures inside its cell', () => {
        const composed = composeBlock(segment, entries, flatScheme({}), index).svg;
        expect(c2Cell(composed)).toContain('preserveAspectRatio="xMidYMid meet"');
        expect(c2Cell(composed)).not.toContain('overflow');
        const ink = estimateInkBounds(composed);
        expect(ink).not.toBeNull();
        expect(ink!.y + ink!.height).toBeLessThanOrEqual(100);
    });

    it('fill + bottom: the sign spans the box width and spills upward, clipped at the block edge', () => {
        const fitted = estimateInkBounds(composeBlock(segment, entries, flatScheme({}), index).svg)!;
        const composed = composeBlock(segment, entries, flatScheme({ pin: 'bottom', fill: 'fill' }), index).svg;
        expect(c2Cell(composed)).toContain('preserveAspectRatio="xMidYMax slice" overflow="visible"');
        const ink = estimateInkBounds(composed);
        expect(ink).not.toBeNull();
        // Wider than the fitted drawing (the sign now spans the box) and never past the root.
        expect(ink!.width).toBeGreaterThanOrEqual(fitted.width);
        expect(ink!.x).toBeGreaterThanOrEqual(0);
        expect(ink!.x + ink!.width).toBeLessThanOrEqual(100);
        expect(ink!.y).toBeGreaterThanOrEqual(0);
        expect(ink!.y + ink!.height).toBeLessThanOrEqual(100);
    });

    it('the C2 cell alone, with fill, is measured taller than its box (the overflow is real)', () => {
        const composed = composeBlock(segment, entries, flatScheme({ pin: 'bottom', fill: 'fill' }), index).svg;
        const cell = composed.match(/<svg x="[^"]*"[^>]*>[\s\S]*?<\/svg>(?=<\/svg>$)/)?.[0];
        expect(cell).toBeDefined();
        const alone = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${cell}</svg>`;
        const ink = estimateInkBounds(alone)!;
        const boxTop = Number(/y="([\d.]+)"/.exec(cell!)![1]);
        expect(ink.y).toBeLessThan(boxTop);
    });
});

describe('validation with placement', () => {
    it('is idempotent and N1 for every pin × fill', () => {
        for (const pin of ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const) {
            for (const fill of ['fit', 'fill'] as const) {
                const once = validateBlockScheme(flatScheme({ pin, fill }));
                expect(once.issues).toEqual([]);
                const twice = validateBlockScheme(once.scheme);
                expect(twice.scheme).toEqual(once.scheme);
                const slot = once.scheme.templates[0].slots[2];
                expect('pin' in slot).toBe(pin !== 'center');
                expect('fill' in slot).toBe(fill === 'fill');
            }
        }
    });
});
