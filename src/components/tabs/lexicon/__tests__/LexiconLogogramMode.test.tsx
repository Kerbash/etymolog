// @vitest-environment happy-dom
/**
 * LexiconEditor — the Compose / Logogram spelling mode.
 *
 * A logogram is ONE symbol that writes the whole word: an existing grapheme,
 * an existing glyph, or a new drawing — a normal logogram grapheme underneath
 * in every case. What this pins:
 *
 *  - an existing GRAPHEME is referenced directly (glyph_order, no symbol);
 *  - an existing GLYPH goes through the composite create as `symbol.glyphId`;
 *  - a new DRAWING goes through it as `symbol.svgData`;
 *  - auto-spell is forced OFF for every logogram word;
 *  - nothing chosen = nothing submitted;
 *  - edit mode INFERS Logogram mode (with that grapheme chosen) from a stored
 *    one-logogram spelling, and saving it unchanged re-references it;
 *  - a new drawing on edit makes a NEW logogram and never re-draws the shared
 *    one in place (`updateDrawing` is never called).
 *
 * The real `LexiconFormFields` and `LogogramPanel` are mounted. Stubbed: the
 * leaf `SvgDrawerInput` (needs a real canvas) and the two picker modals (the
 * real ones mount the whole Script Maker gallery) — each stub exposes the same
 * callback the real one fires.
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

// The picker modals: when open, one button per choice, firing `onSelect` with
// the same object the real gallery hands back. The grapheme picker's props are
// recorded so the tab's "no marks" request (`hideMarks`) can be asserted; the
// filtering itself is covered in `graphemeForm/__tests__/graphemePickerModal`.
const graphemePicker = vi.hoisted(() => ({ hideMarks: undefined as boolean | undefined }));
vi.mock('../../../form/graphemeForm', () => ({
    GraphemePickerModal: ({ isOpen, onSelect, hideMarks }: { isOpen: boolean; onSelect: (g: unknown) => void; hideMarks?: boolean }) => {
        graphemePicker.hideMarks = hideMarks;
        return isOpen ? (
            <button type="button" data-testid="pick-grapheme" onClick={() => onSelect(SYMBOL_GRAPHEME)}>
                pick grapheme
            </button>
        ) : null;
    },
    GlyphPickerModal: ({ isOpen, onSelect }: { isOpen: boolean; onSelect: (g: unknown) => void }) =>
        isOpen ? (
            <button type="button" data-testid="pick-glyph" onClick={() => onSelect(LOOSE_GLYPH)}>
                pick glyph
            </button>
        ) : null,
}));

const create = vi.fn(() => ({ success: true, data: { id: 42, lemma: 'night', pronunciation: null } }));
const update = vi.fn(() => ({ success: true, data: { id: 7 } }));
const updateDrawing = vi.fn(() => ({ success: true, data: { glyphId: 1, graphemeId: 5 } }));
const wordSymbolCreate = vi.fn(() => ({ success: true, data: { glyphId: 2, graphemeId: 9 } }));

const argsOf = (mock: { mock: { calls: unknown[][] } }, call = 0): unknown[] =>
    mock.mock.calls[call] as unknown[];

/** A glyph no logogram wraps yet. */
const LOOSE_GLYPH = { id: 3, name: 'moon', svg_data: '<svg>moon</svg>', category: null, notes: null, created_at: '', updated_at: '', usageCount: 0 };

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
    data: {
        lexiconComplete: [] as Array<{ id: number; glyph_order: string }>,
        graphemesComplete: [SYMBOL_GRAPHEME],
        glyphsWithUsage: [{ ...SYMBOL_GRAPHEME.glyphs[0], usageCount: 1 }, LOOSE_GLYPH],
    },
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

async function chooseLogogramMode() {
    mount('create');
    await settle();
    // A name source, so the word can be created at all.
    typeInto(textInputs()[1], 'night');
    await settle();
    click(button('Logogram')!);
    await settle();
}

