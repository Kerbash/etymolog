/**
 * Auto-Spell Service
 *
 * Generates spelling (ordered grapheme sequences) from pronunciation (IPA).
 * Uses the grapheme phoneme mappings marked with use_in_auto_spelling.
 *
 * Algorithm:
 * 1. Get all phonemes marked for auto-spelling with their grapheme IDs
 * 2. Build a phoneme→grapheme_id map
 * 3. Use greedy longest-match to parse the pronunciation string
 * 4. Return ordered grapheme IDs
 */

import { getAutoSpellingPhonemes } from './graphemeService';
import type { Phoneme, CreateLexiconSpellingInput, AutoSpellResultExtended, AutoSpellEntry } from './types';
import { createVirtualGlyph, generateVirtualGlyphId } from '../components/form/customInput/glyphCanvasInput/utils';

/**
 * Phoneme to grapheme mapping for auto-spelling.
 */
interface PhonemeMapping {
    phoneme: string;
    grapheme_id: number;
}

/**
 * Result of auto-spelling generation.
 */
export interface AutoSpellResult {
    success: boolean;
    /** Ordered grapheme IDs */
    spelling: CreateLexiconSpellingInput[];
    /** Phoneme segments matched (for debugging/display) */
    segments: string[];
    /** Any unmatched portions of the pronunciation */
    unmatchedParts: string[];
    /** Error message if not successful */
    error?: string;
}

/**
 * Generate spelling from pronunciation using auto-spelling phonemes.
 *
 * Uses greedy longest-match algorithm:
 * - Sorts phonemes by length (descending) to match digraphs/trigraphs first
 * - Iterates through pronunciation, finding longest matching phoneme at each position
 * - Returns ordered grapheme IDs
 *
 * @param pronunciation - IPA pronunciation string
 * @returns AutoSpellResult with grapheme IDs and match info
 */
export function generateSpellingFromPronunciation(pronunciation: string): AutoSpellResult {
    if (!pronunciation || pronunciation.trim() === '') {
        return {
            success: false,
            spelling: [],
            segments: [],
            unmatchedParts: [],
            error: 'Pronunciation is empty',
        };
    }

    // Get all phonemes marked for auto-spelling
    const autoPhonemes = getAutoSpellingPhonemes();

    if (autoPhonemes.length === 0) {
        return {
            success: false,
            spelling: [],
            segments: [],
            unmatchedParts: [pronunciation],
            error: 'No phonemes are marked for auto-spelling. Create graphemes with phonemes and enable "use in auto-spelling".',
        };
    }

    // Build phoneme→grapheme map
    const phonemeMappings = buildPhonemeMap(autoPhonemes);

    // Sort by phoneme length (descending) for greedy longest-match
    const sortedMappings = [...phonemeMappings].sort((a, b) => b.phoneme.length - a.phoneme.length);

    // Parse pronunciation using greedy longest-match
    const result = greedyMatch(pronunciation, sortedMappings);

    return result;
}

/**
 * Build a phoneme to grapheme mapping from phoneme records.
 * If multiple graphemes have the same phoneme, the first one wins (by grapheme_id).
 */
function buildPhonemeMap(phonemes: Phoneme[]): PhonemeMapping[] {
    const seenPhonemes = new Map<string, number>();
    const mappings: PhonemeMapping[] = [];

    for (const p of phonemes) {
        // Only add if we haven't seen this phoneme before
        // (prefer lower grapheme_id, i.e., first created)
        if (!seenPhonemes.has(p.phoneme)) {
            seenPhonemes.set(p.phoneme, p.grapheme_id);
            mappings.push({
                phoneme: p.phoneme,
                grapheme_id: p.grapheme_id,
            });
        }
    }

    return mappings;
}

/**
 * Greedy longest-match algorithm for parsing pronunciation.
 *
 * @param pronunciation - The IPA string to parse
 * @param sortedMappings - Phoneme mappings sorted by length (descending)
 * @returns AutoSpellResult
 */
function greedyMatch(pronunciation: string, sortedMappings: PhonemeMapping[]): AutoSpellResult {
    const spelling: CreateLexiconSpellingInput[] = [];
    const segments: string[] = [];
    const unmatchedParts: string[] = [];

    let position = 0;
    let index = 0;
    let currentUnmatched = '';

    while (index < pronunciation.length) {
        let matched = false;

        // Try to match longest phoneme first
        for (const mapping of sortedMappings) {
            if (pronunciation.substring(index).startsWith(mapping.phoneme)) {
                // Found a match
                if (currentUnmatched) {
                    unmatchedParts.push(currentUnmatched);
                    currentUnmatched = '';
                }

                spelling.push({
                    grapheme_id: mapping.grapheme_id,
                    position: position++,
                });
                segments.push(mapping.phoneme);
                index += mapping.phoneme.length;
                matched = true;
                break;
            }
        }

        if (!matched) {
            // No match found, accumulate unmatched character
            currentUnmatched += pronunciation[index];
            index++;
        }
    }

    // Add any trailing unmatched content
    if (currentUnmatched) {
        unmatchedParts.push(currentUnmatched);
    }

    const success = unmatchedParts.length === 0 && spelling.length > 0;

    return {
        success,
        spelling,
        segments,
        unmatchedParts,
        error: unmatchedParts.length > 0
            ? `Could not match: ${unmatchedParts.join(', ')}`
            : undefined,
    };
}

