/**
 * Ink bounds + ink-fitted nesting (block-script slots).
 *
 * The regression this pins, found in the E2E pass: glyphs keep the editor's
 * square 300 × 300 canvas as their viewBox, so a WIDE form fitted with `meet`
 * into a wide slot still arrived as a square — the wide variant could never
 * fill the slot it was drawn for.
 */

import { describe, expect, it } from 'vitest';

import { combineSvgRow, nestSvg, parseSvgViewBox } from '../svgCompose';
import { INK_MARGIN_FRACTION, estimateInkBounds, nestSvgToInk } from '../svgInkBounds';

const doc = (inner: string, viewBox = '0 0 300 300') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`;

/** Expected bounds for a raw ink box once the margin is added. */
function withMargin(x: number, y: number, w: number, h: number) {
    const m = Math.max(w, h) * INK_MARGIN_FRACTION;
    return { x: x - m, y: y - m, width: w + 2 * m, height: h + 2 * m };
}

function expectBox(actual: ReturnType<typeof estimateInkBounds>, expected: ReturnType<typeof withMargin>) {
    expect(actual).not.toBeNull();
    expect(actual!.x).toBeCloseTo(expected.x, 6);
    expect(actual!.y).toBeCloseTo(expected.y, 6);
    expect(actual!.width).toBeCloseTo(expected.width, 6);
    expect(actual!.height).toBeCloseTo(expected.height, 6);
}

describe('estimateInkBounds — what the glyph editor emits', () => {
    it('a filled pen stroke (absolute M/Q path, no stroke attr) is bounded by its points', () => {
        const pen = doc('<path d="M 40 15 Q 40 15 120 16 Q 200 17 226 16 L 226 25 Z" fill="currentColor"></path>');
        expectBox(estimateInkBounds(pen), withMargin(40, 15, 186, 10));
    });

    it('a stroked rect is padded by half its stroke-width', () => {
        const box = doc('<rect x="78.5" y="73.3" width="140" height="160" fill="none" stroke="currentColor" stroke-width="2"></rect>');
        expectBox(estimateInkBounds(box), withMargin(77.5, 72.3, 142, 162));
    });

    it('a stroked ellipse / circle uses its radii', () => {
        const ring = doc('<ellipse cx="100" cy="100" rx="20" ry="10" stroke="currentColor" stroke-width="4"></ellipse>');
        expectBox(estimateInkBounds(ring), withMargin(78, 88, 44, 24));
        const dot = doc('<circle cx="50" cy="60" r="5" fill="currentColor"></circle>');
        expectBox(estimateInkBounds(dot), withMargin(45, 55, 10, 10));
    });

    it('stroke without a width defaults to 1; stroke="none" pads nothing', () => {
        expectBox(estimateInkBounds(doc('<line x1="10" y1="10" x2="30" y2="50" stroke="currentColor"></line>')), withMargin(9.5, 9.5, 21, 41));
        expectBox(estimateInkBounds(doc('<rect x="10" y="10" width="20" height="20" stroke="none" stroke-width="8"></rect>')), withMargin(10, 10, 20, 20));
    });

    it('unions several marks, and walks through <g> containers', () => {
        const two = doc('<g><circle cx="20" cy="20" r="5"></circle></g><rect x="100" y="150" width="10" height="10"></rect>');
        expectBox(estimateInkBounds(two), withMargin(15, 15, 95, 145));
    });

    it('follows H / V from the current point, polylines, and lowercase close-path', () => {
        expectBox(estimateInkBounds(doc('<path d="M 10 20 H 90 V 70 z"></path>')), withMargin(10, 20, 80, 50));
        expectBox(estimateInkBounds(doc('<polygon points="0,0 40,10 20,30"></polygon>')), withMargin(0, 0, 40, 30));
    });

    it('a perfectly straight mark gets a minimum side instead of a zero-size box', () => {
        const flat = estimateInkBounds(doc('<path d="M 10 50 L 110 50"></path>'));
        expect(flat).not.toBeNull();
        expect(flat!.height).toBeGreaterThan(0);
        expect(flat!.width).toBeGreaterThan(flat!.height);
    });
});

describe('estimateInkBounds — refuses what it cannot measure exactly', () => {
    it.each([
        ['a transform', '<g transform="scale(2)"><rect x="0" y="0" width="10" height="10"></rect></g>'],
        ['a nested svg that is not a plain meet viewport', '<svg x="0" y="0" width="24" height="24" viewBox="0 0 300 300" preserveAspectRatio="none"><rect x="0" y="0" width="10" height="10"></rect></svg>'],
        ['a nested svg with no size', '<svg viewBox="0 0 300 300"><rect x="0" y="0" width="10" height="10"></rect></svg>'],
        ['a nested svg with a transform', '<svg x="0" y="0" width="24" height="24" viewBox="0 0 300 300" transform="scale(2)"><rect x="0" y="0" width="10" height="10"></rect></svg>'],
        ['something unmeasurable inside a nested svg', '<svg x="0" y="0" width="24" height="24" viewBox="0 0 100 100"><text x="5" y="5">p</text></svg>'],
        ['unbalanced nested svg tags', '<svg x="0" y="0" width="24" height="24" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"></rect>'],
        ['text (an IPA stand-in)', '<text x="50" y="50">p</text>'],
        ['an image', '<image href="data:image/png;base64,AAAA" x="0" y="0" width="10" height="10"></image>'],
        ['a relative path', '<path d="m 10 10 l 20 20"></path>'],
        ['an arc', '<path d="M 10 10 A 5 5 0 0 1 20 20"></path>'],
        ['a rect missing its size', '<rect x="10" y="10"></rect>'],
        ['nothing drawn at all', ''],
    ])('%s → null', (_label, inner) => {
        expect(estimateInkBounds(doc(inner))).toBeNull();
    });
});

describe('nestSvgToInk', () => {
    it('fits a wide mark\'s ink — not its square canvas — into a wide slot', () => {
        const wide = doc('<path d="M 40 140 L 260 140 L 260 160 L 40 160 Z"></path>');
        const nested = nestSvgToInk(wide, { x: 0, y: 0, w: 100, h: 50 });
        const vb = parseSvgViewBox(nested);
        // The canvas is 1:1; the ink (margin included) is ~220 × 33.
        expect(vb.width / vb.height).toBeGreaterThan(5);
        expect(vb.x).toBeGreaterThan(0);
        expect(nested).toContain('width="100" height="50"');
        expect(nested).toContain('preserveAspectRatio="xMidYMid meet"');
        expect(nested).toContain('<path d="M 40 140');
    });

    it('is byte-identical to nestSvg for a source it cannot measure', () => {
        const text = doc('<text x="50" y="50">p</text>', '0 0 100 100');
        const rect = { x: 10, y: 20, w: 30, h: 40 };
        expect(nestSvgToInk(text, rect)).toBe(nestSvg(text, rect));
    });

    it('is deterministic and writes tidy coordinates', () => {
        const pen = doc('<path d="M 38.5 15.558222755584717 Q 38.5 15.55 226.97619861709583 16.326560751987785 Z"></path>');
        const a = nestSvgToInk(pen, { x: 0, y: 0, w: 100, h: 50 });
        expect(nestSvgToInk(pen, { x: 0, y: 0, w: 100, h: 50 })).toBe(a);
        const viewBox = a.match(/viewBox="([^"]+)"/)![1];
        for (const n of viewBox.split(' ')) expect(n.split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
    });
});

describe('estimateInkBounds — multi-glyph rows (nested svg cells)', () => {
    it('maps a nested cell\'s ink through its meet viewport', () => {
        // A 300×300 canvas shown in a 30×30 cell at (60, 0): scale 0.1.
        // A rect at 100..200 inside it lands at 70..80.
        const row = doc('<svg x="60" y="0" width="30" height="30" viewBox="0 0 300 300" preserveAspectRatio="xMidYMid meet"><rect x="100" y="100" width="100" height="100"></rect></svg>', '0 0 200 30');
        expectBox(estimateInkBounds(row), withMargin(70, 10, 10, 10));
    });

    it('centres a non-square viewBox the way meet does, and unions the cells', () => {
        // viewBox 200×100 in a 20×20 cell → scale 0.1, 5 px bands top and bottom.
        const row = doc(
            '<svg x="0" y="0" width="20" height="20" viewBox="0 0 200 100"><rect x="0" y="0" width="200" height="100"></rect></svg>'
            + '<svg x="40" y="0" width="20" height="20" viewBox="0 0 100 100"><circle cx="50" cy="50" r="10"></circle></svg>',
            '0 0 60 20',
        );
        expectBox(estimateInkBounds(row), withMargin(0, 5, 52, 10));
    });

    it('clips ink outside a cell\'s viewBox, as the browser does', () => {
        const row = doc('<svg x="0" y="0" width="10" height="10" viewBox="0 0 100 100"><rect x="50" y="50" width="500" height="500"></rect></svg>', '0 0 10 10');
        expectBox(estimateInkBounds(row), withMargin(5, 5, 5, 5));
    });

    it('reads combineSvgRow output (what a multi-glyph variant becomes)', () => {
        const a = doc('<rect x="100" y="100" width="100" height="100"></rect>');
        const b = doc('<circle cx="150" cy="150" r="50"></circle>');
        const row = combineSvgRow([a, b]);
        const ink = estimateInkBounds(row);
        expect(ink).not.toBeNull();
        const rowBox = parseSvgViewBox(row);
        // Much tighter than the row's own canvas.
        expect(ink!.width).toBeLessThan(rowBox.width);
        expect(ink!.height).toBeLessThan(rowBox.height);
        // And nestSvgToInk puts a hairline inside each cell.
        const nested = nestSvgToInk(row, { x: 0, y: 0, w: 100, h: 50 });
        expect(nested.match(/data-hairline=""/g)).toHaveLength(2);
    });
});

describe('estimateInkBounds — nested cell align × {meet, slice} (BLOCK_PLACEMENT_PLAN.md §2)', () => {
    // A square 100×100 viewBox drawn full, shown in a TALL 40×100 viewport at the
    // origin, inside a 100×100 root document. meet → scale 0.4 (40×40 content, y
    // free); slice → scale 1 (100×100 content overflowing x, clipped to the root).
    const cell = (par: string) =>
        `<svg x="0" y="0" width="40" height="100" viewBox="0 0 100 100" preserveAspectRatio="${par}"><rect x="0" y="0" width="100" height="100"></rect></svg>`;
    const root = (par: string) => doc(cell(par), '0 0 100 100');

    it('meet places the 40×40 ink by the y-alignment, x fixed', () => {
        expectBox(estimateInkBounds(root('xMinYMin meet')), withMargin(0, 0, 40, 40));
        expectBox(estimateInkBounds(root('xMidYMid meet')), withMargin(0, 30, 40, 40));
        expectBox(estimateInkBounds(root('xMaxYMax meet')), withMargin(0, 60, 40, 40));
    });

    it('slice covers the viewport and overflows in x, clipped to the root viewBox', () => {
        // xMin: content [0,100] fits the root — full width.
        expectBox(estimateInkBounds(root('xMinYMin slice')), withMargin(0, 0, 100, 100));
        // xMid: content shifts to [-30,70], clipped left at 0 → width 70.
        expectBox(estimateInkBounds(root('xMidYMid slice')), withMargin(0, 0, 70, 100));
        // xMax: content shifts to [-60,40], clipped left at 0 → width 40.
        expectBox(estimateInkBounds(root('xMaxYMax slice')), withMargin(0, 0, 40, 100));
    });

    it('preserveAspectRatio="none" (non-uniform) stays unmeasurable', () => {
        expect(estimateInkBounds(root('none'))).toBeNull();
    });
});

describe('nestSvgToInk — hairline floor', () => {
    it('adds a 1-screen-pixel, non-scaling outline under each mark, in its own colour', () => {
        const svg = doc('<path d="M 40 140 L 260 140 L 260 142 Z" fill="currentColor"></path><rect x="10" y="10" width="20" height="20" fill="none" stroke="var(--red)" stroke-width="2"></rect>');
        const nested = nestSvgToInk(svg, { x: 0, y: 0, w: 100, h: 50 });
        const hairlines = nested.match(/<(?:path|rect)[^>]*data-hairline=""\/>/g) ?? [];
        expect(hairlines).toHaveLength(2);
        for (const h of hairlines) {
            expect(h).toContain('fill="none"');
            expect(h).toContain('stroke-width="1"');
            expect(h).toContain('vector-effect="non-scaling-stroke"');
        }
        // Paint follows the original: fill → the path's colour, stroke → the rect's.
        expect(hairlines[0]).toContain('stroke="currentColor"');
        expect(hairlines[1]).toContain('stroke="var(--red)"');
        // Geometry is kept; the original paint attributes are not duplicated.
        expect(hairlines[0]).toContain('d="M 40 140 L 260 140 L 260 142 Z"');
        expect(hairlines[1]).not.toContain('stroke-width="2"');
        // Underneath: every hairline comes before the originals.
        expect(nested.lastIndexOf('data-hairline')).toBeLessThan(nested.indexOf('fill="currentColor"></path>'));
    });

    it('an unmeasurable source gets no hairline (it is nested exactly as before)', () => {
        const text = doc('<text x="50" y="50">p</text>');
        expect(nestSvgToInk(text, { x: 0, y: 0, w: 10, h: 10 })).not.toContain('data-hairline');
    });
});
