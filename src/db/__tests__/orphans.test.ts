/**
 * Orphan-guard tests — the delete paths that used to leave dangling
 * references or empty graphemes behind.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase, getDatabase, countForeignKeyViolations } from '../database';
import { createGlyph, forceDeleteGlyph, cascadeDeleteGlyph, getAllGlyphs, cleanupOrphanedGlyphs } from '../glyphService';
import { createGrapheme, getGraphemeById, removeGlyphFromGrapheme, setGraphemeGlyphs, getGlyphsByGraphemeId } from '../graphemeService';
import { createLexicon, getLexiconComplete, getLexiconById } from '../lexiconService';
import { graphemeApi } from '../api/graphemeApi';
import { settingsApi, resetSettingsForTests } from '../api/settingsApi';
import { createGraphemeEntry } from '../utils/spellingUtils';

describe('orphan guards', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
        localStorage.clear();
        resetSettingsForTests();
    });

    it('forceDeleteGlyph refuses to empty a grapheme', () => {
        const only = createGlyph({ name: 'only', svg_data: '<svg/>' });
        const extra = createGlyph({ name: 'extra', svg_data: '<svg/>' });
        createGrapheme({ name: 'solo', glyphs: [{ glyph_id: only.id, position: 0 }] });
        const pair = createGrapheme({ name: 'pair', glyphs: [{ glyph_id: only.id, position: 0 }, { glyph_id: extra.id, position: 1 }] });

        expect(() => forceDeleteGlyph(only.id)).toThrow(/"solo"/);
        expect(getAllGlyphs().map(g => g.name).sort()).toEqual(['extra', 'only']);

        expect(forceDeleteGlyph(extra.id)).toBe(true);
        expect(getGlyphsByGraphemeId(pair.id).map(g => g.id)).toEqual([only.id]);
        expect(countForeignKeyViolations()).toBe(0);
    });

    it('cascadeDeleteGlyph is blocked when a grapheme still spells a word, and nothing is deleted', () => {
        const glyph = createGlyph({ name: 'g', svg_data: '<svg/>' });
        const grapheme = createGrapheme({ name: 'gr', glyphs: [{ glyph_id: glyph.id, position: 0 }] });
        createLexicon({ lemma: 'w', glyph_order: [createGraphemeEntry(grapheme.id)] });

        expect(() => cascadeDeleteGlyph(glyph.id)).toThrow(/lexicon/);
        expect(getGraphemeById(grapheme.id)).not.toBeNull();
        expect(getAllGlyphs()).toHaveLength(1);
    });

    it('cascadeDeleteGlyph removes unused graphemes and the glyph together', () => {
        const glyph = createGlyph({ name: 'g', svg_data: '<svg/>' });
        const grapheme = createGrapheme({ name: 'gr', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [{ phoneme: 'g' }] });
        expect(cascadeDeleteGlyph(glyph.id)).toBe(true);
        expect(getGraphemeById(grapheme.id)).toBeNull();
        expect(getAllGlyphs()).toHaveLength(0);
        expect(getDatabase().exec('SELECT COUNT(*) FROM phonemes')[0].values[0][0]).toBe(0);
    });

    it('removeGlyphFromGrapheme / setGraphemeGlyphs preserve the ≥1 glyph invariant', () => {
        const a = createGlyph({ name: 'a', svg_data: '<svg/>' });
        const b = createGlyph({ name: 'b', svg_data: '<svg/>' });
        const grapheme = createGrapheme({ name: 'ab', glyphs: [{ glyph_id: a.id, position: 0 }, { glyph_id: b.id, position: 1 }] });
        expect(removeGlyphFromGrapheme(grapheme.id, b.id)).toBe(true);
        expect(() => removeGlyphFromGrapheme(grapheme.id, a.id)).toThrow(/last glyph/);
        expect(() => setGraphemeGlyphs(grapheme.id, [])).toThrow(/At least one glyph/);
        expect(getGlyphsByGraphemeId(grapheme.id)).toHaveLength(1);
    });

    it('graphemeApi.delete refuses a grapheme in use unless respellLexicon is set', () => {
        const glyph = createGlyph({ name: 'g', svg_data: '<svg/>' });
        const grapheme = createGrapheme({ name: 'ka', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [{ phoneme: 'ka', use_in_auto_spelling: true }] });
        const auto = createLexicon({ lemma: 'auto', glyph_order: [createGraphemeEntry(grapheme.id), 'x'], auto_spell: true });
        const manual = createLexicon({ lemma: 'manual', glyph_order: [createGraphemeEntry(grapheme.id)], auto_spell: false });

        const refused = graphemeApi.delete(grapheme.id);
        expect(refused.success).toBe(false);
        expect(refused.error?.code).toBe('CONSTRAINT_VIOLATION');
        expect(refused.error?.details?.lexiconCount).toBe(2);
        expect(getGraphemeById(grapheme.id)).not.toBeNull();

        const usage = graphemeApi.getLexiconUsage(grapheme.id);
        expect(usage.data?.map(l => l.lemma).sort()).toEqual(['auto', 'manual']);

        const done = graphemeApi.delete(grapheme.id, { respellLexicon: true });
        expect(done.success).toBe(true);
        expect(done.data).toEqual({ lexiconRespelled: 1, lexiconMarked: 1, orphanGlyphsRemoved: 0 });
        expect(getGraphemeById(grapheme.id)).toBeNull();

        const autoAfter = getLexiconComplete(auto.id)!;
        expect(autoAfter.glyph_order).toBe(JSON.stringify(['ka', 'x']));
        expect(autoAfter.needs_attention).toBe(false);
        const manualAfter = getLexiconById(manual.id)!;
        expect(manualAfter.glyph_order).toBe(JSON.stringify(['ka']));
        expect(manualAfter.needs_attention).toBe(true);
        expect(countForeignKeyViolations()).toBe(0);
    });

    it('graphemeApi.delete with autoManageGlyphs removes the orphaned glyph and reports it', () => {
        settingsApi.update({ autoManageGlyphs: true });
        const glyph = createGlyph({ name: 'g', svg_data: '<svg/>' });
        const grapheme = createGrapheme({ name: 'gr', glyphs: [{ glyph_id: glyph.id, position: 0 }] });
        const res = graphemeApi.delete(grapheme.id);
        expect(res.success).toBe(true);
        expect(res.data?.orphanGlyphsRemoved).toBe(1);
        expect(getAllGlyphs()).toHaveLength(0);
    });

    it('cleanupOrphanedGlyphs deletes only unused glyphs', () => {
        const used = createGlyph({ name: 'used', svg_data: '<svg/>' });
        createGlyph({ name: 'orphan1', svg_data: '<svg/>' });
        createGlyph({ name: 'orphan2', svg_data: '<svg/>' });
        createGrapheme({ name: 'gr', glyphs: [{ glyph_id: used.id, position: 0 }] });
        expect(cleanupOrphanedGlyphs()).toBe(2);
        expect(getAllGlyphs().map(g => g.name)).toEqual(['used']);
    });

    it('a failure mid-createGrapheme leaves no partial rows', () => {
        const glyph = createGlyph({ name: 'g', svg_data: '<svg/>' });
        const before = getDatabase().exec('SELECT COUNT(*) FROM graphemes')[0].values[0][0];
        expect(() => createGrapheme({
            name: 'broken',
            glyphs: [{ glyph_id: glyph.id, position: 0 }, { glyph_id: 9999, position: 1 }],
        })).toThrow(/FOREIGN KEY/);
        expect(getDatabase().exec('SELECT COUNT(*) FROM graphemes')[0].values[0][0]).toBe(before);
        expect(getDatabase().exec('SELECT COUNT(*) FROM grapheme_glyphs')[0].values[0][0]).toBe(0);
    });
});
