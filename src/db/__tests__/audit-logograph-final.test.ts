/**
 * Final cross-phase adversarial audit — logograph epic (P3–P5)
 * ------------------------------------------------------------
 * Runs the epic's features against each other, the way the earlier
 * per-phase suites do not:
 *
 *  - the feedback scenario end-to-end: pronunciation-less symbol words in a
 *    nested folder, chained into a compound (build-from-ancestors), an
 *    ancestor's symbol re-drawn and reflected in the compound (shared grapheme),
 *    then exported (v2), wiped and re-imported with everything intact and NO
 *    stray needs_attention flags;
 *  - folder × word deletion machinery through the API layer (depth cap, cycle
 *    guard, reparenting delete, move, stale-id getPath);
 *
 * Two DEFECTS this audit found and fixed at the source (regression-guarded here):
 *
 *  1. DEFECT — silent, unflagged `?` spelling (Phase 1 × Phase 3). Deleting a
 *     LOGOGRAM word-symbol grapheme (no phoneme → bare `?` fallback) that an
 *     auto_spell word with NO pronunciation was spelled with left the word
 *     spelled `["?"]` yet UNFLAGGED — and the respell pass, which skips
 *     pronunciation-less words, could never repair it. Phase 1 made
 *     auto_spell + null-pronunciation reachable; the fix flags the stranded
 *     placeholder in `handleGraphemeDeletion`.
 *
 *  2. DEFECT — a stale `?folder=<id>` create (folder deleted after the deep
 *     link was made) reached `lexicon.folder_id`'s foreign key and failed the
 *     whole save with a raw "FOREIGN KEY constraint failed", instead of the
 *     plan's stated "the word simply files at the root". Fixed by coercing a
 *     non-existent folder id to null in `lexiconApi.create`/`update`.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import {
    initDatabase, clearDatabase,
    getGlyphById, getGraphemeComplete, getLexiconById, getGraphemeCount,
    createGraphemeEntry, deserializeGlyphOrder,
} from '../index';
import { lexiconApi } from '../api/lexiconApi';
import { folderApi } from '../api/folderApi';
import { wordSymbolApi } from '../api/wordSymbolApi';
import { graphemeApi } from '../api/graphemeApi';
import { updateWordSymbolDrawing } from '../wordSymbolService';
import { collectExportData } from '../exportImport/jsonCodec';
import { exportAsJson } from '../exportImport/exportService';
import { importFromJson } from '../exportImport/importService';
import { MAX_FOLDER_DEPTH } from '../folderService';
import { EXPORT_SCHEMA_VERSION } from '../../config/version';

const SVG = '<svg viewBox="0 0 100 100"><path d="M10 10 L90 90" stroke="currentColor"/></svg>';
const SVG2 = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="currentColor"/></svg>';

const gidOf = (glyphOrder: string, i = 0) =>
    Number(deserializeGlyphOrder(glyphOrder)[i].replace('grapheme-', ''));

describe('logograph final cross-phase audit', () => {
    beforeAll(async () => { await initDatabase(); });
    beforeEach(() => { clearDatabase(); });

    // -------------------------------------------------------------------------
    // Priority 1 — feedback scenario end-to-end
    // -------------------------------------------------------------------------

    it('symbol words in a nested folder -> compound -> edit ancestor symbol -> export/wipe/import', async () => {
        const nouns = folderApi.create({ name: 'Nouns' }).data!;
        const entities = folderApi.create({ name: 'Entities', parent_id: nouns.id }).data!;

        // pronunciation-less symbol words, filed in the nested folder
        const night = lexiconApi.create({ meanings: [{ meaning: 'night' }], symbol: { svgData: SVG }, folder_id: entities.id }).data!;
        const affliction = lexiconApi.create({ meanings: [{ meaning: 'affliction' }], symbol: { svgData: SVG2 }, folder_id: entities.id }).data!;
        const nightGid = gidOf(night.glyph_order);
        const afflGid = gidOf(affliction.glyph_order);

        // compound spelled from ancestors (the build-from-ancestors concatenation)
        const compound = lexiconApi.create({
            meanings: [{ meaning: 'boredom' }],
            glyph_order: [createGraphemeEntry(nightGid), createGraphemeEntry(afflGid)],
            ancestry: [
                { ancestor_id: night.id, position: 0, ancestry_type: 'compound' },
                { ancestor_id: affliction.id, position: 1, ancestry_type: 'compound' },
            ],
            folder_id: nouns.id,
        }).data!;
        expect(deserializeGlyphOrder(compound.glyph_order)).toEqual([
            createGraphemeEntry(nightGid), createGraphemeEntry(afflGid),
        ]);

        // re-drawing night's symbol flows to the compound (shared grapheme -> glyph)
        const nightGlyphId = getGraphemeComplete(nightGid)!.glyphs[0].id;
        updateWordSymbolDrawing(nightGid, SVG2);
        expect(getGlyphById(nightGlyphId)!.svg_data).toContain('circle');
        expect(deserializeGlyphOrder(getLexiconById(compound.id)!.glyph_order)[0])
            .toBe(createGraphemeEntry(nightGid));

        // export -> wipe -> import: everything intact, no needs_attention
        const before = collectExportData();
        expect(before.version).toBe(EXPORT_SCHEMA_VERSION);
        const json = exportAsJson();
        clearDatabase();
        const report = await importFromJson(json);
        expect(report.warnings.filter(w => /missing/i.test(w))).toHaveLength(0);

        const after = collectExportData();
        expect(after.tables.lexicon_folders).toEqual(before.tables.lexicon_folders);
        expect(after.tables.lexicon.every(l => l.needs_attention === 0)).toBe(true);
        expect(after.tables.lexicon.find(l => l.id === compound.id)!.folder_id).toBe(nouns.id);
        expect(after.tables.lexicon.find(l => l.id === night.id)!.folder_id).toBe(entities.id);
        expect(getGraphemeComplete(nightGid)).not.toBeNull();
    });

    // -------------------------------------------------------------------------
    // DEFECT 1 — stranded '?' placeholder (Phase 1 × Phase 3)
    // -------------------------------------------------------------------------

    describe('logogram grapheme deletion on a pronunciation-less auto_spell word', () => {
        it('flags the word for review rather than leaving a silent "?" spelling', () => {
            const symbol = wordSymbolApi.create({ name: 'shared', svgData: SVG }).data!;
            // Phase-1-reachable: meaning-only, auto_spell left ON, no pronunciation.
            // Two words share the one logogram grapheme (the compound-reuse case).
            const c1 = lexiconApi.create({ meanings: [{ meaning: 'c1' }], auto_spell: true, glyph_order: [createGraphemeEntry(symbol.graphemeId)] }).data!;
            const c2 = lexiconApi.create({ meanings: [{ meaning: 'c2' }], auto_spell: true, glyph_order: [createGraphemeEntry(symbol.graphemeId)] }).data!;
            expect(getLexiconById(c1.id)!.auto_spell).toBe(true);
            expect(getLexiconById(c1.id)!.pronunciation ?? null).toBe(null);

            expect(graphemeApi.delete(symbol.graphemeId, { respellLexicon: true }).success).toBe(true);

            for (const c of [c1, c2]) {
                const after = getLexiconById(c.id)!;
                expect(deserializeGlyphOrder(after.glyph_order)).toEqual(['?']);
                expect(after.needs_attention).toBe(true); // the fix
            }
        });

        it('still leaves an auto_spell word WITH a pronunciation unflagged (respell repairs it)', () => {
            // Guards the fix's boundary: a pronounced auto_spell word is regenerated,
            // so it must NOT be flagged just because a grapheme was deleted.
            const glyph = wordSymbolApi.create({ name: 'K', svgData: SVG }).data!; // logogram, '?' fallback
            const word = lexiconApi.create({ pronunciation: 'ka', auto_spell: true, glyph_order: [createGraphemeEntry(glyph.graphemeId)] }).data!;
            expect(graphemeApi.delete(glyph.graphemeId, { respellLexicon: true }).success).toBe(true);
            expect(getLexiconById(word.id)!.needs_attention).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // DEFECT 2 — stale folder id on create/update
    // -------------------------------------------------------------------------

    describe('stale folder id (deleted after a ?folder= deep link)', () => {
        it('create with a non-existent folder_id files at the root, not an FK crash', () => {
            const res = lexiconApi.create({ meanings: [{ meaning: 'x' }], folder_id: 99999 });
            expect(res.success).toBe(true);
            expect(getLexiconById(res.data!.id)!.folder_id ?? null).toBe(null);
        });

        it('update to a non-existent folder_id files at the root, not an FK crash', () => {
            const real = folderApi.create({ name: 'F' }).data!;
            const w = lexiconApi.create({ meanings: [{ meaning: 'w' }], folder_id: real.id }).data!;
            const res = lexiconApi.update(w.id, { folder_id: 99999 });
            expect(res.success).toBe(true);
            expect(getLexiconById(w.id)!.folder_id ?? null).toBe(null);
        });

        it('a symbol create with a stale folder_id is still atomic and files at root', () => {
            const res = lexiconApi.create({ meanings: [{ meaning: 's' }], symbol: { svgData: SVG }, folder_id: 99999 });
            expect(res.success).toBe(true);
            expect(getLexiconById(res.data!.id)!.folder_id ?? null).toBe(null);
            expect(getGraphemeCount()).toBe(1); // the symbol grapheme was created
        });
    });

    // -------------------------------------------------------------------------
    // Priority 3 — folders through the API layer
    // -------------------------------------------------------------------------

    describe('folder machinery through the API', () => {
        it('enforces the depth cap', () => {
            let parent: number | null = null;
            for (let i = 0; i < MAX_FOLDER_DEPTH; i++) {
                const res = folderApi.create({ name: `d${i}`, parent_id: parent });
                expect(res.success).toBe(true);
                parent = res.data!.id;
            }
            const over = folderApi.create({ name: 'over', parent_id: parent });
            expect(over.success).toBe(false);
            expect(over.error?.code).toBe('VALIDATION_ERROR');
        });

        it('rejects a cycle-forming move (into itself or a descendant)', () => {
            const a = folderApi.create({ name: 'A' }).data!;
            const b = folderApi.create({ name: 'B', parent_id: a.id }).data!;
            expect(folderApi.move(a.id, b.id).error?.code).toBe('VALIDATION_ERROR');
            expect(folderApi.move(a.id, a.id).success).toBe(false);
        });

        it('deleting a folder reparents its subfolders AND words up one level', () => {
            const a = folderApi.create({ name: 'A' }).data!;
            const b = folderApi.create({ name: 'B', parent_id: a.id }).data!;
            const c = folderApi.create({ name: 'C', parent_id: b.id }).data!;
            const w = lexiconApi.create({ meanings: [{ meaning: 'w' }], folder_id: b.id }).data!;

            expect(folderApi.delete(b.id).success).toBe(true);
            expect(folderApi.getById(c.id).data!.parent_id).toBe(a.id);
            expect(getLexiconById(w.id)!.folder_id).toBe(a.id);

            // getPath on the now-deleted id is an empty path, never a throw
            const path = folderApi.getPath(b.id);
            expect(path.success).toBe(true);
            expect(path.data).toEqual([]);
        });

        it('files and unfiles a word (setLexiconFolder)', () => {
            const a = folderApi.create({ name: 'A' }).data!;
            const w = lexiconApi.create({ meanings: [{ meaning: 'w' }] }).data!;
            expect(folderApi.setLexiconFolder({ lexiconId: w.id, folderId: a.id }).success).toBe(true);
            expect(getLexiconById(w.id)!.folder_id).toBe(a.id);
            expect(folderApi.setLexiconFolder({ lexiconId: w.id, folderId: null }).success).toBe(true);
            expect(getLexiconById(w.id)!.folder_id ?? null).toBe(null);
        });
    });
});
