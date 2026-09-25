// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';

import { blockPartOutlines, setBlockOutlines } from '../blockOutlines';

function parse(svg: string): Element {
    return new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
}

describe('blockPartOutlines', () => {
    it('returns each nested cell box and where meet placed its ink', () => {
        // A 20 × 40 box holding a square ink box: meet fits it to the width,
        // centred, so it lands 20 × 20 with 10 of slack above and below.
        const doc = parse(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            + '<svg x="25" y="25" width="20" height="40" viewBox="0 0 10 10" preserveAspectRatio="xMidYMid meet"></svg>'
            + '</svg>',
        );
        expect(blockPartOutlines(doc)).toEqual([
            { box: { x: 25, y: 25, width: 20, height: 40 }, ink: { x: 25, y: 35, width: 20, height: 20 } },
        ]);
    });

    it('honours the pin and slice (fill) placement', () => {
        const doc = parse(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            + '<svg x="0" y="0" width="20" height="40" viewBox="0 0 10 10" preserveAspectRatio="xMinYMin meet"></svg>'
            + '<svg x="0" y="0" width="20" height="40" viewBox="0 0 10 10" preserveAspectRatio="xMidYMid slice" overflow="visible"></svg>'
            + '</svg>',
        );
        const [pinned, filled] = blockPartOutlines(doc);
        expect(pinned.ink).toEqual({ x: 0, y: 0, width: 20, height: 20 });
        // slice covers the box: 40 × 40, spilling 10 past each side.
        expect(filled.ink).toEqual({ x: -10, y: 0, width: 40, height: 40 });
    });

    it('ignores non-svg children and reports a missing viewBox as unknown ink', () => {
        const doc = parse(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            + '<path d="M0 0 L10 10"/>'
            + '<svg x="5" y="5" width="10" height="10"></svg>'
            + '</svg>',
        );
        expect(blockPartOutlines(doc)).toEqual([{ box: { x: 5, y: 5, width: 10, height: 10 }, ink: null }]);
    });
});

describe('setBlockOutlines', () => {
    afterEach(() => setBlockOutlines(false));

    it('persists the flag per device', () => {
        setBlockOutlines(true);
        expect(window.localStorage.getItem('etymolog:blockOutlines')).toBe('1');
        setBlockOutlines(false);
        expect(window.localStorage.getItem('etymolog:blockOutlines')).toBeNull();
    });
});
