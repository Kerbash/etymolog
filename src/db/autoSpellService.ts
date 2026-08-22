/**
 * Auto-Spell Service
 *
 * Generates spelling (ordered grapheme sequences) from pronunciation (IPA).
 * Uses the grapheme phoneme mappings marked with use_in_auto_spelling.
 *
 * Algorithm: Dynamic Programming with Two-Tier Optimization
 *
 * The algorithm uses DP to find the optimal spelling with the following priority:
 * 1. Rule 1 (Primary): Maximize IPA coverage - match as many pronunciation
 *    characters with real graphemes as possible
 * 2. Rule 2 (Secondary): Minimize grapheme count - when coverage is equal,
 *    prefer fewer graphemes
 *
 * This approach avoids the suboptimal results of greedy longest-match.
 * For example, with phonemes "ABC"→g1, "AB"→g2, "CD"→g3 and input "ABCD":
 * - Greedy would pick "ABC" first, leaving "D" unmatched (3 chars covered)
 * - DP finds "AB"+"CD" which covers all 4 characters
 *
 * Time Complexity: O(n × m) where n = pronunciation length, m = phoneme count
 * Space Complexity: O(n) for DP table
 *
 * THE FALLBACK'S UNIT IS A SOUND, NOT A CHARACTER. When nothing real matches,
 * `generateSpellingWithFallback` invents a virtual glyph — and it invents ONE
 * PER IPA TOKEN (`tokenizeIpa`), not one per code point. An affricate `t͡s`
 * used to come back as three placeholders (`t`, the tie bar, `s`) and a long
 * vowel `aː` as two; both are one sound and now come back as one glyph.
 * Real-grapheme matching is unchanged and still runs against the raw string, so
 * a grapheme whose phoneme is `t͡s` still matches and still beats the fallback.
 */

import { getAutoSpellingPhonemes } from './graphemeService';
import type { Phoneme, CreateLexiconSpellingInput, AutoSpellResultExtended, AutoSpellEntry } from './types';
import { createVirtualGlyph, generateVirtualGlyphId } from '../components/form/customInput/glyphCanvasInput/utils';
// The fallback's unit of "one thing I could not spell" is a SOUND, and the one
// definition of what a sound is lives in the generator's tokenizer. The db
// layer may read from `src/generator` (`src/db/api/types.ts` already does);
// the reverse direction is what would make a cycle.
import { tokenizeIpa } from '../generator/phonology/tokenize';
import { safeNormalize } from '../generator/phonology/features';

/**
 * Phoneme to grapheme mapping for auto-spelling.
 */
interface PhonemeMapping {
    phoneme: string;
    grapheme_id: number;
}

/**
 * Internal: DP state for optimal matching algorithm.
 * Tracks the best solution found for processing characters 0..i-1.
 */
interface DPState {
    /** Characters matched to REAL graphemes (not virtual) */
    coverage: number;
    /** Total entries (real + virtual graphemes) */
    graphemeCount: number;
    /** Index of previous state for path reconstruction */
    prevIndex: number;
    /** The phoneme mapping used at this step (null for initial state) */
    lastMatch: PhonemeMapping | null;
    /** Whether this step was a skip (virtual glyph) */
    isSkip: boolean;
    /** The whole IPA TOKEN this step skipped (never a lone code point) */
    skippedToken?: string;
}

/**
 * Pre-computed matches: maps each starting position to phonemes that match there.
 */
type PositionMatches = Map<number, Array<{ mapping: PhonemeMapping; endIndex: number }>>;

/**
 * One span of the pronunciation that the fallback may swallow whole when no
 * real grapheme can be found for it.
 */
interface SkipUnit {
    /** Start offset in the pronunciation string. */
    start: number;
    /** End offset (exclusive). */
    end: number;
    /** The source substring. */
    text: string;
}

/**
 * Last-resort spans: one code POINT each. Still better than the UTF-16 units
 * the fallback used before, which cut every astral symbol in half.
 */
function codePointUnits(pronunciation: string): SkipUnit[] {
    const units: SkipUnit[] = [];
    let offset = 0;
    for (const point of Array.from(pronunciation)) {
        units.push({ start: offset, end: offset + point.length, text: point });
        offset += point.length;
    }
    return units;
}

