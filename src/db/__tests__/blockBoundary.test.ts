/**
 * The `.` block boundary survives the speller (BLOCK_SCRIPT_PLAN P6)
 * -----------------------------------------------------------------
 * The block segmenter splits a word on the IPA syllable separator `.`, so the
 * dot has to reach `glyph_order` as the plain IPA entry `'.'`. Written FIRST,
 * before any change: the fallback speller already emits one virtual entry per
 * separator TOKEN (`buildSkipUnits` keeps `ˈ ˌ . ‿` and whitespace as tokens of
 * their own), so nothing in the speller had to change — these tests pin it.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import { initDatabase, clearDatabase, createGraphemeEntry } from '../index';
import { glyphApi } from '../api/glyphApi';
import { graphemeApi } from '../api/graphemeApi';
import { lexiconApi } from '../api/lexiconApi';
import { generateSpellingWithFallback } from '../autoSpellService';
import { deriveAutoSpelledGlyphOrder } from '../respellService';

function seed(phoneme: string): number {
    const glyph = glyphApi.create({ name: `${phoneme}-mark`, svg_data: `<svg><path d="${phoneme}"/></svg>` });
    const grapheme = graphemeApi.create({
        name: phoneme,
        glyphs: [{ glyph_id: glyph.data!.id, position: 0 }],
        phonemes: [{ phoneme, use_in_auto_spelling: true }],
    });
    return grapheme.data!.id;
}

describe('the "." boundary through the speller', () => {
    beforeAll(async () => {
        await initDatabase();
    });
    beforeEach(() => {
        clearDatabase();
    });

    it('with no graphemes, "ka.ta" spells as one virtual entry per sound, the dot included', () => {
        const result = generateSpellingWithFallback('ka.ta');
        expect(result.spelling.map((e) => [e.isVirtual, e.ipaCharacter])).toEqual([
            [true, 'k'],
            [true, 'a'],
            [true, '.'],
            [true, 't'],
            [true, 'a'],
        ]);
    });

    it('with graphemes for every sound, the dot is kept between them as a virtual entry', () => {
        const k = seed('k');
        const a = seed('a');
        const t = seed('t');
        const result = generateSpellingWithFallback('ka.ta');
        expect(result.spelling.map((e) => (e.isVirtual ? e.ipaCharacter : e.grapheme_id))).toEqual([k, a, '.', t, a]);
    });

    it('a syllable grapheme on each side still leaves the dot between them', () => {
        const ka = seed('ka');
        const ta = seed('ta');
        const result = generateSpellingWithFallback('ka.ta');
        expect(result.spelling.map((e) => (e.isVirtual ? e.ipaCharacter : e.grapheme_id))).toEqual([ka, '.', ta]);
    });

    it('deriveAutoSpelledGlyphOrder stores the dot as the IPA entry "."', () => {
        const k = seed('k');
        const a = seed('a');
        expect(deriveAutoSpelledGlyphOrder('ka.ka')).toEqual([
            createGraphemeEntry(k),
            createGraphemeEntry(a),
            '.',
            createGraphemeEntry(k),
            createGraphemeEntry(a),
        ]);
    });

    it('an auto-spelled word saved with a dotted pronunciation keeps the dot, and reads back as an IPA "." entry', () => {
        const k = seed('k');
        const a = seed('a');
        const created = lexiconApi.create({ pronunciation: 'ka.ka', auto_spell: true });
        expect(created.success).toBe(true);
        expect(JSON.parse(created.data!.glyph_order)).toEqual([
            createGraphemeEntry(k),
            createGraphemeEntry(a),
            '.',
            createGraphemeEntry(k),
            createGraphemeEntry(a),
        ]);
        const complete = lexiconApi.getByIdComplete(created.data!.id);
        const display = complete.data!.spellingDisplay;
        expect(display[2]).toMatchObject({ type: 'ipa', ipaCharacter: '.' });
        expect(display[2].role).toBeUndefined();
    });
});
