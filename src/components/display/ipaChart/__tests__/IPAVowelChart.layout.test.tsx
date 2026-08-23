// @vitest-environment happy-dom
/**
 * IPAVowelChart — where the cells are positioned.
 *
 * The vowel cells are HTML inside SVG `<foreignObject>`s. They used to be
 * placed by a `transform="translate(…)"` on a parent `<g>`, which Chrome and
 * Firefox honour and WebKit does NOT: in Safari every vowel rendered at the
 * trapezoid's origin, bunched in one corner. The position now lives in the
 * `x`/`y` attributes of the `<foreignObject>` itself, which every engine
 * applies. Pinned so a tidy-up cannot move it back onto a transform.
 */

import { afterEach, describe, expect, it } from 'vitest';

import IPAVowelChart from '../IPAVowelChart';
import { IPA_VOWEL_CHART } from '../../../../data/ipaChartData';
import { mount, type Mounted } from './harness';

let mounted: Mounted | null = null;

afterEach(() => {
    mounted?.unmount();
    mounted = null;
});

describe('IPAVowelChart cell placement', () => {
    it('positions every cell with x/y on the foreignObject, never a parent transform', () => {
        mounted = mount(<IPAVowelChart phonemeMap={new Map()} />);
        const cells = Array.from(mounted.container.querySelectorAll('foreignObject'));
        expect(cells.length).toBe(IPA_VOWEL_CHART.length);

        for (const cell of cells) {
            const x = Number(cell.getAttribute('x'));
            const y = Number(cell.getAttribute('y'));
            expect(Number.isFinite(x)).toBe(true);
            expect(Number.isFinite(y)).toBe(true);
            // Inside the 600×600 viewBox, not at the origin.
            expect(x).toBeGreaterThan(0);
            expect(y).toBeGreaterThan(0);
            expect(x).toBeLessThan(600);
            expect(y).toBeLessThan(600);

            let ancestor: Element | null = cell.parentElement;
            while (ancestor && ancestor.tagName.toLowerCase() !== 'svg') {
                expect(ancestor.getAttribute('transform')).toBeNull();
                ancestor = ancestor.parentElement;
            }
        }
    });

    it('spreads the cells across the trapezoid rather than stacking them', () => {
        mounted = mount(<IPAVowelChart phonemeMap={new Map()} />);
        const cells = Array.from(mounted.container.querySelectorAll('foreignObject'));
        const xs = new Set(cells.map((c) => c.getAttribute('x')));
        const ys = new Set(cells.map((c) => c.getAttribute('y')));
        // Three backness columns (plus rounded/unrounded pair offsets) and
        // seven heights: well over a handful of distinct positions each way.
        expect(xs.size).toBeGreaterThanOrEqual(6);
        expect(ys.size).toBeGreaterThanOrEqual(6);
        // The close front unrounded /i/ sits top-left, the open back /ɑ/ lower and to the right.
        const byIpa = (ipa: string) =>
            cells.find((c) => c.textContent?.trim() === ipa || c.querySelector(`[aria-label^="${ipa}"]`));
        const i = byIpa('i');
        const a = byIpa('ɑ');
        expect(i && a).toBeTruthy();
        expect(Number(i!.getAttribute('y'))).toBeLessThan(Number(a!.getAttribute('y')));
        expect(Number(i!.getAttribute('x'))).toBeLessThan(Number(a!.getAttribute('x')));
    });
});
