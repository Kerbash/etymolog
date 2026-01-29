/**
 * Spelling Utilities
 *
 * Utilities for parsing and formatting the glyph_order storage format.
 * This module provides the foundation for the Two-List Architecture:
 *
 * 1. glyph_order (JSON array) - The true ordered spelling, supporting:
 *    - Grapheme references: "grapheme-{id}" (e.g., "grapheme-123")
 *    - IPA characters: Stored as-is (e.g., "ə", "ʃ", "aɪ")
 *
 * 2. lexicon_spelling (junction table) - Relational index for queries like
 *    "which words use grapheme X?"
 *
 * @module db/utils/spellingUtils
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Prefix used to identify grapheme references in glyph_order.
 */
export const GRAPHEME_PREFIX = 'grapheme-';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * A single entry in the glyph_order array.
 * Either a grapheme reference (prefixed) or an IPA character (as-is).
 */
export type SpellingEntry = string;

/**
 * Parsed representation of a spelling entry.
 */
export interface ParsedSpellingEntry {
    /** Type of entry: 'grapheme' for real graphemes, 'ipa' for IPA fallback */
    type: 'grapheme' | 'ipa';
    /** Original value from glyph_order */
    rawValue: string;
    /** Extracted grapheme ID (only for grapheme type) */
    graphemeId?: number;
    /** The IPA character (only for ipa type, or for display of grapheme phoneme) */
    ipaCharacter?: string;
}

/**
 * Result of extracting grapheme IDs from glyph_order.
 */
export interface ExtractedGraphemeIds {
    /** Unique grapheme IDs for lexicon_spelling junction table */
    graphemeIds: number[];
    /** Whether the spelling contains IPA fallback characters */
    hasIpaFallbacks: boolean;
    /** Count of IPA fallback entries */
    ipaFallbackCount: number;
}

// =============================================================================
// PARSING UTILITIES
// =============================================================================

/**
 * Check if a spelling entry is a grapheme reference.
 *
 * @param entry - The spelling entry to check
 * @returns true if the entry is a grapheme reference
 *
 * @example
 * ```ts
 * isGraphemeEntry('grapheme-123') // true
 * isGraphemeEntry('ə')            // false
 * isGraphemeEntry('grapheme-')    // false (no ID)
 * ```
 */
export function isGraphemeEntry(entry: string): boolean {
    if (!entry.startsWith(GRAPHEME_PREFIX)) {
        return false;
    }
    const idPart = entry.substring(GRAPHEME_PREFIX.length);
    const id = parseInt(idPart, 10);
    return !isNaN(id) && id > 0;
}

/**
 * Extract the grapheme ID from a grapheme reference entry.
 *
 * @param entry - The spelling entry (must be a grapheme reference)
 * @returns The grapheme ID, or null if not a valid grapheme reference
 *
 * @example
 * ```ts
 * extractGraphemeId('grapheme-123') // 123
 * extractGraphemeId('ə')            // null
 * ```
 */
export function extractGraphemeId(entry: string): number | null {
    if (!entry.startsWith(GRAPHEME_PREFIX)) {
        return null;
    }
    const idPart = entry.substring(GRAPHEME_PREFIX.length);
    const id = parseInt(idPart, 10);
    return isNaN(id) || id <= 0 ? null : id;
}

/**
 * Create a grapheme reference entry from an ID.
 *
 * @param graphemeId - The grapheme ID
 * @returns The grapheme reference string
 *
 * @example
 * ```ts
 * createGraphemeEntry(123) // 'grapheme-123'
 * ```
 */
export function createGraphemeEntry(graphemeId: number): string {
    return `${GRAPHEME_PREFIX}${graphemeId}`;
}

/**
 * Parse a single spelling entry into its components.
 *
 * @param entry - The spelling entry to parse
 * @returns Parsed entry with type and relevant data
 *
 * @example
 * ```ts
 * parseSpellingEntry('grapheme-123')
 * // { type: 'grapheme', rawValue: 'grapheme-123', graphemeId: 123 }
 *
 * parseSpellingEntry('ə')
 * // { type: 'ipa', rawValue: 'ə', ipaCharacter: 'ə' }
 * ```
 */