/**
 * The spans the fallback is allowed to turn into ONE virtual glyph each.
 *
 * These are sound tokens, not characters. An affricate `t͡s` is three code
 * points and one sound; a long vowel `aː` is two and one; an aspirated `pʰ` is
 * two and one. Skipping a code point at a time produced one blank placeholder
 * per code point — a tie bar and a length mark rendered as glyphs of their own,
 * which is nonsense on a page that is supposed to be showing the user a word.
 *
 * Separators (`ˈ ˌ . ‿` and whitespace) come back as their own single-character
 * tokens and therefore keep behaving exactly as they did: one virtual glyph
 * each. Dropping them instead would silently merge the halves of a two-word
 * pronunciation, which is a worse failure than a visible stress mark.
 *
 * THE OFFSETS NEED RE-ALIGNING. The tokenizer normalises to NFC and reports
 * offsets into the NORMALISED string, but the DP runs on the RAW one (so that a
 * grapheme's phoneme keeps matching the exact text it was stored as). For the
 * overwhelmingly common NFC input the two coincide and the fast path takes
 * them; for a decomposed input (`a` + U+0303 pasted from somewhere that does
 * not compose) the token is one code point shorter than the span it covers, so
 * the raw span is recovered by consuming code points until they normalise to
 * the token. The span's RAW text is what gets kept — the characters the user
 * typed are theirs, exactly as `IpaToken.text` treats them.
 */
function buildSkipUnits(pronunciation: string): SkipUnit[] {
    const units: SkipUnit[] = [];
    let offset = 0;

    for (const token of tokenizeIpa(pronunciation)) {
        // Fast path: the raw string already reads as this token.
        if (pronunciation.startsWith(token.text, offset)) {
            units.push({ start: offset, end: offset + token.text.length, text: token.text });
            offset += token.text.length;
            continue;
        }

        let consumed = '';
        let end = offset;
        while (end < pronunciation.length && safeNormalize(consumed, 'NFC') !== token.text) {
            const point = String.fromCodePoint(pronunciation.codePointAt(end) ?? 0);
            consumed += point;
            end += point.length;
        }
        if (safeNormalize(consumed, 'NFC') !== token.text) {
            return codePointUnits(pronunciation);
        }

        units.push({ start: offset, end, text: consumed });
        offset = end;
    }

    // A partition that does not cover the string would leave the DP with a gap
    // it cannot cross, and the fallback must never fail to spell.
    return offset === pronunciation.length ? units : codePointUnits(pronunciation);
}

/**
 * Compare two DP states using the optimization hierarchy.
 * Rule 1: Higher coverage wins (maximize IPA characters matched to real graphemes)
 * Rule 2: Fewer graphemes wins when coverage is equal
 *
 * @param a - First state to compare
 * @param b - Second state (or null/undefined)
 * @returns true if 'a' is better than 'b'
 */
function isBetterState(a: DPState, b: DPState | null | undefined): boolean {
    if (b === null || b === undefined) return true;
    // Rule 1: Higher coverage is better
    if (a.coverage > b.coverage) return true;
    if (a.coverage < b.coverage) return false;
    // Rule 2: Fewer graphemes when coverage equal
    return a.graphemeCount < b.graphemeCount;
}

/**
 * Pre-compute which phonemes match at each starting position in the pronunciation.
 * This optimization avoids redundant string comparisons during DP.
 *
 * @param pronunciation - The IPA string to parse
 * @param mappings - All phoneme mappings
 * @returns Map from start position to list of matching phonemes with their end positions
 */
function buildPositionMatches(
    pronunciation: string,
    mappings: PhonemeMapping[]
): PositionMatches {
    const positionMatches: PositionMatches = new Map();

    for (let i = 0; i < pronunciation.length; i++) {
        const remaining = pronunciation.substring(i);
        const matches: Array<{ mapping: PhonemeMapping; endIndex: number }> = [];

        for (const mapping of mappings) {
            if (remaining.startsWith(mapping.phoneme)) {
                matches.push({
                    mapping,
                    endIndex: i + mapping.phoneme.length,
                });
            }
        }

        if (matches.length > 0) {
            positionMatches.set(i, matches);
        }
    }

    return positionMatches;
}

/**
 * Reconstruct the spelling path from DP results.
 *
 * @param dp - The DP table
 * @param n - Length of pronunciation
 * @param pronunciation - Original pronunciation string
 * @returns Spelling entries, segments, and whether virtual glyphs were used
 */
function reconstructPath(
    dp: DPState[],
    n: number,
    _pronunciation: string
): { spelling: AutoSpellEntry[]; segments: string[]; hasVirtualGlyphs: boolean } {
    const path: Array<{ match: PhonemeMapping | null; isSkip: boolean; skippedToken?: string }> = [];
    let idx = n;

    // Walk backwards through the DP table
    while (idx > 0) {
        const state = dp[idx];
        path.push({
            match: state.lastMatch,
            isSkip: state.isSkip,
            skippedToken: state.skippedToken,
        });
        idx = state.prevIndex;
    }

    // Reverse to get forward order
    path.reverse();

    // Build the result
    const spelling: AutoSpellEntry[] = [];
    const segments: string[] = [];
    let hasVirtualGlyphs = false;
    let position = 0;

    for (const step of path) {
        if (step.isSkip && step.skippedToken) {
            // Virtual glyph — one per SOUND TOKEN, so `t͡s` is a single
            // placeholder rather than `t` + tie bar + `s`.
            const virtualId = generateVirtualGlyphId(step.skippedToken);
            spelling.push({
                grapheme_id: virtualId,
                position: position++,
                isVirtual: true,
                ipaCharacter: step.skippedToken,
            });
            segments.push(step.skippedToken);
            hasVirtualGlyphs = true;
        } else if (step.match) {
            // Real grapheme
            spelling.push({
                grapheme_id: step.match.grapheme_id,
                position: position++,
                isVirtual: false,
            });
            segments.push(step.match.phoneme);
        }
    }

    return { spelling, segments, hasVirtualGlyphs };
}

