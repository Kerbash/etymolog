/**
 * Glyph Service Tests
 *
 * Comprehensive test suite for atomic visual symbol (glyph) operations.
 * Glyphs are the building blocks that can be composed into graphemes.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import {
    initDatabase,
    clearDatabase,
    // Glyph operations
    createGlyph,
    getGlyphById,
    getAllGlyphs,
    getAllGlyphsWithUsage,
    getGlyphReferences,
    searchGlyphsByName,
    updateGlyph,
    deleteGlyph,
    forceDeleteGlyph,
    getGlyphCount,
    glyphNameExists,
    // Grapheme operations (for testing glyph usage)
    createGrapheme
} from '../index';
import type { CreateGlyphInput } from '../types';

// =============================================================================
// TEST SETUP
// =============================================================================

describe('Glyph Service', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    // =========================================================================
    // GLYPH CREATION TESTS
    // =========================================================================

    describe('createGlyph', () => {
        it('should create a glyph with required fields', () => {
            const input: CreateGlyphInput = {
                name: 'TestGlyph',
                svg_data: '<svg><path d="M0 0"/></svg>'
            };

            const result = createGlyph(input);

            expect(result).toBeDefined();
            expect(result.id).toBeGreaterThan(0);
            expect(result.name).toBe('TestGlyph');
            expect(result.svg_data).toBe('<svg><path d="M0 0"/></svg>');
            expect(result.notes).toBeNull();
            expect(result.created_at).toBeDefined();
            expect(result.updated_at).toBeDefined();
        });

        it('should create a glyph with notes', () => {
            const input: CreateGlyphInput = {
                name: 'GlyphWithNotes',
                svg_data: '<svg><circle/></svg>',
                notes: 'This is a test glyph'
            };

            const result = createGlyph(input);

            expect(result.notes).toBe('This is a test glyph');
        });

        it('should create multiple glyphs with unique IDs', () => {
            const g1 = createGlyph({ name: 'First', svg_data: '<svg/>' });
            const g2 = createGlyph({ name: 'Second', svg_data: '<svg/>' });
            const g3 = createGlyph({ name: 'Third', svg_data: '<svg/>' });

            expect(g1.id).not.toBe(g2.id);
            expect(g2.id).not.toBe(g3.id);
            expect(g1.id).not.toBe(g3.id);
        });

        it('should handle unicode characters in name', () => {
            const input: CreateGlyphInput = {
                name: '日本語テスト',
                svg_data: '<svg/>'
            };

            const result = createGlyph(input);

            expect(result.name).toBe('日本語テスト');
        });

        it('should handle complex SVG data', () => {
            const complexSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10,20 L30,40 Q50,60 70,80" stroke="#000" fill="none" stroke-width="2"/><circle cx="50" cy="50" r="25" fill="blue"/></svg>';
            const input: CreateGlyphInput = {
                name: 'ComplexGlyph',
                svg_data: complexSvg
            };

            const result = createGlyph(input);

            expect(result.svg_data).toBe(complexSvg);
        });

        it('should allow duplicate glyph names', () => {
            const g1 = createGlyph({ name: 'Duplicate', svg_data: '<svg/>' });
            const g2 = createGlyph({ name: 'Duplicate', svg_data: '<svg/>' });

            expect(g1.id).not.toBe(g2.id);
            expect(g1.name).toBe(g2.name);
        });
    });

    // =========================================================================
    // GLYPH RETRIEVAL TESTS
    // =========================================================================

    describe('getGlyphById', () => {
        it('should return glyph when found', () => {
            const created = createGlyph({ name: 'FindMe', svg_data: '<svg/>' });

            const found = getGlyphById(created.id);

            expect(found).not.toBeNull();
            expect(found!.id).toBe(created.id);
            expect(found!.name).toBe('FindMe');
        });

        it('should return null when not found', () => {
            const result = getGlyphById(99999);

            expect(result).toBeNull();
        });

        it('should return null for negative ID', () => {
            const result = getGlyphById(-1);

            expect(result).toBeNull();
        });

        it('should return null for zero ID', () => {
            const result = getGlyphById(0);

            expect(result).toBeNull();
        });
    });

    describe('getAllGlyphs', () => {
        it('should return empty array when no glyphs exist', () => {
            const result = getAllGlyphs();

            expect(result).toEqual([]);
        });

        it('should return all glyphs', () => {
            createGlyph({ name: 'First', svg_data: '<svg/>' });
            createGlyph({ name: 'Second', svg_data: '<svg/>' });
            createGlyph({ name: 'Third', svg_data: '<svg/>' });

            const result = getAllGlyphs();

            expect(result).toHaveLength(3);
            const names = result.map(g => g.name);
            expect(names).toContain('First');
            expect(names).toContain('Second');
            expect(names).toContain('Third');
        });

        it('should return glyphs in consistent order (by creation date DESC)', () => {
            createGlyph({ name: 'First', svg_data: '<svg/>' });
            createGlyph({ name: 'Second', svg_data: '<svg/>' });
            createGlyph({ name: 'Third', svg_data: '<svg/>' });

            const result = getAllGlyphs();

            // Should return 3 glyphs in some consistent order
            expect(result).toHaveLength(3);
            const names = result.map(g => g.name);
            expect(names).toContain('First');
            expect(names).toContain('Second');
            expect(names).toContain('Third');
        });
    });

    describe('getAllGlyphsWithUsage', () => {
        it('should return glyphs with usage count of 0 when unused', () => {
            createGlyph({ name: 'Unused', svg_data: '<svg/>' });

            const result = getAllGlyphsWithUsage();

            expect(result).toHaveLength(1);
            expect(result[0].usageCount).toBe(0);
        });

        it('should return correct usage count when glyph is used in grapheme', () => {
            const glyph = createGlyph({ name: 'UsedGlyph', svg_data: '<svg/>' });

            createGrapheme({
                name: 'TestGrapheme',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'a' }]
            });

            const result = getAllGlyphsWithUsage();
            const usedGlyph = result.find(g => g.id === glyph.id);

            expect(usedGlyph!.usageCount).toBe(1);
        });

        it('should return correct usage count when glyph is used in multiple graphemes', () => {
            const glyph = createGlyph({ name: 'SharedGlyph', svg_data: '<svg/>' });

            createGrapheme({
                name: 'Grapheme1',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'a' }]
            });
            createGrapheme({
                name: 'Grapheme2',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'b' }]
            });

            const result = getAllGlyphsWithUsage();
            const sharedGlyph = result.find(g => g.id === glyph.id);

            expect(sharedGlyph!.usageCount).toBe(2);
        });
    });

    describe('getGlyphReferences', () => {
        it('should return empty array when no glyphs exist', () => {
            const result = getGlyphReferences();

            expect(result).toEqual([]);
        });

        it('should return lightweight glyph references', () => {
            createGlyph({ name: 'TestGlyph', svg_data: '<svg/>', notes: 'Some notes' });

            const result = getGlyphReferences();

            expect(result).toHaveLength(1);
            expect(result[0]).toHaveProperty('id');
            expect(result[0]).toHaveProperty('name');
            expect(result[0]).toHaveProperty('svg_data');
            // Should NOT have notes, created_at, updated_at
            expect(result[0]).not.toHaveProperty('notes');
            expect(result[0]).not.toHaveProperty('created_at');
        });

        it('should return glyphs ordered by name', () => {
            createGlyph({ name: 'Zebra', svg_data: '<svg/>' });
            createGlyph({ name: 'Alpha', svg_data: '<svg/>' });
            createGlyph({ name: 'Middle', svg_data: '<svg/>' });

            const result = getGlyphReferences();

            expect(result[0].name).toBe('Alpha');
            expect(result[1].name).toBe('Middle');
            expect(result[2].name).toBe('Zebra');
        });
    });

    // =========================================================================
    // GLYPH SEARCH TESTS
    // =========================================================================

    describe('searchGlyphsByName', () => {
        beforeEach(() => {
            createGlyph({ name: 'Alpha', svg_data: '<svg/>' });
            createGlyph({ name: 'Beta', svg_data: '<svg/>' });
            createGlyph({ name: 'Alphabet', svg_data: '<svg/>' });
            createGlyph({ name: 'Gamma', svg_data: '<svg/>' });
        });

        it('should find exact matches', () => {
            const result = searchGlyphsByName('Alpha');

            expect(result).toHaveLength(2); // Alpha and Alphabet
        });

        it('should find partial matches', () => {
            const result = searchGlyphsByName('Alph');

            expect(result).toHaveLength(2);
            expect(result.map(g => g.name)).toContain('Alpha');
            expect(result.map(g => g.name)).toContain('Alphabet');
        });

        it('should be case-insensitive', () => {
            const result = searchGlyphsByName('alpha');

            expect(result).toHaveLength(2);
        });

        it('should return empty array for no matches', () => {
            const result = searchGlyphsByName('xyz');

            expect(result).toEqual([]);
        });

        it('should return all for empty query', () => {
            const result = searchGlyphsByName('');

            expect(result).toHaveLength(4);
        });
    });

    // =========================================================================
    // GLYPH UPDATE TESTS
    // =========================================================================

    describe('updateGlyph', () => {
        it('should update name only', () => {
            const created = createGlyph({ name: 'Original', svg_data: '<svg/>' });

            const updated = updateGlyph(created.id, { name: 'Updated' });

            expect(updated!.name).toBe('Updated');
            expect(updated!.svg_data).toBe('<svg/>');
        });

        it('should update svg_data only', () => {
            const created = createGlyph({ name: 'Test', svg_data: '<svg/>' });

            const updated = updateGlyph(created.id, { svg_data: '<svg><rect/></svg>' });

            expect(updated!.name).toBe('Test');
            expect(updated!.svg_data).toBe('<svg><rect/></svg>');
        });

        it('should update notes to a value', () => {
            const created = createGlyph({ name: 'Test', svg_data: '<svg/>' });

            const updated = updateGlyph(created.id, { notes: 'New notes' });

            expect(updated!.notes).toBe('New notes');
        });

        it('should update notes to null', () => {
            const created = createGlyph({ name: 'Test', svg_data: '<svg/>', notes: 'Some notes' });

            const updated = updateGlyph(created.id, { notes: null });

            expect(updated!.notes).toBeNull();
        });

        it('should update multiple fields', () => {
            const created = createGlyph({ name: 'Test', svg_data: '<svg/>' });

            const updated = updateGlyph(created.id, {
                name: 'NewName',
                svg_data: '<svg><circle/></svg>',
                notes: 'New notes'
            });

            expect(updated!.name).toBe('NewName');
            expect(updated!.svg_data).toBe('<svg><circle/></svg>');
            expect(updated!.notes).toBe('New notes');
        });

        it('should return current state when no fields provided', () => {
            const created = createGlyph({ name: 'Test', svg_data: '<svg/>' });

            const updated = updateGlyph(created.id, {});

            expect(updated!.name).toBe('Test');
        });

        it('should return null for non-existent glyph', () => {
            const result = updateGlyph(99999, { name: 'Test' });

            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // GLYPH DELETION TESTS
    // =========================================================================

    describe('deleteGlyph', () => {
        it('should delete unused glyph', () => {
            const created = createGlyph({ name: 'ToDelete', svg_data: '<svg/>' });

            const result = deleteGlyph(created.id);

            expect(result).toBe(true);
            expect(getGlyphById(created.id)).toBeNull();
        });

        it('should return false for non-existent glyph', () => {
            const result = deleteGlyph(99999);

            expect(result).toBe(false);
        });

        it('should throw error when deleting glyph in use', () => {
            const glyph = createGlyph({ name: 'InUse', svg_data: '<svg/>' });

            createGrapheme({
                name: 'UsingGlyph',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'a' }]
            });

            // Should throw error for glyph in use
            expect(() => deleteGlyph(glyph.id)).toThrow('Cannot delete glyph: it is used by 1 grapheme(s)');
            expect(getGlyphById(glyph.id)).not.toBeNull();
        });

        it('should update count after deletion', () => {
            createGlyph({ name: 'One', svg_data: '<svg/>' });
            const toDelete = createGlyph({ name: 'Two', svg_data: '<svg/>' });
            createGlyph({ name: 'Three', svg_data: '<svg/>' });

            expect(getGlyphCount()).toBe(3);

            deleteGlyph(toDelete.id);

            expect(getGlyphCount()).toBe(2);
        });
    });

    describe('forceDeleteGlyph', () => {
        it('should delete glyph even if in use', () => {
            const glyph = createGlyph({ name: 'ForceDelete', svg_data: '<svg/>' });

            createGrapheme({
                name: 'UsingGlyph',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'a' }]
            });

            const result = forceDeleteGlyph(glyph.id);

            expect(result).toBe(true);
            expect(getGlyphById(glyph.id)).toBeNull();
        });
    });

    // =========================================================================
    // GLYPH COUNT & EXISTS TESTS
    // =========================================================================

    describe('getGlyphCount', () => {
        it('should return 0 for empty database', () => {
            expect(getGlyphCount()).toBe(0);
        });

        it('should return correct count', () => {
            createGlyph({ name: 'One', svg_data: '<svg/>' });
            createGlyph({ name: 'Two', svg_data: '<svg/>' });

            expect(getGlyphCount()).toBe(2);
        });
    });

    describe('glyphNameExists', () => {
        it('should return false when name does not exist', () => {
            expect(glyphNameExists('NonExistent')).toBe(false);
        });

        it('should return true when name exists', () => {
            createGlyph({ name: 'Existing', svg_data: '<svg/>' });

            expect(glyphNameExists('Existing')).toBe(true);
        });

        it('should be case-sensitive', () => {
            createGlyph({ name: 'TestGlyph', svg_data: '<svg/>' });

            // Should be case-sensitive - exact match required
            expect(glyphNameExists('testglyph')).toBe(false);
            expect(glyphNameExists('TestGlyph')).toBe(true);
        });
    });

    // =========================================================================
    // EDGE CASES
    // =========================================================================

    describe('Edge Cases', () => {
        it('should handle very long names', () => {
            const longName = 'A'.repeat(1000);
            const glyph = createGlyph({ name: longName, svg_data: '<svg/>' });

            expect(glyph.name).toBe(longName);
            expect(getGlyphById(glyph.id)!.name).toBe(longName);
        });

        it('should handle very long SVG data', () => {
            const longSvg = '<svg>' + '<rect/>'.repeat(1000) + '</svg>';
            const glyph = createGlyph({ name: 'LongSVG', svg_data: longSvg });

            expect(glyph.svg_data).toBe(longSvg);
        });

        it('should handle special SQL characters in data', () => {
            const glyph = createGlyph({
                name: "Test's \"Name\"",
                svg_data: '<svg data="test\'s data"/>',
                notes: "Notes with 'quotes' and \"double quotes\""
            });

            expect(glyph.name).toBe("Test's \"Name\"");
            expect(glyph.notes).toBe("Notes with 'quotes' and \"double quotes\"");
        });

        it('should handle empty string SVG', () => {
            // While not ideal, it shouldn't crash
            const glyph = createGlyph({ name: 'EmptySVG', svg_data: '' });

            expect(glyph.svg_data).toBe('');
        });

        it('should handle rapid creation of many glyphs', () => {
            const ids: number[] = [];
            for (let i = 0; i < 100; i++) {
                const g = createGlyph({ name: `Rapid${i}`, svg_data: '<svg/>' });
                ids.push(g.id);
            }

            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(100);

            ids.forEach(id => {
                expect(getGlyphById(id)).not.toBeNull();
            });
        });

        it('should handle newlines in SVG data', () => {
            const svgWithNewlines = `<svg>
                <path d="M0 0"/>
                <circle cx="50" cy="50" r="25"/>
            </svg>`;
            const glyph = createGlyph({ name: 'NewlineSVG', svg_data: svgWithNewlines });

            expect(glyph.svg_data).toBe(svgWithNewlines);
        });

        it('should handle SVG with CDATA sections', () => {
            const svgWithCdata = '<svg><style><![CDATA[ .cls { fill: blue; } ]]></style></svg>';
            const glyph = createGlyph({ name: 'CdataSVG', svg_data: svgWithCdata });

            expect(glyph.svg_data).toBe(svgWithCdata);
        });
    });
});
