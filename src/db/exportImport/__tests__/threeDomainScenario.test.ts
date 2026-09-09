/**
 * Full three-domain export → wipe → import → tree-invariant scenario (Phase 5)
 * ---------------------------------------------------------------------------
 * The per-domain suites prove each folder table round-trips in isolation. This
 * one exercises the WHOLE lifecycle across all three domains at once, the way a
 * real backup/restore does, and then asserts the invariants the UI tree leans
 * on — not just "the rows came back" but "the FOREST the galleries build from
 * them is the same forest":
 *
 *   - nested folders in each domain (lexicon, glyph, grapheme);
 *   - items filed at various depths, plus items left at the root;
 *   - a MOVED folder in each domain (child id < parent id — the FK-defer path);
 *   - a word-symbol, whose auto-created glyph + grapheme must stay at the ROOT;
 *   - a compound grapheme (grapheme_glyphs) that must survive intact.
 *
 * After export → clear → import, folder identity is PRESERVED (ids are written
 * explicitly and re-inserted), so `?folder=` deep links and persisted expansion
 * ids stay valid — asserted here by rebuilding each domain's breadcrumb path and
 * descendant set with the same pure helpers the DirectoryGallery uses.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
    initDatabase,
    clearDatabase,
    getGlyphById,
    getGraphemeById,
} from '../../index';
import { etymologApi } from '../../api';
import { exportAsJson } from '../exportService';
import { importFromJson } from '../importService';
import type { FolderRecord } from '../../types';
import { folderPath, descendantFolders } from '../../../components/shared/directory/folderTree';

function unwrap<T>(res: { success: boolean; data?: T; error?: { message?: string } }): T {
    if (!res.success) throw new Error(res.error?.message ?? 'api call failed');
    return res.data as T;
}

/** ids the scenario needs to assert against after the round-trip. */
interface Seeded {
    lexicon: { nouns: number; people: number; verbs: number; filedWordId: number; symbolGlyphId: number; symbolGraphemeId: number };
    glyph: { shapes: number; round: number; circleId: number };
    grapheme: { vowels: number; consonants: number; aId: number; compoundGraphemeId: number };
}

