// @vitest-environment happy-dom
/**
 * LexiconFormFields — auto-spell owns the spelling while it is on.
 *
 * The wand in the Spelling header IS the word's `auto_spell` boolean (a toggle,
 * not a one-shot "generate" button). While it is on:
 *  - the canvas shows the spelling generated from the pronunciation, live,
 *    greyed and read-only, with a visible notice saying so;
 *  - the keyboard and "Build from ancestors" are disabled;
 *  - a generated spelling is not a user edit (a prefilled create form stays
 *    clean), and a STALE stored spelling is replaced by the current one.
 * Turning it off keeps the generated spelling as the starting point for hand
 * edits; turning it back on over a different hand spelling is confirmed first.
 *
 * The REAL GlyphCanvasInput is mounted; the speller (`previewAutoSpelling`) is a
 * tiny fake with two graphemes, "ni" (10) and "ght" (11).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { useEffect } from 'react';

import type { SpellingEntry } from '../../../../db/utils/spellingUtils';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;

vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
})));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const grapheme = (id: number, name: string) => ({
    id, name, category: 'consonant', notes: null, created_at: '', updated_at: '',
    glyphs: [{ id, name, svg_data: '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>', category: null, notes: null, created_at: '', updated_at: '' }],
    phonemes: [{ id, grapheme_id: id, phoneme: name, use_in_auto_spelling: true, context: null }],
});

const PHONEMES: Record<string, number> = { ni: 10, ght: 11 };

/** A greedy fake speller: known phonemes → graphemes, anything else → IPA fallback. */
const previewAutoSpelling = vi.fn((pronunciation: string) => {
    const spelling: Array<{ grapheme_id: number; position: number; isVirtual: boolean; ipaCharacter?: string }> = [];
    let i = 0;
    while (i < pronunciation.length) {
        const hit = Object.keys(PHONEMES).find((p) => pronunciation.startsWith(p, i));
        if (hit) {
            spelling.push({ grapheme_id: PHONEMES[hit], position: spelling.length, isVirtual: false });
            i += hit.length;
        } else {
            spelling.push({ grapheme_id: -(i + 1), position: spelling.length, isVirtual: true, ipaCharacter: pronunciation[i] });
            i += 1;
        }
    }
    return { success: true, data: { success: true, spelling, segments: [], unmatchedParts: [], hasVirtualGlyphs: false } };
});

const etymologValue = {
    api: {
        lexicon: {
            previewAutoSpelling,
            wouldCreateCycle: () => ({ success: true, data: false }),
            getAllDescendantIds: () => ({ success: true, data: [] }),
            getAncestryTree: () => ({ success: true, data: null }),
        },
    },
    data: {
        lexiconComplete: [],
        graphemesComplete: [grapheme(10, 'ni'), grapheme(11, 'ght'), grapheme(99, 'x')],
        glyphsWithUsage: [],
    },
    settings: {},
    refresh: vi.fn(),
    isReady: true,
    error: null,
};

vi.mock('../../../../db', () => ({ useEtymolog: () => etymologValue }));
vi.mock('../../customInput/meaningTableInput', () => ({ MeaningTableInput: () => <div data-testid="meanings" /> }));
vi.mock('../../customInput/ancestryInput', () => ({ AncestryInput: () => <div data-testid="ancestry" /> }));

const { LexiconFormFields } = await import('../LexiconFormFields');
const { SmartForm, useSmartForm } = await import('smart-form/smartForm');
const { default: ConfirmDialogProvider } = await import('../../../shared/confirmDialog/ConfirmDialogProvider');