/**
 * Preview auto-spelling without saving.
 * Returns detailed information about the match for user review.
 */
export function previewAutoSpelling(pronunciation: string): AutoSpellResult {
    return generateSpellingFromPronunciation(pronunciation);
}

/**
 * Get the phoneme mappings available for auto-spelling.
 * Useful for displaying what's available to the user.
 */
export function getAvailablePhonemeMap(): PhonemeMapping[] {
    const autoPhonemes = getAutoSpellingPhonemes();
    return buildPhonemeMap(autoPhonemes);
}

/**
 * Generate spelling from pronunciation with virtual IPA glyph fallbacks.
 *
 * Unlike `generateSpellingFromPronunciation`, this function creates virtual
 * glyphs for any IPA characters that cannot be matched to existing graphemes.
 * This ensures that the spelling always covers the full pronunciation.
 *
 * Virtual glyphs have negative IDs (generated from hash) and can be rendered
 * as IPA character text on the canvas.
 *
 * @param pronunciation - IPA pronunciation string
 * @returns AutoSpellResultExtended with grapheme IDs (may include virtual glyphs)
 *
 * @example
 * ```ts
 * // If 'ə' has no grapheme mapping:
 * const result = generateSpellingWithFallback('həˈloʊ');
 * // result.hasVirtualGlyphs will be true
 * // result.spelling will include a virtual glyph entry for 'ə'
 * ```
 */
export function generateSpellingWithFallback(pronunciation: string): AutoSpellResultExtended {
    if (!pronunciation || pronunciation.trim() === '') {
        return {
            success: false,
            spelling: [],
            segments: [],
            unmatchedParts: [],
            error: 'Pronunciation is empty',
            hasVirtualGlyphs: false,
        };
    }

    // Get all phonemes marked for auto-spelling
    const autoPhonemes = getAutoSpellingPhonemes();
    const phonemeMappings = buildPhonemeMap(autoPhonemes);

    // Sort by phoneme length (descending) for greedy longest-match
    const sortedMappings = [...phonemeMappings].sort((a, b) => b.phoneme.length - a.phoneme.length);

    // Parse with fallback
    return greedyMatchWithFallback(pronunciation, sortedMappings);
}

/**
 * Greedy longest-match algorithm with virtual glyph fallback.
 *
 * @param pronunciation - The IPA string to parse
 * @param sortedMappings - Phoneme mappings sorted by length (descending)
 * @returns AutoSpellResultExtended
 */
function greedyMatchWithFallback(
    pronunciation: string,
    sortedMappings: PhonemeMapping[]
): AutoSpellResultExtended {
    const spelling: AutoSpellEntry[] = [];
    const segments: string[] = [];
    let hasVirtualGlyphs = false;

    let position = 0;
    let index = 0;

    while (index < pronunciation.length) {
        let matched = false;

        // Try to match longest phoneme first
        for (const mapping of sortedMappings) {
            if (pronunciation.substring(index).startsWith(mapping.phoneme)) {
                // Found a real grapheme match
                spelling.push({
                    grapheme_id: mapping.grapheme_id,
                    position: position++,
                    isVirtual: false,
                });
                segments.push(mapping.phoneme);
                index += mapping.phoneme.length;
                matched = true;
                break;
            }
        }

        if (!matched) {
            // No match found - create virtual glyph for this character
            const ipaChar = pronunciation[index];
            const virtualId = generateVirtualGlyphId(ipaChar);

            spelling.push({
                grapheme_id: virtualId,
                position: position++,
                isVirtual: true,
                ipaCharacter: ipaChar,
            });
            segments.push(ipaChar);
            hasVirtualGlyphs = true;
            index++;
        }
    }

    return {
        success: spelling.length > 0,
        spelling,
        segments,
        unmatchedParts: [], // No unmatched parts when using fallback
        hasVirtualGlyphs,
    };
}

/**
 * Preview auto-spelling with fallback support.
 * Returns detailed information about the match for user review.
 *
 * @param pronunciation - IPA pronunciation string
 * @returns AutoSpellResultExtended with virtual glyph information
 */
export function previewAutoSpellingWithFallback(pronunciation: string): AutoSpellResultExtended {
    return generateSpellingWithFallback(pronunciation);
}

/**
 * Build a map of virtual glyphs from an extended auto-spell result.
 * Useful for creating the glyph map needed for canvas rendering.
 *
 * @param result - AutoSpellResultExtended from generateSpellingWithFallback
 * @returns Map of virtual glyph IDs to VirtualGlyph objects
 */
export function buildVirtualGlyphMap(result: AutoSpellResultExtended): Map<number, ReturnType<typeof createVirtualGlyph>> {
    const map = new Map<number, ReturnType<typeof createVirtualGlyph>>();

    for (const entry of result.spelling) {
        if (entry.isVirtual && entry.ipaCharacter) {
            const virtualGlyph = createVirtualGlyph(entry.ipaCharacter);
            map.set(entry.grapheme_id, virtualGlyph);
        }
    }

    return map;
}
