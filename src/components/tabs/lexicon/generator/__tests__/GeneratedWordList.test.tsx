// @vitest-environment happy-dom
/**
 * GeneratedWordList — keeping the good ones.
 *
 * The add loop is the part with teeth, and three of its properties are worth a
 * test each because each has been got wrong somewhere in this codebase before:
 * ONE `refresh()` for the whole batch (not one per word), ONE summary notice
 * (not one per call), and an explicit `glyph_order` on every create — because
 * `createLexicon` stores what it is given and never auto-spells, so a word
 * added without one lands in the lexicon unspelt.
 *
 * The engine is real here, and no test asserts a specific WORD: the profile
 * data is being tuned in parallel and a batch's contents are not this
 * component's contract. Counts, calls and structure are.
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
    lexiconCreate,
    previewAutoSpelling,
    refresh,
    batchMutations,
} = await import('./harness');
type Mounted = import('./harness').Mounted;

const { default: WordGeneratorPage } = await import('../WordGeneratorPage');
const { NotificationProvider } = await import(
    '../../../../shared/notifications/NotificationProvider'
);
const { normalizePronunciation } = await import('../../../../../generator');

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

function checkboxes(): HTMLInputElement[] {
    return Array.from(view.container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
}

/** The words on screen, read off the checkboxes' accessible names. */
function words(): string[] {
    return checkboxes().map((input) => (input.getAttribute('aria-label') ?? '').replace('Select ', ''));
}

beforeEach(() => {
    resetHarness();
    withScript('t', 'k', 'n', 'a', 'i', 'o');
});

afterEach(() => {
    view?.unmount();
});

describe('GeneratedWordList — the rows', () => {
    it('shows the seed and the count', () => {
        open();
        expect(view.text()).toMatch(/seed \d+/);
        expect(view.text()).toMatch(/\d+ words/);
    });

    it('shows every word split into syllables', () => {
        open();
        const first = view.container.querySelector('li span');
        expect(words().length).toBeGreaterThan(1);
        expect(first).not.toBeNull();
        // Multi-syllable words carry the separator; the checkbox name stays the
        // plain IPA, because that is what gets stored.
        expect(view.text()).toContain('·');
    });

    it('previews the spelling once per distinct word', () => {
        open();
        const distinct = new Set(words());
        expect(previewAutoSpelling).toHaveBeenCalledTimes(distinct.size);
    });

    it('does not re-run auto-spell on an unrelated re-render', async () => {
        open();
        const before = previewAutoSpelling.mock.calls.length;
        await settle();
        expect(previewAutoSpelling.mock.calls.length).toBe(before);
    });

    it('links each word to the word form with its pronunciation', () => {
        open();
        const link = view.container.querySelector<HTMLAnchorElement>(
            'a[href^="/lexicon/create?pronunciation="]',
        );
        expect(link).not.toBeNull();
        const encoded = link!.getAttribute('href')!.split('=')[1];
        expect(decodeURIComponent(encoded)).toBe(words()[0]);
    });

    it('percent-encodes a pronunciation that needs it', () => {
        // Length marks and tie bars are legal in a query string only encoded.
        state.settings = {
            ...state.settings,
            wordGenerator: {
                ...storedWordGenerator(),
                profile: { ...storedProfile(), inventory: ['t', 'aː'], longVowelChance: 0 },
            },
        };
        open();
        const links = Array.from(
            view.container.querySelectorAll<HTMLAnchorElement>('a[href^="/lexicon/create"]'),
        );
        expect(links.length).toBeGreaterThan(0);
        for (const link of links) {
            expect(link.getAttribute('href')).not.toContain('ː');
        }
    });

    it('never offers a word the lexicon already has', async () => {
        open();
        const existing = words()[0];
        // Phase 6 removed the "already in lexicon" pill this used to check for:
        // the same normalised set is both the engine's dedupe input and the
        // pill's predicate, so no word that survived generation could ever wear
        // one. The guarantee the user actually gets is that the word is GONE.
        state.data.lexiconComplete = [word(existing)];
        view.unmount();
        open();
        await settle();

        expect(words()).not.toContain(existing);
    });

    it('normalises before comparing with the lexicon', () => {
        // A stored `ˈka.ta` and a generated `kata` are the same word.
        expect(normalizePronunciation('ˈka.ta')).toBe(normalizePronunciation('kata'));
    });
});

