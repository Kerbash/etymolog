/**
 * RectLayoutEditor — a square canvas of draggable, resizable rectangles.
 *
 * The layout canvas of the Block Designer's `TemplateEditor` (BLOCK_SCRIPT_PLAN
 * Phase 5): one rectangle per pattern role, on the same unit square a
 * `BlockSlot` is stored in. It knows nothing about roles, groups or schemes —
 * the caller maps slots to `LayoutRect`s and back, and injects per-rectangle
 * controls (a variant-group `<select>`) through `renderRectContent`.
 *
 * ```
 *  ┌──────────┬──────────┐   ← faint 4×4 guide grid
 *  │ C1       │ V       ▐│   ← right-edge handle (width only), selected rect
 *  │ [group▾] │ [group▾] │   ← renderRectContent (never starts a drag)
 *  │          │  ▂▂▂    ◢│   ← bottom-edge (height) + corner (both) handles
 *  └──────────┴──────────┘
 *  V — x 50% · y 0% · w 50% · h 100%   ← readout for the selection
 * ```
 *
 * Interaction:
 *  - **pointer**: press a rectangle's body to select + MOVE it. The selected
 *    rect carries three resize handles (in DOM order): a bottom-right CORNER
 *    (width + height), a RIGHT edge (width only) and a BOTTOM edge (height
 *    only), each with a generous transparent hit area larger than the drawn
 *    shape. Pointer events with `setPointerCapture` (mouse, pen and touch
 *    alike, and the drag survives leaving the canvas); the drag origin lives in
 *    a ref so a move never re-renders by itself. Every move is computed from the
 *    ORIGIN rectangle plus the total pointer delta — never incrementally — so
 *    clamping at an edge does not accumulate drift and snapping cannot "stick".
 *  - **keyboard**: each rectangle is a focusable `role="button"` with its
 *    geometry in its accessible name. Arrows move by `snap ?? 1/32`,
 *    Shift+Arrows resize, Enter/Space select. A visually-hidden polite live
 *    region reports the result of each keyboard change.
 *  - **readOnly**: renders identically (rectangles stay focusable so their
 *    geometry can still be read) but every handler is inert.
 *
 * Controlled: `rects` in, `onChange(nextRects)` out; the array order is the
 * paint order (later on top) and is never changed here. Selection is
 * controlled when `selectedId` is passed (even `null`), otherwise owned.
 *
 * All geometry lives in `rectLayoutMath.ts`. Colours are theme tokens; a
 * rectangle's own `colour` is applied as the `--rect-colour` custom property.
 * No memoisation on purpose (P8): handlers are plain closures over the
 * current props, which is what a controlled drag needs anyway.
 *
 * @module writingSystem/blocks/RectLayoutEditor
 */

import { useId, useRef, useState } from 'react';
import type {
    CSSProperties,
    KeyboardEvent as ReactKeyboardEvent,
    PointerEvent as ReactPointerEvent,
    ReactNode,
} from 'react';
import classNames from 'classnames';

import {
    DEFAULT_KEY_STEP,
    describePosition,
    describeRect,
    formatPercent,
    moveRect,
    resizeRect,
    sameGeometry,
} from './rectLayoutMath';
import type { LayoutRect } from './rectLayoutMath';

import styles from './RectLayoutEditor.module.scss';

export type { LayoutRect } from './rectLayoutMath';

export interface RectLayoutEditorProps {
    /** Controlled rectangles; array order = paint order (later on top). */
    rects: LayoutRect[];
    /** Receives the WHOLE next array (same order, one rect replaced). */
    onChange: (rects: LayoutRect[]) => void;
    /** Controlled selection. Omit (undefined) to let the editor own it. */
    selectedId?: string | null;
    onSelect?: (id: string | null) => void;
    /** Grid step on the unit square, e.g. `1/8`; `null`/omitted = free. */
    snap?: number | null;
    /** Rendered width/height in px (shrinks to fit a narrower parent). */
    size?: number;
    readOnly?: boolean;
    /** Rendered INSIDE each rectangle; pointer/keys there never drag. */
    renderRectContent?: (rect: LayoutRect) => ReactNode;
    className?: string;
    'aria-label'?: string;
}

