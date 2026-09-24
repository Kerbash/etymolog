/**
 * Ink bounds of an SVG — the box its marks actually occupy, as opposed to the
 * canvas (`viewBox`) they were drawn on. Pure string parsing, no DOM.
 *
 * Why this exists: every glyph drawn in the glyph editor keeps the editor's
 * square 300 × 300 canvas as its `viewBox`, however small or wide the mark on
 * it. Fitted into a block-script slot with `meet`, a wide "head" form drawn
 * across the canvas still arrives as a SQUARE, so a 100 × 50 slot shows it at
 * 50 × 50 — the whole point of drawing a wide variant for a wide slot is lost.
 * Block composition fits each sign's INK into its slot instead
 * (`nestSvgToInk`, below).
 *
 * The estimate is CONSERVATIVE — it may be slightly larger than the true ink,
 * never smaller, so nothing is ever clipped:
 *  - a Bézier curve lies inside the hull of its control points, so a path's
 *    bounds are taken over every point its commands name;
 *  - strokes are padded by half their `stroke-width`.
 *
 * Anything it cannot measure exactly returns `null` and the caller falls back
 * to the full `viewBox`: a `transform`, an `<image>`, `<text>`, `<use>`, an arc
 * or relative path command, a nested `<svg>` whose viewport is not a plain
 * `xMidYMid meet` box, or any element it does not know. Nested `<svg>` cells —
 * the row a multi-glyph form is combined into — ARE measured, through their
 * viewports. Falling back draws exactly what the app drew before, so
 * an unrecognised source is never made WORSE.
 *
 * @module db/utils/svgInkBounds
 */

import { extractSvgInner, nestSvg, parseSvgViewBox, type SvgRect } from './svgCompose';

export interface InkBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Elements that only group or describe, and paint nothing themselves. */
const CONTAINER_TAGS = new Set(['g', 'defs', 'title', 'desc', 'metadata', 'style']);

/**
 * Margin added around the ink, as a fraction of its larger side, so a mark
 * fitted into a slot does not touch the slot's edge (a neighbouring slot's
 * mark would otherwise butt straight into it).
 */
export const INK_MARGIN_FRACTION = 0.06;

/** The smallest side an ink box may have, as a fraction of its larger side. */
const MIN_SIDE_FRACTION = 0.02;

const NUMBER_RE = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

function attr(tag: string, name: string): string | null {
    const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
    return match ? match[1] : null;
}

function numAttr(tag: string, name: string, fallback: number | null = null): number | null {
    const raw = attr(tag, name);
    if (raw === null) return fallback;
    const value = Number(raw.trim());
    return Number.isFinite(value) ? value : null;
}

class Box {
    minX = Infinity;
    minY = Infinity;
    maxX = -Infinity;
    maxY = -Infinity;

    add(x: number, y: number, pad = 0) {
        this.minX = Math.min(this.minX, x - pad);
        this.minY = Math.min(this.minY, y - pad);
        this.maxX = Math.max(this.maxX, x + pad);
        this.maxY = Math.max(this.maxY, y + pad);
    }

    get empty() {
        return this.minX > this.maxX;
    }
}

/**
 * Points named by an ABSOLUTE path's commands, or `null` for a path using
 * something this does not follow (relative commands, arcs).
 */
function pathPoints(d: string): Array<[number, number]> | null {
    const tokens = d.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
    if (!tokens) return [];
    const points: Array<[number, number]> = [];
    let command = '';
    let cx = 0;
    let cy = 0;
    let i = 0;
    const next = () => Number(tokens[i++]);
    while (i < tokens.length) {
        const token = tokens[i];
        if (/^[A-Za-z]$/.test(token)) {
            command = token;
            i++;
            // Close-path takes no coordinates, in either case.
            if (command === 'Z' || command === 'z') continue;
            if (!'MLTCSQHV'.includes(command)) return null;
            continue;
        }
        switch (command) {
            case 'H':
                cx = next();
                break;
            case 'V':
                cy = next();
                break;
            case 'M':
            case 'L':
            case 'T':
            case 'C':
            case 'S':
            case 'Q':
                cx = next();
                cy = next();
                break;
            default:
                // A number with no command before it.
                return null;
        }
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
        points.push([cx, cy]);
    }
    return points;
}

/** One nested `<svg>` element found at the top level of some markup. */
interface NestedSvg {
    /** Just the opening tag. */
    openTag: string;
    /** Everything between the opening tag and the matching close. */
    inner: string;
}

/**
 * Split markup into its top-level nested `<svg>` elements and everything else.
 * Depth-counted, so a nested svg inside a nested svg stays inside its parent.
 * `null` when the tags do not balance.
 */
