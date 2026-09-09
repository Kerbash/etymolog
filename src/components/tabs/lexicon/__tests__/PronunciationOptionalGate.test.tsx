// @vitest-environment happy-dom
/**
 * LexiconEditor — the name-source submit gate (Phase 1, UC-A).
 *
 * Pronunciation is no longer a required field, so the old "pronunciation makes
 * the form submittable" rule is gone. What replaces it: a word must have SOME
 * name source — a pronunciation OR at least one meaning — and the editor's
 * submit button is gated on exactly that (`onHasNameSourceChange`). SmartForm's
 * own `isSubmittable` cannot express this because the spelling/ancestry array
 * fields keep the form perpetually non-empty.
 *
 * The REAL `LexiconFormFields` is mounted (composite inputs and all), inside
 * `<StrictMode>` like `main.tsx`, because the gate depends on the real fields
 * reporting their live emptiness.
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

const create = vi.fn(() => ({
    success: true,
    data: { id: 42, lemma: 'cat', pronunciation: null },
}));

const argsOf = (mock: { mock: { calls: unknown[][] } }, call = 0): unknown[] =>
    mock.mock.calls[call] as unknown[];

vi.mock('../../../../db', () => ({
    useEtymolog: () => ({
        api: {
            lexicon: {
                create,
                update: vi.fn(() => ({ success: true, data: { id: 7 } })),
                updateAncestry: vi.fn(() => ({ success: true, data: null })),
                previewAutoSpelling: vi.fn(() => ({ success: true, data: { success: true, spelling: [], segments: [], unmatchedParts: [], hasVirtualGlyphs: false } })),
                wouldCreateCycle: () => ({ success: true, data: false }),
                getAllDescendantIds: () => ({ success: true, data: [] }),
                getAncestryTree: () => ({ success: true, data: null }),
            },
        },
        data: { lexiconComplete: [], graphemesComplete: [] },
        settings: { defaultGalleryView: 'detailed' },
        refresh: vi.fn(),
        batchMutations: <T,>(fn: () => T): T => fn(),
        isReady: true,
        error: null,
    }),
}));

const { default: LexiconEditor } = await import('../editor/LexiconEditor');
const { NotificationProvider } = await import('../../../shared/notifications/NotificationProvider');
const { default: ConfirmDialogProvider } = await import('../../../shared/confirmDialog/ConfirmDialogProvider');
const { UnsavedChangesRegistry } = await import('../../../shell/unsavedChanges');

let container: HTMLDivElement;
let root: Root;

function mount(initialPath = '/lexicon/create') {
    act(() => {
        root.render(
            <StrictMode>
                <MemoryRouter initialEntries={[initialPath]}>
                    <NotificationProvider>
                        <ConfirmDialogProvider>
                            <UnsavedChangesRegistry>
                                <Routes>
                                    <Route path="/lexicon/create" element={<LexiconEditor mode="create" />} />
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

function submitButton(): HTMLButtonElement {
    return Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === 'Create word',
    ) as HTMLButtonElement;
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
async function submit() {
    await act(async () => {
        container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await Promise.resolve();
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
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

describe('LexiconEditor — name-source submit gate', () => {
    it('disables submit on an untouched create form', async () => {
        mount();
        await settle();
        expect(submitButton().disabled).toBe(true);
    });

    it('enables submit once a meaning alone is typed', async () => {
        mount();
        await settle();
        // Inputs in document order: [0] pronunciation, [1] meaning row 1.
        typeInto(textInputs()[1], 'cat');
        await settle();
        expect(submitButton().disabled).toBe(false);
    });

    it('enables submit once a pronunciation alone is typed', async () => {
        mount();
        await settle();
        typeInto(textInputs()[0], 'kato');
        await settle();
        expect(submitButton().disabled).toBe(false);
    });

    it('creates a meaning-only word with no pronunciation', async () => {
        mount();
        await settle();
        typeInto(textInputs()[1], 'cat');
        await settle();
        await submit();

        expect(create).toHaveBeenCalledTimes(1);
        const input = argsOf(create)[0] as { pronunciation?: string; meanings?: { meaning: string }[] };
        expect(input.pronunciation).toBeUndefined();
        expect(input.meanings).toEqual([{ meaning: 'cat', part_of_speech: undefined, usage_notes: undefined }]);
    });

    it('re-disables submit when the only name source is cleared', async () => {
        mount();
        await settle();
        const meaning = textInputs()[1];
        typeInto(meaning, 'cat');
        await settle();
        expect(submitButton().disabled).toBe(false);

        typeInto(meaning, '');
        await settle();
        expect(submitButton().disabled).toBe(true);
    });
});
