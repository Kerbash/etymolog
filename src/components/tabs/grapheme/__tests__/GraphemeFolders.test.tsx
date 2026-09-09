// @vitest-environment happy-dom
/**
 * GraphemeGallery × folders (Phase 4) — the grapheme domain's inline folder
 * tree, driven against the REAL grapheme folder domain (sql.js in memory)
 * through the provider-wrapped api.
 *
 *  - a grapheme filed in a folder shows only under that folder in tree mode;
 *  - a live search escapes the folder to a flat list;
 *  - the per-card "Move to folder" action files a root grapheme into a folder;
 *  - deleting a folder REPARENTS its graphemes up (nothing destroyed);
 *  - selection mode (the punctuation grapheme picker) is ALWAYS flat — no
 *    folder chrome — even though this gallery is a `DirectoryGallery`.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { useEffect } from 'react';

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
import { etymologApi } from '../../../../db/api';
import { graphemeFolderApi } from '../../../../db/api/folderApi';
import type { FolderRecord, GraphemeComplete } from '../../../../db/types';
import { EtymologProvider } from '../../../../db/context';
import { useEtymolog } from '../../../../db';
import { NotificationProvider } from '../../../shared/notifications/NotificationProvider';
import ConfirmDialogProvider from '../../../shared/confirmDialog/ConfirmDialogProvider';
import GraphemeGallery from '../galleryGrapheme/graphemeGallery';

// --------------------------------------------------------------------------
// Harness
// --------------------------------------------------------------------------

let capturedGraphemes: readonly GraphemeComplete[] = [];
let capturedFolders: readonly FolderRecord[] = [];

function Probe() {
    const { data } = useEtymolog();
    useEffect(() => {
        capturedGraphemes = data.graphemesComplete ?? [];
        capturedFolders = data.graphemeFolders ?? [];
    });
    return null;
}

function Harness({ picker = false }: { picker?: boolean }) {
    const { isReady } = useEtymolog();
    if (!isReady) return <p>loading</p>;
    return (
        <>
            <Probe />
            {picker ? (
                <GraphemeGallery selectionMode onSelect={() => {}} />
            ) : (
                <GraphemeGallery />
            )}
        </>
    );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mountAt(path = '/', picker = false) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <MemoryRouter initialEntries={[path]}>
                <EtymologProvider>
                    <NotificationProvider>
                        <ConfirmDialogProvider>
                            <Harness picker={picker} />
                        </ConfirmDialogProvider>
                    </NotificationProvider>
                </EtymologProvider>
            </MemoryRouter>,
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
async function typeSearch(value: string) {
    const input = document.body.querySelector(
        'input[placeholder="Search by name, phoneme or glyph…"]',
    ) as HTMLInputElement | null;
    if (!input) throw new Error('search box not found');
    await act(async () => {
        setNativeValue(input, value);
    });
    await settle();
}
const hasText = (text: string) => (document.body.textContent ?? '').includes(text);
const graphemeByName = (name: string) => capturedGraphemes.find((g) => g.name === name);
const folderByName = (name: string) => capturedFolders.find((f) => f.name === name);

/** Seed a glyph so graphemes (which need at least one) can be created. */
function seedGlyphId(): number {
    return etymologApi.glyph.create({ name: 'mark', svg_data: '<svg/>' }).data!.id;
}
function seedGrapheme(name: string, glyphId: number, folderId: number | null): void {
    etymologApi.grapheme.create({
        name,
        glyphs: [{ glyph_id: glyphId, position: 0 }],
        folder_id: folderId,
    });
}

beforeAll(async () => {
    await initDatabase();
});
beforeEach(() => {
    clearDatabase();
    capturedGraphemes = [];
    capturedFolders = [];
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
// Tests
// --------------------------------------------------------------------------

describe('GraphemeGallery folder tree (real grapheme domain)', () => {
    it('shows a filed grapheme only under its folder in tree mode', async () => {
        const group = graphemeFolderApi.create({ name: 'GroupOne', parent_id: null }).data!;
        const glyphId = seedGlyphId();
        seedGrapheme('alef', glyphId, group.id);
        seedGrapheme('bet', glyphId, null);
        await mountAt('/');

        expect(hasText('bet')).toBe(true);
        expect(hasText('GroupOne')).toBe(true);
        expect(hasText('alef')).toBe(false);

        await click(button('Expand folder GroupOne'));
        expect(hasText('alef')).toBe(true);
    });

    it('escapes the folder to a flat list for a live search', async () => {
        const group = graphemeFolderApi.create({ name: 'GroupOne', parent_id: null }).data!;
        const glyphId = seedGlyphId();
        seedGrapheme('alef', glyphId, group.id);
        seedGrapheme('bet', glyphId, null);
        await mountAt('/');

        await typeSearch('alef');
        expect(hasText('alef')).toBe(true);
        expect(button('All folders')).toBeFalsy();
    });

    it('files a root grapheme into a folder from the per-card Move action', async () => {
        const group = graphemeFolderApi.create({ name: 'GroupOne', parent_id: null }).data!;
        const glyphId = seedGlyphId();
        seedGrapheme('bet', glyphId, null);
        await mountAt('/');

        await click(button('Move bet to folder'));
        const select = document.body.querySelector('select') as HTMLSelectElement | null;
        if (!select) throw new Error('destination select not open');
        await act(async () => {
            setNativeValue(select, String(group.id));
        });
        await settle();
        await click(button('Move'));

        expect(graphemeByName('bet')?.folder_id).toBe(group.id);
    });

    it('reparents a folder\'s graphemes up when the folder is deleted', async () => {
        const group = graphemeFolderApi.create({ name: 'GroupOne', parent_id: null }).data!;
        const glyphId = seedGlyphId();
        seedGrapheme('alef', glyphId, group.id);
        await mountAt('/');

        await click(button('Delete folder GroupOne'));
        const confirmBtn = document.body.querySelector('[data-confirmation-action="confirm"]');
        await click(confirmBtn);

        expect(folderByName('GroupOne')).toBeFalsy();
        expect(graphemeByName('alef')).toBeTruthy();
        expect(graphemeByName('alef')?.folder_id).toBeNull();
    });

    it('selection mode (the grapheme picker) is flat — no folder chrome', async () => {
        graphemeFolderApi.create({ name: 'GroupOne', parent_id: null });
        const glyphId = seedGlyphId();
        seedGrapheme('bet', glyphId, null);
        await mountAt('/', true);

        expect(button('All folders')).toBeFalsy();
        expect(button('All graphemes')).toBeFalsy();
        expect(button('Browse folders')).toBeFalsy();
        expect(hasText('bet')).toBe(true);
    });
});
