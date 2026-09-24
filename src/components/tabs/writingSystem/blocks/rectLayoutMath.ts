/**
 * rectLayoutMath — the pure geometry behind `RectLayoutEditor`.
 *
 * Every rectangle lives on a UNIT square (`0..1` on both axes), the same space
 * a `BlockSlot` is stored in (BLOCK_SCRIPT_PLAN §2.4). Nothing here knows about
 * pixels, React or the DOM; the component converts pointer deltas to unit
 * deltas and hands them to these helpers, which is what makes the clamping and
 * snapping rules unit-testable in a node environment.
 *
 * The invariants every helper returns:
 *
 *  - `MIN_SIZE ≤ w ≤ 1`, `MIN_SIZE ≤ h ≤ 1`;
 *  - `0 ≤ x ≤ 1 - w`, `0 ≤ y ≤ 1 - h` (the rectangle never leaves the square);
 *  - non-finite input (NaN, ±Infinity — a corrupt import) is repaired rather
 *    than propagated, so one bad number cannot make a slot unrenderable.
 *
 * Moving and resizing are deliberately asymmetric: a MOVE that hits an edge
 * keeps the rectangle's size and stops its position; a RESIZE keeps the
 * top-left corner fixed and stops the size. Neither ever "pushes" the other.
 *
 * @module writingSystem/blocks/rectLayoutMath
 */

/** A rectangle on the unit square, plus what the editor needs to draw it. */
export interface LayoutRect {
    id: string;
    label: string;
    /** User-chosen tint (any CSS colour string); falls back to the theme. */
    colour?: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Smallest width/height a rectangle may shrink to (5 % of the square). */
export const MIN_SIZE = 0.05;

/** Keyboard step when no snap grid is set: 1/32 of the square. */
export const DEFAULT_KEY_STEP = 1 / 32;

/**
 * Float noise guard. `0.1 + 0.2` style residue would otherwise leak into the
 * stored scheme (`0.30000000000000004`) and into the aria percentages.
 */
function tidy(value: number): number {
    return Math.round(value * 1e6) / 1e6;
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number, fallback: number): number {
    return Number.isFinite(value) ? value : fallback;
}

/** A usable snap step, or `null` for "free" (absent, zero, negative, NaN). */
function normaliseSnap(snap: number | null | undefined): number | null {
    return typeof snap === 'number' && Number.isFinite(snap) && snap > 0 && snap <= 1 ? snap : null;
}

/** Round `value` to the nearest multiple of `snap`. */
function snapValue(value: number, snap: number): number {
    return tidy(Math.round(value / snap) * snap);
}

/**
 * The smallest size that is BOTH on the grid and ≥ `MIN_SIZE`. With a 1/32
 * grid (0.03125) plain rounding would produce a width `clampRect` then lifts to
 * 0.05 — off the grid the user asked for. Two grid steps (0.0625) is the answer.
 */
function snappedMinSize(snap: number): number {
    return tidy(Math.ceil(MIN_SIZE / snap - 1e-9) * snap);
}

/** Force a rectangle back inside the unit square (see module invariants). */
export function clampRect(rect: LayoutRect): LayoutRect {
    const w = tidy(clampNumber(finiteOr(rect.w, MIN_SIZE), MIN_SIZE, 1));
    const h = tidy(clampNumber(finiteOr(rect.h, MIN_SIZE), MIN_SIZE, 1));
    const x = tidy(clampNumber(finiteOr(rect.x, 0), 0, 1 - w));
    const y = tidy(clampNumber(finiteOr(rect.y, 0), 0, 1 - h));
    return { ...rect, x, y, w, h };
}

/**
 * Snap all four numbers to the grid, then clamp. `snap` null/≤0 → only clamp.
 * Sizes never snap below the smallest on-grid size ≥ `MIN_SIZE`.
 */
export function snapRect(rect: LayoutRect, snap: number | null | undefined): LayoutRect {
    const step = normaliseSnap(snap);
    if (step === null) return clampRect(rect);
    const minSize = snappedMinSize(step);
    return clampRect({
        ...rect,
        x: snapValue(finiteOr(rect.x, 0), step),
        y: snapValue(finiteOr(rect.y, 0), step),
        w: Math.max(minSize, snapValue(finiteOr(rect.w, minSize), step)),
        h: Math.max(minSize, snapValue(finiteOr(rect.h, minSize), step)),
    });
}

/**
 * Translate by `(dx, dy)` unit-square units. Size is preserved; the position
 * stops at the edges. With `snap`, the coordinate that MOVED lands on the grid;
 * an axis with a zero delta is left exactly where it was (an off-grid rect
 * nudged sideways must not also jump vertically).
 */
export function moveRect(rect: LayoutRect, dx: number, dy: number, snap?: number | null): LayoutRect {
    const base = clampRect(rect);
    const step = normaliseSnap(snap);
    let x = base.x + finiteOr(dx, 0);
    let y = base.y + finiteOr(dy, 0);
    if (step !== null) {
        if (dx !== 0) x = snapValue(x, step);
        if (dy !== 0) y = snapValue(y, step);
    }
    return clampRect({ ...base, x, y });
}

/**
 * Grow/shrink by `(dw, dh)` with the top-left corner fixed — the bottom-right
 * handle. Size stops at `MIN_SIZE` and at the square's right/bottom edge. With
 * `snap`, the size that CHANGED lands on the grid (never below its min size);
 * the other one is left alone — Shift+↑ must not also re-snap the width.
 */
export function resizeRect(rect: LayoutRect, dw: number, dh: number, snap?: number | null): LayoutRect {
    const base = clampRect(rect);
    const step = normaliseSnap(snap);
    let w = base.w + finiteOr(dw, 0);
    let h = base.h + finiteOr(dh, 0);
    if (step !== null) {
        const minSize = snappedMinSize(step);
        if (dw !== 0) w = Math.max(minSize, snapValue(w, step));
        if (dh !== 0) h = Math.max(minSize, snapValue(h, step));
    }
    return clampRect({
        ...base,
        w: clampNumber(w, MIN_SIZE, 1 - base.x),
        h: clampNumber(h, MIN_SIZE, 1 - base.y),
    });
}

/** `0.03125` → `"3.1%"`, `0.25` → `"25%"`. */
export function formatPercent(value: number): string {
    const pct = Math.round(finiteOr(value, 0) * 1000) / 10;
    return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

/** The accessible name of a rectangle: `"C1, x 25% y 0% w 50% h 100%"`. */
export function describeRect(rect: LayoutRect): string {
    return `${rect.label}, ${describePosition(rect)}`;
}

/** The geometry half of `describeRect`, also used by the live region. */
export function describePosition(rect: Pick<LayoutRect, 'x' | 'y' | 'w' | 'h'>): string {
    return `x ${formatPercent(rect.x)} y ${formatPercent(rect.y)} w ${formatPercent(rect.w)} h ${formatPercent(rect.h)}`;
}

/** True when two rectangles have the same geometry (ignores id/label/colour). */
export function sameGeometry(a: LayoutRect, b: LayoutRect): boolean {
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
