// @vitest-environment happy-dom
/**
 * @fileoverview Phase 4 — ADVERSARIAL audit of the flavour-guide overlay.
 *
 * The Phase 4 suites next to this one prove the feature does what it is meant
 * to. This one attacks the places where it could be wrong WITHOUT any of them
 * turning red:
 *
 *  - the picker's write is asserted against the REAL validator, not only
 *    against `expect(update).toHaveBeenCalledWith(...)`. A payload can have the
 *    right shape in a mock and still be rejected by `validateSettings`, which is
 *    strict: one issue and the whole settings write fails, silently, with the
 *    user's flavour pick lost and their profile untouched only by luck.
 *  - the write is driven from a context with NO `wordGenerator` key at all
 *    (settings stored before Phase 2) and from one holding a PRESET-derived
 *    profile — the two shapes the default-object tests cannot distinguish.
 *  - `guideLabel` is changed WITHOUT changing `guide`. Every existing repaint
 *    test changes the map, so a `guideLabel` missing from a dependency array
 *    would pass all of them and ship a chart whose tooltips name the previous
 *    flavour.
 *  - what the chart PAINTS is compared against what the chart is able to draw,
 *    per preset, rather than against "more than zero".
 *  - the legend's "why" control is asserted to actually OPEN the disclosure.
 *    `ExpandableContainer` keeps its children mounted and animates the height,
 *    so "the paragraph is in `textContent` after the click" is true whether or
 *    not the click did anything; `aria-expanded` on the toggle is the state that
 *    can tell those two worlds apart.
 *
 * The mount harness and the matchMedia / ResizeObserver stubs come from
 * `./harness`; everything here reads `data-guide` rather than a hashed
 * CSS-module class, so an assertion cannot go quietly true when a class is
 * renamed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
    applyPreset,
    cloneDefaultProfile,
    cloneDefaultWordGeneratorSettings,
    computeCoverage,
    getPreset,
    guideMapFor,
    EXTRA_SYMBOLS,
    PRESETS,
} from '../../../../generator';
import type { GuideMap, WordGeneratorSettings } from '../../../../generator';
import type { GraphemeComplete } from '../../../../db/types';
import {
    IPA_AFFRICATES,
    IPA_CLICKS,
    IPA_CONSONANT_CHART,
    IPA_IMPLOSIVES,
    IPA_VOWEL_CHART,
    MANNERS_OF_ARTICULATION,
    PLACES_OF_ARTICULATION,
    type MannerOfArticulation,
    type PlaceOfArticulation,
} from '../../../../data/ipaChartData';
import { ROUTES } from '../../../../url_mapping';
import {
    GUIDE_PICKER_LABEL,
    GUIDE_TIER_DESCRIPTIONS,
    GUIDE_TIER_LABELS,
    GUIDE_WHY_LABEL,
    NO_GUIDE_VALUE,
} from '../guideTiers';
import { mount, type Mounted } from './harness';

/* ── the mocked database context ─────────────────────────────────────────── */

const update = vi.fn(() => ({ success: true, data: null }));

/** The script under test. Mutable so a case can boot with a different one. */
let phonemeMap = new Map<string, GraphemeComplete>();
/** `undefined` models settings written before the `wordGenerator` key existed. */
let wordGenerator: WordGeneratorSettings | undefined;

vi.mock('../../../../db', () => ({
    useEtymolog: () => ({
        api: {
            settings: { update },
            grapheme: { getPhonemeMap: () => ({ success: true, data: phonemeMap }) },
        },
        data: { lexiconComplete: [], graphemesComplete: [] },
        settings: { conlangName: 'Test', wordGenerator },
        refresh: vi.fn(),
        isReady: true,
        error: null,
    }),
}));

