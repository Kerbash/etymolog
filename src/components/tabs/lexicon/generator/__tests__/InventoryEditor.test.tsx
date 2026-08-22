// @vitest-environment happy-dom
/**
 * InventoryEditor — where the sounds come from, and how often each turns up.
 *
 * The chips are the only control on this page whose effect is invisible in the
 * control itself: switching a sound `off` changes the WORDS, not the chip. So
 * the tilt tests assert on the batch — an `off` sound must not appear in a
 * single generated word — rather than on the class name of a chip, which would
 * pass just as well if the tilt never reached the engine.
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
    type,
    button,
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

let view: Mounted;

function open(): Mounted {
    view = mount(
        <NotificationProvider>
            <WordGeneratorPage />
        </NotificationProvider>,
    );
    return view;
}

function withScript(...phonemes: string[]) {
    state.data.graphemesComplete = phonemes.map((phoneme) => grapheme(phoneme));
}

/** Seed an explicit inventory without going through the UI. */
function withInventory(inventory: string[]) {
    state.settings = {
        ...state.settings,
        wordGenerator: {
            ...storedWordGenerator(),
            profile: { ...storedProfile(), inventory },
        },
    };
}

/** The chip button for a sound, found by the accessible name it carries. */
function chip(sound: string): HTMLButtonElement | undefined {
    return Array.from(view.container.querySelectorAll('button')).find((element) =>
        (element.getAttribute('aria-label') ?? '').startsWith(`${sound} —`),
    );
}

function sourceSwitch(): HTMLElement | null {
    return view.container.querySelector<HTMLElement>(
        '[role="switch"][aria-label="Use my script\'s sounds"]',
    );
}

/** Every word currently on screen. */
function generatedWords(): string[] {
    return Array.from(view.container.querySelectorAll('input[type="checkbox"]')).map((input) =>
        (input.getAttribute('aria-label') ?? '').replace(/^Select /, ''),
    );
}

beforeEach(() => {
    resetHarness();
});

afterEach(() => {
    view?.unmount();
});

describe('InventoryEditor — where the sounds come from', () => {
    it("starts on the script's sounds and says so", () => {
        withScript('t', 'a');
        open();
        expect(sourceSwitch()?.getAttribute('aria-checked')).toBe('true');
        expect(view.text()).toContain("Using my script's sounds");
    });

    it('shows only the phonemes flagged for auto-spelling', () => {
        state.data.graphemesComplete = [
            grapheme('t'),
            grapheme('a'),
            grapheme('ʒ', { useInAutoSpelling: false }),
        ];
        open();

        expect(chip('t')).toBeDefined();
        expect(chip('ʒ')).toBeUndefined();
    });

    it('files each sound under exactly one class heading', () => {
        withScript('t', 'k', 's', 'n', 'a');
        open();

        const text = view.text();
        expect(text).toContain('Stops');
        expect(text).toContain('Sibilants');
        expect(text).toContain('Nasals');
        expect(text).toContain('Vowels');
        // `t` is a C, a P and an O to the template parser; the chip list shows
        // it ONCE or the user cannot tell which copy they clicked.
        expect(
            Array.from(view.container.querySelectorAll('button')).filter((element) =>
                (element.getAttribute('aria-label') ?? '').startsWith('t —'),
            ).length,
        ).toBe(1);
    });

    it('ticks the sounds the script has', () => {
        withScript('t', 'a');
        open();
        expect(chip('t')?.getAttribute('aria-label')).toContain('in your script');
    });

    it('does not tick a custom sound the script lacks', async () => {
        withScript('t', 'a');
        withInventory(['t', 'a', 'ʃ']);
        open();
        await settle();

        expect(chip('ʃ')?.getAttribute('aria-label')).not.toContain('in your script');
        expect(chip('t')?.getAttribute('aria-label')).toContain('in your script');
    });

    it('materialises the script list when switched to a custom one', async () => {
        withScript('t', 'k', 'a');
        open();
        click(sourceSwitch());
        await settle();

        // Emptying instead would silently switch the generator off.
        expect(storedProfile().inventory).toEqual(['t', 'k', 'a']);
        expect(view.text()).toContain('Using a custom list of sounds');
    });

    it('goes back to the script by emptying the inventory', async () => {
        withScript('t', 'a');
        open();
        click(sourceSwitch());
        await settle();
        click(sourceSwitch());
        await settle();

        expect(storedProfile().inventory).toEqual([]);
    });

    it('locks the switch when there is nothing to copy out of the script', () => {
        open();
        expect(sourceSwitch()?.getAttribute('aria-disabled')).toBe('true');
    });
});

