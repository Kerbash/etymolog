/**
 * Auto-Spell Service Tests
 *
 * Comprehensive test suite for the optimal auto-spelling algorithm.
 *
 * The algorithm uses dynamic programming with two-tier optimization:
 * 1. Rule 1 (Primary): Maximize IPA coverage - match as many pronunciation
 *    characters with real graphemes as possible
 * 2. Rule 2 (Secondary): Minimize grapheme count - when coverage is equal,
 *    prefer fewer graphemes
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import {
    initDatabase,
    clearDatabase,
    createGlyph,
    createGrapheme,
} from '../index';
import {
    generateSpellingFromPronunciation,
    generateSpellingWithFallback,
    previewAutoSpelling,
    previewAutoSpellingWithFallback,
    getAvailablePhonemeMap,
    buildVirtualGlyphMap,
} from '../autoSpellService';
import { generateVirtualGlyphId } from '../utils/virtualGlyph';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a test glyph for use in tests
 */
function createTestGlyph(name: string = 'TestGlyph', svg: string = '<svg/>') {
    return createGlyph({ name, svg_data: svg });
}

/**
 * Create a grapheme with a phoneme for auto-spelling tests
 */
function createGraphemeWithPhoneme(
    name: string,
    phoneme: string,
    useInAutoSpelling: boolean = true
) {
    const glyph = createTestGlyph(name);
    return createGrapheme({
        name,
        glyphs: [{ glyph_id: glyph.id, position: 0 }],
        phonemes: [{ phoneme, use_in_auto_spelling: useInAutoSpelling }],
    });
}

// =============================================================================
// TEST SETUP
// =============================================================================

