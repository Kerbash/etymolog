// @vitest-environment happy-dom
/**
 * DirectoryGallery — the flat↔tree behaviour that the lexicon (and, from Phase
 * 4, glyphs + graphemes) all get from ONE binding.
 *
 * These tests drive the component with FAKE props (a plain in-memory folder API
 * and simple items), because none of what is under test here is about SQLite:
 *
 *  - flat view escapes the folder for a live search, for the "All items"
 *    toggle, and always in a picker;
 *  - an expanded folder shows at most `TREE_ITEM_CAP` cards, then a "Show all
 *    N →" row that FOCUSES the folder (updates `?folder=`);
 *  - `?folder=` is validated against the loaded slice (unknown / non-numeric →
 *    root);
 *  - expansion state survives a corrupt localStorage value and is pruned to the
 *    ids the slice still has.
 *
 * The folder CRUD dialogs' round-trips against the REAL lexicon domain live in
 * `DirectoryGalleryCrud.test.tsx` — the database there is real on purpose.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect, type ReactNode } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';

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
vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

// `useGalleryState` reaches the provider only for `settings.defaultGalleryView`;
// stub it so the behavioural tests need no EtymologProvider (the fake props are
// the whole point here — the real domain is exercised in the CRUD suite).
vi.mock('../../../../db', () => ({
    useEtymolog: () => ({ settings: { defaultGalleryView: 'detailed' } }),
}));

import type { ApiResponse } from '../../../../db/api/types';
import type { FolderApi } from '../../../../db/api/folderApi';
import type { FolderRecord } from '../../../../db/types';
import { NotificationProvider } from '../../notifications/NotificationProvider';
import ConfirmDialogProvider from '../../confirmDialog/ConfirmDialogProvider';
import { useGalleryState, type GalleryState, type GalleryAdapters } from '../../gallery';
import { descendantFolders } from '../folderTree';
import DirectoryGallery, { TREE_ITEM_CAP } from '../DirectoryGallery';

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

interface Item {
    id: number;
    name: string;
    folderId: number | null;
    /** Used only by the filter-consistency suite. */
    native?: boolean;
}

function folder(id: number, name: string, parentId: number | null, position = 0): FolderRecord {
    return { id, name, parent_id: parentId, position, created_at: '', updated_at: '' };
}

// Nouns > People > Gods ; Verbs (root)
const FOLDERS: FolderRecord[] = [
    folder(1, 'Nouns', null, 0),
    folder(2, 'People', 1, 0),
    folder(3, 'Gods', 2, 0),
    folder(4, 'Verbs', null, 1),
];

const ADAPTERS: GalleryAdapters<Item> = {
    search: (item, query) => item.name.toLowerCase().includes(query),
    sort: (a, b) => a.name.localeCompare(b.name),
};

const ok = <T,>(data: T): ApiResponse<T> => ({ success: true, data });

/** A folder API stub that records calls; behavioural tests never inspect the DB. */
function fakeFolderApi(): FolderApi & { calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        list: () => ok<FolderRecord[]>(FOLDERS),
        getById: (id) => ok(FOLDERS.find((f) => f.id === id) as FolderRecord),
        create: (req) => {
            calls.push(`create:${req.name}:${req.parent_id ?? 'root'}`);
            return ok(folder(99, req.name, req.parent_id ?? null));
        },
        update: (id) => ok(FOLDERS.find((f) => f.id === id) as FolderRecord),
        rename: (id, name) => {
            calls.push(`rename:${id}:${name}`);
            return ok(folder(id, name, null));
        },
        move: (id, parent) => {
            calls.push(`move:${id}:${parent ?? 'root'}`);
            return ok(folder(id, 'x', parent));
        },
        delete: (id) => {
            calls.push(`delete:${id}`);
            return ok(undefined);
        },
        setItemFolder: ({ itemId, folderId }) => {
            calls.push(`setItemFolder:${itemId}:${folderId ?? 'root'}`);
            return ok(undefined);
        },
        getPath: () => ok<FolderRecord[]>([]),
    };
}

// --------------------------------------------------------------------------
// Harness
// --------------------------------------------------------------------------

