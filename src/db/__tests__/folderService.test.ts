/**
 * Lexicon Folder Service Tests (Phase 5a, UC-D)
 * ---------------------------------------------
 * Nested folders for lexicon entries. Danger zones pinned here:
 *
 *  - cycle guard: a folder can never move into itself or a descendant;
 *  - depth cap ({@link MAX_FOLDER_DEPTH}) on create AND move (move accounts for
 *    the moved subtree's own height);
 *  - delete REPARENTS child folders + words to the deleted folder's parent
 *    (root when it had none) and NEVER deletes a word;
 *  - setLexiconFolder files/clears a word and validates existence;
 *  - getFolderPath yields the root→leaf breadcrumb chain.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import {
    initDatabase,
    clearDatabase,
    createLexicon,
    getLexiconById,
} from '../index';
import {
    MAX_FOLDER_DEPTH,
    createFolder,
    updateFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    getAllFolders,
    getFolderById,
    setLexiconFolder,
    getFolderPath,
    getDescendantFolderIds,
} from '../folderService';
import { folderApi } from '../api/folderApi';

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

describe('folderService', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    describe('createFolder', () => {
        it('creates a root folder (parent_id null)', () => {
            const folder = createFolder({ name: 'Nouns' });
            expect(folder.id).toBeGreaterThan(0);
            expect(folder.name).toBe('Nouns');
            expect(folder.parent_id).toBe(null);
        });

        it('creates a nested folder under a parent', () => {
            const parent = createFolder({ name: 'Nouns' });
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
            const chain = makeChain(MAX_FOLDER_DEPTH); // depths 1..12
            expect(chain).toHaveLength(MAX_FOLDER_DEPTH);
            // A 13th level is one too deep.
            expect(() => createFolder({ name: 'too-deep', parent_id: chain[chain.length - 1] }))
                .toThrow(/cannot exceed 12 levels/);
        });
    });

    describe('rename / update', () => {
        it('renames a folder', () => {
            const folder = createFolder({ name: 'old' });
            const renamed = renameFolder(folder.id, 'new');
            expect(renamed.name).toBe('new');
            expect(getFolderById(folder.id)!.name).toBe('new');
        });

        it('rejects a blank rename', () => {
            const folder = createFolder({ name: 'keep' });
            expect(() => renameFolder(folder.id, '  ')).toThrow(/needs a name/);
        });

        it('updates position', () => {
            const folder = createFolder({ name: 'f' });
            expect(updateFolder(folder.id, { position: 5 }).position).toBe(5);
        });

        it('throws on a missing folder', () => {
            expect(() => renameFolder(999, 'x')).toThrow(/not found/);
        });
    });

    describe('getAllFolders / ordering', () => {
        it('orders by (position, name)', () => {
            createFolder({ name: 'B', position: 1 });
            createFolder({ name: 'A', position: 0 });
            createFolder({ name: 'C', position: 0 });
            expect(getAllFolders().map(f => f.name)).toEqual(['A', 'C', 'B']);
        });
    });

    describe('getFolderPath (breadcrumb)', () => {
        it('returns the root→leaf chain', () => {
            const [a, b, c] = makeChain(3);
            expect(getFolderPath(c).map(f => f.id)).toEqual([a, b, c]);
            expect(getFolderPath(a).map(f => f.id)).toEqual([a]);
        });

        it('is empty for an unknown folder', () => {
            expect(getFolderPath(999)).toEqual([]);
        });
    });

    describe('moveFolder', () => {
        it('moves a folder under a new parent', () => {
            const a = createFolder({ name: 'A' });
            const b = createFolder({ name: 'B' });
            const moved = moveFolder(b.id, a.id);
            expect(moved.parent_id).toBe(a.id);
        });

        it('moves a folder back to the root (null)', () => {
            const a = createFolder({ name: 'A' });
            const b = createFolder({ name: 'B', parent_id: a.id });
            expect(moveFolder(b.id, null).parent_id).toBe(null);
        });

        it('rejects moving a folder into itself', () => {
            const a = createFolder({ name: 'A' });
            expect(() => moveFolder(a.id, a.id)).toThrow(/into itself/);
        });

        it('rejects moving a folder into its own descendant (cycle guard)', () => {
            const [a, , c] = makeChain(3); // a > b > c
            expect(() => moveFolder(a, c)).toThrow(/own descendant/);
        });

        it('rejects a move that would exceed the depth cap', () => {
            // A three-tall subtree x > y > z (height 3).
            const x = createFolder({ name: 'x' });
            const y = createFolder({ name: 'y', parent_id: x.id });
            createFolder({ name: 'z', parent_id: y.id });

            const chain = makeChain(MAX_FOLDER_DEPTH); // depths 1..12
            // Under the depth-10 folder: 10 + 3 = 13 > 12 → rejected.
            expect(() => moveFolder(x.id, chain[9])).toThrow(/cannot exceed 12 levels/);
            // Under the depth-9 folder: 9 + 3 = 12 → allowed.
            expect(moveFolder(x.id, chain[8]).parent_id).toBe(chain[8]);
        });

        it('rejects a move to a non-existent parent', () => {
            const a = createFolder({ name: 'A' });
            expect(() => moveFolder(a.id, 999)).toThrow(/not found/);
        });
    });

    describe('deleteFolder (reparent, never delete a word)', () => {
        it('reparents child folders and words to the deleted folder parent', () => {
            const root = createFolder({ name: 'root' });
            const mid = createFolder({ name: 'mid', parent_id: root.id });
            const leaf = createFolder({ name: 'leaf', parent_id: mid.id });

            const word = createLexicon({ lemma: 'w', folder_id: mid.id });
            expect(getLexiconById(word.id)!.folder_id).toBe(mid.id);

            deleteFolder(mid.id);

            // Child folder reparented up to `root`; word reparented up to `root`.
            expect(getFolderById(mid.id)).toBe(null);
            expect(getFolderById(leaf.id)!.parent_id).toBe(root.id);
            expect(getLexiconById(word.id)!.folder_id).toBe(root.id);
        });

        it('reparents to the root (null) when the deleted folder had no parent', () => {
            const root = createFolder({ name: 'root' });
            const child = createFolder({ name: 'child', parent_id: root.id });
            const word = createLexicon({ lemma: 'w', folder_id: root.id });

            deleteFolder(root.id);

            expect(getFolderById(child.id)!.parent_id).toBe(null);
            expect(getLexiconById(word.id)!.folder_id).toBe(null);
            // The word still exists — a folder delete NEVER removes a word.
            expect(getLexiconById(word.id)).not.toBe(null);
        });

        it('throws on a missing folder', () => {
            expect(() => deleteFolder(999)).toThrow(/not found/);
        });
    });

    describe('setLexiconFolder', () => {
        it('files a word into a folder and clears it back to root', () => {
            const folder = createFolder({ name: 'f' });
            const word = createLexicon({ lemma: 'w' });
            expect(getLexiconById(word.id)!.folder_id).toBe(null);

            setLexiconFolder(word.id, folder.id);
            expect(getLexiconById(word.id)!.folder_id).toBe(folder.id);

            setLexiconFolder(word.id, null);
            expect(getLexiconById(word.id)!.folder_id).toBe(null);
        });

        it('rejects a missing word or folder', () => {
            const word = createLexicon({ lemma: 'w' });
            expect(() => setLexiconFolder(999, null)).toThrow(/not found/);
            expect(() => setLexiconFolder(word.id, 999)).toThrow(/not found/);
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

    describe('folderApi envelope', () => {
        it('maps validation and not-found errors to codes', () => {
            expect(folderApi.create({ name: '   ' }).error?.code).toBe('VALIDATION_ERROR');
            expect(folderApi.getById(999).error?.code).toBe('NOT_FOUND');

            const a = folderApi.create({ name: 'A' });
            expect(a.success).toBe(true);
            const move = folderApi.move(a.data!.id, a.data!.id);
            expect(move.success).toBe(false);
            expect(move.error?.code).toBe('VALIDATION_ERROR');
        });

        it('creates, lists, moves and deletes through the envelope', () => {
            const parent = folderApi.create({ name: 'parent' });
            const child = folderApi.create({ name: 'child', parent_id: parent.data!.id });
            expect(folderApi.list().data).toHaveLength(2);

            const path = folderApi.getPath(child.data!.id);
            expect(path.data!.map(f => f.name)).toEqual(['parent', 'child']);

            expect(folderApi.delete(parent.data!.id).success).toBe(true);
            // Child reparented to root, not deleted.
            expect(getFolderById(child.data!.id)!.parent_id).toBe(null);
        });
    });
});
