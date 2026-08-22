// @vitest-environment happy-dom
/**
 * IPAExtraSoundsChart — the strip that closes the guide's blind spot.
 *
 * Before this component the pulmonic grid and the vowel trapezoid were the
 * whole chart, so a preset whose core includes `t͡ʃ`, `w` or `ɕ` had those
 * sounds COUNTED by the legend and never painted: the panel said seventeen and
 * the chart lit twelve. What is pinned here is therefore not "it renders" but
 * the two properties that made it worth building —
 *
 *   1. every group's contents come from the SHARED data tables, so a sound the
 *      generator knows about cannot go missing from the chart;
 *   2. a grapheme is matched by SOUND, not by spelling, so a script whose
 *      phoneme row says `tʃ` lights the `t͡ʃ` cell instead of being offered a
 *      second grapheme for a sound it already writes.
 */

import { describe, it, expect, afterEach } from 'vitest';

import IPAExtraSoundsChart from '../IPAExtraSoundsChart';
import IPACombinedChart from '../IPACombinedChart';
import {
    getAllConsonantSymbols,
    getAllVowelSymbols,
    IPA_AFFRICATES,
    IPA_CLICKS,
    IPA_IMPLOSIVES,
} from '../../../../data/ipaChartData';
import { EXTRA_SYMBOLS, guideMapFor, getPreset } from '../../../../generator';
import type { GuideMap } from '../../../../generator';
import type { GraphemeComplete } from '../../../../db/types';
import { mount, type Mounted } from './harness';

let view: Mounted | null = null;

afterEach(() => {
    view?.unmount();
    view = null;
});

const EMPTY = new Map<string, GraphemeComplete>();

function fakeGrapheme(name: string): GraphemeComplete {
    return {
        id: 1,
        name,
        glyphs: [
            {
                id: 11,
                name: `glyph-${name}`,
                svg_data: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
            },
        ],
        phonemes: [],
    } as unknown as GraphemeComplete;
}

/** Every symbol the strip drew, read off the cells' accessible names. */
function drawnSymbols(scope: ParentNode): string[] {
    return Array.from(scope.querySelectorAll('[role="button"][aria-label]'))
        .map((el) => (el.getAttribute('aria-label') ?? '').split(/[:—]/)[0].trim());
}

/** The symbol of each cell painted with `tier`. */
function paintedSymbols(scope: ParentNode, tier: string): string[] {
    return Array.from(scope.querySelectorAll(`[data-guide="${tier}"]`))
        .map((el) => (el.getAttribute('aria-label') ?? '').split(/[:—]/)[0].trim())
        .sort();
}

const MAIN_SYMBOLS = new Set([...getAllConsonantSymbols(), ...getAllVowelSymbols()]);

