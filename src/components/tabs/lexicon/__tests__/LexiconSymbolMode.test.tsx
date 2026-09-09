// @vitest-environment happy-dom
/**
 * LexiconEditor — the Compose / Word-symbol spelling mode (Phase 3, UC-B1).
 *
 * The Spelling section gains a segmented choice: compose from graphemes, or
 * draw/import ONE symbol that IS the word. What this pins:
 *
 *  - create + Symbol mode submits a `symbol` composite create (svg + auto_spell
 *    forced OFF), NOT a glyph_order;
 *  - choosing Symbol mode disables the auto-spell checkbox;
 *  - edit mode INFERS Symbol mode from a stored word whose glyph_order is one
 *    logogram grapheme, and opening it does not dirty the form;
 *  - editing that word's drawing calls `api.wordSymbol.updateDrawing`.
 *
 * The real `LexiconFormFields` is mounted; only the leaf `SvgDrawerInput` (which
 * needs a real canvas) is stubbed to a button that reports a drawing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;

vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
})));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

// Stub the SVG drawing canvas: it needs a real canvas the test DOM lacks. The
// stub renders a button that reports a drawing through `onSvgChange`, which is
// exactly the channel the real drawer uses.
const DRAWN_SVG = '<svg viewBox="0 0 100 100"><path d="M5 5L95 95" stroke="currentColor"/></svg>';
vi.mock('smart-form/input/basic/svgDrawerInput/svgDrawerInput.tsx', () => ({
    default: ({ onSvgChange }: { onSvgChange?: (svg: string | null) => void }) => (
        <button type="button" data-testid="stub-draw" onClick={() => onSvgChange?.(DRAWN_SVG)}>
            stub draw
        </button>
    ),
}));

const create = vi.fn(() => ({ success: true, data: { id: 42, lemma: 'night', pronunciation: null } }));
const update = vi.fn(() => ({ success: true, data: { id: 7 } }));
const updateDrawing = vi.fn(() => ({ success: true, data: { glyphId: 1, graphemeId: 5 } }));
const wordSymbolCreate = vi.fn(() => ({ success: true, data: { glyphId: 2, graphemeId: 9 } }));

const argsOf = (mock: { mock: { calls: unknown[][] } }, call = 0): unknown[] =>
    mock.mock.calls[call] as unknown[];

const SYMBOL_GRAPHEME = {
    id: 5,
    name: 'night',
    category: 'logogram',
    notes: null,
    created_at: '', updated_at: '',
    glyphs: [{ id: 1, name: 'night', svg_data: '<svg>orig</svg>', category: 'logogram', notes: null, created_at: '', updated_at: '' }],
    phonemes: [],
};

// A STABLE context value (built once). The real provider memoizes `api`/`data`;
// returning fresh objects per render would make the editor's api-keyed
// descendant-fetch effect setState-loop (it only fires in edit mode, where
// initialData.id exists), which is a test artifact, not a code bug.
const etymologValue = {
    api: {
        lexicon: {
            create,
            update,
            updateAncestry: vi.fn(() => ({ success: true, data: null })),
            previewAutoSpelling: vi.fn(() => ({ success: true, data: { success: true, spelling: [], segments: [], unmatchedParts: [], hasVirtualGlyphs: false } })),
            wouldCreateCycle: () => ({ success: true, data: false }),
            getAllDescendantIds: () => ({ success: true, data: [] }),
            getAncestryTree: () => ({ success: true, data: null }),
        },
        wordSymbol: { create: wordSymbolCreate, updateDrawing },
    },
    data: { lexiconComplete: [], graphemesComplete: [SYMBOL_GRAPHEME] },
    settings: { defaultGalleryView: 'detailed' },
    refresh: vi.fn(),
    batchMutations: <T,>(fn: () => T): T => fn(),
    isReady: true,
    error: null,
};
vi.mock('../../../../db', () => ({
    useEtymolog: () => etymologValue,
}));

const { default: LexiconEditor } = await import('../editor/LexiconEditor');
const { NotificationProvider } = await import('../../../shared/notifications/NotificationProvider');
const { default: ConfirmDialogProvider } = await import('../../../shared/confirmDialog/ConfirmDialogProvider');
const { UnsavedChangesRegistry } = await import('../../../shell/unsavedChanges');

const SYMBOL_WORD = {
    id: 7,
    lemma: 'night',
    pronunciation: null,
    is_native: true,
    auto_spell: false,
    meaning: 'night',
    part_of_speech: null,
    notes: null,
    glyph_order: '["grapheme-5"]',
    needs_attention: false,
    created_at: '', updated_at: '',
    meanings: [{ id: 1, lexicon_id: 7, meaning: 'night', part_of_speech: null, usage_notes: null, definition_order: 0 }],
    spelling: [{ id: 5, name: 'night', category: 'logogram', notes: null, created_at: '', updated_at: '' }],
    ancestors: [],
};

let container: HTMLDivElement;
let root: Root;

function mount(mode: 'create' | 'edit') {
    act(() => {
        root.render(
            <StrictMode>
                <MemoryRouter initialEntries={[mode === 'create' ? '/lexicon/create' : '/lexicon/edit']}>
                    <NotificationProvider>
                        <ConfirmDialogProvider>
                            <UnsavedChangesRegistry>
                                <Routes>
                                    <Route path="/lexicon/create" element={<LexiconEditor mode="create" />} />
                                    <Route
                                        path="/lexicon/edit"
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        element={<LexiconEditor mode="edit" initialData={SYMBOL_WORD as any} />}
                                    />
                                    <Route path="/lexicon/db/:id" element={<p>view page</p>} />
                                    <Route path="/lexicon" element={<p>list</p>} />
                                </Routes>
                            </UnsavedChangesRegistry>
                        </ConfirmDialogProvider>
                    </NotificationProvider>
                </MemoryRouter>
            </StrictMode>,
        );
    });
}

async function settle(times = 4) {
    for (let i = 0; i < times; i++) {
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    }
}

function button(label: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);
}
function testid(id: string): HTMLElement | null {
    return container.querySelector(`[data-testid="${id}"]`);
}
function textInputs(): HTMLInputElement[] {
    return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])'));
}
function typeInto(input: HTMLInputElement, value: string) {
    act(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
}
function click(el: HTMLElement) {
    act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
async function submit() {
    await act(async () => {
        container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await Promise.resolve();
    });
    await settle();
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    try { act(() => root.unmount()); } catch { /* already unmounted */ }
    container.parentNode?.removeChild(container);
    vi.clearAllMocks();
});

