/**
 * Two-List Architecture Tests
 *
 * Tests for the new spelling storage architecture that supports:
 * 1. glyph_order - JSON array storing the true ordered spelling
 *    - Grapheme references: "grapheme-{id}"
 *    - IPA characters: Stored as-is
 * 2. lexicon_spelling - Junction table for relational queries only
 *
 * Key Features Tested:
 * - Creating lexicon with glyph_order format
 * - IPA character storage in spelling
 * - Grapheme deletion handling (respelling and needs_attention)
 * - Mixed grapheme and IPA spelling
 * - Migration from legacy spelling format
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import {
    initDatabase,
    clearDatabase,
    // Glyph operations
    createGlyph,
    // Grapheme operations
    createGrapheme,
    // Lexicon operations
    createLexicon,
    getLexiconById,
    getLexiconComplete,
    getAllLexicon,
    getAllLexiconComplete,
    updateLexicon,
    // Spelling utilities
    createGraphemeEntry,
    extractGraphemeIds,
    parseGlyphOrder,
    deserializeGlyphOrder,
    serializeGlyphOrder,
    isGraphemeEntry,
    // Grapheme deletion handling
    getLexiconEntriesUsingGrapheme,
    handleGraphemeDeletion,
    getLexiconEntriesNeedingAttention,
    clearNeedsAttention,
    setLexiconGlyphOrder,
} from '../index';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a test glyph for use in grapheme tests
 */
function createTestGlyph(name: string = 'TestGlyph', svg: string = '<svg/>') {
    return createGlyph({ name, svg_data: svg });
}

/**
 * Create a test grapheme with a phoneme for auto-spelling
 */
function createTestGrapheme(name: string, phoneme: string, useInAutoSpelling: boolean = true) {
    const glyph = createTestGlyph(name + '_glyph');
    return createGrapheme({
        name,
        glyphs: [{ glyph_id: glyph.id, position: 0 }],
        phonemes: [{ phoneme, use_in_auto_spelling: useInAutoSpelling }],
    });
}

// =============================================================================
// TEST SETUP
// =============================================================================