let latestGlyphOrder: SpellingEntry[] = [];
let latestAutoSpell: boolean | null = null;
let formChanged = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function word(overrides: Record<string, unknown>): any {
    return {
        id: 100, lemma: 'ni', pronunciation: 'ni', is_native: true, auto_spell: true,
        meaning: null, part_of_speech: null, notes: null, glyph_order: '["grapheme-10"]',
        needs_attention: false, created_at: '', updated_at: '',
        meanings: [], spelling: [], ancestors: [],
        ...overrides,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Host({ initialData, mode, prefill }: { initialData?: any; mode: 'create' | 'edit'; prefill?: string }) {
    const { registerField, registerForm } = useSmartForm({ mode: 'onChange' });
    const formProps = registerForm('lockForm', {
        submitFunc: async () => ({ success: true }),
        lockFormOnSubmit: false,
    });
    // Mirrored in an effect, not during render (a render must stay pure).
    const isChanged = formProps.formState.isChanged;
    useEffect(() => {
        formChanged = isChanged;
    }, [isChanged]);
    return (
        <ConfirmDialogProvider>
            <SmartForm {...formProps} registerField={registerField}>
                <LexiconFormFields
                    registerField={registerField}
                    mode={mode}
                    initialData={initialData}
                    initialPronunciation={prefill}
                    onGlyphOrderChange={(g) => { latestGlyphOrder = g; }}
                    onAutoSpellChange={(a) => { latestAutoSpell = a; }}
                />
            </SmartForm>
        </ConfirmDialogProvider>
    );
}

let container: HTMLDivElement;
let root: Root;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mount(mode: 'create' | 'edit', initialData?: any, prefill?: string) {
    act(() => { root.render(<Host mode={mode} initialData={initialData} prefill={prefill} />); });
}

async function settle(times = 6) {
    for (let i = 0; i < times; i++) {
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    }
}

const wand = () => container.querySelector<HTMLButtonElement>('button[aria-label="Auto-spell"]')!;
const keyboardButton = () => container.querySelector<HTMLButtonElement>('button[aria-label="Open glyph keyboard"]')!;
const lockNotice = () => Array.from(container.querySelectorAll('[role="status"]'))
    .find((el) => el.textContent?.includes('Auto-spell is on')) ?? null;

function typePronunciation(value: string) {
    const input = Array.from(container.querySelectorAll<HTMLInputElement>('input'))
        .find((el) => el.closest('label, div')?.textContent?.includes('Pronunciation')
            && el.type !== 'checkbox' && el.type !== 'hidden')!;
    act(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

function confirmButton(label: string): HTMLButtonElement | undefined {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === label);
}

beforeEach(() => {
    latestGlyphOrder = [];
    latestAutoSpell = null;
    formChanged = false;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    try { act(() => root.unmount()); } catch { /* already unmounted */ }
    container.parentNode?.removeChild(container);
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

describe('auto-spell lock', () => {
    it('owns the spelling: notice on screen, wand pressed, keyboard disabled', async () => {
        mount('edit', word({}));
        await settle();

        expect(wand().getAttribute('aria-pressed')).toBe('true');
        expect(wand().textContent).toContain('Auto-spell on');
        expect(lockNotice()).not.toBeNull();
        expect(keyboardButton().disabled).toBe(true);
        expect(container.querySelector('[aria-disabled="true"]')).not.toBeNull();
        expect(latestAutoSpell).toBe(true);
    });

    it('a generated spelling is not a user edit: a prefilled create form stays clean', async () => {
        // The generator's "Edit & add" arrives with a pronunciation; auto-spell
        // spells it onto the canvas, and that must NOT arm the leave-page guard.
        mount('create', undefined, 'nini');
        await settle();

        expect(latestGlyphOrder).toEqual(['grapheme-10', 'grapheme-10']);
        expect(formChanged).toBe(false);
    });

    it('replaces a STALE stored spelling with the current one', async () => {
        mount('edit', word({ pronunciation: 'nighta', glyph_order: '["grapheme-99"]' }));
        await settle();

        expect(latestGlyphOrder).toEqual(['grapheme-10', 'grapheme-11', 'a']);
    });

    it('follows the pronunciation live as it is typed', async () => {
        mount('create');
        await settle();
        typePronunciation('ght');
        await settle();

        expect(previewAutoSpelling).toHaveBeenCalledWith('ght');
        expect(latestGlyphOrder).toEqual(['grapheme-11']);

        typePronunciation('nini');
        await settle();
        expect(latestGlyphOrder).toEqual(['grapheme-10', 'grapheme-10']);
    });

    it('with no pronunciation yet, says so and still locks the canvas', async () => {
        mount('create');
        await settle();

        expect(lockNotice()?.textContent).toContain('enter a pronunciation above');
        expect(keyboardButton().disabled).toBe(true);
    });

    it('turning it off hands the spelling to the user, keeping what was generated', async () => {
        mount('edit', word({}));
        await settle();

        act(() => wand().click());
        await settle();

        expect(wand().getAttribute('aria-pressed')).toBe('false');
        expect(lockNotice()).toBeNull();
        expect(keyboardButton().disabled).toBe(false);
        expect(latestGlyphOrder).toEqual(['grapheme-10']);
        expect(latestAutoSpell).toBe(false);
    });

    it('turning it back on over a different hand spelling asks first — cancel keeps it off', async () => {
        mount('edit', word({ auto_spell: false, glyph_order: '["grapheme-99"]' }));
        await settle();
        expect(wand().getAttribute('aria-pressed')).toBe('false');

        await act(async () => { wand().click(); });
        await settle();
        const keep = confirmButton('Keep my spelling');
        expect(keep).toBeDefined();
        await act(async () => { keep!.click(); });
        await settle();

        expect(wand().getAttribute('aria-pressed')).toBe('false');
        expect(latestGlyphOrder).toEqual(['grapheme-99']);
    });

    it('turning it back on and confirming replaces the hand spelling', async () => {
        mount('edit', word({ auto_spell: false, glyph_order: '["grapheme-99"]' }));
        await settle();

        await act(async () => { wand().click(); });
        await settle();
        await act(async () => { confirmButton('Use auto-spell')!.click(); });
        await settle();

        expect(wand().getAttribute('aria-pressed')).toBe('true');
        expect(latestGlyphOrder).toEqual(['grapheme-10']);
    });

    it('an external word cannot be auto-spelled: the wand is disabled and reports off', async () => {
        mount('edit', word({ is_native: false }));
        await settle();

        expect(wand().disabled).toBe(true);
        expect(lockNotice()).toBeNull();
        expect(latestAutoSpell).toBe(false);
    });
});
