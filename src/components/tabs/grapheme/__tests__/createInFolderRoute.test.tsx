// @vitest-environment happy-dom
/**
 * Create-in-folder ROUTE reading (Phase 4). The glyph and grapheme create pages
 * read `?folder=` and validate it against their OWN folder slice before handing
 * it to the submit hook: a known id threads through, an unknown or non-numeric
 * id falls back to the root (null) rather than a dangling folder_id the api
 * would reject. That the hook then persists the id is covered in
 * `createInFolderLands`.
 *
 * The submit hooks + form fields are mocked so the pages render without the
 * drawing canvas / glyph picker; the mock captures the `folderId` each page
 * computes. Everything else (the provider, the folder slice, the router) is
 * real, so the validation runs against genuinely-loaded folders.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

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

const glyphOptions: Array<{ folderId?: number | null }> = [];
vi.mock('../../../form/glyphForm', () => ({
    GlyphFormFields: () => null,
    useGlyphSubmit: (opts: { folderId?: number | null }) => {
        glyphOptions.push(opts);
        return async () => ({ success: true });
    },
}));

const graphemeOptions: Array<{ folderId?: number | null }> = [];
vi.mock('../../../form/graphemeForm', () => ({
    GraphemeFormFields: () => null,
    useGraphemeSubmit: (opts: { folderId?: number | null }) => {
        graphemeOptions.push(opts);
        return async () => ({ success: true });
    },
}));

import { clearDatabase, initDatabase } from '../../../../db/database';
import { glyphFolderApi, graphemeFolderApi } from '../../../../db/api/folderApi';
import { EtymologProvider } from '../../../../db/context';
import { NotificationProvider } from '../../../shared/notifications/NotificationProvider';
import ConfirmDialogProvider from '../../../shared/confirmDialog/ConfirmDialogProvider';
import { UnsavedChangesRegistry } from '../../../shell';
import { NewGlyphPage } from '../newGlyph';
import { NewGraphemePage } from '../newGrapheme';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(ui: ReactNode, path: string) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <MemoryRouter initialEntries={[path]}>
                <EtymologProvider>
                    <NotificationProvider>
                        <ConfirmDialogProvider>
                            <UnsavedChangesRegistry>{ui}</UnsavedChangesRegistry>
                        </ConfirmDialogProvider>
                    </NotificationProvider>
                </EtymologProvider>
            </MemoryRouter>,
        );
    });
    await settle(10);
}

async function settle(times = 4) {
    for (let i = 0; i < times; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
}

const lastGlyphFolderId = () => glyphOptions[glyphOptions.length - 1]?.folderId ?? null;
const lastGraphemeFolderId = () => graphemeOptions[graphemeOptions.length - 1]?.folderId ?? null;

beforeAll(async () => {
    await initDatabase();
});
beforeEach(() => {
    clearDatabase();
    glyphOptions.length = 0;
    graphemeOptions.length = 0;
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

describe('glyph create route reads ?folder=', () => {
    it('threads a known glyph-folder id to the submit hook', async () => {
        const folder = glyphFolderApi.create({ name: 'Marks', parent_id: null }).data!;
        await mount(<NewGlyphPage />, `/script-maker/glyphs/create?folder=${folder.id}`);
        expect(lastGlyphFolderId()).toBe(folder.id);
    });

    it('falls back to root for an unknown id', async () => {
        glyphFolderApi.create({ name: 'Marks', parent_id: null });
        await mount(<NewGlyphPage />, '/script-maker/glyphs/create?folder=999');
        expect(lastGlyphFolderId()).toBeNull();
    });

    it('falls back to root for a non-numeric id', async () => {
        await mount(<NewGlyphPage />, '/script-maker/glyphs/create?folder=abc');
        expect(lastGlyphFolderId()).toBeNull();
    });
});

describe('grapheme create route reads ?folder=', () => {
    it('threads a known grapheme-folder id to the submit hook', async () => {
        const folder = graphemeFolderApi.create({ name: 'Vowels', parent_id: null }).data!;
        await mount(<NewGraphemePage />, `/script-maker/create?folder=${folder.id}`);
        expect(lastGraphemeFolderId()).toBe(folder.id);
    });

    it('falls back to root for an unknown id', async () => {
        await mount(<NewGraphemePage />, '/script-maker/create?folder=999');
        expect(lastGraphemeFolderId()).toBeNull();
    });

    it('does not confuse a glyph folder for a grapheme folder', async () => {
        // A glyph folder with the same id must NOT validate on the grapheme
        // route — each route validates against its own slice.
        const glyphFolder = glyphFolderApi.create({ name: 'GlyphOnly', parent_id: null }).data!;
        await mount(<NewGraphemePage />, `/script-maker/create?folder=${glyphFolder.id}`);
        expect(lastGraphemeFolderId()).toBeNull();
    });
});
