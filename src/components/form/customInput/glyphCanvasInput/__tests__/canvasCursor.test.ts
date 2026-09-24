/**
 * The spelling canvas' insertion point — key mapping, movement, caret geometry.
 */

import { describe, expect, it } from 'vitest';

import { caretLine, cursorMoveForKey, describeCursor, moveCursor } from '../utils/canvasCursor';
import type { CanvasGlyph } from '../types';

describe('cursorMoveForKey', () => {
    it('follows the writing direction on screen', () => {
        expect(cursorMoveForKey('ArrowLeft', 'ltr')).toBe('prev');
        expect(cursorMoveForKey('ArrowRight', 'ltr')).toBe('next');
        expect(cursorMoveForKey('ArrowLeft', 'rtl')).toBe('next');
        expect(cursorMoveForKey('ArrowRight', 'rtl')).toBe('prev');
        expect(cursorMoveForKey('ArrowDown', 'ttb')).toBe('next');
        expect(cursorMoveForKey('ArrowUp', 'btt')).toBe('next');
        expect(cursorMoveForKey('ArrowLeft', 'custom')).toBe('prev');
    });

    it('ignores the cross axis and other keys; Home / End jump', () => {
        expect(cursorMoveForKey('ArrowUp', 'ltr')).toBeNull();
        expect(cursorMoveForKey('ArrowLeft', 'ttb')).toBeNull();
        expect(cursorMoveForKey('a', 'ltr')).toBeNull();
        expect(cursorMoveForKey('Home', 'rtl')).toBe('start');
        expect(cursorMoveForKey('End', 'ttb')).toBe('end');
    });
});

describe('moveCursor', () => {
    it('null is the end; reaching the end gives null back', () => {
        expect(moveCursor(null, 'prev', 3)).toBe(2);
        expect(moveCursor(2, 'next', 3)).toBeNull();
        expect(moveCursor(0, 'end', 3)).toBeNull();
        expect(moveCursor(null, 'next', 3)).toBeNull();
    });

    it('clamps at the start and clamps a stale cursor', () => {
        expect(moveCursor(0, 'prev', 3)).toBe(0);
        expect(moveCursor(null, 'start', 3)).toBe(0);
        expect(moveCursor(9, 'prev', 3)).toBe(2);
        expect(moveCursor(null, 'prev', 0)).toBeNull();
    });
});

describe('caretLine', () => {
    // Two 100×100 tiles side by side; the guide inset is a fraction of the box.
    const tiles: CanvasGlyph[] = [
        { glyph: { id: 1, name: 'a', svg_data: '' }, x: 0, y: 0, width: 100, height: 100, index: 0 },
        { glyph: { id: 2, name: 'b', svg_data: '' }, x: 100, y: 0, width: 100, height: 100, index: 1 },
    ];
    const sources = [0, 1];

    it("ltr: before tile k is its left edge; the end is the last tile's right edge", () => {
        const before1 = caretLine(1, tiles, sources, 'ltr')!;
        const atEnd = caretLine(null, tiles, sources, 'ltr')!;
        expect(before1.x1).toBe(before1.x2);
        expect(before1.x1).toBeGreaterThan(100);
        expect(before1.x1).toBeLessThan(150);
        expect(atEnd.x1).toBeGreaterThan(150);
        expect(atEnd.x1).toBeLessThan(200);
    });

    it('rtl mirrors it; vertical scripts draw a horizontal caret', () => {
        const rtl = caretLine(0, tiles, sources, 'rtl')!;
        expect(rtl.x1).toBeGreaterThan(50); // the right edge of tile 0
        const ttb = caretLine(0, tiles, sources, 'ttb')!;
        expect(ttb.y1).toBe(ttb.y2);
        expect(ttb.x1).toBeLessThan(ttb.x2);
    });

    it('skips positions whose glyph is not drawn, and draws nothing with no tiles', () => {
        // Selection position 1 is missing from the map: the caret sits before
        // the next DRAWN tile (source 2 → layout index 1).
        const line = caretLine(1, tiles, [0, 2], 'ltr')!;
        expect(line.x1).toBeGreaterThan(100);
        expect(caretLine(0, [], [], 'ltr')).toBeNull();
    });
});

describe('describeCursor', () => {
    it('reads the position in words', () => {
        expect(describeCursor(null, 3)).toBe('Insertion point at the end, after 3 of 3');
        expect(describeCursor(0, 3)).toBe('Insertion point at the start, before 1 of 3');
        expect(describeCursor(1, 3)).toBe('Insertion point after 1 of 3');
        expect(describeCursor(null, 0)).toBe('Empty spelling');
    });
});
