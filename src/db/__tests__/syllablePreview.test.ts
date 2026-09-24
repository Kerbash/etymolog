/**
 * Syllable preview spelling + the in-memory auto-spell map
 * --------------------------------------------------------
 *  - `autoSpellMappingsFromGraphemes(graphemesComplete)` is the SAME map
 *    `buildAutoSpellMappings()` reads from the database — including which
 *    grapheme wins a shared phoneme — so previews built from the provider's
 *    graphemes spell exactly like the real speller;
 *  - `spellSyllablePreview(c, v)` spells `c + v` from existing signs, and is
 *    `null` whenever a sound has no real grapheme (the cell stays empty);
 *  - `autoSpellToDisplayEntries` is the one speller → display-entry mapping,
 *    shared with the translator.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import { initDatabase, clearDatabase } from '../database';
import { glyphApi } from '../api/glyphApi';
import { graphemeApi } from '../api/graphemeApi';
import { autoSpellMappingsFromGraphemes, buildAutoSpellMappings, generateSpellingWithFallback } from '../autoSpellService';
import { autoSpellToDisplayEntries, spellSyllablePreview, translateWord, tokenizePhrase } from '../phraseService';
import type { GraphemeComplete } from '../types';

function seed(name: string, phonemes: { phoneme: string; use_in_auto_spelling: boolean }[]): number {
    const glyph = glyphApi.create({ name: `${name}-mark`, svg_data: '<svg/>' });
    return graphemeApi.create({ name, glyphs: [{ glyph_id: glyph.data!.id, position: 0 }], phonemes }).data!.id;
}

function graphemeMap(): Map<number, GraphemeComplete> {
    return new Map(graphemeApi.getAllComplete().data!.graphemes.map((g) => [g.id, g]));
}

describe('syllable preview spelling', () => {
    beforeAll(async () => {
        await initDatabase();
    });
    beforeEach(() => {
        clearDatabase();
    });

    it('the in-memory map equals the database map (order, shared phonemes, auto-spelling flag)', () => {
        seed('k', [{ phoneme: 'k', use_in_auto_spelling: true }]);
        seed('k2', [{ phoneme: 'k', use_in_auto_spelling: true }, { phoneme: 'c', use_in_auto_spelling: true }]);
        seed('a', [{ phoneme: 'a', use_in_auto_spelling: true }, { phoneme: 'ah', use_in_auto_spelling: false }]);
        seed('ka', [{ phoneme: 'ka', use_in_auto_spelling: true }]);
        // A reversed iteration order must not change which grapheme wins "k".
        const reversed = [...graphemeMap().values()].reverse();
        expect(autoSpellMappingsFromGraphemes(reversed)).toEqual(buildAutoSpellMappings());
        expect(autoSpellMappingsFromGraphemes([])).toEqual([]);
    });

    it('spells c + v from existing signs', () => {
        const k = seed('k', [{ phoneme: 'k', use_in_auto_spelling: true }]);
        const a = seed('a', [{ phoneme: 'a', use_in_auto_spelling: true }]);
        const map = graphemeMap();
        const entries = spellSyllablePreview('k', 'a', autoSpellMappingsFromGraphemes(map.values()), map);
        expect(entries?.map((e) => [e.type, e.grapheme?.id])).toEqual([['grapheme', k], ['grapheme', a]]);
    });

    it('is null when the consonant or the vowel has no sign, or either is empty', () => {
        seed('k', [{ phoneme: 'k', use_in_auto_spelling: true }]);
        seed('a', [{ phoneme: 'a', use_in_auto_spelling: true }]);
        const map = graphemeMap();
        const mappings = autoSpellMappingsFromGraphemes(map.values());
        expect(spellSyllablePreview('t', 'a', mappings, map)).toBeNull();
        expect(spellSyllablePreview('k', 'i', mappings, map)).toBeNull();
        expect(spellSyllablePreview('', 'a', mappings, map)).toBeNull();
        expect(spellSyllablePreview('k', '', mappings, map)).toBeNull();
    });

    it('a sign that is not used in auto-spelling does not count', () => {
        seed('k', [{ phoneme: 'k', use_in_auto_spelling: false }]);
        seed('a', [{ phoneme: 'a', use_in_auto_spelling: true }]);
        const map = graphemeMap();
        expect(spellSyllablePreview('k', 'a', autoSpellMappingsFromGraphemes(map.values()), map)).toBeNull();
    });

    it('autoSpellToDisplayEntries is what translateWord uses', () => {
        seed('k', [{ phoneme: 'k', use_in_auto_spelling: true }]);
        const map = graphemeMap();
        const [word] = tokenizePhrase('ko');
        const translated = translateWord(word, [], map);
        const direct = autoSpellToDisplayEntries(generateSpellingWithFallback('ko'), map);
        expect(translated.spellingDisplay).toEqual(direct.entries);
        expect(translated.hasVirtualGlyphs).toBe(true);
        expect(direct.entries.map((e) => e.type)).toEqual(['grapheme', 'ipa']);
    });
});