// `src/db/api/settingsSchema` is NOT the mocked barrel — the real strict
// validator is what the picker's payload has to survive in production.
const { cloneDefaultSettings, validateSettings } = await import('../../../../db/api/settingsSchema');
const { default: GuidePicker } = await import('../GuidePicker');
const { default: GuideLegend } = await import('../GuideLegend');
const { default: IPAConsonantChart } = await import('../IPAConsonantChart');
const { default: IPAVowelChart } = await import('../IPAVowelChart');
const { default: IPASyllabaryChart } = await import('../IPASyllabaryChart');
const { default: IPAChartCell } = await import('../IPAChartCell');
const { default: IPAChartPage } = await import('../../../tabs/grapheme/ipaChart/IPAChartPage');
const { default: SyllabaryChartPage } = await import(
    '../../../tabs/grapheme/syllabaryChart/SyllabaryChartPage'
);
const { NotificationProvider } = await import('../../../shared/notifications/NotificationProvider');

const FLOWING = getPreset('flowing')!;
const SLAVIC = getPreset('slavic')!;
const EMPTY = new Map<string, GraphemeComplete>();

let view: Mounted | null = null;

beforeEach(() => {
    update.mockClear();
    update.mockImplementation(() => ({ success: true, data: null }));
    wordGenerator = cloneDefaultWordGeneratorSettings();
    phonemeMap = new Map<string, GraphemeComplete>([
        ['l', { id: 1, name: 'el', glyphs: [] } as unknown as GraphemeComplete],
        ['a', { id: 2, name: 'ah', glyphs: [] } as unknown as GraphemeComplete],
    ]);
});

afterEach(() => {
    view?.unmount();
    view = null;
});

/* ── helpers ─────────────────────────────────────────────────────────────── */

const renderPicker = (): HTMLSelectElement => {
    view = mount(
        <NotificationProvider>
            <GuidePicker />
        </NotificationProvider>,
    );
    return view.container.querySelector('select') as HTMLSelectElement;
};

/** Fire a real `change`, the way a user's pick arrives. */
function choose(select: HTMLSelectElement, value: string): void {
    act(() => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
    });
}

/** The one payload the picker sent. */
function sentPayload(): { wordGenerator: WordGeneratorSettings } {
    expect(update).toHaveBeenCalledTimes(1);
    return (update.mock.calls[0] as unknown as [{ wordGenerator: WordGeneratorSettings }])[0];
}

/** The pulmonic grid and the vowel trapezoid — the two charts Phase 4 shipped. */
const MAIN_CHART_SYMBOLS: ReadonlySet<string> = (() => {
    const out = new Set<string>();
    for (const manner of MANNERS_OF_ARTICULATION) {
        for (const place of PLACES_OF_ARTICULATION) {
            const cell =
                IPA_CONSONANT_CHART[manner.key as MannerOfArticulation][
                    place.key as PlaceOfArticulation
                ];
            if (cell?.voiceless) out.add(cell.voiceless);
            if (cell?.voiced) out.add(cell.voiced);
        }
    }
    for (const vowel of IPA_VOWEL_CHART) out.add(vowel.ipa);
    return out;
})();

/**
 * Every symbol the IPA chart page is able to DRAW — all THREE charts.
 *
 * Phase 6 added `IPAExtraSoundsChart` between the grid and the trapezoid, which
 * is what closes the gap this describe-block was written to measure: before it,
 * a preset's core `t͡ʃ` / `w` / `ɕ` was counted by the legend and had no cell to
 * light. The set is rebuilt from the SAME sources the strip renders from, so a
 * group deleted from the component and a group deleted from the data cannot
 * both go unnoticed.
 */
const CHART_SYMBOLS: ReadonlySet<string> = new Set([
    ...MAIN_CHART_SYMBOLS,
    ...IPA_AFFRICATES.map((entry) => entry.ipa),
    ...EXTRA_SYMBOLS.filter(
        (entry) => entry.role === 'symbol' && !MAIN_CHART_SYMBOLS.has(entry.ipa),
    ).map((entry) => entry.ipa),
    ...IPA_CLICKS.map((entry) => entry.ipa),
    ...IPA_IMPLOSIVES.map((entry) => entry.ipa),
]);

/**
 * The component directory, resolved from the vitest root (the app folder).
 *
 * `import.meta.url` is not a `file:` URL under happy-dom, so the usual
 * `fileURLToPath(new URL(...))` throws here — this suite reads real stylesheets
 * and real component sources, and the path has to survive the DOM environment.
 */
