/**
 * Phrase Service Tests
 * ---------------------
 * Unit tests for phrase translation functionality.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
    tokenizePhrase,
    lookupWord,
    meaningKeys,
    translateWord,
    translatePhrase,
    createSpaceSeparator,
} from '../phraseService';
import { initDatabase, clearDatabase } from '../index';
import type { LexiconComplete, PhraseWord } from '../types';

// Mock lexicon entry helper. `meanings` are the English glosses, in order.
function createMockLexiconEntry(lemma: string, meanings: string[] = []): LexiconComplete {
    return {
        id: 1,
        lemma,
        pronunciation: null,
        is_native: true,
        auto_spell: false,
        meaning: meanings[0] ?? `Meaning of ${lemma}`,
        part_of_speech: 'noun',
        notes: null,
        glyph_order: '[]',
        needs_attention: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        spellingDisplay: [],
        spelling: [],
        meanings: meanings.map((meaning, i) => ({
            id: i + 1,
            lexicon_id: 1,
            meaning,
            part_of_speech: null,
            usage_notes: null,
            definition_order: i,
        })),
        ancestors: [],
        descendants: [],
        hasIpaFallbacks: false,
    };
}

describe('phraseService', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    describe('tokenizePhrase', () => {
        it('should tokenize a simple phrase', () => {
            const result = tokenizePhrase('hello world');

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                originalWord: 'hello',
                normalizedWord: 'hello',
                position: 0,
                kind: 'word',
            });
            expect(result[1]).toEqual({
                originalWord: 'world',
                normalizedWord: 'world',
                position: 1,
                kind: 'word',
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

        // The phrase is ENGLISH: a word is found by what it means, not only
        // by its romanised lemma. This was the bug where a lexicon with the
        // single word "Ae L O" = "great" auto-spelled "great".
        describe('by meaning', () => {
            it('finds an entry by its English meaning', () => {
                const lexicon = [createMockLexiconEntry('aelo', ['great'])];
                expect(lookupWord('great', lexicon)?.lemma).toBe('aelo');
                expect(lookupWord('Great', lexicon)?.lemma).toBe('aelo');
            });

            it('matches any meaning row, not just the first', () => {
                const lexicon = [createMockLexiconEntry('aelo', ['great', 'grand'])];
                expect(lookupWord('grand', lexicon)?.lemma).toBe('aelo');
            });

            it('splits a list gloss into its words', () => {
                const lexicon = [createMockLexiconEntry('aelo', ['great; large, big / huge'])];
                for (const word of ['great', 'large', 'big', 'huge']) {
                    expect(lookupWord(word, lexicon)?.lemma).toBe('aelo');
                }
            });

            it('ignores "to …"/article lead-ins, bracketed notes and a final stop', () => {
                const lexicon = [
                    createMockLexiconEntry('rin', ['to run (v.)']),
                    createMockLexiconEntry('kat', ['a cat.']),
                    createMockLexiconEntry('sol', ['The sun']),
                ];
                expect(lookupWord('run', lexicon)?.lemma).toBe('rin');
                expect(lookupWord('cat', lexicon)?.lemma).toBe('kat');
                expect(lookupWord('sun', lexicon)?.lemma).toBe('sol');
            });

            it('keeps a bare article as a word of its own', () => {
                const lexicon = [createMockLexiconEntry('ka', ['a']), createMockLexiconEntry('te', ['the'])];
                expect(lookupWord('a', lexicon)?.lemma).toBe('ka');
                expect(lookupWord('the', lexicon)?.lemma).toBe('te');
            });

            it('does not match a multi-word gloss by one of its words', () => {
                const lexicon = [createMockLexiconEntry('domu', ['big house'])];
                expect(lookupWord('house', lexicon)).toBeNull();
                expect(lookupWord('big', lexicon)).toBeNull();
            });

            it('prefers the word that MEANS the token over the word romanised as it', () => {
                const romanised = createMockLexiconEntry('on', ['cat']);
                const means = createMockLexiconEntry('pe', ['on']);
                expect(lookupWord('on', [romanised, means])).toBe(means);
            });

            it('still falls back to the lemma', () => {
                const lexicon = [createMockLexiconEntry('aelo', ['great'])];
                expect(lookupWord('aelo', lexicon)?.lemma).toBe('aelo');
            });

            it('reads the legacy single `meaning` column when there are no rows', () => {
                const entry = { ...createMockLexiconEntry('aelo'), meaning: 'great', meanings: [] };
                expect(lookupWord('great', [entry])).toBe(entry);
            });
        });
    });

    describe('meaningKeys', () => {
        it('returns lower-cased, de-duplicated single words', () => {
            const keys = meaningKeys({ meaning: 'Great', meanings: [
                { id: 1, lexicon_id: 1, meaning: 'great, GREAT', part_of_speech: null, usage_notes: null, definition_order: 0 },
            ] });
            expect(keys).toEqual(['great']);
        });

        it('returns nothing for an entry with no meanings', () => {
            expect(meaningKeys({ meaning: null, meanings: [] })).toEqual([]);
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
        it('should create a space separator entry when no config provided', () => {
            const result = createSpaceSeparator();

            expect(result).not.toBeNull();
            if (result === null) throw new Error('result should not be null');
            expect(result.type).toBe('ipa');
            expect(result.ipaCharacter).toBe(' ');
            expect(result.position).toBe(0);
        });

        it('should return null when useNoGlyph is true', () => {
            const result = createSpaceSeparator({ graphemeId: null, useNoGlyph: true });
            expect(result).toBeNull();
        });

        it('should return virtual glyph when useNoGlyph is false and no grapheme', () => {
            const result = createSpaceSeparator({ graphemeId: null, useNoGlyph: false });
            expect(result).not.toBeNull();
            if (result === null) throw new Error('result should not be null');
            expect(result.type).toBe('ipa');
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

        it('uses the lexicon for a word typed by its English meaning', () => {
            const result = translatePhrase('great day', [createMockLexiconEntry('aelo', ['great'])]);

            expect(result.wordTranslations[0].type).toBe('lexicon');
            expect(result.wordTranslations[0].lexiconEntry?.lemma).toBe('aelo');
            expect(result.wordTranslations[1].type).toBe('autospell');
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
