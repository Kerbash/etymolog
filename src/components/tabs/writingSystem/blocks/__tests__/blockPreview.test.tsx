// @vitest-environment happy-dom
/**
 * BlockPreview — the live preview's caption.
 *
 * `useEtymolog` is mocked with ONE stable object per mount (P7) holding a
 * one-word lexicon of IPA entries, and `GlyphSpellingDisplay` is stubbed: the
 * caption is computed from `summarizeBlocks` alone, the picture has its own
 * suites. Asserted: after the readout only the non-zero parts are listed, and
 * "No template matched" appears ONLY when no block was made and some sign is
 * drawn on its own — a word whose every consonant carries the vowel-killer
 * mark is not a failure. And the controlled props (`wordId`, `ipa` + their
 * callbacks, used by the Blocks page's "Try a word") win over the internal
 * state.
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

vi.mock('../../../../display/spelling', () => ({
    GlyphSpellingDisplay: () => <div data-spelling-stub="" />,
}));

import type { BlockLeftovers, BlockScheme } from '../../../../../blocks';
import BlockPreview from '../BlockPreview';

const MARK = 40;
const markSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="mark"/></svg>';
const graphemeMap = new Map([[MARK, {
    id: MARK,
    name: 'virama',
    category: null,
    notes: null,
    created_at: '',
    updated_at: '',
    phonemes: [],
    glyphs: [{ svg_data: markSvg }],
}]]);

const CV_SCHEME: BlockScheme = {
    version: 1,
    enabled: true,
    roles: [
        { id: 'C1', label: 'C1', matcher: { kind: 'class', letter: 'C' } },
        { id: 'V', label: 'V', matcher: { kind: 'class', letter: 'V' } },
    ],
    templates: [{
        id: 'cv',
        name: 'CV',
        pattern: ['C1', 'V'],
        slots: [
            { roleId: 'C1', groupId: null, x: 0, y: 0, w: 0.5, h: 1 },
            { roleId: 'V', groupId: null, x: 0.5, y: 0, w: 0.5, h: 1 },
        ],
    }],
};
const MARKED: BlockLeftovers = { markGraphemeId: MARK, placement: 'below' };

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function unmount() {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
}

/** Mount the preview on a one-word lexicon spelled `ipa` (one IPA entry per character). */
async function captionFor(ipa: string, scheme: BlockScheme): Promise<string> {
    unmount(); // several captions per test: one mounted preview at a time
    ctx.value = {
        data: {
            lexiconComplete: [{
                id: 1,
                lemma: ipa,
                pronunciation: ipa,
                spellingDisplay: [...ipa].map((ipaCharacter, position) => ({ type: 'ipa', position, ipaCharacter })),
            }],
            graphemeMap,
            variantGroups: [],
        },
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(<BlockPreview scheme={scheme} />);
    });
    return container.querySelector('p[aria-live]')?.textContent ?? '';
}

afterEach(unmount);

describe('BlockPreview caption', () => {
    it('every consonant drawn with the mark: no "No template matched"', async () => {
        expect(await captionFor('st', { ...CV_SCHEME, leftovers: MARKED })).toBe('s · t → 2 consonants with a vowel-killer mark');
    });

    it('signs left on their own and no block: "No template matched" first', async () => {
        expect(await captionFor('st', CV_SCHEME)).toBe('s · t → No template matched · 2 signs on their own');
        expect(await captionFor('a', CV_SCHEME)).toBe('a → No template matched · 1 sign on its own');
    });

    it('blocks alone, and blocks with marked consonants', async () => {
        expect(await captionFor('ka', CV_SCHEME)).toBe('ka → 1 block: CV');
        expect(await captionFor('kat', { ...CV_SCHEME, leftovers: MARKED })).toBe('ka · t → 1 block: CV · 1 consonant with a vowel-killer mark');
    });

    it('blocks, bare signs and marked consonants together list every part', async () => {
        // k a a t → ka · a · t: one block, one bare vowel, one marked consonant.
        expect(await captionFor('kaat', { ...CV_SCHEME, leftovers: MARKED }))
            .toBe('ka · a · t → 1 block: CV · 1 sign on its own · 1 consonant with a vowel-killer mark');
    });
});

describe('BlockPreview controlled props', () => {
    const lexicon = ['ka', 'ta'].map((ipa, i) => ({
        id: i + 1,
        lemma: ipa,
        pronunciation: ipa,
        spellingDisplay: [...ipa].map((ipaCharacter, position) => ({ type: 'ipa', position, ipaCharacter })),
    }));

    function mountControlled(props: { wordId?: number | null; ipa?: string; onWordChange?: (id: number) => void; onIpaChange?: (ipa: string) => void }) {
        ctx.value = { data: { lexiconComplete: lexicon, graphemeMap, variantGroups: [] } };
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => root!.render(<BlockPreview scheme={CV_SCHEME} {...props} />));
    }
    const select = () => container!.querySelector<HTMLSelectElement>('select[aria-label="Word to preview"]')!;
    const input = () => container!.querySelector<HTMLInputElement>('input[aria-label="IPA to preview"]')!;
    const caption = () => container!.querySelector('p[aria-live]')?.textContent ?? '';

    it('the given word id and IPA win; changes are reported, not applied', () => {
        const onWordChange = vi.fn();
        const onIpaChange = vi.fn();
        mountControlled({ wordId: 2, ipa: '', onWordChange, onIpaChange });
        expect(select().value).toBe('2');
        expect(caption()).toBe('ta → 1 block: CV');

        act(() => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
            setter?.call(select(), '1');
            select().dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(onWordChange).toHaveBeenCalledWith(1);
        // Controlled: the parent has not moved it, so it stays on `ta`.
        expect(select().value).toBe('2');

        act(() => root!.render(<BlockPreview scheme={CV_SCHEME} wordId={2} ipa="kaka" onWordChange={onWordChange} onIpaChange={onIpaChange} />));
        expect(input().value).toBe('kaka');
        expect(select().disabled).toBe(true);
        expect(caption()).toBe('ka · ka → 2 blocks: CV, CV');

        act(() => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            setter?.call(input(), 'kakat');
            input().dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(onIpaChange).toHaveBeenCalledWith('kakat');
    });

    it('a null word id shows the first spelled word', () => {
        mountControlled({ wordId: null, ipa: '' });
        expect(select().value).toBe('1');
        expect(caption()).toBe('ka → 1 block: CV');
    });

    it('uncontrolled (no props) still follows its own select', () => {
        mountControlled({});
        act(() => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
            setter?.call(select(), '2');
            select().dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(select().value).toBe('2');
        expect(caption()).toBe('ta → 1 block: CV');
    });
});