const DIR = resolve(process.cwd(), 'src/components/display/ipaChart');
const readSource = (file: string) => readFileSync(join(DIR, file), 'utf8');

/** Prose ABOUT a banned pattern is not a use of it. */
const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*/gm, '$1 ');

/* ══ 1. THE WRITE ═════════════════════════════════════════════════════════ */

describe('audit — GuidePicker writes settings the validator will accept', () => {
    it('sends a payload the REAL strict validator reports no issue on', () => {
        // `updateSettings` runs `validateSettings({ ...current, ...updates })`
        // and refuses the WHOLE write on a single issue. A payload that a mock
        // happily records can still be one the user's settings reject.
        choose(renderPicker(), 'flowing');

        const { issues } = validateSettings({ ...cloneDefaultSettings(), ...sentPayload() });
        expect(issues).toEqual([]);
    });

    it('carries a preset-derived profile through untouched', () => {
        // The default profile is the one shape where "dropped the profile" and
        // "kept the profile" can look identical. A profile built by
        // `applyPreset` differs from the default in every field that matters.
        const stored = cloneDefaultWordGeneratorSettings();
        stored.profile = applyPreset(SLAVIC, cloneDefaultProfile());
        wordGenerator = stored;

        choose(renderPicker(), 'flowing');
        const payload = sentPayload();

        expect(payload.wordGenerator.guidePresetId).toBe('flowing');
        expect(payload.wordGenerator.profile).toEqual(stored.profile);
        // …and the guide id is the ONLY thing that moved.
        expect(payload.wordGenerator.profile.presetId).toBe('slavic');
    });

    it('does not mutate the stored settings object it was handed', () => {
        const stored = cloneDefaultWordGeneratorSettings();
        stored.profile = applyPreset(SLAVIC, cloneDefaultProfile());
        wordGenerator = stored;

        choose(renderPicker(), 'romance');

        // The context copy is a snapshot the provider owns; writing through it
        // would make the settings listener see a change it never committed.
        expect(stored.guidePresetId).toBeNull();
    });

    it('writes a COMPLETE wordGenerator when settings predate the key', () => {
        // Pre-Phase-2 settings have no `wordGenerator` at all. The picker falls
        // back to the defaults, so the write installs a full, valid key rather
        // than `{ guidePresetId }` with no profile behind it.
        wordGenerator = undefined;

        choose(renderPicker(), 'island');
        const payload = sentPayload();

        expect(payload.wordGenerator.guidePresetId).toBe('island');
        expect(payload.wordGenerator.profile).toEqual(cloneDefaultWordGeneratorSettings().profile);
        expect(Object.keys(payload.wordGenerator).sort()).toEqual(['guidePresetId', 'profile']);

        // …and that write is one the strict validator accepts, so the pick is
        // not silently refused for everyone who has not opened the generator.
        const { settings, issues } = validateSettings({ ...cloneDefaultSettings(), ...payload });
        expect(issues).toEqual([]);
        expect(settings.wordGenerator.guidePresetId).toBe('island');
    });

    it('writes once per pick, and the second pick replaces the first', () => {
        const select = renderPicker();
        choose(select, 'flowing');
        // The context is mocked, so `current` does not advance on its own;
        // advance it the way the real settings listener would.
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'flowing' };
        view!.rerender(
            <NotificationProvider>
                <GuidePicker />
            </NotificationProvider>,
        );
        choose(view!.container.querySelector('select') as HTMLSelectElement, 'guttural');

        expect(update).toHaveBeenCalledTimes(2);
        const ids = update.mock.calls.map(
            (call) => (call as unknown as [{ wordGenerator: WordGeneratorSettings }])[0]
                .wordGenerator.guidePresetId,
        );
        expect(ids).toEqual(['flowing', 'guttural']);
    });

    it('clears a stale id when the user picks a real flavour', () => {
        // A `<select>` showing "No guide" because the stored id matches no
        // preset must still be able to write a real one.
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'atlantean' };
        const select = renderPicker();
        expect(select.value).toBe(NO_GUIDE_VALUE);

        choose(select, 'sinitic');

        expect(sentPayload().wordGenerator.guidePresetId).toBe('sinitic');
    });

    it('every option the picker offers resolves to a real preset', () => {
        // The write stores the option's VALUE verbatim. An option whose value
        // `getPreset` cannot resolve would store an id that paints nothing.
        const select = renderPicker();

        for (const option of Array.from(select.options).slice(1)) {
            expect(getPreset(option.value), option.value).not.toBeNull();
        }
        expect(select.options[0].value).toBe(NO_GUIDE_VALUE);
    });
});

