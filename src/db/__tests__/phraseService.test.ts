/**
 * Phrase Service Tests
 * ---------------------
 * Unit tests for phrase translation functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    tokenizePhrase,
    lookupWord,
    translateWord,
    translatePhrase,
    createSpaceSeparator,
} from '../phraseService';
import type { LexiconComplete, PhraseWord } from '../types';

// Mock lexicon entry helper
function createMockLexiconEntry(lemma: string): LexiconComplete {
    return {
        id: 1,
        lemma,
        pronunciation: null,
        is_native: true,
        auto_spell: false,
        meaning: `Meaning of ${lemma}`,
        part_of_speech: 'noun',
        notes: null,
        glyph_order: '[]',
        needs_attention: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        spellingDisplay: [],
        spelling: [],
        ancestors: [],
        descendants: [],
        hasIpaFallbacks: false,
    };
}

describe('phraseService', () => {
    describe('tokenizePhrase', () => {
        it('should tokenize a simple phrase', () => {
            const result = tokenizePhrase('hello world');

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                originalWord: 'hello',
                normalizedWord: 'hello',
                position: 0,
            });
            expect(result[1]).toEqual({
                originalWord: 'world',
                normalizedWord: 'world',
                position: 1,
            });
        });

        it('should handle multiple spaces', () => {
            const result = tokenizePhrase('hello    world');

            expect(result).toHaveLength(2);
            expect(result[0].normalizedWord).toBe('hello');
            expect(result[1].normalizedWord).toBe('world');
        });

        it('should normalize to lowercase', () => {
            const result = tokenizePhrase('Hello WORLD');

            expect(result[0].normalizedWord).toBe('hello');
            expect(result[1].normalizedWord).toBe('world');
        });

        it('should handle empty string', () => {
            const result = tokenizePhrase('');

            expect(result).toHaveLength(0);
        });

        it('should handle whitespace-only string', () => {
            const result = tokenizePhrase('   ');

            expect(result).toHaveLength(0);
        });

        it('should preserve original word casing', () => {
            const result = tokenizePhrase('Hello World');

            expect(result[0].originalWord).toBe('Hello');
            expect(result[1].originalWord).toBe('World');
        });
    });

    describe('lookupWord', () => {
        const mockLexicon: LexiconComplete[] = [
            createMockLexiconEntry('hello'),
            createMockLexiconEntry('world'),
            createMockLexiconEntry('test'),
        ];

        it('should find an exact match', () => {
            const result = lookupWord('hello', mockLexicon);

            expect(result).not.toBeNull();
            expect(result?.lemma).toBe('hello');
        });

        it('should find a case-insensitive match', () => {
            const result = lookupWord('HELLO', mockLexicon);

            expect(result).not.toBeNull();
            expect(result?.lemma).toBe('hello');
        });

        it('should return null for no match', () => {
            const result = lookupWord('notfound', mockLexicon);

            expect(result).toBeNull();
        });

        it('should return first match if duplicates exist', () => {
            const lexiconWithDupes = [
                createMockLexiconEntry('hello'),
                createMockLexiconEntry('hello'),
            ];

            const result = lookupWord('hello', lexiconWithDupes);

            expect(result).toBe(lexiconWithDupes[0]);
        });
    });

    describe('translateWord', () => {
        const mockLexicon: LexiconComplete[] = [
            createMockLexiconEntry('hello'),
        ];

        const testWord: PhraseWord = {
            originalWord: 'hello',
            normalizedWord: 'hello',
            position: 0,
        };

        it('should use lexicon entry when found', () => {
            const result = translateWord(testWord, mockLexicon);

            expect(result.type).toBe('lexicon');
            expect(result.lexiconEntry).toBeDefined();
            expect(result.lexiconEntry?.lemma).toBe('hello');
        });

        it('should use autospell when not found', () => {
            const unknownWord: PhraseWord = {
                originalWord: 'xyz',
                normalizedWord: 'xyz',
                position: 0,
            };

            const result = translateWord(unknownWord, mockLexicon);

            expect(result.type).toBe('autospell');
            expect(result.lexiconEntry).toBeUndefined();
            expect(result.spellingDisplay).toBeDefined();
        });

        it('should mark autospell results as having virtual glyphs', () => {
            const unknownWord: PhraseWord = {
                originalWord: 'xyz',
                normalizedWord: 'xyz',
                position: 0,
            };

            const result = translateWord(unknownWord, mockLexicon);

            expect(result.hasVirtualGlyphs).toBe(true);
        });
    });

    describe('createSpaceSeparator', () => {
        it('should create a space separator entry', () => {
            const result = createSpaceSeparator();

            expect(result.type).toBe('ipa');
            expect(result.ipaCharacter).toBe(' ');
            expect(result.position).toBe(0);
        });
    });

    describe('translatePhrase', () => {
        const mockLexicon: LexiconComplete[] = [
            createMockLexiconEntry('hello'),
        ];

        it('should translate a phrase with lexicon and autospell', () => {
            const result = translatePhrase('hello world', mockLexicon);

            expect(result.originalPhrase).toBe('hello world');
            expect(result.normalizedPhrase).toBe('hello world');
            expect(result.wordTranslations).toHaveLength(2);
            expect(result.wordTranslations[0].type).toBe('lexicon');
            expect(result.wordTranslations[1].type).toBe('autospell');
        });

        it('should insert space separators between words', () => {
            const result = translatePhrase('a b c', mockLexicon);

            // Should have 3 words + 2 separators = 5+ entries in combined spelling
            // (actual count depends on word lengths, but at minimum we should have separators)
            const spaceCount = result.combinedSpelling.filter(
                entry => entry.type === 'ipa' && entry.ipaCharacter === ' '
            ).length;

            // Should have 2 space separators (between 3 words)
            expect(spaceCount).toBeGreaterThanOrEqual(2);
        });

        it('should set hasVirtualGlyphs flag correctly', () => {
            const resultWithVirtual = translatePhrase('hello xyz', mockLexicon);
            expect(resultWithVirtual.hasVirtualGlyphs).toBe(true);
        });

        it('should include timestamp', () => {
            const result = translatePhrase('hello', mockLexicon);

            expect(result.timestamp).toBeDefined();
            expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
        });

        it('should assign correct positions in combined spelling', () => {
            const result = translatePhrase('a b', mockLexicon);

            // Check that positions are sequential
            const positions = result.combinedSpelling.map(e => e.position);
            for (let i = 1; i < positions.length; i++) {
                expect(positions[i]).toBe(positions[i - 1] + 1);
            }
        });

        it('should handle empty phrase', () => {
            const result = translatePhrase('', mockLexicon);

            expect(result.wordTranslations).toHaveLength(0);
            expect(result.combinedSpelling).toHaveLength(0);
        });

        it('should handle single word', () => {
            const result = translatePhrase('hello', mockLexicon);

            expect(result.wordTranslations).toHaveLength(1);
            // No space separators for single word
            const spaceCount = result.combinedSpelling.filter(
                entry => entry.type === 'ipa' && entry.ipaCharacter === ' '
            ).length;
            expect(spaceCount).toBe(0);
        });
    });
});
