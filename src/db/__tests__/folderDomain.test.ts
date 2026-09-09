/**
 * Folder Domain Engine Tests (tree-explorer epic, Phase 1)
 * -------------------------------------------------------
 * The shared `createFolderDomain` engine now drives THREE domains — lexicon
 * words (v7), glyphs and graphemes (v8). This suite parameterizes the folder
 * danger zones over all three via `describe.each`, so the cycle guard, depth
 * cap (incl. subtree-height moves), reparent-on-delete, and item filing are
 * proven identical for every domain rather than only for lexicon.
 *
 * `folderService.test.ts` keeps testing the lexicon re-export shims + the
 * folderApi envelope; this file exercises the engine instances directly.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import {
    initDatabase,
    clearDatabase,
    createLexicon,
    getLexiconById,
    createGlyph,
    getGlyphById,
    createGrapheme,
    getGraphemeById,
} from '../index';
import {
    MAX_FOLDER_DEPTH,
    lexiconFolderDomain,
    glyphFolderDomain,
    graphemeFolderDomain,
    type FolderDomain,
} from '../folderDomain';

/** Per-domain hooks: create an item (optionally filed) and read its folder_id. */
interface DomainHarness {
    name: string;
    domain: FolderDomain;
    createItem(folderId?: number | null): number;
    itemFolder(id: number): number | null | undefined;
}

const HARNESSES: DomainHarness[] = [
    {
        name: 'lexicon',
        domain: lexiconFolderDomain,
        createItem: folderId => createLexicon({ lemma: 'w', folder_id: folderId ?? null }).id,
        itemFolder: id => getLexiconById(id)!.folder_id,
    },
    {
        name: 'glyph',
        domain: glyphFolderDomain,
        createItem: folderId => createGlyph({ name: 'g', svg_data: '<svg/>', folder_id: folderId ?? null }).id,
        itemFolder: id => getGlyphById(id)!.folder_id,
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
        itemFolder: id => getGraphemeById(id)!.folder_id,
    },
];