describe('audit — GuidePicker when the write does not land', () => {
    it('reports a THROWN failure, not only a refused one', async () => {
        // `useApiAction` catches as well as inspects; the throw path is the one
        // with no `ApiResponse` to read a message out of.
        update.mockImplementationOnce(() => {
            throw new Error('localStorage is full');
        });

        choose(renderPicker(), 'japanese');
        await flush();

        expect(document.body.textContent).toContain('localStorage is full');
    });

    it('titles the failure so the toast says what could not be saved', async () => {
        update.mockImplementationOnce(
            () =>
                ({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'refused' },
                }) as unknown as ReturnType<typeof update>,
        );

        choose(renderPicker(), 'japanese');
        await flush();

        expect(document.body.textContent).toContain('Could not save the flavour guide');
    });

    it('does not leave the control showing a flavour that was never saved', async () => {
        // The select is controlled by settings. After a refused write the
        // stored value is unchanged, so the control must snap back — otherwise
        // it names a flavour the chart underneath it is not painting.
        update.mockImplementationOnce(
            () =>
                ({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'refused' },
                }) as unknown as ReturnType<typeof update>,
        );

        const select = renderPicker();
        choose(select, 'japanese');
        await flush();

        expect(select.value).toBe(NO_GUIDE_VALUE);
    });
});

/* ══ 2. REPAINTING ════════════════════════════════════════════════════════ */

describe('audit — the overlay repaints on a LABEL change alone', () => {
    const guide: GuideMap = new Map([
        ['t', 'core'],
        ['a', 'core'],
    ]);

    it('consonant chart: the new preset name reaches the cells', () => {
        // Every other repaint test swaps the MAP. A `guideLabel` missing from
        // the memo's dependencies survives all of them and ships tooltips that
        // name the flavour the user just switched away from.
        view = mount(<IPAConsonantChart phonemeMap={EMPTY} guide={guide} guideLabel="Alpha" />);
        expect(view.container.querySelector('[data-guide="core"]')!.getAttribute('aria-label'))
            .toContain('Alpha: core sound');

        view.rerender(
            <IPAConsonantChart phonemeMap={EMPTY} guide={guide} guideLabel="Beta" />,
        );

        expect(view.container.querySelector('[data-guide="core"]')!.getAttribute('aria-label'))
            .toContain('Beta: core sound');
    });

    it('vowel chart: the new preset name reaches the trapezoid', () => {
        view = mount(<IPAVowelChart phonemeMap={EMPTY} guide={guide} guideLabel="Alpha" />);
        view.rerender(<IPAVowelChart phonemeMap={EMPTY} guide={guide} guideLabel="Beta" />);

        const painted = view.container.querySelector('[data-guide="core"]')!;
        expect(painted.getAttribute('aria-label')).toContain('Beta: core sound');
    });

    it('syllabary: the new preset name reaches the headers', () => {
        view = mount(<IPASyllabaryChart phonemeMap={EMPTY} guide={guide} guideLabel="Alpha" />);
        view.rerender(<IPASyllabaryChart phonemeMap={EMPTY} guide={guide} guideLabel="Beta" />);

        const header = view.container.querySelector('th[data-guide="core"]')!;
        expect(header.getAttribute('title')).toContain('Beta: core sound');
    });

    it('source ratchet: every chart names guide AND guideLabel in its memo deps', () => {
        // A source check as well as a behavioural one: the behavioural tests
        // above prove today's tree repaints, this one names the reason so a
        // future edit that drops a dependency fails at the line it changed.
        for (const file of [
            'IPAConsonantChart.tsx',
            'IPAVowelChart.tsx',
            'IPASyllabaryChart.tsx',
        ]) {
            // Every bracketed list in the file, comments stripped so the
            // explanatory prose between `},` and the array cannot hide it.
            const arrays = stripComments(readSource(file)).match(/\[[^[\]]*\]/g) ?? [];
            const depArrays = arrays.filter((a) => /\bguide\b/.test(a));

            expect(depArrays.length, `${file} has no dependency array naming guide`)
                .toBeGreaterThan(0);
            expect(
                depArrays.some((a) => /\bguideLabel\b/.test(a)),
                `${file} never lists guideLabel as a dependency`,
            ).toBe(true);
        }
    });
});