/**
 * Result of auto-spelling generation.
 */
export interface AutoSpellResult {
    success: boolean;
    /** Ordered grapheme IDs */
    spelling: CreateLexiconSpellingInput[];
    /** Segments consumed, in word order: a matched phoneme, or a skipped IPA TOKEN */
    segments: string[];
    /** Any unmatched portions of the pronunciation */
    unmatchedParts: string[];
    /** Error message if not successful */
    error?: string;
}

/**
 * Generate spelling from pronunciation using auto-spelling phonemes.
 *
 * Uses dynamic programming algorithm with two-tier optimization:
 * 1. Rule 1 (Primary): Maximize IPA coverage - match as many characters as possible
 * 2. Rule 2 (Secondary): Minimize grapheme count - when coverage is equal, prefer fewer graphemes
 *
 * This approach avoids the suboptimal results of greedy longest-match.
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

    // Parse pronunciation using optimal DP algorithm
    return optimalMatch(pronunciation, phonemeMappings);
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
 * DP-based optimal matching algorithm (strict mode - fails on unmatched).
 *
 * Uses dynamic programming to find the best spelling that:
 * 1. Maximizes IPA coverage (characters matched to real graphemes)
 * 2. Minimizes grapheme count (when coverage is equal)
 *
 * @param pronunciation - The IPA string to parse
 * @param mappings - Phoneme mappings (sorting not required)
 * @returns AutoSpellResult
 */
function optimalMatch(pronunciation: string, mappings: PhonemeMapping[]): AutoSpellResult {
    const n = pronunciation.length;

    // Pre-compute matches at each position
    const positionMatches = buildPositionMatches(pronunciation, mappings);

    // Initialize DP table
    // dp[i] = best solution for processing characters 0..i-1
    const dp: DPState[] = new Array(n + 1);

    // Base case: empty string processed
    dp[0] = {
        coverage: 0,
        graphemeCount: 0,
        prevIndex: -1,
        lastMatch: null,
        isSkip: false,
    };

    // Fill DP table
    for (let i = 1; i <= n; i++) {
        // Try each phoneme that ends at position i
        // We need to check all starting positions j where a phoneme could end at i
        for (let j = 0; j < i; j++) {
            // Skip if there's no valid path to position j
            if (!dp[j]) continue;

            const matches = positionMatches.get(j);
            if (matches) {
                for (const { mapping, endIndex } of matches) {
                    if (endIndex === i) {
                        // This phoneme spans from j to i
                        const newState: DPState = {
                            coverage: dp[j].coverage + (i - j),
                            graphemeCount: dp[j].graphemeCount + 1,
                            prevIndex: j,
                            lastMatch: mapping,
                            isSkip: false,
                        };

                        if (isBetterState(newState, dp[i])) {
                            dp[i] = newState;
                        }
                    }
                }
            }
        }
    }

    // Check if we reached the end with full coverage
    if (!dp[n]) {
        // No valid path found - collect unmatched parts
        // Find the farthest we could get
        let maxReached = 0;
        for (let i = n; i >= 0; i--) {
            if (dp[i]) {
                maxReached = i;
                break;
            }
        }

        const unmatchedParts: string[] = [];
        if (maxReached < n) {
            unmatchedParts.push(pronunciation.substring(maxReached));
        }

        // Also check for gaps in coverage - need to track what was skipped
        // For strict mode, we just report the tail as unmatched
        return {
            success: false,
            spelling: [],
            segments: [],
            unmatchedParts: unmatchedParts.length > 0 ? unmatchedParts : [pronunciation],
            error: `Could not match: ${unmatchedParts.length > 0 ? unmatchedParts.join(', ') : pronunciation}`,
        };
    }

    // Reconstruct the path (strict mode doesn't use virtual glyphs)
    const path: PhonemeMapping[] = [];
    let idx = n;
    while (idx > 0 && dp[idx]) {
        const lastMatch = dp[idx].lastMatch;
        if (lastMatch) {
            path.push(lastMatch);
        }
        idx = dp[idx].prevIndex;
    }
    path.reverse();

    // Build result
    const spelling: CreateLexiconSpellingInput[] = [];
    const segments: string[] = [];

    for (let pos = 0; pos < path.length; pos++) {
        spelling.push({
            grapheme_id: path[pos].grapheme_id,
            position: pos,
        });
        segments.push(path[pos].phoneme);
    }

    return {
        success: true,
        spelling,
        segments,
        unmatchedParts: [],
    };
}

