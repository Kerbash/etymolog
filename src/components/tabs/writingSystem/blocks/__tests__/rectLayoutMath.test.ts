/**
 * rectLayoutMath — the unit-square geometry behind RectLayoutEditor.
 *
 * Pure functions, node environment. What is pinned: the rectangle never
 * leaves the square on any edge, never shrinks under MIN_SIZE, a move keeps
 * its size and a resize keeps its corner, snapping lands on the grid without
 * dropping under the minimum, and corrupt numbers are repaired.
 */
import { describe, it, expect } from 'vitest';

import {
    MIN_SIZE,
    clampRect,
    describeRect,
    formatPercent,
    moveRect,
    resizeRect,
    snapRect,
} from '../rectLayoutMath';
import type { LayoutRect } from '../rectLayoutMath';

function rect(x: number, y: number, w: number, h: number): LayoutRect {
    return { id: 'r', label: 'C1', x, y, w, h };
}

function geometry(r: LayoutRect) {
    return { x: r.x, y: r.y, w: r.w, h: r.h };
}

describe('clampRect', () => {
    it('leaves an in-range rectangle untouched', () => {
        expect(geometry(clampRect(rect(0.25, 0, 0.5, 1)))).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 });
    });

    it('clamps the left and top edges to 0', () => {
        expect(geometry(clampRect(rect(-0.2, -1, 0.5, 0.5)))).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
    });

    it('clamps the right and bottom edges by moving the position, not the size', () => {
        expect(geometry(clampRect(rect(0.8, 0.9, 0.5, 0.25)))).toEqual({ x: 0.5, y: 0.75, w: 0.5, h: 0.25 });
    });

    it('caps size at the full square and lifts it to MIN_SIZE', () => {
        expect(geometry(clampRect(rect(0.3, 0.3, 2, 0)))).toEqual({ x: 0, y: 0.3, w: 1, h: MIN_SIZE });
        expect(clampRect(rect(0, 0, -1, 0.01)).w).toBe(MIN_SIZE);
    });

    it('repairs non-finite numbers', () => {
        const repaired = clampRect(rect(Number.NaN, Infinity, Number.NaN, -Infinity));
        expect(geometry(repaired)).toEqual({ x: 0, y: 0, w: MIN_SIZE, h: MIN_SIZE });
    });

    it('keeps id, label and colour', () => {
        const out = clampRect({ id: 'a', label: 'V', colour: 'red', x: 2, y: 0, w: 0.5, h: 0.5 });
        expect(out).toMatchObject({ id: 'a', label: 'V', colour: 'red' });
    });

    it('does not leak float noise', () => {
        expect(clampRect(rect(0.1 + 0.2, 0, 0.5, 0.5)).x).toBe(0.3);
    });
});

describe('snapRect', () => {
    it('rounds every number to the grid', () => {
        expect(geometry(snapRect(rect(0.13, 0.37, 0.49, 0.26), 1 / 8))).toEqual({
            x: 0.125,
            y: 0.375,
            w: 0.5,
            h: 0.25,
        });
    });

    it('is a plain clamp when snap is null, 0 or negative', () => {
        const r = rect(0.13, 0.37, 0.49, 0.26);
        expect(geometry(snapRect(r, null))).toEqual(geometry(r));
        expect(geometry(snapRect(r, 0))).toEqual(geometry(r));
        expect(geometry(snapRect(r, -0.25))).toEqual(geometry(r));
    });

    it('never snaps a size to zero', () => {
        expect(snapRect(rect(0, 0, 0.01, 0.01), 1 / 8).w).toBe(0.125);
    });

    it('uses the smallest ON-GRID size above MIN_SIZE when the grid is finer', () => {
        // 1/32 = 0.03125 < MIN_SIZE, so the floor is two steps (0.0625), not 0.05.
        expect(snapRect(rect(0, 0, 0.03, 0.03), 1 / 32).w).toBe(0.0625);
    });

    it('snaps then clamps so the result stays in the square', () => {
        expect(geometry(snapRect(rect(0.95, 0.95, 0.5, 0.5), 1 / 4))).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    });
});