describe('audit — what a painted cell carries', () => {
    it('keeps the tier while the cell is loading', () => {
        // A chart that is still resolving graphemes still knows the flavour;
        // dropping the overlay for the loading frame would make the guide blink
        // on every refresh.
        view = mount(<IPAChartCell ipa="t" guide="core" guideLabel="Alpha" isLoading />);
        const cell = view.container.querySelector('[role="button"]')!;

        expect(cell.getAttribute('data-guide')).toBe('core');
        expect(cell.getAttribute('aria-label')).toContain('Alpha: core sound');
    });

    it('paints no class for a tier the lookup does not know', () => {
        // The lookup table is what stops an unexpected value becoming a class
        // name. `data-guide` still reports it, which is what a debugger needs.
        view = mount(
            <IPAChartCell ipa="t" guide={'bogus' as unknown as 'core'} />,
        );
        const cell = view.container.querySelector('[role="button"]')!;

        expect(cell.className).not.toContain('guide');
        expect(cell.getAttribute('data-guide')).toBe('bogus');
    });

    it('syllabary headers carry the tier as data, not only as a hashed class', () => {
        view = mount(
            <IPASyllabaryChart
                phonemeMap={EMPTY}
                guide={new Map([['k', 'core'], ['a', 'flavour'], ['q', 'avoid']]) as GuideMap}
                guideLabel="Alpha"
            />,
        );

        const tiers = Array.from(view.container.querySelectorAll('th[data-guide]')).map((th) => [
            th.textContent,
            th.getAttribute('data-guide'),
        ]);
        expect(tiers.sort()).toEqual([
            ['a', 'flavour'],
            ['k', 'core'],
            ['q', 'avoid'],
        ]);
    });

    it('leaves unpainted syllabary headers with no data-guide at all', () => {
        view = mount(
            <IPASyllabaryChart phonemeMap={EMPTY} guide={new Map([['k', 'core']]) as GuideMap} />,
        );

        const plain = Array.from(view.container.querySelectorAll('th')).filter(
            (th) => th.textContent === 'm',
        )[0];
        expect(plain.hasAttribute('data-guide')).toBe(false);
        expect(view.container.querySelectorAll('[data-guide]')).toHaveLength(1);
    });
});

/* ══ 3. THE LEGEND ════════════════════════════════════════════════════════ */

describe('audit — GuideLegend counting', () => {
    it('survives a script with no sounds at all', () => {
        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [])} />);
        const coverage = computeCoverage(FLOWING, []);

        expect(coverage.core.present).toHaveLength(0);
        expect(view.text()).toContain('(0 in your script)');
        expect(view.container.querySelectorAll('li')).toHaveLength(3);
    });

    it('does not count an aspirated sound as its plain base', () => {
        // `computeCoverage` compares base + MODIFIERS: `pʰ` is not `p`. The
        // chart deliberately loses that distinction (it has one cell for both),
        // so the legend and the overlay disagree here BY DESIGN — pinned so the
        // day someone "fixes" one of them, the other is in the failure message.
        const core = FLOWING.sounds.core[0];
        const aspirated = `${core}ʰ`;

        const withPlain = computeCoverage(FLOWING, [core]).core.present.length;
        const withAspirated = computeCoverage(FLOWING, [aspirated]).core.present.length;

        expect(withPlain).toBe(1);
        expect(withAspirated).toBe(0);

        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [aspirated])} />);
        expect(view.text()).toContain('(0 in your script)');
        // …while the chart cell for the base symbol IS lit.
        expect(guideMapFor(FLOWING).get(core)).toBe('core');
    });

    it('encodes the preset id into the generator link for every preset', () => {
        for (const preset of PRESETS) {
            view?.unmount();
            view = mount(<GuideLegend preset={preset} coverage={computeCoverage(preset, [])} />);
            const link = view.container.querySelector('a')!;

            expect(link.getAttribute('href')).toBe(
                `${ROUTES.lexiconGenerate}?preset=${encodeURIComponent(preset.id)}`,
            );
            // The route constant, not a literal — the tab highlighter reads it.
            expect(link.getAttribute('href')!.startsWith(ROUTES.lexicon)).toBe(true);
        }
    });
});

