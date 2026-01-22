/**
 * Grapheme Service Tests
 *
 * Comprehensive test suite covering all CRUD operations and edge cases
 * for the Glyph → Grapheme → Phoneme architecture.
 *
 * Architecture:
 * - Glyph: Atomic visual symbol (SVG drawing) - reusable
 * - Grapheme: Composition of glyphs with order (via junction table)
 * - Phoneme: Pronunciation associated with a grapheme
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

// Import database operations
import {
    initDatabase,
    clearDatabase,
    // Glyph operations
    createGlyph,
    getGlyphById,
    // Grapheme operations
    createGrapheme,
    getGraphemeById,
    getGraphemeWithGlyphs,
    getGraphemeWithPhonemes,
    getGraphemeComplete,
    getAllGraphemes,
    getAllGraphemesWithGlyphs,
    getAllGraphemesComplete,
    searchGraphemesByName,
    updateGrapheme,
    deleteGrapheme,
    getGraphemeCount,
    // Grapheme-Glyph relationships
    getGlyphsByGraphemeId,
    getGraphemeGlyphEntries,
    addGlyphToGrapheme,
    removeGlyphFromGrapheme,
    setGraphemeGlyphs,
    reorderGraphemeGlyphs,
    // Phoneme operations
    addPhoneme,
    getPhonemeById,
    getPhonemesByGraphemeId,
    updatePhoneme,
    deletePhoneme,
    deleteAllPhonemesForGrapheme,
    getAutoSpellingPhonemes
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

// =============================================================================
// TEST SETUP
// =============================================================================

describe('Grapheme Service', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    // =========================================================================
    // GRAPHEME CRUD TESTS
    // =========================================================================

    describe('createGrapheme', () => {
        it('should create a grapheme with a single glyph', () => {
            const glyph = createTestGlyph('A');

            const result = createGrapheme({
                name: 'LetterA',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            expect(result).toBeDefined();
            expect(result.id).toBeGreaterThan(0);
            expect(result.name).toBe('LetterA');
            expect(result.glyphs).toHaveLength(1);
            expect(result.glyphs[0].id).toBe(glyph.id);
            expect(result.phonemes).toEqual([]);
            expect(result.created_at).toBeDefined();
            expect(result.updated_at).toBeDefined();
        });

        it('should create a grapheme with multiple glyphs in order', () => {
            const g1 = createTestGlyph('Part1');
            const g2 = createTestGlyph('Part2');
            const g3 = createTestGlyph('Part3');

            const result = createGrapheme({
                name: 'Compound',
                glyphs: [
                    { glyph_id: g1.id, position: 0 },
                    { glyph_id: g2.id, position: 1 },
                    { glyph_id: g3.id, position: 2 }
                ],
                phonemes: []
            });

            expect(result.glyphs).toHaveLength(3);
            expect(result.glyphs[0].id).toBe(g1.id);
            expect(result.glyphs[1].id).toBe(g2.id);
            expect(result.glyphs[2].id).toBe(g3.id);
        });

        it('should create a grapheme with phonemes', () => {
            const glyph = createTestGlyph('A');

            const result = createGrapheme({
                name: 'A',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [
                    { phoneme: 'a', use_in_auto_spelling: true },
                    { phoneme: 'æ', use_in_auto_spelling: false }
                ]
            });

            expect(result.phonemes).toHaveLength(2);
            expect(result.phonemes[0].phoneme).toBe('a');
            expect(result.phonemes[0].use_in_auto_spelling).toBe(true);
            expect(result.phonemes[1].phoneme).toBe('æ');
            expect(result.phonemes[1].use_in_auto_spelling).toBe(false);
        });

        it('should throw error when no glyphs provided', () => {
            expect(() => createGrapheme({
                name: 'NoGlyphs',
                glyphs: [],
                phonemes: []
            })).toThrow('At least one glyph is required to create a grapheme');
        });

        it('should allow same glyph to be used in multiple graphemes', () => {
            const sharedGlyph = createTestGlyph('Shared');

            const g1 = createGrapheme({
                name: 'UsesShared1',
                glyphs: [{ glyph_id: sharedGlyph.id, position: 0 }],
                phonemes: [{ phoneme: 'a' }]
            });
            const g2 = createGrapheme({
                name: 'UsesShared2',
                glyphs: [{ glyph_id: sharedGlyph.id, position: 0 }],
                phonemes: [{ phoneme: 'b' }]
            });

            expect(g1.glyphs[0].id).toBe(sharedGlyph.id);
            expect(g2.glyphs[0].id).toBe(sharedGlyph.id);
        });

        it('should create a grapheme with notes', () => {
            const glyph = createTestGlyph();

            const result = createGrapheme({
                name: 'WithNotes',
                notes: 'Test notes for grapheme',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            expect(result.notes).toBe('Test notes for grapheme');
        });

        it('should handle unicode characters in name', () => {
            const glyph = createTestGlyph();

            const result = createGrapheme({
                name: '日本語テスト',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            expect(result.name).toBe('日本語テスト');
        });
    });

    // =========================================================================
    // GRAPHEME RETRIEVAL TESTS
    // =========================================================================

    describe('getGraphemeById', () => {
        it('should return grapheme when found', () => {
            const glyph = createTestGlyph();
            const created = createGrapheme({
                name: 'FindMe',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            const found = getGraphemeById(created.id);

            expect(found).not.toBeNull();
            expect(found!.id).toBe(created.id);
            expect(found!.name).toBe('FindMe');
        });

        it('should return null when not found', () => {
            const result = getGraphemeById(99999);

            expect(result).toBeNull();
        });

        it('should return null for negative ID', () => {
            const result = getGraphemeById(-1);

            expect(result).toBeNull();
        });
    });

    describe('getGraphemeWithGlyphs', () => {
        it('should return grapheme with its glyphs in order', () => {
            const g1 = createTestGlyph('First');
            const g2 = createTestGlyph('Second');

            const created = createGrapheme({
                name: 'TwoGlyphs',
                glyphs: [
                    { glyph_id: g1.id, position: 0 },
                    { glyph_id: g2.id, position: 1 }
                ],
                phonemes: []
            });

            const result = getGraphemeWithGlyphs(created.id);

            expect(result).not.toBeNull();
            expect(result!.glyphs).toHaveLength(2);
            expect(result!.glyphs[0].name).toBe('First');
            expect(result!.glyphs[1].name).toBe('Second');
        });

        it('should return null for non-existent grapheme', () => {
            const result = getGraphemeWithGlyphs(99999);

            expect(result).toBeNull();
        });
    });

    describe('getGraphemeWithPhonemes', () => {
        it('should return grapheme with all phonemes', () => {
            const glyph = createTestGlyph();
            const created = createGrapheme({
                name: 'WithPho',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [
                    { phoneme: 'p', use_in_auto_spelling: true },
                    { phoneme: 'b', use_in_auto_spelling: false }
                ]
            });

            const result = getGraphemeWithPhonemes(created.id);

            expect(result!.phonemes).toHaveLength(2);
        });

        it('should return grapheme with empty phonemes array', () => {
            const glyph = createTestGlyph();
            const created = createGrapheme({
                name: 'NoPho',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            const result = getGraphemeWithPhonemes(created.id);

            expect(result).not.toBeNull();
            expect(result!.phonemes).toEqual([]);
        });

        it('should return null for non-existent grapheme', () => {
            const result = getGraphemeWithPhonemes(99999);

            expect(result).toBeNull();
        });
    });

    describe('getGraphemeComplete', () => {
        it('should return grapheme with both glyphs and phonemes', () => {
            const g1 = createTestGlyph('Glyph1');
            const g2 = createTestGlyph('Glyph2');

            const created = createGrapheme({
                name: 'Complete',
                glyphs: [
                    { glyph_id: g1.id, position: 0 },
                    { glyph_id: g2.id, position: 1 }
                ],
                phonemes: [
                    { phoneme: 'a', use_in_auto_spelling: true },
                    { phoneme: 'b', use_in_auto_spelling: false }
                ]
            });

            const result = getGraphemeComplete(created.id);

            expect(result).not.toBeNull();
            expect(result!.glyphs).toHaveLength(2);
            expect(result!.phonemes).toHaveLength(2);
        });
    });

    describe('getAllGraphemes', () => {
        it('should return empty array when no graphemes exist', () => {
            const result = getAllGraphemes();

            expect(result).toEqual([]);
        });

        it('should return all graphemes', () => {
            const glyph = createTestGlyph();

            createGrapheme({ name: 'First', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [] });
            createGrapheme({ name: 'Second', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [] });
            createGrapheme({ name: 'Third', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [] });

            const result = getAllGraphemes();

            expect(result).toHaveLength(3);
            const names = result.map(g => g.name);
            expect(names).toContain('First');
            expect(names).toContain('Second');
            expect(names).toContain('Third');
        });
    });

    describe('getAllGraphemesWithGlyphs', () => {
        it('should return all graphemes with their glyphs', () => {
            const g1 = createTestGlyph('Glyph1');
            const g2 = createTestGlyph('Glyph2');

            createGrapheme({
                name: 'WithTwoGlyphs',
                glyphs: [
                    { glyph_id: g1.id, position: 0 },
                    { glyph_id: g2.id, position: 1 }
                ],
                phonemes: []
            });
            createGrapheme({
                name: 'WithOneGlyph',
                glyphs: [{ glyph_id: g1.id, position: 0 }],
                phonemes: []
            });

            const result = getAllGraphemesWithGlyphs();

            expect(result).toHaveLength(2);
            const withTwo = result.find(g => g.name === 'WithTwoGlyphs');
            const withOne = result.find(g => g.name === 'WithOneGlyph');
            expect(withTwo!.glyphs).toHaveLength(2);
            expect(withOne!.glyphs).toHaveLength(1);
        });
    });

    describe('getAllGraphemesComplete', () => {
        it('should return all graphemes with glyphs and phonemes', () => {
            const glyph = createTestGlyph();

            createGrapheme({
                name: 'Complete1',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'a' }, { phoneme: 'b' }]
            });
            createGrapheme({
                name: 'Complete2',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'c' }]
            });

            const result = getAllGraphemesComplete();

            expect(result).toHaveLength(2);
            expect(result.every(g => 'glyphs' in g && 'phonemes' in g)).toBe(true);
        });
    });

    // =========================================================================
    // GRAPHEME SEARCH TESTS
    // =========================================================================

    describe('searchGraphemesByName', () => {
        beforeEach(() => {
            const glyph = createTestGlyph();
            createGrapheme({ name: 'Alpha', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [] });
            createGrapheme({ name: 'Beta', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [] });
            createGrapheme({ name: 'Alphabet', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [] });
            createGrapheme({ name: 'Gamma', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [] });
        });

        it('should find matches containing search term', () => {
            const result = searchGraphemesByName('Alpha');

            expect(result).toHaveLength(2);
            expect(result.map(g => g.name)).toContain('Alpha');
            expect(result.map(g => g.name)).toContain('Alphabet');
        });

        it('should find partial matches', () => {
            const result = searchGraphemesByName('Alph');

            expect(result).toHaveLength(2);
        });

        it('should be case-insensitive', () => {
            const result = searchGraphemesByName('alpha');

            expect(result).toHaveLength(2);
        });

        it('should return empty array for no matches', () => {
            const result = searchGraphemesByName('xyz');

            expect(result).toEqual([]);
        });

        it('should return all for empty query', () => {
            const result = searchGraphemesByName('');

            expect(result).toHaveLength(4);
        });
    });

    // =========================================================================
    // GRAPHEME UPDATE TESTS
    // =========================================================================

    describe('updateGrapheme', () => {
        it('should update name only', () => {
            const glyph = createTestGlyph();
            const created = createGrapheme({
                name: 'Original',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            const updated = updateGrapheme(created.id, { name: 'Updated' });

            expect(updated!.name).toBe('Updated');
        });

        it('should update notes', () => {
            const glyph = createTestGlyph();
            const created = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            const updated = updateGrapheme(created.id, { notes: 'New notes' });

            expect(updated!.notes).toBe('New notes');
        });

        it('should update notes to null', () => {
            const glyph = createTestGlyph();
            const created = createGrapheme({
                name: 'Test',
                notes: 'Some notes',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            const updated = updateGrapheme(created.id, { notes: null });

            expect(updated!.notes).toBeNull();
        });

        it('should return current state when no fields provided', () => {
            const glyph = createTestGlyph();
            const created = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            const updated = updateGrapheme(created.id, {});

            expect(updated!.name).toBe('Test');
        });

        it('should return null for non-existent grapheme', () => {
            const result = updateGrapheme(99999, { name: 'Test' });

            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // GRAPHEME DELETION TESTS
    // =========================================================================

    describe('deleteGrapheme', () => {
        it('should delete existing grapheme', () => {
            const glyph = createTestGlyph();
            const created = createGrapheme({
                name: 'ToDelete',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            const result = deleteGrapheme(created.id);

            expect(result).toBe(true);
            expect(getGraphemeById(created.id)).toBeNull();
        });

        it('should return false for non-existent grapheme', () => {
            const result = deleteGrapheme(99999);

            expect(result).toBe(false);
        });

        it('should cascade delete phonemes', () => {
            const glyph = createTestGlyph();
            const created = createGrapheme({
                name: 'WithPhonemes',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [
                    { phoneme: 'a', use_in_auto_spelling: true },
                    { phoneme: 'b', use_in_auto_spelling: false }
                ]
            });
            const phonemeIds = created.phonemes.map(p => p.id);

            deleteGrapheme(created.id);

            phonemeIds.forEach(id => {
                expect(getPhonemeById(id)).toBeNull();
            });
        });

        it('should not delete the underlying glyph when grapheme is deleted', () => {
            const glyph = createTestGlyph('PreservedGlyph');
            const created = createGrapheme({
                name: 'ToDelete',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            deleteGrapheme(created.id);

            // Glyph should still exist
            expect(getGlyphById(glyph.id)).not.toBeNull();
        });

        it('should update count after deletion', () => {
            const glyph = createTestGlyph();
            createGrapheme({ name: 'One', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [] });
            const toDelete = createGrapheme({ name: 'Two', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [] });
            createGrapheme({ name: 'Three', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [] });

            expect(getGraphemeCount()).toBe(3);

            deleteGrapheme(toDelete.id);

            expect(getGraphemeCount()).toBe(2);
        });
    });

    // =========================================================================
    // GRAPHEME-GLYPH RELATIONSHIP TESTS
    // =========================================================================

    describe('getGlyphsByGraphemeId', () => {
        it('should return glyphs in position order', () => {
            const g1 = createTestGlyph('First');
            const g2 = createTestGlyph('Second');
            const g3 = createTestGlyph('Third');

            const grapheme = createGrapheme({
                name: 'OrderedGlyphs',
                glyphs: [
                    { glyph_id: g2.id, position: 1 },
                    { glyph_id: g1.id, position: 0 },
                    { glyph_id: g3.id, position: 2 }
                ],
                phonemes: []
            });

            const result = getGlyphsByGraphemeId(grapheme.id);

            expect(result[0].name).toBe('First');
            expect(result[1].name).toBe('Second');
            expect(result[2].name).toBe('Third');
        });

        it('should return empty array for non-existent grapheme', () => {
            const result = getGlyphsByGraphemeId(99999);

            expect(result).toEqual([]);
        });
    });

    describe('getGraphemeGlyphEntries', () => {
        it('should return junction table entries with position', () => {
            const glyph = createTestGlyph();

            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            const entries = getGraphemeGlyphEntries(grapheme.id);

            expect(entries).toHaveLength(1);
            expect(entries[0].grapheme_id).toBe(grapheme.id);
            expect(entries[0].glyph_id).toBe(glyph.id);
            expect(entries[0].position).toBe(0);
        });
    });

    describe('addGlyphToGrapheme', () => {
        it('should add a new glyph to existing grapheme', () => {
            const g1 = createTestGlyph('Original');
            const g2 = createTestGlyph('Added');

            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: g1.id, position: 0 }],
                phonemes: []
            });

            addGlyphToGrapheme(grapheme.id, { glyph_id: g2.id, position: 1 });

            const glyphs = getGlyphsByGraphemeId(grapheme.id);
            expect(glyphs).toHaveLength(2);
        });

        it('should support transform data', () => {
            const glyph = createTestGlyph();
            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            const g2 = createTestGlyph('Transformed');
            addGlyphToGrapheme(grapheme.id, {
                glyph_id: g2.id,
                position: 1,
                transform: 'rotate(45) scale(0.5)'
            });

            const entries = getGraphemeGlyphEntries(grapheme.id);
            const addedEntry = entries.find(e => e.glyph_id === g2.id);
            expect(addedEntry!.transform).toBe('rotate(45) scale(0.5)');
        });
    });

    describe('removeGlyphFromGrapheme', () => {
        it('should remove a glyph from grapheme', () => {
            const g1 = createTestGlyph('Keep');
            const g2 = createTestGlyph('Remove');

            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [
                    { glyph_id: g1.id, position: 0 },
                    { glyph_id: g2.id, position: 1 }
                ],
                phonemes: []
            });

            removeGlyphFromGrapheme(grapheme.id, g2.id);

            const glyphs = getGlyphsByGraphemeId(grapheme.id);
            expect(glyphs).toHaveLength(1);
            expect(glyphs[0].name).toBe('Keep');
        });

        it('should return false for non-existent relationship', () => {
            const result = removeGlyphFromGrapheme(99999, 88888);

            expect(result).toBe(false);
        });
    });

    describe('setGraphemeGlyphs', () => {
        it('should replace all glyphs for a grapheme', () => {
            const g1 = createTestGlyph('Original1');
            const g2 = createTestGlyph('Original2');
            const g3 = createTestGlyph('Replacement');

            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [
                    { glyph_id: g1.id, position: 0 },
                    { glyph_id: g2.id, position: 1 }
                ],
                phonemes: []
            });

            setGraphemeGlyphs(grapheme.id, [{ glyph_id: g3.id, position: 0 }]);

            const glyphs = getGlyphsByGraphemeId(grapheme.id);
            expect(glyphs).toHaveLength(1);
            expect(glyphs[0].id).toBe(g3.id);
        });
    });

    describe('reorderGraphemeGlyphs', () => {
        it('should change the order of glyphs', () => {
            const g1 = createTestGlyph('First');
            const g2 = createTestGlyph('Second');
            const g3 = createTestGlyph('Third');

            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [
                    { glyph_id: g1.id, position: 0 },
                    { glyph_id: g2.id, position: 1 },
                    { glyph_id: g3.id, position: 2 }
                ],
                phonemes: []
            });

            // Reorder: Third, First, Second
            reorderGraphemeGlyphs(grapheme.id, [g3.id, g1.id, g2.id]);

            const glyphs = getGlyphsByGraphemeId(grapheme.id);
            expect(glyphs[0].name).toBe('Third');
            expect(glyphs[1].name).toBe('First');
            expect(glyphs[2].name).toBe('Second');
        });
    });

    // =========================================================================
    // PHONEME CRUD TESTS
    // =========================================================================

    describe('addPhoneme', () => {
        it('should add phoneme to grapheme', () => {
            const glyph = createTestGlyph();
            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            const phoneme = addPhoneme(grapheme.id, {
                phoneme: 'test',
                use_in_auto_spelling: true
            });

            expect(phoneme.id).toBeGreaterThan(0);
            expect(phoneme.grapheme_id).toBe(grapheme.id);
            expect(phoneme.phoneme).toBe('test');
            expect(phoneme.use_in_auto_spelling).toBe(true);
        });

        it('should default use_in_auto_spelling to false', () => {
            const glyph = createTestGlyph();
            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            const phoneme = addPhoneme(grapheme.id, { phoneme: 'test' });

            expect(phoneme.use_in_auto_spelling).toBe(false);
        });

        it('should handle IPA characters', () => {
            const glyph = createTestGlyph();
            const grapheme = createGrapheme({
                name: 'IPA',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });
            const ipaChars = ['ʃ', 'ʒ', 'θ', 'ð', 'ŋ', 'æ', 'ɪ', 'ʊ', 'ə', 'ɑ'];

            ipaChars.forEach(char => {
                const phoneme = addPhoneme(grapheme.id, { phoneme: char });
                expect(phoneme.phoneme).toBe(char);
            });
        });

        it('should store context when provided', () => {
            const glyph = createTestGlyph();
            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            const phoneme = addPhoneme(grapheme.id, {
                phoneme: 'a',
                context: 'word-initial'
            });

            expect(phoneme.context).toBe('word-initial');
        });
    });

    describe('getPhonemesByGraphemeId', () => {
        it('should return all phonemes for grapheme', () => {
            const glyph = createTestGlyph();
            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [
                    { phoneme: 'a', use_in_auto_spelling: true },
                    { phoneme: 'b', use_in_auto_spelling: false },
                    { phoneme: 'c', use_in_auto_spelling: true }
                ]
            });

            const result = getPhonemesByGraphemeId(grapheme.id);

            expect(result).toHaveLength(3);
        });

        it('should return empty array for non-existent grapheme', () => {
            const result = getPhonemesByGraphemeId(99999);

            expect(result).toEqual([]);
        });
    });

    describe('updatePhoneme', () => {
        it('should update phoneme value', () => {
            const glyph = createTestGlyph();
            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });
            const phoneme = addPhoneme(grapheme.id, { phoneme: 'original' });

            const updated = updatePhoneme(phoneme.id, { phoneme: 'updated' });

            expect(updated!.phoneme).toBe('updated');
        });

        it('should update use_in_auto_spelling', () => {
            const glyph = createTestGlyph();
            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });
            const phoneme = addPhoneme(grapheme.id, { phoneme: 'a', use_in_auto_spelling: false });

            const updated = updatePhoneme(phoneme.id, { use_in_auto_spelling: true });

            expect(updated!.use_in_auto_spelling).toBe(true);
        });

        it('should return null for non-existent phoneme', () => {
            const result = updatePhoneme(99999, { phoneme: 'test' });

            expect(result).toBeNull();
        });
    });

    describe('deletePhoneme', () => {
        it('should delete existing phoneme', () => {
            const glyph = createTestGlyph();
            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });
            const phoneme = addPhoneme(grapheme.id, { phoneme: 'a' });

            const result = deletePhoneme(phoneme.id);

            expect(result).toBe(true);
            expect(getPhonemeById(phoneme.id)).toBeNull();
        });

        it('should not delete other phonemes', () => {
            const glyph = createTestGlyph();
            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });
            const p1 = addPhoneme(grapheme.id, { phoneme: 'a' });
            const p2 = addPhoneme(grapheme.id, { phoneme: 'b' });

            deletePhoneme(p1.id);

            expect(getPhonemeById(p2.id)).not.toBeNull();
        });

        it('should return false for non-existent phoneme', () => {
            const result = deletePhoneme(99999);

            expect(result).toBe(false);
        });
    });

    describe('deleteAllPhonemesForGrapheme', () => {
        it('should delete all phonemes for grapheme', () => {
            const glyph = createTestGlyph();
            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [
                    { phoneme: 'a' },
                    { phoneme: 'b' },
                    { phoneme: 'c' }
                ]
            });

            const deleted = deleteAllPhonemesForGrapheme(grapheme.id);

            expect(deleted).toBe(3);
            expect(getPhonemesByGraphemeId(grapheme.id)).toEqual([]);
        });

        it('should return 0 for grapheme with no phonemes', () => {
            const glyph = createTestGlyph();
            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            const deleted = deleteAllPhonemesForGrapheme(grapheme.id);

            expect(deleted).toBe(0);
        });
    });

    describe('getAutoSpellingPhonemes', () => {
        it('should return only phonemes with use_in_auto_spelling=true', () => {
            const glyph = createTestGlyph();

            createGrapheme({
                name: 'Test1',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [
                    { phoneme: 'a', use_in_auto_spelling: true },
                    { phoneme: 'b', use_in_auto_spelling: false }
                ]
            });
            createGrapheme({
                name: 'Test2',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [
                    { phoneme: 'c', use_in_auto_spelling: true },
                    { phoneme: 'd', use_in_auto_spelling: true }
                ]
            });

            const result = getAutoSpellingPhonemes();

            expect(result).toHaveLength(3);
            expect(result.every(p => p.use_in_auto_spelling)).toBe(true);
        });

        it('should return empty array when no auto-spelling phonemes', () => {
            const glyph = createTestGlyph();
            createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'a', use_in_auto_spelling: false }]
            });

            const result = getAutoSpellingPhonemes();

            expect(result).toEqual([]);
        });
    });

    // =========================================================================
    // GRAPHEME COUNT TEST
    // =========================================================================

    describe('getGraphemeCount', () => {
        it('should return 0 for empty database', () => {
            expect(getGraphemeCount()).toBe(0);
        });

        it('should return correct count', () => {
            const glyph = createTestGlyph();
            createGrapheme({ name: 'One', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [] });
            createGrapheme({ name: 'Two', glyphs: [{ glyph_id: glyph.id, position: 0 }], phonemes: [] });

            expect(getGraphemeCount()).toBe(2);
        });
    });

    // =========================================================================
    // EDGE CASES
    // =========================================================================

    describe('Edge Cases', () => {
        it('should handle duplicate grapheme names (allowed)', () => {
            const glyph = createTestGlyph();
            const g1 = createGrapheme({
                name: 'Duplicate',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });
            const g2 = createGrapheme({
                name: 'Duplicate',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            expect(g1.id).not.toBe(g2.id);
            expect(g1.name).toBe(g2.name);
        });

        it('should handle very long names', () => {
            const glyph = createTestGlyph();
            const longName = 'A'.repeat(1000);
            const grapheme = createGrapheme({
                name: longName,
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            expect(grapheme.name).toBe(longName);
        });

        it('should handle special SQL characters in data', () => {
            const glyph = createTestGlyph();
            const grapheme = createGrapheme({
                name: "Test's \"Name\"",
                notes: "Notes with 'quotes' and \"double quotes\"",
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            expect(grapheme.name).toBe("Test's \"Name\"");
            expect(grapheme.notes).toBe("Notes with 'quotes' and \"double quotes\"");
        });

        it('should handle phoneme with same value as grapheme name', () => {
            const glyph = createTestGlyph();
            const grapheme = createGrapheme({
                name: 'A',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'A', use_in_auto_spelling: true }]
            });

            expect(grapheme.phonemes[0].phoneme).toBe('A');
        });

        it('should handle adding many phonemes to one grapheme', () => {
            const glyph = createTestGlyph();
            const grapheme = createGrapheme({
                name: 'ManyPhonemes',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: []
            });

            for (let i = 0; i < 100; i++) {
                addPhoneme(grapheme.id, { phoneme: `phoneme${i}` });
            }

            const phonemes = getPhonemesByGraphemeId(grapheme.id);
            expect(phonemes).toHaveLength(100);
        });

        it('should handle a grapheme using the same glyph multiple times', () => {
            const glyph = createTestGlyph('Repeated');

            const grapheme = createGrapheme({
                name: 'RepeatedGlyph',
                glyphs: [
                    { glyph_id: glyph.id, position: 0 },
                    { glyph_id: glyph.id, position: 1 },
                    { glyph_id: glyph.id, position: 2 }
                ],
                phonemes: []
            });

            const glyphs = getGlyphsByGraphemeId(grapheme.id);
            expect(glyphs).toHaveLength(3);
            expect(glyphs.every(g => g.id === glyph.id)).toBe(true);
        });

        it('should handle rapid creation of many graphemes', () => {
            const glyph = createTestGlyph();
            const ids: number[] = [];

            for (let i = 0; i < 50; i++) {
                const g = createGrapheme({
                    name: `Rapid${i}`,
                    glyphs: [{ glyph_id: glyph.id, position: 0 }],
                    phonemes: []
                });
                ids.push(g.id);
            }

            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(50);

            ids.forEach(id => {
                expect(getGraphemeById(id)).not.toBeNull();
            });
        });
    });
});