function splitNestedSvgs(inner: string): { nested: NestedSvg[]; rest: string } | null {
    const nested: NestedSvg[] = [];
    let rest = '';
    let cursor = 0;
    const tagRe = /<svg\b[^>]*?(\/?)>|<\/svg\s*>/gi;
    let depth = 0;
    let start = -1;
    let openEnd = -1;
    for (const match of inner.matchAll(tagRe)) {
        const index = match.index ?? 0;
        const isClose = match[0].startsWith('</');
        const selfClosing = !isClose && match[1] === '/';
        if (!isClose) {
            if (depth === 0) {
                start = index;
                openEnd = index + match[0].length;
            }
            if (selfClosing) {
                // An empty nested viewport draws nothing; drop it.
                if (depth === 0) {
                    rest += inner.slice(cursor, start);
                    cursor = openEnd;
                }
                continue;
            }
            depth++;
        } else {
            if (depth === 0) return null;
            depth--;
            if (depth === 0) {
                const closeEnd = index + match[0].length;
                rest += inner.slice(cursor, start);
                nested.push({
                    openTag: inner.slice(start, openEnd),
                    inner: inner.slice(openEnd, index),
                });
                cursor = closeEnd;
            }
        }
    }
    if (depth !== 0) return null;
    rest += inner.slice(cursor);
    return { nested, rest };
}

/**
 * The raw ink box of some markup in its own coordinates (no margin), or `null`
 * when it cannot be measured exactly. A nested `<svg>` viewport — the cells a
 * multi-glyph form's row is built from — is measured recursively and mapped
 * through its viewport (`x`/`y`/`width`/`height` + `viewBox`, `xMidYMid meet`,
 * clipped to the viewport as the browser clips it).
 */
function measureInk(inner: string): Box | null {
    const split = splitNestedSvgs(inner);
    if (!split) return null;
    if (/\stransform\s*=/i.test(split.rest)) return null;

    const box = new Box();

    for (const cell of split.nested) {
        const x = numAttr(cell.openTag, 'x', 0);
        const y = numAttr(cell.openTag, 'y', 0);
        const w = numAttr(cell.openTag, 'width');
        const h = numAttr(cell.openTag, 'height');
        const hasViewBox = /\sviewBox\s*=/i.test(cell.openTag);
        const aspect = (attr(cell.openTag, 'preserveAspectRatio') ?? 'xMidYMid meet').trim();
        if (x === null || y === null || w === null || h === null || !(w > 0) || !(h > 0) || !hasViewBox) return null;
        if (aspect !== 'xMidYMid meet' && aspect !== 'xMidYMid') return null;
        if (/\stransform\s*=/i.test(cell.openTag)) return null;
        const vb = parseSvgViewBox(cell.openTag);
        const child = measureInk(cell.inner);
        if (child === null) return null;
        if (child.empty) continue;
        // Clip to the child's viewBox (nested viewports hide overflow).
        const minX = Math.max(child.minX, vb.x);
        const minY = Math.max(child.minY, vb.y);
        const maxX = Math.min(child.maxX, vb.x + vb.width);
        const maxY = Math.min(child.maxY, vb.y + vb.height);
        if (minX > maxX || minY > maxY) continue;
        const scale = Math.min(w / vb.width, h / vb.height);
        const tx = x + (w - vb.width * scale) / 2 - vb.x * scale;
        const ty = y + (h - vb.height * scale) / 2 - vb.y * scale;
        box.add(tx + minX * scale, ty + minY * scale);
        box.add(tx + maxX * scale, ty + maxY * scale);
    }

    for (const match of split.rest.matchAll(/<([a-zA-Z][\w:-]*)\b[^>]*>/g)) {
        const tag = match[0];
        const name = match[1].toLowerCase();
        if (CONTAINER_TAGS.has(name)) continue;

        const strokeWidth = attr(tag, 'stroke') && attr(tag, 'stroke') !== 'none' ? (numAttr(tag, 'stroke-width', 1) ?? 1) : 0;
        const pad = strokeWidth / 2;

        switch (name) {
            case 'path': {
                const points = pathPoints(attr(tag, 'd') ?? '');
                if (points === null) return null;
                for (const [px, py] of points) box.add(px, py, pad);
                break;
            }
            case 'rect': {
                const rx = numAttr(tag, 'x', 0);
                const ry = numAttr(tag, 'y', 0);
                const rw = numAttr(tag, 'width');
                const rh = numAttr(tag, 'height');
                if (rx === null || ry === null || rw === null || rh === null) return null;
                box.add(rx, ry, pad);
                box.add(rx + rw, ry + rh, pad);
                break;
            }
            case 'circle':
            case 'ellipse': {
                const cx = numAttr(tag, 'cx', 0);
                const cy = numAttr(tag, 'cy', 0);
                const rx = name === 'circle' ? numAttr(tag, 'r') : numAttr(tag, 'rx');
                const ry = name === 'circle' ? rx : numAttr(tag, 'ry');
                if (cx === null || cy === null || rx === null || ry === null) return null;
                box.add(cx - rx, cy - ry, pad);
                box.add(cx + rx, cy + ry, pad);
                break;
            }
            case 'line': {
                const coords = ['x1', 'y1', 'x2', 'y2'].map((n) => numAttr(tag, n, 0));
                if (coords.some((c) => c === null)) return null;
                const [x1, y1, x2, y2] = coords as number[];
                box.add(x1, y1, pad);
                box.add(x2, y2, pad);
                break;
            }
            case 'polyline':
            case 'polygon': {
                const values = (attr(tag, 'points') ?? '').match(NUMBER_RE)?.map(Number) ?? [];
                if (values.length % 2 !== 0) return null;
                for (let k = 0; k < values.length; k += 2) box.add(values[k], values[k + 1], pad);
                break;
            }
            default:
                // image, text, use, foreignObject, anything unknown.
                return null;
        }
    }
    return box;
}