describe('audit — GuideLegend accessibility', () => {
    it('never says a tier with colour alone', () => {
        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [])} />);
        const text = view.text();

        for (const tier of ['core', 'flavour', 'avoid'] as const) {
            expect(text).toContain(GUIDE_TIER_LABELS[tier]);
            expect(text).toContain(GUIDE_TIER_DESCRIPTIONS[tier]);
        }
    });

    it('hides the swatches from the accessibility tree', () => {
        view = mount(<GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [])} />);
        const swatches = Array.from(view.container.querySelectorAll('li > span')).filter((span) =>
            span.className.includes('swatch'),
        );

        expect(swatches).toHaveLength(3);
        for (const swatch of swatches) {
            expect(swatch.getAttribute('aria-hidden')).toBe('true');
        }
    });

    it('makes the "why" control a real, non-submitting button', () => {
        view = mount(
            <GuideLegend preset={FLOWING} coverage={computeCoverage(FLOWING, [])} onShowWhy={() => {}} whyTargetId="x" />,
        );
        const why = Array.from(view.container.querySelectorAll('button')).find((b) =>
            (b.textContent ?? '').includes(GUIDE_WHY_LABEL),
        )!;

        expect(why.tagName).toBe('BUTTON');
        // A bare <button> inside a form defaults to type="submit".
        expect(why.getAttribute('type')).toBe('button');
        expect(why.getAttribute('aria-controls')).toBe('x');
    });
});

/* ══ 4. THE PAGES ═════════════════════════════════════════════════════════ */

const renderPage = (page: 'ipa' | 'syllabary'): Mounted => {
    view = mount(
        <NotificationProvider>
            {page === 'ipa' ? <IPAChartPage /> : <SyllabaryChartPage />}
        </NotificationProvider>,
        page === 'ipa' ? ROUTES.scriptMakerChart : ROUTES.scriptMakerSyllabary,
    );
    return view;
};

describe('audit — the chart pages on settings that predate the generator', () => {
    it.each(['ipa', 'syllabary'] as const)(
        '%s page renders, paints nothing, and still offers a usable picker',
        (page) => {
            wordGenerator = undefined;

            expect(() => renderPage(page)).not.toThrow();
            expect(view!.container.querySelector('aside')).toBeNull();
            expect(view!.text()).not.toContain('Core sounds in script');
            expect(view!.container.querySelectorAll('[data-guide]')).toHaveLength(0);

            const select = view!.container.querySelector('select')!;
            expect(select.getAttribute('aria-label')).toBe(GUIDE_PICKER_LABEL);
            expect(select.value).toBe(NO_GUIDE_VALUE);
        },
    );

    it.each(['ipa', 'syllabary'] as const)('%s page paints nothing for a stale id', (page) => {
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'atlantean' };
        renderPage(page);

        expect(view!.container.querySelectorAll('[data-guide]')).toHaveLength(0);
        expect(view!.container.querySelector('aside')).toBeNull();
        expect(view!.container.querySelector('select')!.value).toBe(NO_GUIDE_VALUE);
    });
});