/**
 * DP-based optimal matching algorithm with virtual glyph fallback.
 *
 * Uses dynamic programming to find the best spelling that:
 * 1. Maximizes IPA coverage (characters matched to real graphemes)
 * 2. Minimizes grapheme count (when coverage is equal)
 *
 * Unmatched characters become virtual glyphs (IPA characters).
 *
 * @param pronunciation - The IPA string to parse
 * @param mappings - Phoneme mappings (sorting not required)
 * @returns AutoSpellResultExtended
 */
function optimalMatchWithFallback(
    pronunciation: string,
    mappings: PhonemeMapping[]
): AutoSpellResultExtended {
    const n = pronunciation.length;

    // Pre-compute matches at each position. Real graphemes are matched against
    // the RAW string, not against the token grid: a grapheme whose phoneme is
    // `t͡s` has to keep matching `t͡s`, and one whose phoneme spans a syllable
    // dot has to keep matching that too.
    const positionMatches = buildPositionMatches(pronunciation, mappings);

    // The skip edges: the tokens partition the string, so at most one ends at
    // any offset and a map keyed by the END offset is all the DP needs to ask
    // "which token could I have swallowed to arrive here?".
    const skipEndingAt = new Map<number, SkipUnit>();
    for (const unit of buildSkipUnits(pronunciation)) {
        skipEndingAt.set(unit.end, unit);
    }

    // Initialize DP table
    const dp: DPState[] = new Array(n + 1);

    // Base case
    dp[0] = {
        coverage: 0,
        graphemeCount: 0,
        prevIndex: -1,
        lastMatch: null,
        isSkip: false,
    };

    // Fill DP table
    for (let i = 1; i <= n; i++) {
        // Option 1: Skip the whole TOKEN that ends here — one virtual glyph for
        // one sound. Because the tokens partition the string, following only
        // skip edges is always a complete path, so the fallback can never fail
        // to produce a spelling.
        const skipUnit = skipEndingAt.get(i);
        if (skipUnit && dp[skipUnit.start]) {
            const from = dp[skipUnit.start];
            const skipState: DPState = {
                coverage: from.coverage, // No coverage increase for virtual
                graphemeCount: from.graphemeCount + 1,
                prevIndex: skipUnit.start,
                lastMatch: null,
                isSkip: true,
                skippedToken: skipUnit.text,
            };

            if (isBetterState(skipState, dp[i])) {
                dp[i] = skipState;
            }
        }

        // Option 2: Try each phoneme that ends at position i
        for (let j = 0; j < i; j++) {
            if (!dp[j]) continue; // No valid path to j

            const matches = positionMatches.get(j);
            if (matches) {
                for (const { mapping, endIndex } of matches) {
                    if (endIndex === i) {
                        const newState: DPState = {
                            coverage: dp[j].coverage + (i - j),
                            graphemeCount: dp[j].graphemeCount + 1,
                            prevIndex: j,
                            lastMatch: mapping,
                            isSkip: false,
                        };

                        if (isBetterState(newState, dp[i])) {
                            dp[i] = newState;
                        }
                    }
                }
            }
        }
    }

    // Reconstruct path using the helper
    const { spelling, segments, hasVirtualGlyphs } = reconstructPath(dp, n, pronunciation);

    return {
        success: spelling.length > 0,
        spelling,
        segments,
        unmatchedParts: [], // No unmatched when using fallback
        hasVirtualGlyphs,
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
 * glyphs for any IPA TOKENS that cannot be matched to existing graphemes — one
 * glyph per sound, so `t͡s` and `aː` and `pʰ` each get exactly one placeholder
 * rather than one per code point. This ensures that the spelling always covers
 * the full pronunciation.
 *
 * Uses dynamic programming algorithm with two-tier optimization:
 * 1. Rule 1 (Primary): Maximize IPA coverage - match as many characters as possible
 * 2. Rule 2 (Secondary): Minimize grapheme count - when coverage is equal, prefer fewer graphemes
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
 *
 * // One placeholder per sound, not per code point:
 * generateSpellingWithFallback('t͡sa').spelling.length; // 2, not 4
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

    // Parse with optimal DP algorithm with fallback
    return optimalMatchWithFallback(pronunciation, phonemeMappings);
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