export function parseSpellingEntry(entry: string): ParsedSpellingEntry {
    const graphemeId = extractGraphemeId(entry);

    if (graphemeId !== null) {
        return {
            type: 'grapheme',
            rawValue: entry,
            graphemeId,
        };
    }

    return {
        type: 'ipa',
        rawValue: entry,
        ipaCharacter: entry,
    };
}

/**
 * Parse an entire glyph_order array into structured data.
 *
 * @param glyphOrder - The glyph_order JSON array
 * @returns Array of parsed entries
 */
export function parseGlyphOrder(glyphOrder: SpellingEntry[]): ParsedSpellingEntry[] {
    return glyphOrder.map(parseSpellingEntry);
}

// =============================================================================
// EXTRACTION UTILITIES
// =============================================================================

/**
 * Extract unique grapheme IDs from a glyph_order array.
 * Used for maintaining the lexicon_spelling junction table.
 *
 * @param glyphOrder - The glyph_order JSON array
 * @returns Object with unique grapheme IDs and IPA fallback info
 *
 * @example
 * ```ts
 * extractGraphemeIds(['grapheme-1', 'ə', 'grapheme-2', 'grapheme-1'])
 * // { graphemeIds: [1, 2], hasIpaFallbacks: true, ipaFallbackCount: 1 }
 * ```
 */
export function extractGraphemeIds(glyphOrder: SpellingEntry[]): ExtractedGraphemeIds {
    const graphemeIdSet = new Set<number>();
    let ipaFallbackCount = 0;

    for (const entry of glyphOrder) {
        const parsed = parseSpellingEntry(entry);
        if (parsed.type === 'grapheme' && parsed.graphemeId) {
            graphemeIdSet.add(parsed.graphemeId);
        } else if (parsed.type === 'ipa') {
            ipaFallbackCount++;
        }
    }

    return {
        graphemeIds: Array.from(graphemeIdSet),
        hasIpaFallbacks: ipaFallbackCount > 0,
        ipaFallbackCount,
    };
}

// =============================================================================
// CONVERSION UTILITIES
// =============================================================================

/**
 * Convert a mixed array of items to glyph_order format.
 * Accepts grapheme IDs (positive numbers), virtual IDs (negative numbers),
 * or IPA character strings.
 *
 * @param items - Mixed array of grapheme IDs and IPA strings
 * @returns Array in glyph_order format
 *
 * @example
 * ```ts
 * // From UI with grapheme IDs and virtual IPA IDs
 * toGlyphOrder([123, -456, 789])
 * // With IPA string already (from auto-spell with fallback)
 * toGlyphOrder([123, 'ə', 789])
 * ```
 */
export function toGlyphOrder(items: (number | string)[]): SpellingEntry[] {
    return items.map(item => {
        if (typeof item === 'string') {
            // Already an IPA character or grapheme reference
            return item;
        }
        if (item > 0) {
            // Positive number = real grapheme ID
            return createGraphemeEntry(item);
        }
        // Negative number = virtual glyph ID (convert to IPA lookup needed)
        // Note: This case requires the caller to provide the IPA character
        // directly if they want it preserved. Virtual IDs alone can't be
        // converted back to IPA characters without additional context.
        throw new Error(`Cannot convert virtual glyph ID ${item} to glyph_order without IPA character. Use the IPA character string directly.`);
    });
}

/**
 * Convert a glyph_order array to a format suitable for the UI.
 * Returns grapheme IDs as numbers and IPA characters as strings.
 *
 * @param glyphOrder - The glyph_order JSON array
 * @returns Mixed array of grapheme IDs (number) and IPA characters (string)
 */
export function fromGlyphOrder(glyphOrder: SpellingEntry[]): (number | string)[] {
    return glyphOrder.map(entry => {
        const parsed = parseSpellingEntry(entry);
        if (parsed.type === 'grapheme' && parsed.graphemeId) {
            return parsed.graphemeId;
        }
        // IPA character - return as-is
        return parsed.ipaCharacter!;
    });
}

