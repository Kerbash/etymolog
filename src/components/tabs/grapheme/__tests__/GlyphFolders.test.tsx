// @vitest-environment happy-dom
/**
 * GlyphGallery × folders (Phase 4) — the glyph domain's inline folder tree,
 * driven against the REAL glyph folder domain (sql.js in memory) through the
 * provider-wrapped api, so filing, search-escape, per-card move and
 * delete-reparent are all exercised end to end.
 *
 *  - a glyph filed in a folder shows only under that folder in tree mode (not in
 *    the root grid, and not until the folder is expanded);
 *  - a live search escapes the folder to a flat list over every glyph;
 *  - the per-card "Move to folder" action files a root glyph into a folder;
 *  - deleting a folder REPARENTS its glyphs up (nothing is destroyed).
 *
 * The glyph PICKER (`GlyphPickerModal`) is asserted to have no folder chrome —
 * it composes `EntityGallery` directly, never `DirectoryGallery`, so a chooser
 * stays flat.
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
import { glyphFolderApi } from '../../../../db/api/folderApi';
import type { FolderRecord, GlyphWithUsage } from '../../../../db/types';
import { EtymologProvider } from '../../../../db/context';
import { useEtymolog } from '../../../../db';
import { NotificationProvider } from '../../../shared/notifications/NotificationProvider';
import ConfirmDialogProvider from '../../../shared/confirmDialog/ConfirmDialogProvider';
import GlyphGallery from '../galleryGlyphs/galleryGlyphs';
import GlyphPickerModal from '../../../form/graphemeForm/GlyphPickerModal';

// --------------------------------------------------------------------------
// Harness
// --------------------------------------------------------------------------

let capturedGlyphs: readonly GlyphWithUsage[] = [];
let capturedFolders: readonly FolderRecord[] = [];

function Probe() {
    const { data } = useEtymolog();
    useEffect(() => {
        capturedGlyphs = data.glyphsWithUsage ?? [];
        capturedFolders = data.glyphFolders ?? [];
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
                <GlyphPickerModal isOpen setIsOpen={() => {}} onSelect={() => {}} />
            ) : (
                <GlyphGallery />
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
    const input = document.body.querySelector('input[placeholder="Search glyphs…"]') as HTMLInputElement | null;
    if (!input) throw new Error('search box not found');
    await act(async () => {
        setNativeValue(input, value);
    });
    await settle();
}
const hasText = (text: string) => (document.body.textContent ?? '').includes(text);
const glyphByName = (name: string) => capturedGlyphs.find((g) => g.name === name);
const folderByName = (name: string) => capturedFolders.find((f) => f.name === name);

beforeAll(async () => {
    await initDatabase();
});
beforeEach(() => {
    clearDatabase();
    capturedGlyphs = [];
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

describe('GlyphGallery folder tree (real glyph domain)', () => {
    it('shows a filed glyph only under its folder in tree mode', async () => {
        const marks = glyphFolderApi.create({ name: 'Marks', parent_id: null }).data!;
        etymologApi.glyph.create({ name: 'alpha', svg_data: '<svg/>', folder_id: marks.id });
        etymologApi.glyph.create({ name: 'beta', svg_data: '<svg/>' });
        await mountAt('/');

        // Root focus: the root glyph shows, the folder is collapsed so its glyph
        // is not on screen yet.
        expect(hasText('beta')).toBe(true);
        expect(hasText('Marks')).toBe(true);
        expect(hasText('alpha')).toBe(false);

        // Expanding the folder reveals its glyph.
        await click(button('Expand folder Marks'));
        expect(hasText('alpha')).toBe(true);
    });

    it('escapes the folder to a flat list for a live search', async () => {
        const marks = glyphFolderApi.create({ name: 'Marks', parent_id: null }).data!;
        etymologApi.glyph.create({ name: 'alpha', svg_data: '<svg/>', folder_id: marks.id });
        etymologApi.glyph.create({ name: 'beta', svg_data: '<svg/>' });
        await mountAt('/');

        // 'alpha' is filed in a collapsed folder; searching for it must find it
        // flat, without ever expanding the folder.
        await typeSearch('alpha');
        expect(hasText('alpha')).toBe(true);
        expect(button('All folders')).toBeFalsy();
    });

    it('files a root glyph into a folder from the per-card Move action', async () => {
        const marks = glyphFolderApi.create({ name: 'Marks', parent_id: null }).data!;
        etymologApi.glyph.create({ name: 'beta', svg_data: '<svg/>' });
        await mountAt('/');

        await click(button('Move beta to folder'));
        const select = document.body.querySelector('select') as HTMLSelectElement | null;
        if (!select) throw new Error('destination select not open');
        await act(async () => {
            setNativeValue(select, String(marks.id));
        });
        await settle();
        await click(button('Move'));

        expect(glyphByName('beta')?.folder_id).toBe(marks.id);
    });

    it('reparents a folder\'s glyphs up when the folder is deleted (nothing destroyed)', async () => {
        const marks = glyphFolderApi.create({ name: 'Marks', parent_id: null }).data!;
        etymologApi.glyph.create({ name: 'alpha', svg_data: '<svg/>', folder_id: marks.id });
        await mountAt('/');

        await click(button('Delete folder Marks'));
        const confirmBtn = document.body.querySelector('[data-confirmation-action="confirm"]');
        await click(confirmBtn);

        expect(folderByName('Marks')).toBeFalsy();
        // The glyph survived and moved up to the root.
        expect(glyphByName('alpha')).toBeTruthy();
        expect(glyphByName('alpha')?.folder_id).toBeNull();
    });

    it('the glyph picker has no folder chrome (always flat)', async () => {
        glyphFolderApi.create({ name: 'Marks', parent_id: null });
        etymologApi.glyph.create({ name: 'beta', svg_data: '<svg/>' });
        await mountAt('/', true);

        expect(button('All folders')).toBeFalsy();
        expect(button('All glyphs')).toBeFalsy();
        expect(button('Browse folders')).toBeFalsy();
        // The glyph is still choosable.
        expect(hasText('beta')).toBe(true);
    });
});
