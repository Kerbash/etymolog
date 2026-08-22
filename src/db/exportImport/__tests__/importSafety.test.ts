/**
 * Import safety tests
 *
 * The old import path reset (and persisted) an EMPTY database before starting
 * its transaction, so a malformed file destroyed the user's conlang. These
 * tests pin the atomic behaviour: a bad file leaves everything intact, and a
 * good file restores settings through the API with listeners notified.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase, getDatabase } from '../../database';
import { collectExportData, importExportData, parseAndValidateJson } from '../jsonCodec';
import { ExportValidationError, validateExportData } from '../validateExport';
import { importFromJson } from '../importService';
import { exportAsJson } from '../exportService';
import { settingsApi, subscribeToSettings, getCurrentSettings, resetSettingsForTests } from '../../api/settingsApi';
import { createGlyph } from '../../glyphService';
import { createGrapheme } from '../../graphemeService';
import { createLexicon, getAllDescendantIds } from '../../lexiconService';
import type { EtymologExportData } from '../types';

function seedCurrentConlang() {
    const glyph = createGlyph({ name: 'keep-me', svg_data: '<svg/>' });
    const grapheme = createGrapheme({ name: 'kept', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [{ phoneme: 'k' }] });
    createLexicon({ lemma: 'current', spelling: [{ grapheme_id: grapheme.id, position: 0 }] });
}

function currentState() {
    const db = getDatabase();
    return {
        glyphs: db.exec('SELECT name FROM glyphs')[0]?.values.map(r => r[0]) ?? [],
        words: db.exec('SELECT lemma FROM lexicon')[0]?.values.map(r => r[0]) ?? [],
    };
}

function goodEnvelope(): EtymologExportData {
    return parseAndValidateJson(JSON.stringify({
        magic: 'ETYMOLOG_EXPORT',
        version: 1,
        exportedAt: '2026-01-01T00:00:00Z',
        conlangName: 'Imported',
        settings: { conlangName: 'Imported', autoManageGlyphs: true },
        tables: {
            glyphs: [{ id: 1, name: 'ig', svg_data: '<svg/>', category: null, notes: null, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' }],
            graphemes: [{ id: 1, name: 'igr', category: null, notes: null, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' }],
            grapheme_glyphs: [{ id: 1, grapheme_id: 1, glyph_id: 1, position: 0, transform: null }],
            phonemes: [{ id: 1, grapheme_id: 1, phoneme: 'i', use_in_auto_spelling: 1, context: null }],
            lexicon: [
                { id: 1, lemma: 'root', pronunciation: null, is_native: 1, auto_spell: 1, meaning: 'm', part_of_speech: null, notes: null, glyph_order: '["grapheme-1"]', needs_attention: 0, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' },
                { id: 2, lemma: 'child', pronunciation: null, is_native: 1, auto_spell: 1, meaning: 'm', part_of_speech: null, notes: null, glyph_order: '[]', needs_attention: 0, created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' },
            ],
            lexicon_spelling: [{ id: 1, lexicon_id: 1, grapheme_id: 1, position: 0 }],
            lexicon_meanings: [{ id: 1, lexicon_id: 1, meaning: 'm', part_of_speech: null, usage_notes: null, definition_order: 0 }],
            lexicon_ancestry: [{ id: 1, lexicon_id: 2, ancestor_id: 1, position: 0, ancestry_type: 'derived' }],
            lexicon_ancestry_closure: [],
        },
    }));
}

describe('import safety', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
        localStorage.removeItem('etymolog_settings_v1');
        resetSettingsForTests();
    });

    it('a malformed row is rejected before the database is touched', async () => {
        seedCurrentConlang();
        const before = currentState();
        const data = goodEnvelope();
        (data.tables.lexicon[0] as unknown as { lemma: unknown }).lemma = { nested: true };

        await expect(importExportData(data)).rejects.toBeInstanceOf(ExportValidationError);
        expect(currentState()).toEqual(before);
    });

    it('a duplicate primary key is rejected', () => {
        const data = goodEnvelope();
        data.tables.glyphs.push({ ...data.tables.glyphs[0] });
        expect(() => validateExportData(data)).toThrow(/duplicate id/);
    });

    it('a constraint failure inside the transaction rolls back to the pre-import state', async () => {
        seedCurrentConlang();
        const before = currentState();
        const data = goodEnvelope();
        // Passes validation (distinct ids) but violates UNIQUE(grapheme_id, glyph_id, position).
        data.tables.grapheme_glyphs.push({ id: 2, grapheme_id: 1, glyph_id: 1, position: 0, transform: null });

        await expect(importExportData(data)).rejects.toThrow();
        expect(currentState()).toEqual(before);
        // The connection is usable afterwards.
        createGlyph({ name: 'after-failure', svg_data: '<svg/>' });
        expect(currentState().glyphs).toContain('after-failure');
    });

    it('dangling child rows are pruned and reported instead of failing the import', async () => {
        const data = goodEnvelope();
        data.tables.lexicon_spelling.push({ id: 2, lexicon_id: 99, grapheme_id: 1, position: 0 });
        data.tables.phonemes.push({ id: 2, grapheme_id: 42, phoneme: 'x', use_in_auto_spelling: 0, context: null });

        const report = await importExportData(data);
        expect(report.pruned.lexicon_spelling).toBe(1);
        expect(report.pruned.phonemes).toBe(1);
        expect(report.inserted.lexicon_spelling).toBe(1);
        expect(report.warnings.some(w => w.includes('lexicon_spelling'))).toBe(true);
        expect(getDatabase().exec('PRAGMA foreign_key_check')).toEqual([]);
    });

    it('a pruned parent prunes its children too', async () => {
        const data = goodEnvelope();
        // Ancestry row whose child word does not exist → pruned; nothing else affected.
        data.tables.lexicon_ancestry.push({ id: 2, lexicon_id: 77, ancestor_id: 1, position: 0, ancestry_type: 'derived' });
        const report = await importExportData(data);
        expect(report.pruned.lexicon_ancestry).toBe(1);
        expect(report.inserted.lexicon_ancestry).toBe(1);
    });

    it('ignores exported closure rows and rebuilds the closure from lexicon_ancestry', async () => {
        const data = goodEnvelope();
        // Stale/garbage closure rows from an old export.
        data.tables.lexicon_ancestry_closure = [
            { ancestor_id: 1, descendant_id: 1, depth: 0 },
            { ancestor_id: 2, descendant_id: 1, depth: 1 },
        ];
        await importExportData(data);
        const closure = getDatabase().exec('SELECT ancestor_id, descendant_id, depth FROM lexicon_ancestry_closure')[0].values;
        expect(closure).toEqual([[1, 2, 1]]);
        expect(getAllDescendantIds(1)).toEqual([2]);
    });

    it('restores settings through the API and notifies subscribers', async () => {
        const seen: string[] = [];
        subscribeToSettings(s => seen.push(s.conlangName));
        await importExportData(goodEnvelope());
        expect(getCurrentSettings().conlangName).toBe('Imported');
        expect(getCurrentSettings().autoManageGlyphs).toBe(true);
        expect(seen).toEqual(['Imported']);
        expect(settingsApi.get().data?.conlangName).toBe('Imported');
    });

    it('corrects malformed settings in the envelope and reports the corrections', async () => {
        const data = goodEnvelope();
        (data.settings as unknown as Record<string, unknown>).autoSaveInterval = 1000;
        (data.settings as unknown as Record<string, unknown>).writingSystem = { glyphDirection: 'btu' };
        (data.settings as unknown as Record<string, unknown>).mystery = 1;
        const report = await importExportData(data);
        expect(getCurrentSettings().writingSystem.glyphDirection).toBe('btt');
        expect(report.warnings).toContain('mystery: unknown setting (dropped)');
    });

    it('fixes autoincrement sequences so new rows do not collide with imported ids', async () => {
        await importExportData(goodEnvelope());
        const glyph = createGlyph({ name: 'new', svg_data: '<svg/>' });
        expect(glyph.id).toBe(2);
        const word = createLexicon({ lemma: 'third' });
        expect(word.id).toBe(3);
    });

    it('accepts booleans for 0/1 columns and arrays for glyph_order', async () => {
        const data = goodEnvelope();
        (data.tables.lexicon[0] as unknown as { is_native: unknown }).is_native = true;
        (data.tables.lexicon[0] as unknown as { glyph_order: unknown }).glyph_order = ['grapheme-1'];
        await importExportData(data);
        const row = getDatabase().exec('SELECT is_native, glyph_order FROM lexicon WHERE id = 1')[0].values[0];
        expect(row).toEqual([1, '["grapheme-1"]']);
    });

    it('round-trips through the service layer and reports', async () => {
        seedCurrentConlang();
        const json = exportAsJson();
        clearDatabase();
        const report = await importFromJson(json);
        expect(report.inserted.glyphs).toBe(1);
        expect(report.inserted.lexicon).toBe(1);
        expect(currentState().words).toEqual(['current']);
        expect(collectExportData().tables.lexicon_spelling).toHaveLength(1);
    });
});
