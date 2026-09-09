// @vitest-environment happy-dom
/**
 * Nested folders in the lexicon gallery (UC-D — inline tree from Phase 3).
 *
 * The lexicon gallery renders through the shared `DirectoryGallery`: the folder
 * chrome is now an inline collapsible tree (expand a folder in place to see its
 * subfolders and a capped card grid of its items) rather than the old one-level
 * click-to-descend `FolderBrowser`. Focus (`?folder=`) moves via the breadcrumb
 * and the "Show all N →" row; small folders are browsed inline without leaving
 * the current focus.
 *
 * What this pins:
 *  - the root shows the unfiled words plus the top-level folder tree nodes;
 *  - expanding a folder reveals its subfolders and its items in place;
 *  - `?folder=` deep-links (validated: unknown id → root) and the breadcrumb
 *    walks back up;
 *  - words are filtered to the focused folder, and an empty folder says so;
 *  - a live SEARCH escapes the folder — it runs flat over every word;
 *  - the "All words" toggle restores the flat view;
 *  - "New folder" / rename call `api.folder` with the right args, and the delete
 *    confirmation says the contents MOVE UP, never that they are deleted;
 *  - the "New word" link carries the current folder so a word defaults into it.
 *
 * The lexicon display is stubbed to its lemma — the gallery's contract is which
 * words it shows and the folder chrome around them, not how a word card paints.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
);
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

interface Folder {
    id: number;
    name: string;
    parent_id: number | null;
    position: number;
    created_at: string;
    updated_at: string;
}

function folder(id: number, name: string, parentId: number | null = null): Folder {
    return { id, name, parent_id: parentId, position: 0, created_at: '', updated_at: '' };
}

function word(id: number, lemma: string, folderId: number | null = null) {
    return {
        id,
        lemma,
        pronunciation: lemma,
        is_native: true,
        auto_spell: false,
        meaning: null,
        folder_id: folderId,
        glyph_order: '[]',
        needs_attention: false,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        spelling: [],
        spellingDisplay: [],
        ancestors: [],
        descendants: [],
        meanings: [],
        hasIpaFallbacks: false,
    };
}

const state: { folders: Folder[]; lexicons: ReturnType<typeof word>[] } = {
    folders: [],
    lexicons: [],
};

const folderCreate = vi.fn(() => ({ success: true, data: folder(99, 'new') }));
const folderRename = vi.fn(() => ({ success: true, data: folder(1, 'renamed') }));
const folderDelete = vi.fn(() => ({ success: true, data: undefined }));
const lexiconDelete = vi.fn(() => ({ success: true, data: undefined }));
const refresh = vi.fn();

function useEtymologMock() {
    return {
        api: {
            lexicon: { delete: lexiconDelete },
            folder: { create: folderCreate, rename: folderRename, delete: folderDelete },
        },
        data: {
            folders: state.folders,
            lexiconComplete: state.lexicons,
            graphemesComplete: [],
        },
        settings: { defaultGalleryView: 'detailed' },
        refresh,
        isReady: true,
        error: null,
    };
}

vi.mock('../../../../db', () => ({ useEtymolog: useEtymologMock }));
vi.mock('../../../display/lexicon/detailed', () => ({
    DetailedLexiconDisplay: ({ lexiconData }: { lexiconData: { lemma: string } }) => (
        <span data-testid="word">{lexiconData.lemma}</span>
    ),
}));
vi.mock('../../../display/lexicon/compact', () => ({
    CompactLexiconDisplay: ({ lexiconData }: { lexiconData: { lemma: string } }) => (
        <span data-testid="word">{lexiconData.lemma}</span>
    ),
}));

const { default: LexiconHome } = await import('../LexiconHome');
const { NotificationProvider } = await import('../../../shared/notifications/NotificationProvider');
const { default: ConfirmDialogProvider } = await import(
    '../../../shared/confirmDialog/ConfirmDialogProvider'
);

let container: HTMLDivElement;
let root: Root;
let currentSearch = '';

function Probe() {
    const { search } = useLocation();
    useEffect(() => {
        currentSearch = search;
    }, [search]);
    return null;
}

function mount(path = '/lexicon') {
    act(() => {
        root.render(
            <MemoryRouter initialEntries={[path]}>
                <NotificationProvider>
                    <ConfirmDialogProvider>
                        <Probe />
                        <Routes>
                            <Route path="/lexicon" element={<LexiconHome />} />
                        </Routes>
                    </ConfirmDialogProvider>
                </NotificationProvider>
            </MemoryRouter>,
        );
    });
}

async function settle(times = 3) {
    for (let i = 0; i < times; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

const text = () => container.textContent ?? '';
const words = () =>
    Array.from(container.querySelectorAll('[data-testid="word"]')).map((n) => n.textContent);
function button(label: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === label,
    );
}
/** Buttons in a modal portal live under document.body, not `container`. */
function docButton(label: string): HTMLButtonElement | undefined {
    return Array.from(document.body.querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === label,
    );
}
const nameInput = () => document.body.querySelector<HTMLInputElement>('#folder-name-input');
function byAria(label: string): HTMLElement | undefined {
    return Array.from(container.querySelectorAll<HTMLElement>('[aria-label]')).find(
        (b) => b.getAttribute('aria-label') === label,
    );
}
function click(el: Element | null | undefined) {
    if (!el) throw new Error('click: nothing');
    act(() => {
        (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}
function typeInto(input: HTMLInputElement, value: string) {
    act(() => {
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
        )?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
}
const searchInput = () =>
    container.querySelector<HTMLInputElement>('input[type="search"], input[type="text"]');
const confirmAction = (which: 'confirm' | 'cancel') =>
    document.body.querySelector(`[data-confirmation-action="${which}"]`) as HTMLElement | null;

beforeEach(() => {
    // The inline tree persists its expanded set to localStorage; clear it so one
    // test's expansion does not leak into the next (they share the happy-dom jar).
    try {
        localStorage.clear();
    } catch {
        /* ignore */
    }
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    state.folders = [folder(1, 'Nouns'), folder(2, 'Entities', 1), folder(3, 'Verbs')];
    state.lexicons = [
        word(10, 'rootword', null),
        word(11, 'nounword', 1),
        word(12, 'entityword', 2),
    ];
    currentSearch = '';
});

afterEach(() => {
    try {
        act(() => root.unmount());
    } catch {
        /* already unmounted */
    }
    container.parentNode?.removeChild(container);
    vi.clearAllMocks();
});

describe('LexiconGallery — folder navigation', () => {
    it('shows the root level: unfiled words, and the top-level folder tree nodes', async () => {
        mount('/lexicon');
        await settle();

        expect(words()).toEqual(['rootword']);
        // Top-level folder nodes are Nouns and Verbs (Entities is nested under
        // Nouns, so its node is not in the DOM until Nouns is expanded).
        expect(byAria('Expand folder Nouns')).toBeTruthy();
        expect(byAria('Expand folder Verbs')).toBeTruthy();
        expect(byAria('Expand folder Entities')).toBeUndefined();
    });

    it('expands a folder in place, revealing its subfolders and its items', async () => {
        mount('/lexicon');
        await settle();

        // Expanding is inline: focus (?folder=) does NOT change.
        click(byAria('Expand folder Nouns'));
        await settle();

        expect(currentSearch).toBe('');
        // Nouns' own word now shows inline alongside the root's unfiled word.
        expect(words()!.sort()).toEqual(['nounword', 'rootword']);
        // Its child folder node is now visible in the tree.
        expect(byAria('Expand folder Entities')).toBeTruthy();
    });

    it('deep-links straight into a folder from the URL', async () => {
        mount('/lexicon?folder=2');
        await settle();

        expect(words()).toEqual(['entityword']);
    });

    it('falls back to the root for an unknown folder id', async () => {
        mount('/lexicon?folder=9999');
        await settle();

        expect(words()).toEqual(['rootword']);
    });

    it('walks back up through the breadcrumb', async () => {
        mount('/lexicon?folder=2');
        await settle();

        // Breadcrumb: All folders / Nouns / Entities. Click Nouns to go up.
        click(button('Nouns'));
        await settle();

        expect(currentSearch).toBe('?folder=1');
        expect(words()).toEqual(['nounword']);
    });

    it('says a folder with no words is empty', async () => {
        state.lexicons = [word(10, 'rootword', null)];
        mount('/lexicon?folder=3');
        await settle();

        expect(words()).toEqual([]);
        expect(text()).toContain('This folder is empty');
    });
});

describe('LexiconGallery — search escapes the folder', () => {
    it('runs the search flat over every word, ignoring the current folder', async () => {
        mount('/lexicon?folder=1');
        await settle();
        // In folder 1 only nounword shows.
        expect(words()).toEqual(['nounword']);

        const input = searchInput();
        expect(input).toBeTruthy();
        typeInto(input!, 'word');
        await settle();

        // The search matched words from every folder, not just folder 1.
        expect(words()!.sort()).toEqual(['entityword', 'nounword', 'rootword']);
    });
});

describe('LexiconGallery — All words toggle', () => {
    it('restores the flat view and hides the folder browser', async () => {
        mount('/lexicon?folder=1');
        await settle();
        expect(words()).toEqual(['nounword']);
        // At focus=Nouns, its child Entities is a top-level tree node.
        expect(byAria('Expand folder Entities')).toBeTruthy();

        click(button('All words'));
        await settle();

        expect(words()!.sort()).toEqual(['entityword', 'nounword', 'rootword']);
        // Folder chrome is gone in flat mode.
        expect(byAria('Expand folder Entities')).toBeUndefined();
    });
});

describe('LexiconGallery — folder CRUD', () => {
    it('creates a folder under the current level', async () => {
        mount('/lexicon?folder=1');
        await settle();

        click(button('New folder'));
        await settle();

        const input = nameInput();
        expect(input).toBeTruthy();
        typeInto(input!, 'Divine');
        click(docButton('Create folder'));
        await settle();

        expect(folderCreate).toHaveBeenCalledTimes(1);
        expect(folderCreate).toHaveBeenCalledWith({ name: 'Divine', parent_id: 1 });
    });

    it('renames a folder', async () => {
        mount('/lexicon');
        await settle();

        click(byAria('Rename folder Nouns'));
        await settle();

        const input = nameInput();
        expect(input?.value).toBe('Nouns');
        typeInto(input!, 'Substantives');
        click(docButton('Save name'));
        await settle();

        expect(folderRename).toHaveBeenCalledWith(1, 'Substantives');
    });

    it('confirms deletion with wording that the contents move up, not deleted', async () => {
        mount('/lexicon');
        await settle();

        click(byAria('Delete folder Nouns'));
        await settle();

        const dialog = document.body.textContent ?? '';
        expect(dialog).toContain('Delete folder "Nouns"?');
        expect(dialog).toContain('move up');
        expect(dialog).toContain('nothing is deleted');
        // Not called until confirmed.
        expect(folderDelete).not.toHaveBeenCalled();

        click(confirmAction('confirm'));
        await settle();
        expect(folderDelete).toHaveBeenCalledWith(1);
    });

    it('does not delete when the confirmation is cancelled', async () => {
        mount('/lexicon');
        await settle();

        click(byAria('Delete folder Verbs'));
        await settle();
        click(confirmAction('cancel'));
        await settle();

        expect(folderDelete).not.toHaveBeenCalled();
    });
});

describe('LexiconGallery — create-in-folder link', () => {
    it('the New word link carries the current folder', async () => {
        mount('/lexicon?folder=1');
        await settle();

        const newWord = Array.from(container.querySelectorAll('a')).find(
            (a) => (a.textContent ?? '').includes('New word'),
        );
        expect(newWord?.getAttribute('href')).toBe('/lexicon/create?folder=1');
    });

    it('the empty-folder create link carries the folder too', async () => {
        state.lexicons = [word(10, 'rootword', null)];
        mount('/lexicon?folder=3');
        await settle();

        const create = Array.from(container.querySelectorAll('a')).find(
            (a) => (a.textContent ?? '').includes('Create a word here'),
        );
        expect(create?.getAttribute('href')).toBe('/lexicon/create?folder=3');
    });
});