type DragMode = 'move' | 'resize' | 'resize-w' | 'resize-h';

/** Everything a pointer drag needs, captured at pointerdown. */
interface DragState {
    pointerId: number;
    mode: DragMode;
    startX: number;
    startY: number;
    /** The rectangle as it was when the drag began. */
    origin: LayoutRect;
    /** Rendered canvas edge in px, measured once per drag. */
    scale: number;
}

const ARROW_DELTAS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
};

type RectStyle = CSSProperties & { '--rect-colour'?: string };

export default function RectLayoutEditor({
    rects,
    onChange,
    selectedId,
    onSelect,
    snap = null,
    size = 320,
    readOnly = false,
    renderRectContent,
    className,
    'aria-label': ariaLabel = 'Layout canvas',
}: RectLayoutEditorProps) {
    const readoutId = useId();
    const canvasRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const [ownSelectedId, setOwnSelectedId] = useState<string | null>(null);
    const [announcement, setAnnouncement] = useState('');

    const isControlled = selectedId !== undefined;
    const requestedId = isControlled ? selectedId : ownSelectedId;
    // A selection pointing at a rect that no longer exists is no selection.
    const selectedRect = rects.find(r => r.id === requestedId) ?? null;
    const activeId = selectedRect ? selectedRect.id : null;

    function select(id: string | null) {
        if (id === activeId) return;
        if (!isControlled) setOwnSelectedId(id);
        if (onSelect) onSelect(id);
    }

    /** Emit `next` in place of its namesake, unless nothing changed. */
    function commit(next: LayoutRect): boolean {
        const current = rects.find(r => r.id === next.id);
        if (!current || sameGeometry(current, next)) return false;
        onChange(rects.map(r => (r.id === next.id ? next : r)));
        return true;
    }

    // ── pointer ────────────────────────────────────────────────────────────

    function beginDrag(event: ReactPointerEvent<HTMLElement>, rect: LayoutRect, mode: DragMode) {
        if (readOnly || event.button !== 0) return;
        // The canvas's own pointerdown would otherwise read this as a
        // press on empty space and clear the selection.
        event.stopPropagation();
        event.preventDefault();
        select(rect.id);
        // preventDefault above also cancels the browser's focus-on-press, so
        // a clicked rectangle would be selected but deaf to the arrow keys
        // the hint below the canvas promises. Focus it by hand — the
        // rectangle itself, even when the press landed on its resize handle.
        const rectElement = event.currentTarget.closest<HTMLElement>('[data-rect-id]');
        rectElement?.focus({ preventScroll: true });
        const measured = canvasRef.current ? canvasRef.current.getBoundingClientRect().width : 0;
        dragRef.current = {
            pointerId: event.pointerId,
            mode,
            startX: event.clientX,
            startY: event.clientY,
            origin: rect,
            // happy-dom / a detached node measure 0; fall back to the prop.
            scale: measured > 0 ? measured : size,
        };
        const target = event.currentTarget;
        if (typeof target.setPointerCapture === 'function') {
            try {
                target.setPointerCapture(event.pointerId);
            } catch (_err) {
                // Synthetic / already-released pointers throw; the drag still
                // works while the pointer stays over the canvas.
            }
        }
    }

    function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || readOnly) return;
        const dx = (event.clientX - drag.startX) / drag.scale;
        const dy = (event.clientY - drag.startY) / drag.scale;
        commit(resizeForMode(drag.mode, drag.origin, dx, dy));
    }

    /** The rectangle a drag of `mode` produces from its origin and pointer delta. */
    function resizeForMode(mode: DragMode, origin: LayoutRect, dx: number, dy: number): LayoutRect {
        switch (mode) {
            case 'move':
                return moveRect(origin, dx, dy, snap);
            case 'resize-w':
                return resizeRect(origin, dx, 0, snap);
            case 'resize-h':
                return resizeRect(origin, 0, dy, snap);
            default:
                return resizeRect(origin, dx, dy, snap);
        }
    }

    function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        dragRef.current = null;
        const target = event.target as Element;
        if (typeof target.hasPointerCapture === 'function' && target.hasPointerCapture(event.pointerId)) {
            target.releasePointerCapture(event.pointerId);
        }
    }

    function handleCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
        // Only a press on the bare canvas (rect presses stop propagation).
        if (readOnly || event.target !== event.currentTarget) return;
        select(null);
    }

    // ── keyboard ───────────────────────────────────────────────────────────

    function handleRectKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, rect: LayoutRect) {
        // Keys typed into injected content (a <select>) are that control's.
        if (readOnly || event.target !== event.currentTarget) return;

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            select(rect.id);
            return;
        }

        const delta = ARROW_DELTAS[event.key];
        if (!delta) return;
        event.preventDefault();
        select(rect.id);

        const step = snap ?? DEFAULT_KEY_STEP;
        const resizing = event.shiftKey;
        const next = resizing
            ? resizeRect(rect, delta[0] * step, delta[1] * step, snap)
            : moveRect(rect, delta[0] * step, delta[1] * step, snap);
        if (commit(next)) {
            setAnnouncement(`${rect.label} ${resizing ? 'resized' : 'moved'} to ${describePosition(next)}`);
        }
    }

    // ── render ─────────────────────────────────────────────────────────────

    const readout = selectedRect
        ? `${selectedRect.label} — x ${formatPercent(selectedRect.x)} · y ${formatPercent(selectedRect.y)} · w ${formatPercent(selectedRect.w)} · h ${formatPercent(selectedRect.h)}`
        : readOnly
            ? 'Layout (read only)'
            : 'Select a rectangle to move it. Arrows move, Shift+arrows resize.';

    return (
        <div className={classNames(styles.editor, className)}>
            <div
                ref={canvasRef}
                className={classNames(styles.canvas, readOnly && styles.readOnly)}
                style={{ width: size }}
                role="group"
                aria-label={ariaLabel}
                aria-describedby={readoutId}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
            >
                {rects.map(rect => {
                    const isSelected = rect.id === activeId;
                    const style: RectStyle = {
                        left: `${rect.x * 100}%`,
                        top: `${rect.y * 100}%`,
                        width: `${rect.w * 100}%`,
                        height: `${rect.h * 100}%`,
                    };
                    if (rect.colour) style['--rect-colour'] = rect.colour;
                    return (
                        <div
                            key={rect.id}
                            className={classNames(styles.rect, isSelected && styles.selected)}
                            style={style}
                            role="button"
                            tabIndex={0}
                            aria-label={describeRect(rect)}
                            aria-pressed={isSelected}
                            aria-disabled={readOnly || undefined}
                            data-rect-id={rect.id}
                            onPointerDown={event => beginDrag(event, rect, 'move')}
                            onKeyDown={event => handleRectKeyDown(event, rect)}
                        >
                            <span className={styles.label} aria-hidden="true">
                                {rect.label}
                            </span>
                            {renderRectContent && (
                                <div
                                    className={styles.content}
                                    data-rect-content=""
                                    // Injected controls own their pointer + keys.
                                    onPointerDown={event => event.stopPropagation()}
                                    onKeyDown={event => event.stopPropagation()}
                                >
                                    {renderRectContent(rect)}
                                </div>
                            )}
                            {isSelected && !readOnly && (
                                <>
                                    <span
                                        className={classNames(styles.handle, styles.handleCorner)}
                                        aria-hidden="true"
                                        data-resize-handle="corner"
                                        onPointerDown={event => beginDrag(event, rect, 'resize')}
                                    />
                                    <span
                                        className={classNames(styles.handle, styles.handleRight)}
                                        aria-hidden="true"
                                        data-resize-handle="right"
                                        onPointerDown={event => beginDrag(event, rect, 'resize-w')}
                                    />
                                    <span
                                        className={classNames(styles.handle, styles.handleBottom)}
                                        aria-hidden="true"
                                        data-resize-handle="bottom"
                                        onPointerDown={event => beginDrag(event, rect, 'resize-h')}
                                    />
                                </>
                            )}
                        </div>
                    );
                })}
            </div>

            <p id={readoutId} className={styles.readout}>
                {readout}
            </p>

            <span className={styles.visuallyHidden} role="status" aria-live="polite">
                {announcement}
            </span>
        </div>
    );
}
