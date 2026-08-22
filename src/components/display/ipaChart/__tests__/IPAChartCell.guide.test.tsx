// @vitest-environment happy-dom
/**
 * IPAChartCell — the flavour-guide overlay on ONE cell.
 *
 * The cell is the dumbest thing in the feature and has to stay that way: it is
 * told a tier and a name and paints them. What is pinned here is that it paints
 * the RIGHT tier, that the guide never replaces the assigned/unassigned
 * rendering it sits on top of, and that the guide line reaches a screen reader.
 *
 * The tooltip's text cannot be read from the DOM — `HoverToolTip` portals its
 * content and mounts it only while open — so the same string is asserted on the
 * accessible name, which is where a keyboard user actually meets it.
 */

import { describe, it, expect, afterEach } from 'vitest';

import IPAChartCell from '../IPAChartCell';
import { guideTooltipLine, GUIDE_TIER_TOOLTIPS } from '../guideTiers';
import styles from '../IPAChartCell.module.scss';
import type { GraphemeComplete } from '../../../../db/types';
import { mount, type Mounted } from './harness';

let view: Mounted | null = null;

afterEach(() => {
    view?.unmount();
    view = null;
});

/** A grapheme with one glyph — enough for the cell to count as "assigned". */
const GRAPHEME = {
    id: 1,
    name: 'tee',
    glyphs: [{ id: 1, name: 'tee', svg: '<svg/>' }],
} as unknown as GraphemeComplete;

const cellOf = (v: Mounted) => v.container.querySelector('[role="button"]') as HTMLElement;

describe('IPAChartCell — guide classes', () => {
    it('paints nothing when no guide is given', () => {
        view = mount(<IPAChartCell ipa="t" description="Voiceless alveolar plosive" />);
        const cell = cellOf(view);

        expect(cell.className).not.toContain('guide');
        expect(cell.getAttribute('data-guide')).toBeNull();
    });

    it('paints nothing when the guide is explicitly null', () => {
        view = mount(<IPAChartCell ipa="t" guide={null} guideLabel="Elvish / flowing" />);
        expect(cellOf(view).className).not.toContain('guide');
    });

    it.each([
        ['core', styles.guideCore],
        ['flavour', styles.guideFlavour],
        ['avoid', styles.guideAvoid],
    ] as const)('paints the %s tier with its own class', (tier, className) => {
        view = mount(<IPAChartCell ipa="t" guide={tier} guideLabel="Elvish / flowing" />);
        const cell = cellOf(view);

        expect(cell.className).toContain(className);
        expect(cell.getAttribute('data-guide')).toBe(tier);
    });

    it('paints exactly one tier class at a time', () => {
        view = mount(<IPAChartCell ipa="t" guide="flavour" />);
        const classes = cellOf(view).className.split(/\s+/).filter((c) => c.includes('guide'));

        expect(classes).toHaveLength(1);
    });

    it('keeps the unassigned rendering underneath the guide', () => {
        // The overlay is additive. A lit cell the script has no grapheme for is
        // still an unassigned cell, and still shows the IPA character — that is
        // the whole point of lighting it.
        view = mount(<IPAChartCell ipa="θ" guide="core" />);
        const cell = cellOf(view);

        expect(cell.className).toContain(styles.unassigned);
        expect(cell.textContent).toContain('θ');
    });

    it('keeps the assigned rendering underneath the guide', () => {
        view = mount(<IPAChartCell ipa="t" grapheme={GRAPHEME} guide="avoid" />);
        const cell = cellOf(view);

        expect(cell.className).toContain(styles.assigned);
        expect(cell.className).toContain(styles.guideAvoid);
    });

    it('keeps the caller class alongside the tier class', () => {
        view = mount(<IPAChartCell ipa="t" guide="core" className="caller-class" />);
        const cell = cellOf(view);

        expect(cell.className).toContain('caller-class');
        expect(cell.className).toContain(styles.guideCore);
    });
});

describe('IPAChartCell — the guide line', () => {
    it('names the preset and the tier in the accessible name', () => {
        view = mount(
            <IPAChartCell
                ipa="l"
                description="Voiced alveolar lateral approximant"
                guide="core"
                guideLabel="Elvish / flowing"
            />,
        );

        const label = cellOf(view).getAttribute('aria-label') ?? '';
        expect(label).toContain('l: Voiced alveolar lateral approximant');
        expect(label).toContain('Elvish / flowing: core sound');
    });

    it('says the tier even when no preset name was passed', () => {
        view = mount(<IPAChartCell ipa="q" guide="avoid" />);

        expect(cellOf(view).getAttribute('aria-label')).toBe('q — sound to avoid');
    });

    it('leaves the accessible name untouched when the guide is off', () => {
        view = mount(<IPAChartCell ipa="q" description="Voiceless uvular plosive" />);

        expect(cellOf(view).getAttribute('aria-label')).toBe('q: Voiceless uvular plosive');
    });

    it('builds the line the tooltip and the label share', () => {
        // One helper, two consumers — the tooltip's third line and the
        // accessible name must never drift into two different sentences.
        expect(guideTooltipLine('Harsh / guttural', 'flavour')).toBe(
            'Harsh / guttural: flavour sound',
        );
        expect(guideTooltipLine(undefined, 'core')).toBe(GUIDE_TIER_TOOLTIPS.core);
    });
});
