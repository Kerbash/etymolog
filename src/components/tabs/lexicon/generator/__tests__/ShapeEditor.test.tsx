// @vitest-environment happy-dom
/**
 * ShapeEditor — syllable templates, counts and vowel length.
 *
 * The interesting behaviour is the write path, not the markup. A template is
 * typed one character at a time and most of those characters are not a legal
 * pattern on their own, so this section has to hold text it will not persist,
 * persist it late, and never let the settings validator see a pattern it would
 * silently drop — which the user would experience as their typing vanishing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../../../db', async () => {
    const harness = await import('./harness');
    return { useEtymolog: harness.useHarnessEtymolog };
});

const {
    mount,
    settle,
    waitForWrite,
    click,
    type,
    blur,
    button,
    grapheme,
    resetHarness,
    state,
    storedProfile,
    settingsUpdate,
} = await import('./harness');
type Mounted = import('./harness').Mounted;

const { default: WordGeneratorPage } = await import('../WordGeneratorPage');
const { NotificationProvider } = await import(
    '../../../../shared/notifications/NotificationProvider'
);
const { isValidTemplatePattern, getPreset, LIMITS } = await import('../../../../../generator');

let view: Mounted;

function open(): Mounted {
    state.data.graphemesComplete = ['t', 'k', 'n', 'a', 'i'].map((phoneme) => grapheme(phoneme));
    view = mount(
        <NotificationProvider>
            <WordGeneratorPage />
        </NotificationProvider>,
    );
    return view;
}

/** The pattern inputs, in row order. */
function patternInputs(): HTMLInputElement[] {
    return Array.from(
        view.container.querySelectorAll<HTMLInputElement>(`input[maxlength="${LIMITS.MAX_PATTERN_LENGTH}"]`),
    );
}

function weightInputs(): HTMLInputElement[] {
    return Array.from(view.container.querySelectorAll<HTMLInputElement>('input[type="number"]'));
}

/** A `<select>` located by the text of the `<label for>` that names it. */
function selectLabelled(text: string): HTMLSelectElement {
    const label = Array.from(view.container.querySelectorAll('label')).find(
        (element) => (element.textContent ?? '').trim() === text,
    );
    const select = label?.htmlFor
        ? view.container.querySelector<HTMLSelectElement>(`#${CSS.escape(label.htmlFor)}`)
        : null;
    if (!select) throw new Error(`no select labelled "${text}"`);
    return select;
}

/** The stored templates. */
function templates(): { pattern: string; weight: number }[] {
    return storedProfile().syllables as { pattern: string; weight: number }[];
}

beforeEach(() => {
    resetHarness();
});

afterEach(() => {
    view?.unmount();
});

describe('ShapeEditor — the rows', () => {
    it('renders one row per stored template', () => {
        open();
        expect(patternInputs().map((input) => input.value)).toEqual(['CV', 'CVC', 'V']);
        expect(weightInputs().map((input) => input.value)).toEqual(['6', '2', '1']);
    });

    it('names every input for a screen reader', () => {
        open();
        for (const input of patternInputs()) {
            const label = view.container.querySelector(`label[for="${input.id}"]`);
            expect(label?.textContent).toMatch(/^Shape \d$/);
        }
    });

    it('adds a shape the profile does not already have', async () => {
        open();
        click(button(view.container, 'Add shape'));
        await settle();

        // A fixed `CV` would be a duplicate on the default profile, the
        // validator would drop it, and the button would look broken.
        expect(templates().length).toBe(4);
        expect(new Set(templates().map((entry) => entry.pattern)).size).toBe(4);
    });

    it('keeps adding distinct shapes up to the stored limit', async () => {
        open();
        for (let added = 0; added < LIMITS.MAX_TEMPLATES; added++) {
            const add = button(view.container, 'Add shape');
            if (!add || add.disabled) break;
            click(add);
            await settle();
        }

        const stored = templates().map((entry) => entry.pattern);
        expect(stored.length).toBe(LIMITS.MAX_TEMPLATES);
        expect(new Set(stored).size).toBe(stored.length);
        expect(button(view.container, 'Add shape')?.disabled).toBe(true);
    });

    it('removes a shape', async () => {
        open();
        click(view.container.querySelector('button[aria-label="Remove shape CVC"]'));
        await settle();
        expect(templates().map((entry) => entry.pattern)).toEqual(['CV', 'V']);
    });

    it('will not remove the last shape', async () => {
        open();
        click(view.container.querySelector('button[aria-label="Remove shape CVC"]'));
        await settle();
        click(view.container.querySelector('button[aria-label="Remove shape V"]'));
        await settle();

        const remove = view.container.querySelector<HTMLButtonElement>(
            'button[aria-label="Remove shape CV"]',
        );
        // A profile with no templates is reset to the defaults by the
        // validator, which reads as the page undoing the user's deletion.
        expect(remove?.disabled).toBe(true);
    });
});