describe('Two-List Architecture', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    // =========================================================================
    // SPELLING UTILITIES TESTS
    // =========================================================================

    describe('Spelling Utilities', () => {
        it('should create grapheme entries correctly', () => {
            expect(createGraphemeEntry(123)).toBe('grapheme-123');
            expect(createGraphemeEntry(1)).toBe('grapheme-1');
        });

        it('should identify grapheme entries', () => {
            expect(isGraphemeEntry('grapheme-123')).toBe(true);
            expect(isGraphemeEntry('grapheme-1')).toBe(true);
            expect(isGraphemeEntry('ə')).toBe(false);
            expect(isGraphemeEntry('grapheme-')).toBe(false);
            expect(isGraphemeEntry('grapheme-0')).toBe(false); // ID must be > 0
            expect(isGraphemeEntry('grapheme--1')).toBe(false); // Negative IDs not valid
        });

        it('should parse glyph_order correctly', () => {
            const glyphOrder = ['grapheme-123', 'ə', 'grapheme-456', 'ʃ'];
            const parsed = parseGlyphOrder(glyphOrder);

            expect(parsed).toHaveLength(4);
            expect(parsed[0]).toEqual({ type: 'grapheme', rawValue: 'grapheme-123', graphemeId: 123 });
            expect(parsed[1]).toEqual({ type: 'ipa', rawValue: 'ə', ipaCharacter: 'ə' });
            expect(parsed[2]).toEqual({ type: 'grapheme', rawValue: 'grapheme-456', graphemeId: 456 });
            expect(parsed[3]).toEqual({ type: 'ipa', rawValue: 'ʃ', ipaCharacter: 'ʃ' });
        });

        it('should extract unique grapheme IDs', () => {
            const glyphOrder = ['grapheme-1', 'ə', 'grapheme-2', 'grapheme-1', 'ʃ'];
            const extracted = extractGraphemeIds(glyphOrder);

            expect(extracted.graphemeIds).toEqual([1, 2]); // Unique IDs only
            expect(extracted.hasIpaFallbacks).toBe(true);
            expect(extracted.ipaFallbackCount).toBe(2);
        });

        it('should serialize and deserialize glyph_order', () => {
            const original = ['grapheme-1', 'ə', 'grapheme-2'];
            const serialized = serializeGlyphOrder(original);
            const deserialized = deserializeGlyphOrder(serialized);

            expect(deserialized).toEqual(original);
        });

        it('should handle null/empty deserialization', () => {
            expect(deserializeGlyphOrder(null)).toEqual([]);
            expect(deserializeGlyphOrder('')).toEqual([]);
            expect(deserializeGlyphOrder('invalid')).toEqual([]);
        });
    });

    // =========================================================================
    // LEXICON WITH GLYPH_ORDER TESTS
    // =========================================================================

    describe('Lexicon with glyph_order', () => {
        it('should create lexicon with glyph_order format', () => {
            const grapheme1 = createTestGrapheme('K', 'k');
            const grapheme2 = createTestGrapheme('A', 'a');
            const grapheme3 = createTestGrapheme('T', 't');

            const lexicon = createLexicon({
                lemma: 'kat',
                pronunciation: 'kat',
                glyph_order: [
                    createGraphemeEntry(grapheme1.id),
                    createGraphemeEntry(grapheme2.id),
                    createGraphemeEntry(grapheme3.id),
                ],
            });

            expect(lexicon.glyph_order).toBeTruthy();
            const parsed = parseGlyphOrder(deserializeGlyphOrder(lexicon.glyph_order));
            expect(parsed).toHaveLength(3);
            expect(parsed.every(e => e.type === 'grapheme')).toBe(true);
        });

        it('should create lexicon with mixed grapheme and IPA characters', () => {
            const grapheme = createTestGrapheme('K', 'k');

            const lexicon = createLexicon({
                lemma: 'kəl',
                pronunciation: 'kəl',
                glyph_order: [
                    createGraphemeEntry(grapheme.id),
                    'ə', // IPA fallback
                    'l', // Another IPA fallback
                ],
            });

            expect(lexicon.glyph_order).toBeTruthy();
            const parsed = parseGlyphOrder(deserializeGlyphOrder(lexicon.glyph_order));
            expect(parsed).toHaveLength(3);
            expect(parsed[0].type).toBe('grapheme');
            expect(parsed[1].type).toBe('ipa');
            expect(parsed[1].ipaCharacter).toBe('ə');
            expect(parsed[2].type).toBe('ipa');
            expect(parsed[2].ipaCharacter).toBe('l');
        });

        it('should resolve spelling display correctly', () => {
            const grapheme = createTestGrapheme('K', 'k');

            const lexicon = createLexicon({
                lemma: 'kə',
                pronunciation: 'kə',
                glyph_order: [
                    createGraphemeEntry(grapheme.id),
                    'ə',
                ],
            });

            const complete = getLexiconComplete(lexicon.id);
            expect(complete).not.toBeNull();
            expect(complete!.spellingDisplay).toHaveLength(2);
            expect(complete!.spellingDisplay[0].type).toBe('grapheme');
            expect(complete!.spellingDisplay[0].grapheme?.name).toBe('K');
            expect(complete!.spellingDisplay[1].type).toBe('ipa');
            expect(complete!.spellingDisplay[1].ipaCharacter).toBe('ə');
            expect(complete!.hasIpaFallbacks).toBe(true);
        });

        it('should update glyph_order via updateLexicon', () => {
            const grapheme1 = createTestGrapheme('A', 'a');
            const grapheme2 = createTestGrapheme('B', 'b');

            const lexicon = createLexicon({
                lemma: 'ab',
                glyph_order: [createGraphemeEntry(grapheme1.id)],
            });

            const updated = updateLexicon(lexicon.id, {
                glyph_order: [
                    createGraphemeEntry(grapheme1.id),
                    createGraphemeEntry(grapheme2.id),
                ],
            });

            expect(updated).not.toBeNull();
            const complete = getLexiconComplete(updated!.id);
            expect(complete!.spellingDisplay).toHaveLength(2);
        });

        it('should use setLexiconGlyphOrder for direct updates', () => {
            const grapheme = createTestGrapheme('X', 'x');

            const lexicon = createLexicon({
                lemma: 'x',
                glyph_order: [],
            });

            const updated = setLexiconGlyphOrder(lexicon.id, [createGraphemeEntry(grapheme.id)]);
            expect(updated).not.toBeNull();
            expect(updated!.needs_attention).toBe(false); // Should clear needs_attention

            const complete = getLexiconComplete(updated!.id);
            expect(complete!.spellingDisplay).toHaveLength(1);
        });
    });

    // =========================================================================
    // NEEDS_ATTENTION TESTS
    // =========================================================================

    describe('needs_attention flag', () => {
        it('should default to false on creation', () => {
            const lexicon = createLexicon({
                lemma: 'test',
            });

            expect(lexicon.needs_attention).toBe(false);
        });

        it('should be able to set needs_attention via update', () => {
            const lexicon = createLexicon({
                lemma: 'test',
            });

            const updated = updateLexicon(lexicon.id, { needs_attention: true });
            expect(updated!.needs_attention).toBe(true);
        });

        it('should be able to clear needs_attention', () => {
            const lexicon = createLexicon({
                lemma: 'test',
            });

            updateLexicon(lexicon.id, { needs_attention: true });
            const cleared = clearNeedsAttention(lexicon.id);
            expect(cleared!.needs_attention).toBe(false);
        });

        it('should sort entries needing attention to the top', () => {
            createLexicon({ lemma: 'apple' });
            createLexicon({ lemma: 'banana' });
            const needsAttention = createLexicon({ lemma: 'cherry' });
            updateLexicon(needsAttention.id, { needs_attention: true });

            const allLexicon = getAllLexicon();
            expect(allLexicon).toHaveLength(3);
            expect(allLexicon[0].lemma).toBe('cherry'); // Should be first
            expect(allLexicon[0].needs_attention).toBe(true);
        });

        it('should filter entries needing attention', () => {
            createLexicon({ lemma: 'ok1' });
            createLexicon({ lemma: 'ok2' });
            const needs1 = createLexicon({ lemma: 'needs1' });
            const needs2 = createLexicon({ lemma: 'needs2' });
            updateLexicon(needs1.id, { needs_attention: true });
            updateLexicon(needs2.id, { needs_attention: true });

            const needingAttention = getLexiconEntriesNeedingAttention();
            expect(needingAttention).toHaveLength(2);
            expect(needingAttention.every(l => l.needs_attention)).toBe(true);
        });
    });

    // =========================================================================
    // GRAPHEME DELETION HANDLING TESTS
    // =========================================================================

    describe('Grapheme Deletion Handling', () => {
        it('should find lexicon entries using a grapheme', () => {
            const grapheme = createTestGrapheme('T', 't');

            createLexicon({
                lemma: 'test1',
                glyph_order: [createGraphemeEntry(grapheme.id)],
            });
            createLexicon({
                lemma: 'test2',
                glyph_order: [createGraphemeEntry(grapheme.id)],
            });
            createLexicon({
                lemma: 'other',
                glyph_order: [],
            });

            const using = getLexiconEntriesUsingGrapheme(grapheme.id);
            expect(using).toHaveLength(2);
            expect(using.every(l => l.lemma.startsWith('test'))).toBe(true);
        });

        it('should handle grapheme deletion for auto_spell entries', () => {
            // Create graphemes for auto-spelling
            const graphemeK = createTestGrapheme('K', 'k', true);
            const graphemeA = createTestGrapheme('A', 'a', true);
            const graphemeT = createTestGrapheme('T', 't', true);

            // Create a lexicon with auto_spell enabled
            const lexicon = createLexicon({
                lemma: 'kat',
                pronunciation: 'kat',
                auto_spell: true,
                glyph_order: [
                    createGraphemeEntry(graphemeK.id),
                    createGraphemeEntry(graphemeA.id),
                    createGraphemeEntry(graphemeT.id),
                ],
            });

            // Handle the deletion of 'A' grapheme
            const result = handleGraphemeDeletion(graphemeA.id, 'a');

            expect(result.affectedLexiconIds).toContain(lexicon.id);
            // Since auto_spell is true, it should be counted as "respelled" (handled)
            // but not marked for attention
            expect(result.respelledCount).toBe(1);
            expect(result.markedForAttentionCount).toBe(0);

            // Verify the lexicon entry was updated with IPA fallback
            const updated = getLexiconComplete(lexicon.id);
            expect(updated).not.toBeNull();
            // The spelling should now have the IPA fallback 'a' instead of the grapheme
            expect(updated!.spellingDisplay.some(e => e.type === 'ipa' && e.ipaCharacter === 'a')).toBe(true);
            // Should NOT be marked for attention since auto_spell is true
            expect(updated!.needs_attention).toBe(false);
        });

        it('should mark needs_attention for non-auto_spell entries', () => {
            const grapheme = createTestGrapheme('X', 'x');

            // Create a lexicon with auto_spell DISABLED
            const lexicon = createLexicon({
                lemma: 'xtest',
                pronunciation: 'xtest',
                auto_spell: false,
                glyph_order: [createGraphemeEntry(grapheme.id)],
            });

            // Handle grapheme deletion
            const result = handleGraphemeDeletion(grapheme.id, 'x');

            expect(result.affectedLexiconIds).toContain(lexicon.id);
            expect(result.markedForAttentionCount).toBe(1);

            // Verify the lexicon entry was marked for attention
            const updated = getLexiconById(lexicon.id);
            expect(updated).not.toBeNull();
            expect(updated!.needs_attention).toBe(true);

            // Verify the glyph_order was updated with IPA fallback
            const parsed = parseGlyphOrder(deserializeGlyphOrder(updated!.glyph_order));
            expect(parsed.some(e => e.type === 'ipa' && e.ipaCharacter === 'x')).toBe(true);
        });
    });

    // =========================================================================
    // LEGACY COMPATIBILITY TESTS
    // =========================================================================

    describe('Legacy Compatibility', () => {
        it('should convert legacy spelling input to glyph_order', () => {
            const grapheme1 = createTestGrapheme('A', 'a');
            const grapheme2 = createTestGrapheme('B', 'b');

            // Use legacy spelling format
            const lexicon = createLexicon({
                lemma: 'ab',
                spelling: [
                    { grapheme_id: grapheme1.id, position: 0 },
                    { grapheme_id: grapheme2.id, position: 1 },
                ],
            });

            // Should have been converted to glyph_order
            expect(lexicon.glyph_order).toBeTruthy();
            const parsed = parseGlyphOrder(deserializeGlyphOrder(lexicon.glyph_order));
            expect(parsed).toHaveLength(2);
            expect(parsed[0].graphemeId).toBe(grapheme1.id);
            expect(parsed[1].graphemeId).toBe(grapheme2.id);
        });

        it('should prefer glyph_order over legacy spelling when both provided', () => {
            const grapheme1 = createTestGrapheme('A', 'a');
            const grapheme2 = createTestGrapheme('B', 'b');
            const grapheme3 = createTestGrapheme('C', 'c');

            // Provide both - glyph_order should take precedence
            const lexicon = createLexicon({
                lemma: 'c',
                glyph_order: [createGraphemeEntry(grapheme3.id)],
                spelling: [
                    { grapheme_id: grapheme1.id, position: 0 },
                    { grapheme_id: grapheme2.id, position: 1 },
                ],
            });

            const parsed = parseGlyphOrder(deserializeGlyphOrder(lexicon.glyph_order));
            expect(parsed).toHaveLength(1);
            expect(parsed[0].graphemeId).toBe(grapheme3.id);
        });

        it('should maintain backward compatibility for spelling field in LexiconComplete', () => {
            const grapheme = createTestGrapheme('A', 'a');

            const lexicon = createLexicon({
                lemma: 'aə',
                glyph_order: [
                    createGraphemeEntry(grapheme.id),
                    'ə', // IPA fallback
                ],
            });

            const complete = getLexiconComplete(lexicon.id);
            expect(complete).not.toBeNull();

            // spellingDisplay should have both
            expect(complete!.spellingDisplay).toHaveLength(2);

            // Legacy spelling field should have graphemes only (excluding IPA fallbacks)
            expect(complete!.spelling).toHaveLength(1);
            expect(complete!.spelling[0].name).toBe('A');
        });
    });

    // =========================================================================
    // COMPLETE DATA TESTS
    // =========================================================================

    describe('Complete Data Retrieval', () => {
        it('should include hasIpaFallbacks in complete data', () => {
            const grapheme = createTestGrapheme('K', 'k');

            const withFallback = createLexicon({
                lemma: 'kə',
                glyph_order: [createGraphemeEntry(grapheme.id), 'ə'],
            });

            const withoutFallback = createLexicon({
                lemma: 'k',
                glyph_order: [createGraphemeEntry(grapheme.id)],
            });

            const complete1 = getLexiconComplete(withFallback.id);
            expect(complete1!.hasIpaFallbacks).toBe(true);

            const complete2 = getLexiconComplete(withoutFallback.id);
            expect(complete2!.hasIpaFallbacks).toBe(false);
        });

        it('should include hasIpaFallbacks in getAllLexiconComplete', () => {
            const grapheme = createTestGrapheme('K', 'k');

            createLexicon({
                lemma: 'kə',
                glyph_order: [createGraphemeEntry(grapheme.id), 'ə'],
            });

            createLexicon({
                lemma: 'k',
                glyph_order: [createGraphemeEntry(grapheme.id)],
            });

            const all = getAllLexiconComplete();
            expect(all).toHaveLength(2);

            const withFallback = all.find(l => l.lemma === 'kə');
            const withoutFallback = all.find(l => l.lemma === 'k');

            expect(withFallback!.hasIpaFallbacks).toBe(true);
            expect(withoutFallback!.hasIpaFallbacks).toBe(false);
        });
    });
});