describe.each(HARNESSES)('folder domain: $name', ({ domain, createItem, itemFolder }) => {
    const {
        createFolder,
        renameFolder,
        updateFolder,
        moveFolder,
        deleteFolder,
        getAllFolders,
        getFolderById,
        setItemFolder,
        getFolderPath,
        getDescendantFolderIds,
    } = domain;

    /** Build a root→leaf chain of `depth` folders; returns their ids top-down. */
    function makeChain(depth: number): number[] {
        const ids: number[] = [];
        let parent: number | null = null;
        for (let i = 0; i < depth; i++) {
            const folder = createFolder({ name: `level-${i + 1}`, parent_id: parent });
            ids.push(folder.id);
            parent = folder.id;
        }
        return ids;
    }

    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    describe('createFolder', () => {
        it('creates a root folder and a nested one', () => {
            const parent = createFolder({ name: 'Nouns' });
            expect(parent.parent_id).toBe(null);
            const child = createFolder({ name: 'People', parent_id: parent.id });
            expect(child.parent_id).toBe(parent.id);
        });

        it('trims the name and rejects a blank one', () => {
            expect(createFolder({ name: '  Trimmed  ' }).name).toBe('Trimmed');
            expect(() => createFolder({ name: '   ' })).toThrow(/needs a name/);
        });

        it('rejects a name over the length limit', () => {
            expect(() => createFolder({ name: 'x'.repeat(201) })).toThrow(/exceeds maximum length/);
        });

        it('rejects a non-existent parent', () => {
            expect(() => createFolder({ name: 'orphan', parent_id: 999 })).toThrow(/not found/);
        });

        it('enforces the depth cap on create', () => {
            const chain = makeChain(MAX_FOLDER_DEPTH);
            expect(chain).toHaveLength(MAX_FOLDER_DEPTH);
            expect(() => createFolder({ name: 'too-deep', parent_id: chain[chain.length - 1] }))
                .toThrow(/cannot exceed 12 levels/);
        });
    });

    describe('rename / update / ordering / path', () => {
        it('renames and rejects a blank rename', () => {
            const folder = createFolder({ name: 'old' });
            expect(renameFolder(folder.id, 'new').name).toBe('new');
            expect(() => renameFolder(folder.id, '  ')).toThrow(/needs a name/);
            expect(() => renameFolder(999, 'x')).toThrow(/not found/);
        });

        it('updates position and orders by (position, name)', () => {
            const f = createFolder({ name: 'f' });
            expect(updateFolder(f.id, { position: 5 }).position).toBe(5);
            clearDatabase();
            createFolder({ name: 'B', position: 1 });
            createFolder({ name: 'A', position: 0 });
            createFolder({ name: 'C', position: 0 });
            expect(getAllFolders().map(f2 => f2.name)).toEqual(['A', 'C', 'B']);
        });

        it('getFolderPath returns the root→leaf chain', () => {
            const [a, b, c] = makeChain(3);
            expect(getFolderPath(c).map(f => f.id)).toEqual([a, b, c]);
            expect(getFolderPath(a).map(f => f.id)).toEqual([a]);
            expect(getFolderPath(999)).toEqual([]);
        });
    });

    describe('moveFolder (cycle + depth guards)', () => {
        it('moves under a new parent and back to root', () => {
            const a = createFolder({ name: 'A' });
            const b = createFolder({ name: 'B' });
            expect(moveFolder(b.id, a.id).parent_id).toBe(a.id);
            expect(moveFolder(b.id, null).parent_id).toBe(null);
        });

        it('rejects moving into itself or a descendant', () => {
            const [a, , c] = makeChain(3);
            expect(() => moveFolder(a, a)).toThrow(/into itself/);
            expect(() => moveFolder(a, c)).toThrow(/own descendant/);
        });

        it('rejects a move that would exceed the depth cap (accounts for subtree height)', () => {
            const x = createFolder({ name: 'x' });
            const y = createFolder({ name: 'y', parent_id: x.id });
            createFolder({ name: 'z', parent_id: y.id }); // subtree height 3

            const chain = makeChain(MAX_FOLDER_DEPTH); // depths 1..12
            expect(() => moveFolder(x.id, chain[9])).toThrow(/cannot exceed 12 levels/); // 10+3
            expect(moveFolder(x.id, chain[8]).parent_id).toBe(chain[8]); // 9+3 = 12 ok
        });

        it('rejects a move to a non-existent parent', () => {
            const a = createFolder({ name: 'A' });
            expect(() => moveFolder(a.id, 999)).toThrow(/not found/);
        });
    });

    describe('deleteFolder (reparent, never delete an item)', () => {
        it('reparents child folders and items to the deleted folder parent', () => {
            const root = createFolder({ name: 'root' });
            const mid = createFolder({ name: 'mid', parent_id: root.id });
            const leaf = createFolder({ name: 'leaf', parent_id: mid.id });

            const item = createItem(mid.id);
            expect(itemFolder(item)).toBe(mid.id);

            deleteFolder(mid.id);

            expect(getFolderById(mid.id)).toBe(null);
            expect(getFolderById(leaf.id)!.parent_id).toBe(root.id);
            expect(itemFolder(item)).toBe(root.id);
        });

        it('reparents to root when the deleted folder had no parent (item survives)', () => {
            const root = createFolder({ name: 'root' });
            const child = createFolder({ name: 'child', parent_id: root.id });
            const item = createItem(root.id);

            deleteFolder(root.id);

            expect(getFolderById(child.id)!.parent_id).toBe(null);
            expect(itemFolder(item)).toBe(null);
        });

        it('throws on a missing folder', () => {
            expect(() => deleteFolder(999)).toThrow(/not found/);
        });
    });

    describe('setItemFolder', () => {
        it('files an item and clears it back to root', () => {
            const folder = createFolder({ name: 'f' });
            const item = createItem();
            expect(itemFolder(item)).toBe(null);
            setItemFolder(item, folder.id);
            expect(itemFolder(item)).toBe(folder.id);
            setItemFolder(item, null);
            expect(itemFolder(item)).toBe(null);
        });

        it('rejects a missing item or folder', () => {
            const item = createItem();
            expect(() => setItemFolder(999999, null)).toThrow(/not found/);
            expect(() => setItemFolder(item, 999999)).toThrow(/not found/);
        });
    });

    describe('getDescendantFolderIds', () => {
        it('returns every descendant, excluding the folder itself', () => {
            const [a, b, c] = makeChain(3);
            const sibling = createFolder({ name: 'sib', parent_id: a });
            expect(new Set(getDescendantFolderIds(a))).toEqual(new Set([b, c, sibling.id]));
            expect(getDescendantFolderIds(c)).toEqual([]);
        });
    });

    describe('domain isolation', () => {
        it('a folder in this domain does not leak into the other two domains', () => {
            const folder = createFolder({ name: 'here' });
            const others = [lexiconFolderDomain, glyphFolderDomain, graphemeFolderDomain]
                .filter(d => d !== domain);
            for (const other of others) {
                expect(other.getFolderById(folder.id)).toBe(null);
                expect(other.getAllFolders()).toHaveLength(0);
            }
        });
    });
});
