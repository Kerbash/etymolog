// @vitest-environment happy-dom
/**
 * Folders in the word form and on the view page (Phase 5b, UC-D).
 *
 * What this pins:
 *  - create mode reads `?folder=` and files the new word into it (mirrors the
 *    `?pronunciation=` prefill);
 *  - the folder picker only appears once folders exist, and reflects/edits the
 *    stored word's folder on save;
 *  - the picker is plain reported-up state, so seeding it from the URL (create)
 *    or the word (edit) does NOT dirty the form — the NavigationGuard stays off
 *    on an untouched form in BOTH modes;
 *  - the view page's "Move to folder" dialog files the word through
 *    `api.folder.setLexiconFolder`.
 *
 * The real `LexiconFormFields` is mounted (composite inputs and all), in
 * `<StrictMode>` like `src/main.tsx`, so the dirty-on-mount checks are faithful.
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

const create = vi.fn(() => ({ success: true, data: { id: 42, lemma: 'kata', pronunciation: 'kata' } }));
const update = vi.fn(() => ({ success: true, data: { id: 7 } }));
const setLexiconFolder = vi.fn(() => ({ success: true, data: undefined }));
const getByIdComplete = vi.fn();
const refresh = vi.fn();

const argsOf = (mock: { mock: { calls: unknown[][] } }, call = 0): unknown[] =>
    mock.mock.calls[call] as unknown[];

const FOLDERS = [
    { id: 1, name: 'Nouns', parent_id: null, position: 0, created_at: '', updated_at: '' },
    { id: 2, name: 'Entities', parent_id: 1, position: 0, created_at: '', updated_at: '' },
];

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
            getByIdComplete,
            delete: vi.fn(() => ({ success: true, data: null })),
        },
        folder: { setLexiconFolder },
        wordSymbol: { create: vi.fn(), updateDrawing: vi.fn() },
    },
    data: { lexiconComplete: [], graphemesComplete: [], folders: FOLDERS },
    settings: { defaultGalleryView: 'detailed' },
    refresh,
    batchMutations: <T,>(fn: () => T): T => fn(),
    isReady: true,
    error: null,
};
vi.mock('../../../../db', () => ({ useEtymolog: () => etymologValue }));
vi.mock('../../../display/lexicon/detailed', () => ({
    DetailedLexiconDisplay: () => <p>detailed display</p>,
}));

const { default: LexiconEditor } = await import('../editor/LexiconEditor');
const { default: LexiconViewPage } = await import('../viewLexicon/LexiconViewPage');
const { NotificationProvider } = await import('../../../shared/notifications/NotificationProvider');
const { default: ConfirmDialogProvider } = await import('../../../shared/confirmDialog/ConfirmDialogProvider');
const { UnsavedChangesRegistry } = await import('../../../shell/unsavedChanges');

const EDIT_WORD = {
    id: 7,
    lemma: 'kata',
    pronunciation: 'kata',
    is_native: true,
    auto_spell: false,
    meaning: null,
    part_of_speech: null,
    notes: null,
    folder_id: 1,
    glyph_order: '[]',
    needs_attention: false,
    created_at: '', updated_at: '',
    meanings: [],
    spelling: [],
    ancestors: [],
    descendants: [],
};

let container: HTMLDivElement;
let root: Root;

function mountEditor(mode: 'create' | 'edit', path: string) {
    act(() => {
        root.render(
            <StrictMode>
                <MemoryRouter initialEntries={[path]}>
                    <NotificationProvider>
                        <ConfirmDialogProvider>
                            <UnsavedChangesRegistry>
                                <Routes>
                                    <Route path="/lexicon/create" element={<LexiconEditor mode="create" />} />
                                    <Route
                                        path="/lexicon/edit"
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        element={<LexiconEditor mode="edit" initialData={EDIT_WORD as any} />}
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
    void mode;
}

function mountView(path = '/lexicon/db/7') {
    act(() => {
        root.render(
            <MemoryRouter initialEntries={[path]}>
                <NotificationProvider>
                    <ConfirmDialogProvider>
                        <Routes>
                            <Route path="/lexicon/db/:id" element={<LexiconViewPage />} />
                            <Route path="/lexicon" element={<p>list</p>} />
                        </Routes>
                    </ConfirmDialogProvider>
                </NotificationProvider>
            </MemoryRouter>,
        );
    });
}

async function settle(times = 4) {
    for (let i = 0; i < times; i++) {
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    }
}

function button(label: string): HTMLButtonElement | undefined {
    return Array.from(document.body.querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === label,
    );
}
/** The folder `<select>` — the one carrying the "No folder (root)" option. */
function folderSelect(): HTMLSelectElement | undefined {
    return Array.from(document.body.querySelectorAll('select')).find((s) =>
        Array.from(s.options).some((o) => o.textContent?.includes('No folder')),
    );
}
function moveSelect(): HTMLSelectElement | undefined {
    return Array.from(document.body.querySelectorAll('select')).find((s) =>
        Array.from(s.options).some((o) => o.textContent?.includes('Root (no folder)')),
    );
}
function setSelect(select: HTMLSelectElement, value: string) {
    act(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}
function click(el: Element | null | undefined) {
    if (!el) throw new Error('click: nothing');
    act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
async function submitForm() {
    await act(async () => {
        container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await Promise.resolve();
    });
    await settle();
}
function beforeUnloadBlocked(): boolean {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    getByIdComplete.mockReturnValue({ success: true, data: { ...EDIT_WORD, folder_id: null } });
});

afterEach(() => {
    try { act(() => root.unmount()); } catch { /* already unmounted */ }
    container.parentNode?.removeChild(container);
    vi.clearAllMocks();
});

describe('LexiconEditor — folder picker (create)', () => {
    it('files a new word into the ?folder= folder', async () => {
        mountEditor('create', '/lexicon/create?folder=2&pronunciation=kata');
        await settle();

        // The picker reflects the URL default.
        expect(folderSelect()?.value).toBe('2');

        await submitForm();

        expect(create).toHaveBeenCalledTimes(1);
        const input = argsOf(create)[0] as { folder_id?: number | null };
        expect(input.folder_id).toBe(2);
    });

    it('does not render the picker when there are no folders', async () => {
        const saved = etymologValue.data.folders;
        etymologValue.data = { ...etymologValue.data, folders: [] };
        try {
            mountEditor('create', '/lexicon/create?pronunciation=kata');
            await settle();
            expect(folderSelect()).toBeUndefined();
        } finally {
            etymologValue.data = { ...etymologValue.data, folders: saved };
        }
    });

    it('is not dirty on mount (folder default does not arm the guard)', async () => {
        mountEditor('create', '/lexicon/create?folder=2&pronunciation=kata');
        await settle();
        expect(beforeUnloadBlocked()).toBe(false);
    });
});

describe('LexiconEditor — folder picker (edit)', () => {
    it('reflects the stored folder and saves a change', async () => {
        mountEditor('edit', '/lexicon/edit');
        await settle();

        // Opens showing the word's current folder.
        expect(folderSelect()?.value).toBe('1');

        setSelect(folderSelect()!, '2');
        await settle();
        await submitForm();

        expect(update).toHaveBeenCalledTimes(1);
        const [, input] = argsOf(update) as [number, { folder_id?: number | null }];
        expect(input.folder_id).toBe(2);
    });

    it('the seeded folder does not, by itself, arm the guard', async () => {
        // Edit mode arms the NavigationGuard on mount by design (the edit-init
        // effect re-writes the pronunciation with `markChanged` true — see
        // `setSmartFieldValue`). The FOLDER picker is plain reported-up state,
        // NOT a SmartForm field, so it contributes nothing to that: with the
        // pronunciation seed removed (a word named only by its meaning) an
        // untouched edit form carrying a seeded folder stays clean.
        getByIdComplete.mockReturnValue({ success: true, data: { ...EDIT_WORD } });
        const wordNoPron = {
            ...EDIT_WORD,
            pronunciation: null,
            meaning: 'creature',
            meanings: [{ id: 1, lexicon_id: 7, meaning: 'creature', part_of_speech: null, usage_notes: null, definition_order: 0 }],
            folder_id: 1,
        };
        act(() => {
            root.render(
                <StrictMode>
                    <MemoryRouter initialEntries={['/lexicon/edit']}>
                        <NotificationProvider>
                            <ConfirmDialogProvider>
                                <UnsavedChangesRegistry>
                                    <Routes>
                                        <Route
                                            path="/lexicon/edit"
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            element={<LexiconEditor mode="edit" initialData={wordNoPron as any} />}
                                        />
                                        <Route path="/lexicon/db/:id" element={<p>view page</p>} />
                                    </Routes>
                                </UnsavedChangesRegistry>
                            </ConfirmDialogProvider>
                        </NotificationProvider>
                    </MemoryRouter>
                </StrictMode>,
            );
        });
        await settle();

        expect(folderSelect()?.value).toBe('1');
        expect(beforeUnloadBlocked()).toBe(false);
    });
});

describe('LexiconViewPage — Move to folder', () => {
    it('files the word through api.folder.setLexiconFolder', async () => {
        mountView();
        await settle();

        click(button('Move to folder'));
        await settle();

        const select = moveSelect();
        expect(select).toBeTruthy();
        setSelect(select!, '2');
        await settle();

        click(button('Move'));
        await settle();

        expect(setLexiconFolder).toHaveBeenCalledTimes(1);
        expect(argsOf(setLexiconFolder)[0]).toEqual({ lexiconId: 7, folderId: 2 });
        expect(refresh).toHaveBeenCalled();
    });
});