describe('IPAExtraSoundsChart — what it draws', () => {
    it('draws every affricate, click and implosive in the data', () => {
        view = mount(<IPAExtraSoundsChart phonemeMap={EMPTY} />);
        const drawn = new Set(drawnSymbols(view.container));

        for (const entry of IPA_AFFRICATES) expect(drawn.has(entry.ipa), entry.ipa).toBe(true);
        for (const entry of IPA_CLICKS) expect(drawn.has(entry.ipa), entry.ipa).toBe(true);
        for (const entry of IPA_IMPLOSIVES) expect(drawn.has(entry.ipa), entry.ipa).toBe(true);
    });

    it('draws every EXTRA_SYMBOLS sound the two main charts lack', () => {
        view = mount(<IPAExtraSoundsChart phonemeMap={EMPTY} />);
        const drawn = new Set(drawnSymbols(view.container));

        // `w ʍ ɕ ʑ ɫ ɚ ɝ ɹ̠` today — derived rather than listed, so a symbol
        // added to the feature table appears on the chart with it.
        const expected = EXTRA_SYMBOLS.filter(
            (entry) => entry.role === 'symbol' && !MAIN_SYMBOLS.has(entry.ipa),
        );
        expect(expected.length).toBeGreaterThan(0);
        for (const entry of expected) expect(drawn.has(entry.ipa), entry.ipa).toBe(true);
    });

    it('draws no sound the pulmonic grid or the trapezoid already has', () => {
        view = mount(<IPAExtraSoundsChart phonemeMap={EMPTY} />);

        // A second cell for `p` would be two places to click for one sound, and
        // would double-count in every "painted set" assertion.
        for (const symbol of drawnSymbols(view.container)) {
            expect(MAIN_SYMBOLS.has(symbol), symbol).toBe(false);
        }
    });

    it('draws each sound exactly once', () => {
        view = mount(<IPAExtraSoundsChart phonemeMap={EMPTY} />);
        const drawn = drawnSymbols(view.container);
        expect(drawn.length).toBe(new Set(drawn).size);
    });

    it('labels the four groups', () => {
        view = mount(<IPAExtraSoundsChart phonemeMap={EMPTY} />);
        const text = view.text();

        expect(text).toContain('Affricates & other sounds');
        for (const label of ['Affricates', 'Other', 'Clicks', 'Implosives']) {
            expect(text).toContain(label);
        }
    });

    it('describes a sound the source table has no description for', () => {
        // `ɕ` comes from EXTRA_SYMBOLS, which carries a designer's NOTE, not a
        // tooltip. The description is read out of the feature table instead —
        // a blank tooltip looks like a rendering bug.
        view = mount(<IPAExtraSoundsChart phonemeMap={EMPTY} />);
        const cell = Array.from(view.container.querySelectorAll('[aria-label]')).find((el) =>
            (el.getAttribute('aria-label') ?? '').startsWith('ɕ:'),
        );

        expect(cell?.getAttribute('aria-label')).toContain('fricative');
    });
});

describe('IPAExtraSoundsChart — the script underneath', () => {
    it('shows the grapheme for a sound the script spells WITHOUT the tie bar', () => {
        // The cell is `t͡ʃ`; users type `tʃ`. A straight `phonemeMap.get` would
        // call the sound unassigned and offer to create a duplicate grapheme.
        const phonemeMap = new Map<string, GraphemeComplete>([['tʃ', fakeGrapheme('cha')]]);
        view = mount(<IPAExtraSoundsChart phonemeMap={phonemeMap} />);

        const cell = Array.from(view.container.querySelectorAll('[role="button"]')).find((el) =>
            (el.getAttribute('aria-label') ?? '').startsWith('t͡ʃ:'),
        )!;
        expect(cell.className).toContain('assigned');
        expect(cell.querySelector('svg')).not.toBeNull();
    });

    it('matches the tie-bar spelling too', () => {
        const phonemeMap = new Map<string, GraphemeComplete>([['t͡ʃ', fakeGrapheme('cha')]]);
        view = mount(<IPAExtraSoundsChart phonemeMap={phonemeMap} />);

        const cell = Array.from(view.container.querySelectorAll('[role="button"]')).find((el) =>
            (el.getAttribute('aria-label') ?? '').startsWith('t͡ʃ:'),
        )!;
        expect(cell.className).toContain('assigned');
    });

    it('leaves a sound the script does not have unassigned', () => {
        const phonemeMap = new Map<string, GraphemeComplete>([['p', fakeGrapheme('pe')]]);
        view = mount(<IPAExtraSoundsChart phonemeMap={phonemeMap} />);

        const cell = Array.from(view.container.querySelectorAll('[role="button"]')).find((el) =>
            (el.getAttribute('aria-label') ?? '').startsWith('t͡ʃ:'),
        )!;
        expect(cell.className).toContain('unassigned');
    });

    it('calls back with the symbol when a cell is clicked', () => {
        const seen: string[] = [];
        view = mount(
            <IPAExtraSoundsChart phonemeMap={EMPTY} onCellClick={(ipa) => seen.push(ipa)} />,
        );

        const cell = Array.from(view.container.querySelectorAll('[role="button"]')).find((el) =>
            (el.getAttribute('aria-label') ?? '').startsWith('ʘ:'),
        )!;
        (cell as HTMLElement).click();

        expect(seen).toEqual(['ʘ']);
    });
});

