// @vitest-environment happy-dom
/**
 * WordCheck — the "Check all my words" section (CONLANG_EDGES_PLAN.md §6.2).
 *
 * `useEtymolog` is mocked with ONE stable object per mount (P-C5 / P7): a
 * per-call object would loop the renderer. Asserted: nothing is computed
 * before the click; after it the status line, one group per non-empty list
 * (the first open), rows with label / readout / detail, "Try it" calling back
 * with the word id, the unused-templates list, the stale note once the scheme
 * prop changes, and the button disabled when no word is spelled.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const ctx = vi.hoisted(() => ({ value: null as unknown }));

vi.mock('../../../../../db', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    useEtymolog: () => ctx.value,
}));

import type { BlockScheme } from '../../../../../blocks';
import type { GraphemeComplete } from '../../../../../db/types';
import { A, K, T, cvcScheme, gEntry, mapOf } from '../../../../display/spelling/__tests__/blockFixtures';
import WordCheck from '../WordCheck';

const graphemeMap = mapOf(K, A, T);

function word(id: number, label: string, signs: readonly GraphemeComplete[]) {
    return { id, lemma: label, pronunciation: label, spellingDisplay: signs.map((g, i) => gEntry(g, i)) };
}

const LEXICON = [
    word(1, 'ka', [K, A]),
    word(2, 'kaa', [K, A, A]),
    word(3, 'kaat', [K, A, A, T]),
    { id: 4, lemma: 'blank', pronunciation: 'blank', spellingDisplay: [] },
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(lexicon: unknown[], scheme: BlockScheme, onTryWord = vi.fn()) {
    // ONE stable context object for the whole mount (P-C5).
    ctx.value = { data: { lexiconComplete: lexicon, graphemeMap } };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<WordCheck scheme={scheme} onTryWord={onTryWord} />));
    return onTryWord;
}

function rerender(scheme: BlockScheme, onTryWord: () => void) {
    act(() => root!.render(<WordCheck scheme={scheme} onTryWord={onTryWord} />));
}

const $ = (selector: string) => container!.querySelector<HTMLElement>(selector);
const $$ = (selector: string) => [...container!.querySelectorAll<HTMLElement>(selector)];

function button(text: string): HTMLButtonElement {
    const found = $$('button').find((b) => b.textContent?.trim() === text);
    if (!found) throw new Error(`no button "${text}"`);
    return found as HTMLButtonElement;
}

function click(el: Element) {
    act(() => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
});

describe('WordCheck', () => {
    it('shows nothing until the button is pressed; the button counts spelled words only', () => {
        mount(LEXICON, cvcScheme());
        expect(container!.textContent).toContain('Check all my words');
        expect(container!.textContent).toContain('unsaved changes included');
        expect(button('Check 3 words').disabled).toBe(false);
        expect($('[data-word-check]')).toBeNull();
        expect($$('[data-word-check-row]')).toHaveLength(0);
    });

    it('after the click: status line, groups (first open), rows, unused templates', () => {
        mount(LEXICON, cvcScheme());
        click(button('Check 3 words'));

        expect($('[data-word-check]')).not.toBeNull();
        expect($('[data-word-check-status]')!.textContent).toBe('3 words checked · 1 split cleanly');

        const groups = $$('details[data-word-check-group]');
        expect(groups.map((g) => g.getAttribute('data-word-check-group'))).toEqual(['unplaced', 'lone']);
        expect((groups[0] as HTMLDetailsElement).open).toBe(true);
        expect((groups[1] as HTMLDetailsElement).open).toBe(false);
        expect(groups[0].querySelector('summary')!.textContent).toBe('Signs drawn on their own (2)');
        expect(groups[1].querySelector('summary')!.textContent).toBe('Consonants with no vowel (1)');

        const unplacedRows = [...groups[0].querySelectorAll('[data-word-check-row]')];
        expect(unplacedRows.map((r) => r.getAttribute('data-word-check-row'))).toEqual(['2', '3']);
        expect(unplacedRows[0].textContent).toContain('kaa');
        expect(unplacedRows[0].textContent).toContain('— ka · a');
        expect(unplacedRows[0].textContent).toContain('— a at the end is drawn on its own');
        expect(groups[1].textContent).toContain('t at the end is drawn alone');

        const unused = $('[data-word-check-group="unused"]')!;
        expect(unused.textContent).toContain('Templates no word uses (1)');
        expect(unused.textContent).toContain('CVC');
        // Nothing unreadable: no group for it.
        expect($('[data-word-check-group="unreadable"]')).toBeNull();
    });

    it('"Try it" calls back with the word id', () => {
        const onTryWord = mount(LEXICON, cvcScheme());
        click(button('Check 3 words'));
        const row = $('[data-word-check-group="lone"] [data-word-check-row="3"]')!;
        const tryIt = row.querySelector('button')!;
        expect(tryIt.textContent).toBe('Try it');
        expect(tryIt.getAttribute('aria-label')).toBe('Try it: kaat');
        click(tryIt);
        expect(onTryWord).toHaveBeenCalledWith(3);
    });

    it('a new scheme makes the report stale until it is run again', () => {
        const onTryWord = mount(LEXICON, cvcScheme());
        click(button('Check 3 words'));
        expect($('[data-word-check-stale]')).toBeNull();

        const changed: BlockScheme = { ...cvcScheme(), templates: cvcScheme().templates.slice(1) };
        rerender(changed, onTryWord);
        expect($('[data-word-check-stale]')!.textContent).toBe('Settings changed since this check — run it again');
        // The old report stays visible under the note.
        expect($('[data-word-check-status]')!.textContent).toBe('3 words checked · 1 split cleanly');

        click(button('Check 3 words'));
        expect($('[data-word-check-stale]')).toBeNull();
        // CV alone now: no unused template, and `kaat` still leaves a t alone.
        expect($('[data-word-check-group="unused"]')).toBeNull();
    });

    it('lists signs that cannot be read', () => {
        const gone = { ...A, id: 77, name: 'G77' };
        mount([word(9, 'ax', [A, gone])], cvcScheme());
        click(button('Check 1 word'));
        expect($('[data-word-check-status]')!.textContent).toBe('1 word checked · 0 split cleanly');
        const group = $('details[data-word-check-group="unreadable"]')!;
        expect(group.textContent).toContain('Signs that cannot be read (1)');
        expect(group.textContent).toContain('G77 cannot be read');
    });

    it('is disabled with no spelled word', () => {
        mount([{ id: 4, lemma: 'blank', pronunciation: 'blank', spellingDisplay: [] }], cvcScheme());
        expect(button('Check 0 words').disabled).toBe(true);
        expect(container!.textContent).toContain('No spelled words yet');
    });
});
