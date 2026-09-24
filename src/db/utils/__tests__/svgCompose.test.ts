/**
 * svgCompose — the ONE implementation of the SVG composition primitives.
 *
 * Phase 4 of the block-script plan deleted the copies in
 * `glyphCanvasInput/utils/graphemeUtils.ts` and `display/spelling/utils/
 * normalization.ts`; both now delegate here. These tests pin the BEHAVIOUR
 * (they used to compare each copy with its original, which after the merge
 * would compare a function with itself), plus that the old entry points still
 * reach this module.
 */

import { describe, expect, it } from 'vitest';
import {
    combineSvgStrings,
    extractSvgInner as legacyExtractSvgInner,
    parseSvgViewBox as legacyParseSvgViewBox,
} from '../../../components/form/customInput/glyphCanvasInput/utils/graphemeUtils';
import { normalizeGlyphInput } from '../../../components/display/spelling/utils/normalization';
import { GLYPH_CELL_FRACTION } from '../glyphMetrics';
import { combineSvgRow, extractSvgInner, nestSvg, parseSvgViewBox, textSvg } from '../svgCompose';

const a = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0"/></svg>';
const b = '<svg viewBox="0 0 48 48"><svg viewBox="0 0 1 1"><rect/></svg></svg>';
const noViewBox = '<svg><circle r="3"/></svg>';
const DEFAULT_BOX = { x: 0, y: 0, width: 100, height: 100 };

describe('parseSvgViewBox', () => {
    it.each([
        [a, DEFAULT_BOX],
        [b, { x: 0, y: 0, width: 48, height: 48 }],
        ['<svg viewBox="-5, -2.5, 10 1e1"/>', { x: -5, y: -2.5, width: 10, height: 10 }],
        ["<svg viewBox='1 2 3 4'/>", { x: 1, y: 2, width: 3, height: 4 }],
    ])('reads the outer viewBox of %j', (svg, expected) => {
        expect(parseSvgViewBox(svg)).toEqual(expected);
    });

    it.each([noViewBox, '<svg viewBox="0 0 0 10"></svg>', '<svg viewBox="0 0 -1 10"/>', '<svg viewBox="a b c d"/>', 'not svg', ''])(
        'falls back to 0 0 100 100 for %j',
        (svg) => {
            expect(parseSvgViewBox(svg)).toEqual(DEFAULT_BOX);
        },
    );
});

describe('extractSvgInner', () => {
    it('returns everything between the opening tag and the LAST closing tag (nested svg survives)', () => {
        expect(extractSvgInner(b)).toBe('<svg viewBox="0 0 1 1"><rect/></svg>');
        expect(extractSvgInner(a)).toBe('<path d="M0 0"/>');
    });

    it('returns the input unchanged when it is not a well-formed svg document', () => {
        expect(extractSvgInner('not svg')).toBe('not svg');
        expect(extractSvgInner('<svg viewBox="0 0 1 1">')).toBe('<svg viewBox="0 0 1 1">');
        expect(extractSvgInner('')).toBe('');
    });
});

describe('nestSvg', () => {
    it('keeps the source viewBox and places the cell', () => {
        expect(nestSvg(b, { x: 1, y: 2, w: 3, h: 4 })).toBe(
            '<svg x="1" y="2" width="3" height="4" viewBox="0 0 48 48" preserveAspectRatio="xMidYMid meet"><svg viewBox="0 0 1 1"><rect/></svg></svg>',
        );
    });
});

describe('combineSvgRow', () => {
    it('zero sources → empty string; one source → returned unchanged', () => {
        expect(combineSvgRow([])).toBe('');
        expect(combineSvgRow([b])).toBe(b);
    });

    it('several sources → one row whose boxes advance by the glyph CELL plus spacing', () => {
        const out = combineSvgRow([a, b, noViewBox], 2, 24);
        const step = 24 * GLYPH_CELL_FRACTION + 2;
        const width = 2 * step + 24;
        expect(out.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 24" width="${width}" height="24">`)).toBe(true);
        expect(out).toContain(nestSvg(a, { x: 0, y: 0, w: 24, h: 24 }));
        expect(out).toContain(nestSvg(b, { x: step, y: 0, w: 24, h: 24 }));
        expect(out).toContain(nestSvg(noViewBox, { x: 2 * step, y: 0, w: 24, h: 24 }));
    });

    it('graphemeUtils keeps its historical names as thin delegates', () => {
        for (const svgs of [[], [a], [a, b], [a, b, noViewBox]]) {
            expect(combineSvgStrings(svgs)).toBe(combineSvgRow(svgs));
            expect(combineSvgStrings(svgs, 5, 40)).toBe(combineSvgRow(svgs, 5, 40));
        }
        expect(legacyParseSvgViewBox).toBe(parseSvgViewBox);
        expect(legacyExtractSvgInner).toBe(extractSvgInner);
    });
});

describe('textSvg', () => {
    it('escapes the markup-significant characters', () => {
        const out = textSvg('<&>"');
        expect(out).toContain('>&lt;&amp;&gt;&quot;</text>');
        expect(out).toContain('viewBox="0 0 100 100"');
        expect(out).toContain('fill="currentColor"');
    });

    it.each(['ə', 'ka'])('is what normalization draws for the virtual glyph %j', (char) => {
        const [virtual] = normalizeGlyphInput([{ type: 'ipa', position: 0, ipaCharacter: char }]);
        expect(virtual.svg_data).toBe(textSvg(char));
    });
});
