/**
 * The spelling canvas' insertion point — pure helpers, no React.
 *
 * The cursor is a position in the SELECTION (0 = before the first entry,
 * `length` = after the last); `null` means "at the end" and is what every
 * edit that replaces the whole spelling resets it to. The cursor insertion
 * strategy inserts at it and Backspace removes before it, so moving it is all
 * it takes to type a glyph — or a block boundary — mid-word.
 *
 * @module glyphCanvasInput/utils/canvasCursor
 */

import { GLYPH_GUIDE_INSET } from '../../../../../db/utils/glyphMetrics';
import type { CanvasGlyph, WritingDirection } from '../types';

/**
 * The cursor move a key asks for, or `null` for a key the cursor ignores.
 *
 * Arrows follow the script's direction on screen: in a right-to-left script
 * ← moves FORWARD (the next glyph is to the left), in a vertical script ↑/↓
 * move along the column. The cross-axis arrows are ignored so they stay free
 * for the page. Home / End jump to the start / the end.
 */
export type CursorMove = 'prev' | 'next' | 'start' | 'end';

export function cursorMoveForKey(key: string, direction: WritingDirection = 'ltr'): CursorMove | null {
    if (key === 'Home') return 'start';
    if (key === 'End') return 'end';
    switch (direction) {
        case 'rtl':
            if (key === 'ArrowLeft') return 'next';
            if (key === 'ArrowRight') return 'prev';
            return null;
        case 'ttb':
            if (key === 'ArrowUp') return 'prev';
            if (key === 'ArrowDown') return 'next';
            return null;
        case 'btt':
            if (key === 'ArrowUp') return 'next';
            if (key === 'ArrowDown') return 'prev';
            return null;
        case 'ltr':
        case 'custom':
        default:
            if (key === 'ArrowLeft') return 'prev';
            if (key === 'ArrowRight') return 'next';
            return null;
    }
}

/**
 * Apply `move` to `cursor` over a selection of `length` entries. The result is
 * a concrete position, except that reaching the end yields `null` — the same
 * "append" state a fresh canvas starts in.
 */
export function moveCursor(cursor: number | null, move: CursorMove, length: number): number | null {
    const at = cursor === null ? length : Math.max(0, Math.min(cursor, length));
    let next: number;
    switch (move) {
        case 'start':
            next = 0;
            break;
        case 'end':
            next = length;
            break;
        case 'prev':
            next = Math.max(0, at - 1);
            break;
        case 'next':
            next = Math.min(length, at + 1);
            break;
    }
    return next >= length ? null : next;
}

/** A line segment in canvas coordinates. */
export interface CaretLine {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

/**
 * Where to draw the caret for `cursor`: the LEADING edge (in the writing
 * direction) of the tile at that position, or — for the end — the trailing
 * edge of the last tile. `sourceIndices[k]` is the selection position of
 * `positioned[k]` (ids missing from the glyph map are not on the canvas).
 * `null` when there is nothing to draw next to.
 */
export function caretLine(
    cursor: number | null,
    positioned: readonly CanvasGlyph[],
    sourceIndices: readonly number[],
    direction: WritingDirection = 'ltr',
): CaretLine | null {
    if (positioned.length === 0) return null;

    let tile: CanvasGlyph | undefined;
    let leading = true;
    if (cursor !== null) {
        // The first tile at or after the cursor: a missing id's position
        // falls through to the next tile that IS drawn.
        const k = sourceIndices.findIndex((source) => source >= cursor);
        if (k !== -1) tile = positioned.find((pg) => pg.index === k);
    }
    if (!tile) {
        tile = positioned.reduce((a, b) => (b.index > a.index ? b : a));
        leading = false;
    }

    const insetX = tile.width * GLYPH_GUIDE_INSET;
    const insetY = tile.height * GLYPH_GUIDE_INSET;
    const left = tile.x + insetX;
    const right = tile.x + tile.width - insetX;
    const top = tile.y + insetY;
    const bottom = tile.y + tile.height - insetY;

    const vertical = direction === 'ttb' || direction === 'btt';
    // The edge the NEXT entry would appear on.
    const startSide = direction === 'rtl' || direction === 'btt';
    if (vertical) {
        const atTop = leading !== startSide;
        const y = atTop ? top : bottom;
        return { x1: left, y1: y, x2: right, y2: y };
    }
    const atLeft = leading !== startSide;
    const x = atLeft ? left : right;
    return { x1: x, y1: top, x2: x, y2: bottom };
}

/** "After 2 of 4" — the caret position in words, for the live region. */
export function describeCursor(cursor: number | null, length: number): string {
    if (length === 0) return 'Empty spelling';
    const at = cursor === null ? length : Math.max(0, Math.min(cursor, length));
    if (at === 0) return `Insertion point at the start, before 1 of ${length}`;
    if (at === length) return `Insertion point at the end, after ${length} of ${length}`;
    return `Insertion point after ${at} of ${length}`;
}
