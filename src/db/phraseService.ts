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
 * Sentinel value used in the word list to represent an explicit line break.
 * When the tokenizer encounters a newline in the input, it inserts this
 * marker so downstream code (combiner, layout strategy) can force a new line.
 */
export const LINE_BREAK_SENTINEL = '\n';

/**
 * Split phrase into words, handling punctuation and whitespace.
 * Newlines are preserved as LINE_BREAK_SENTINEL entries so the
 * layout engine can insert explicit line breaks.
 *
 * @param phrase - The input phrase to tokenize
 * @returns Array of PhraseWord objects with original, normalized, and position
 */
export function tokenizePhrase(phrase: string): PhraseWord[] {
    if (!phrase || !phrase.trim()) {
        return [];
    }

    const result: PhraseWord[] = [];
    let position = 0;

    // Split on newlines first to preserve line breaks
    const lines = phrase.split(/\n/);

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];

        // Split each line on horizontal whitespace
        const rawWords = line.split(/[ \t]+/).filter(word => word.length > 0);

        for (const word of rawWords) {
            result.push({
                originalWord: word,
                normalizedWord: word.toLowerCase().trim(),
                position: position++,
            });
        }

        // Insert a line-break sentinel between lines (not after the last line)
        if (lineIdx < lines.length - 1) {
            result.push({
                originalWord: LINE_BREAK_SENTINEL,
                normalizedWord: LINE_BREAK_SENTINEL,
                position: position++,
            });
        }
    }

    return result;
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

    // Separate real words from line-break sentinels
    const realWords = words.filter(w => w.originalWord !== LINE_BREAK_SENTINEL);

    // Translate each real word
    const wordTranslations: PhraseWordTranslation[] = realWords.map(word =>
        translateWord(word, lexiconEntries)
    );

    // Get word separator configuration
    const wordSeparatorConfig = config?.punctuationSettings?.wordSeparator;
    const wordSeparatorGrapheme = wordSeparatorConfig?.graphemeId !== null && wordSeparatorConfig?.graphemeId !== undefined
        ? config?.punctuationGraphemes?.get(wordSeparatorConfig.graphemeId)
        : null;

    // Combine spellings with space separators and line breaks
    // Walk the original token list (which includes sentinels) to preserve order
    const combinedSpelling: SpellingDisplayEntry[] = [];
    let globalPosition = 0;
    let hasVirtualGlyphs = false;
    let realWordIndex = 0;
    let needsSeparator = false; // track whether a space separator is needed before the next word

    for (let i = 0; i < words.length; i++) {
        const token = words[i];

        if (token.originalWord === LINE_BREAK_SENTINEL) {
            // Emit a line-break entry (IPA '\n')
            combinedSpelling.push({
                type: 'ipa',
                position: globalPosition++,
                ipaCharacter: '\n',
            });
            needsSeparator = false; // no space separator needed after a line break
            continue;
        }

        // It's a real word — insert space separator before it if needed
        if (needsSeparator) {
            const spaceSeparator = createSpaceSeparator(wordSeparatorConfig, wordSeparatorGrapheme);
            if (spaceSeparator !== null) {
                combinedSpelling.push({
                    ...spaceSeparator,
                    position: globalPosition++,
                });
            }
        }

        const translation = wordTranslations[realWordIndex++];

        // Add word's spelling
        for (const entry of translation.spellingDisplay) {
            combinedSpelling.push({
                ...entry,
                position: globalPosition++,
            });
        }

        if (translation.hasVirtualGlyphs) {
            hasVirtualGlyphs = true;
        }

        needsSeparator = true;
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
