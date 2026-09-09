/**
 * Folder-mutation PERSISTENCE wiring tests (tree-explorer epic, P1 fix)
 * --------------------------------------------------------------------
 * A folder mutation writes to the in-memory sql.js database AND must schedule a
 * durable save, or the change is silently lost on the next reload while the
 * persistence indicator still reads "Saved". The dirty-mark is triggered by
 * `withTransaction()` (it calls `schedulePersist()` on its outermost commit);
 * a bare `db.run(...)` does NOT schedule anything.
 *
 * `createFolder` and `deleteFolder` wrapped their writes and persisted; the
 * three SINGLE-statement writes — `renameFolder`/`updateFolder`, `moveFolder`
 * and `setItemFolder` — did not, so filing an item into a folder, renaming a
 * folder and moving a folder never survived a reload (the bug was inherited
 * verbatim from the original lexicon-only `folderService.ts`, so the v7
 * word-move was already broken). This suite asserts, for ALL THREE domains,
 * that every folder-namespace mutation marks the database dirty on success,
 * exactly the way `createGlyph` (see `persistence.test.ts`) does — plus an
 * integration check that a filed item survives a full save→reload round-trip.
 *
 * The wiring assertion mirrors `persistence.test.ts`: a memory adapter, and the
 * scheduler's observable `getPersistenceState()` / `flushPersist()` API.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

import {
    initDatabase,
    clearDatabase,
    exportDatabaseBytes,
    createDetachedDatabase,
    createLexicon,
    createGlyph,
    createGrapheme,
} from '../index';
import { PERSISTED_SCHEMA_VERSION } from '../database';
import {
    configurePersistence,
    flushPersist,
    getPersistenceState,
    resetPersistenceForTests,
    createMemoryAdapter,
    type MemoryAdapter,
} from '../persistence';
import {
    lexiconFolderDomain,
    glyphFolderDomain,
    graphemeFolderDomain,
    type FolderDomain,
} from '../folderDomain';

function useMemoryAdapter(): MemoryAdapter {
    const adapter = createMemoryAdapter();
    configurePersistence({
        adapter,
        exportBytes: exportDatabaseBytes,
        schemaVersion: PERSISTED_SCHEMA_VERSION,
    });
    return adapter;
}

/** Per-domain hooks: create an item (optionally filed) and its table/column. */
interface DomainHarness {
    name: string;
    domain: FolderDomain;
    createItem(folderId?: number | null): number;
}

const HARNESSES: DomainHarness[] = [
    {
        name: 'lexicon',
        domain: lexiconFolderDomain,
        createItem: folderId => createLexicon({ lemma: 'w', folder_id: folderId ?? null }).id,
    },
    {
        name: 'glyph',
        domain: glyphFolderDomain,
        createItem: folderId => createGlyph({ name: 'g', svg_data: '<svg/>', folder_id: folderId ?? null }).id,
    },
    {
        name: 'grapheme',
        domain: graphemeFolderDomain,
        createItem(folderId) {
            const glyph = createGlyph({ name: 'gforgr', svg_data: '<svg/>' });
            return createGrapheme({
                name: 'gr',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                folder_id: folderId ?? null,
            }).id;
        },
    },
];

describe.each(HARNESSES)('folder persistence wiring: $name', ({ domain, createItem }) => {
    const { itemTable, itemFolderColumn } = domain.config;
    const { createFolder, renameFolder, updateFolder, moveFolder, deleteFolder, setItemFolder } = domain;

    let adapter: MemoryAdapter;

    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
        resetPersistenceForTests();
        vi.useFakeTimers();
        adapter = useMemoryAdapter();
    });

    afterEach(() => {
        vi.useRealTimers();
        resetPersistenceForTests();
    });

    /**
     * Persist any dirtiness the setup produced (creating folders/items schedules
     * a save of its own), so the assertion isolates the mutation under test.
     */
    async function settle(): Promise<void> {
        await flushPersist();
        expect(getPersistenceState().dirty).toBe(false);
    }

    /** After a successful mutation the scheduler must be armed to save. */
    function expectScheduled(): void {
        const s = getPersistenceState();
        expect(s.dirty).toBe(true);
        expect(s.status).toBe('pending');
    }

    it('createFolder marks the database dirty', async () => {
        await settle();
        createFolder({ name: 'Nouns' });
        expectScheduled();
    });

    it('renameFolder marks the database dirty', async () => {
        const folder = createFolder({ name: 'old' });
        await settle();
        renameFolder(folder.id, 'new');
        expectScheduled();
    });

    it('updateFolder (reorder) marks the database dirty', async () => {
        const folder = createFolder({ name: 'f' });
        await settle();
        updateFolder(folder.id, { position: 5 });
        expectScheduled();
    });

    it('moveFolder marks the database dirty', async () => {
        const a = createFolder({ name: 'A' });
        const b = createFolder({ name: 'B' });
        await settle();
        moveFolder(b.id, a.id);
        expectScheduled();
    });

    it('deleteFolder marks the database dirty', async () => {
        const folder = createFolder({ name: 'gone' });
        await settle();
        deleteFolder(folder.id);
        expectScheduled();
    });

    it('setItemFolder marks the database dirty (the reported P1)', async () => {
        const folder = createFolder({ name: 'Home' });
        const item = createItem();
        await settle();
        setItemFolder(item, folder.id);
        expectScheduled();
    });

    it('setItemFolder → save → reload from saved bytes: the membership survives', async () => {
        const folder = createFolder({ name: 'Home' });
        const item = createItem();
        setItemFolder(item, folder.id);

        // Simulate the durable-save path the shell drives on debounce/unload.
        await flushPersist();
        expect(adapter.saveCount).toBeGreaterThan(0);

        // Open a NEW database from the bytes the scheduler ACTUALLY wrote to the
        // backend — exactly what a hard reload does when it loads the snapshot.
        const stored = await adapter.load();
        expect(stored).not.toBeNull();
        const reloaded = await createDetachedDatabase(stored!.bytes);
        try {
            const rows = reloaded.exec(
                `SELECT ${itemFolderColumn} FROM ${itemTable} WHERE id = ${item}`,
            );
            expect(rows[0].values[0][0]).toBe(folder.id);
        } finally {
            reloaded.close();
        }
    });
});