describe('GeneratedWordList — selecting', () => {
    it('starts with nothing selected', () => {
        open();
        expect(button(view.container, 'Add 0 selected')?.disabled).toBe(true);
    });

    it('counts the selection in the button', () => {
        open();
        click(checkboxes()[0]);
        expect(button(view.container, 'Add 1 selected')).toBeDefined();
        click(checkboxes()[1]);
        expect(button(view.container, 'Add 2 selected')).toBeDefined();
    });

    it('selects and clears every word', () => {
        open();
        const total = words().length;
        click(button(view.container, 'Select all'));
        expect(button(view.container, `Add ${total} selected`)).toBeDefined();

        click(button(view.container, 'Clear selection'));
        expect(button(view.container, 'Add 0 selected')).toBeDefined();
    });

    it('drops the selection when the batch is re-rolled', async () => {
        open();
        click(checkboxes()[0]);
        expect(button(view.container, 'Add 1 selected')).toBeDefined();

        click(button(view.container, 'Regenerate'));
        await settle();

        // The selection was about THOSE words.
        expect(button(view.container, 'Add 0 selected')).toBeDefined();
    });
});

describe('GeneratedWordList — adding to the lexicon', () => {
    it('creates each selected word once, with auto_spell and a glyph_order', async () => {
        open();
        const chosen = [words()[0], words()[1]];
        click(checkboxes()[0]);
        click(checkboxes()[1]);
        click(button(view.container, 'Add 2 selected'));
        await settle();

        expect(lexiconCreate).toHaveBeenCalledTimes(2);
        const inputs = lexiconCreate.mock.calls.map(
            (call) => call[0] as Record<string, unknown>,
        );
        expect(inputs.map((input) => input.pronunciation)).toEqual(chosen);
        for (const input of inputs) {
            expect(input.is_native).toBe(true);
            expect(input.auto_spell).toBe(true);
            // The harness's stand-in auto-spell makes one virtual glyph per
            // character, so the glyph_order is the word, character by character.
            expect(input.glyph_order).toEqual(Array.from(input.pronunciation as string));
        }
    });

    it('refreshes ONCE for the whole batch', async () => {
        open();
        click(button(view.container, 'Select all'));
        click(button(view.container, `Add ${words().length} selected`));
        await settle();

        expect(lexiconCreate.mock.calls.length).toBeGreaterThan(2);
        // ONE batch around the whole loop, and no hand-rolled `refresh()`
        // beside it: the context coalesces the per-create lexicon reads, which
        // is the N+1 refresh bug class closed at its source rather than papered
        // over here. (What the batch actually coalesces is pinned against the
        // real provider in `db/__tests__/EtymologContext.test.tsx`.)
        expect(batchMutations).toHaveBeenCalledTimes(1);
        expect(refresh).not.toHaveBeenCalled();
    });

    it('says how many landed, once', async () => {
        open();
        click(checkboxes()[0]);
        click(checkboxes()[1]);
        click(button(view.container, 'Add 2 selected'));
        await settle();

        expect(view.text()).toContain('Added 2 words to the lexicon.');
    });

    it('uses the singular for one word', async () => {
        open();
        click(checkboxes()[0]);
        click(button(view.container, 'Add 1 selected'));
        await settle();
        expect(view.text()).toContain('Added 1 word to the lexicon.');
    });

    it('takes the added rows out of the list', async () => {
        open();
        const before = words();
        click(checkboxes()[0]);
        click(button(view.container, 'Add 1 selected'));
        await settle();

        expect(words()).not.toContain(before[0]);
        expect(words().length).toBe(before.length - 1);
    });

    it('keeps a word that failed and removes the one that did not', async () => {
        open();
        const [first, second] = words();
        state.failCreateFor = new Set([second]);

        click(checkboxes()[0]);
        click(checkboxes()[1]);
        click(button(view.container, 'Add 2 selected'));
        await settle();

        expect(lexiconCreate).toHaveBeenCalledTimes(2);
        // Still ONE batch: a partial failure is not a reason to re-read the
        // lexicon per word.
        expect(batchMutations).toHaveBeenCalledTimes(1);
        expect(words()).not.toContain(first);
        // The one that failed stays, so the user can try it again.
        expect(words()).toContain(second);
    });

    it('names the failures when nothing landed', async () => {
        open();
        const [first, second] = words();
        state.failCreateFor = new Set([first, second]);

        click(checkboxes()[0]);
        click(checkboxes()[1]);
        click(button(view.container, 'Add 2 selected'));
        await settle();

        const text = view.text();
        expect(text).toContain('2 words could not be added');
        expect(text).toContain(first);
        // Nothing left the list, and nothing claimed to have been added.
        expect(text).not.toContain('Added');
        expect(words()).toContain(first);
    });

    it('does nothing when nothing is selected', () => {
        open();
        click(button(view.container, 'Add 0 selected'));
        expect(lexiconCreate).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
    });
});

