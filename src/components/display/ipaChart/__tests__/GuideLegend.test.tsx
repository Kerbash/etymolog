// @vitest-environment happy-dom
/**
 * GuideLegend — the key under the chart.
 *
 * Its counts come from `computeCoverage`, the same function the generator page
 * will use, so the assertions here are written against that function rather
 * than against pasted numbers: a preset gaining a sound must not turn this
 * suite red, but the legend disagreeing with coverage must.
 *
 * The "(n in your script)" tail is a wording decision with a rule behind it —
 * always for core (even at zero, which is the most useful number a beginner can
 * see), only when non-zero for the other two — and it is pinned here because it
 * is exactly the kind of thing a later edit "tidies" into inconsistency.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';

import GuideLegend from '../GuideLegend';
import { computeCoverage, getPreset, phonemeIdentity } from '../../../../generator';
import { ROUTES } from '../../../../url_mapping';
import {
    GUIDE_GENERATE_LINK_LABEL,
    GUIDE_TIER_DESCRIPTIONS,
    GUIDE_WHY_LABEL,
} from '../guideTiers';
import { mount, type Mounted } from './harness';

let view: Mounted | null = null;

afterEach(() => {
    view?.unmount();
    view = null;
});

const FLOWING = getPreset('flowing')!;
const GUTTURAL = getPreset('guttural')!;

describe('GuideLegend — counts', () => {
    it('quotes the same totals computeCoverage does', () => {
        const phonemes = ['l', 'n', 'a', 'i'];
        const coverage = computeCoverage(FLOWING, phonemes);
        const coreTotal = coverage.core.present.length + coverage.core.missing.length;

        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, phonemes)} />);

        expect(view.text()).toContain(
            `Core · ${coreTotal} (${coverage.core.present.length} in your script)`,
        );
    });

    it('states the core tail even when the script has none of it', () => {
        const coverage = computeCoverage(FLOWING, []);
        const coreTotal = coverage.core.present.length + coverage.core.missing.length;

        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [])} />);

        expect(view.text()).toContain(`Core · ${coreTotal} (0 in your script)`);
    });

    it('omits the tail on flavour when the script has none of it', () => {
        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [])} />);
        const coverage = computeCoverage(FLOWING, []);
        const flavourTotal = coverage.flavour.present.length + coverage.flavour.missing.length;

        expect(view.text()).toContain(`Flavour · ${flavourTotal}`);
        expect(view.text()).not.toContain(`Flavour · ${flavourTotal} (0 in your script)`);
    });

    it('adds the tail on avoid only when the script actually has one', () => {
        const offending = FLOWING.sounds.avoid[0];
        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [offending])} />);

        expect(view.text()).toContain(
            `Avoid · ${FLOWING.sounds.avoid.length} (1 in your script)`,
        );
    });

    it('omits the avoid tail when the script has none of them', () => {
        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, ['l'])} />);

        expect(view.text()).not.toContain('Avoid · ' + FLOWING.sounds.avoid.length + ' (0');
    });

    it('matches a preset sound the user spelt differently', () => {
        // Coverage compares classified forms, not strings: a user who typed
        // `tʃ` has the sound a preset writes `t͡ʃ`. The legend inherits that,
        // and a legend that under-counted would send people hunting for a
        // sound they already have.
        const withTieBar = GUTTURAL.sounds.core.find((sound) => sound.includes('͡'));
        const preset = withTieBar ? GUTTURAL : FLOWING;
        const sample = preset.sounds.core[0];
        const coverage = computeCoverage(preset, [sample]);

        view = mount(<GuideLegend preset={preset} coverage={computeCoverage(preset, [sample])} />);

        expect(coverage.core.present.length).toBeGreaterThan(0);
        expect(view.text()).toContain(`(${coverage.core.present.length} in your script)`);
    });

    it('recounts when the script gains a sound', () => {
        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [])} />);
        expect(view.text()).toContain('(0 in your script)');

        view.rerender(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [FLOWING.sounds.core[0]])} />);

        expect(view.text()).toContain('(1 in your script)');
    });
});

describe('GuideLegend — what it says and where it goes', () => {
    it('names the preset and repeats its tagline', () => {
        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [])} />);

        expect(view.text()).toContain(FLOWING.name);
        expect(view.text()).toContain(FLOWING.tagline);
    });

    it('explains each of the three tiers', () => {
        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [])} />);

        for (const description of Object.values(GUIDE_TIER_DESCRIPTIONS)) {
            expect(view.text()).toContain(description);
        }
    });

    it('renders one swatch per tier', () => {
        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [])} />);

        expect(view.container.querySelectorAll('li')).toHaveLength(3);
    });

    it('links to the generator with the preset in the query', () => {
        view = mount(<GuideLegend preset={GUTTURAL} coverage={computeCoverage(GUTTURAL, [])} />);
        const link = Array.from(view.container.querySelectorAll('a')).find((a) =>
            (a.textContent ?? '').includes(GUIDE_GENERATE_LINK_LABEL),
        );

        expect(link?.getAttribute('href')).toBe(
            `${ROUTES.lexiconGenerate}?preset=${GUTTURAL.id}`,
        );
    });

    it('offers the "why" control only when the page can act on it', () => {
        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [])} />);
        expect(view.text()).not.toContain(GUIDE_WHY_LABEL);

        view.unmount();
        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [])} onShowWhy={() => {}} />);
        expect(view.text()).toContain(GUIDE_WHY_LABEL);
    });

    it('calls back and points at the disclosure it opens', () => {
        let opened = 0;
        view = mount(
            <GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [])}
                onShowWhy={() => {
                    opened += 1;
                }}
                whyTargetId="about-panel"
            />,
        );

        const button = Array.from(view.container.querySelectorAll('button')).find((b) =>
            (b.textContent ?? '').includes(GUIDE_WHY_LABEL),
        )!;
        expect(button.getAttribute('aria-controls')).toBe('about-panel');

        act(() => button.click());
        expect(opened).toBe(1);
    });

    it(`reports the explainer's state on the "why" toggle`, () => {
        // A disclosure trigger that never says what it did leaves a screen
        // reader user pressing it repeatedly with no feedback. The state is the
        // PAGE's (the explainer lives in `ChartPageLayout`), so it arrives as a
        // prop rather than being kept here — two copies of one open/closed flag
        // is how a toggle ends up lying.
        view = mount(
            <GuideLegend
                preset={FLOWING}
                coverage={computeCoverage(FLOWING, [])}
                onShowWhy={() => {}}
                whyOpen={false}
            />,
        );
        const why = () =>
            Array.from(view!.container.querySelectorAll('button')).find((b) =>
                (b.textContent ?? '').includes(GUIDE_WHY_LABEL),
            )!;

        expect(why().getAttribute('aria-expanded')).toBe('false');

        view.rerender(
            <GuideLegend
                preset={FLOWING}
                coverage={computeCoverage(FLOWING, [])}
                onShowWhy={() => {}}
                whyOpen
            />,
        );
        expect(why().getAttribute('aria-expanded')).toBe('true');
    });

    it('counts avoid by SOUND, not by spelling', () => {
        // The other two tiers are deduplicated by identity inside
        // `computeCoverage`; `avoid` used a raw `.length`, so a preset naming
        // one sound twice (`t͡ʃ` and `tʃ`) advertised one more sound to avoid
        // than the chart dims — the legend and the overlay disagreeing about a
        // list the user can literally count on screen.
        const doubled = {
            ...FLOWING,
            sounds: { ...FLOWING.sounds, avoid: ['t͡ʃ', 'tʃ', 'q'] },
        };
        view = mount(
            <GuideLegend preset={doubled} coverage={computeCoverage(doubled, [])} />,
        );

        expect(view.text()).toContain('Avoid · 2');
    });

    it('quotes the avoid total it was given for a real preset', () => {
        view = mount(<GuideLegend preset={GUTTURAL} coverage={computeCoverage(GUTTURAL, [])} />);
        const unique = new Set(GUTTURAL.sounds.avoid.map(phonemeIdentity)).size;

        expect(view.text()).toContain(`Avoid · ${unique}`);
    });

    it('names itself for a screen reader', () => {
        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [])} />);
        const aside = view.container.querySelector('aside');

        expect(aside?.getAttribute('aria-label')).toBe(`${FLOWING.name} guide`);
    });
});
