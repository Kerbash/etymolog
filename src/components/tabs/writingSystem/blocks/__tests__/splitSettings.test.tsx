// @vitest-environment happy-dom
/**
 * SplitSettings — "Splitting words into blocks".
 *
 * Rendered in a tiny harness that owns the `split` (as BlocksPage's draft
 * does). Asserted:
 *
 *  - unset: the visible "currently split by template order" note, with By
 *    template order shown checked (that IS the current behaviour);
 *  - choosing By syllable reports `{ mode: 'syllables' }` and the note goes;
 *  - choosing By template order stores it explicitly (the note goes too);
 *  - the s + consonant checkbox exists only by syllable and toggles
 *    `sibilantClusters` in the normalised form;
 *  - it is a named radiogroup of real radios; "Recommended" sits on By syllable;
 *  - no phonology jargon in anything visible (P3);
 *  - "Vowels next to each other" (DIPHTHONG_BLOCKS_PLAN.md §4.2): add by
 *    button and by Enter (trimmed, NFC), duplicates and empties ignored, chips
 *    removable, suggestions are buttons (and vanish once listed), a visible
 *    warning for an entry that is not two vowels, the cap line, the example
 *    line — and the radios / checkbox KEEP the list (template order drops it);
 *  - "Consonants that can carry a syllable" (CONLANG_EDGES_PLAN.md §5.1): the
 *    same behaviours under `data-syllabic-*`, its own warning / example /
 *    "Suggested from your signs:" row, and every control keeping BOTH lists;
 *  - the visible line on `.`, `‿` and the stress marks under By syllable.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { useState } from 'react';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import type { BlockSplit } from '../../../../../blocks';
import SplitSettings from '../SplitSettings';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const onChange = vi.fn();

function Harness({
    initial,
    suggestions,
    syllabicSuggestions,
}: {
    initial: BlockSplit | undefined;
    suggestions: readonly string[];
    syllabicSuggestions: readonly string[];
}) {
    const [split, setSplit] = useState(initial);
    return (
        <SplitSettings
            split={split}
            suggestions={suggestions}
            syllabicSuggestions={syllabicSuggestions}
            onChange={(next) => {
                onChange(next);
                setSplit(next);
            }}
        />
    );
}

async function mount(
    initial: BlockSplit | undefined,
    suggestions: readonly string[] = [],
    syllabicSuggestions: readonly string[] = [],
) {
    onChange.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(<Harness initial={initial} suggestions={suggestions} syllabicSuggestions={syllabicSuggestions} />);
    });
}

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount());
        root = null;
    }
    container?.remove();
    container = null;
});

const radio = (value: 'syllables' | 'templates') =>
    container!.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)!;
const checkbox = () => container!.querySelector<HTMLInputElement>('input[type="checkbox"]');
const note = () => container!.querySelector('[data-split-unset-note]');

async function click(el: Element) {
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

describe('SplitSettings', () => {
    it('unset: shows the note and By template order checked — nothing stored silently', async () => {
        await mount(undefined);
        expect(note()?.textContent).toContain('Your words are currently split by template order');
        expect(note()?.textContent).toContain('Most scripts read better split by syllable.');
        expect(radio('templates').checked).toBe(true);
        expect(radio('syllables').checked).toBe(false);
        expect(checkbox()).toBeNull();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('choosing By syllable reports { mode: "syllables" } and the note goes', async () => {
        await mount(undefined);
        await click(radio('syllables'));
        expect(onChange).toHaveBeenLastCalledWith({ mode: 'syllables' });
        expect(Object.keys(onChange.mock.lastCall![0])).toEqual(['mode']);
        expect(radio('syllables').checked).toBe(true);
        expect(note()).toBeNull();
    });

    it('clicking the already-checked By template order while unset stores it explicitly', async () => {
        await mount(undefined);
        await click(radio('templates'));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenLastCalledWith({ mode: 'templates' });
        expect(note()).toBeNull();
        // Once chosen, clicking it again stores nothing new.
        await click(radio('templates'));
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('switching back to By template order stores it', async () => {
        await mount({ mode: 'syllables' });
        await click(radio('templates'));
        expect(onChange).toHaveBeenLastCalledWith({ mode: 'templates' });
        expect(note()).toBeNull();
    });

    it('the s + consonant checkbox exists only by syllable and toggles sibilantClusters', async () => {
        await mount({ mode: 'syllables' });
        const box = checkbox()!;
        expect(box).not.toBeNull();
        expect(box.checked).toBe(false);
        expect(box.closest('label')!.textContent).toContain('Let a syllable start with s + another consonant (sp, st, str)');
        expect(box.closest('label')!.textContent).toContain('Off: asta → as · ta. On: asta → a · sta.');

        await click(box);
        expect(onChange).toHaveBeenLastCalledWith({ mode: 'syllables', sibilantClusters: true });
        expect(checkbox()!.checked).toBe(true);

        await click(checkbox()!);
        expect(onChange).toHaveBeenLastCalledWith({ mode: 'syllables' });
        expect(Object.keys(onChange.mock.lastCall![0])).toEqual(['mode']);

        await click(radio('templates'));
        expect(onChange).toHaveBeenLastCalledWith({ mode: 'templates' });
        expect(checkbox()).toBeNull();
    });

    it('coming back to By syllable from template order starts the s + consonant option off', async () => {
        // Template mode drops the option (it only means something by syllable),
        // so coming back starts it off — reported in the normalised form.
        await mount({ mode: 'templates' });
        await click(radio('syllables'));
        expect(onChange).toHaveBeenLastCalledWith({ mode: 'syllables' });
    });

    it('is a named radiogroup; Recommended sits on By syllable; examples are shown', async () => {
        await mount({ mode: 'syllables' });
        const group = container!.querySelector('[role="radiogroup"]')!;
        const labelledBy = group.getAttribute('aria-labelledby')!;
        expect(document.getElementById(labelledBy)?.textContent).toBe('Splitting words into blocks');
        expect(group.querySelectorAll('input[type="radio"]')).toHaveLength(2);

        const section = container!.querySelector('section')!;
        expect(section.getAttribute('aria-labelledby')).toBe(labelledBy);
        expect(section.querySelector('h3')?.textContent).toBe('Splitting words into blocks');

        const syllableLabel = radio('syllables').closest('label')!.textContent!;
        expect(syllableLabel).toContain('By syllable');
        expect(syllableLabel).toContain('Recommended');
        expect(syllableLabel).toContain('Each word is cut into syllables, and each syllable becomes one block.');
        expect(syllableLabel).toContain('tapa → ta · pa');
        const templateLabel = radio('templates').closest('label')!.textContent!;
        expect(templateLabel).not.toContain('Recommended');
        expect(templateLabel).toContain('Reads left to right and uses the first template that fits, as earlier versions did.');
        expect(templateLabel).toContain('tapa → tap · a');
    });

    it.each([undefined, { mode: 'syllables' as const }, { mode: 'templates' as const }])(
        'shows no phonology jargon (%o)',
        async (split) => {
            await mount(split);
            const text = container!.textContent!.toLowerCase();
            for (const word of ['onset', 'coda', 'nucleus', 'sonority', 'virama', 'hiatus', 'glide', 'cluster', 'diphthong']) {
                expect(text).not.toContain(word);
            }
        },
    );

    describe('Vowels next to each other', () => {
        const pairInput = () => container!.querySelector<HTMLInputElement>('input[aria-label="Vowel pair"]');
        const addButton = () =>
            [...container!.querySelectorAll<HTMLButtonElement>('[data-diphthong-settings] button')].find(
                (button) => button.textContent?.trim() === 'Add',
            )!;
        const chips = () =>
            [...container!.querySelectorAll('[data-diphthong]')].map((chip) => chip.getAttribute('data-diphthong'));
        const byName = (name: string) =>
            [...container!.querySelectorAll<HTMLButtonElement>('button')].find(
                (button) => button.getAttribute('aria-label') === name,
            );
        const lastSplit = () => onChange.mock.lastCall![0] as BlockSplit;

        async function type(value: string) {
            const input = pairInput()!;
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
            await act(async () => {
                setter.call(input, value);
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }

        async function pressEnter() {
            await act(async () => {
                pairInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            });
        }

        it('shows only by syllable, with the plain explanation and the fixed example', async () => {
            await mount({ mode: 'templates' });
            expect(container!.querySelector('[data-diphthong-settings]')).toBeNull();
            await act(async () => root!.unmount());
            root = null;
            container!.remove();

            await mount({ mode: 'syllables' });
            const block = container!.querySelector('[data-diphthong-settings]')!;
            expect(block.textContent).toContain('Vowels next to each other');
            expect(block.textContent).toContain(
                'Two vowel signs in a row are usually two syllables (a · i). List the vowel pairs your language says as one vowel, and they stay in one block.',
            );
            expect(container!.querySelector('[data-diphthong-example]')!.textContent).toBe(
                'With ai: tai → tai. Without: tai → ta · i.',
            );
            expect(chips()).toEqual([]);
            expect(container!.querySelector('[data-diphthong-suggestions]')).toBeNull();
        });

        it('adds with the Add button — trimmed — and clears the text', async () => {
            await mount({ mode: 'syllables' });
            await type('  iə ');
            await click(addButton());
            expect(lastSplit()).toEqual({ mode: 'syllables', diphthongs: ['iə'] });
            expect(chips()).toEqual(['iə']);
            expect(pairInput()!.value).toBe('');
            // The example now uses the first listed pair.
            expect(container!.querySelector('[data-diphthong-example]')!.textContent).toBe(
                'With iə: tiə → tiə. Without: tiə → ti · ə.',
            );
        });

        it('adds with Enter, NFC-normalised', async () => {
            await mount({ mode: 'syllables' });
            const decomposed = 'a' + String.fromCodePoint(0x303) + 'i';
            await type(decomposed);
            await pressEnter();
            expect(lastSplit()).toEqual({ mode: 'syllables', diphthongs: [decomposed.normalize('NFC')] });
        });

        it('ignores empty text and an entry already listed', async () => {
            await mount({ mode: 'syllables', diphthongs: ['ai'] });
            await type('   ');
            await click(addButton());
            expect(onChange).not.toHaveBeenCalled();

            await type('ai');
            await pressEnter();
            expect(onChange).not.toHaveBeenCalled();
            expect(chips()).toEqual(['ai']);
        });

        it('removes a chip by its "Remove …" button; removing the last one drops the key', async () => {
            await mount({ mode: 'syllables', diphthongs: ['ai', 'au'] });
            expect(chips()).toEqual(['ai', 'au']);
            await click(byName('Remove ai')!);
            expect(lastSplit()).toEqual({ mode: 'syllables', diphthongs: ['au'] });
            await click(byName('Remove au')!);
            expect(lastSplit()).toEqual({ mode: 'syllables' });
            expect(Object.keys(lastSplit())).toEqual(['mode']);
            expect(chips()).toEqual([]);
        });

        it('suggestions are buttons; clicking one adds it and it leaves the row', async () => {
            await mount({ mode: 'syllables', diphthongs: ['ai'] }, ['ai', 'ei', 'ou']);
            const row = () => container!.querySelector('[data-diphthong-suggestions]');
            expect(row()!.textContent).toContain('Suggested from your word shapes:');
            expect(byName('Add ai')).toBeUndefined();
            expect(byName('Add ei')!.textContent).toBe('+ ei');
            expect(onChange).not.toHaveBeenCalled();

            await click(byName('Add ei')!);
            expect(lastSplit()).toEqual({ mode: 'syllables', diphthongs: ['ai', 'ei'] });
            expect(byName('Add ei')).toBeUndefined();

            await click(byName('Add ou')!);
            expect(row()).toBeNull();
        });

        it('warns, visibly, about an entry that is not two vowels — but keeps it', async () => {
            await mount({ mode: 'syllables', diphthongs: ['ai'] });
            await type('ng');
            await click(addButton());
            expect(lastSplit()).toEqual({ mode: 'syllables', diphthongs: ['ai', 'ng'] });
            const warning = container!.querySelector('[data-diphthong-warning="ng"]')!;
            expect(warning.textContent).toBe('ng is not two vowels, so it will not join anything.');
            expect(container!.querySelector('[data-diphthong-warning="ai"]')).toBeNull();
        });

        it('stops at the cap, with a visible line', async () => {
            const full = Array.from({ length: 32 }, (_, k) => `a${k}`);
            await mount({ mode: 'syllables', diphthongs: full });
            expect(container!.querySelector('[data-diphthong-cap]')!.textContent).toBe('You can list up to 32.');
            await type('ou');
            await click(addButton());
            expect(onChange).not.toHaveBeenCalled();
        });

        it('the s + consonant checkbox KEEPS the list; template order drops it', async () => {
            await mount({ mode: 'syllables', diphthongs: ['ai', 'au'] });
            await click(checkbox()!);
            expect(lastSplit()).toEqual({ mode: 'syllables', sibilantClusters: true, diphthongs: ['ai', 'au'] });
            await click(checkbox()!);
            expect(lastSplit()).toEqual({ mode: 'syllables', diphthongs: ['ai', 'au'] });

            await click(radio('templates'));
            expect(lastSplit()).toEqual({ mode: 'templates' });
            expect(Object.keys(lastSplit())).toEqual(['mode']);
        });

        it('adding keeps the s + consonant option on', async () => {
            await mount({ mode: 'syllables', sibilantClusters: true });
            await type('ai');
            await pressEnter();
            expect(lastSplit()).toEqual({ mode: 'syllables', sibilantClusters: true, diphthongs: ['ai'] });
        });
    });

    describe('Consonants that can carry a syllable', () => {
        const consonantInput = () => container!.querySelector<HTMLInputElement>('input[aria-label="Consonant"]');
        const addButton = () =>
            [...container!.querySelectorAll<HTMLButtonElement>('[data-syllabic-settings] button')].find(
                (button) => button.textContent?.trim() === 'Add',
            )!;
        const chips = () =>
            [...container!.querySelectorAll('[data-syllabic]')].map((chip) => chip.getAttribute('data-syllabic'));
        const byName = (name: string) =>
            [...container!.querySelectorAll<HTMLButtonElement>('button')].find(
                (button) => button.getAttribute('aria-label') === name,
            );
        const lastSplit = () => onChange.mock.lastCall![0] as BlockSplit;
        const example = () => container!.querySelector('[data-syllabic-example]')!.textContent;

        async function type(value: string) {
            const input = consonantInput()!;
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
            await act(async () => {
                setter.call(input, value);
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }

        async function pressEnter() {
            await act(async () => {
                consonantInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            });
        }

        it('shows only by syllable, after the vowel list, with the plain explanation and the fixed example', async () => {
            await mount({ mode: 'templates' });
            expect(container!.querySelector('[data-syllabic-settings]')).toBeNull();
            await act(async () => root!.unmount());
            root = null;
            container!.remove();

            await mount({ mode: 'syllables' });
            const block = container!.querySelector('[data-syllabic-settings]')!;
            const vowels = container!.querySelector('[data-diphthong-settings]')!;
            expect(vowels.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

            const labelledBy = block.getAttribute('aria-labelledby')!;
            expect(document.getElementById(labelledBy)?.textContent).toBe('Consonants that can carry a syllable');
            expect(block.textContent).toContain(
                'A syllable usually needs a vowel. List the consonants that can stand in for one, and a word with no vowel between them (prst, vlk) is still cut into syllables. A listed consonant only counts when no vowel is next to it.',
            );
            expect(block.textContent).toContain(
                'A template needs a box that takes a consonant in the middle (a Core role of class R, or Anything) to draw such a syllable.',
            );
            expect(consonantInput()!.placeholder).toBe('type a consonant…');
            expect(example()).toBe('With r: krtek → kr · tek. Without: krtek → krtek.');
            expect(chips()).toEqual([]);
            expect(container!.querySelector('[data-syllabic-suggestions]')).toBeNull();
        });

        it('adds with the Add button — trimmed — clears the text, and the example follows the first entry', async () => {
            await mount({ mode: 'syllables' });
            await type('  l ');
            await click(addButton());
            expect(lastSplit()).toEqual({ mode: 'syllables', syllabicConsonants: ['l'] });
            expect(chips()).toEqual(['l']);
            expect(consonantInput()!.value).toBe('');
            expect(example()).toBe('With l: kltek → kl · tek. Without: kltek → kltek.');
            const list = container!.querySelector('[data-syllabic-settings] ul')!;
            expect(list.getAttribute('aria-label')).toBe('Consonants that can carry a syllable');
        });

        it('adds with Enter, NFC-normalised; empty and already-listed entries are ignored', async () => {
            await mount({ mode: 'syllables', syllabicConsonants: ['r'] });
            await type('   ');
            await pressEnter();
            expect(onChange).not.toHaveBeenCalled();
            await type('r');
            await pressEnter();
            expect(onChange).not.toHaveBeenCalled();

            const decomposed = 'n' + String.fromCodePoint(0x303); // n + combining tilde → ñ
            await type(decomposed);
            await pressEnter();
            expect(lastSplit()).toEqual({ mode: 'syllables', syllabicConsonants: ['r', decomposed.normalize('NFC')] });
        });

        it('removes a chip; removing the last one drops the key', async () => {
            await mount({ mode: 'syllables', syllabicConsonants: ['r', 'l'] });
            await click(byName('Remove r')!);
            expect(lastSplit()).toEqual({ mode: 'syllables', syllabicConsonants: ['l'] });
            await click(byName('Remove l')!);
            expect(lastSplit()).toEqual({ mode: 'syllables' });
            expect(Object.keys(lastSplit())).toEqual(['mode']);
        });

        it('suggestions are buttons labelled "Suggested from your signs:"; one leaves the row once added', async () => {
            await mount({ mode: 'syllables', syllabicConsonants: ['r'] }, [], ['r', 'l', 'n']);
            const row = () => container!.querySelector('[data-syllabic-suggestions]');
            expect(row()!.textContent).toContain('Suggested from your signs:');
            expect(byName('Add r')).toBeUndefined();
            expect(byName('Add l')!.textContent).toBe('+ l');
            expect(onChange).not.toHaveBeenCalled();

            await click(byName('Add l')!);
            expect(lastSplit()).toEqual({ mode: 'syllables', syllabicConsonants: ['r', 'l'] });
            await click(byName('Add n')!);
            expect(row()).toBeNull();
        });

        it('warns, visibly, about an entry that is not one consonant — but keeps it', async () => {
            await mount({ mode: 'syllables', syllabicConsonants: ['r'] });
            await type('a');
            await click(addButton());
            await type('rl');
            await click(addButton());
            expect(lastSplit()).toEqual({ mode: 'syllables', syllabicConsonants: ['r', 'a', 'rl'] });
            expect(container!.querySelector('[data-syllabic-warning="a"]')!.textContent).toBe(
                'a is not one consonant, so it will not carry anything.',
            );
            expect(container!.querySelector('[data-syllabic-warning="rl"]')).not.toBeNull();
            expect(container!.querySelector('[data-syllabic-warning="r"]')).toBeNull();
            // The vowel list's own warnings are separate.
            expect(container!.querySelector('[data-diphthong-warning]')).toBeNull();
        });

        it('refuses an entry longer than 8 letters, with a visible reason', async () => {
            await mount({ mode: 'syllables' });
            await type('rrrrrrrrr');
            await click(addButton());
            expect(onChange).not.toHaveBeenCalled();
            expect(container!.querySelector('[data-syllabic-problem]')!.textContent).toBe(
                'A consonant can be at most 8 letters long.',
            );
            expect(consonantInput()!.value).toBe('rrrrrrrrr');
        });

        it('stops at the cap, with a visible line', async () => {
            const full = Array.from({ length: 32 }, (_, k) => `r${k}`);
            await mount({ mode: 'syllables', syllabicConsonants: full });
            expect(container!.querySelector('[data-syllabic-cap]')!.textContent).toBe('You can list up to 32.');
            expect(container!.querySelector('[data-diphthong-cap]')).toBeNull();
            await type('l');
            await click(addButton());
            expect(onChange).not.toHaveBeenCalled();
        });

        it('every control keeps BOTH lists; template order drops both', async () => {
            await mount({ mode: 'syllables', diphthongs: ['ai'], syllabicConsonants: ['r'] });
            await click(checkbox()!);
            expect(lastSplit()).toEqual({
                mode: 'syllables',
                sibilantClusters: true,
                diphthongs: ['ai'],
                syllabicConsonants: ['r'],
            });

            // Editing the vowel list keeps the consonants, and the other way round.
            const pairInput = container!.querySelector<HTMLInputElement>('input[aria-label="Vowel pair"]')!;
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
            await act(async () => {
                setter.call(pairInput, 'au');
                pairInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await act(async () => {
                pairInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            });
            expect(lastSplit()).toEqual({
                mode: 'syllables',
                sibilantClusters: true,
                diphthongs: ['ai', 'au'],
                syllabicConsonants: ['r'],
            });
            await type('l');
            await pressEnter();
            expect(lastSplit()).toEqual({
                mode: 'syllables',
                sibilantClusters: true,
                diphthongs: ['ai', 'au'],
                syllabicConsonants: ['r', 'l'],
            });

            await click(checkbox()!);
            expect(lastSplit()).toEqual({ mode: 'syllables', diphthongs: ['ai', 'au'], syllabicConsonants: ['r', 'l'] });

            await click(radio('templates'));
            expect(lastSplit()).toEqual({ mode: 'templates' });
            expect(Object.keys(lastSplit())).toEqual(['mode']);
        });

        it('the By syllable radio passes a list the split already holds', async () => {
            // Template order never stores a list through the UI, but the
            // syllables radio must still pass whatever lists the split holds.
            await mount({ mode: 'templates', syllabicConsonants: ['r'] } as BlockSplit);
            await click(radio('syllables'));
            expect(lastSplit()).toEqual({ mode: 'syllables', syllabicConsonants: ['r'] });
        });
    });

    it('under By syllable, says in one visible line what . ‿ and the stress marks do', async () => {
        await mount({ mode: 'syllables' });
        expect(container!.querySelector('[data-split-marks-note]')!.textContent).toBe(
            'In a pronunciation, . forces a cut and ‿ forbids one: a‿i stays in one block. Stress marks (ˈ ˌ) cut like . does.',
        );
        await act(async () => root!.unmount());
        root = null;
        container!.remove();
        await mount({ mode: 'templates' });
        expect(container!.querySelector('[data-split-marks-note]')).toBeNull();
    });
});