let capturedState: GalleryState | null = null;
let capturedLocation: { pathname: string; search: string } | null = null;

function LocationProbe() {
    const location = useLocation();
    useEffect(() => {
        capturedLocation = location;
    });
    return null;
}

function Harness({
    items,
    folderApi,
    selectionMode = false,
    adapters = ADAPTERS,
    filterOptions,
    folders = FOLDERS,
}: {
    items: Item[];
    folderApi: FolderApi;
    selectionMode?: boolean;
    adapters?: GalleryAdapters<Item>;
    filterOptions?: readonly { value: string; label: string }[];
    folders?: readonly FolderRecord[];
}) {
    const state = useGalleryState({ defaultSort: 'name-asc' });
    useEffect(() => {
        capturedState = state;
    });
    return (
        <DirectoryGallery<Item>
            items={items}
            state={state}
            adapters={adapters}
            keyExtractor={(item) => item.id}
            renderItem={(item) => <span data-item>{item.name}</span>}
            itemLabel={(item) => item.name}
            itemHref={(item) => `/item/${item.id}`}
            selectionMode={selectionMode}
            onSelect={() => {}}
            ariaLabel="Items"
            sortOptions={[{ value: 'name-asc', displayComponent: <span>Name</span> }]}
            filterOptions={filterOptions}
            folders={folders}
            getItemFolderId={(item) => item.folderId}
            folderApi={folderApi}
            domainKey="lexicon"
            createHref={(id) => (id === null ? '/create' : `/create?folder=${id}`)}
            itemNoun="word"
            allItemsLabel="All words"
            browseFoldersLabel="Browse folders"
            empty={({ flatView }) => ({ title: flatView ? 'Nothing here' : 'Folder empty' })}
        />
    );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(ui: ReactNode, path = '/') {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <MemoryRouter initialEntries={[path]}>
                <NotificationProvider>
                    <ConfirmDialogProvider>
                        <LocationProbe />
                        {ui}
                    </ConfirmDialogProvider>
                </NotificationProvider>
            </MemoryRouter>,
        );
    });
    await settle();
}

async function settle(times = 3) {
    for (let i = 0; i < times; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
}

function q(selector: string): HTMLElement | null {
    return document.body.querySelector(selector);
}
function qa(selector: string): HTMLElement[] {
    return Array.from(document.body.querySelectorAll(selector));
}
function button(label: string): HTMLButtonElement | undefined {
    return Array.from(document.body.querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === label || b.getAttribute('aria-label') === label,
    ) as HTMLButtonElement | undefined;
}
async function click(el: Element | null | undefined) {
    if (!el) throw new Error('element not found to click');
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
}

beforeEach(() => {
    capturedState = null;
    capturedLocation = null;
    try {
        localStorage.clear();
    } catch {
        /* ignore */
    }
});

afterEach(() => {
    try {
        act(() => root?.unmount());
    } catch {
        /* already unmounted */
    }
    container?.parentNode?.removeChild(container);
    container = null;
    root = null;
});

// --------------------------------------------------------------------------
// descendantFolders (pure) — the tree scoping the component leans on
// --------------------------------------------------------------------------

describe('descendantFolders', () => {
    it('returns the whole forest at the root (null)', () => {
        expect(descendantFolders(FOLDERS, null).map((f) => f.id).sort()).toEqual([1, 2, 3, 4]);
    });
    it('returns only STRICT descendants of a focused folder', () => {
        expect(descendantFolders(FOLDERS, 1).map((f) => f.id).sort()).toEqual([2, 3]);
        expect(descendantFolders(FOLDERS, 2).map((f) => f.id)).toEqual([3]);
        expect(descendantFolders(FOLDERS, 3)).toEqual([]);
    });
});

// --------------------------------------------------------------------------
// Flat ↔ tree switching
// --------------------------------------------------------------------------

describe('flat ↔ tree switching', () => {
    it('shows the folder chrome (breadcrumb + toggle) in tree mode', async () => {
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} />);
        expect(button('All folders')).toBeTruthy();
        expect(button('All words')).toBeTruthy();
    });

    it('the "All words" toggle escapes to flat view (no breadcrumb)', async () => {
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} />);
        await click(button('All words'));
        expect(button('All folders')).toBeFalsy();
        // The toggle now offers the way back.
        expect(button('Browse folders')).toBeTruthy();
    });

    it('a live search escapes the folder to flat view', async () => {
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} />);
        expect(button('All folders')).toBeTruthy();
        await act(async () => {
            capturedState!.setQuery('anything');
        });
        await settle();
        expect(button('All folders')).toBeFalsy();
    });

    it('a picker is ALWAYS flat — no toggle, no breadcrumb', async () => {
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} selectionMode />);
        expect(button('All folders')).toBeFalsy();
        expect(button('All words')).toBeFalsy();
        expect(button('Browse folders')).toBeFalsy();
    });
});

