/**
 * Translator logic — tokenizer punctuation, auto-spell with real graphemes,
 * semantic roles on synthesised entries, configured separators.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase } from '../database';
import { createGlyph } from '../glyphService';
import { createGrapheme, getAllGraphemesComplete } from '../graphemeService';
import { createLexicon, getAllLexiconComplete } from '../lexiconService';
import { tokenizePhrase, translateWord, translatePhrase } from '../phraseService';
import { phraseApi } from '../api/phraseApi';
import { DEFAULT_PUNCTUATION_SETTINGS, type PunctuationSettings } from '../api/types';
import { createGraphemeEntry } from '../utils/spellingUtils';
import type { GraphemeComplete } from '../types';

function makeGrapheme(name: string, phoneme: string, glyphCount = 1) {
    const glyphs = Array.from({ length: glyphCount }, (_, i) => {
        const glyph = createGlyph({ name: `${name}-g${i}`, svg_data: '<svg/>' });
        return { glyph_id: glyph.id, position: i };
    });
    return createGrapheme({ name, glyphs, phonemes: [{ phoneme, use_in_auto_spelling: true }] });
}

function graphemeMap(): Map<number, GraphemeComplete> {
    return new Map(getAllGraphemesComplete().map(g => [g.id, g]));
}

describe('tokenizePhrase', () => {
    it('peels punctuation off word edges into their own tokens', () => {
        const tokens = tokenizePhrase('Hello, world!');
        expect(tokens.map(t => [t.originalWord, t.kind])).toEqual([
            ['Hello', 'word'], [',', 'punctuation'], ['world', 'word'], ['!', 'punctuation'],
        ]);
        expect(tokens.map(t => t.position)).toEqual([0, 1, 2, 3]);
    });

    it('handles opening quotes, ellipses and line breaks', () => {
        const tokens = tokenizePhrase('"wait..."\nok');
        expect(tokens.map(t => [t.originalWord, t.kind])).toEqual([
            ['"', 'punctuation'], ['wait', 'word'], ['…', 'punctuation'], ['"', 'punctuation'], ['\n', 'line-break'], ['ok', 'word'],
        ]);
    });

    it('keeps interior apostrophes and hyphens as part of the word', () => {
        expect(tokenizePhrase("don't re-do").map(t => t.originalWord)).toEqual(["don't", 're-do']);
    });
});

describe('translateWord auto-spell', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    it('emits real graphemes for matched spans and keeps the tail aligned after a multi-letter match', () => {
        const th = makeGrapheme('th', 'th');
        const s = makeGrapheme('s', 's');
        const result = translateWord({ originalWord: 'this', normalizedWord: 'this', position: 0, kind: 'word' }, [], graphemeMap());

        expect(result.type).toBe('autospell');
        expect(result.spellingDisplay.map(e => e.type === 'grapheme' ? `G:${e.grapheme!.name}` : `i:${e.ipaCharacter}`))
            .toEqual([`G:${th.name}`, 'i:i', `G:${s.name}`]);
        expect(result.hasVirtualGlyphs).toBe(true);
    });

    it('is entirely real graphemes when every span matches', () => {
        makeGrapheme('ka', 'ka');
        makeGrapheme('to', 'to');
        const result = translateWord({ originalWord: 'kato', normalizedWord: 'kato', position: 0, kind: 'word' }, [], graphemeMap());
        expect(result.spellingDisplay.every(e => e.type === 'grapheme')).toBe(true);
        expect(result.hasVirtualGlyphs).toBe(false);
    });

    it('falls back to the consumed span as IPA when no grapheme map is supplied', () => {
        makeGrapheme('ka', 'ka');
        const result = translateWord({ originalWord: 'kat', normalizedWord: 'kat', position: 0, kind: 'word' }, []);
        expect(result.spellingDisplay.map(e => e.ipaCharacter)).toEqual(['ka', 't']);
    });
});

describe('translatePhrase', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
    });

    it('tags separators, punctuation and line breaks with roles', () => {
        const result = translatePhrase('a b.\nc', [], { punctuationSettings: DEFAULT_PUNCTUATION_SETTINGS });
        expect(result.combinedSpelling.map(e => [e.ipaCharacter, e.role ?? null])).toEqual([
            ['a', null], [' ', 'word-separator'], ['b', null], ['.', 'punctuation'], ['\n', 'line-break'], ['c', null],
        ]);
        expect(result.combinedSpelling.map(e => e.position)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(result.wordTranslations).toHaveLength(3);
    });

    it('uses a configured grapheme as the word separator and still marks the role', () => {
        const sep = makeGrapheme('sep', '|', 2);
        const settings: PunctuationSettings = {
            ...DEFAULT_PUNCTUATION_SETTINGS,
            wordSeparator: { graphemeId: sep.id, useNoGlyph: false },
        };
        const result = translatePhrase('a b', [], { punctuationSettings: settings, graphemeMap: graphemeMap() });
        const separator = result.combinedSpelling[1];
        expect(separator.type).toBe('grapheme');
        expect(separator.grapheme?.id).toBe(sep.id);
        expect(separator.role).toBe('word-separator');
    });

    it('omits hidden separators and punctuation', () => {
        const settings: PunctuationSettings = {
            ...DEFAULT_PUNCTUATION_SETTINGS,
            wordSeparator: { graphemeId: null, useNoGlyph: true },
            sentenceSeparator: { graphemeId: null, useNoGlyph: true },
        };
        const result = translatePhrase('a b.', [], { punctuationSettings: settings });
        expect(result.combinedSpelling.map(e => e.ipaCharacter)).toEqual(['a', 'b']);
    });

    it('places no separator between an opening quote and its word', () => {
        const result = translatePhrase('say "hi"', [], { punctuationSettings: DEFAULT_PUNCTUATION_SETTINGS });
        expect(result.combinedSpelling.map(e => e.ipaCharacter)).toEqual(['s', 'a', 'y', ' ', '"', 'h', 'i', '"']);
    });

    it('prefers lexicon spellings and exposes multi-glyph graphemes to the renderer', () => {
        const ka = makeGrapheme('ka', 'ka', 2);
        createLexicon({ lemma: 'cat', glyph_order: [createGraphemeEntry(ka.id)] });
        const result = translatePhrase('cat dog', getAllLexiconComplete(), { graphemeMap: graphemeMap() });
        expect(result.wordTranslations[0].type).toBe('lexicon');
        expect(result.combinedSpelling[0].grapheme?.id).toBe(ka.id);
        expect(result.combinedSpelling[1].role).toBe('word-separator');
    });

    it('phraseApi.translate wires the grapheme map for auto-spell', () => {
        const ka = makeGrapheme('ka', 'ka');
        const res = phraseApi.translate('ka', DEFAULT_PUNCTUATION_SETTINGS);
        expect(res.success).toBe(true);
        expect(res.data?.combinedSpelling[0].grapheme?.id).toBe(ka.id);
    });
});