describe('audit — the legend actually opens the page explainer', () => {
    it.each(['ipa', 'syllabary'] as const)('%s page: the disclosure expands', (page) => {
        // `ExpandableContainer` keeps its children mounted and animates the
        // height, so asserting the paragraph is in `textContent` after the
        // click proves nothing. `aria-expanded` on the toggle is the state.
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'flowing' };
        renderPage(page);

        const why = Array.from(view!.container.querySelectorAll('button')).find((b) =>
            (b.textContent ?? '').includes(GUIDE_WHY_LABEL),
        )!;
        // Scoped to the element `aria-controls` names, so the assertion cannot
        // drift onto some other expandable thing the page grows later.
        const toggleIn = () =>
            view!.container.querySelector(
                `#${CSS.escape(why.getAttribute('aria-controls')!)} [aria-expanded]`,
            )!;

        expect(toggleIn().getAttribute('aria-expanded')).toBe('false');
        act(() => why.click());

        expect(toggleIn().getAttribute('aria-expanded')).toBe('true');
        expect(view!.text()).toContain(FLOWING.why.slice(0, 40));
    });

    it.each(['ipa', 'syllabary'] as const)(
        '%s page: the "why" control reports its own state and moves focus',
        (page) => {
            // Phase 4 shipped this as a one-way "show" button with no
            // `aria-expanded` and no focus move: the paragraph unrolled
            // somewhere below the reader and their focus stayed in the legend —
            // the classic disclosure trap where the content that just appeared
            // is content you now have to go and find.
            wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'flowing' };
            renderPage(page);

            const why = Array.from(view!.container.querySelectorAll('button')).find((b) =>
                (b.textContent ?? '').includes(GUIDE_WHY_LABEL),
            )!;
            expect(why.getAttribute('aria-expanded')).toBe('false');

            const target = view!.container.querySelector(
                `#${CSS.escape(why.getAttribute('aria-controls')!)}`,
            ) as HTMLElement;
            // Focusable programmatically, but NOT in the tab order.
            expect(target.getAttribute('tabindex')).toBe('-1');

            act(() => why.click());

            expect(why.getAttribute('aria-expanded')).toBe('true');
            expect(document.activeElement).toBe(target);
        },
    );

    it('points aria-controls at the element that holds the explainer', () => {
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'flowing' };
        renderPage('ipa');

        const why = Array.from(view!.container.querySelectorAll('button')).find((b) =>
            (b.textContent ?? '').includes(GUIDE_WHY_LABEL),
        )!;
        const target = view!.container.querySelector(
            `#${CSS.escape(why.getAttribute('aria-controls')!)}`,
        )!;

        expect(target).not.toBeNull();
        expect(target.textContent).toContain(FLOWING.why.slice(0, 40));
    });
});

