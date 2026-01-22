/**
 * Edge Cases and Integration Tests
 *
 * Tests for complex scenarios, boundary conditions, and integration between
 * glyphs, graphemes, and phonemes.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import {
    initDatabase,
    clearDatabase,
    resetDatabase,
    // Glyph operations
    createGlyph,
    getGlyphById,
    getAllGlyphs,
    getAllGlyphsWithUsage,
    deleteGlyph,
    forceDeleteGlyph,
    getGlyphCount,
    // Grapheme operations
    createGrapheme,
    getGraphemeById,
    getGraphemeComplete,
    getAllGraphemesComplete,
    deleteGrapheme,
    getGraphemeCount,
    // Grapheme-Glyph relationships
    getGlyphsByGraphemeId,
    setGraphemeGlyphs,
    // Phoneme operations
    getPhonemeById,
    getPhonemesByGraphemeId,
    getAutoSpellingPhonemes
} from '../index';

// =============================================================================
// TEST SETUP
// =============================================================================

describe('Edge Cases and Integration Tests', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    // =========================================================================
    // GLYPH REUSABILITY TESTS
    // =========================================================================

    describe('Glyph Reusability', () => {
        it('should allow a single glyph to be shared across many graphemes', () => {
            const sharedGlyph = createGlyph({ name: 'SharedStroke', svg_data: '<svg><line/></svg>' });

            // Create 10 graphemes all using the same glyph
            const graphemeIds: number[] = [];
            for (let i = 0; i < 10; i++) {
                const grapheme = createGrapheme({
                    name: `Grapheme${i}`,
                    glyphs: [{ glyph_id: sharedGlyph.id, position: 0 }],
                    phonemes: [{ phoneme: `sound${i}` }]
                });
                graphemeIds.push(grapheme.id);
            }

            // Verify all graphemes reference the same glyph
            for (const graphemeId of graphemeIds) {
                const glyphs = getGlyphsByGraphemeId(graphemeId);
                expect(glyphs).toHaveLength(1);
                expect(glyphs[0].id).toBe(sharedGlyph.id);
            }

            // Verify usage count
            const glyphsWithUsage = getAllGlyphsWithUsage();
            const shared = glyphsWithUsage.find(g => g.id === sharedGlyph.id);
            expect(shared!.usageCount).toBe(10);
        });

        it('should throw error when deleting glyph used by graphemes', () => {
            const glyph = createGlyph({ name: 'UsedGlyph', svg_data: '<svg/>' });

            createGrapheme({
                name: 'UsingGrapheme',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'a' }]
            });

            // Should throw error since glyph is in use
            expect(() => deleteGlyph(glyph.id)).toThrow('Cannot delete glyph: it is used by 1 grapheme(s)');

            // Glyph should still exist
            expect(getGlyphById(glyph.id)).not.toBeNull();
        });

        it('should allow force deletion of glyph even when used', () => {
            const glyph = createGlyph({ name: 'ForceDeleteMe', svg_data: '<svg/>' });

            const grapheme = createGrapheme({
                name: 'UsingGrapheme',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'a' }]
            });

            // Force delete - should succeed
            const result = forceDeleteGlyph(glyph.id);
            expect(result).toBe(true);

            // Glyph should be gone
            expect(getGlyphById(glyph.id)).toBeNull();

            // Grapheme should still exist but have no glyphs
            const glyphs = getGlyphsByGraphemeId(grapheme.id);
            expect(glyphs).toHaveLength(0);
        });

        it('should handle glyph deletion when used in multiple graphemes', () => {
            const glyph = createGlyph({ name: 'MultiUse', svg_data: '<svg/>' });

            const g1 = createGrapheme({
                name: 'G1',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'a' }]
            });
            const g2 = createGrapheme({
                name: 'G2',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'b' }]
            });

            // Force delete
            forceDeleteGlyph(glyph.id);

            // Both graphemes should have no glyphs now
            expect(getGlyphsByGraphemeId(g1.id)).toHaveLength(0);
            expect(getGlyphsByGraphemeId(g2.id)).toHaveLength(0);
        });
    });

    // =========================================================================
    // GRAPHEME COMPOSITION TESTS
    // =========================================================================

    describe('Grapheme Composition', () => {
        it('should create a complex grapheme with multiple glyphs', () => {
            // Create component glyphs
            const vertical = createGlyph({ name: 'VerticalLine', svg_data: '<svg><line x1="50" y1="0" x2="50" y2="100"/></svg>' });
            const horizontal = createGlyph({ name: 'HorizontalLine', svg_data: '<svg><line x1="0" y1="50" x2="100" y2="50"/></svg>' });
            const dot = createGlyph({ name: 'Dot', svg_data: '<svg><circle cx="50" cy="50" r="5"/></svg>' });

            // Create a grapheme composed of all three
            const grapheme = createGrapheme({
                name: 'ComplexChar',
                glyphs: [
                    { glyph_id: vertical.id, position: 0 },
                    { glyph_id: horizontal.id, position: 1 },
                    { glyph_id: dot.id, position: 2 }
                ],
                phonemes: [{ phoneme: 'kχ', use_in_auto_spelling: true }]
            });

            const result = getGraphemeComplete(grapheme.id);

            expect(result).not.toBeNull();
            expect(result!.glyphs).toHaveLength(3);
            expect(result!.glyphs[0].name).toBe('VerticalLine');
            expect(result!.glyphs[1].name).toBe('HorizontalLine');
            expect(result!.glyphs[2].name).toBe('Dot');
        });

        it('should correctly maintain glyph order across operations', () => {
            const g1 = createGlyph({ name: 'First', svg_data: '<svg/>' });
            const g2 = createGlyph({ name: 'Second', svg_data: '<svg/>' });
            const g3 = createGlyph({ name: 'Third', svg_data: '<svg/>' });

            const grapheme = createGrapheme({
                name: 'Ordered',
                glyphs: [
                    { glyph_id: g3.id, position: 2 },  // Out of order input
                    { glyph_id: g1.id, position: 0 },
                    { glyph_id: g2.id, position: 1 }
                ],
                phonemes: []
            });

            // Should be retrieved in position order
            const glyphs = getGlyphsByGraphemeId(grapheme.id);
            expect(glyphs[0].name).toBe('First');
            expect(glyphs[1].name).toBe('Second');
            expect(glyphs[2].name).toBe('Third');
        });

        it('should handle replacing glyphs in a grapheme', () => {
            const originalGlyph = createGlyph({ name: 'Original', svg_data: '<svg/>' });
            const newGlyph1 = createGlyph({ name: 'New1', svg_data: '<svg/>' });
            const newGlyph2 = createGlyph({ name: 'New2', svg_data: '<svg/>' });

            const grapheme = createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: originalGlyph.id, position: 0 }],
                phonemes: []
            });

            // Replace with different glyphs
            setGraphemeGlyphs(grapheme.id, [
                { glyph_id: newGlyph1.id, position: 0 },
                { glyph_id: newGlyph2.id, position: 1 }
            ]);

            const glyphs = getGlyphsByGraphemeId(grapheme.id);
            expect(glyphs).toHaveLength(2);
            expect(glyphs[0].name).toBe('New1');
            expect(glyphs[1].name).toBe('New2');
        });

        it('should handle the same glyph at multiple positions', () => {
            const dot = createGlyph({ name: 'Dot', svg_data: '<svg><circle r="5"/></svg>' });

            // A grapheme that uses the same dot glyph 3 times (like a colon character)
            const grapheme = createGrapheme({
                name: 'ThreeDots',
                glyphs: [
                    { glyph_id: dot.id, position: 0 },
                    { glyph_id: dot.id, position: 1 },
                    { glyph_id: dot.id, position: 2 }
                ],
                phonemes: [{ phoneme: '…' }]
            });

            const glyphs = getGlyphsByGraphemeId(grapheme.id);
            expect(glyphs).toHaveLength(3);
            expect(glyphs.every(g => g.id === dot.id)).toBe(true);
        });
    });

    // =========================================================================
    // PHONEME RELATIONSHIP TESTS
    // =========================================================================

    describe('Phoneme Relationships', () => {
        it('should support multiple pronunciations for one grapheme', () => {
            const glyph = createGlyph({ name: 'A', svg_data: '<svg/>' });

            const grapheme = createGrapheme({
                name: 'LetterA',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [
                    { phoneme: 'æ', context: 'in "cat"', use_in_auto_spelling: true },
                    { phoneme: 'eɪ', context: 'in "date"', use_in_auto_spelling: false },
                    { phoneme: 'ɑː', context: 'in "father"', use_in_auto_spelling: false },
                    { phoneme: 'ə', context: 'unstressed', use_in_auto_spelling: false }
                ]
            });

            const result = getGraphemeComplete(grapheme.id);
            expect(result!.phonemes).toHaveLength(4);
        });

        it('should correctly track auto-spelling phonemes across graphemes', () => {
            const g1 = createGlyph({ name: 'G1', svg_data: '<svg/>' });
            const g2 = createGlyph({ name: 'G2', svg_data: '<svg/>' });

            createGrapheme({
                name: 'First',
                glyphs: [{ glyph_id: g1.id, position: 0 }],
                phonemes: [
                    { phoneme: 'a', use_in_auto_spelling: true },
                    { phoneme: 'ä', use_in_auto_spelling: false }
                ]
            });

            createGrapheme({
                name: 'Second',
                glyphs: [{ glyph_id: g2.id, position: 0 }],
                phonemes: [
                    { phoneme: 'b', use_in_auto_spelling: true },
                    { phoneme: 'p', use_in_auto_spelling: true }
                ]
            });

            const autoSpelling = getAutoSpellingPhonemes();
            expect(autoSpelling).toHaveLength(3); // 'a', 'b', 'p'
            expect(autoSpelling.map(p => p.phoneme)).toContain('a');
            expect(autoSpelling.map(p => p.phoneme)).toContain('b');
            expect(autoSpelling.map(p => p.phoneme)).toContain('p');
        });

        it('should cascade delete phonemes when grapheme is deleted', () => {
            const glyph = createGlyph({ name: 'Test', svg_data: '<svg/>' });

            const grapheme = createGrapheme({
                name: 'WithPhonemes',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [
                    { phoneme: 'a', use_in_auto_spelling: true },
                    { phoneme: 'b', use_in_auto_spelling: false },
                    { phoneme: 'c', use_in_auto_spelling: true }
                ]
            });

            const phonemeIds = grapheme.phonemes.map(p => p.id);

            // Delete the grapheme
            deleteGrapheme(grapheme.id);

            // All phonemes should be deleted
            for (const id of phonemeIds) {
                expect(getPhonemeById(id)).toBeNull();
            }
        });
    });

    // =========================================================================
    // BOUNDARY CONDITIONS
    // =========================================================================

    describe('Boundary Conditions', () => {
        it('should handle empty database operations gracefully', () => {
            expect(getAllGlyphs()).toEqual([]);
            expect(getAllGraphemesComplete()).toEqual([]);
            expect(getAutoSpellingPhonemes()).toEqual([]);
            expect(getGlyphCount()).toBe(0);
            expect(getGraphemeCount()).toBe(0);
        });

        it('should handle non-existent IDs gracefully', () => {
            expect(getGlyphById(99999)).toBeNull();
            expect(getGraphemeById(99999)).toBeNull();
            expect(getGraphemeComplete(99999)).toBeNull();
            expect(getPhonemeById(99999)).toBeNull();
            expect(getGlyphsByGraphemeId(99999)).toEqual([]);
            expect(getPhonemesByGraphemeId(99999)).toEqual([]);
        });

        it('should handle very large position numbers', () => {
            const glyph = createGlyph({ name: 'Test', svg_data: '<svg/>' });

            const grapheme = createGrapheme({
                name: 'LargePosition',
                glyphs: [
                    { glyph_id: glyph.id, position: 999999 }
                ],
                phonemes: []
            });

            const glyphs = getGlyphsByGraphemeId(grapheme.id);
            expect(glyphs).toHaveLength(1);
        });

        it('should handle negative position numbers', () => {
            const glyph = createGlyph({ name: 'Test', svg_data: '<svg/>' });

            const grapheme = createGrapheme({
                name: 'NegativePosition',
                glyphs: [
                    { glyph_id: glyph.id, position: -1 }
                ],
                phonemes: []
            });

            const glyphs = getGlyphsByGraphemeId(grapheme.id);
            expect(glyphs).toHaveLength(1);
        });

        it('should handle extremely long strings', () => {
            const longString = 'X'.repeat(10000);

            const glyph = createGlyph({
                name: longString,
                svg_data: `<svg>${longString}</svg>`,
                notes: longString
            });

            expect(glyph.name.length).toBe(10000);
            expect(glyph.svg_data.length).toBe(10011); // '<svg>' + 10000 + '</svg>'
        });

        it('should handle unicode and emoji', () => {
            const glyph = createGlyph({
                name: '象形文字🔤',
                svg_data: '<svg><!-- 测试 --></svg>',
                notes: 'Notes with émojis: 🎨✏️📝'
            });

            expect(glyph.name).toBe('象形文字🔤');
            expect(glyph.notes).toBe('Notes with émojis: 🎨✏️📝');

            const grapheme = createGrapheme({
                name: '音节',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'ɕiɑŋ', context: '在"象"中' }]
            });

            expect(grapheme.phonemes[0].context).toBe('在"象"中');
        });
    });

    // =========================================================================
    // DATABASE RESET TESTS
    // =========================================================================

    describe('Database Management', () => {
        it('should clear all data with clearDatabase', () => {
            const glyph = createGlyph({ name: 'Test', svg_data: '<svg/>' });
            createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'a' }]
            });

            clearDatabase();

            expect(getGlyphCount()).toBe(0);
            expect(getGraphemeCount()).toBe(0);
            expect(getAutoSpellingPhonemes()).toEqual([]);
        });

        it('should reset database to fresh state', () => {
            const glyph = createGlyph({ name: 'Test', svg_data: '<svg/>' });
            createGrapheme({
                name: 'Test',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'a' }]
            });

            resetDatabase();

            // Should be able to create new data after reset
            const newGlyph = createGlyph({ name: 'NewAfterReset', svg_data: '<svg/>' });
            expect(newGlyph.id).toBeGreaterThan(0);
        });
    });

    // =========================================================================
    // CONCURRENT-LIKE OPERATIONS
    // =========================================================================

    describe('Rapid Sequential Operations', () => {
        it('should handle creating many glyphs rapidly', () => {
            const count = 100;
            const ids: number[] = [];

            for (let i = 0; i < count; i++) {
                const glyph = createGlyph({
                    name: `Rapid${i}`,
                    svg_data: `<svg><text>${i}</text></svg>`
                });
                ids.push(glyph.id);
            }

            expect(new Set(ids).size).toBe(count);
            expect(getGlyphCount()).toBe(count);
        });

        it('should handle creating many graphemes with shared glyphs', () => {
            const glyph = createGlyph({ name: 'Shared', svg_data: '<svg/>' });
            const count = 50;
            const ids: number[] = [];

            for (let i = 0; i < count; i++) {
                const grapheme = createGrapheme({
                    name: `Grapheme${i}`,
                    glyphs: [{ glyph_id: glyph.id, position: 0 }],
                    phonemes: [{ phoneme: `ph${i}` }]
                });
                ids.push(grapheme.id);
            }

            expect(new Set(ids).size).toBe(count);
            expect(getGraphemeCount()).toBe(count);

            // Verify glyph usage count
            const glyphsWithUsage = getAllGlyphsWithUsage();
            expect(glyphsWithUsage[0].usageCount).toBe(count);
        });

        it('should handle interleaved create and delete operations', () => {
            const glyph = createGlyph({ name: 'Test', svg_data: '<svg/>' });

            for (let i = 0; i < 20; i++) {
                const grapheme = createGrapheme({
                    name: `Temp${i}`,
                    glyphs: [{ glyph_id: glyph.id, position: 0 }],
                    phonemes: []
                });

                if (i % 2 === 0) {
                    deleteGrapheme(grapheme.id);
                }
            }

            // Should have 10 graphemes remaining
            expect(getGraphemeCount()).toBe(10);
        });
    });

    // =========================================================================
    // DATA INTEGRITY TESTS
    // =========================================================================

    describe('Data Integrity', () => {
        it('should maintain referential integrity after grapheme deletion', () => {
            const glyph = createGlyph({ name: 'Test', svg_data: '<svg/>' });

            const grapheme = createGrapheme({
                name: 'ToDelete',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'a', use_in_auto_spelling: true }]
            });

            deleteGrapheme(grapheme.id);

            // Glyph should still exist
            expect(getGlyphById(glyph.id)).not.toBeNull();

            // But grapheme and its phonemes should be gone
            expect(getGraphemeById(grapheme.id)).toBeNull();
            expect(getPhonemesByGraphemeId(grapheme.id)).toEqual([]);
        });

        it('should correctly count after mixed operations', () => {
            // Create some glyphs
            const g1 = createGlyph({ name: 'G1', svg_data: '<svg/>' });
            const g2 = createGlyph({ name: 'G2', svg_data: '<svg/>' });
            const g3 = createGlyph({ name: 'G3', svg_data: '<svg/>' });

            // Create graphemes
            createGrapheme({
                name: 'GR1',
                glyphs: [{ glyph_id: g1.id, position: 0 }],
                phonemes: [{ phoneme: 'a' }]
            });
            const gr2 = createGrapheme({
                name: 'GR2',
                glyphs: [{ glyph_id: g2.id, position: 0 }],
                phonemes: [{ phoneme: 'b' }, { phoneme: 'c' }]
            });
            createGrapheme({
                name: 'GR3',
                glyphs: [{ glyph_id: g3.id, position: 0 }],
                phonemes: []
            });

            // Delete one glyph (unused after gr2 is deleted)
            deleteGrapheme(gr2.id);
            deleteGlyph(g2.id);

            // Verify counts
            expect(getGlyphCount()).toBe(2);
            expect(getGraphemeCount()).toBe(2);
        });
    });
});
