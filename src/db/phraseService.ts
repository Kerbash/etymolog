/**
 * Phrase Translation Service
 *
 * Translates English phrases to the constructed language by:
 * 1. Tokenizing the phrase into words
 * 2. Looking up each word in the lexicon
 * 3. Using autospeller for words not found in lexicon
 * 4. Combining spellings with word separators
 *
 * Note: Phrase translations are ephemeral (not persisted to database).
 */

import type {
    PhraseWord,
    PhraseWordTranslation,
    PhraseTranslationResult,
    LexiconComplete,
    SpellingDisplayEntry,
    GraphemeComplete,
} from './types';
import type { PunctuationSettings, PunctuationConfig } from './api/types';
import { generateSpellingWithFallback } from './autoSpellService';

/**
 * Split phrase into words, handling punctuation and whitespace.
 *
 * @param phrase - The input phrase to tokenize
 * @returns Array of PhraseWord objects with original, normalized, and position
 */
export function tokenizePhrase(phrase: string): PhraseWord[] {
    if (!phrase || !phrase.trim()) {
        return [];
    }

    // Split on whitespace and filter empty strings
    const rawWords = phrase.split(/\s+/).filter(word => word.length > 0);

    return rawWords.map((word, index) => ({
        originalWord: word,
        normalizedWord: word.toLowerCase().trim(),
        position: index,
    }));
}

/**
 * Lookup a word in the lexicon by lemma (case-insensitive).
 * Returns the first match found.
 *
 * @param normalizedWord - The word to search for (lowercase)
 * @param lexiconEntries - All lexicon entries to search
 * @returns LexiconComplete entry if found, null otherwise
 */
export function lookupWord(
    normalizedWord: string,
    lexiconEntries: LexiconComplete[]
): LexiconComplete | null {
    for (const entry of lexiconEntries) {
        if (entry.lemma.toLowerCase() === normalizedWord) {
            return entry;
        }
    }
    return null;
}

/**
 * Translate a single word using lexicon or autospeller.
 *
 * @param word - The PhraseWord to translate
 * @param lexiconEntries - All lexicon entries to search
 * @returns PhraseWordTranslation with spelling and metadata
 */
export function translateWord(
    word: PhraseWord,
    lexiconEntries: LexiconComplete[]
): PhraseWordTranslation {
    // First try to find in lexicon
    const lexiconEntry = lookupWord(word.normalizedWord, lexiconEntries);

    if (lexiconEntry) {
        // Found in lexicon - use its spelling
        return {
            word,
            type: 'lexicon',
            lexiconEntry,
            spellingDisplay: lexiconEntry.spellingDisplay,
            hasVirtualGlyphs: lexiconEntry.hasIpaFallbacks,
        };
    }

    // Not found - use autospeller
    // Pass the original word as the "pronunciation" for character-by-character matching
    const autoSpellResult = generateSpellingWithFallback(word.originalWord);

    // Convert AutoSpellResultExtended to SpellingDisplayEntry[]
    const spellingDisplay: SpellingDisplayEntry[] = autoSpellResult.spelling.map((entry, index) => {
        if (entry.isVirtual && entry.ipaCharacter) {
            return {
                type: 'ipa' as const,
                position: index,
                ipaCharacter: entry.ipaCharacter,
            };
        } else {
            // This would be a real grapheme if it exists
            // For autospell with English text, most will be virtual
            return {
                type: 'ipa' as const,
                position: index,
                ipaCharacter: word.originalWord[index] || '?',
            };
        }
    });

    return {
        word,
        type: 'autospell',
        spellingDisplay,
        hasVirtualGlyphs: autoSpellResult.hasVirtualGlyphs,
    };
}

/**
 * Create a virtual space glyph entry for word separation.
 * This renders as a dashed box in the display.
 *
 * @param config - Optional punctuation config for word separator
 * @param grapheme - Optional grapheme to use if config specifies graphemeId
 * @returns SpellingDisplayEntry representing a space, or null if useNoGlyph is true
 */
