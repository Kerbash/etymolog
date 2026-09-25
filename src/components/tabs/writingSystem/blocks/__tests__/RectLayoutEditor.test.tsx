// @vitest-environment happy-dom
/**
 * RectLayoutEditor — keyboard, pointer, selection and read-only behaviour.
 *
 * The geometry itself is pinned by `rectLayoutMath.test.ts`; this file checks
 * the wiring: that keys and drags reach `onChange` with the expected numbers
 * (and the rest of the array untouched), that nothing fires in `readOnly`,
 * that injected content renders INSIDE its rectangle and cannot start a drag
 * or swallow arrow keys as moves, and that selection works both controlled and
 * uncontrolled.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { useState } from 'react';

import RectLayoutEditor from '../RectLayoutEditor';
import type { RectLayoutEditorProps } from '../RectLayoutEditor';
import type { LayoutRect } from '../rectLayoutMath';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const START: LayoutRect[] = [
    { id: 'c1', label: 'C1', x: 0, y: 0, w: 0.5, h: 1 },
    { id: 'v', label: 'V', colour: 'var(--red)', x: 0.5, y: 0, w: 0.5, h: 0.5 },
];

let container: HTMLDivElement;
let root: Root;
let changes: LayoutRect[][];

/** Feeds `onChange` back into `rects`, like a real parent would. */
function Harness(props: Partial<RectLayoutEditorProps>) {
    const [rects, setRects] = useState<LayoutRect[]>(props.rects ?? START);
    return (
        <RectLayoutEditor
            {...props}
            rects={rects}
            onChange={next => {
                changes.push(next);
                setRects(next);
                props.onChange?.(next);
            }}
        />
    );
}

function mount(props: Partial<RectLayoutEditorProps> = {}) {
    act(() => {
        root.render(<Harness {...props} />);
    });
}

function rectEl(id: string): HTMLElement {
    const el = container.querySelector<HTMLElement>(`[data-rect-id="${id}"]`);
    if (!el) throw new Error(`rect ${id} not rendered`);
    return el;
}

function key(el: Element, keyName: string, shiftKey = false) {
    act(() => {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, shiftKey, bubbles: true, cancelable: true }));
    });
}

function pointer(el: Element, type: string, clientX: number, clientY: number) {
    act(() => {
        el.dispatchEvent(
            new PointerEvent(type, { pointerId: 1, button: 0, clientX, clientY, bubbles: true, cancelable: true }),
        );
    });
}

function last(): LayoutRect[] {
    return changes[changes.length - 1];
}

