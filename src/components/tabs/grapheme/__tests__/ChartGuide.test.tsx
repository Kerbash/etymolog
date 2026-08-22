// @vitest-environment happy-dom
/**
 * The two chart pages with the flavour guide on and off.
 *
 * Both pages read the SAME `settings.wordGenerator.guidePresetId`, and the
 * point of these tests is that they agree: one picker, one legend, one fact,
 * one explainer paragraph — appearing together when a flavour is chosen and
 * gone together when it is not.
 *
 * The database is mocked here rather than booted. These pages are a projection
 * of one settings value onto a chart, and the phoneme map is the only thing
 * they need from the database — a real sql.js boot would add five seconds and a
 * second thing that can fail without testing anything more.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;

vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
);
vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

import {
    cloneDefaultWordGeneratorSettings,
    computeCoverage,
    getPreset,
} from '../../../../generator';
import type { WordGeneratorSettings } from '../../../../generator';
import type { GraphemeComplete } from '../../../../db/types';
import { ROUTES } from '../../../../url_mapping';
import {
    GUIDE_GENERATE_LINK_LABEL,
    GUIDE_PICKER_LABEL,
    GUIDE_WHY_LABEL,
} from '../../../display/ipaChart/guideTiers';

const update = vi.fn(() => ({ success: true, data: null }));

/** The script under test: four sounds, two of which the flowing preset calls core. */
const PHONEMES = new Map<string, GraphemeComplete>([
    ['l', { id: 1, name: 'el', glyphs: [] } as unknown as GraphemeComplete],
    ['n', { id: 2, name: 'en', glyphs: [] } as unknown as GraphemeComplete],
    ['a', { id: 3, name: 'ah', glyphs: [] } as unknown as GraphemeComplete],
    ['q', { id: 4, name: 'qoph', glyphs: [] } as unknown as GraphemeComplete],
]);

let wordGenerator: WordGeneratorSettings = cloneDefaultWordGeneratorSettings();

vi.mock('../../../../db', () => ({
    useEtymolog: () => ({
        api: {
            grapheme: { getPhonemeMap: () => ({ success: true, data: PHONEMES }) },
            settings: { update },
        },
        data: { lexiconComplete: [], graphemesComplete: [] },
        settings: { conlangName: 'Test', wordGenerator },
        refresh: vi.fn(),
        isReady: true,
        error: null,
    }),
}));

const { default: IPAChartPage } = await import('../ipaChart/IPAChartPage');
const { default: SyllabaryChartPage } = await import(
    '../syllabaryChart/SyllabaryChartPage'
);
const { NotificationProvider } = await import(
    '../../../shared/notifications/NotificationProvider'
);

const FLOWING = getPreset('flowing')!;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(page: ReactNode, path: string): string {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root!.render(
            <MemoryRouter initialEntries={[path]}>
                <NotificationProvider>{page}</NotificationProvider>
            </MemoryRouter>,
        );
    });
    return container.textContent ?? '';
}

beforeEach(() => {
    update.mockClear();
    wordGenerator = cloneDefaultWordGeneratorSettings();
});

afterEach(() => {
    if (root) {
        try {
            act(() => root!.unmount());
        } catch {
            /* already unmounted */
        }
    }
    container?.parentNode?.removeChild(container);
    root = null;
    container = null;
});

const withGuide = (id: string) => {
    wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: id };
};