describe('Auto-Spell Service', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    // =========================================================================
    // BASIC FUNCTIONALITY TESTS
    // =========================================================================

    describe('Basic Functionality', () => {
        it('should match single phoneme correctly', () => {
            const grapheme = createGraphemeWithPhoneme('A', 'a');

            const result = generateSpellingFromPronunciation('a');

            expect(result.success).toBe(true);
            expect(result.spelling).toHaveLength(1);
            expect(result.spelling[0].grapheme_id).toBe(grapheme.id);
            expect(result.segments).toEqual(['a']);
            expect(result.unmatchedParts).toEqual([]);
        });

        it('should match multiple phonemes in sequence', () => {
            const gC = createGraphemeWithPhoneme('C', 'k');
            const gA = createGraphemeWithPhoneme('A', 'æ');
            const gT = createGraphemeWithPhoneme('T', 't');

            const result = generateSpellingFromPronunciation('kæt');

            expect(result.success).toBe(true);
            expect(result.spelling).toHaveLength(3);
            expect(result.spelling[0].grapheme_id).toBe(gC.id);
            expect(result.spelling[1].grapheme_id).toBe(gA.id);
            expect(result.spelling[2].grapheme_id).toBe(gT.id);
            expect(result.segments).toEqual(['k', 'æ', 't']);
        });

        it('should preserve order in output', () => {
            const g1 = createGraphemeWithPhoneme('First', 'f');
            const g2 = createGraphemeWithPhoneme('Second', 's');
            const g3 = createGraphemeWithPhoneme('Third', 't');

            const result = generateSpellingFromPronunciation('fst');

            expect(result.spelling[0].position).toBe(0);
            expect(result.spelling[1].position).toBe(1);
            expect(result.spelling[2].position).toBe(2);
            expect(result.spelling[0].grapheme_id).toBe(g1.id);
            expect(result.spelling[1].grapheme_id).toBe(g2.id);
            expect(result.spelling[2].grapheme_id).toBe(g3.id);
        });

        it('should handle multi-character phonemes (digraphs)', () => {
            void createGraphemeWithPhoneme('SH', 'ʃ');
            void createGraphemeWithPhoneme('A', 'æ');
            void createGraphemeWithPhoneme('P', 'p');

            const result = generateSpellingFromPronunciation('ʃæp');

            expect(result.success).toBe(true);
            expect(result.spelling).toHaveLength(3);
            expect(result.segments).toEqual(['ʃ', 'æ', 'p']);
        });
    });

    // =========================================================================
    // RULE 1: MAXIMUM COVERAGE PRIORITY TESTS
    // =========================================================================

    describe('Rule 1: Maximum Coverage Priority', () => {
        it('should prefer full coverage over partial (the classic example)', () => {
            // Setup: "ABC"->g1, "AB"->g2, "CD"->g3
            // Input: "ABCD"
            // Greedy: ABC + (unmatched D) = 3 chars covered
            // Optimal: AB + CD = 4 chars covered (better!)
            void createGraphemeWithPhoneme('ABC', 'ABC');
            const gAB = createGraphemeWithPhoneme('AB', 'AB');
            const gCD = createGraphemeWithPhoneme('CD', 'CD');

            const result = generateSpellingFromPronunciation('ABCD');

            expect(result.success).toBe(true);
            expect(result.spelling).toHaveLength(2);
            expect(result.spelling[0].grapheme_id).toBe(gAB.id);
            expect(result.spelling[1].grapheme_id).toBe(gCD.id);
            expect(result.segments).toEqual(['AB', 'CD']);
            expect(result.unmatchedParts).toEqual([]);
        });

        it('should choose path that covers all characters when possible', () => {
            // Setup: "XYZ"->g1, "X"->g2, "YZ"->g3
            // Input: "XYZ"
            // Both paths cover all 3 chars, but XYZ is 1 grapheme vs X+YZ (2 graphemes)
            const gXYZ = createGraphemeWithPhoneme('XYZ', 'XYZ');
            void createGraphemeWithPhoneme('X', 'X');
            void createGraphemeWithPhoneme('YZ', 'YZ');

            const result = generateSpellingFromPronunciation('XYZ');

            expect(result.success).toBe(true);
            // Both paths have full coverage, so Rule 2 kicks in: prefer fewer graphemes
            expect(result.spelling).toHaveLength(1);
            expect(result.spelling[0].grapheme_id).toBe(gXYZ.id);
        });

        it('should maximize coverage even if it means more graphemes', () => {
            // Setup: "LONG"->g1, "L"->g2, "O"->g3, "N"->g4, "G"->g5, "NG"->g6
            // Input: "LONGX" (X has no mapping)
            // Coverage is same for both "LONG" and "L+O+N+G" when X is unmatched
            // But since X cannot be matched anyway, we want max coverage before X
            const gLONG = createGraphemeWithPhoneme('LONG', 'LONG');
            void createGraphemeWithPhoneme('L', 'L');
            void createGraphemeWithPhoneme('O', 'O');
            void createGraphemeWithPhoneme('N', 'N');
            void createGraphemeWithPhoneme('G', 'G');

            const result = generateSpellingFromPronunciation('LONG');

            // Full coverage with 1 grapheme is better than 4 graphemes
            expect(result.success).toBe(true);
            expect(result.spelling).toHaveLength(1);
            expect(result.spelling[0].grapheme_id).toBe(gLONG.id);
        });

        it('should handle overlapping phonemes by exploring all paths', () => {
            // Setup: "AB"->g1, "BC"->g2, "A"->g3, "C"->g4
            // Input: "ABC"
            // Path 1: AB + C = 3 coverage (2 graphemes)
            // Path 2: A + BC = 3 coverage (2 graphemes)
            // Both are valid, algorithm should find one of them
            const gAB = createGraphemeWithPhoneme('AB', 'AB');
            const gBC = createGraphemeWithPhoneme('BC', 'BC');
            const gA = createGraphemeWithPhoneme('A', 'A');
            const gC = createGraphemeWithPhoneme('C', 'C');

            const result = generateSpellingFromPronunciation('ABC');

            expect(result.success).toBe(true);
            expect(result.spelling).toHaveLength(2);
            // Should be either AB+C or A+BC
            const ids = result.spelling.map(s => s.grapheme_id);
            const isPath1 = ids[0] === gAB.id && ids[1] === gC.id;
            const isPath2 = ids[0] === gA.id && ids[1] === gBC.id;
            expect(isPath1 || isPath2).toBe(true);
        });
    });

    // =========================================================================
    // RULE 2: MINIMUM GRAPHEMES (EQUAL COVERAGE) TESTS
    // =========================================================================

    describe('Rule 2: Minimum Graphemes (equal coverage)', () => {
        it('should prefer fewer graphemes when coverage is equal', () => {
            // Setup: "CAT"->g1, "C"->g2, "A"->g3, "T"->g4
            // Input: "CAT"
            // All cover 3 chars
            // Expected: g1 (1 grapheme) over g2+g3+g4 (3 graphemes)
            const gCAT = createGraphemeWithPhoneme('CAT', 'CAT');
            void createGraphemeWithPhoneme('C', 'C');
            void createGraphemeWithPhoneme('A', 'A');
            void createGraphemeWithPhoneme('T', 'T');

            const result = generateSpellingFromPronunciation('CAT');

            expect(result.success).toBe(true);
            expect(result.spelling).toHaveLength(1);
            expect(result.spelling[0].grapheme_id).toBe(gCAT.id);
        });

        it('should prefer 2 graphemes over 3 when coverage is equal', () => {
            // Setup: "AB"->g1, "CD"->g2, "A"->g3, "B"->g4, "C"->g5, "D"->g6
            // Input: "ABCD"
            // Options: AB+CD (2), A+B+CD (3), AB+C+D (3), A+B+C+D (4)
            // Expected: AB+CD (2 graphemes)
            const gAB = createGraphemeWithPhoneme('AB', 'AB');
            const gCD = createGraphemeWithPhoneme('CD', 'CD');
            void createGraphemeWithPhoneme('A', 'A');
            void createGraphemeWithPhoneme('B', 'B');
            void createGraphemeWithPhoneme('C', 'C');
            void createGraphemeWithPhoneme('D', 'D');

            const result = generateSpellingFromPronunciation('ABCD');

            expect(result.success).toBe(true);
            expect(result.spelling).toHaveLength(2);
            expect(result.spelling[0].grapheme_id).toBe(gAB.id);
            expect(result.spelling[1].grapheme_id).toBe(gCD.id);
        });

        it('should handle tie-breaking consistently', () => {
            // Setup: "XY"->g1, "YZ"->g2, "X"->g3, "Z"->g4
            // Input: "XYZ"
            // Path 1: XY + Z = 3 coverage, 2 graphemes
            // Path 2: X + YZ = 3 coverage, 2 graphemes
            // Both are equally good, algorithm should pick one deterministically
            void createGraphemeWithPhoneme('XY', 'XY');
            void createGraphemeWithPhoneme('YZ', 'YZ');
            void createGraphemeWithPhoneme('X', 'X');
            void createGraphemeWithPhoneme('Z', 'Z');

            const result1 = generateSpellingFromPronunciation('XYZ');
            const result2 = generateSpellingFromPronunciation('XYZ');

            // Should be deterministic
            expect(result1.spelling.map(s => s.grapheme_id))
                .toEqual(result2.spelling.map(s => s.grapheme_id));
        });
    });

    // =========================================================================
    // EDGE CASES
    // =========================================================================

    describe('Edge Cases', () => {
        it('should handle empty pronunciation', () => {
            createGraphemeWithPhoneme('A', 'a');

            const result = generateSpellingFromPronunciation('');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Pronunciation is empty');
        });

        it('should handle whitespace-only pronunciation', () => {
            createGraphemeWithPhoneme('A', 'a');

            const result = generateSpellingFromPronunciation('   ');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Pronunciation is empty');
        });

        it('should handle no phoneme mappings defined', () => {
            // No graphemes created

            const result = generateSpellingFromPronunciation('test');

            expect(result.success).toBe(false);
            expect(result.error).toContain('No phonemes are marked for auto-spelling');
        });

        it('should handle unicode IPA characters', () => {
            void createGraphemeWithPhoneme('SH', 'ʃ');
            void createGraphemeWithPhoneme('SCHWA', 'ə');
            void createGraphemeWithPhoneme('TH', 'θ');

            const result = generateSpellingFromPronunciation('ʃəθ');

            expect(result.success).toBe(true);
            expect(result.spelling).toHaveLength(3);
            expect(result.segments).toEqual(['ʃ', 'ə', 'θ']);
        });

        it('should handle complete coverage impossible (strict mode)', () => {
            createGraphemeWithPhoneme('A', 'a');
            createGraphemeWithPhoneme('B', 'b');

            const result = generateSpellingFromPronunciation('axb');

            expect(result.success).toBe(false);
            expect(result.unmatchedParts.length).toBeGreaterThan(0);
        });

        it('should handle all unmatched characters', () => {
            createGraphemeWithPhoneme('A', 'a');

            const result = generateSpellingFromPronunciation('xyz');

            expect(result.success).toBe(false);
            expect(result.unmatchedParts).toContain('xyz');
        });

        it('should handle single character phonemes only', () => {
            void createGraphemeWithPhoneme('A', 'a');
            void createGraphemeWithPhoneme('B', 'b');
            void createGraphemeWithPhoneme('C', 'c');

            const result = generateSpellingFromPronunciation('abc');

            expect(result.success).toBe(true);
            expect(result.spelling).toHaveLength(3);
        });

        it('should handle repeated phonemes in pronunciation', () => {
            const gA = createGraphemeWithPhoneme('A', 'a');
            const gB = createGraphemeWithPhoneme('B', 'b');

            const result = generateSpellingFromPronunciation('aabba');

            expect(result.success).toBe(true);
            expect(result.spelling).toHaveLength(5);
            expect(result.spelling[0].grapheme_id).toBe(gA.id);
            expect(result.spelling[1].grapheme_id).toBe(gA.id);
            expect(result.spelling[2].grapheme_id).toBe(gB.id);
            expect(result.spelling[3].grapheme_id).toBe(gB.id);
            expect(result.spelling[4].grapheme_id).toBe(gA.id);
        });

        it('should handle phonemes that are substrings of others', () => {
            // "a" is a substring of "aa"
            void createGraphemeWithPhoneme('A', 'a');
            void createGraphemeWithPhoneme('AA', 'aa');

            const result = generateSpellingFromPronunciation('aaa');

            expect(result.success).toBe(true);
            // Optimal: "aa" + "a" = 2 graphemes (covers 3)
            // vs "a" + "a" + "a" = 3 graphemes (covers 3)
            expect(result.spelling).toHaveLength(2);
        });
    });

    // =========================================================================
    // VIRTUAL GLYPH FALLBACK TESTS
    // =========================================================================

    describe('Virtual Glyph Fallback', () => {
        it('should create virtual glyphs for unmatched characters', () => {
            createGraphemeWithPhoneme('A', 'a');
            createGraphemeWithPhoneme('B', 'b');

            const result = generateSpellingWithFallback('axb');

            expect(result.success).toBe(true);
            expect(result.spelling).toHaveLength(3);
            expect(result.hasVirtualGlyphs).toBe(true);

            // Check that 'x' became a virtual glyph
            const virtualEntry = result.spelling.find(s => s.isVirtual);
            expect(virtualEntry).toBeDefined();
            expect(virtualEntry?.ipaCharacter).toBe('x');
        });

        it('should set hasVirtualGlyphs flag correctly when no virtual glyphs', () => {
            createGraphemeWithPhoneme('A', 'a');
            createGraphemeWithPhoneme('B', 'b');

            const result = generateSpellingWithFallback('ab');

            expect(result.success).toBe(true);
            expect(result.hasVirtualGlyphs).toBe(false);
            expect(result.spelling.every(s => !s.isVirtual)).toBe(true);
        });

        it('should generate deterministic virtual IDs', () => {
            // Empty graphemes - all characters will be virtual
            const result1 = generateSpellingWithFallback('xyz');
            const result2 = generateSpellingWithFallback('xyz');

            expect(result1.spelling.map(s => s.grapheme_id))
                .toEqual(result2.spelling.map(s => s.grapheme_id));
        });

        it('should prefer real graphemes over virtual glyphs (Rule 1)', () => {
            // Setup: "AB"->g1, no mapping for "C"
            // Input: "ABC"
            // Should use AB (real) + C (virtual), not A+B+C (all virtual if no A,B mapping)
            const gAB = createGraphemeWithPhoneme('AB', 'AB');

            const result = generateSpellingWithFallback('ABC');

            expect(result.success).toBe(true);
            expect(result.spelling).toHaveLength(2);
            expect(result.spelling[0].grapheme_id).toBe(gAB.id);
            expect(result.spelling[0].isVirtual).toBe(false);
            expect(result.spelling[1].isVirtual).toBe(true);
            expect(result.spelling[1].ipaCharacter).toBe('C');
        });

        it('should handle all unmatched with fallback', () => {
            // No graphemes, so all will be virtual
            const result = generateSpellingWithFallback('xyz');

            expect(result.success).toBe(true);
            expect(result.hasVirtualGlyphs).toBe(true);
            expect(result.spelling).toHaveLength(3);
            expect(result.spelling.every(s => s.isVirtual)).toBe(true);
        });

        it('should handle empty pronunciation with fallback', () => {
            const result = generateSpellingWithFallback('');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Pronunciation is empty');
            expect(result.hasVirtualGlyphs).toBe(false);
        });

        it('should apply DP optimization even with fallback', () => {
            // Classic example with fallback
            // Setup: "ABC"->g1, "AB"->g2, "CD"->g3
            // Input: "ABCD"
            // Should find AB+CD (full coverage) not ABC+virtual-D
            void createGraphemeWithPhoneme('ABC', 'ABC');
            const gAB = createGraphemeWithPhoneme('AB', 'AB');
            const gCD = createGraphemeWithPhoneme('CD', 'CD');

            const result = generateSpellingWithFallback('ABCD');

            expect(result.success).toBe(true);
            expect(result.hasVirtualGlyphs).toBe(false);
            expect(result.spelling).toHaveLength(2);
            expect(result.spelling[0].grapheme_id).toBe(gAB.id);
            expect(result.spelling[1].grapheme_id).toBe(gCD.id);
        });
    });

    // =========================================================================
    // FALLBACK GRANULARITY: ONE VIRTUAL GLYPH PER SOUND, NOT PER CODE POINT
    // =========================================================================

    describe('Virtual Glyph Fallback — token granularity', () => {
        /** The IPA text of every entry, real ones read off `segments`. */
        const shape = (result: { spelling: { isVirtual?: boolean }[]; segments: string[] }) =>
            result.spelling.map((entry, i) => [result.segments[i], entry.isVirtual === true]);

        it('makes ONE virtual glyph for a tie-barred affricate', () => {
            // 't͡s' is THREE code points (t, U+0361, s) and ONE sound. The old
            // per-code-point skip produced three placeholders, the middle one
            // being a bare tie bar — a glyph of a diacritic, which is nonsense.
            const result = generateSpellingWithFallback('t͡sa');

            expect(result.success).toBe(true);
            expect(result.hasVirtualGlyphs).toBe(true);
            expect(shape(result)).toEqual([['t͡s', true], ['a', true]]);
            expect(result.spelling[0].ipaCharacter).toBe('t͡s');
        });

        it('makes ONE virtual glyph for a long vowel', () => {
            const result = generateSpellingWithFallback('aː');

            expect(result.spelling).toHaveLength(1);
            expect(result.spelling[0].ipaCharacter).toBe('aː');
            expect(result.segments).toEqual(['aː']);
        });

        it('keeps a modifier letter on its base', () => {
            const result = generateSpellingWithFallback('pʰa');

            expect(shape(result)).toEqual([['pʰ', true], ['a', true]]);
        });

        it('keeps a combining diacritic on its base', () => {
            // Nasalised 'ã' written with the combining tilde (U+0303).
            const result = generateSpellingWithFallback('ka\u0303t');

            expect(result.segments).toEqual(['k', 'a\u0303', 't']);
        });

        it('splits an untied "tʃ" into two tokens (the documented ambiguity)', () => {
            // Without a tie bar the string is genuinely ambiguous — affricate in
            // 'katʃa', cluster across a syllable boundary in 'hotʃop' — and the
            // tokenizer takes the conservative reading. Tie-barred 't͡ʃ' is one.
            const untied = generateSpellingWithFallback('tʃ');
            expect(untied.segments).toEqual(['t', 'ʃ']);
            expect(untied.spelling).toHaveLength(2);

            const tied = generateSpellingWithFallback('t͡ʃ');
            expect(tied.segments).toEqual(['t͡ʃ']);
            expect(tied.spelling).toHaveLength(1);
        });

        it('lets a real grapheme whose phoneme is an affricate beat the fallback', () => {
            const gTS = createGraphemeWithPhoneme('TS', 't͡s');
            const gA = createGraphemeWithPhoneme('A', 'a');

            const result = generateSpellingWithFallback('t͡sa');

            expect(result.hasVirtualGlyphs).toBe(false);
            expect(result.spelling.map(s => s.grapheme_id)).toEqual([gTS.id, gA.id]);
            expect(result.segments).toEqual(['t͡s', 'a']);
        });

        it('mixes real graphemes and whole-token virtual glyphs', () => {
            // 'a' HAS a grapheme, but the 'a' in 'aː' is only half a token and
            // half a sound cannot be spelled — the length mark would be left
            // standing on its own as a glyph, which is the bug being fixed.
            const gK = createGraphemeWithPhoneme('K', 'k');
            void createGraphemeWithPhoneme('A', 'a');

            const result = generateSpellingWithFallback('kaː t͡su');

            expect(result.spelling.map(s => s.grapheme_id)).toEqual([
                gK.id,
                generateVirtualGlyphId('aː'),
                generateVirtualGlyphId(' '),
                generateVirtualGlyphId('t͡s'),
                generateVirtualGlyphId('u'),
            ]);
            expect(result.segments).toEqual(['k', 'aː', ' ', 't͡s', 'u']);
            expect(result.spelling.map(s => s.isVirtual)).toEqual([false, true, true, true, true]);
        });

        it('does not let a partial match inside a token strand the rest of it', () => {
            // 'p' matches the head of 'pʰ', but there is no way to spell the
            // aspiration on its own, so the whole token becomes one placeholder
            // and the following 'a' still resolves to its real grapheme.
            void createGraphemeWithPhoneme('P', 'p');
            const gA = createGraphemeWithPhoneme('A', 'a');

            const result = generateSpellingWithFallback('pʰa');

            expect(result.spelling).toHaveLength(2);
            expect(result.spelling[0].isVirtual).toBe(true);
            expect(result.spelling[0].ipaCharacter).toBe('pʰ');
            expect(result.spelling[1].grapheme_id).toBe(gA.id);
        });

        it('keeps stress marks and syllable dots as their own single entries', () => {
            // DECISION: separators are KEPT, exactly as before this change —
            // they already were one token each, and dropping them would merge
            // the halves of a two-word pronunciation with no way to tell.
            const gK = createGraphemeWithPhoneme('K', 'k');
            const gA = createGraphemeWithPhoneme('A', 'a');
            const gT = createGraphemeWithPhoneme('T', 't');

            const result = generateSpellingWithFallback('ˈka.ta');

            expect(result.segments).toEqual(['ˈ', 'k', 'a', '.', 't', 'a']);
            expect(result.spelling.map(s => s.grapheme_id)).toEqual([
                generateVirtualGlyphId('ˈ'),
                gK.id,
                gA.id,
                generateVirtualGlyphId('.'),
                gT.id,
                gA.id,
            ]);
            expect(result.spelling.map(s => s.isVirtual)).toEqual([true, false, false, true, false, false]);
        });

        it('never merges a separator into the sound beside it', () => {
            const result = generateSpellingWithFallback('aːˈaː');

            expect(result.segments).toEqual(['aː', 'ˈ', 'aː']);
        });

        it('gives one id per SOUND, so two long vowels share a glyph', () => {
            const result = generateSpellingWithFallback('aːaː');

            expect(result.spelling).toHaveLength(2);
            expect(result.spelling[0].grapheme_id).toBe(result.spelling[1].grapheme_id);
            expect(result.spelling[0].grapheme_id).not.toBe(generateVirtualGlyphId('a'));
        });

        it('builds a virtual glyph map keyed by the multi-code-point token', () => {
            const result = generateSpellingWithFallback('t͡saː');
            const map = buildVirtualGlyphMap(result);

            expect(map.size).toBe(2);
            expect(map.get(generateVirtualGlyphId('t͡s'))?.ipaCharacter).toBe('t͡s');
            expect(map.get(generateVirtualGlyphId('aː'))?.ipaCharacter).toBe('aː');
            for (const glyph of map.values()) {
                expect(glyph.svg_data).toContain('<svg');
                expect(glyph.id).toBeLessThan(0);
            }
        });

        it('stays deterministic across calls', () => {
            const a = generateSpellingWithFallback('t͡ʃaːpʰ');
            const b = generateSpellingWithFallback('t͡ʃaːpʰ');

            expect(a.segments).toEqual(b.segments);
            expect(a.spelling.map(s => s.grapheme_id)).toEqual(b.spelling.map(s => s.grapheme_id));
            expect(a.segments).toEqual(['t͡ʃ', 'aː', 'pʰ']);
        });

        it('keeps segments aligned with spelling entry-for-entry', () => {
            // `translateWord` reads `segments[index]` for `spelling[index]`; a
            // drift between the two arrays renders the wrong character.
            const gK = createGraphemeWithPhoneme('K', 'k');

            const result = generateSpellingWithFallback('kt͡sk');

            expect(result.segments).toHaveLength(result.spelling.length);
            expect(result.spelling.map(s => s.grapheme_id)).toEqual([
                gK.id,
                generateVirtualGlyphId('t͡s'),
                gK.id,
            ]);
        });

        it('still spells a plain ASCII string one character at a time', () => {
            // The tokenizer only glues marks and tie bars; ordinary letters are
            // one token each, so nothing about the old behaviour changes here.
            const result = generateSpellingWithFallback('xyz');

            expect(result.spelling).toHaveLength(3);
            expect(result.segments).toEqual(['x', 'y', 'z']);
        });
    });

    // =========================================================================
    // PREVIEW FUNCTIONS
    // =========================================================================

    describe('Preview Functions', () => {
        it('previewAutoSpelling should work like generateSpellingFromPronunciation', () => {
            const grapheme = createGraphemeWithPhoneme('A', 'a');

            const result = previewAutoSpelling('a');

            expect(result.success).toBe(true);
            expect(result.spelling[0].grapheme_id).toBe(grapheme.id);
        });

        it('previewAutoSpellingWithFallback should work like generateSpellingWithFallback', () => {
            createGraphemeWithPhoneme('A', 'a');

            const result = previewAutoSpellingWithFallback('axb');

            expect(result.success).toBe(true);
            expect(result.hasVirtualGlyphs).toBe(true);
        });
    });

    // =========================================================================
    // UTILITY FUNCTIONS
    // =========================================================================

    describe('Utility Functions', () => {
        it('getAvailablePhonemeMap should return phoneme mappings', () => {
            createGraphemeWithPhoneme('A', 'a');
            createGraphemeWithPhoneme('B', 'b');

            const map = getAvailablePhonemeMap();

            expect(map).toHaveLength(2);
            expect(map.some(m => m.phoneme === 'a')).toBe(true);
            expect(map.some(m => m.phoneme === 'b')).toBe(true);
        });

        it('getAvailablePhonemeMap should only include auto-spelling phonemes', () => {
            createGraphemeWithPhoneme('A', 'a', true);
            createGraphemeWithPhoneme('B', 'b', false); // Not for auto-spelling

            const map = getAvailablePhonemeMap();

            expect(map).toHaveLength(1);
            expect(map[0].phoneme).toBe('a');
        });

        it('buildVirtualGlyphMap should create map from result', () => {
            const result = generateSpellingWithFallback('xyz');

            const map = buildVirtualGlyphMap(result);

            expect(map.size).toBe(3);
            // Each virtual glyph should be in the map
            for (const entry of result.spelling) {
                if (entry.isVirtual) {
                    expect(map.has(entry.grapheme_id)).toBe(true);
                }
            }
        });

        it('buildVirtualGlyphMap should return empty map for no virtual glyphs', () => {
            createGraphemeWithPhoneme('A', 'a');
            const result = generateSpellingWithFallback('a');

            const map = buildVirtualGlyphMap(result);

            expect(map.size).toBe(0);
        });
    });

    // =========================================================================
    // PERFORMANCE TESTS
    // =========================================================================

    describe('Performance', () => {
        it('should handle moderately long pronunciations efficiently', () => {
            // Create phoneme mappings for all lowercase letters
            for (let i = 0; i < 26; i++) {
                const char = String.fromCharCode(97 + i); // 'a' to 'z'
                createGraphemeWithPhoneme(char.toUpperCase(), char);
            }

            // Create a 50-character pronunciation
            const pronunciation = 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwx';

            const start = performance.now();
            const result = generateSpellingFromPronunciation(pronunciation);
            const elapsed = performance.now() - start;

            expect(result.success).toBe(true);
            expect(result.spelling).toHaveLength(50);
            // Should complete reasonably fast (< 100ms)
            expect(elapsed).toBeLessThan(100);
        });

        it('should handle pronunciation with many overlapping options', () => {
            // Create overlapping phonemes
            createGraphemeWithPhoneme('A', 'a');
            createGraphemeWithPhoneme('AB', 'ab');
            createGraphemeWithPhoneme('ABC', 'abc');
            createGraphemeWithPhoneme('B', 'b');
            createGraphemeWithPhoneme('BC', 'bc');
            createGraphemeWithPhoneme('C', 'c');

            // Repeat the pattern multiple times
            const pronunciation = 'abcabcabcabcabcabcabcabcabcabc';

            const start = performance.now();
            const result = generateSpellingFromPronunciation(pronunciation);
            const elapsed = performance.now() - start;

            expect(result.success).toBe(true);
            // Should prefer ABC (1 grapheme per 3 chars) over individual letters
            expect(result.spelling.length).toBeLessThan(pronunciation.length);
            expect(elapsed).toBeLessThan(100);
        });
    });

    // =========================================================================
    // PHONEME PRIORITY TESTS
    // =========================================================================

    describe('Phoneme Priority', () => {
        it('should use first grapheme when multiple have same phoneme', () => {
            // Create two graphemes with the same phoneme
            const g1 = createGraphemeWithPhoneme('First', 'x');
            void createGraphemeWithPhoneme('Second', 'x');

            const result = generateSpellingFromPronunciation('x');

            expect(result.success).toBe(true);
            // First grapheme (lower ID) should win
            expect(result.spelling[0].grapheme_id).toBe(g1.id);
        });

        it('should ignore phonemes not marked for auto-spelling', () => {
            createGraphemeWithPhoneme('A', 'a', true);
            createGraphemeWithPhoneme('B', 'b', false);

            const result = generateSpellingFromPronunciation('ab');

            expect(result.success).toBe(false);
            expect(result.unmatchedParts.length).toBeGreaterThan(0);
        });
    });
});
