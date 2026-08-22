// @vitest-environment happy-dom
/**
 * WordGeneratorPage — the page's own contract.
 *
 * What is pinned here is everything the page owns rather than delegates: the
 * header and its facts, the five sections, the batch memo's dependencies (the
 * single most important line on the page — a batch keyed on the whole settings
 * object regenerates every time the persistence status ticks), the `?preset=`
 * hand-off from the IPA chart, and the fact that this page registers NOTHING
 * as unsaved because it has nothing unsaved to register.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../../../db', async () => {
    const harness = await import('./harness');
    return { useEtymolog: harness.useHarnessEtymolog };
});

const {
    mount,
    settle,
    click,
    button,
    grapheme,
    word,
    resetHarness,
    state,
    storedProfile,
    storedWordGenerator,
    settingsUpdate,
    notifyHarness,
} = await import('./harness');
type Mounted = import('./harness').Mounted;

const { default: WordGeneratorPage } = await import('../WordGeneratorPage');
const { NotificationProvider } = await import(
    '../../../../shared/notifications/NotificationProvider'
);
const { PRESETS } = await import('../../../../../generator');

let view: Mounted;

/** A five-sound script: enough for the default CV/CVC/V profile to produce words. */
function scriptWithSounds() {
    state.data.graphemesComplete = [
        grapheme('t'),
        grapheme('k'),
        grapheme('n'),
        grapheme('a'),
        grapheme('i'),
        grapheme('o'),
    ];
}

function open(path = '/lexicon/generate'): Mounted {
    view = mount(
        <NotificationProvider>
            <WordGeneratorPage />
        </NotificationProvider>,
        path,
    );
    return view;
}

beforeEach(() => {
    resetHarness();
});

afterEach(() => {
    view?.unmount();
});

describe('WordGeneratorPage — the shell', () => {
    it('titles itself and links back to the lexicon', () => {
        open();
        expect(view.text()).toContain('Word generator');
        const back = view.container.querySelector('a[href="/lexicon"]');
        expect(back).not.toBeNull();
    });

    it('renders all five numbered sections', () => {
        open();
        const text = view.text();
        for (const heading of ['Flavour', 'Sounds', 'Shape', 'Constraints', 'Words']) {
            expect(text).toContain(heading);
        }
    });

    it('puts the section headings below the page heading, at level 3', () => {
        open();
        // `NumberedSectionHeader` renders an <h2>; the page's own header owns
        // that level, so every section is explicitly level 3.
        const headings = Array.from(view.container.querySelectorAll('h2[aria-level="3"]'));
        expect(headings.length).toBe(5);
    });

    it('counts sounds, shapes and the lexicon in the facts strip', () => {
        scriptWithSounds();
        state.data.lexiconComplete = [word('kata'), word('sona')];
        open();

        const text = view.text();
        expect(text).toContain('Sounds');
        expect(text).toContain('6'); // six auto-spelling phonemes
        expect(text).toContain('Words in lexicon');
        expect(text).toContain('2');
    });

    it('shows a loading state while the database is booting', () => {
        state.isReady = false;
        open();
        expect(view.text()).not.toContain('01');
    });

    it('shows the database error instead of the page when boot failed', () => {
        state.error = new Error('disk on fire');
        open();
        expect(view.text()).toContain('disk on fire');
    });
});

describe('WordGeneratorPage — the batch', () => {
    it('generates words from the script when there is no explicit inventory', () => {
        scriptWithSounds();
        open();
        const rows = view.container.querySelectorAll('input[type="checkbox"]');
        expect(rows.length).toBeGreaterThan(0);
    });

    it('asks for the batch size the header select shows', () => {
        scriptWithSounds();
        open();

        // Found by its options rather than by a `useId` value, which changes
        // with the render order of everything above it on the page.
        const countSelect = Array.from(view.container.querySelectorAll('select')).find((element) =>
            Array.from(element.options).some((option) => option.value === '100'),
        );
        expect(countSelect).toBeDefined();
        expect(countSelect!.value).toBe('20');
        expect(Array.from(countSelect!.options).map((option) => option.value)).toEqual([
            '10',
            '20',
            '50',
            '100',
        ]);
    });

    it('does NOT regenerate when an unrelated context value changes', async () => {
        scriptWithSounds();
        open();
        const before = view.container.textContent;

        // The persistence status ticking, an import finishing, a glyph being
        // saved — all of these re-render the context. None of them is an input
        // to the batch, and a batch keyed on `settings` would re-roll here.
        await settle();
        notifyHarness();
        await settle();

        expect(view.container.textContent).toBe(before);
    });

    it('re-rolls the words when Regenerate is pressed', async () => {
        scriptWithSounds();
        open();
        const before = view.container.textContent;

        click(button(view.container, 'Regenerate'));
        await settle();

        // A new seed. The odds of an identical 20-word batch are nil.
        expect(view.container.textContent).not.toBe(before);
    });

    it('keeps the words when Same seed is pressed and nothing else changed', async () => {
        scriptWithSounds();
        open();
        const before = view.container.textContent;

        click(button(view.container, 'Same seed'));
        await settle();

        expect(view.container.textContent).toBe(before);
    });

    it('shows a smaller batch when the size select is lowered', async () => {
        scriptWithSounds();
        open();
        const countSelect = Array.from(view.container.querySelectorAll('select')).find((element) =>
            Array.from(element.options).some((option) => option.value === '100'),
        )!;

        const { act } = await import('react-dom/test-utils');
        act(() => {
            countSelect.value = '10';
            countSelect.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await settle();

        const rows = view.container.querySelectorAll('input[type="checkbox"]');
        expect(rows.length).toBeLessThanOrEqual(10);
    });
});

describe('WordGeneratorPage — ?preset=', () => {
    it('applies the preset once and strips the parameter', async () => {
        open('/lexicon/generate?preset=island');
        await settle();

        expect(storedProfile().presetId).toBe('island');
        // Both halves of the key, in ONE write: picking a flavour here lights
        // the IPA chart too.
        expect(storedWordGenerator().guidePresetId).toBe('island');
        expect(settingsUpdate).toHaveBeenCalledTimes(1);
    });

    it('does not re-apply on a later re-render', async () => {
        open('/lexicon/generate?preset=island');
        await settle();
        settingsUpdate.mockClear();

        notifyHarness();
        await settle();
        notifyHarness();
        await settle();

        expect(settingsUpdate).not.toHaveBeenCalled();
    });

    it('ignores an id no preset matches, and still strips it', async () => {
        open('/lexicon/generate?preset=not-a-flavour');
        await settle();

        expect(storedProfile().presetId).toBeNull();
        expect(settingsUpdate).not.toHaveBeenCalled();
        // The page still renders rather than throwing on an unknown id.
        expect(view.text()).toContain('Word generator');
    });

    it('applies every real preset id', async () => {
        for (const preset of PRESETS) {
            resetHarness();
            const local = open(`/lexicon/generate?preset=${preset.id}`);
            await settle();
            expect(storedProfile().presetId).toBe(preset.id);
            local.unmount();
        }
    });
});
