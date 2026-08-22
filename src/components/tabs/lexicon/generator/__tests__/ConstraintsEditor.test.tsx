// @vitest-environment happy-dom
/**
 * ConstraintsEditor — the four switches, the cluster budget and the forbidden list.
 *
 * The switches write immediately (a toggle has no in-progress state to hold),
 * the forbidden box is debounced (it is typed), and both write the WHOLE
 * `wordGenerator` key. The last of those is asserted directly rather than
 * inferred: a partial nested write type-checks, looks right in review, and
 * blanks the IPA chart's guide.
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
const { LIMITS } = await import('../../../../../generator');
const { parseForbidden } = await import('../generatorText');

let view: Mounted;

function open(phonemes: string[] = ['t', 'k', 'n', 'a', 'i']): Mounted {
    // The script is set HERE rather than in the test body: `open` is what
    // mounts, so a test that seeded graphemes first would have them overwritten
    // and would be asserting on a different inventory than it thinks.
    state.data.graphemesComplete = phonemes.map((phoneme) => grapheme(phoneme));
    view = mount(
        <NotificationProvider>
            <WordGeneratorPage />
        </NotificationProvider>,
    );
    return view;
}

function toggle(label: string): void {
    const element = view.container.querySelector(`[role="switch"][aria-label="${label}"]`);
    if (!element) throw new Error(`no switch labelled "${label}"`);
    click(element);
}

function switchState(label: string): string | null {
    return view.container
        .querySelector(`[role="switch"][aria-label="${label}"]`)
        ?.getAttribute('aria-checked') ?? null;
}

function forbiddenInput(): HTMLInputElement {
    const input = view.container.querySelector<HTMLInputElement>('input[placeholder="mb nd ŋg"]');
    if (!input) throw new Error('no forbidden input');
    return input;
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

function clusters(): Record<string, unknown> {
    return storedProfile().clusters as Record<string, unknown>;
}

beforeEach(() => {
    resetHarness();
});

afterEach(() => {
    view?.unmount();
});

describe('ConstraintsEditor — the switches', () => {
    it('offers all four, each with an accessible name', () => {
        open();
        for (const label of [
            'Clusters must rise and fall in sonority',
            'Allow s + stop at the start of a word',
            'Allow doubled consonants',
            'Vowel harmony (front and back)',
        ]) {
            expect(switchState(label)).not.toBeNull();
        }
    });

    it('shows the stored state', () => {
        open();
        expect(switchState('Clusters must rise and fall in sonority')).toBe('true');
        expect(switchState('Allow doubled consonants')).toBe('false');
        expect(switchState('Vowel harmony (front and back)')).toBe('false');
    });

    it('writes a cluster rule immediately, with the whole key', async () => {
        open();
        toggle('Allow doubled consonants');
        await settle();

        expect(settingsUpdate).toHaveBeenCalledTimes(1);
        const patch = settingsUpdate.mock.calls[0][0] as Record<string, unknown>;
        expect(Object.keys(patch)).toEqual(['wordGenerator']);
        const key = patch.wordGenerator as Record<string, unknown>;
        // Both halves survive: a `{ profile }`-only write blanks the chart guide.
        expect(key).toHaveProperty('guidePresetId');
        expect(clusters().allowGeminates).toBe(true);
    });

    it('keeps the other cluster rules when one is changed', async () => {
        open();
        toggle('Allow s + stop at the start of a word');
        await settle();

        expect(clusters().sibilantOnsetException).toBe(true);
        expect(clusters().sonority).toBe(true);
        expect(clusters().maxPerWord).toBe(1);
        expect(clusters().allowGeminates).toBe(false);
    });

    it('maps the harmony switch onto its enum', async () => {
        open();
        toggle('Vowel harmony (front and back)');
        await settle();
        expect(storedProfile().vowelHarmony).toBe('frontBack');

        toggle('Vowel harmony (front and back)');
        await settle();
        // `off`, not `false`: the field is an enum with room for more harmonies.
        expect(storedProfile().vowelHarmony).toBe('off');
    });

    it('reaches the engine — geminates appear only once allowed', async () => {
        state.settings = {
            ...state.settings,
            wordGenerator: {
                ...storedWordGenerator(),
                profile: {
                    ...storedProfile(),
                    syllables: [{ pattern: 'CVC', weight: 1 }],
                    syllableCount: { min: 2, max: 2 },
                },
            },
        };
        // One consonant, one vowel, two CVC syllables: every word is `tatCat`,
        // so the geminate across the boundary is unavoidable the moment it is
        // permitted and impossible while it is not.
        open(['t', 'a']);
        await settle();

        const before = Array.from(view.container.querySelectorAll('input[type="checkbox"]'))
            .map((input) => (input.getAttribute('aria-label') ?? '').replace('Select ', ''))
            .join(' ');
        expect(before).not.toContain('tt');

        toggle('Allow doubled consonants');
        await settle();

        const after = Array.from(view.container.querySelectorAll('input[type="checkbox"]'))
            .map((input) => (input.getAttribute('aria-label') ?? '').replace('Select ', ''))
            .join(' ');
        expect(after).toContain('tt');
    });
});

describe('ConstraintsEditor — the cluster budget', () => {
    it('offers 0 to the stored maximum', () => {
        open();
        const select = selectLabelled('Consonant clusters per word');
        expect(select.options.length).toBe(LIMITS.MAX_CLUSTERS_PER_WORD + 1);
        expect(Array.from(select.options).map((option) => option.value)).toEqual([
            '0',
            '1',
            '2',
            '3',
            '4',
        ]);
    });

    it('persists a new budget as a number', async () => {
        open();
        const select = selectLabelled('Consonant clusters per word');
        const { act } = await import('react-dom/test-utils');
        act(() => {
            select.value = '3';
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await settle();

        // A string here would be clamped away by the validator.
        expect(clusters().maxPerWord).toBe(3);
    });
});

describe('ConstraintsEditor — forbidden sequences', () => {
    it('starts empty and shows no chips', () => {
        open();
        expect(forbiddenInput().value).toBe('');
        expect(storedProfile().forbidden).toEqual([]);
    });

    it('parses a space-separated list after the debounce', async () => {
        open();
        type(forbiddenInput(), 'mb nd');
        expect(settingsUpdate).not.toHaveBeenCalled();

        await waitForWrite();
        expect(storedProfile().forbidden).toEqual(['mb', 'nd']);
    });

    it('parses commas too', async () => {
        open();
        type(forbiddenInput(), 'mb, nd,ŋg');
        await waitForWrite();
        expect(storedProfile().forbidden).toEqual(['mb', 'nd', 'ŋg']);
    });

    it('flushes on blur', async () => {
        open();
        type(forbiddenInput(), 'kt');
        blur(forbiddenInput());
        await settle();
        expect(storedProfile().forbidden).toEqual(['kt']);
    });

    it('shows each sequence as a removable chip', async () => {
        open();
        type(forbiddenInput(), 'mb nd');
        await waitForWrite();

        expect(
            view.container.querySelector('button[aria-label="Stop forbidding mb"]'),
        ).not.toBeNull();

        click(view.container.querySelector('button[aria-label="Stop forbidding mb"]'));
        await settle();

        expect(storedProfile().forbidden).toEqual(['nd']);
        // Removing a chip rewrites the box as well — one source of truth.
        expect(forbiddenInput().value).toBe('nd');
    });

    it('reaches the engine — a forbidden sequence appears in no word', async () => {
        open(['t', 'a']);
        const read = () =>
            Array.from(view.container.querySelectorAll('input[type="checkbox"]'))
                .map((input) => (input.getAttribute('aria-label') ?? '').replace('Select ', ''))
                .join(' ');

        // With only `t` and `a`, `ta` is in essentially every word until it is
        // forbidden — which is what makes the second half of this meaningful.
        expect(read()).toContain('ta');

        type(forbiddenInput(), 'ta');
        await waitForWrite();

        expect(read()).not.toContain('ta');
    });
});

describe('parseForbidden', () => {
    it('splits on whitespace and commas', () => {
        expect(parseForbidden('mb, nd  ŋg')).toEqual(['mb', 'nd', 'ŋg']);
    });

    it('drops empties and duplicates', () => {
        expect(parseForbidden('  mb ,, mb  ')).toEqual(['mb']);
    });

    it('truncates a sequence to the stored length', () => {
        const long = 'x'.repeat(LIMITS.MAX_FORBIDDEN_LENGTH + 10);
        expect(parseForbidden(long)[0].length).toBe(LIMITS.MAX_FORBIDDEN_LENGTH);
    });

    it('caps the list at the stored maximum', () => {
        const many = Array.from({ length: LIMITS.MAX_FORBIDDEN + 10 }, (_unused, i) => `s${i}`);
        expect(parseForbidden(many.join(' ')).length).toBe(LIMITS.MAX_FORBIDDEN);
    });

    it('is empty for empty text', () => {
        expect(parseForbidden('')).toEqual([]);
        expect(parseForbidden('   ')).toEqual([]);
    });
});
