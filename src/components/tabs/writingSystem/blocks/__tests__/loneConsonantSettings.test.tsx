// @vitest-environment happy-dom
/**
 * LoneConsonantSettings — "Consonants with no vowel".
 *
 * Rendered inside `EtymologProvider` on a REAL database (the graphemes come
 * from context) with a harness owning `leftovers` as BlocksPage's draft does.
 * `GraphemePickerModal` is replaced by a stub that records its props, so the
 * test drives "the user picked grapheme X" directly (the picker itself has
 * its own suite). Asserted:
 *
 *  - on its own by default; picking the mark radio stores NOTHING yet and
 *    reveals [Choose mark…];
 *  - choose flow: the picker opens titled "Choose the vowel-killer mark" on
 *    the Marks filter when the script has a mark, else on Word symbols when
 *    it has another no-sound grapheme, else on All, and a pick stores `{ markGraphemeId, placement:
 *    'below' }`; the mark's name and [Change mark…] then show;
 *  - the placement select writes the placement; changing the mark keeps it;
 *  - a stored mark whose grapheme is gone: the deleted warning + Choose;
 *  - no no-sound grapheme in the script: the hint links to the Script Maker;
 *  - back to "on its own" removes `leftovers`;
 *  - no phonology jargon in anything visible (P3).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;

vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

interface PickerProps {
    isOpen: boolean;
    title?: string;
    defaultFilter?: string;
    onSelect: (grapheme: { id: number }) => void;
    setIsOpen: (open: boolean) => void;
}

const picker = vi.hoisted(() => ({ last: null as PickerProps | null }));

vi.mock('../../../../form/graphemeForm/GraphemePickerModal', () => ({
    default: (props: PickerProps) => {
        picker.last = props;
        return props.isOpen ? <div data-picker-stub="">{props.title}</div> : null;
    },
}));

import { clearDatabase, initDatabase } from '../../../../../db/database';
import { etymologApi } from '../../../../../db/api';
import { EtymologProvider } from '../../../../../db/context';
import type { BlockLeftovers } from '../../../../../blocks';
import { ROUTES } from '../../../../../url_mapping';
import LoneConsonantSettings from '../LoneConsonantSettings';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const onChange = vi.fn();

function Harness({ initial }: { initial: BlockLeftovers | undefined }) {
    const [leftovers, setLeftovers] = useState(initial);
    return (
        <LoneConsonantSettings
            leftovers={leftovers}
            onChange={(next) => {
                onChange(next);
                setLeftovers(next ?? undefined);
            }}
        />
    );
}

async function settle(times = 6) {
    for (let i = 0; i < times; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
}

async function mount(initial?: BlockLeftovers) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <MemoryRouter>
                <EtymologProvider>
                    <Harness initial={initial} />
                </EtymologProvider>
            </MemoryRouter>,
        );
    });
    await settle(8);
}

async function click(el: Element) {
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle(1);
}

async function choose(select: HTMLSelectElement, value: string) {
    await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle(1);
}

function button(text: string): HTMLButtonElement {
    const found = [...container!.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
    if (!found) throw new Error(`no button "${text}"`);
    return found;
}

const radio = (value: 'alone' | 'mark') =>
    container!.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)!;
const placementSelect = () => {
    const label = [...container!.querySelectorAll('label')].find((l) => l.textContent === 'Place the mark');
    return label ? container!.querySelector<HTMLSelectElement>(`#${CSS.escape(label.htmlFor)}`) : null;
};

const svg = (tag: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${tag}"/></svg>`;

function makeGrapheme(name: string, phonemes: string[], category?: string): number {
    const glyphId = etymologApi.glyph.create({ name: `${name}-glyph`, svg_data: svg(`${name}-glyph`) }).data!.id;
    return etymologApi.grapheme.create({
        name,
        category,
        glyphs: [{ glyph_id: glyphId, position: 0 }],
        phonemes: phonemes.map((phoneme) => ({ phoneme, use_in_auto_spelling: true })),
    }).data!.id;
}

beforeAll(async () => {
    await initDatabase();
});

beforeEach(() => {
    clearDatabase();
    onChange.mockClear();
    picker.last = null;
});

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount());
        root = null;
    }
    container?.remove();
    container = null;
});

describe('LoneConsonantSettings', () => {
    it('starts on its own; the mark radio stores nothing yet and reveals the chooser', async () => {
        makeGrapheme('k', ['k']);
        makeGrapheme('Halant', []);
        await mount();
        expect(radio('alone').checked).toBe(true);
        expect(container!.querySelector('[data-mark-options]')).toBeNull();

        await click(radio('mark'));
        expect(radio('mark').checked).toBe(true);
        expect(onChange).not.toHaveBeenCalled();
        expect(button('Choose mark…').disabled).toBe(false);
        // A no-sound grapheme exists, so no "draw it first" hint.
        expect(container!.querySelector('[data-no-mark-hint]')).toBeNull();
    });

    it('choose flow: picker on the no-sound filter → { markGraphemeId, placement: "below" }', async () => {
        makeGrapheme('k', ['k']);
        const halant = makeGrapheme('Halant', []);
        await mount();
        await click(radio('mark'));
        expect(container!.querySelector('[data-picker-stub]')).toBeNull();

        await click(button('Choose mark…'));
        expect(container!.querySelector('[data-picker-stub]')?.textContent).toBe('Choose the vowel-killer mark');
        expect(picker.last!.defaultFilter).toBe('logograms');

        await act(async () => {
            picker.last!.setIsOpen(false);
            picker.last!.onSelect({ id: halant });
        });
        await settle(2);
        expect(onChange).toHaveBeenLastCalledWith({ markGraphemeId: halant, placement: 'below' });
        expect(container!.querySelector('[data-picker-stub]')).toBeNull();
        expect(container!.querySelector('[data-mark-name]')?.textContent).toBe('Halant');
        expect(container!.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Mark: Halant');
        expect(container!.querySelector('[role="img"]')?.innerHTML).toContain('Halant-glyph');
        expect(button('Change mark…')).toBeTruthy();
        expect(placementSelect()!.value).toBe('below');
    });

    it('the placement select writes the placement; changing the mark keeps it', async () => {
        const halant = makeGrapheme('Halant', []);
        const dot = makeGrapheme('Dot', []);
        await mount({ markGraphemeId: halant, placement: 'below' });
        expect(radio('mark').checked).toBe(true);

        const select = placementSelect()!;
        expect([...select.options].map((o) => o.textContent)).toEqual([
            'Below the consonant',
            'Above the consonant',
            'After the consonant',
            'Before the consonant',
        ]);
        await choose(select, 'after');
        expect(onChange).toHaveBeenLastCalledWith({ markGraphemeId: halant, placement: 'after' });

        await click(button('Change mark…'));
        await act(async () => {
            picker.last!.setIsOpen(false);
            picker.last!.onSelect({ id: dot });
        });
        await settle(2);
        expect(onChange).toHaveBeenLastCalledWith({ markGraphemeId: dot, placement: 'after' });
        expect(container!.querySelector('[data-mark-name]')?.textContent).toBe('Dot');
    });

    it('a stored mark whose grapheme is gone shows the deleted warning and Choose', async () => {
        makeGrapheme('Halant', []);
        await mount({ markGraphemeId: 9999, placement: 'above' });
        expect(radio('mark').checked).toBe(true);
        expect(container!.querySelector('[data-mark-deleted]')?.textContent).toBe(
            'The mark you chose was deleted — choose another.',
        );
        expect(container!.querySelector('[data-mark-name]')).toBeNull();
        expect(placementSelect()).toBeNull();
        expect(button('Choose mark…').disabled).toBe(false);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('no no-sound grapheme: the hint links to the Script Maker; the picker opens on All', async () => {
        makeGrapheme('k', ['k']);
        await mount();
        await click(radio('mark'));
        const hint = container!.querySelector('[data-no-mark-hint]')!;
        expect(hint.textContent).toBe('Draw the mark first: create a new grapheme, tick “No sound” and choose “A mark”.');
        expect(hint.querySelector('a')?.getAttribute('href')).toBe(ROUTES.scriptMakerCreate);

        await click(button('Choose mark…'));
        expect(picker.last!.defaultFilter).toBe('all');
    });

    it('an empty script: the hint shows and Choose is disabled (nothing to pick)', async () => {
        await mount();
        await click(radio('mark'));
        expect(container!.querySelector('[data-no-mark-hint]')).not.toBeNull();
        expect(button('Choose mark…').disabled).toBe(true);
    });

    it('a script with a mark opens the picker on Marks, and the hint stays hidden', async () => {
        makeGrapheme('k', ['k']);
        makeGrapheme('Moon', []);
        makeGrapheme('Halant', [], 'mark');
        await mount();
        await click(radio('mark'));
        expect(container!.querySelector('[data-no-mark-hint]')).toBeNull();
        await click(button('Choose mark…'));
        expect(picker.last!.defaultFilter).toBe('marks');
    });

    it('only a mark (no logogram) still counts as having a no-sound sign', async () => {
        makeGrapheme('k', ['k']);
        makeGrapheme('Halant', [], 'mark');
        await mount();
        await click(radio('mark'));
        expect(container!.querySelector('[data-no-mark-hint]')).toBeNull();
        await click(button('Choose mark…'));
        expect(picker.last!.defaultFilter).toBe('marks');
    });

    it('back to "on its own" removes leftovers', async () => {
        const halant = makeGrapheme('Halant', []);
        await mount({ markGraphemeId: halant, placement: 'before' });
        await click(radio('alone'));
        expect(onChange).toHaveBeenLastCalledWith(null);
        expect(radio('alone').checked).toBe(true);
        expect(container!.querySelector('[data-mark-options]')).toBeNull();
    });

    it('back to "on its own" before any mark was chosen stores nothing', async () => {
        makeGrapheme('Halant', []);
        await mount();
        await click(radio('mark'));
        await click(radio('alone'));
        expect(onChange).not.toHaveBeenCalled();
        expect(radio('alone').checked).toBe(true);
    });

    it('is a named radiogroup section and shows no phonology jargon', async () => {
        const halant = makeGrapheme('Halant', []);
        await mount({ markGraphemeId: halant, placement: 'below' });
        const section = container!.querySelector('section')!;
        const titleId = section.getAttribute('aria-labelledby')!;
        expect(document.getElementById(titleId)?.tagName).toBe('H3');
        expect(document.getElementById(titleId)?.textContent).toBe('Consonants with no vowel');
        expect(section.querySelector('[role="radiogroup"]')?.getAttribute('aria-labelledby')).toBe(titleId);
        expect(section.textContent).toContain('like the s at the end of strengths when no template fits it');

        const text = container!.textContent!.toLowerCase();
        for (const word of ['onset', 'coda', 'nucleus', 'sonority', 'virama']) {
            expect(text).not.toContain(word);
        }
    });
});