describe('IPAExtraSoundsChart — the guide overlay', () => {
    const guide: GuideMap = new Map([
        ['t͡ʃ', 'core'],
        ['w', 'core'],
        ['ɕ', 'flavour'],
        ['ʘ', 'avoid'],
        // A symbol only the pulmonic grid draws: this chart must not paint it.
        ['p', 'core'],
    ]);

    it('paints exactly the symbols in the map that it draws', () => {
        view = mount(
            <IPAExtraSoundsChart phonemeMap={EMPTY} guide={guide} guideLabel="Slavic-ish" />,
        );

        expect(paintedSymbols(view.container, 'core')).toEqual(['t͡ʃ', 'w']);
        expect(paintedSymbols(view.container, 'flavour')).toEqual(['ɕ']);
        expect(paintedSymbols(view.container, 'avoid')).toEqual(['ʘ']);
    });

    it('names the flavour in the painted cell\'s accessible name', () => {
        view = mount(
            <IPAExtraSoundsChart phonemeMap={EMPTY} guide={guide} guideLabel="Slavic-ish" />,
        );
        const painted = view.container.querySelector('[data-guide="core"]')!;

        expect(painted.getAttribute('aria-label')).toContain('Slavic-ish: core sound');
    });

    it('repaints when the map changes', () => {
        view = mount(<IPAExtraSoundsChart phonemeMap={EMPTY} guide={guide} />);
        expect(paintedSymbols(view.container, 'core')).toEqual(['t͡ʃ', 'w']);

        view.rerender(
            <IPAExtraSoundsChart
                phonemeMap={EMPTY}
                guide={new Map([['ǀ', 'core']]) as GuideMap}
            />,
        );
        expect(paintedSymbols(view.container, 'core')).toEqual(['ǀ']);
    });

    it('repaints on a LABEL change alone', () => {
        // Same map, different preset name: `guideLabel` has to be in the memo's
        // dependency array or the tooltips keep naming the previous flavour.
        view = mount(<IPAExtraSoundsChart phonemeMap={EMPTY} guide={guide} guideLabel="Alpha" />);
        view.rerender(
            <IPAExtraSoundsChart phonemeMap={EMPTY} guide={guide} guideLabel="Beta" />,
        );

        const painted = view.container.querySelector('[data-guide="core"]')!;
        expect(painted.getAttribute('aria-label')).toContain('Beta: core sound');
    });

    it('paints nothing at all with no guide', () => {
        view = mount(<IPAExtraSoundsChart phonemeMap={EMPTY} />);
        expect(view.container.querySelectorAll('[data-guide]')).toHaveLength(0);
    });
});

describe('IPACombinedChart — the strip is part of the chart', () => {
    it('renders the extras between the consonant table and the vowel trapezoid', () => {
        view = mount(<IPACombinedChart phonemeMap={EMPTY} />);
        const headings = Array.from(view.container.querySelectorAll('h3')).map(
            (h) => h.textContent ?? '',
        );

        expect(headings).toEqual([
            'Consonants (Pulmonic)',
            'Affricates & other sounds',
            'Vowels',
        ]);
    });

    it('paints a preset\'s affricates and glides, which nothing could before', () => {
        const slavic = getPreset('slavic')!;
        view = mount(
            <IPACombinedChart
                phonemeMap={EMPTY}
                guide={guideMapFor(slavic)}
                guideLabel={slavic.name}
            />,
        );
        const painted = new Set(
            Array.from(view.container.querySelectorAll('[data-guide]')).map((el) =>
                (el.getAttribute('aria-label') ?? '').split(/[:—]/)[0].trim(),
            ),
        );

        for (const symbol of guideMapFor(slavic).keys()) {
            expect(painted.has(symbol), symbol).toBe(true);
        }
    });
});
