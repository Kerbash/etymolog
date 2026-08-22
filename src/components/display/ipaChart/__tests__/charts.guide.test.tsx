// @vitest-environment happy-dom
/**
 * The three charts against a guide map.
 *
 * One rule, asserted from both sides on every chart: the symbols IN the map are
 * painted with their tier, and NOTHING else on the chart is painted. An overlay
 * that lights one extra cell is worse than no overlay — it is advice that is
 * quietly wrong, and there is no way for the reader to tell.
 *
 * The syllabary is the odd one out on purpose: it paints its ROW and COLUMN
 * headers rather than its ~2 000 syllable cells. Both halves of that are pinned
 * (the headers ARE painted, the cells are NOT), because "paint the headers" is a
 * decision a future edit could reverse without any test noticing.
 */

import { describe, it, expect, afterEach } from 'vitest';

import IPAConsonantChart from '../IPAConsonantChart';
import IPAVowelChart from '../IPAVowelChart';
import IPASyllabaryChart from '../IPASyllabaryChart';
import type { GuideMap } from '../../../../generator';
import type { GraphemeComplete } from '../../../../db/types';
import cellStyles from '../IPAChartCell.module.scss';
import syllabaryStyles from '../IPASyllabaryChart.module.scss';
import { mount, type Mounted } from './harness';

let view: Mounted | null = null;

afterEach(() => {
    view?.unmount();
    view = null;
});

const EMPTY = new Map<string, GraphemeComplete>();

/** The symbol each painted cell belongs to, read off its `aria-label`. */
function paintedSymbols(scope: ParentNode, tier: string): string[] {
    return Array.from(scope.querySelectorAll(`[data-guide="${tier}"]`))
        .map((el) => (el.getAttribute('aria-label') ?? '').split(/[:—]/)[0].trim())
        .sort();
}

describe('IPAConsonantChart — guide overlay', () => {
    const guide: GuideMap = new Map([
        ['t', 'core'],
        ['l', 'core'],
        ['z', 'flavour'],
        ['q', 'avoid'],
    ]);

    it('paints exactly the symbols the map names', () => {
        view = mount(
            <IPAConsonantChart phonemeMap={EMPTY} guide={guide} guideLabel="Elvish / flowing" />,
        );

        expect(paintedSymbols(view.container, 'core')).toEqual(['l', 't']);
        expect(paintedSymbols(view.container, 'flavour')).toEqual(['z']);
        expect(paintedSymbols(view.container, 'avoid')).toEqual(['q']);
    });

    it('paints nothing else on the chart', () => {
        view = mount(<IPAConsonantChart phonemeMap={EMPTY} guide={guide} />);

        expect(view.container.querySelectorAll('[data-guide]')).toHaveLength(4);
    });

    it('paints nothing at all without a guide', () => {
        view = mount(<IPAConsonantChart phonemeMap={EMPTY} />);

        expect(view.container.querySelectorAll('[data-guide]')).toHaveLength(0);
        expect(view.container.innerHTML).not.toContain(cellStyles.guideCore);
    });

    it('carries the preset name into each painted cell', () => {
        view = mount(
            <IPAConsonantChart phonemeMap={EMPTY} guide={guide} guideLabel="Harsh / guttural" />,
        );

        const painted = view.container.querySelector('[data-guide="avoid"]');
        expect(painted?.getAttribute('aria-label')).toContain('Harsh / guttural: sound to avoid');
    });

    it('ignores a map whose symbols are not on the chart', () => {
        // A preset lists `pʰ`; `guideMapFor` keys by BASE, so `pʰ` never
        // reaches a chart. An unknown key must simply paint nothing.
        view = mount(
            <IPAConsonantChart
                phonemeMap={EMPTY}
                guide={new Map([['not-a-symbol', 'core']]) as GuideMap}
            />,
        );

        expect(view.container.querySelectorAll('[data-guide]')).toHaveLength(0);
    });

    it('repaints when the guide changes', () => {
        // The cells are rendered through a `useCallback`/`useMemo` pair. If
        // `guide` is not in their dependency arrays the overlay freezes on the
        // first flavour and every later pick is a no-op on screen.
        view = mount(<IPAConsonantChart phonemeMap={EMPTY} guide={guide} />);
        expect(paintedSymbols(view.container, 'core')).toEqual(['l', 't']);

        const next: GuideMap = new Map([['k', 'core']]);
        view.rerender(<IPAConsonantChart phonemeMap={EMPTY} guide={next} />);

        expect(paintedSymbols(view.container, 'core')).toEqual(['k']);
        expect(view.container.querySelectorAll('[data-guide]')).toHaveLength(1);
    });

    it('clears the overlay when the guide goes back to null', () => {
        view = mount(<IPAConsonantChart phonemeMap={EMPTY} guide={guide} />);
        view.rerender(<IPAConsonantChart phonemeMap={EMPTY} guide={null} />);

        expect(view.container.querySelectorAll('[data-guide]')).toHaveLength(0);
    });
});

