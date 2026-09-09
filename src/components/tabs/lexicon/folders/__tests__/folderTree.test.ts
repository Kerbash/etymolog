/**
 * folderTree pure helpers (Phase 5b, UC-D). No DOM — just the tree derivations
 * the gallery breadcrumb and the picker <select> are built from.
 */

import { describe, it, expect } from 'vitest';

import type { LexiconFolder } from '../../../../../db/types';
import { buildFolderOptions, childFolders, folderPath } from '../folderTree';

function folder(id: number, name: string, parentId: number | null, position = 0): LexiconFolder {
    return { id, name, parent_id: parentId, position, created_at: '', updated_at: '' };
}

// Nouns > People > Gods ; Nouns > Places ; Verbs (root)
const TREE: LexiconFolder[] = [
    folder(1, 'Nouns', null, 0),
    folder(2, 'People', 1, 0),
    folder(3, 'Gods', 2, 0),
    folder(4, 'Places', 1, 1),
    folder(5, 'Verbs', null, 1),
];

describe('childFolders', () => {
    it('lists the direct children of a level, in position order', () => {
        expect(childFolders(TREE, null).map((f) => f.name)).toEqual(['Nouns', 'Verbs']);
        expect(childFolders(TREE, 1).map((f) => f.name)).toEqual(['People', 'Places']);
        expect(childFolders(TREE, 3)).toEqual([]);
    });
});

describe('folderPath', () => {
    it('walks root → folder for the breadcrumb', () => {
        expect(folderPath(TREE, 3).map((f) => f.name)).toEqual(['Nouns', 'People', 'Gods']);
    });
    it('is empty at the root level', () => {
        expect(folderPath(TREE, null)).toEqual([]);
    });
    it('is empty for an unknown id', () => {
        expect(folderPath(TREE, 999)).toEqual([]);
    });
    it('terminates on a corrupt cycle rather than hanging', () => {
        const cyclic: LexiconFolder[] = [folder(1, 'A', 2), folder(2, 'B', 1)];
        expect(folderPath(cyclic, 1).length).toBeLessThanOrEqual(2);
    });
});

describe('buildFolderOptions', () => {
    it('flattens depth-first with indent-prefixed labels', () => {
        const options = buildFolderOptions(TREE);
        expect(options.map((o) => o.name)).toEqual(['Nouns', 'People', 'Gods', 'Places', 'Verbs']);
        expect(options.find((o) => o.name === 'Gods')?.depth).toBe(2);
        // Depth-2 label carries two indent units ahead of the name.
        expect(options.find((o) => o.name === 'Gods')?.label.endsWith('Gods')).toBe(true);
        expect(options.find((o) => o.name === 'Nouns')?.label).toBe('Nouns');
    });

    it('drops the excluded folder and its whole subtree', () => {
        // Excluding People removes People AND Gods, but keeps Places + the rest.
        const names = buildFolderOptions(TREE, { excludeId: 2 }).map((o) => o.name);
        expect(names).toEqual(['Nouns', 'Places', 'Verbs']);
    });
});
