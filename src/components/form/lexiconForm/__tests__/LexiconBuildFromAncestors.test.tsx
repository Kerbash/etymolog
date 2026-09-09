// @vitest-environment happy-dom
/**
 * LexiconFormFields — "Build spelling from ancestors" (Phase 4, UC-B2).
 *
 * When a word has ancestors and the Spelling section is in Compose mode, a
 * button concatenates each ancestor's stored spelling — in ancestry position
 * order — onto this word's canvas. This is the "night + affliction = boredom"
 * four-click flow: add the ancestors, press Build, save.
 *
 * What this pins:
 *  - build from 2 ancestors, one of which carries an IPA fallback, produces the
 *    ancestors' glyph_order concatenated in order;
 *  - the concatenation follows the ancestry order (reorder → rebuild order);
 *  - a non-empty canvas is confirmed before it is overwritten (confirm applies,
 *    cancel leaves it alone);
 *  - when every ancestor's spelling is empty the button is disabled with a hint.
 *
 * The REAL GlyphCanvasInput is mounted (the feature drives it through its
 * imperative `setGlyphOrder` handle, so a stub would prove nothing); the
 * meanings table and ancestry picker are stubbed — the ancestor ROWS are seeded
 * from `initialData` in edit mode, independent of the picker's UI.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import type { SpellingEntry } from '../../../../db/utils/spellingUtils';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;

vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
})));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const grapheme = (id: number, name: string, category = 'consonant') => ({
    id, name, category, notes: null, created_at: '', updated_at: '',
    glyphs: [{ id, name, svg_data: `<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`, category, notes: null, created_at: '', updated_at: '' }],
    phonemes: [],
});

// Ancestor words, each with a stored spelling. "affliction" carries an IPA
// fallback entry ("ə") that must survive the build verbatim; "silence" has an
// empty spelling and must contribute nothing.
const LEXICON_COMPLETE = [
    { id: 1, lemma: 'night', pronunciation: null, glyph_order: '["grapheme-10","grapheme-11"]', ancestors: [], meanings: [] },
    { id: 2, lemma: 'affliction', pronunciation: null, glyph_order: '["grapheme-20","ə"]', ancestors: [], meanings: [] },
    { id: 3, lemma: 'silence', pronunciation: null, glyph_order: '[]', ancestors: [], meanings: [] },
];

const etymologValue = {
    api: {
        lexicon: {
            previewAutoSpelling: vi.fn(() => ({ success: true, data: { success: true, spelling: [], segments: [], unmatchedParts: [], hasVirtualGlyphs: false } })),
            wouldCreateCycle: () => ({ success: true, data: false }),
            getAllDescendantIds: () => ({ success: true, data: [] }),
            getAncestryTree: () => ({ success: true, data: null }),
        },
    },
    data: {
        lexiconComplete: LEXICON_COMPLETE,
        graphemesComplete: [grapheme(10, 'ni'), grapheme(11, 'ght'), grapheme(20, 'aff'), grapheme(99, 'x')],
    },
    settings: {},
    refresh: vi.fn(),
    isReady: true,
    error: null,
};

vi.mock('../../../../db', () => ({ useEtymolog: () => etymologValue }));
vi.mock('../../../../db/autoSpellService', () => ({ buildVirtualGlyphMap: () => new Map() }));
vi.mock('../../customInput/meaningTableInput', () => ({ MeaningTableInput: () => <div data-testid="meanings" /> }));
vi.mock('../../customInput/ancestryInput', () => ({ AncestryInput: () => <div data-testid="ancestry" /> }));

const { LexiconFormFields } = await import('../LexiconFormFields');
const { SmartForm, useSmartForm } = await import('smart-form/smartForm');
const { default: ConfirmDialogProvider } = await import('../../../shared/confirmDialog/ConfirmDialogProvider');

/** The most recent glyph_order the fields reported. */
let latestGlyphOrder: SpellingEntry[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeWord(glyphOrder: string, ancestorIds: number[]): any {
    return {
        id: 100,
        lemma: 'compound',
        pronunciation: null,
        is_native: true,
        auto_spell: false,
        meaning: null,
        part_of_speech: null,
        notes: null,
        glyph_order: glyphOrder,
        needs_attention: false,
        created_at: '', updated_at: '',
        meanings: [],
        spelling: [],
        ancestors: ancestorIds.map((id) => ({
            ancestor: LEXICON_COMPLETE.find((l) => l.id === id),
            ancestry_type: 'compound',
        })),
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Host({ initialData }: { initialData: any }) {
    const { registerField, registerForm } = useSmartForm({ mode: 'onChange' });
    const formProps = registerForm('buildForm', {
        submitFunc: async () => ({ success: true }),
        lockFormOnSubmit: false,
    });
    useEffect(() => { /* keep formProps referenced */ void formProps.formState; });
    return (
        <ConfirmDialogProvider>
            <SmartForm {...formProps} registerField={registerField}>
                <LexiconFormFields
                    registerField={registerField}
                    mode="edit"
                    initialData={initialData}
                    onGlyphOrderChange={(g) => { latestGlyphOrder = g; }}
                />
            </SmartForm>
        </ConfirmDialogProvider>
    );
}

let container: HTMLDivElement;
let root: Root;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mount(initialData: any) {
    act(() => { root.render(<Host initialData={initialData} />); });
}

async function settle(times = 5) {
    for (let i = 0; i < times; i++) {
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    }
}

// Search the whole document: the confirmation dialog's Modal portals its
// buttons to document.body, outside the mount container.
function buttonContaining(label: string): HTMLButtonElement | undefined {
    return Array.from(document.body.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(label));
}
function click(el: HTMLElement) {
    act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

beforeEach(() => {
    latestGlyphOrder = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    try { act(() => root.unmount()); } catch { /* already unmounted */ }
    container.parentNode?.removeChild(container);
    vi.clearAllMocks();
});

describe('LexiconFormFields — build spelling from ancestors', () => {
    it('concatenates 2 ancestors (incl. an IPA fallback) in order onto an empty canvas', async () => {
        mount(makeWord('[]', [1, 2]));
        await settle();

        const build = buttonContaining('Build spelling from ancestors');
        expect(build).toBeTruthy();
        expect(build!.disabled).toBe(false);

        click(build!);
        await settle();

        // No confirmation asked (the canvas was empty), spelling built directly.
        expect(latestGlyphOrder).toEqual(['grapheme-10', 'grapheme-11', 'grapheme-20', 'ə']);
    });

    it('follows ancestry order — reordering the ancestors reorders the build', async () => {
        mount(makeWord('[]', [2, 1]));
        await settle();

        click(buttonContaining('Build spelling from ancestors')!);
        await settle();

        expect(latestGlyphOrder).toEqual(['grapheme-20', 'ə', 'grapheme-10', 'grapheme-11']);
    });

    it('confirms before overwriting a non-empty canvas, and applies on confirm', async () => {
        mount(makeWord('["grapheme-99"]', [1, 2]));
        await settle();
        // The canvas opened holding the existing spelling.
        expect(latestGlyphOrder).toEqual(['grapheme-99']);

        click(buttonContaining('Build spelling from ancestors')!);
        await settle();

        // The confirmation dialog is up; the canvas is untouched until confirmed.
        const replace = buttonContaining('Replace spelling');
        expect(replace).toBeTruthy();
        expect(latestGlyphOrder).toEqual(['grapheme-99']);

        click(replace!);
        await settle();

        expect(latestGlyphOrder).toEqual(['grapheme-10', 'grapheme-11', 'grapheme-20', 'ə']);
    });

    it('leaves a non-empty canvas alone when the overwrite is cancelled', async () => {
        mount(makeWord('["grapheme-99"]', [1, 2]));
        await settle();
        expect(latestGlyphOrder).toEqual(['grapheme-99']);

        click(buttonContaining('Build spelling from ancestors')!);
        await settle();

        const cancel = buttonContaining('Keep current');
        expect(cancel).toBeTruthy();
        click(cancel!);
        await settle();

        expect(latestGlyphOrder).toEqual(['grapheme-99']);
    });

    it('disables the button with a hint when every ancestor spelling is empty', async () => {
        mount(makeWord('[]', [3]));
        await settle();

        const build = buttonContaining('Build spelling from ancestors');
        expect(build).toBeTruthy();
        expect(build!.disabled).toBe(true);
        expect(container.textContent).toContain('nothing to build from');
    });

    it('shows no build button when the word has no ancestors', async () => {
        mount(makeWord('[]', []));
        await settle();
        expect(buttonContaining('Build spelling from ancestors')).toBeUndefined();
    });
});