describe('LexiconEditor — logogram spelling mode', () => {
    it('create: defaults to Compose; the logogram panel is not shown', async () => {
        mount('create');
        await settle();
        expect(button('Compose from graphemes')?.getAttribute('aria-pressed')).toBe('true');
        expect(button('Logogram')?.getAttribute('aria-pressed')).toBe('false');
        expect(button('Use existing')).toBeUndefined();
        expect(testid('stub-draw')).toBeNull();
    });

    it('create: Logogram opens on "Use existing", says auto-spell is off, and hides the wand', async () => {
        await chooseLogogramMode();

        expect(button('Logogram')?.getAttribute('aria-pressed')).toBe('true');
        expect(button('Use existing')?.getAttribute('aria-pressed')).toBe('true');
        expect(container.textContent).toContain('Logogram spelling: this word is written as one logogram');
        // The auto-spell toggle lives on the compose canvas, which is gone.
        expect(container.querySelector('button[aria-label="Auto-spell"]')).toBeNull();
    });

    it('create: an existing grapheme is referenced directly — no symbol, auto-spell off', async () => {
        await chooseLogogramMode();
        click(button('Choose a grapheme…')!);
        await settle();
        click(testid('pick-grapheme')!);
        await settle();
        // The choice card names it.
        expect(container.textContent).toContain('Grapheme (logogram)');
        // The tab never offers a mark (vowel-killer, accent) as a word.
        expect(graphemePicker.hideMarks).toBe(true);
        await submit();

        expect(create).toHaveBeenCalledTimes(1);
        const input = argsOf(create)[0] as { symbol?: unknown; glyph_order?: string[]; auto_spell?: boolean };
        expect(input.glyph_order).toEqual(['grapheme-5']);
        expect(input.symbol).toBeUndefined();
        expect(input.auto_spell).toBe(false);
    });

    it('create: an existing glyph goes through the composite create as symbol.glyphId', async () => {
        await chooseLogogramMode();
        click(button('Choose a glyph…')!);
        await settle();
        click(testid('pick-glyph')!);
        await settle();
        // Not wrapped by any logogram yet, so the card says one will be made.
        expect(container.textContent).toContain('Saving wraps it in a new logogram grapheme');
        await submit();

        expect(create).toHaveBeenCalledTimes(1);
        const input = argsOf(create)[0] as { symbol?: { glyphId?: number; svgData?: string }; glyph_order?: string[]; auto_spell?: boolean };
        expect(input.symbol?.glyphId).toBe(3);
        expect(input.symbol?.svgData).toBeUndefined();
        expect(input.glyph_order).toBeUndefined();
        expect(input.auto_spell).toBe(false);
    });

    it('create: a new drawing goes through the composite create as symbol.svgData', async () => {
        await chooseLogogramMode();
        click(button('Draw new')!);
        await settle();
        click(testid('stub-draw')!);
        await settle();
        await submit();

        expect(create).toHaveBeenCalledTimes(1);
        const input = argsOf(create)[0] as { symbol?: { svgData?: string; name?: string }; glyph_order?: string[]; auto_spell?: boolean };
        expect(input.symbol?.svgData).toBe(DRAWN_SVG);
        expect(input.symbol?.name).toBe('night');
        expect(input.auto_spell).toBe(false);
        expect(input.glyph_order).toBeUndefined();
    });

    it('create: the drawing survives a trip to the other tab', async () => {
        await chooseLogogramMode();
        click(button('Draw new')!);
        await settle();
        click(testid('stub-draw')!);
        await settle();
        click(button('Use existing')!);
        await settle();
        click(button('Draw new')!);
        await settle();
        await submit();

        const input = argsOf(create)[0] as { symbol?: { svgData?: string } };
        expect(input.symbol?.svgData).toBe(DRAWN_SVG);
    });

    it('create: with nothing chosen, nothing is submitted', async () => {
        await chooseLogogramMode();
        await submit();
        expect(create).not.toHaveBeenCalled();
    });

    it('edit: infers Logogram mode with the stored grapheme chosen', async () => {
        mount('edit');
        await settle();
        expect(button('Logogram')?.getAttribute('aria-pressed')).toBe('true');
        expect(button('Compose from graphemes')?.getAttribute('aria-pressed')).toBe('false');
        expect(button('Use existing')?.getAttribute('aria-pressed')).toBe('true');
        expect(container.textContent).toContain('Edit in Script Maker');
    });

    it('edit: saving re-references the same logogram and creates nothing', async () => {
        mount('edit');
        await settle();
        await submit();

        expect(update).toHaveBeenCalledTimes(1);
        const [, updateInput] = argsOf(update) as [number, { glyph_order?: string[]; auto_spell?: boolean }];
        expect(updateInput.glyph_order).toEqual(['grapheme-5']);
        expect(updateInput.auto_spell).toBe(false);
        expect(wordSymbolCreate).not.toHaveBeenCalled();
        expect(updateDrawing).not.toHaveBeenCalled();
    });

    it('edit: a new drawing makes a NEW logogram — the shared one is never re-drawn', async () => {
        mount('edit');
        await settle();
        click(button('Draw new')!);
        await settle();
        click(testid('stub-draw')!);
        await settle();
        await submit();

        expect(wordSymbolCreate).toHaveBeenCalledTimes(1);
        expect(argsOf(wordSymbolCreate)[0]).toEqual({ name: 'night', svgData: DRAWN_SVG });
        const [, updateInput] = argsOf(update) as [number, { glyph_order?: string[] }];
        expect(updateInput.glyph_order).toEqual(['grapheme-9']);
        expect(updateDrawing).not.toHaveBeenCalled();
    });

    it('edit: the choice card warns when other words share the logogram', async () => {
        etymologValue.data.lexiconComplete = [
            { id: 7, glyph_order: '["grapheme-5"]' },
            { id: 8, glyph_order: '["grapheme-5"]' },
        ];
        try {
            mount('edit');
            await settle();
            // Word 7 is the one being edited; only word 8 is "another word".
            expect(container.textContent).toContain('Also used by 1 other word');
        } finally {
            etymologValue.data.lexiconComplete = [];
        }
    });
});