// --------------------------------------------------------------------------
// Cap + "Show all" focus
// --------------------------------------------------------------------------

describe('cap and Show-all focus', () => {
    const many: Item[] = Array.from({ length: TREE_ITEM_CAP + 1 }, (_, i) => ({
        id: i + 1,
        name: `w${String(i + 1).padStart(2, '0')}`,
        folderId: 1,
    }));

    it('caps a folder node at TREE_ITEM_CAP cards with a Show-all row', async () => {
        await mount(<Harness items={many} folderApi={fakeFolderApi()} />);
        await click(button('Expand folder Nouns'));
        expect(qa('[data-item]').length).toBe(TREE_ITEM_CAP);
        expect(button(`Show all ${TREE_ITEM_CAP + 1} →`)).toBeTruthy();
    });

    it('Show-all focuses the folder (updates ?folder=)', async () => {
        await mount(<Harness items={many} folderApi={fakeFolderApi()} />);
        await click(button('Expand folder Nouns'));
        await click(button(`Show all ${TREE_ITEM_CAP + 1} →`));
        expect(capturedLocation?.search).toBe('?folder=1');
        // Focused: the breadcrumb now has Nouns as the current crumb.
        const current = q('[aria-current="page"]');
        expect(current?.textContent).toBe('Nouns');
    });
});

// --------------------------------------------------------------------------
// ?folder= validation
// --------------------------------------------------------------------------

describe('?folder= validation', () => {
    it('an unknown id falls back to root', async () => {
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} />, '/?folder=999');
        const current = q('[aria-current="page"]');
        expect(current?.textContent).toBe('All folders');
    });

    it('a non-numeric id falls back to root', async () => {
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} />, '/?folder=abc');
        const current = q('[aria-current="page"]');
        expect(current?.textContent).toBe('All folders');
    });

    it('a valid id focuses that folder', async () => {
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} />, '/?folder=2');
        // Breadcrumb: All folders / Nouns / People (People current)
        const current = q('[aria-current="page"]');
        expect(current?.textContent).toBe('People');
    });
});

// --------------------------------------------------------------------------
// localStorage: corruption + pruning + persistence
// --------------------------------------------------------------------------

describe('expansion persistence', () => {
    it('a corrupt localStorage value does not crash and starts collapsed', async () => {
        localStorage.setItem('etymolog.treeExpansion.lexicon', 'not json {');
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} />);
        const toggle = button('Expand folder Nouns');
        expect(toggle).toBeTruthy();
        expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    });

    it('prunes ids the slice no longer has, keeps the valid ones expanded', async () => {
        // 999 is not a folder; 1 (Nouns) is — only Nouns should open.
        localStorage.setItem('etymolog.treeExpansion.lexicon', JSON.stringify([999, 1]));
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} />);
        const nouns = button('Collapse folder Nouns');
        expect(nouns).toBeTruthy();
        expect(nouns?.getAttribute('aria-expanded')).toBe('true');
    });

    it('persists a toggle back to localStorage', async () => {
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} />);
        await click(button('Expand folder Nouns'));
        const raw = localStorage.getItem('etymolog.treeExpansion.lexicon');
        expect(JSON.parse(raw ?? '[]')).toEqual([1]);
    });
});

// --------------------------------------------------------------------------
// localStorage poison matrix — every malformed shape starts collapsed, never
// crashes (pitfall 9: localStorage is hostile — try/catch + shape-validate).
// --------------------------------------------------------------------------

