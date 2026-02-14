/**
 * Punctuation Data Definitions
 *
 * Defines punctuation marks for conlang script systems.
 * Organized by category for rendering in the punctuation table.
 *
 * @module data/punctuationData
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Category of punctuation mark.
 */
export type PunctuationCategory = 'separator' | 'terminal' | 'pause' | 'quotation' | 'other';

/**
 * Key for referencing a specific punctuation mark in settings.
 * Must match the keys in PunctuationSettings.
 */
export type PunctuationKey =
    | 'wordSeparator'
    | 'sentenceSeparator'
    | 'comma'
    | 'questionMark'
    | 'exclamationMark'
    | 'colon'
    | 'semicolon'
    | 'ellipsis'
    | 'quotationOpen'
    | 'quotationClose';

/**
 * Definition of a single punctuation mark.
 */
export interface PunctuationMark {
    /** Unique key matching the settings key */
    key: PunctuationKey;
    /** Display symbol (e.g., ".", "?", " ") */
    symbol: string;
    /** Human-readable label */
    label: string;
    /** Description of the punctuation's function */
    description: string;
    /** Category for grouping in UI */
    category: PunctuationCategory;
    /** English equivalent for reference */
    englishEquivalent: string;
    /** Priority order for display (lower = higher priority) */
    priority: number;
}

/**
 * Category metadata for UI display.
 */
export interface PunctuationCategoryInfo {
    key: PunctuationCategory;
    label: string;
    description: string;
}

// =============================================================================
// PUNCTUATION CATEGORIES
// =============================================================================

/**
 * Categories for organizing punctuation marks.
 */
export const PUNCTUATION_CATEGORIES: PunctuationCategoryInfo[] = [
    {
        key: 'separator',
        label: 'Word Separators',
        description: 'Marks that separate words or phrases',
    },
    {
        key: 'terminal',
        label: 'Sentence Endings',
        description: 'Marks that end sentences',
    },
    {
        key: 'pause',
        label: 'Pause Marks',
        description: 'Marks indicating pauses or breaks',
    },
    {
        key: 'quotation',
        label: 'Quotation Marks',
        description: 'Marks for quoted speech or text',
    },
];

// =============================================================================
// PUNCTUATION MARKS DATA
// =============================================================================

/**
 * Complete list of punctuation marks.
 * Ordered by priority for display.
 */
export const PUNCTUATION_MARKS: PunctuationMark[] = [
    // Separators (highest priority)
    {
        key: 'wordSeparator',
        symbol: '␣',
        label: 'Word Separator',
        description: 'Separates individual words in a phrase',
        category: 'separator',
        englishEquivalent: 'Space',
        priority: 1,
    },

    // Terminal marks (sentence endings)
    {
        key: 'sentenceSeparator',
        symbol: '.',
        label: 'Sentence Separator',
        description: 'Marks the end of a declarative sentence',
        category: 'terminal',
        englishEquivalent: 'Period / Full Stop',
        priority: 2,
    },
    {
        key: 'questionMark',
        symbol: '?',
        label: 'Question Mark',
        description: 'Marks the end of an interrogative sentence',
        category: 'terminal',
        englishEquivalent: 'Question Mark',
        priority: 3,
    },
    {
        key: 'exclamationMark',
        symbol: '!',
        label: 'Exclamation Mark',
        description: 'Marks the end of an exclamatory sentence',
        category: 'terminal',
        englishEquivalent: 'Exclamation Mark',
        priority: 4,
    },

    // Pause marks
    {
        key: 'comma',
        symbol: ',',
        label: 'Comma',
        description: 'Indicates a short pause or separates list items',
        category: 'pause',
        englishEquivalent: 'Comma',
        priority: 5,
    },
    {
        key: 'semicolon',
        symbol: ';',
        label: 'Semicolon',
        description: 'Indicates a longer pause, connects related clauses',
        category: 'pause',
        englishEquivalent: 'Semicolon',
        priority: 6,
    },
    {
        key: 'colon',
        symbol: ':',
        label: 'Colon',
        description: 'Introduces a list, explanation, or elaboration',
        category: 'pause',
        englishEquivalent: 'Colon',
        priority: 7,
    },
    {
        key: 'ellipsis',
        symbol: '…',
        label: 'Ellipsis',
        description: 'Indicates omission, trailing off, or suspense',
        category: 'pause',
        englishEquivalent: 'Ellipsis (...)',
        priority: 8,
    },

    // Quotation marks
    {
        key: 'quotationOpen',
        symbol: '"',
        label: 'Opening Quote',
        description: 'Opens quoted speech or text',
        category: 'quotation',
        englishEquivalent: 'Opening Quotation Mark',
        priority: 9,
    },
    {
        key: 'quotationClose',
        symbol: '"',
        label: 'Closing Quote',
        description: 'Closes quoted speech or text',
        category: 'quotation',
        englishEquivalent: 'Closing Quotation Mark',
        priority: 10,
    },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get all punctuation marks for a specific category.
 */
export function getPunctuationByCategory(category: PunctuationCategory): PunctuationMark[] {
    return PUNCTUATION_MARKS
        .filter(mark => mark.category === category)
        .sort((a, b) => a.priority - b.priority);
}

/**
 * Get a punctuation mark by its key.
 */
export function getPunctuationByKey(key: PunctuationKey): PunctuationMark | undefined {
    return PUNCTUATION_MARKS.find(mark => mark.key === key);
}

/**
 * Get all punctuation marks sorted by priority.
 */
export function getAllPunctuationSorted(): PunctuationMark[] {
    return [...PUNCTUATION_MARKS].sort((a, b) => a.priority - b.priority);
}

/**
 * Get punctuation marks grouped by category.
 */
export function getPunctuationGroupedByCategory(): Map<PunctuationCategory, PunctuationMark[]> {
    const grouped = new Map<PunctuationCategory, PunctuationMark[]>();

    for (const category of PUNCTUATION_CATEGORIES) {
        grouped.set(category.key, getPunctuationByCategory(category.key));
    }

    return grouped;
}

/**
 * Check if a character is a recognized punctuation mark.
 */
export function isPunctuationCharacter(char: string): PunctuationKey | null {
    // Map common punctuation characters to their settings key
    switch (char) {
        case ' ':
            return 'wordSeparator';
        case '.':
            return 'sentenceSeparator';
        case ',':
            return 'comma';
        case '?':
            return 'questionMark';
        case '!':
            return 'exclamationMark';
        case ':':
            return 'colon';
        case ';':
            return 'semicolon';
        case '\u2026': // Ellipsis …
            return 'ellipsis';
        case '\u201C': // Left double quotation mark "
        case '"':      // Standard ASCII double quote
        case "'":      // Single quote
        case '\u2018': // Left single quotation mark '
            return 'quotationOpen';
        case '\u201D': // Right double quotation mark "
        case '\u2019': // Right single quotation mark '
            return 'quotationClose';
        default:
            return null;
    }
}