describe('moveRect', () => {
    it('translates by the delta', () => {
        expect(geometry(moveRect(rect(0.25, 0.25, 0.25, 0.25), 0.25, -0.125))).toEqual({
            x: 0.5,
            y: 0.125,
            w: 0.25,
            h: 0.25,
        });
    });

    it('stops at every edge while keeping the size', () => {
        const r = rect(0.25, 0.25, 0.5, 0.5);
        expect(geometry(moveRect(r, -1, 0))).toEqual({ x: 0, y: 0.25, w: 0.5, h: 0.5 });
        expect(geometry(moveRect(r, 1, 0))).toEqual({ x: 0.5, y: 0.25, w: 0.5, h: 0.5 });
        expect(geometry(moveRect(r, 0, -1))).toEqual({ x: 0.25, y: 0, w: 0.5, h: 0.5 });
        expect(geometry(moveRect(r, 0, 1))).toEqual({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 });
    });

    it('snaps the resulting position', () => {
        expect(geometry(moveRect(rect(0, 0, 0.25, 0.25), 0.2, 0.3, 1 / 8))).toEqual({
            x: 0.25,
            y: 0.25,
            w: 0.25,
            h: 0.25,
        });
    });

    it('cannot move a full-square rectangle at all', () => {
        expect(geometry(moveRect(rect(0, 0, 1, 1), 0.5, 0.5))).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    });
});

describe('resizeRect', () => {
    it('grows from the bottom-right with the corner fixed', () => {
        expect(geometry(resizeRect(rect(0.25, 0.25, 0.25, 0.25), 0.25, 0.125))).toEqual({
            x: 0.25,
            y: 0.25,
            w: 0.5,
            h: 0.375,
        });
    });

    it('stops at the right and bottom edges without moving the corner', () => {
        expect(geometry(resizeRect(rect(0.5, 0.75, 0.25, 0.125), 1, 1))).toEqual({
            x: 0.5,
            y: 0.75,
            w: 0.5,
            h: 0.25,
        });
    });

    it('stops at MIN_SIZE when shrinking', () => {
        expect(geometry(resizeRect(rect(0.5, 0.5, 0.25, 0.25), -1, -1))).toEqual({
            x: 0.5,
            y: 0.5,
            w: MIN_SIZE,
            h: MIN_SIZE,
        });
    });

    it('snaps the resulting size, with the on-grid minimum', () => {
        expect(geometry(resizeRect(rect(0, 0, 0.25, 0.25), 0.1, -1, 1 / 8))).toEqual({
            x: 0,
            y: 0,
            w: 0.375,
            h: 0.125,
        });
    });
});

describe('describeRect / formatPercent', () => {
    it('produces the accessible name', () => {
        expect(describeRect(rect(0.25, 0, 0.5, 1))).toBe('C1, x 25% y 0% w 50% h 100%');
    });

    it('keeps one decimal only when needed', () => {
        expect(formatPercent(1 / 32)).toBe('3.1%');
        expect(formatPercent(0.125)).toBe('12.5%');
        expect(formatPercent(0.5)).toBe('50%');
    });
});

// Regression (E2E): on a 1/8 grid, Shift+Up on a third-wide rect also
// re-snapped its WIDTH (33.3% -> 37.5%). Only the axis that changed snaps now.
describe('snapping touches only the axis that changed', () => {
    it('resizeRect: a height-only change leaves an off-grid width alone', () => {
        const r = resizeRect(rect(0, 0, 1 / 3, 1), 0, -1 / 8, 1 / 8);
        expect(r.w).toBeCloseTo(1 / 3, 5);
        expect(r.h).toBeCloseTo(7 / 8, 5);
    });

    it('resizeRect: a width-only change leaves an off-grid height alone', () => {
        const r = resizeRect(rect(0, 0, 1 / 3, 1 / 3), 1 / 8, 0, 1 / 8);
        expect(r.h).toBeCloseTo(1 / 3, 5);
        expect(r.w).toBeCloseTo(0.5, 5);
    });

    it('moveRect: a horizontal nudge leaves an off-grid y alone', () => {
        const r = moveRect(rect(0, 1 / 3, 0.25, 0.25), 1 / 8, 0, 1 / 8);
        expect(r.y).toBeCloseTo(1 / 3, 5);
        expect(r.x).toBeCloseTo(1 / 8, 5);
    });
});
