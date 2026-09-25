/**
 * Block outlines — a per-device debug overlay for the block script.
 *
 * When on, every word display draws, over each composed block: the block's
 * square (the glyph cell), each template box a sign was fitted into, and the
 * rectangle that sign's ink actually landed in. Signs drawn on their own (not
 * in any block) get their cell outlined in a different colour, so a word that
 * silently fell back to single signs is visible at a glance.
 *
 * Drawn only where a display passes `showBlockOutlines` (the block previews).
 * The previews' switch is remembered in `localStorage` — per device, not per
 * conlang: it is a viewing aid, not part of the script — and shared through
 * one tiny store so every open preview follows it.
 *
 * @module display/spelling/blockOutlines
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'etymolog:blockOutlines';

const listeners = new Set<() => void>();

function read(): boolean {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

let current = typeof window === 'undefined' ? false : read();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function setBlockOutlines(on: boolean): void {
    current = on;
    try {
        if (on) window.localStorage.setItem(STORAGE_KEY, '1');
        else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage blocked (private mode): the overlay still works for this session.
    }
    listeners.forEach((listener) => listener());
}

export function useBlockOutlines(): boolean {
    return useSyncExternalStore(subscribe, () => current, () => false);
}

/** A rectangle in the composed block's 0..100 coordinates. */
export interface OutlineRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** One sign's box in a block, and where its ink was drawn inside it. */
export interface BlockPartOutline {
    box: OutlineRect;
    /** `null` when the part carries no parseable `viewBox`. */
    ink: OutlineRect | null;
}

function num(el: Element, name: string): number | null {
    const raw = el.getAttribute(name);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

/**
 * Where a nested `<svg>`'s viewBox content is drawn inside its viewport, per
 * its `preserveAspectRatio` (`meet` letterboxes inside the box, `slice` covers
 * it and may spill past it).
 */
function placedViewBox(box: OutlineRect, viewBox: string | null, par: string | null): OutlineRect | null {
    const vb = viewBox?.trim().split(/[\s,]+/).map(Number);
    if (!vb || vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || !(vb[2] > 0) || !(vb[3] > 0)) return null;
    const [align = 'xMidYMid', scaleMode = 'meet'] = (par ?? 'xMidYMid meet').trim().split(/\s+/);
    if (align === 'none') return { ...box };
    const sx = box.width / vb[2];
    const sy = box.height / vb[3];
    const scale = scaleMode === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
    const width = vb[2] * scale;
    const height = vb[3] * scale;
    const fx = align.startsWith('xMin') ? 0 : align.startsWith('xMax') ? 1 : 0.5;
    const fy = align.endsWith('YMin') ? 0 : align.endsWith('YMax') ? 1 : 0.5;
    return { x: box.x + (box.width - width) * fx, y: box.y + (box.height - height) * fy, width, height };
}

/**
 * The parts of a composed block document: each top-level nested `<svg>` is
 * one sign placed in its template box (see `blocks/compose.ts`).
 */
export function blockPartOutlines(blockSvg: Element): BlockPartOutline[] {
    const parts: BlockPartOutline[] = [];
    for (const child of Array.from(blockSvg.children)) {
        if (child.tagName.toLowerCase() !== 'svg') continue;
        const width = num(child, 'width');
        const height = num(child, 'height');
        if (width === null || height === null) continue;
        const box = { x: num(child, 'x') ?? 0, y: num(child, 'y') ?? 0, width, height };
        parts.push({
            box,
            ink: placedViewBox(box, child.getAttribute('viewBox'), child.getAttribute('preserveAspectRatio')),
        });
    }
    return parts;
}