describe('InventoryEditor — the tilt cycle', () => {
    it('cycles normal → common on the first click', async () => {
        withScript('t', 'a');
        open();
        click(chip('t'));
        await settle();

        expect(storedProfile().phonemeTilt).toEqual({ t: 'common' });
        expect(chip('t')?.getAttribute('aria-label')).toBe('t — common, in your script');
    });

    it('walks the whole cycle and back to normal', async () => {
        withScript('t', 'a');
        open();

        for (const expected of ['common', 'rare', 'off']) {
            click(chip('t'));
            await settle();
            expect((storedProfile().phonemeTilt as Record<string, string>).t).toBe(expected);
        }

        click(chip('t'));
        await settle();
        // `normal` is the ABSENCE of a tilt: storing it would grow the settings
        // object by a key per sound the user clicked twice.
        expect(storedProfile().phonemeTilt).toEqual({});
    });

    it('keeps an off sound in the list, muted rather than deleted', async () => {
        withScript('t', 'k', 'a', 'i');
        open();
        click(chip('k'));
        await settle();
        click(chip('k'));
        await settle();
        click(chip('k'));
        await settle();

        expect((storedProfile().phonemeTilt as Record<string, string>).k).toBe('off');
        expect(chip('k')).toBeDefined();
    });

    it('reaches the engine — an off sound appears in no generated word', async () => {
        withScript('t', 'k', 'a', 'i');
        open();
        expect(generatedWords().join('')).toContain('k');

        click(chip('k'));
        await settle();
        click(chip('k'));
        await settle();
        click(chip('k'));
        await settle();

        const words = generatedWords();
        expect(words.length).toBeGreaterThan(0);
        expect(words.join('')).not.toContain('k');
    });
});

describe('InventoryEditor — adding and removing', () => {
    it('adds a typed sound and moves to a custom list', async () => {
        withScript('t', 'a');
        open();

        const input = view.container.querySelector<HTMLInputElement>('input[type="text"]');
        type(input, 'ʃ');
        click(button(view.container, 'Add'));
        await settle();

        expect(storedProfile().inventory).toEqual(['t', 'a', 'ʃ']);
        expect(chip('ʃ')).toBeDefined();
    });

    it('refuses to add a sound that is already there', async () => {
        withScript('t', 'a');
        open();

        const input = view.container.querySelector<HTMLInputElement>('input[type="text"]');
        type(input, 't');
        click(button(view.container, 'Add'));
        await settle();

        expect(settingsUpdate).not.toHaveBeenCalled();
    });

    it('offers no remove control while the script is the source', () => {
        withScript('t', 'a');
        open();
        expect(
            view.container.querySelector('button[aria-label="Remove t"]'),
        ).toBeNull();
    });

    it('removes a sound from a custom list, tilt and all', async () => {
        withInventory(['t', 'k', 'a']);
        state.settings = {
            ...state.settings,
            wordGenerator: {
                ...storedWordGenerator(),
                profile: { ...storedProfile(), phonemeTilt: { k: 'rare' } },
            },
        };
        open();

        click(view.container.querySelector('button[aria-label="Remove k"]'));
        await settle();

        expect(storedProfile().inventory).toEqual(['t', 'a']);
        // A tilt for a sound that is gone would come back if the sound did.
        expect(storedProfile().phonemeTilt).toEqual({});
    });

    it('lists an unrecognised entry separately, with a way to remove it', async () => {
        withInventory(['t', 'a', 'qqq']);
        open();
        await settle();

        expect(view.text()).toContain('Not recognised');
        click(view.container.querySelector('button[aria-label="Remove qqq"]'));
        await settle();

        expect(storedProfile().inventory).toEqual(['t', 'a']);
    });
});

describe('InventoryEditor — nothing to build from', () => {
    it('offers both ways out when there are no sounds at all', () => {
        open();
        expect(view.text()).toContain('No sounds yet');
        expect(button(view.container, 'Pick a flavour')).toBeDefined();
        expect(view.container.querySelector('a[href="/script-maker"]')).not.toBeNull();
    });

    it('"Pick a flavour" moves the keyboard to the flavour cards', () => {
        open();
        click(button(view.container, 'Pick a flavour'));

        const focused = document.activeElement as HTMLInputElement | null;
        expect(focused?.getAttribute('type')).toBe('radio');
    });

    it('drops the empty state as soon as there is a sound', async () => {
        open();
        const input = view.container.querySelector<HTMLInputElement>('input[type="text"]');
        type(input, 'a');
        click(button(view.container, 'Add'));
        await settle();

        expect(view.text()).not.toContain('No sounds yet');
    });
});