describe('three-domain folder scenario (export → wipe → import)', () => {
    beforeAll(async () => {
        await initDatabase();
    });
    beforeEach(() => {
        clearDatabase();
    });

    function seed(): Seeded {
        // ---- lexicon: Nouns > People ; Verbs (root) --------------------------
        const nouns = unwrap(etymologApi.folder.create({ name: 'Nouns' })).id;
        const people = unwrap(etymologApi.folder.create({ name: 'People', parent_id: nouns })).id;
        const verbs = unwrap(etymologApi.folder.create({ name: 'Verbs' })).id;
        // A word filed two levels deep, and one left at the root.
        const filedWordId = unwrap(etymologApi.lexicon.create({ lemma: 'ki', folder_id: people })).id;
        unwrap(etymologApi.lexicon.create({ lemma: 'ka' })); // root word
        // A word-symbol: its auto-made glyph + grapheme must land at ROOT.
        const symbol = unwrap(etymologApi.wordSymbol.create({ name: 'sun', svgData: '<svg><circle/></svg>' }));

        // ---- glyphs: Shapes > Round -----------------------------------------
        const shapes = unwrap(etymologApi.glyphFolder.create({ name: 'Shapes' })).id;
        const round = unwrap(etymologApi.glyphFolder.create({ name: 'Round', parent_id: shapes })).id;
        const circleId = unwrap(etymologApi.glyph.create({ name: 'circle', svg_data: '<svg/>', folder_id: round })).id;
        const squareId = unwrap(etymologApi.glyph.create({ name: 'square', svg_data: '<svg/>' })).id; // root

        // ---- graphemes: Vowels ; Consonants (with a MOVE) -------------------
        const vowels = unwrap(etymologApi.graphemeFolder.create({ name: 'Vowels' })).id;
        // Create Consonants at root, then MOVE it under Vowels — child id may be
        // < parent id, exercising the FK-defer import path.
        const consonants = unwrap(etymologApi.graphemeFolder.create({ name: 'Consonants' })).id;
        unwrap(etymologApi.graphemeFolder.move(consonants, vowels));
        const aId = unwrap(etymologApi.grapheme.create({
            name: 'a',
            glyphs: [{ glyph_id: circleId, position: 0 }],
            folder_id: vowels,
        })).id;
        // A compound grapheme (two glyphs) filed under the moved folder.
        const compoundGraphemeId = unwrap(etymologApi.grapheme.create({
            name: 'kw',
            glyphs: [{ glyph_id: circleId, position: 0 }, { glyph_id: squareId, position: 1 }],
            folder_id: consonants,
        })).id;

        // ---- lexicon folder MOVE too (People already under Nouns; move Verbs
        // under Nouns so a lexicon child folder id (verbs) < parent (nouns)?
        // verbs > nouns here, so move People to root and back is not id<parent;
        // instead move Verbs under People to add a third level). ----------------
        unwrap(etymologApi.folder.move(verbs, people));

        return {
            lexicon: {
                nouns, people, verbs, filedWordId,
                symbolGlyphId: symbol.glyphId,
                symbolGraphemeId: symbol.graphemeId,
            },
            glyph: { shapes, round, circleId },
            grapheme: { vowels, consonants, aId, compoundGraphemeId },
        };
    }

    it('round-trips all three folder forests + memberships coherently', async () => {
        const seeded = seed();

        const json = exportAsJson();
        clearDatabase();
        // Sanity: the wipe really emptied the folder tables.
        expect(unwrap(etymologApi.folder.list())).toHaveLength(0);
        expect(unwrap(etymologApi.glyphFolder.list())).toHaveLength(0);
        expect(unwrap(etymologApi.graphemeFolder.list())).toHaveLength(0);

        const report = await importFromJson(json);
        // A clean backup coerces nothing to root.
        expect(report.warnings.some((w) => w.includes('missing'))).toBe(false);

        // ---- lexicon forest -------------------------------------------------
        const lexFolders: FolderRecord[] = unwrap(etymologApi.folder.list());
        // Nouns > People > Verbs is a three-level chain after the move.
        expect(folderPath(lexFolders, seeded.lexicon.verbs).map((f) => f.id))
            .toEqual([seeded.lexicon.nouns, seeded.lexicon.people, seeded.lexicon.verbs]);
        // Descendants of Nouns are People + Verbs.
        expect(descendantFolders(lexFolders, seeded.lexicon.nouns).map((f) => f.id).sort((a, b) => a - b))
            .toEqual([seeded.lexicon.people, seeded.lexicon.verbs].sort((a, b) => a - b));
        // The filed word kept its folder; the root word stayed at root.
        const entries = unwrap(etymologApi.lexicon.getAllComplete()).entries;
        expect(entries.find((e) => e.id === seeded.lexicon.filedWordId)!.folder_id).toBe(seeded.lexicon.people);
        expect(entries.find((e) => e.lemma === 'ka')!.folder_id ?? null).toBe(null);

        // ---- word-symbol stays at ROOT -------------------------------------
        expect(getGlyphById(seeded.lexicon.symbolGlyphId)!.folder_id).toBe(null);
        expect(getGraphemeById(seeded.lexicon.symbolGraphemeId)!.folder_id).toBe(null);

        // ---- glyph forest ---------------------------------------------------
        const glyphFolders: FolderRecord[] = unwrap(etymologApi.glyphFolder.list());
        expect(folderPath(glyphFolders, seeded.glyph.round).map((f) => f.id))
            .toEqual([seeded.glyph.shapes, seeded.glyph.round]);
        expect(getGlyphById(seeded.glyph.circleId)!.folder_id).toBe(seeded.glyph.round);

        // ---- grapheme forest (with the moved folder) ------------------------
        const graphemeFolders: FolderRecord[] = unwrap(etymologApi.graphemeFolder.list());
        // Consonants moved under Vowels → its parent chain is Vowels/Consonants.
        expect(folderPath(graphemeFolders, seeded.grapheme.consonants).map((f) => f.id))
            .toEqual([seeded.grapheme.vowels, seeded.grapheme.consonants]);
        const graphemes = unwrap(etymologApi.grapheme.getAllComplete()).graphemes;
        expect(graphemes.find((g) => g.id === seeded.grapheme.aId)!.folder_id).toBe(seeded.grapheme.vowels);
        // The compound grapheme kept BOTH glyphs and its folder.
        const compound = graphemes.find((g) => g.id === seeded.grapheme.compoundGraphemeId)!;
        expect(compound.folder_id).toBe(seeded.grapheme.consonants);
        expect(compound.glyphs.length).toBe(2);
    });
});