beforeEach(() => {
    changes = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

describe('RectLayoutEditor rendering', () => {
    it('renders one focusable button per rect, in order, with geometry in its name', () => {
        mount();
        const buttons = container.querySelectorAll<HTMLElement>('[role="button"]');
        expect(buttons).toHaveLength(2);
        expect(buttons[0].getAttribute('aria-label')).toBe('C1, x 0% y 0% w 50% h 100%');
        expect(buttons[1].getAttribute('aria-label')).toBe('V, x 50% y 0% w 50% h 50%');
        expect(buttons[0].tabIndex).toBe(0);
        expect(buttons[1].style.left).toBe('50%');
        expect(buttons[1].style.getPropertyValue('--rect-colour')).toBe('var(--red)');
        expect(buttons[0].style.getPropertyValue('--rect-colour')).toBe('');
    });

    it('renders renderRectContent INSIDE its rect', () => {
        mount({ renderRectContent: r => <select aria-label={`group for ${r.label}`} /> });
        const select = container.querySelector('select[aria-label="group for V"]');
        expect(select).not.toBeNull();
        expect(rectEl('v').contains(select)).toBe(true);
        expect(rectEl('c1').contains(select)).toBe(false);
    });
});

describe('RectLayoutEditor keyboard', () => {
    it('ArrowRight moves by 1/32 when free and leaves other rects untouched', () => {
        mount();
        key(rectEl('c1'), 'ArrowRight');
        expect(changes).toHaveLength(1);
        expect(last()[0]).toMatchObject({ x: 1 / 32, y: 0, w: 0.5, h: 1 });
        expect(last()[1]).toBe(START[1]);
    });

    it('moves by the snap step when snap is set', () => {
        mount({ snap: 1 / 8 });
        key(rectEl('v'), 'ArrowDown');
        expect(last()[1]).toMatchObject({ x: 0.5, y: 0.125, w: 0.5, h: 0.5 });
    });

    it('Shift+Arrow resizes with the corner fixed', () => {
        mount({ snap: 1 / 8 });
        key(rectEl('v'), 'ArrowDown', true);
        expect(last()[1]).toMatchObject({ x: 0.5, y: 0, w: 0.5, h: 0.625 });
        key(rectEl('v'), 'ArrowLeft', true);
        expect(last()[1]).toMatchObject({ x: 0.5, y: 0, w: 0.375, h: 0.625 });
    });

    it('clamps at the edge and emits nothing when already there', () => {
        mount();
        key(rectEl('c1'), 'ArrowLeft'); // already at x = 0
        key(rectEl('c1'), 'ArrowUp'); // already at y = 0
        key(rectEl('c1'), 'ArrowDown'); // h = 1: no room to move down
        key(rectEl('v'), 'ArrowRight', true); // x + w = 1: no room to grow
        expect(changes).toHaveLength(0);
    });

    it('announces keyboard changes in the live region', () => {
        mount({ snap: 1 / 4 });
        key(rectEl('v'), 'ArrowDown');
        const status = container.querySelector('[role="status"]');
        expect(status?.textContent).toBe('V moved to x 50% y 25% w 50% h 50%');
    });

    it('ignores arrow keys typed into injected content', () => {
        mount({ renderRectContent: () => <select data-testid="sel" /> });
        const select = container.querySelector('select');
        if (!select) throw new Error('no select');
        key(select, 'ArrowDown');
        expect(changes).toHaveLength(0);
    });

    it('readOnly ignores keys', () => {
        mount({ readOnly: true });
        key(rectEl('v'), 'ArrowDown');
        key(rectEl('v'), 'ArrowDown', true);
        key(rectEl('v'), 'Enter');
        expect(changes).toHaveLength(0);
        expect(rectEl('v').getAttribute('aria-disabled')).toBe('true');
        expect(rectEl('v').getAttribute('aria-pressed')).toBe('false');
    });
});

describe('RectLayoutEditor selection', () => {
    it('owns selection when uncontrolled and reports it', () => {
        const onSelect = vi.fn();
        mount({ onSelect });
        key(rectEl('v'), 'Enter');
        expect(onSelect).toHaveBeenLastCalledWith('v');
        expect(rectEl('v').getAttribute('aria-pressed')).toBe('true');
        expect(rectEl('c1').getAttribute('aria-pressed')).toBe('false');
        expect(container.querySelector('[data-resize-handle]')?.parentElement).toBe(rectEl('v'));
        expect(container.textContent).toContain('V — x 50% · y 0% · w 50% · h 50%');
    });

    it('follows a controlled selectedId and only reports clicks', () => {
        const onSelect = vi.fn();
        mount({ selectedId: 'c1', onSelect });
        expect(rectEl('c1').getAttribute('aria-pressed')).toBe('true');
        key(rectEl('v'), ' ');
        expect(onSelect).toHaveBeenLastCalledWith('v');
        // Parent did not accept the change, so the controlled value stands.
        expect(rectEl('c1').getAttribute('aria-pressed')).toBe('true');
        expect(rectEl('v').getAttribute('aria-pressed')).toBe('false');
    });

    it('treats a selectedId for a missing rect as no selection', () => {
        mount({ selectedId: 'gone' });
        expect(container.querySelector('[aria-pressed="true"]')).toBeNull();
        expect(container.querySelector('[data-resize-handle]')).toBeNull();
    });

    it('a press on the bare canvas clears the selection', () => {
        const onSelect = vi.fn();
        mount({ onSelect });
        key(rectEl('v'), 'Enter');
        const canvas = container.querySelector('[role="group"]');
        if (!canvas) throw new Error('no canvas');
        pointer(canvas, 'pointerdown', 10, 10);
        expect(onSelect).toHaveBeenLastCalledWith(null);
        expect(container.querySelector('[aria-pressed="true"]')).toBeNull();
    });
});

describe('RectLayoutEditor pointer', () => {
    // happy-dom measures 0 → the editor falls back to `size` px per unit.
    it('drags a rect body to move it, from the origin, clamped', () => {
        const onSelect = vi.fn();
        mount({ size: 400, onSelect });
        const v = rectEl('v');
        pointer(v, 'pointerdown', 300, 50);
        expect(onSelect).toHaveBeenLastCalledWith('v');
        pointer(v, 'pointermove', 300, 150); // +100 px = +0.25
        expect(last()[1]).toMatchObject({ x: 0.5, y: 0.25, w: 0.5, h: 0.5 });
        pointer(v, 'pointermove', 300, 900); // far past the bottom
        expect(last()[1]).toMatchObject({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
        pointer(v, 'pointerup', 300, 900);
        const count = changes.length;
        pointer(v, 'pointermove', 0, 0); // after release: inert
        expect(changes).toHaveLength(count);
    });

    it('snaps a drag', () => {
        mount({ size: 400, snap: 1 / 8 });
        const c1 = rectEl('c1');
        pointer(c1, 'pointerdown', 10, 10);
        pointer(c1, 'pointermove', 70, 10); // +0.15 → 0.125
        expect(last()[0]).toMatchObject({ x: 0.125, y: 0, w: 0.5, h: 1 });
    });

    it('the corner handle resizes', () => {
        mount({ size: 400, selectedId: 'v' });
        const handle = container.querySelector('[data-resize-handle]');
        if (!handle) throw new Error('no handle');
        // The corner is first in the DOM, so a bare `[data-resize-handle]`
        // selector still finds it (existing callers rely on this).
        expect(handle.getAttribute('data-resize-handle')).toBe('corner');
        pointer(handle, 'pointerdown', 400, 200);
        pointer(handle, 'pointermove', 300, 300); // −0.25 w, +0.25 h
        expect(last()[1]).toMatchObject({ x: 0.5, y: 0, w: 0.25, h: 0.75 });
        pointer(handle, 'pointermove', 0, 0); // shrink past the minimum
        expect(last()[1]).toMatchObject({ x: 0.5, y: 0, w: 0.05, h: 0.05 });
    });

    it('renders three handles on the selection, corner first', () => {
        mount({ size: 400, selectedId: 'v' });
        const handles = [...container.querySelectorAll('[data-resize-handle]')].map(h =>
            h.getAttribute('data-resize-handle'),
        );
        expect(handles).toEqual(['corner', 'right', 'bottom']);
    });

    it('the right handle changes only the width', () => {
        mount({ size: 400, selectedId: 'v' });
        const handle = container.querySelector('[data-resize-handle="right"]');
        if (!handle) throw new Error('no right handle');
        pointer(handle, 'pointerdown', 400, 100);
        pointer(handle, 'pointermove', 300, 300); // −0.25 w; the +0.5 dy is ignored
        expect(last()[1]).toMatchObject({ x: 0.5, y: 0, w: 0.25, h: 0.5 });
    });

    it('the bottom handle changes only the height', () => {
        mount({ size: 400, selectedId: 'v' });
        const handle = container.querySelector('[data-resize-handle="bottom"]');
        if (!handle) throw new Error('no bottom handle');
        pointer(handle, 'pointerdown', 200, 200);
        pointer(handle, 'pointermove', 400, 300); // +0.25 h; the +0.5 dx is ignored
        expect(last()[1]).toMatchObject({ x: 0.5, y: 0, w: 0.5, h: 0.75 });
    });

    // Regression (found in the E2E pass): the pointerdown handler calls
    // preventDefault, which also cancels the browser's focus-on-press, so a
    // clicked rect was selected but the arrow keys the hint promises did nothing.
    it('a press focuses the rect so the arrow keys work straight after a click', () => {
        mount({ size: 400 });
        const v = rectEl('v');
        pointer(v, 'pointerdown', 300, 50);
        pointer(v, 'pointerup', 300, 50);
        expect(document.activeElement).toBe(v);
        key(document.activeElement as HTMLElement, 'ArrowLeft');
        expect(last()[1].x).toBeCloseTo(0.5 - 1 / 32);
    });

    it('a press on the resize handle focuses its rect, not the handle', () => {
        mount({ size: 400, selectedId: 'v' });
        const handle = container.querySelector('[data-resize-handle]');
        if (!handle) throw new Error('no handle');
        pointer(handle, 'pointerdown', 400, 200);
        pointer(handle, 'pointerup', 400, 200);
        expect(document.activeElement).toBe(rectEl('v'));
    });

    it('a press inside injected content never starts a drag', () => {
        mount({ size: 400, renderRectContent: () => <select /> });
        const select = container.querySelector('select');
        if (!select) throw new Error('no select');
        pointer(select, 'pointerdown', 300, 50);
        pointer(select, 'pointermove', 300, 150);
        expect(changes).toHaveLength(0);
    });

    it('readOnly ignores drags and hides the handle', () => {
        mount({ size: 400, readOnly: true, selectedId: 'v' });
        expect(container.querySelector('[data-resize-handle]')).toBeNull();
        const v = rectEl('v');
        pointer(v, 'pointerdown', 300, 50);
        pointer(v, 'pointermove', 300, 150);
        expect(changes).toHaveLength(0);
    });
});
