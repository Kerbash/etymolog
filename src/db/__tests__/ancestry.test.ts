/**
 * Ancestry mapping + tree tests
 *
 * The ancestor/descendant queries used to select columns in a different
 * order than the positional row mapper expected, so every ancestor came back
 * with a datetime in `glyph_order` and a position in `created_at`. Rows are
 * now mapped by column name; these tests pin the field contents.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase } from '../database';
import { createGlyph } from '../glyphService';
import { createGrapheme } from '../graphemeService';
import {
    createLexicon,
    getAncestorsByLexiconId,
    getDescendantsByLexiconId,
    getLexiconComplete,
    getAllLexiconComplete,
    getFullAncestryTree,
    deleteLexicon,
    getAllDescendantIds,
    getAllAncestorIds,
    wouldCreateCycle,
} from '../lexiconService';
import { createGraphemeEntry } from '../utils/spellingUtils';

describe('ancestry row mapping', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    function makeGrapheme(name: string) {
        const glyph = createGlyph({ name: `${name}-glyph`, svg_data: '<svg/>' });
        return createGrapheme({ name, glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [{ phoneme: name, use_in_auto_spelling: true }] });
    }

    it('ancestors carry their real glyph_order, flags and timestamps', () => {
        const ka = makeGrapheme('ka');
        const root = createLexicon({ lemma: 'root', pronunciation: 'ka', glyph_order: [createGraphemeEntry(ka.id)], auto_spell: false });
        const child = createLexicon({ lemma: 'child', ancestry: [{ ancestor_id: root.id, position: 3, ancestry_type: 'borrowed' }] });

        const [entry] = getAncestorsByLexiconId(child.id);
        expect(entry.position).toBe(3);
        expect(entry.ancestry_type).toBe('borrowed');
        expect(entry.ancestor.id).toBe(root.id);
        expect(entry.ancestor.glyph_order).toBe(JSON.stringify([createGraphemeEntry(ka.id)]));
        expect(entry.ancestor.auto_spell).toBe(false);
        expect(entry.ancestor.needs_attention).toBe(false);
        expect(entry.ancestor.created_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
        expect(entry.ancestor.updated_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
    });

    it('descendants carry their real fields too', () => {
        const root = createLexicon({ lemma: 'root' });
        const child = createLexicon({ lemma: 'child', pronunciation: 'tʃaɪld', ancestry: [{ ancestor_id: root.id, position: 0, ancestry_type: 'compound' }] });

        const [entry] = getDescendantsByLexiconId(root.id);
        expect(entry.ancestry_type).toBe('compound');
        expect(entry.descendant.id).toBe(child.id);
        expect(entry.descendant.pronunciation).toBe('tʃaɪld');
        expect(entry.descendant.glyph_order).toBe('[]');
        expect(entry.descendant.updated_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
    });

    it('getLexiconComplete and getAllLexiconComplete agree on ancestors and descendants', () => {
        const ka = makeGrapheme('ka');
        const root = createLexicon({ lemma: 'root', glyph_order: [createGraphemeEntry(ka.id)] });
        const child = createLexicon({ lemma: 'child', ancestry: [{ ancestor_id: root.id, position: 0 }] });

        const single = getLexiconComplete(child.id)!;
        const all = getAllLexiconComplete();
        const fromAll = all.find(e => e.id === child.id)!;
        expect(fromAll.ancestors).toEqual(single.ancestors);
        expect(all.find(e => e.id === root.id)!.descendants).toEqual(getLexiconComplete(root.id)!.descendants);
        // The ancestor's own spelling is resolvable (was always [] before the fix)
        expect(single.ancestors[0].ancestor.glyph_order).toContain(`grapheme-${ka.id}`);
        expect(fromAll.spellingDisplay).toEqual([]);
        expect(all.find(e => e.id === root.id)!.spellingDisplay[0].grapheme?.id).toBe(ka.id);
    });

    it('renders a diamond ancestry under both branches', () => {
        const grand = createLexicon({ lemma: 'grand' });
        const left = createLexicon({ lemma: 'left', ancestry: [{ ancestor_id: grand.id, position: 0 }] });
        const right = createLexicon({ lemma: 'right', ancestry: [{ ancestor_id: grand.id, position: 0 }] });
        const word = createLexicon({ lemma: 'word', ancestry: [{ ancestor_id: left.id, position: 0 }, { ancestor_id: right.id, position: 1 }] });

        const tree = getFullAncestryTree(word.id);
        expect(tree.ancestors.map(a => a.entry.lemma)).toEqual(['left', 'right']);
        expect(tree.ancestors[0].ancestors[0].entry.lemma).toBe('grand');
        expect(tree.ancestors[1].ancestors[0].entry.lemma).toBe('grand');
        expect(tree.ancestors[1].ancestors[0].truncated).toBeUndefined();
    });

    it('marks depth-limited nodes as truncated instead of passing them off as roots', () => {
        const a = createLexicon({ lemma: 'a' });
        const b = createLexicon({ lemma: 'b', ancestry: [{ ancestor_id: a.id, position: 0 }] });
        const c = createLexicon({ lemma: 'c', ancestry: [{ ancestor_id: b.id, position: 0 }] });

        const tree = getFullAncestryTree(c.id, 1);
        expect(tree.ancestors[0].entry.lemma).toBe('b');
        expect(tree.ancestors[0].truncated).toBe(true);
        expect(tree.ancestors[0].ancestors).toEqual([]);
        expect(getFullAncestryTree(c.id).ancestors[0].ancestors[0].entry.lemma).toBe('a');
    });

    it('deleting a middle word leaves no stale transitive closure paths', () => {
        const a = createLexicon({ lemma: 'a' });
        const b = createLexicon({ lemma: 'b', ancestry: [{ ancestor_id: a.id, position: 0 }] });
        const c = createLexicon({ lemma: 'c', ancestry: [{ ancestor_id: b.id, position: 0 }] });
        expect(getAllDescendantIds(a.id).sort()).toEqual([b.id, c.id].sort());

        deleteLexicon(b.id);

        expect(getAllDescendantIds(a.id)).toEqual([]);
        expect(getAllAncestorIds(c.id)).toEqual([]);
        // c → a is now a legitimate derivation (was a false-positive cycle before)
        expect(wouldCreateCycle(c.id, a.id)).toBe(false);
    });
});