describe('ShapeEditor — quick add', () => {
    it('offers the five common shapes', () => {
        open();
        for (const pattern of ['CV', 'CVC', 'CCV', 'CVN', 'V']) {
            expect(
                view.container.querySelector(`button[aria-label="Add the shape ${pattern}"]`),
            ).not.toBeNull();
        }
    });

    it('adds one that is missing', async () => {
        open();
        click(view.container.querySelector('button[aria-label="Add the shape CVN"]'));
        await settle();
        expect(templates().map((entry) => entry.pattern)).toContain('CVN');
    });

    it('disables the ones already in the profile', () => {
        open();
        const cv = view.container.querySelector<HTMLButtonElement>(
            'button[aria-label="Add the shape CV"]',
        );
        // Adding `CV` twice does not make it twice as likely — that is what the
        // weight is for — and the validator drops the duplicate anyway.
        expect(cv?.disabled).toBe(true);
    });
});

describe('ShapeEditor — typing a pattern', () => {
    it('does not persist on the keystroke', () => {
        open();
        type(patternInputs()[0], 'CVN');
        expect(settingsUpdate).not.toHaveBeenCalled();
        // The text is on screen even though nothing has been written.
        expect(patternInputs()[0].value).toBe('CVN');
    });

    it('persists once the debounce elapses', async () => {
        open();
        type(patternInputs()[0], 'CVN');
        await waitForWrite();

        expect(templates()[0].pattern).toBe('CVN');
        expect(settingsUpdate).toHaveBeenCalledTimes(1);
    });

    it('writes once for a burst of keystrokes', async () => {
        open();
        type(patternInputs()[0], 'C');
        type(patternInputs()[0], 'CV');
        type(patternInputs()[0], 'CVN');
        await waitForWrite();

        // Persisting per keystroke would validate and re-serialise the WHOLE
        // settings object ten times a second.
        expect(settingsUpdate).toHaveBeenCalledTimes(1);
        expect(templates()[0].pattern).toBe('CVN');
    });

    it('flushes on blur rather than waiting', async () => {
        open();
        type(patternInputs()[0], 'CVN');
        blur(patternInputs()[0]);
        await settle();

        expect(templates()[0].pattern).toBe('CVN');
    });

    it('keeps the other rows when one is edited', async () => {
        open();
        type(patternInputs()[0], 'CVN');
        await waitForWrite();
        expect(templates().map((entry) => entry.pattern)).toEqual(['CVN', 'CVC', 'V']);
    });

    it('applies two rows edited inside one debounce window', async () => {
        open();
        type(patternInputs()[0], 'CVN');
        type(patternInputs()[2], 'VC');
        await waitForWrite();

        // Both, in order. A patch object built from a stale `syllables` array
        // would drop the first edit — the lost update the functional patch
        // form exists to prevent.
        expect(templates().map((entry) => entry.pattern)).toEqual(['CVN', 'CVC', 'VC']);
    });
});

describe('ShapeEditor — an invalid pattern', () => {
    it('shows the parser\'s own message', () => {
        open();
        type(patternInputs()[0], 'CVX');

        const expected = isValidTemplatePattern('CVX');
        expect(expected.ok).toBe(false);
        if (expected.ok) return;
        expect(view.text()).toContain(expected.message);
    });

    it('never persists it', async () => {
        open();
        type(patternInputs()[0], 'CVX');
        await waitForWrite();

        expect(settingsUpdate).not.toHaveBeenCalled();
        expect(templates()[0].pattern).toBe('CV');
    });

    it('marks the input invalid and points at the message', () => {
        open();
        type(patternInputs()[0], 'CVX');

        const input = patternInputs()[0];
        expect(input.getAttribute('aria-invalid')).toBe('true');
        const describedBy = input.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        expect(view.container.querySelector(`#${CSS.escape(describedBy!)}`)).not.toBeNull();
    });

    it('keeps the typed text on blur instead of reverting it', async () => {
        open();
        type(patternInputs()[0], 'CVX');
        blur(patternInputs()[0]);
        await settle();

        // Reverting would replace what the user typed with the last value that
        // parsed, with no explanation.
        expect(patternInputs()[0].value).toBe('CVX');
        expect(templates()[0].pattern).toBe('CV');
    });

    it('rejects an empty pattern with its own message', () => {
        open();
        type(patternInputs()[0], '');
        expect(view.text()).toContain('A shape cannot be empty');
    });

    it('recovers when the text becomes valid again', async () => {
        open();
        type(patternInputs()[0], 'CVX');
        await waitForWrite();
        type(patternInputs()[0], 'CVN');
        await waitForWrite();

        expect(templates()[0].pattern).toBe('CVN');
    });
});

