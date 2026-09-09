/**
 * Pronunciation-optional words (Phase 1, UC-A)
 * --------------------------------------------
 * Pronunciation used to be mandatory to add a word. It is now optional: a word
 * can be named by its meaning instead, and a symbol-first word may carry no
 * phonetics at all. The invariants pinned here:
 *
 *  - the api derives a NON-NULL lemma from a chain (explicit lemma →
 *    pronunciation → first non-empty meaning), and rejects a word with none of
 *    them with a clear message;
 *  - an edit never nulls the lemma out — clearing the pronunciation recomputes
 *    it from the meaning, or keeps the existing lemma when there is no meaning;
 *  - a pronunciation-less auto-spelled word is inert to respelling (a phoneme
 *    edit must not silently destroy its hand-placed spelling);
 *  - search-by-meaning and COALESCE ordering still work with a null
 *    pronunciation;
 *  - the display-name helper falls back to the lemma.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import {
    initDatabase,
    clearDatabase,
    createGlyph,
    createGrapheme,
    getLexiconById,
    getLexiconComplete,
    getAllLexiconComplete,
    searchLexicon,
    createGraphemeEntry,
} from '../index';
import { getAutoSpelledLexiconMentioning } from '../lexiconService';
import { respellAutoSpelledWords } from '../respellService';
import { lexiconApi } from '../api/lexiconApi';
import { lexiconDisplayName } from '../../components/tabs/lexicon/lexiconIdentity';

/** A grapheme with one glyph and one auto-spelling phoneme. */
function makeGrapheme(name: string, phoneme: string) {
    const glyph = createGlyph({ name: `${name}_glyph`, svg_data: '<svg/>' });
    return createGrapheme({
        name,
        glyphs: [{ glyph_id: glyph.id, position: 0 }],
        phonemes: [{ phoneme, use_in_auto_spelling: true }],
    });
}