describe('IPAVowelChart — guide overlay', () => {
    const guide: GuideMap = new Map([
        ['a', 'core'],
        ['i', 'core'],
        ['y', 'avoid'],
    ]);

    it('paints exactly the vowels the map names', () => {
        view = mount(<IPAVowelChart phonemeMap={EMPTY} guide={guide} guideLabel="Island" />);

        expect(paintedSymbols(view.container, 'core')).toEqual(['a', 'i']);
        expect(paintedSymbols(view.container, 'avoid')).toEqual(['y']);
        expect(view.container.querySelectorAll('[data-guide]')).toHaveLength(3);
    });

    it('paints nothing without a guide', () => {
        view = mount(<IPAVowelChart phonemeMap={EMPTY} />);

        expect(view.container.querySelectorAll('[data-guide]')).toHaveLength(0);
    });

    it('repaints when the guide changes', () => {
        view = mount(<IPAVowelChart phonemeMap={EMPTY} guide={guide} />);
        view.rerender(<IPAVowelChart phonemeMap={EMPTY} guide={new Map([['u', 'flavour']])} />);

        expect(paintedSymbols(view.container, 'flavour')).toEqual(['u']);
        expect(view.container.querySelectorAll('[data-guide]')).toHaveLength(1);
    });

    it('keeps its cells inside the SVG foreignObjects', () => {
        // The clipping that forced `outline` instead of `box-shadow` is a fact
        // about this structure; if the cells ever stop being in a
        // `foreignObject`, the vowel-specific styling stops being needed.
        view = mount(<IPAVowelChart phonemeMap={EMPTY} guide={guide} />);

        const painted = view.container.querySelector('[data-guide]');
        expect(painted?.closest('foreignObject')).not.toBeNull();
    });
});

describe('IPASyllabaryChart — guide overlay', () => {
    const guide: GuideMap = new Map([
        ['k', 'core'],
        ['a', 'core'],
        ['q', 'avoid'],
    ]);

    const headers = (scope: ParentNode, className: string) =>
        Array.from(scope.querySelectorAll(`th.${className}`)).map((th) => th.textContent);

    it('paints the consonant row header and the vowel column header', () => {
        view = mount(
            <IPASyllabaryChart phonemeMap={EMPTY} guide={guide} guideLabel="Japanese-like" />,
        );

        expect(headers(view.container, syllabaryStyles.guideCore).sort()).toEqual(['a', 'k']);
        expect(headers(view.container, syllabaryStyles.guideAvoid)).toEqual(['q']);
    });

    it('paints no syllable cells', () => {
        view = mount(<IPASyllabaryChart phonemeMap={EMPTY} guide={guide} />);

        const paintedCells = view.container.querySelectorAll(
            `td.${syllabaryStyles.guideCore}, td.${syllabaryStyles.guideAvoid}, td.${syllabaryStyles.guideFlavour}`,
        );
        expect(paintedCells).toHaveLength(0);
    });

    it('names the tier in the header title', () => {
        view = mount(
            <IPASyllabaryChart phonemeMap={EMPTY} guide={guide} guideLabel="Japanese-like" />,
        );

        const header = view.container.querySelector(`th.${syllabaryStyles.guideCore}`);
        expect(header?.getAttribute('title')).toContain('Japanese-like: core sound');
    });

    it('leaves the plain title on an unpainted header', () => {
        view = mount(<IPASyllabaryChart phonemeMap={EMPTY} guide={guide} />);

        const headersWithoutGuide = Array.from(view.container.querySelectorAll('th')).filter(
            (th) => th.textContent === 'm',
        );
        expect(headersWithoutGuide[0]?.getAttribute('title')).toBe('m');
    });

    it('paints nothing without a guide', () => {
        view = mount(<IPASyllabaryChart phonemeMap={EMPTY} />);

        expect(view.container.innerHTML).not.toContain(syllabaryStyles.guideCore);
    });

    it('repaints when the guide changes', () => {
        view = mount(<IPASyllabaryChart phonemeMap={EMPTY} guide={guide} />);
        view.rerender(<IPASyllabaryChart phonemeMap={EMPTY} guide={new Map([['n', 'core']])} />);

        expect(headers(view.container, syllabaryStyles.guideCore)).toEqual(['n']);
    });
});