/**
 * Convert legacy lexicon_spelling data to glyph_order format.
 * Used for migration of existing data.
 *
 * @param graphemeIds - Array of grapheme IDs in position order
 * @returns glyph_order format array
 */
export function legacyToGlyphOrder(graphemeIds: number[]): SpellingEntry[] {
    return graphemeIds.map(createGraphemeEntry);
}

// =============================================================================
// VALIDATION UTILITIES
// =============================================================================

/**
 * Validate a glyph_order array.
 * Checks for valid format and returns any validation errors.
 *
 * @param glyphOrder - The glyph_order array to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateGlyphOrder(glyphOrder: unknown): string[] {
    const errors: string[] = [];

    if (!Array.isArray(glyphOrder)) {
        errors.push('glyph_order must be an array');
        return errors;
    }

    for (let i = 0; i < glyphOrder.length; i++) {
        const entry = glyphOrder[i];
        if (typeof entry !== 'string') {
            errors.push(`Entry at position ${i} must be a string, got ${typeof entry}`);
            continue;
        }
        if (entry.length === 0) {
            errors.push(`Entry at position ${i} is empty`);
            continue;
        }
        // Validate grapheme reference format
        if (entry.startsWith(GRAPHEME_PREFIX)) {
            const id = extractGraphemeId(entry);
            if (id === null) {
                errors.push(`Entry at position ${i} has invalid grapheme reference: ${entry}`);
            }
        }
        // IPA characters are accepted as-is (no validation needed)
    }

    return errors;
}

// =============================================================================
// UTILITY FUNCTIONS FOR RESPELLING
// =============================================================================

/**
 * Check if a spelling contains a specific grapheme.
 *
 * @param glyphOrder - The glyph_order array
 * @param graphemeId - The grapheme ID to check for
 * @returns true if the spelling contains the grapheme
 */
export function spellingContainsGrapheme(glyphOrder: SpellingEntry[], graphemeId: number): boolean {
    const targetEntry = createGraphemeEntry(graphemeId);
    return glyphOrder.includes(targetEntry);
}

/**
 * Replace a grapheme in a spelling with an IPA character.
 * Used when a grapheme is deleted and IPA fallback is needed.
 *
 * @param glyphOrder - The glyph_order array
 * @param graphemeId - The grapheme ID to replace
 * @param ipaCharacter - The IPA character to replace with
 * @returns New glyph_order array with the replacement
 */
export function replaceGraphemeWithIpa(
    glyphOrder: SpellingEntry[],
    graphemeId: number,
    ipaCharacter: string
): SpellingEntry[] {
    const targetEntry = createGraphemeEntry(graphemeId);
    return glyphOrder.map(entry => entry === targetEntry ? ipaCharacter : entry);
}

/**
 * Remove a grapheme from a spelling entirely.
 *
 * @param glyphOrder - The glyph_order array
 * @param graphemeId - The grapheme ID to remove
 * @returns New glyph_order array without the grapheme
 */
export function removeGraphemeFromSpelling(
    glyphOrder: SpellingEntry[],
    graphemeId: number
): SpellingEntry[] {
    const targetEntry = createGraphemeEntry(graphemeId);
    return glyphOrder.filter(entry => entry !== targetEntry);
}

/**
 * Serialize glyph_order to JSON string for database storage.
 *
 * @param glyphOrder - The glyph_order array
 * @returns JSON string
 */
export function serializeGlyphOrder(glyphOrder: SpellingEntry[]): string {
    return JSON.stringify(glyphOrder);
}

/**
 * Deserialize glyph_order from JSON string.
 *
 * @param json - The JSON string from database
 * @returns The glyph_order array, or empty array if invalid
 */
export function deserializeGlyphOrder(json: string | null): SpellingEntry[] {
    if (!json) {
        return [];
    }
    try {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) {
            return parsed.filter(entry => typeof entry === 'string');
        }
        return [];
    } catch {
        return [];
    }
}