describe('localStorage poison matrix', () => {
    const KEY = 'etymolog.treeExpansion.lexicon';

    it('valid JSON that is NOT an array → empty expansion', async () => {
        localStorage.setItem(KEY, JSON.stringify({ nope: true }));
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} />);
        expect(button('Expand folder Nouns')?.getAttribute('aria-expanded')).toBe('false');
    });

    it('an array of non-integers is filtered; a valid int in it still expands', async () => {
        // 'x' (string), 1.5 (non-integer) are dropped; 1 (Nouns) survives.
        localStorage.setItem(KEY, JSON.stringify(['x', 1.5, 1]));
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} />);
        expect(button('Collapse folder Nouns')?.getAttribute('aria-expanded')).toBe('true');
        // People (id 2) was never in the set → collapsed. It is a child of Nouns,
        // visible because Nouns is open.
        expect(button('Expand folder People')?.getAttribute('aria-expanded')).toBe('false');
    });

    it('a null / boolean array element does not crash and yields empty expansion', async () => {
        localStorage.setItem(KEY, JSON.stringify([null, true, 'nope']));
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} />);
        expect(button('Expand folder Nouns')?.getAttribute('aria-expanded')).toBe('false');
    });

    it('a THROWING accessor is swallowed; the tree renders collapsed', async () => {
        const real = Storage.prototype.getItem;
        const spy = vi
            .spyOn(Storage.prototype, 'getItem')
            .mockImplementation(function (this: Storage, key: string) {
                if (key.startsWith('etymolog.treeExpansion')) throw new Error('storage blocked');
                return real.call(this, key);
            });
        try {
            await mount(<Harness items={[]} folderApi={fakeFolderApi()} />);
            expect(button('Expand folder Nouns')?.getAttribute('aria-expanded')).toBe('false');
        } finally {
            spy.mockRestore();
        }
    });
});

// --------------------------------------------------------------------------
// Pathological folder slice — a hand-smuggled cycle (bypassing the service)
// must render (its members promoted to roots), never hang, and stay operable.
// --------------------------------------------------------------------------

describe('cyclic folder slice', () => {
    // Root is a clean tree; A↔B form a 2-cycle (A.parent = B, B.parent = A).
    const CYCLIC: FolderRecord[] = [
        folder(1, 'Root', null, 0),
        folder(2, 'Acyc', 3, 0),
        folder(3, 'Bcyc', 2, 0),
    ];

    it('renders without hanging: the clean root + one promoted cycle member are top-level', async () => {
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} folders={CYCLIC} />);
        // The render RETURNED (no infinite loop). buildForest promotes exactly one
        // cycle member (Acyc, first in input order) to a root and nests the other
        // (Bcyc) under it — so at the collapsed top level only Root + Acyc show.
        expect(button('Expand folder Root')).toBeTruthy();
        expect(button('Expand folder Acyc')).toBeTruthy();
        // Bcyc is nested under the collapsed Acyc, not a top-level row yet.
        expect(button('Expand folder Bcyc')).toBeFalsy();
    });

    it('expanding a cyclic folder terminates (child rendered once) and CRUD dispatches', async () => {
        const api = fakeFolderApi();
        await mount(<Harness items={[]} folderApi={api} folders={CYCLIC} />);
        // Expanding Acyc renders its child (Bcyc) once — the visited guard stops
        // the walk from re-entering Acyc under Bcyc (no hang, one Bcyc row).
        await click(button('Expand folder Acyc'));
        expect(button('Collapse folder Acyc')?.getAttribute('aria-expanded')).toBe('true');
        expect(button('Expand folder Bcyc')).toBeTruthy();
        // Delete dispatches to the api (the service, not the UI, owns cycle repair).
        await click(button('Delete folder Acyc'));
        const confirmBtn = document.body.querySelector('[data-confirmation-action="confirm"]');
        expect(confirmBtn).toBeTruthy(); // confirm dialog is up
        await click(confirmBtn);
        expect(api.calls.some((c) => c === 'delete:2')).toBe(true);
    });
});

// --------------------------------------------------------------------------
// Follow-up A — the active filter governs the tree-side node grid AND count
// --------------------------------------------------------------------------