export function createSpaceSeparator(
    config?: PunctuationConfig,
    grapheme?: GraphemeComplete | null
): SpellingDisplayEntry | null {
    // If configured to hide, return null
    if (config?.useNoGlyph) {
        return null;
    }

    // If a grapheme is assigned and available, use it
    if (config?.graphemeId !== null && grapheme) {
        return {
            type: 'grapheme',
            position: 0, // Position will be set when combining
            grapheme: {
                id: grapheme.id,
                name: grapheme.name,
                category: grapheme.category,
                notes: grapheme.notes,
                created_at: grapheme.created_at,
                updated_at: grapheme.updated_at,
            },
        };
    }

    // Default: return virtual space
    return {
        type: 'ipa',
        position: 0, // Position will be set when combining
        ipaCharacter: ' ',
    };
}

/**
 * Create a punctuation entry based on settings.
 *
 * @param character - The punctuation character (e.g., '.', '?', '!')
 * @param config - Punctuation configuration from settings
 * @param grapheme - Optional grapheme to use if config specifies graphemeId
 * @returns SpellingDisplayEntry for the punctuation, or null if useNoGlyph is true
 */
export function createPunctuationEntry(
    character: string,
    config?: PunctuationConfig,
    grapheme?: GraphemeComplete | null
): SpellingDisplayEntry | null {
    // If configured to hide, return null
    if (config?.useNoGlyph) {
        return null;
    }

    // If a grapheme is assigned and available, use it
    if (config?.graphemeId !== null && grapheme) {
        return {
            type: 'grapheme',
            position: 0, // Position will be set when combining
            grapheme: {
                id: grapheme.id,
                name: grapheme.name,
                category: grapheme.category,
                notes: grapheme.notes,
                created_at: grapheme.created_at,
                updated_at: grapheme.updated_at,
            },
        };
    }

    // Default: return virtual punctuation
    return {
        type: 'ipa',
        position: 0,
        ipaCharacter: character,
    };
}

/**
 * Configuration options for phrase translation.
 */
export interface TranslationConfig {
    /** Punctuation settings from global settings */
    punctuationSettings?: PunctuationSettings;
    /** Map of grapheme IDs to GraphemeComplete for punctuation */
    punctuationGraphemes?: Map<number, GraphemeComplete>;
}

/**
 * Translate an entire phrase to conlang spelling.
 *
 * Algorithm:
 * 1. Tokenize phrase into words
 * 2. For each word: lookup in lexicon or use autospeller
 * 3. Combine spellings with space separators between words
 *
 * @param phrase - The English phrase to translate
 * @param lexiconEntries - All lexicon entries to search
 * @param config - Optional translation configuration for punctuation
 * @returns PhraseTranslationResult with full translation data
 */
export function translatePhrase(
    phrase: string,
    lexiconEntries: LexiconComplete[],
    config?: TranslationConfig
): PhraseTranslationResult {
    const originalPhrase = phrase;
    const normalizedPhrase = phrase.trim();

    // Tokenize
    const words = tokenizePhrase(normalizedPhrase);

    // Translate each word
    const wordTranslations: PhraseWordTranslation[] = words.map(word =>
        translateWord(word, lexiconEntries)
    );

    // Get word separator configuration
    const wordSeparatorConfig = config?.punctuationSettings?.wordSeparator;
    const wordSeparatorGrapheme = wordSeparatorConfig?.graphemeId !== null && wordSeparatorConfig?.graphemeId !== undefined
        ? config?.punctuationGraphemes?.get(wordSeparatorConfig.graphemeId)
        : null;

    // Combine spellings with space separators
    const combinedSpelling: SpellingDisplayEntry[] = [];
    let globalPosition = 0;
    let hasVirtualGlyphs = false;

    for (let i = 0; i < wordTranslations.length; i++) {
        const translation = wordTranslations[i];

        // Add word's spelling
        for (const entry of translation.spellingDisplay) {
            combinedSpelling.push({
                ...entry,
                position: globalPosition++,
            });
        }

        // Track if any word has virtual glyphs
        if (translation.hasVirtualGlyphs) {
            hasVirtualGlyphs = true;
        }

        // Add space separator (except after last word)
        if (i < wordTranslations.length - 1) {
            const spaceSeparator = createSpaceSeparator(wordSeparatorConfig, wordSeparatorGrapheme);
            // Only add if not configured to be hidden
            if (spaceSeparator !== null) {
                combinedSpelling.push({
                    ...spaceSeparator,
                    position: globalPosition++,
                });
            }
        }
    }

    return {
        originalPhrase,
        normalizedPhrase,
        wordTranslations,
        combinedSpelling,
        hasVirtualGlyphs,
        timestamp: new Date().toISOString(),
    };
}
