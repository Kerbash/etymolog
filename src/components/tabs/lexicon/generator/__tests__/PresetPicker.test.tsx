// @vitest-environment happy-dom
/**
 * PresetPicker — the flavour cards.
 *
 * Two things are load-bearing and neither is visible in a screenshot:
 *
 *  1. the cards are REAL radio inputs, so the group behaves like a radio group
 *     (one tab stop, arrow keys, an announced position) without a keyboard
 *     handler of its own; and
 *  2. selecting one writes the WHOLE `wordGenerator` key — profile AND
 *     `guidePresetId` — in a single update. A partial write here is the Phase 2
 *     hazard: `api.settings.update` replaces a nested key wholesale, so
 *     `{ profile }` alone would blank the IPA chart's guide.
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
    grapheme,
    resetHarness,
    state,
    storedProfile,
    storedWordGenerator,
    settingsUpdate,
} = await import('./harness');
type Mounted = import('./harness').Mounted;

const { default: WordGeneratorPage } = await import('../WordGeneratorPage');
const { NotificationProvider } = await import(
    '../../../../shared/notifications/NotificationProvider'
);
const { PRESETS, getPreset, presetInventory } = await import('../../../../../generator');

let view: Mounted;

function open(path = '/lexicon/generate'): Mounted {
    view = mount(
        <NotificationProvider>
            <WordGeneratorPage />
        </NotificationProvider>,
        path,
    );
    return view;
}

/** Every preset radio, in DOM order. The last one is "Custom". */
function radios(): HTMLInputElement[] {
    return Array.from(view.container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
}

function radioFor(id: string): HTMLInputElement {
    const found = radios().find((input) => input.value === id);
    if (!found) throw new Error(`no radio for "${id}"`);
    return found;
}

beforeEach(() => {
    resetHarness();
});

afterEach(() => {
    view?.unmount();
});

describe('PresetPicker — the group', () => {
    it('offers every preset plus Custom, as one named radio group', () => {
        open();
        const inputs = radios();
        expect(inputs.length).toBe(PRESETS.length + 1);
        // One `name` for the whole group is what makes it ONE control.
        expect(new Set(inputs.map((input) => input.name)).size).toBe(1);

        const group = view.container.querySelector('[role="radiogroup"]');
        expect(group?.getAttribute('aria-label')).toBe('Flavour');
    });

    it('shows each preset with its tagline, touchstones and example words', () => {
        open();
        const first = PRESETS[0];
        const text = view.text();
        expect(text).toContain(first.name);
        expect(text).toContain(first.tagline);
        expect(text).toContain(first.touchstones[0]);
        expect(text).toContain(first.examples[0]);
    });

    it('selects Custom for a profile that came from no preset', () => {
        open();
        expect(radios().at(-1)!.checked).toBe(true);
    });

    it('selects Custom for a stale preset id nothing matches', async () => {
        state.settings = {
            ...state.settings,
            wordGenerator: {
                ...storedWordGenerator(),
                profile: { ...storedProfile(), presetId: 'a-flavour-from-2027' },
            },
        };
        open();
        await settle();

        // A radio group with NOTHING selected reads as a broken control; the
        // stale id is a profile with no known flavour, which is Custom.
        expect(radios().at(-1)!.checked).toBe(true);
        expect(radios().some((input) => input.checked && input.value !== '')).toBe(false);
    });
});

describe('PresetPicker — choosing', () => {
    it('writes the whole wordGenerator key, profile and guide together', async () => {
        open();
        click(radioFor('japanese'));
        await settle();

        expect(settingsUpdate).toHaveBeenCalledTimes(1);
        const patch = settingsUpdate.mock.calls[0][0] as Record<string, unknown>;
        const key = patch.wordGenerator as Record<string, unknown>;
        expect(Object.keys(patch)).toEqual(['wordGenerator']);
        expect(key.guidePresetId).toBe('japanese');
        expect((key.profile as Record<string, unknown>).presetId).toBe('japanese');
    });

    it('installs the preset\'s inventory, shapes and constraints', async () => {
        open();
        click(radioFor('island'));
        await settle();

        const preset = getPreset('island')!;
        expect(storedProfile().inventory).toEqual(presetInventory(preset));
        expect(storedProfile().syllables).toEqual(preset.profile.syllables);
        expect(storedProfile().vowelHarmony).toBe(preset.profile.vowelHarmony);
    });

    it('marks the chosen card as selected afterwards', async () => {
        open();
        click(radioFor('romance'));
        await settle();
        expect(radioFor('romance').checked).toBe(true);
    });

    it('choosing Custom clears the flavour label and nothing else', async () => {
        open();
        click(radioFor('guttural'));
        await settle();
        const inventory = storedProfile().inventory;
        const syllables = storedProfile().syllables;

        click(radios().at(-1)!);
        await settle();

        expect(storedProfile().presetId).toBeNull();
        // The profile in front of the user IS their custom one — choosing
        // "Custom" must not throw their sounds away.
        expect(storedProfile().inventory).toEqual(inventory);
        expect(storedProfile().syllables).toEqual(syllables);
    });

    it('leaves the chart guide alone when Custom is chosen', async () => {
        open();
        click(radioFor('sinitic'));
        await settle();
        click(radios().at(-1)!);
        await settle();

        // The guide is a VIEW choice: a user may perfectly well be generating
        // a custom profile while looking at Sinitic on the chart.
        expect(storedWordGenerator().guidePresetId).toBe('sinitic');
    });
});

describe('PresetPicker — coverage line', () => {
    it('says nothing when the script has no sounds to compare', async () => {
        open();
        click(radioFor('flowing'));
        await settle();
        expect(view.text()).not.toContain('core sounds');
    });

    it('counts the script against the flavour and links to the chart', async () => {
        state.data.graphemesComplete = [grapheme('m'), grapheme('n'), grapheme('a')];
        open();
        click(radioFor('flowing'));
        await settle();

        expect(view.text()).toMatch(/Your script has \d+ of \d+ core sounds/);
        expect(view.container.querySelector('a[href="/script-maker/chart"]')).not.toBeNull();
    });

    it('names the missing core sounds', async () => {
        state.data.graphemesComplete = [grapheme('a')];
        open();
        click(radioFor('japanese'));
        await settle();
        expect(view.text()).toContain('missing');
    });
});