describe('tree-mode filter consistency', () => {
    // A leaf element (no element children) whose text is exactly `text` — the
    // node header's count span, which reads e.g. "3 words".
    function leafWithText(text: string): HTMLElement | undefined {
        return qa('*').find(
            (el) => el.children.length === 0 && (el.textContent ?? '').trim() === text,
        );
    }

    const FILTERED_ADAPTERS: GalleryAdapters<Item> = {
        search: (item, query) => item.name.toLowerCase().includes(query),
        // 'native' passes native items; anything else (there is only one option
        // here) is never reached because 'all' short-circuits in applyGallery.
        filter: (item) => Boolean(item.native),
        sort: (a, b) => a.name.localeCompare(b.name),
    };

    // 3 native + 2 external, all filed directly in Nouns (folder 1).
    const MIXED: Item[] = [
        { id: 1, name: 'a', folderId: 1, native: true },
        { id: 2, name: 'b', folderId: 1, native: true },
        { id: 3, name: 'c', folderId: 1, native: true },
        { id: 4, name: 'd', folderId: 1, native: false },
        { id: 5, name: 'e', folderId: 1, native: false },
    ];

    it('shrinks the node grid AND the header count when the filter narrows', async () => {
        await mount(
            <Harness
                items={MIXED}
                folderApi={fakeFolderApi()}
                adapters={FILTERED_ADAPTERS}
                filterOptions={[
                    { value: 'all', label: 'All' },
                    { value: 'native', label: 'Native only' },
                ]}
            />,
        );
        await click(button('Expand folder Nouns'));

        // Unfiltered: all five cards, header reads "5 words".
        expect(qa('[data-item]').length).toBe(5);
        expect(leafWithText('5 words')).toBeTruthy();

        // Narrow to native-only: node grid AND header count follow the filter.
        await act(async () => {
            capturedState!.setFilter('native');
        });
        await settle();

        expect(qa('[data-item]').length).toBe(3);
        expect(leafWithText('3 words')).toBeTruthy();
        expect(leafWithText('5 words')).toBeFalsy();
    });
});

// --------------------------------------------------------------------------
// Follow-up B — changing focus resets the focused-folder grid to page 1
// --------------------------------------------------------------------------

describe('page reset on focus change', () => {
    it('resets state.page to 1 when navigating focus between folders', async () => {
        // Focus People (id 2): breadcrumb is All folders / Nouns / People.
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} />, '/?folder=2');
        await act(async () => {
            capturedState!.setPage(4);
        });
        await settle();
        expect(capturedState?.page).toBe(4);

        // Click the Nouns crumb — a focus change to a different folder.
        await click(button('Nouns'));
        expect(capturedLocation?.search).toBe('?folder=1');
        expect(capturedState?.page).toBe(1);
    });
});

// --------------------------------------------------------------------------
// Defect 2 — every tree node carries an always-present "Open folder" affordance
// so a SMALL folder (≤ TREE_ITEM_CAP items, hence no "Show all N →" row, and
// not an ancestor in the breadcrumb) can still become the focused root and
// expose its create-in-folder CTA + shareable ?folder= deep link.
// --------------------------------------------------------------------------

describe('open-folder affordance', () => {
    it('renders an Open-folder button on a node with FEW items (no Show-all row)', async () => {
        // Verbs (id 4) has a single item — well under the cap, so no Show-all.
        const few: Item[] = [{ id: 1, name: 'run', folderId: 4 }];
        await mount(<Harness items={few} folderApi={fakeFolderApi()} />);
        expect(button(`Show all 1 →`)).toBeFalsy();
        expect(button('Open folder Verbs')).toBeTruthy();
    });

    it('clicking Open folder focuses it (updates ?folder= and the breadcrumb)', async () => {
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} />);
        await click(button('Open folder Nouns'));
        expect(capturedLocation?.search).toBe('?folder=1');
        const current = q('[aria-current="page"]');
        expect(current?.textContent).toBe('Nouns');
    });

    it('resets the focused-folder grid to page 1 when opening a folder', async () => {
        await mount(<Harness items={[]} folderApi={fakeFolderApi()} />);
        await act(async () => {
            capturedState!.setPage(3);
        });
        await settle();
        await click(button('Open folder Verbs'));
        expect(capturedState?.page).toBe(1);
    });
});