/**
 * The ink bounds of `svg` in its own `viewBox` coordinates, margin included,
 * or `null` when they cannot be determined exactly (see the module comment).
 */
export function estimateInkBounds(svg: string): InkBounds | null {
    const box = measureInk(extractSvgInner(svg));
    if (box === null) return null;

    if (box.empty) return null;

    let width = box.maxX - box.minX;
    let height = box.maxY - box.minY;
    const larger = Math.max(width, height);
    if (!(larger > 0)) return null;

    // A perfectly straight mark has a zero side, which is not a valid viewBox.
    const minSide = larger * MIN_SIDE_FRACTION;
    let x = box.minX;
    let y = box.minY;
    if (width < minSide) {
        x -= (minSide - width) / 2;
        width = minSide;
    }
    if (height < minSide) {
        y -= (minSide - height) / 2;
        height = minSide;
    }

    const margin = larger * INK_MARGIN_FRACTION;
    return { x: x - margin, y: y - margin, width: width + margin * 2, height: height + margin * 2 };
}

/**
 * `nestSvg`, but the source's INK — not its canvas — is fitted into `rect`
 * (still `xMidYMid meet`: aspect preserved, centred). A source whose ink cannot
 * be measured is nested exactly as `nestSvg` nests it — into `fallbackRect`
 * when given (a whole canvas carries its own margins, bare ink does not).
 *
 * Used for block-script slots only: the slot rectangle IS the placement there,
 * so the empty canvas around a mark is noise. Everywhere else (a grapheme's
 * glyph row, the word strategies) the canvas position is kept, because it is
 * how a writer places a mark relative to its neighbours.
 */
export function nestSvgToInk(svg: string, rect: SvgRect, fallbackRect: SvgRect = rect): string {
    const ink = estimateInkBounds(svg);
    if (!ink) return nestSvg(svg, fallbackRect);
    const viewBox = [ink.x, ink.y, ink.width, ink.height].map(roundCoord).join(' ');
    const inner = extractSvgInner(svg);
    return `<svg x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${hairlineFloor(inner)}${inner}</svg>`;
}

const DRAWABLE_RE = /<(path|rect|circle|ellipse|line|polyline|polygon)\b([^>]*?)\/?>/gi;
/** Attributes a hairline copy must not inherit from its original. */
const PAINT_ATTR_RE = /\s(?:fill|stroke|stroke-width|stroke-opacity|fill-opacity|style|class|id|vector-effect)\s*=\s*("[^"]*"|'[^']*')/gi;

/**
 * A 1-screen-pixel outline under every mark: `vector-effect:
 * non-scaling-stroke` keeps it 1 px however far the block is scaled down, so
 * a thin pen stroke in a small block never thins to nothing (a 2 px stroke on
 * the 300 px glyph canvas is ~0.3 px in a 36 px word preview). At normal
 * sizes the real ink is wider than 1 px and covers it. Each copy is painted
 * in its original's colour — its stroke, else its fill, else `currentColor`.
 *
 * Only called for sources `estimateInkBounds` measured, so every element here
 * is one of the plain shapes it understands (no transforms), or a plain
 * nested `<svg>` cell, which gets its own floor inside its own viewport.
 */
function hairlineFloor(inner: string): string {
    const split = splitNestedSvgs(inner);
    if (!split) return '';
    let out = '';
    for (const match of split.rest.matchAll(DRAWABLE_RE)) {
        const [tag, name, attrs] = match;
        const stroke = attr(tag, 'stroke');
        const fill = attr(tag, 'fill');
        const paint = stroke && stroke !== 'none' ? stroke : fill && fill !== 'none' ? fill : 'currentColor';
        const geometry = attrs.replace(PAINT_ATTR_RE, '');
        out += `<${name}${geometry} fill="none" stroke="${paint}" stroke-width="1" vector-effect="non-scaling-stroke" data-hairline=""/>`;
    }
    // A multi-glyph row: the same floor inside each cell, in the cell's own
    // viewport so it lands on its mark.
    for (const cell of split.nested) {
        const floor = hairlineFloor(cell.inner);
        if (floor) out += `${cell.openTag}${floor}</svg>`;
    }
    return out;
}

/** Four decimals: deterministic output without float noise in the markup. */
function roundCoord(value: number): string {
    return String(Math.round(value * 10000) / 10000);
}
