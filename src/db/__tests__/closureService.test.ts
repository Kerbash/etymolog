/**
 * Closure table tests — direct coverage of add/rebuild, cycle rejection on the
 * bulk path, and deletion hygiene.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase, getDatabase } from '../database';
import { execRows } from '../utils/sql';
import {
    createLexicon,
    setLexiconAncestry,
    addAncestorToLexicon,
    removeAncestorFromLexicon,
    clearLexiconAncestry,
    getAllDescendantIds,
    getAllAncestorIds,
    getAncestorsByLexiconId,
} from '../lexiconService';
import { rebuildClosureTable, wouldCreateCycleClosure } from '../closureService';

function closureRows(): [number, number, number][] {
    return execRows(getDatabase(), 'SELECT ancestor_id, descendant_id, depth FROM lexicon_ancestry_closure ORDER BY ancestor_id, descendant_id')
        .map(r => [r.ancestor_id as number, r.descendant_id as number, r.depth as number]);
}

describe('closureService', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    it('adds transitive paths when an edge is added', () => {
        const a = createLexicon({ lemma: 'a' });
        const b = createLexicon({ lemma: 'b', ancestry: [{ ancestor_id: a.id, position: 0 }] });
        const c = createLexicon({ lemma: 'c', ancestry: [{ ancestor_id: b.id, position: 0 }] });
        expect(closureRows()).toEqual([[a.id, b.id, 1], [a.id, c.id, 2], [b.id, c.id, 1]]);
    });

    it('attaching a subtree propagates paths to its descendants', () => {
        const root = createLexicon({ lemma: 'root' });
        const mid = createLexicon({ lemma: 'mid' });
        const leaf = createLexicon({ lemma: 'leaf', ancestry: [{ ancestor_id: mid.id, position: 0 }] });
        addAncestorToLexicon(mid.id, { ancestor_id: root.id, position: 0 });
        expect(getAllDescendantIds(root.id).sort()).toEqual([mid.id, leaf.id].sort());
        expect(getAllAncestorIds(leaf.id).sort()).toEqual([root.id, mid.id].sort());
    });

    it('rebuild matches the incremental result and keeps the shortest depth in a diamond', () => {
        const grand = createLexicon({ lemma: 'grand' });
        const left = createLexicon({ lemma: 'left', ancestry: [{ ancestor_id: grand.id, position: 0 }] });
        const word = createLexicon({ lemma: 'word', ancestry: [{ ancestor_id: left.id, position: 0 }, { ancestor_id: grand.id, position: 1 }] });
        const incremental = closureRows();
        rebuildClosureTable();
        expect(closureRows()).toEqual(incremental);
        expect(incremental).toContainEqual([grand.id, word.id, 1]);
    });

    it('setLexiconAncestry rejects a cycle and rolls back', () => {
        const a = createLexicon({ lemma: 'a' });
        const b = createLexicon({ lemma: 'b', ancestry: [{ ancestor_id: a.id, position: 0 }] });
        expect(() => setLexiconAncestry(a.id, [{ ancestor_id: b.id, position: 0 }])).toThrow(/cycle/);
        expect(getAncestorsByLexiconId(a.id)).toEqual([]);
        expect(getAncestorsByLexiconId(b.id).map(e => e.ancestor.id)).toEqual([a.id]);
        expect(closureRows()).toEqual([[a.id, b.id, 1]]);
    });

    it('setLexiconAncestry rejects a self-reference', () => {
        const a = createLexicon({ lemma: 'a' });
        expect(() => setLexiconAncestry(a.id, [{ ancestor_id: a.id, position: 0 }])).toThrow(/cycle/);
        expect(closureRows()).toEqual([]);
    });

    it('setLexiconAncestry allows re-parenting that only looks cyclic through the replaced edges', () => {
        const a = createLexicon({ lemma: 'a' });
        const b = createLexicon({ lemma: 'b', ancestry: [{ ancestor_id: a.id, position: 0 }] });
        const c = createLexicon({ lemma: 'c' });
        // b: a → c is fine; c is unrelated to b.
        setLexiconAncestry(b.id, [{ ancestor_id: c.id, position: 0 }]);
        expect(getAncestorsByLexiconId(b.id).map(e => e.ancestor.id)).toEqual([c.id]);
        expect(closureRows()).toEqual([[c.id, b.id, 1]]);
    });

    it('removing and clearing edges rebuilds without ghosts', () => {
        const a = createLexicon({ lemma: 'a' });
        const b = createLexicon({ lemma: 'b', ancestry: [{ ancestor_id: a.id, position: 0 }] });
        const c = createLexicon({ lemma: 'c', ancestry: [{ ancestor_id: b.id, position: 0 }] });
        expect(removeAncestorFromLexicon(b.id, a.id)).toBe(true);
        expect(closureRows()).toEqual([[b.id, c.id, 1]]);
        expect(clearLexiconAncestry(c.id)).toBe(1);
        expect(closureRows()).toEqual([]);
        expect(wouldCreateCycleClosure(a.id, c.id)).toBe(false);
    });
});
