/**
 * Lexicon Edge Cases & Danger Zones Tests (Safe Version)
 *
 * Tests for identified potential issues in the database schema and service logic.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
    initDatabase,
    clearDatabase,
    getDatabase
} from '../database.ts';
import {
    createLexicon,
    addAncestorToLexicon,
    getLexiconComplete,
    deleteLexicon,
    getLexiconWithSpelling,
} from '../lexiconService.ts';
import { createGrapheme, deleteGrapheme } from '../graphemeService.ts';
import { createGraphemeEntry } from '../utils/spellingUtils.ts';
import { createGlyph } from '../glyphService.ts';

describe('Lexicon Edge Cases', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    describe('Ancestry Circles', () => {
        it('prevents creating a self-reference ancestry loop', () => {
            const lexA = createLexicon({ lemma: 'A', is_native: true });

            // A -> A
            expect(() => {
                addAncestorToLexicon(lexA.id, { ancestor_id: lexA.id, position: 0 });
            }).toThrow(/cycle/i);
        });

        it('prevents creating a 3-node cycle A->B->C->A', () => {
            const lexA = createLexicon({ lemma: 'A' });
            const lexB = createLexicon({ lemma: 'B' });
            const lexC = createLexicon({ lemma: 'C' });

            // A descends from B
            addAncestorToLexicon(lexA.id, { ancestor_id: lexB.id, position: 0 });
            // B descends from C
            addAncestorToLexicon(lexB.id, { ancestor_id: lexC.id, position: 0 });

            // C descends from A (Cycle!)
            expect(() => {
                addAncestorToLexicon(lexC.id, { ancestor_id: lexA.id, position: 0 });
            }).toThrow(/cycle/i);
        });
    });

    describe('Ancestry Deletion Integrity', () => {
        it('cleanly removes ancestor relationships when ancestor is deleted', () => {
            const lexChild = createLexicon({ lemma: 'Child' });
            const lexParent = createLexicon({ lemma: 'Parent' });

            addAncestorToLexicon(lexChild.id, { ancestor_id: lexParent.id, position: 0 });

            // Verify relationship exists
            const before = getLexiconComplete(lexChild.id);
            expect(before?.ancestors.length).toBe(1);

            // Delete Parent
            deleteLexicon(lexParent.id);

            // Verify relationship gone
            const after = getLexiconComplete(lexChild.id);
            expect(after?.ancestors.length).toBe(0);

            // Ancestry table should be clean
            const ancestryRows = getDatabase().exec(`SELECT * FROM lexicon_ancestry WHERE lexicon_id = ${lexChild.id}`);
            expect(ancestryRows.length).toBe(0);
        });

        it('cleanly removes descendant relationships when child is deleted', () => {
            const lexChild = createLexicon({ lemma: 'Child' });
            const lexParent = createLexicon({ lemma: 'Parent' });

            addAncestorToLexicon(lexChild.id, { ancestor_id: lexParent.id, position: 0 });

            // Delete Child
            deleteLexicon(lexChild.id);

            // Ancestry table should be clean
            const ancestryRows = getDatabase().exec(`SELECT * FROM lexicon_ancestry WHERE ancestor_id = ${lexParent.id}`);
            expect(ancestryRows.length).toBe(0);
        });
    });

    describe('Spelling Grapheme Deletion Constraint', () => {
        it('prevents deleting a grapheme involved in a lexicon spelling', () => {
            // Setup Glyph and Grapheme
            const glyph = createGlyph({ name: 'g1', svg_data: '<svg></svg>' });
            const grapheme = createGrapheme({
                name: 'G',
                glyphs: [{ glyph_id: glyph.id, position: 0 }]
            });

            // Setup Lexicon using Grapheme
            const lex = createLexicon({
                lemma: 'Word',
                glyph_order: [createGraphemeEntry(grapheme.id)]
            });

            // Verify linkage
            const sp = getLexiconWithSpelling(lex.id);
            expect(sp?.spelling.length).toBeGreaterThan(0);

            // Try to delete Grapheme using Service
            expect(() => {
                deleteGrapheme(grapheme.id);
            }).toThrow(/Cannot delete grapheme/i);

            // Ensure it was NOT deleted
            const lookup = getDatabase().exec('SELECT id FROM graphemes WHERE id = ?', [grapheme.id]);
            expect(lookup.length).toBeGreaterThan(0);
            expect(lookup[0].values.length).toBeGreaterThan(0);
        });
    });
});
