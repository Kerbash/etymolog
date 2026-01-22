/**
 * Grapheme Service Tests
 *
 * Comprehensive test suite covering all CRUD operations and edge cases
 * for graphemes (script characters) and phonemes (pronunciations).
 *
 * Test Categories:
 * 1. Database Initialization
 * 2. Grapheme CRUD Operations
 * 3. Phoneme CRUD Operations
 * 4. Form Handler Integration
 * 5. Edge Cases & Error Handling
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

// Import database operations
import {
    initDatabase,
    clearDatabase,
    createGrapheme,
    getGraphemeById,
    getGraphemeWithPhonemes,
    getAllGraphemes,
    getAllGraphemesWithPhonemes,
    searchGraphemesByName,
    updateGrapheme,
    deleteGrapheme,
    getGraphemeCount,
    addPhoneme,
    getPhonemeById,
    getPhonemesByGraphemeId,
    updatePhoneme,
    deletePhoneme,
    deleteAllPhonemesForGrapheme,
    getAutoSpellingPhonemes,
    transformFormToGraphemeInput,
    saveLogogram,
    validateLogogramForm
} from '../index';
import type { LogogramFormData, CreateGraphemeInput } from '../types';

// =============================================================================
// TEST SETUP
// =============================================================================

describe('Grapheme Service', () => {
    beforeAll(async () => {
        // Initialize the database before all tests
        await initDatabase();
    });

    beforeEach(() => {
        // Clear database before each test for isolation
        clearDatabase();
    });

    // =========================================================================
    // GRAPHEME CRUD TESTS
    // =========================================================================

    describe('createGrapheme', () => {
        it('should create a grapheme without phonemes', () => {
            const input: CreateGraphemeInput = {
                name: 'TestChar',
                svg_data: '<svg><path d="M0 0"/></svg>',
                notes: 'Test notes'
            };

            const result = createGrapheme(input);

            expect(result).toBeDefined();
            expect(result.id).toBeGreaterThan(0);
            expect(result.name).toBe('TestChar');
            expect(result.svg_data).toBe('<svg><path d="M0 0"/></svg>');
            expect(result.notes).toBe('Test notes');
            expect(result.phonemes).toEqual([]);
            expect(result.created_at).toBeDefined();
            expect(result.updated_at).toBeDefined();
        });

        it('should create a grapheme with phonemes', () => {
            const input: CreateGraphemeInput = {
                name: 'A',
                svg_data: '<svg><circle/></svg>',
                phonemes: [
                    { phoneme: 'a', use_in_auto_spelling: true },
                    { phoneme: 'æ', use_in_auto_spelling: false }
                ]
            };

            const result = createGrapheme(input);

            expect(result.name).toBe('A');
            expect(result.phonemes).toHaveLength(2);
            expect(result.phonemes[0].phoneme).toBe('a');
            expect(result.phonemes[0].use_in_auto_spelling).toBe(true);
            expect(result.phonemes[1].phoneme).toBe('æ');
            expect(result.phonemes[1].use_in_auto_spelling).toBe(false);
        });

        it('should create a grapheme with empty notes', () => {
            const input: CreateGraphemeInput = {
                name: 'NoNotes',
                svg_data: '<svg/>'
            };

            const result = createGrapheme(input);

            expect(result.notes).toBeNull();
        });

        it('should create multiple graphemes with unique IDs', () => {
            const g1 = createGrapheme({ name: 'First', svg_data: '<svg/>' });
            const g2 = createGrapheme({ name: 'Second', svg_data: '<svg/>' });
            const g3 = createGrapheme({ name: 'Third', svg_data: '<svg/>' });

            expect(g1.id).not.toBe(g2.id);
            expect(g2.id).not.toBe(g3.id);
            expect(g1.id).not.toBe(g3.id);
        });

        it('should handle unicode characters in name', () => {
            const input: CreateGraphemeInput = {
                name: '日本語テスト',
                svg_data: '<svg/>'
            };

            const result = createGrapheme(input);

            expect(result.name).toBe('日本語テスト');
        });

        it('should handle special characters in svg_data', () => {
            const complexSvg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M10,20 L30,40" stroke="#000" fill="none"/></svg>';
            const input: CreateGraphemeInput = {
                name: 'Complex',
                svg_data: complexSvg
            };

            const result = createGrapheme(input);

            expect(result.svg_data).toBe(complexSvg);
        });
    });

    describe('getGraphemeById', () => {
        it('should return grapheme when found', () => {
            const created = createGrapheme({ name: 'FindMe', svg_data: '<svg/>' });

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

    describe('getGraphemeWithPhonemes', () => {
        it('should return grapheme with empty phonemes array', () => {
            const created = createGrapheme({ name: 'NoPho', svg_data: '<svg/>' });

            const result = getGraphemeWithPhonemes(created.id);

            expect(result).not.toBeNull();
            expect(result!.phonemes).toEqual([]);
        });

        it('should return grapheme with all phonemes', () => {
            const created = createGrapheme({
                name: 'WithPho',
                svg_data: '<svg/>',
                phonemes: [
                    { phoneme: 'p', use_in_auto_spelling: true },
                    { phoneme: 'b', use_in_auto_spelling: false }
                ]
            });

            const result = getGraphemeWithPhonemes(created.id);

            expect(result!.phonemes).toHaveLength(2);
        });

        it('should return null for non-existent grapheme', () => {
            const result = getGraphemeWithPhonemes(99999);

            expect(result).toBeNull();
        });
    });

    describe('getAllGraphemes', () => {
        it('should return empty array when no graphemes exist', () => {
            const result = getAllGraphemes();

            expect(result).toEqual([]);
        });

        it('should return all graphemes', () => {
            createGrapheme({ name: 'First', svg_data: '<svg/>' });
            createGrapheme({ name: 'Second', svg_data: '<svg/>' });
            createGrapheme({ name: 'Third', svg_data: '<svg/>' });

            const result = getAllGraphemes();

            expect(result).toHaveLength(3);
            // Check all items exist (order may vary based on timestamp precision)
            const names = result.map(g => g.name);
            expect(names).toContain('First');
            expect(names).toContain('Second');
            expect(names).toContain('Third');
        });
    });

    describe('getAllGraphemesWithPhonemes', () => {
        it('should return all graphemes with their phonemes', () => {
            createGrapheme({
                name: 'WithPho',
                svg_data: '<svg/>',
                phonemes: [{ phoneme: 'a', use_in_auto_spelling: true }]
            });
            createGrapheme({ name: 'NoPho', svg_data: '<svg/>' });

            const result = getAllGraphemesWithPhonemes();

            expect(result).toHaveLength(2);
            const withPho = result.find(g => g.name === 'WithPho');
            const noPho = result.find(g => g.name === 'NoPho');
            expect(withPho!.phonemes).toHaveLength(1);
            expect(noPho!.phonemes).toHaveLength(0);
        });
    });

    describe('searchGraphemesByName', () => {
        beforeEach(() => {
            createGrapheme({ name: 'Alpha', svg_data: '<svg/>' });
            createGrapheme({ name: 'Beta', svg_data: '<svg/>' });
            createGrapheme({ name: 'Alphabet', svg_data: '<svg/>' });
            createGrapheme({ name: 'Gamma', svg_data: '<svg/>' });
        });

        it('should find matches containing search term', () => {
            // "Alpha" matches both "Alpha" and "Alphabet" (LIKE '%Alpha%')
            const result = searchGraphemesByName('Alpha');

            expect(result).toHaveLength(2);
            expect(result.map(g => g.name)).toContain('Alpha');
            expect(result.map(g => g.name)).toContain('Alphabet');
        });

        it('should find partial matches', () => {
            const result = searchGraphemesByName('Alph');

            expect(result).toHaveLength(2);
            expect(result.map(g => g.name)).toContain('Alpha');
            expect(result.map(g => g.name)).toContain('Alphabet');
        });

        it('should be case-insensitive', () => {
            // "alpha" should match "Alpha" and "Alphabet" (case-insensitive LIKE)
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

    describe('updateGrapheme', () => {
        it('should update name only', () => {
            const created = createGrapheme({ name: 'Original', svg_data: '<svg/>' });

            const updated = updateGrapheme(created.id, { name: 'Updated' });

            expect(updated!.name).toBe('Updated');
            expect(updated!.svg_data).toBe('<svg/>');
        });

        it('should update svg_data only', () => {
            const created = createGrapheme({ name: 'Test', svg_data: '<svg/>' });

            const updated = updateGrapheme(created.id, { svg_data: '<svg><rect/></svg>' });

            expect(updated!.name).toBe('Test');
            expect(updated!.svg_data).toBe('<svg><rect/></svg>');
        });

        it('should update notes to null', () => {
            const created = createGrapheme({ name: 'Test', svg_data: '<svg/>', notes: 'Some notes' });

            const updated = updateGrapheme(created.id, { notes: null });

            expect(updated!.notes).toBeNull();
        });

        it('should update multiple fields', () => {
            const created = createGrapheme({ name: 'Test', svg_data: '<svg/>' });

            const updated = updateGrapheme(created.id, {
                name: 'NewName',
                svg_data: '<svg><circle/></svg>',
                notes: 'New notes'
            });

            expect(updated!.name).toBe('NewName');
            expect(updated!.svg_data).toBe('<svg><circle/></svg>');
            expect(updated!.notes).toBe('New notes');
        });

        it('should return current state when no fields provided', () => {
            const created = createGrapheme({ name: 'Test', svg_data: '<svg/>' });

            const updated = updateGrapheme(created.id, {});

            expect(updated!.name).toBe('Test');
        });

        it('should return null for non-existent grapheme', () => {
            const result = updateGrapheme(99999, { name: 'Test' });

            expect(result).toBeNull();
        });

        it('should have updated_at field set', () => {
            const created = createGrapheme({ name: 'Test', svg_data: '<svg/>' });

            const updated = updateGrapheme(created.id, { name: 'NewName' });

            // Verify updated_at is set (may or may not change within same second)
            expect(updated!.updated_at).toBeDefined();
            expect(typeof updated!.updated_at).toBe('string');
        });
    });

    describe('deleteGrapheme', () => {
        it('should delete existing grapheme', () => {
            const created = createGrapheme({ name: 'ToDelete', svg_data: '<svg/>' });

            const result = deleteGrapheme(created.id);

            expect(result).toBe(true);
            expect(getGraphemeById(created.id)).toBeNull();
        });

        it('should return false for non-existent grapheme', () => {
            const result = deleteGrapheme(99999);

            expect(result).toBe(false);
        });

        it('should cascade delete phonemes', () => {
            const created = createGrapheme({
                name: 'WithPhonemes',
                svg_data: '<svg/>',
                phonemes: [
                    { phoneme: 'a', use_in_auto_spelling: true },
                    { phoneme: 'b', use_in_auto_spelling: false }
                ]
            });
            const phonemeIds = created.phonemes.map(p => p.id);

            deleteGrapheme(created.id);

            // Verify phonemes are also deleted
            phonemeIds.forEach(id => {
                expect(getPhonemeById(id)).toBeNull();
            });
        });

        it('should update count after deletion', () => {
            createGrapheme({ name: 'One', svg_data: '<svg/>' });
            const toDelete = createGrapheme({ name: 'Two', svg_data: '<svg/>' });
            createGrapheme({ name: 'Three', svg_data: '<svg/>' });

            expect(getGraphemeCount()).toBe(3);

            deleteGrapheme(toDelete.id);

            expect(getGraphemeCount()).toBe(2);
        });
    });

    describe('getGraphemeCount', () => {
        it('should return 0 for empty database', () => {
            expect(getGraphemeCount()).toBe(0);
        });

        it('should return correct count', () => {
            createGrapheme({ name: 'One', svg_data: '<svg/>' });
            createGrapheme({ name: 'Two', svg_data: '<svg/>' });

            expect(getGraphemeCount()).toBe(2);
        });
    });

    // =========================================================================
    // PHONEME CRUD TESTS
    // =========================================================================

    describe('addPhoneme', () => {
        it('should add phoneme to grapheme', () => {
            const grapheme = createGrapheme({ name: 'Test', svg_data: '<svg/>' });

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
            const grapheme = createGrapheme({ name: 'Test', svg_data: '<svg/>' });

            const phoneme = addPhoneme(grapheme.id, { phoneme: 'test' });

            expect(phoneme.use_in_auto_spelling).toBe(false);
        });

        it('should handle IPA characters', () => {
            const grapheme = createGrapheme({ name: 'IPA', svg_data: '<svg/>' });
            const ipaChars = ['ʃ', 'ʒ', 'θ', 'ð', 'ŋ', 'æ', 'ɪ', 'ʊ', 'ə', 'ɑ'];

            ipaChars.forEach(char => {
                const phoneme = addPhoneme(grapheme.id, { phoneme: char });
                expect(phoneme.phoneme).toBe(char);
            });
        });

        it('should handle empty context', () => {
            const grapheme = createGrapheme({ name: 'Test', svg_data: '<svg/>' });

            const phoneme = addPhoneme(grapheme.id, { phoneme: 'a' });

            expect(phoneme.context).toBeNull();
        });

        it('should store context when provided', () => {
            const grapheme = createGrapheme({ name: 'Test', svg_data: '<svg/>' });

            const phoneme = addPhoneme(grapheme.id, {
                phoneme: 'a',
                context: 'word-initial'
            });

            expect(phoneme.context).toBe('word-initial');
        });
    });

    describe('getPhonemesByGraphemeId', () => {
        it('should return empty array for grapheme with no phonemes', () => {
            const grapheme = createGrapheme({ name: 'Test', svg_data: '<svg/>' });

            const result = getPhonemesByGraphemeId(grapheme.id);

            expect(result).toEqual([]);
        });

        it('should return all phonemes for grapheme', () => {
            const grapheme = createGrapheme({
                name: 'Test',
                svg_data: '<svg/>',
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
            const grapheme = createGrapheme({ name: 'Test', svg_data: '<svg/>' });
            const phoneme = addPhoneme(grapheme.id, { phoneme: 'original' });

            const updated = updatePhoneme(phoneme.id, { phoneme: 'updated' });

            expect(updated!.phoneme).toBe('updated');
        });

        it('should update use_in_auto_spelling', () => {
            const grapheme = createGrapheme({ name: 'Test', svg_data: '<svg/>' });
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
            const grapheme = createGrapheme({ name: 'Test', svg_data: '<svg/>' });
            const phoneme = addPhoneme(grapheme.id, { phoneme: 'a' });

            const result = deletePhoneme(phoneme.id);

            expect(result).toBe(true);
            expect(getPhonemeById(phoneme.id)).toBeNull();
        });

        it('should not delete other phonemes', () => {
            const grapheme = createGrapheme({ name: 'Test', svg_data: '<svg/>' });
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
            const grapheme = createGrapheme({
                name: 'Test',
                svg_data: '<svg/>',
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
            const grapheme = createGrapheme({ name: 'Test', svg_data: '<svg/>' });

            const deleted = deleteAllPhonemesForGrapheme(grapheme.id);

            expect(deleted).toBe(0);
        });
    });

    describe('getAutoSpellingPhonemes', () => {
        it('should return only phonemes with use_in_auto_spelling=true', () => {
            createGrapheme({
                name: 'Test1',
                svg_data: '<svg/>',
                phonemes: [
                    { phoneme: 'a', use_in_auto_spelling: true },
                    { phoneme: 'b', use_in_auto_spelling: false }
                ]
            });
            createGrapheme({
                name: 'Test2',
                svg_data: '<svg/>',
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
            createGrapheme({
                name: 'Test',
                svg_data: '<svg/>',
                phonemes: [{ phoneme: 'a', use_in_auto_spelling: false }]
            });

            const result = getAutoSpellingPhonemes();

            expect(result).toEqual([]);
        });
    });

    // =========================================================================
    // FORM HANDLER TESTS
    // =========================================================================

    describe('transformFormToGraphemeInput', () => {
        it('should transform form data to grapheme input', () => {
            const formData: LogogramFormData = {
                logogramSvg: '<svg><path/></svg>',
                logogramName: 'TestChar',
                notes: 'Some notes',
                pronunciations: [
                    { pronunciation: 'a', useInAutoSpelling: true },
                    { pronunciation: 'b', useInAutoSpelling: false }
                ]
            };

            const result = transformFormToGraphemeInput(formData);

            expect(result.name).toBe('TestChar');
            expect(result.svg_data).toBe('<svg><path/></svg>');
            expect(result.notes).toBe('Some notes');
            expect(result.phonemes).toHaveLength(2);
            expect(result.phonemes![0].phoneme).toBe('a');
            expect(result.phonemes![0].use_in_auto_spelling).toBe(true);
        });

        it('should filter out empty pronunciations', () => {
            const formData: LogogramFormData = {
                logogramSvg: '<svg/>',
                logogramName: 'Test',
                pronunciations: [
                    { pronunciation: 'a', useInAutoSpelling: true },
                    { pronunciation: '', useInAutoSpelling: false },
                    { pronunciation: '  ', useInAutoSpelling: false },
                    { pronunciation: 'b', useInAutoSpelling: true }
                ]
            };

            const result = transformFormToGraphemeInput(formData);

            expect(result.phonemes).toHaveLength(2);
            expect(result.phonemes![0].phoneme).toBe('a');
            expect(result.phonemes![1].phoneme).toBe('b');
        });

        it('should trim pronunciation values', () => {
            const formData: LogogramFormData = {
                logogramSvg: '<svg/>',
                logogramName: 'Test',
                pronunciations: [
                    { pronunciation: '  a  ', useInAutoSpelling: true }
                ]
            };

            const result = transformFormToGraphemeInput(formData);

            expect(result.phonemes![0].phoneme).toBe('a');
        });

        it('should handle undefined notes', () => {
            const formData: LogogramFormData = {
                logogramSvg: '<svg/>',
                logogramName: 'Test',
                pronunciations: []
            };

            const result = transformFormToGraphemeInput(formData);

            expect(result.notes).toBeUndefined();
        });

        it('should handle empty notes string', () => {
            const formData: LogogramFormData = {
                logogramSvg: '<svg/>',
                logogramName: 'Test',
                notes: '',
                pronunciations: []
            };

            const result = transformFormToGraphemeInput(formData);

            expect(result.notes).toBeUndefined();
        });
    });

    describe('saveLogogram', () => {
        it('should save valid form data to database', async () => {
            const formData: LogogramFormData = {
                logogramSvg: '<svg><rect/></svg>',
                logogramName: 'SaveTest',
                notes: 'Test saving',
                pronunciations: [
                    { pronunciation: 'test', useInAutoSpelling: true }
                ]
            };

            const result = await saveLogogram(formData);

            expect(result.id).toBeGreaterThan(0);
            expect(result.name).toBe('SaveTest');
            expect(result.phonemes).toHaveLength(1);

            // Verify it's actually in the database
            const fromDb = getGraphemeById(result.id);
            expect(fromDb).not.toBeNull();
        });

        it('should throw error for empty SVG', async () => {
            const formData: LogogramFormData = {
                logogramSvg: '',
                logogramName: 'Test',
                pronunciations: []
            };

            await expect(saveLogogram(formData)).rejects.toThrow('SVG drawing is required');
        });

        it('should throw error for whitespace-only SVG', async () => {
            const formData: LogogramFormData = {
                logogramSvg: '   ',
                logogramName: 'Test',
                pronunciations: []
            };

            await expect(saveLogogram(formData)).rejects.toThrow('SVG drawing is required');
        });

        it('should throw error for empty name', async () => {
            const formData: LogogramFormData = {
                logogramSvg: '<svg/>',
                logogramName: '',
                pronunciations: []
            };

            await expect(saveLogogram(formData)).rejects.toThrow('Logogram name is required');
        });

        it('should throw error for whitespace-only name', async () => {
            const formData: LogogramFormData = {
                logogramSvg: '<svg/>',
                logogramName: '   ',
                pronunciations: []
            };

            await expect(saveLogogram(formData)).rejects.toThrow('Logogram name is required');
        });
    });

    describe('validateLogogramForm', () => {
        it('should return empty array for valid form', () => {
            const formData: Partial<LogogramFormData> = {
                logogramSvg: '<svg/>',
                logogramName: 'Test',
                pronunciations: [{ pronunciation: 'a', useInAutoSpelling: true }]
            };

            const errors = validateLogogramForm(formData);

            expect(errors).toEqual([]);
        });

        it('should return error for missing SVG', () => {
            const formData: Partial<LogogramFormData> = {
                logogramName: 'Test',
                pronunciations: [{ pronunciation: 'a', useInAutoSpelling: true }]
            };

            const errors = validateLogogramForm(formData);

            expect(errors).toContain('Please draw a script character');
        });

        it('should return error for missing name', () => {
            const formData: Partial<LogogramFormData> = {
                logogramSvg: '<svg/>',
                pronunciations: [{ pronunciation: 'a', useInAutoSpelling: true }]
            };

            const errors = validateLogogramForm(formData);

            expect(errors).toContain('Logogram name is required');
        });

        it('should return error for missing pronunciations', () => {
            const formData: Partial<LogogramFormData> = {
                logogramSvg: '<svg/>',
                logogramName: 'Test',
                pronunciations: []
            };

            const errors = validateLogogramForm(formData);

            expect(errors).toContain('At least one pronunciation is required');
        });

        it('should return error for all empty pronunciations', () => {
            const formData: Partial<LogogramFormData> = {
                logogramSvg: '<svg/>',
                logogramName: 'Test',
                pronunciations: [
                    { pronunciation: '', useInAutoSpelling: false },
                    { pronunciation: '  ', useInAutoSpelling: true }
                ]
            };

            const errors = validateLogogramForm(formData);

            expect(errors).toContain('At least one pronunciation is required');
        });

        it('should return multiple errors', () => {
            const formData: Partial<LogogramFormData> = {};

            const errors = validateLogogramForm(formData);

            expect(errors.length).toBeGreaterThanOrEqual(2);
        });
    });

    // =========================================================================
    // EDGE CASES & ERROR HANDLING
    // =========================================================================

    describe('Edge Cases', () => {
        it('should handle duplicate grapheme names (allowed)', () => {
            const g1 = createGrapheme({ name: 'Duplicate', svg_data: '<svg/>' });
            const g2 = createGrapheme({ name: 'Duplicate', svg_data: '<svg/>' });

            expect(g1.id).not.toBe(g2.id);
            expect(g1.name).toBe(g2.name);
        });

        it('should handle very long names', () => {
            const longName = 'A'.repeat(1000);
            const grapheme = createGrapheme({ name: longName, svg_data: '<svg/>' });

            expect(grapheme.name).toBe(longName);
        });

        it('should handle very long SVG data', () => {
            const longSvg = '<svg>' + '<rect/>'.repeat(1000) + '</svg>';
            const grapheme = createGrapheme({ name: 'LongSVG', svg_data: longSvg });

            expect(grapheme.svg_data).toBe(longSvg);
        });

        it('should handle special SQL characters in data', () => {
            const grapheme = createGrapheme({
                name: "Test's \"Name\"",
                svg_data: '<svg data="test\'s data"/>',
                notes: "Notes with 'quotes' and \"double quotes\""
            });

            expect(grapheme.name).toBe("Test's \"Name\"");
            expect(grapheme.notes).toBe("Notes with 'quotes' and \"double quotes\"");
        });

        it('should handle phoneme with same value as grapheme name', () => {
            const grapheme = createGrapheme({
                name: 'A',
                svg_data: '<svg/>',
                phonemes: [{ phoneme: 'A', use_in_auto_spelling: true }]
            });

            expect(grapheme.phonemes[0].phoneme).toBe('A');
        });

        it('should handle adding many phonemes to one grapheme', () => {
            const grapheme = createGrapheme({ name: 'ManyPhonemes', svg_data: '<svg/>' });

            for (let i = 0; i < 100; i++) {
                addPhoneme(grapheme.id, { phoneme: `phoneme${i}` });
            }

            const phonemes = getPhonemesByGraphemeId(grapheme.id);
            expect(phonemes).toHaveLength(100);
        });

        it('should handle concurrent-like operations', () => {
            // Simulate rapid operations
            const ids: number[] = [];
            for (let i = 0; i < 50; i++) {
                const g = createGrapheme({ name: `Rapid${i}`, svg_data: '<svg/>' });
                ids.push(g.id);
            }

            // All should have unique IDs
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(50);

            // All should be retrievable
            ids.forEach(id => {
                expect(getGraphemeById(id)).not.toBeNull();
            });
        });
    });
});