describe('Pronunciation-optional words', () => {
    beforeAll(async () => {
        await initDatabase();
    });
    beforeEach(() => {
        clearDatabase();
    });

    describe('create — lemma fallback chain', () => {
        it('creates a native word with a meaning and no pronunciation', () => {
            const res = lexiconApi.create({ is_native: true, meanings: [{ meaning: 'cat' }] });
            expect(res.success).toBe(true);
            const word = res.data!;
            expect(word.pronunciation).toBeNull();
            expect(word.lemma).toBe('cat');
            expect(word.meanings[0]?.meaning).toBe('cat');
        });

        it('prefers an explicit lemma over pronunciation and meaning', () => {
            const res = lexiconApi.create({
                lemma: 'explicit',
                pronunciation: 'kato',
                meanings: [{ meaning: 'cat' }],
            });
            expect(res.data!.lemma).toBe('explicit');
        });

        it('prefers pronunciation over the meaning', () => {
            const res = lexiconApi.create({ pronunciation: 'kato', meanings: [{ meaning: 'cat' }] });
            expect(res.data!.lemma).toBe('kato');
        });

        it('uses the FIRST non-empty meaning when there is no pronunciation', () => {
            const res = lexiconApi.create({
                meanings: [{ meaning: '   ' }, { meaning: 'second' }, { meaning: 'third' }],
            });
            expect(res.data!.lemma).toBe('second');
        });

        it('falls back to the legacy single `meaning` field', () => {
            const res = lexiconApi.create({ meaning: 'legacy' });
            expect(res.success).toBe(true);
            expect(res.data!.lemma).toBe('legacy');
        });

        it('rejects a word with neither a pronunciation nor a meaning', () => {
            const res = lexiconApi.create({ is_native: true });
            expect(res.success).toBe(false);
            expect(res.error?.code).toBe('VALIDATION_ERROR');
            expect(res.error?.message).toBe('A word needs a pronunciation or at least one meaning');
        });

        it('rejects a word whose pronunciation and meanings are all whitespace', () => {
            const res = lexiconApi.create({ pronunciation: '   ', meanings: [{ meaning: '  ' }] });
            expect(res.success).toBe(false);
            expect(res.error?.message).toBe('A word needs a pronunciation or at least one meaning');
        });
    });

    describe('update — lemma is never nulled out', () => {
        it('recomputes the lemma from the meaning when the pronunciation is cleared', () => {
            const created = lexiconApi.create({ pronunciation: 'kato', meanings: [{ meaning: 'cat' }] });
            const id = created.data!.id;
            expect(getLexiconById(id)!.lemma).toBe('kato');

            const res = lexiconApi.update(id, { pronunciation: null, meanings: [{ meaning: 'cat' }] });
            expect(res.success).toBe(true);
            const word = getLexiconById(id)!;
            expect(word.pronunciation).toBeNull();
            expect(word.lemma).toBe('cat');
        });

        it('keeps the existing lemma when the pronunciation is cleared and there is no meaning', () => {
            const created = lexiconApi.create({ pronunciation: 'kato' });
            const id = created.data!.id;

            const res = lexiconApi.update(id, { pronunciation: null, meanings: [] });
            expect(res.success).toBe(true);
            const word = getLexiconById(id)!;
            expect(word.pronunciation).toBeNull();
            expect(word.lemma).toBe('kato');
        });

        it('treats an empty-string pronunciation on edit as a clear', () => {
            const created = lexiconApi.create({ pronunciation: 'kato', meanings: [{ meaning: 'cat' }] });
            const id = created.data!.id;

            lexiconApi.update(id, { pronunciation: '   ', meanings: [{ meaning: 'cat' }] });
            const word = getLexiconById(id)!;
            expect(word.pronunciation).toBeNull();
            expect(word.lemma).toBe('cat');
        });

        it('leaves the pronunciation untouched when the field is omitted', () => {
            const created = lexiconApi.create({ pronunciation: 'kato', meanings: [{ meaning: 'cat' }] });
            const id = created.data!.id;

            lexiconApi.update(id, { meanings: [{ meaning: 'feline' }] });
            const word = getLexiconById(id)!;
            expect(word.pronunciation).toBe('kato');
            // Explicit lemma/pronunciation both absent from the request, but a
            // present pronunciation still wins the chain over the new meaning.
            expect(word.lemma).toBe('kato');
        });
    });

    describe('respell — pronunciation-less auto-spelled words are inert', () => {
        it('never rewrites a word with no pronunciation on a phoneme edit', () => {
            const k = makeGrapheme('K', 'k');
            const created = lexiconApi.create({
                auto_spell: true,
                meanings: [{ meaning: 'thing' }],
                glyph_order: [createGraphemeEntry(k.id)],
            });
            const id = created.data!.id;
            const before = getLexiconById(id)!.glyph_order;
            expect(getLexiconById(id)!.pronunciation).toBeNull();
            expect(getLexiconById(id)!.auto_spell).toBe(true);

            // It is not even a respell candidate — the scan filters null / empty
            // pronunciations out.
            expect(getAutoSpelledLexiconMentioning(['k', 'thing']).map(w => w.id)).not.toContain(id);

            const report = respellAutoSpelledWords(['k', 'thing']);
            expect(report.respelledLexiconIds).not.toContain(id);
            expect(getLexiconById(id)!.glyph_order).toBe(before);
        });
    });

    describe('search + ordering with a null pronunciation', () => {
        it('finds a pronunciation-less word by its meaning', () => {
            lexiconApi.create({ meanings: [{ meaning: 'sleepiness' }] });
            const hits = searchLexicon('sleep');
            expect(hits.some(w => w.lemma === 'sleepiness')).toBe(true);
        });

        it('orders words by COALESCE(pronunciation, lemma) without crashing on nulls', () => {
            lexiconApi.create({ meanings: [{ meaning: 'apple' }] });   // no pronunciation → sorts by lemma
            lexiconApi.create({ pronunciation: 'zebra', meanings: [{ meaning: 'z' }] });
            lexiconApi.create({ pronunciation: 'mango', meanings: [{ meaning: 'm' }] });

            const names = getAllLexiconComplete().map(w => w.pronunciation ?? w.lemma);
            expect(names).toEqual(['apple', 'mango', 'zebra']);
        });
    });

    describe('display name fallbacks', () => {
        it('shows the pronunciation when present, else the lemma', () => {
            expect(lexiconDisplayName({ lemma: 'cat', pronunciation: 'kato' })).toBe('kato');
            expect(lexiconDisplayName({ lemma: 'cat', pronunciation: null })).toBe('cat');
            expect(lexiconDisplayName({ lemma: 'cat', pronunciation: '   ' })).toBe('cat');
        });

        it('names a meaning-only word via its derived lemma end-to-end', () => {
            const created = lexiconApi.create({ meanings: [{ meaning: 'boredom' }] });
            const complete = getLexiconComplete(created.data!.id)!;
            expect(lexiconDisplayName(complete)).toBe('boredom');
        });
    });
});
