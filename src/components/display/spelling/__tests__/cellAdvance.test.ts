/**
 * Cell advance — letters reserve their CELL, margins overlap.
 *
 * A glyph box is the whole drawing canvas; its cell is the guide square in
 * the middle (`GLYPH_CELL_FRACTION` of the box). Every strategy advances by
 * the cell, so consecutive boxes overlap by their margins and the cells abut.
 * Pure geometry; no DOM.
 */

import { describe, it, expect } from 'vitest';

import { GLYPH_CELL_FRACTION, GLYPH_GUIDE_INSET } from '../../../../db/utils/glyphMetrics';
import { cellGeometry } from '../utils/cell';
import { resolveLayoutConfig } from '../utils/config';
import { getStrategy } from '../strategies';
import { createComposedBlockStrategy } from '../strategies/composedBlockStrategy';
import { DEFAULT_WRITING_SYSTEM_SETTINGS } from '../../../../db/api/types';
import type { LayoutStrategyConfig, RenderableGlyph } from '../types';

const glyph = (name: string): RenderableGlyph => ({
    id: name.charCodeAt(0), name, svg_data: '<svg/>', isVirtual: false, sourceIndex: 0,
});
const word = (n: number) => Array.from({ length: n }, (_, i) => glyph(String.fromCharCode(97 + i)));

/** Box 100, cell 50 (inset 25), no spacing, no padding. */
const CONFIG: LayoutStrategyConfig = { glyphWidth: 100, glyphHeight: 100, cellFraction: 0.5, spacing: 0, padding: 0 };

describe('glyph metrics', () => {
    it('derives the cell from the guide inset — one number, two consumers', () => {
        expect(GLYPH_CELL_FRACTION).toBeCloseTo(1 - 2 * GLYPH_GUIDE_INSET);
        expect(GLYPH_GUIDE_INSET).toBeGreaterThan(0);
        expect(GLYPH_GUIDE_INSET).toBeLessThan(0.5);
    });

    it('is the default layout cell, so presets lay letters out by it', () => {
        expect(resolveLayoutConfig(undefined).cellFraction).toBe(GLYPH_CELL_FRACTION);
        expect(resolveLayoutConfig('compact').cellFraction).toBe(GLYPH_CELL_FRACTION);
        expect(resolveLayoutConfig('card').cellFraction).toBe(GLYPH_CELL_FRACTION);
        expect(resolveLayoutConfig({ glyphWidth: 32 }).cellFraction).toBe(GLYPH_CELL_FRACTION);
    });
});

describe('cellGeometry', () => {
    it('splits the box into cell and inset and steps by cell + spacing', () => {
        const g = cellGeometry({ ...CONFIG, spacing: 4 });
        expect(g.cellWidth).toBe(50);
        expect(g.insetX).toBe(25);
        expect(g.stepX).toBe(54);
        expect(g.rowExtent(1)).toBe(100);
        expect(g.rowExtent(3)).toBe(2 * 54 + 100);
        expect(g.rowExtent(0)).toBe(0);
    });

    it('fits glyphs into a width by paying the outer margins once', () => {
        const g = cellGeometry(CONFIG);
        // 100 holds one box; each further glyph costs one 50px step.
        expect(g.fitInRow(100)).toBe(1);
        expect(g.fitInRow(149)).toBe(1);
        expect(g.fitInRow(150)).toBe(2);
        expect(g.fitInRow(250)).toBe(4);
        expect(g.fitInRow(10)).toBe(1); // never zero
        expect(g.fitInRow(Infinity)).toBe(Infinity);
    });

    it('treats cellFraction 1 as boxes abutting', () => {
        const g = cellGeometry({ ...CONFIG, cellFraction: 1, spacing: 2 });
        expect(g.insetX).toBe(0);
        expect(g.stepX).toBe(102);
    });
});

describe('linear strategies advance by the cell', () => {
    it('ltr: cells abut, boxes overlap by both margins', () => {
        const { positions, bounds } = getStrategy('ltr').calculate(word(3), CONFIG);
        expect(positions.map(p => p.x)).toEqual([0, 50, 100]);
        // Cell i ends where cell i+1 starts.
        expect(positions[0].x + 25 + 50).toBe(positions[1].x + 25);
        // Bounds are box-based: the word's outer margins are kept.
        expect(bounds.width).toBe(200);
        expect(bounds.height).toBe(100);
    });

    it('rtl mirrors ltr exactly', () => {
        const { positions, bounds } = getStrategy('rtl').calculate(word(3), CONFIG);
        expect(positions.map(p => p.x)).toEqual([100, 50, 0]);
        expect(bounds.width).toBe(200);
    });

    it('ttb / btt do the same along y', () => {
        expect(getStrategy('ttb').calculate(word(3), CONFIG).positions.map(p => p.y)).toEqual([0, 50, 100]);
        expect(getStrategy('btt').calculate(word(3), CONFIG).positions.map(p => p.y)).toEqual([100, 50, 0]);
    });

    it('spacing is added between CELLS', () => {
        const { positions } = getStrategy('ltr').calculate(word(2), { ...CONFIG, spacing: 10 });
        expect(positions[1].x).toBe(60);
    });
});

describe('wrapping strategies count glyphs by the cell', () => {
    it('block: a row holds as many glyphs as cells fit after the outer margins', () => {
        // 200 wide: one box (100) + two more steps of 50 = 3 per row.
        const { positions } = getStrategy('block').calculate(word(4), { ...CONFIG, maxWidth: 200 });
        expect(positions.map(p => [p.x, p.y])).toEqual([[0, 0], [50, 0], [100, 0], [0, 50]]);
    });

    it('boustrophedon: the return row advances by the cell from the right edge', () => {
        const { positions } = getStrategy('boustrophedon').calculate(word(4), { ...CONFIG, maxWidth: 150 });
        // 2 per row; row 1 runs right-to-left from the row's right end.
        expect(positions.map(p => [p.x, p.y])).toEqual([[0, 0], [50, 0], [50, 50], [0, 50]]);
    });

    it('composed block: letters within a word advance by the cell, words keep their margins', () => {
        const glyphs = [glyph('a'), glyph('b'), { ...glyph(' '), role: 'word-separator' as const }, glyph('c')];
        const { positions } = createComposedBlockStrategy(DEFAULT_WRITING_SYSTEM_SETTINGS).calculate(glyphs, CONFIG);
        const xs = Object.fromEntries(positions.map(p => [p.glyph.name, p.x]));
        expect(xs.b - xs.a).toBe(50);
        // The separator is its own group: it starts after "ab"'s full box extent.
        expect(xs[' ']).toBe(150);
        expect(xs.c).toBe(250);
    });
});

describe('spiral and circular', () => {
    it('spiral pitches its grid by the cell step', () => {
        const { positions } = getStrategy('spiral').calculate(word(2), CONFIG);
        expect(positions[1].x - positions[0].x).toBe(50);
    });

    it('circular places two glyphs one cell apart', () => {
        const { positions } = getStrategy('circular').calculate(word(2), CONFIG);
        expect(positions[1].x - positions[0].x).toBe(50);
    });
});