describe('LexiconEditor — word-symbol spelling mode', () => {
    it('create: defaults to Compose; the drawer is not shown', async () => {
        mount('create');
        await settle();
        expect(button('Compose from graphemes')?.getAttribute('aria-pressed')).toBe('true');
        expect(button('Word symbol')?.getAttribute('aria-pressed')).toBe('false');
        expect(testid('stub-draw')).toBeNull();
    });

    it('create: choosing Word symbol reveals the drawer and disables auto-spell', async () => {
        mount('create');
        await settle();
        click(button('Word symbol')!);
        await settle();

        expect(button('Word symbol')?.getAttribute('aria-pressed')).toBe('true');
        expect(testid('stub-draw')).not.toBeNull();

        const autoSpell = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
            .find((c) => c.closest('label')?.textContent?.includes('Auto-spell'));
        expect(autoSpell?.disabled).toBe(true);
    });

    it('create: submits a symbol composite create with auto_spell off and no glyph_order', async () => {
        mount('create');
        await settle();
        // Give the word a name source (meaning) and a symbol drawing.
        typeInto(textInputs()[1], 'night');
        await settle();
        click(button('Word symbol')!);
        await settle();
        click(testid('stub-draw')!);
        await settle();
        await submit();

        expect(create).toHaveBeenCalledTimes(1);
        const input = argsOf(create)[0] as {
            symbol?: { svgData: string };
            glyph_order?: string[];
            auto_spell?: boolean;
        };
        expect(input.symbol?.svgData).toBe(DRAWN_SVG);
        expect(input.auto_spell).toBe(false);
        expect(input.glyph_order).toBeUndefined();
    });

    it('edit: infers Symbol mode from a one-logogram spelling', async () => {
        mount('edit');
        await settle();
        expect(button('Word symbol')?.getAttribute('aria-pressed')).toBe('true');
        expect(button('Compose from graphemes')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('edit: a changed drawing updates the word and re-draws the symbol', async () => {
        mount('edit');
        await settle();
        // Re-draw the symbol, then save.
        click(testid('stub-draw')!);
        await settle();
        await submit();

        expect(update).toHaveBeenCalledTimes(1);
        const [, updateInput] = argsOf(update) as [number, { glyph_order?: string[]; auto_spell?: boolean }];
        expect(updateInput.glyph_order).toEqual(['grapheme-5']);
        expect(updateInput.auto_spell).toBe(false);

        expect(updateDrawing).toHaveBeenCalledTimes(1);
        const draw = argsOf(updateDrawing)[0] as { graphemeId: number; svgData: string };
        expect(draw.graphemeId).toBe(5);
        expect(draw.svgData).toBe(DRAWN_SVG);
        // A word already spelled by an existing symbol never mints a new one.
        expect(wordSymbolCreate).not.toHaveBeenCalled();
    });
});