describe('ShapeEditor — weights', () => {
    it('persists a new weight after the debounce', async () => {
        open();
        type(weightInputs()[1], '5');
        await waitForWrite();
        expect(templates()[1].weight).toBe(5);
    });

    it('refuses a weight outside the stored range', async () => {
        open();
        type(weightInputs()[0], '999');
        await waitForWrite();
        expect(templates()[0].weight).toBe(6);
    });

    it('SAYS why it refused, instead of refusing in silence', async () => {
        // Phase 6. The refusal was always there — `canCommit` has never let an
        // out-of-range weight reach the settings — but nothing said so, and a
        // user who typed `999` watched a number sit in a box that no longer
        // meant anything.
        open();
        type(weightInputs()[0], '999');
        await waitForWrite();

        expect(view.text()).toContain(
            `How often must be between ${LIMITS.MIN_TEMPLATE_WEIGHT} and ${LIMITS.MAX_TEMPLATE_WEIGHT}`,
        );
        expect(weightInputs()[0].getAttribute('aria-invalid')).toBe('true');
    });

    it('points the weight input at its own message', () => {
        open();
        type(weightInputs()[0], '-4');

        const input = weightInputs()[0];
        const describedBy = input.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        const message = view.container.querySelector(`#${CSS.escape(describedBy!)}`);
        expect(message).not.toBeNull();
        // Its OWN message — not the pattern row's, which is a different field
        // in the same row and would send a screen reader to the wrong error.
        expect(message!.id).not.toBe(patternInputs()[0].getAttribute('aria-describedby'));
    });

    it('complains about an empty weight and persists nothing', async () => {
        open();
        type(weightInputs()[0], '');
        await waitForWrite();

        expect(view.text()).toContain('How often cannot be empty');
        expect(settingsUpdate).not.toHaveBeenCalled();
        expect(templates()[0].weight).toBe(6);
    });

    it('treats a value that overflows to Infinity as out of range', async () => {
        // A `type="number"` input happily holds `1e999`, and `Number()` of it
        // is `Infinity` — which fails `Number.isFinite` but is a RANGE problem,
        // not a "that is not a number" problem, and has to read as one.
        open();
        type(weightInputs()[0], '1e999');
        await waitForWrite();

        expect(view.text()).toContain('How often must be between');
        expect(view.text()).not.toContain('How often must be a number');
        expect(templates()[0].weight).toBe(6);
    });

    it('says nothing at all while the weight is fine', () => {
        open();
        expect(view.text()).not.toContain('How often must be');
        expect(view.text()).not.toContain('How often cannot be');
        expect(weightInputs()[0].getAttribute('aria-invalid')).toBe('false');
    });

    it('clears the message when the weight becomes valid again', async () => {
        open();
        type(weightInputs()[0], '999');
        await waitForWrite();
        expect(view.text()).toContain('How often must be between');

        type(weightInputs()[0], '4');
        await waitForWrite();

        expect(view.text()).not.toContain('How often must be between');
        expect(templates()[0].weight).toBe(4);
    });
});

describe('ShapeEditor — counts and length', () => {
    it('raises the maximum when the minimum passes it', async () => {
        open();
        const min = selectLabelled('Syllables per word');
        const { act } = await import('react-dom/test-utils');
        act(() => {
            min.value = '5';
            min.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await settle();

        // "At least five" on a profile that maxes at three means the maximum
        // moves; an error message here would be correct and useless.
        expect(storedProfile().syllableCount).toEqual({ min: 5, max: 5 });
    });

    it('lowers the minimum when the maximum drops below it', async () => {
        open();
        const max = selectLabelled('Most syllables per word');
        const { act } = await import('react-dom/test-utils');
        act(() => {
            max.value = '1';
            max.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await settle();

        expect(storedProfile().syllableCount).toEqual({ min: 1, max: 1 });
    });

    it('shows the long-vowel chance as a live percentage', async () => {
        open();
        const range = view.container.querySelector<HTMLInputElement>('input[type="range"]')!;
        expect(range.max).toBe('50');

        type(range, '30');
        // The label follows the thumb immediately, before the write lands.
        expect(view.text()).toContain('30 %');

        await waitForWrite();
        expect(storedProfile().longVowelChance).toBeCloseTo(0.3, 5);
    });
});

describe('ShapeEditor — when the profile changes underneath an edit', () => {
    it('drops a half-typed pattern the moment a preset replaces the profile', async () => {
        open();
        type(patternInputs()[0], 'CVX');
        expect(patternInputs()[0].value).toBe('CVX');

        const island = view.container.querySelector<HTMLInputElement>('input[value="island"]')!;
        click(island);
        await settle();

        // The draft is tagged with the value it started from; a preset makes
        // that tag stale, so the input snaps to the real stored pattern rather
        // than showing an edit the user cannot see is stale.
        const preset = getPreset('island')!;
        expect(patternInputs().map((input) => input.value)).toEqual(
            preset.profile.syllables.map((entry) => entry.pattern),
        );
        expect(view.text()).not.toContain('CVX');
    });

    it('does not write the abandoned draft afterwards', async () => {
        open();
        type(patternInputs()[0], 'CVN');
        const island = view.container.querySelector<HTMLInputElement>('input[value="island"]')!;
        click(island);
        await waitForWrite();

        // The pending patch is discarded when a preset lands: a preset
        // overwrites the whole profile, so a template from the profile it
        // replaced has nothing to be applied to.
        expect(templates().map((entry) => entry.pattern)).not.toContain('CVN');
    });
});
