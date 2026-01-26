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
import type { Phoneme, CreateLexiconSpellingInput } from './types';

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