describe.each([
    ['IPAChartPage', () => <IPAChartPage />, ROUTES.scriptMakerChart] as const,
    ['SyllabaryChartPage', () => <SyllabaryChartPage />, ROUTES.scriptMakerSyllabary] as const,
])('%s with a guide', (_name, page, path) => {
    it('offers the picker in the header whether or not a guide is on', () => {
        render(page(), path);

        const select = container!.querySelector('select');
        expect(select?.getAttribute('aria-label')).toBe(GUIDE_PICKER_LABEL);
    });

    it('shows the legend, the fact and the explainer paragraph when a guide is on', () => {
        withGuide('flowing');
        const text = render(page(), path);
        const coverage = computeCoverage(FLOWING, Array.from(PHONEMES.keys()));
        const total = coverage.core.present.length + coverage.core.missing.length;

        expect(text).toContain(FLOWING.tagline);
        expect(text).toContain('Core sounds in script');
        expect(text).toContain(`${coverage.core.present.length} / ${total}`);
        // The `why` paragraph is APPENDED to the page's own explainer rather
        // than given a second disclosure of its own.
        expect(text).toContain(FLOWING.why.slice(0, 40));
    });

    it('shows none of that when the guide is off', () => {
        const text = render(page(), path);

        expect(text).not.toContain(FLOWING.tagline);
        expect(text).not.toContain('Core sounds in script');
        expect(text).not.toContain(GUIDE_GENERATE_LINK_LABEL);
        expect(text).not.toContain(FLOWING.why.slice(0, 40));
    });

    it('links to the generator with this flavour', () => {
        withGuide('flowing');
        render(page(), path);

        const link = Array.from(container!.querySelectorAll('a')).find((a) =>
            (a.textContent ?? '').includes(GUIDE_GENERATE_LINK_LABEL),
        );
        expect(link?.getAttribute('href')).toBe(`${ROUTES.lexiconGenerate}?preset=flowing`);
    });

    it('opens the page explainer from the legend rather than duplicating it', () => {
        withGuide('flowing');
        render(page(), path);

        const why = Array.from(container!.querySelectorAll('button')).find((b) =>
            (b.textContent ?? '').includes(GUIDE_WHY_LABEL),
        )!;
        expect(why).toBeTruthy();

        // The control points at the disclosure it opens, and there is exactly
        // ONE place the paragraph lives.
        const targetId = why.getAttribute('aria-controls');
        expect(targetId).toBeTruthy();
        expect(container!.querySelector(`#${CSS.escape(targetId!)}`)).not.toBeNull();

        act(() => why.click());
        expect(container!.textContent).toContain(FLOWING.why.slice(0, 40));
    });

    it('keeps the legend out of the pannable canvas', () => {
        // A legend that pans and zooms away with the chart is a legend you
        // cannot read while looking at what it explains.
        withGuide('flowing');
        render(page(), path);

        const legend = container!.querySelector('aside');
        expect(legend).not.toBeNull();
        expect(legend!.closest('[class*="canvas"], [class*="Canvas"]')).toBeNull();
    });

    it('treats a stale preset id as no guide', () => {
        withGuide('atlantean');
        const text = render(page(), path);

        expect(text).not.toContain('Core sounds in script');
        expect(container!.querySelector('aside')).toBeNull();
        expect(container!.querySelector('select')!.value).toBe('');
    });

    it('still reports the script size fact with a guide on', () => {
        withGuide('flowing');
        const text = render(page(), path);

        expect(text).toContain(String(PHONEMES.size));
    });
});

describe('IPAChartPage — the overlay reaches the chart', () => {
    it('paints the preset tiers onto the cells', () => {
        withGuide('flowing');
        render(<IPAChartPage />, ROUTES.scriptMakerChart);

        const core = container!.querySelectorAll('[data-guide="core"]');
        const avoid = container!.querySelectorAll('[data-guide="avoid"]');
        expect(core.length).toBeGreaterThan(0);
        expect(avoid.length).toBeGreaterThan(0);
    });

    it('names the preset in a painted cell', () => {
        withGuide('flowing');
        render(<IPAChartPage />, ROUTES.scriptMakerChart);

        const painted = container!.querySelector('[data-guide="core"]');
        expect(painted?.getAttribute('aria-label')).toContain(`${FLOWING.name}: core sound`);
    });

    it('paints nothing with the guide off', () => {
        render(<IPAChartPage />, ROUTES.scriptMakerChart);

        expect(container!.querySelectorAll('[data-guide]')).toHaveLength(0);
    });
});

describe('SyllabaryChartPage — the overlay reaches the headers', () => {
    it('paints headers and not syllable cells', () => {
        withGuide('flowing');
        render(<SyllabaryChartPage />, ROUTES.scriptMakerSyllabary);

        const paintedHeaders = Array.from(container!.querySelectorAll('th')).filter((th) =>
            th.className.includes('guide'),
        );
        const paintedCells = Array.from(container!.querySelectorAll('td')).filter((td) =>
            td.className.includes('guide'),
        );

        expect(paintedHeaders.length).toBeGreaterThan(0);
        expect(paintedCells).toHaveLength(0);
    });
});