// --------------------------------------------------------------------------
// Defect 3 — FolderNameDialog is a real <form>: Enter in the field submits, the
// button is a genuine type="submit", and the empty-name guard holds on both.
// --------------------------------------------------------------------------

describe('FolderNameDialog form submission', () => {
    async function openCreateDialog(api: FolderApi) {
        await mount(<Harness items={[]} folderApi={api} />);
        await click(button('New folder'));
    }

    it('the name field lives inside a <form> with a type="submit" button', async () => {
        await openCreateDialog(fakeFolderApi());
        const input = q('#folder-name-input') as HTMLInputElement | null;
        expect(input).toBeTruthy();
        const form = input?.closest('form');
        expect(form).toBeTruthy();
        const submit = button('Create folder');
        expect(submit?.getAttribute('type')).toBe('submit');
    });

    it('submitting the form (Enter / the submit button) creates the folder', async () => {
        const api = fakeFolderApi();
        await openCreateDialog(api);
        const input = q('#folder-name-input') as HTMLInputElement;
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
                input,
                'Nouns',
            );
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await settle();
        // A form submit — the event a real browser fires both when Enter is
        // pressed in the field and when the type="submit" button is clicked.
        // (happy-dom does not synthesise implicit submission from a keydown, so
        // the submit event is dispatched directly; the fix under test is the
        // <form onSubmit> path itself, which before this change did not exist.)
        const form = input.closest('form') as HTMLFormElement;
        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });
        await settle();
        expect(api.calls).toContain('create:Nouns:root');
    });

    it('an empty name cannot be submitted (guard holds on the form path)', async () => {
        const api = fakeFolderApi();
        await openCreateDialog(api);
        const input = q('#folder-name-input') as HTMLInputElement;
        const form = input.closest('form') as HTMLFormElement;
        await act(async () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });
        await settle();
        expect(api.calls.some((c) => c.startsWith('create:'))).toBe(false);
    });
});

// --------------------------------------------------------------------------
// Defect 1 (P0) — a dialog's open→confirm→close cycle must NOT strand an
// invisible, click-eating headlessui shell. After the flow no element may carry
// `data-headlessui-state="open"` and the whole dialog subtree must be gone.
// --------------------------------------------------------------------------

describe('dialog lifecycle leaves no stranded overlay', () => {
    function noOpenDialogShell() {
        expect(document.body.querySelectorAll('[data-headlessui-state="open"]').length).toBe(0);
        expect(document.body.querySelector('#folder-name-input')).toBeNull();
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    }

    function setNative(el: HTMLInputElement | HTMLSelectElement, value: string) {
        const proto =
            el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    it('FolderNameDialog: create → close leaves no open shell', async () => {
        const api = fakeFolderApi();
        await mount(<Harness items={[]} folderApi={api} />);
        // A dialog IS open mid-flow (sanity: the assertion is not vacuous).
        await click(button('New folder'));
        expect(document.body.querySelector('#folder-name-input')).toBeTruthy();

        const input = q('#folder-name-input') as HTMLInputElement;
        await act(async () => {
            setNative(input, 'Beasts');
        });
        await settle();
        await click(button('Create folder'));

        expect(api.calls).toContain('create:Beasts:root');
        noOpenDialogShell();
    });

    it('MoveToFolderDialog (item move): open → move → close leaves no open shell', async () => {
        const api = fakeFolderApi();
        // One item filed in Nouns (id 1); expand Nouns so its card + the per-card
        // "Move … to folder" action render on the tree side.
        const items: Item[] = [{ id: 7, name: 'wolf', folderId: 1 }];
        await mount(<Harness items={items} folderApi={api} />);
        await click(button('Expand folder Nouns'));
        await click(button('Move wolf to folder'));
        // The move dialog is open (its destination select exists).
        const select = document.body.querySelector('select') as HTMLSelectElement | null;
        expect(select).toBeTruthy();
        await act(async () => {
            setNative(select!, '4'); // move to Verbs
        });
        await settle();
        await click(button('Move'));

        expect(api.calls).toContain('setItemFolder:7:4');
        noOpenDialogShell();
    });
});