describe('GeneratedWordList — copying', () => {
    it('warns instead of throwing when the browser has no clipboard', () => {
        // Plain http, an embedded webview, an old browser: `navigator.clipboard`
        // is simply not there, and an unguarded call throws inside the click
        // handler and takes the page down with it.
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
        try {
            open();
            click(button(view.container, 'Copy all'));
            expect(view.text()).toContain('Could not copy');
        } finally {
            Reflect.deleteProperty(navigator, 'clipboard');
        }
    });

    it('copies one word when the clipboard is there', async () => {
        const writeText = vi.fn(() => Promise.resolve());
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });
        try {
            open();
            const target = words()[0];
            click(
                view.container.querySelector(`button[aria-label="Copy ${target}"]`),
            );
            await settle();
            expect(writeText).toHaveBeenCalledWith(target);
        } finally {
            Reflect.deleteProperty(navigator, 'clipboard');
        }
    });

    it('copies the whole batch one word per line', async () => {
        const writeText = vi.fn(() => Promise.resolve());
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });
        try {
            open();
            const expected = words().join('\n');
            click(button(view.container, 'Copy all'));
            await settle();
            expect(writeText).toHaveBeenCalledWith(expected);
        } finally {
            Reflect.deleteProperty(navigator, 'clipboard');
        }
    });
});

describe('GeneratedWordList — when the engine comes up short', () => {
    it('explains a shortfall inline rather than showing a shorter list silently', async () => {
        // One consonant, one vowel and a CV template: there are exactly two
        // possible words, so a batch of 20 cannot be filled.
        state.settings = {
            ...state.settings,
            wordGenerator: {
                ...storedWordGenerator(),
                profile: {
                    ...storedProfile(),
                    inventory: ['t', 'a'],
                    syllables: [{ pattern: 'CV', weight: 1 }],
                    syllableCount: { min: 1, max: 1 },
                },
            },
        };
        open();
        await settle();

        expect(view.text()).toContain('Fewer words than asked for');
        expect(view.text()).toMatch(/\d+ of 20/);
    });

    it('names the rule that ate the candidates', async () => {
        state.settings = {
            ...state.settings,
            wordGenerator: {
                ...storedWordGenerator(),
                profile: {
                    ...storedProfile(),
                    inventory: ['t', 'a'],
                    syllables: [{ pattern: 'CV', weight: 1 }],
                    syllableCount: { min: 1, max: 1 },
                    forbidden: ['ta'],
                },
            },
        };
        open();
        await settle();

        const text = view.text();
        expect(text).toContain('Fewer words than asked for');
        expect(text).toMatch(/mostly by|the generator/);
    });

    it('says so plainly when there is nothing to build from', async () => {
        state.data.graphemesComplete = [];
        open();
        await settle();

        expect(words().length).toBe(0);
        expect(view.text()).toContain('No words in this batch');
    });
});