describe('audit — the overlay paints exactly what the chart can draw', () => {
    it('leaves NO guide key unpaintable, for any preset', () => {
        // The Phase 4 handoff to Phase 6, inverted into a ratchet. This used to
        // be a per-preset LIST of sounds the legend counted and the chart could
        // never light (flowing/island `w t͡ʃ d͡ʒ`; japanese `w ɕ t͡ɕ d͡ʑ`; sinitic
        // `t͡s ʈ͡ʂ t͡ɕ ɕ ɚ`; romance `t͡ʃ d͡ʒ`; guttural `t͡s w`; slavic seven of
        // forty-six). With the extras strip in the combined chart the list is
        // empty, and it has to STAY empty: a preset gaining a sound no chart
        // draws is a legend that lies about its own numbers.
        for (const preset of PRESETS) {
            const unpaintable = [...guideMapFor(preset).keys()].filter(
                (symbol) => !CHART_SYMBOLS.has(symbol),
            );
            expect(unpaintable, preset.id).toEqual([]);
        }
    });

    it('IPA chart page: paints every drawable symbol, including the extras strip', () => {
        // The counterpart to the ratchet above: the DATA says everything is
        // drawable, and this says the page really draws it. Slavic is the
        // preset that reaches furthest outside the pulmonic grid.
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'slavic' };
        renderPage('ipa');

        const map = guideMapFor(SLAVIC);
        const painted = new Set(
            Array.from(view!.container.querySelectorAll('[data-guide]')).map((el) =>
                (el.getAttribute('aria-label') ?? '').split(/[:—]/)[0].trim(),
            ),
        );
        // Every affricate and every extra Slavic names, on screen.
        for (const symbol of map.keys()) expect(painted.has(symbol), symbol).toBe(true);
        expect([...map.keys()].some((symbol) => !MAIN_CHART_SYMBOLS.has(symbol))).toBe(true);
    });

    it('IPA chart page: painted set === guide keys the chart renders', () => {
        // Slavic is the preset with the most symbols the pulmonic grid has no
        // cell for (affricates, `w`, `ɕ`, `ʑ`), so it is the case where "paints
        // more than zero" is furthest from "paints the right things".
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'slavic' };
        renderPage('ipa');

        const map = guideMapFor(SLAVIC);
        const drawable = [...map.keys()].filter((symbol) => CHART_SYMBOLS.has(symbol)).sort();
        const painted = Array.from(view!.container.querySelectorAll('[data-guide]'))
            .map((el) => (el.getAttribute('aria-label') ?? '').split(/[:—]/)[0].trim())
            .sort();

        expect(painted).toEqual(drawable);
    });

    it('IPA chart page: each painted cell wears the tier the map gives it', () => {
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'flowing' };
        renderPage('ipa');

        const map = guideMapFor(FLOWING);
        for (const el of Array.from(view!.container.querySelectorAll('[data-guide]'))) {
            const symbol = (el.getAttribute('aria-label') ?? '').split(/[:—]/)[0].trim();
            expect(el.getAttribute('data-guide'), symbol).toBe(map.get(symbol));
        }
    });

    it('every preset lights at least one core cell the chart can draw', () => {
        // A preset whose whole core is affricates would paint an empty overlay
        // while the legend confidently counted seventeen core sounds.
        for (const preset of PRESETS) {
            const map = guideMapFor(preset);
            const drawableCore = [...map.entries()].filter(
                ([symbol, tier]) => tier === 'core' && CHART_SYMBOLS.has(symbol),
            );
            expect(drawableCore.length, preset.id).toBeGreaterThan(0);
        }
    });

    it('syllabary page: only headers are painted, and every one is in the map', () => {
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'flowing' };
        renderPage('syllabary');

        const map = guideMapFor(FLOWING);
        const headers = Array.from(view!.container.querySelectorAll('th[data-guide]'));
        expect(headers.length).toBeGreaterThan(0);
        for (const th of headers) {
            expect(map.get(th.textContent ?? ''), th.textContent ?? '').toBe(
                th.getAttribute('data-guide'),
            );
        }
        expect(view!.container.querySelectorAll('td[data-guide]')).toHaveLength(0);
    });

    it('syllabary page: the legend is not inside the pannable canvas', () => {
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'flowing' };
        renderPage('syllabary');
        const legend = view!.container.querySelector('aside')!;

        expect(legend).not.toBeNull();
        expect(legend.closest('table')).toBeNull();
        expect(legend.closest('[class*="anvas"]')).toBeNull();
    });
});

/* ══ 5. STYLE RATCHETS THE OTHER SUITES DO NOT REACH ══════════════════════ */

describe('audit — the guide stylesheets', () => {
    /**
     * Every stylesheet Phase 4 added or touched.
     *
     * `guideStyles.test.ts` scans only rules whose SELECTOR mentions
     * `guide`/`swatch`, so `guidePicker.module.scss` — whose selectors are
     * `.picker`, `.label`, `.select` — is invisible to it entirely.
     */
    const SHEETS = [
        'IPAChartCell.module.scss',
        'IPASyllabaryChart.module.scss',
        'guideLegend.module.scss',
        'guidePicker.module.scss',
    ];

    it('never makes --status-good a text colour anywhere', () => {
        // 2.74:1 on the light page: a fill and a ring, never a letter.
        for (const file of SHEETS) {
            expect(stripComments(readSource(file)), file).not.toMatch(
                /(^|[^-])color\s*:\s*var\(\s*--status-good/,
            );
        }
    });

    it('hardcodes no colour literal in any of them', () => {
        for (const file of SHEETS) {
            expect(stripComments(readSource(file)), file).not.toMatch(
                /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/,
            );
        }
    });

    it('passes no fallback to var() in any of them', () => {
        // `var(--x, #fff)` smuggles a colour past the app-wide token ratchet.
        for (const file of SHEETS) {
            for (const match of stripComments(readSource(file)).matchAll(
                /var\(\s*--[a-zA-Z0-9-]+([^)]*)/g,
            )) {
                expect(match[1], `${file}: ${match[0]}`).not.toContain(',');
            }
        }
    });
});
