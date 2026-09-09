// @vitest-environment happy-dom
/**
 * Create-in-folder — the submit hooks thread `folder_id` into the create call
 * (Phase 4). The galleries' "New glyph/grapheme" CTA carries the focused folder
 * as `?folder=`, the create routes validate it and hand it to the submit hook,
 * and the hook must pass it to `api.glyph.create` / `api.grapheme.create` so the
 * new row lands filed in that folder.
 *
 * The database is real (sql.js) and the api is the provider-wrapped one, so this
 * proves the hook → api → row chain end to end. The `?folder=` READ + validation
 * that the create routes do is covered separately in `createInFolderRoute`.
 *
 * The word-symbol path is re-asserted here (it is also covered at the API layer
 * in Phase 1) because the galleries now show folders: an auto-created symbol
 * glyph/grapheme must stay at ROOT — folder ids do not translate across domains.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, type ReactNode } from 'react';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { clearDatabase, initDatabase } from '../../../../db/database';
import { etymologApi } from '../../../../db/api';
import { glyphFolderApi, graphemeFolderApi } from '../../../../db/api/folderApi';
import type { Glyph } from '../../../../db/types';
import { EtymologProvider } from '../../../../db/context';
import { NotificationProvider } from '../../../shared/notifications/NotificationProvider';
import { useGlyphSubmit } from '../../../form/glyphForm';
import { useGraphemeSubmit } from '../../../form/graphemeForm';

// --------------------------------------------------------------------------
// Harnesses that expose the hook's submit function to the test
// --------------------------------------------------------------------------

let glyphSubmit: ((data: Record<string, unknown>) => Promise<{ success: boolean }>) | null = null;
function GlyphHarness({ folderId, onGlyph }: { folderId: number | null; onGlyph: (g: Glyph) => void }) {
    const submit = useGlyphSubmit({ mode: 'create', folderId, onSuccess: onGlyph });
    useEffect(() => {
        glyphSubmit = submit;
    });
    return null;
}

let graphemeSubmit: ((data: Record<string, unknown>) => Promise<{ success: boolean }>) | null = null;
function GraphemeHarness({
    folderId,
    glyph,
    onId,
}: {
    folderId: number | null;
    glyph: Glyph;
    onId: (id: number) => void;
}) {
    const submit = useGraphemeSubmit({ mode: 'create', glyphs: [glyph], folderId, onSuccess: onId });
    useEffect(() => {
        graphemeSubmit = submit;
    });
    return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(ui: ReactNode) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <EtymologProvider>
                <NotificationProvider>{ui}</NotificationProvider>
            </EtymologProvider>,
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

beforeAll(async () => {
    await initDatabase();
});
beforeEach(() => {
    clearDatabase();
    glyphSubmit = null;
    graphemeSubmit = null;
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

describe('create-in-folder (submit hook → api → row)', () => {
    it('files a new glyph into the passed folder', async () => {
        const folder = glyphFolderApi.create({ name: 'Marks', parent_id: null }).data!;
        let created: Glyph | null = null;
        await mount(<GlyphHarness folderId={folder.id} onGlyph={(g) => { created = g; }} />);

        await act(async () => {
            await glyphSubmit!({ glyphName: 'alpha', glyphSvg: '<svg/>' });
        });

        expect((created as Glyph | null)?.folder_id).toBe(folder.id);
    });

    it('files a new glyph at ROOT when no folder is passed', async () => {
        let created: Glyph | null = null;
        await mount(<GlyphHarness folderId={null} onGlyph={(g) => { created = g; }} />);

        await act(async () => {
            await glyphSubmit!({ glyphName: 'beta', glyphSvg: '<svg/>' });
        });

        expect((created as Glyph | null)?.folder_id).toBeNull();
    });

    it('files a new grapheme into the passed folder', async () => {
        const folder = graphemeFolderApi.create({ name: 'Vowels', parent_id: null }).data!;
        const glyph = etymologApi.glyph.create({ name: 'g', svg_data: '<svg/>' }).data!;
        let graphemeId = 0;
        await mount(<GraphemeHarness folderId={folder.id} glyph={glyph} onId={(id) => { graphemeId = id; }} />);

        await act(async () => {
            await graphemeSubmit!({ graphemeName: 'A', pronunciations: [] });
        });

        const grapheme = etymologApi.grapheme.getById(graphemeId).data;
        expect(grapheme?.folder_id).toBe(folder.id);
    });

    it('leaves the word-symbol auto-created glyph + grapheme at ROOT', async () => {
        // A word symbol creates a glyph AND a grapheme; both must stay unfiled —
        // folder ids do not translate across the glyph and grapheme domains.
        const res = etymologApi.wordSymbol.create({ name: 'Sun', svgData: '<svg/>' });
        expect(res.success).toBe(true);
        expect(etymologApi.glyph.getById(res.data!.glyphId).data?.folder_id).toBeNull();
        expect(etymologApi.grapheme.getById(res.data!.graphemeId).data?.folder_id).toBeNull();
    });
});
