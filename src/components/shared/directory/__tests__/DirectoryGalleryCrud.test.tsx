// @vitest-environment happy-dom
/**
 * DirectoryGallery folder CRUD — the dialogs' round-trips against the REAL
 * lexicon folder domain (sql.js in memory). These are the behaviours the
 * retired `FolderBrowser` used to own and that must keep working now that the
 * breadcrumb + folder CRUD live inside DirectoryGallery:
 *
 *  - create a folder (root level and as a subfolder),
 *  - rename a folder,
 *  - move a folder under a new parent,
 *  - delete a folder and see its children REPARENT up (nothing destroyed).
 *
 * The database is real on purpose: the delete-reparent is a service behaviour,
 * and a mock of the service's answer would be a mock of the thing under test.
 * The folder mutations flow through the provider-wrapped `api.folder`, so the
 * `folders` slice refresh is exercised end to end too.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';

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

import { clearDatabase, initDatabase } from '../../../../db/database';
import { folderApi as rawFolderApi } from '../../../../db/api/folderApi';
import type { FolderRecord } from '../../../../db/types';
import { EtymologProvider } from '../../../../db/context';
import { useEtymolog } from '../../../../db';
import { NotificationProvider } from '../../notifications/NotificationProvider';
import ConfirmDialogProvider from '../../confirmDialog/ConfirmDialogProvider';
import { useGalleryState } from '../../gallery';
import DirectoryGallery from '../DirectoryGallery';

// --------------------------------------------------------------------------
// Harness
// --------------------------------------------------------------------------

let capturedFolders: readonly FolderRecord[] = [];

function CrudHarness() {
    const { api, data, isReady } = useEtymolog();
    const state = useGalleryState({ defaultSort: 'name-asc' });
    useEffect(() => {
        capturedFolders = data.folders ?? [];
    });
    if (!isReady) return <p>loading</p>;
    return (
        <DirectoryGallery<{ id: number }>
            items={[]}
            state={state}
            keyExtractor={(item) => item.id}
            renderItem={() => null}
            itemLabel={() => ''}
            ariaLabel="Words"
            sortOptions={[{ value: 'name-asc', displayComponent: <span>Name</span> }]}
            folders={data.folders ?? []}
            getItemFolderId={() => null}
            folderApi={api.folder}
            domainKey="lexicon"
            itemNoun="word"
            empty={{ title: 'No words' }}
        />
    );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Providers({ children, path }: { children: ReactNode; path: string }) {
    return (
        <MemoryRouter initialEntries={[path]}>
            <EtymologProvider>
                <NotificationProvider>
                    <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
                </NotificationProvider>
            </EtymologProvider>
        </MemoryRouter>
    );
}

async function mountAt(path = '/') {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <Providers path={path}>
                <CrudHarness />
            </Providers>,
        );
    });
    await settle(20);
}

async function settle(times = 4) {
    for (let i = 0; i < times; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
}

function button(label: string): HTMLButtonElement | undefined {
    return Array.from(document.body.querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === label || b.getAttribute('aria-label') === label,
    ) as HTMLButtonElement | undefined;
}
async function click(el: Element | null | undefined) {
    if (!el) throw new Error('element to click not found');
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
}
function setNativeValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}
async function typeName(value: string) {
    const input = document.body.querySelector('#folder-name-input') as HTMLInputElement | null;
    if (!input) throw new Error('name input not open');
    await act(async () => {
        setNativeValue(input, value);
    });
    await settle();
}
const byName = (name: string) => capturedFolders.find((f) => f.name === name);

beforeAll(async () => {
    await initDatabase();
});
beforeEach(() => {
    clearDatabase();
    capturedFolders = [];
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
// Tests
// --------------------------------------------------------------------------

describe('DirectoryGallery folder CRUD (real lexicon domain)', () => {
    it('creates a folder at the root from the breadcrumb bar', async () => {
        await mountAt('/');
        await click(button('New folder'));
        await typeName('Animals');
        await click(button('Create folder'));
        expect(byName('Animals')).toBeTruthy();
        expect(byName('Animals')?.parent_id).toBeNull();
    });

    it('creates a subfolder under an existing folder', async () => {
        rawFolderApi.create({ name: 'Nouns', parent_id: null });
        await mountAt('/');
        await click(button('New subfolder in Nouns'));
        await typeName('People');
        await click(button('Create folder'));
        const nouns = byName('Nouns');
        expect(byName('People')?.parent_id).toBe(nouns?.id);
    });

    it('renames a folder', async () => {
        rawFolderApi.create({ name: 'Nouns', parent_id: null });
        await mountAt('/');
        await click(button('Rename folder Nouns'));
        await typeName('Nomina');
        await click(button('Save name'));
        expect(byName('Nomina')).toBeTruthy();
        expect(byName('Nouns')).toBeFalsy();
    });

    it('deletes a folder and REPARENTS its children up (nothing destroyed)', async () => {
        const nouns = rawFolderApi.create({ name: 'Nouns', parent_id: null }).data!;
        rawFolderApi.create({ name: 'People', parent_id: nouns.id });
        await mountAt('/');
        await click(button('Delete folder Nouns'));
        // The app-wide confirmation portals onto document.body.
        const confirmBtn = document.body.querySelector('[data-confirmation-action="confirm"]');
        await click(confirmBtn);
        expect(byName('Nouns')).toBeFalsy();
        // People survived and moved up to the root.
        expect(byName('People')).toBeTruthy();
        expect(byName('People')?.parent_id).toBeNull();
    });

    it('moves a folder under a new parent', async () => {
        const nouns = rawFolderApi.create({ name: 'Nouns', parent_id: null }).data!;
        const verbs = rawFolderApi.create({ name: 'Verbs', parent_id: null }).data!;
        rawFolderApi.create({ name: 'People', parent_id: nouns.id });
        // Focus Nouns so People is a top-level tree node with a reachable move button.
        await mountAt(`/?folder=${nouns.id}`);
        await click(button('Move folder People'));
        const select = document.body.querySelector('select') as HTMLSelectElement | null;
        if (!select) throw new Error('destination select not open');
        await act(async () => {
            setNativeValue(select, String(verbs.id));
        });
        await settle();
        await click(button('Move'));
        expect(byName('People')?.parent_id).toBe(verbs.id);
    });
});
