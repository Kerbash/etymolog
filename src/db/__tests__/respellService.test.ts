/**
 * Respell service — auto-spelled words follow the script.
 *
 * A word with `auto_spell` on has a DERIVED spelling. These tests pin the two
 * halves of keeping it current: the NARROW candidate scan (only auto-spelled
 * words whose pronunciation mentions a changed phoneme are even looked at)
 * and the orchestration in the grapheme/phoneme API (every write that changes
 * the phoneme table respells, atomically with the write).
 *
 * The database is real sql.js. Glyph SVG is stored unsanitised (see setup.ts).
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, clearDatabase, getDatabase, countForeignKeyViolations } from '../database';
import { createGlyph } from '../glyphService';
import { createGrapheme, getPhonemesByGraphemeId, setGraphemePhonemes } from '../graphemeService';
import {
    createLexicon,
    getLexiconById,
    getAutoSpelledLexiconMentioning,
    updateLexicon,
} from '../lexiconService';
import { respellAutoSpelledWords, phonemePatterns, EMPTY_RESPELL_REPORT } from '../respellService';
import { graphemeApi, phonemeApi } from '../api/graphemeApi';
import { resetSettingsForTests } from '../api/settingsApi';
import { createGraphemeEntry } from '../utils/spellingUtils';
import { LIMITS } from '../utils/sanitize';

/** A grapheme with one glyph and one phoneme (auto-spelling unless told otherwise). */
function grapheme(name: string, phoneme: string, useInAutoSpelling = true) {
    const glyph = createGlyph({ name: `${name}-glyph-${Math.random().toString(36).slice(2, 7)}`, svg_data: '<svg/>' });
    return createGrapheme({
        name,
        glyphs: [{ glyph_id: glyph.id, position: 0 }],
        phonemes: [{ phoneme, use_in_auto_spelling: useInAutoSpelling }],
    });
}

/** An auto-spelled word stored with an explicit (possibly stale) spelling. */
function autoWord(pronunciation: string, glyphOrder: string[]) {
    return createLexicon({ lemma: pronunciation, pronunciation, auto_spell: true, glyph_order: glyphOrder });
}

const order = (id: number) => JSON.parse(getLexiconById(id)!.glyph_order) as string[];

describe('respell service', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
        localStorage.clear();
        resetSettingsForTests();
    });

    // =========================================================================
    // THE NARROW SCAN
    // =========================================================================

    describe('getAutoSpelledLexiconMentioning', () => {
        it('returns auto-spelled words whose pronunciation contains a pattern, and nothing else', () => {
            const hit = autoWord('kato', []);
            const manual = createLexicon({ lemma: 'kami', pronunciation: 'kami', auto_spell: false, glyph_order: [] });
            const noPronunciation = createLexicon({ lemma: 'ka-only-lemma', auto_spell: true, glyph_order: [] });
            const elsewhere = autoWord('tomo', []);

            const ids = getAutoSpelledLexiconMentioning(['ka']).map(w => w.id);
            expect(ids).toEqual([hit.id]);
            expect(ids).not.toContain(manual.id);
            expect(ids).not.toContain(noPronunciation.id);
            expect(ids).not.toContain(elsewhere.id);
        });

        it('returns each word once even when it matches several patterns', () => {
            const word = autoWord('kato', []);
            expect(getAutoSpelledLexiconMentioning(['ka', 'to', 'kato']).map(w => w.id)).toEqual([word.id]);
        });

        it('is an empty list for no patterns, blank patterns, or an empty-pronunciation word', () => {
            autoWord('kato', []);
            createLexicon({ lemma: 'blank', pronunciation: '', auto_spell: true, glyph_order: [] });
            expect(getAutoSpelledLexiconMentioning([])).toEqual([]);
            expect(getAutoSpelledLexiconMentioning([''])).toEqual([]);
        });

        it('treats LIKE wildcards in a phoneme as literal text', () => {
            const literal = autoWord('a%b', []);
            autoWord('axb', []);
            expect(getAutoSpelledLexiconMentioning(['a%b']).map(w => w.id)).toEqual([literal.id]);
            expect(getAutoSpelledLexiconMentioning(['a_b'])).toEqual([]);
        });

        it('matches case-sensitively, as the speller does', () => {
            autoWord('Ka', []);
            expect(getAutoSpelledLexiconMentioning(['ka'])).toEqual([]);
        });

        it('handles more patterns than fit one statement', () => {
            const word = autoWord('zzz', []);
            const patterns = Array.from({ length: 450 }, (_, i) => `p${i}`);
            patterns.push('zzz');
            expect(getAutoSpelledLexiconMentioning(patterns).map(w => w.id)).toEqual([word.id]);
        });
    });

    // =========================================================================
    // REGENERATION
    // =========================================================================

    describe('respellAutoSpelledWords', () => {
        it('turns a placeholder into the grapheme that now spells that sound', () => {
            const word = autoWord('ka', ['k', 'a']);
            const k = grapheme('K', 'k');

            const report = respellAutoSpelledWords(['k']);

            expect(report).toMatchObject({ scanned: 1, respelled: 1, unchanged: 0, respelledLexiconIds: [word.id] });
            expect(order(word.id)).toEqual([createGraphemeEntry(k.id), 'a']);
            expect(countForeignKeyViolations()).toBe(0);
        });

        it('writes nothing when the stored spelling already agrees with the speller', () => {
            const k = grapheme('K', 'k');
            const word = autoWord('ka', [createGraphemeEntry(k.id), 'a']);
            const before = getLexiconById(word.id)!.updated_at;
            getDatabase().run(`UPDATE lexicon SET updated_at = '2000-01-01 00:00:00' WHERE id = ?`, [word.id]);

            const report = respellAutoSpelledWords(['k']);

            expect(report).toMatchObject({ scanned: 1, respelled: 0, unchanged: 1, respelledLexiconIds: [] });
            expect(getLexiconById(word.id)!.updated_at).toBe('2000-01-01 00:00:00');
            expect(before).toBeTruthy();
        });

        it('is the empty report when no word mentions the patterns', () => {
            autoWord('to', ['t', 'o']);
            expect(respellAutoSpelledWords(['k'])).toEqual({ ...EMPTY_RESPELL_REPORT, respelledLexiconIds: [] });
        });

        it('leaves manually spelled words alone even when their pronunciation mentions the pattern', () => {
            grapheme('K', 'k');
            const manual = createLexicon({ lemma: 'ka', pronunciation: 'ka', auto_spell: false, glyph_order: ['k', 'a'] });
            respellAutoSpelledWords(['k']);
            expect(order(manual.id)).toEqual(['k', 'a']);
        });

        it('is narrow: a stale word whose pronunciation does NOT mention the pattern is not touched', () => {
            grapheme('K', 'k');
            grapheme('T', 't');
            // Stale on purpose — the speller would produce [T, o] for it.
            const unrelated = autoWord('to', []);
            respellAutoSpelledWords(['k']);
            expect(order(unrelated.id)).toEqual([]);
        });

        it('leaves needs_attention as it was', () => {
            const word = autoWord('ka', ['k', 'a']);
            updateLexicon(word.id, { needs_attention: true });
            grapheme('K', 'k');
            respellAutoSpelledWords(['k']);
            expect(getLexiconById(word.id)!.needs_attention).toBe(true);
        });

        it('phonemePatterns drops blanks', () => {
            expect(phonemePatterns([{ phoneme: 'a' }, { phoneme: '' }, { phoneme: 'b' }])).toEqual(['a', 'b']);
        });
    });

    // =========================================================================
    // ORCHESTRATION — every phoneme write respells
    // =========================================================================

    describe('graphemeApi.create', () => {
        it('respells the words that were waiting for its phoneme and reports how many', () => {
            const waiting = autoWord('ka', ['k', 'a']);
            const also = autoWord('ki', ['k', 'i']);
            const other = autoWord('to', ['t', 'o']);
            const glyph = createGlyph({ name: 'g', svg_data: '<svg/>' });

            const res = graphemeApi.create({
                name: 'K',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'k', use_in_auto_spelling: true }],
            });

            expect(res.success).toBe(true);
            expect(res.data!.lexiconRespelled).toBe(2);
            const k = createGraphemeEntry(res.data!.id);
            expect(order(waiting.id)).toEqual([k, 'a']);
            expect(order(also.id)).toEqual([k, 'i']);
            expect(order(other.id)).toEqual(['t', 'o']);
        });

        it('does not respell for a phoneme that is not used in auto-spelling', () => {
            const word = autoWord('ka', ['k', 'a']);
            const glyph = createGlyph({ name: 'g', svg_data: '<svg/>' });
            const res = graphemeApi.create({
                name: 'K',
                glyphs: [{ glyph_id: glyph.id, position: 0 }],
                phonemes: [{ phoneme: 'k', use_in_auto_spelling: false }],
            });
            expect(res.data!.lexiconRespelled).toBe(0);
            expect(order(word.id)).toEqual(['k', 'a']);
        });
    });

    describe('phonemeApi', () => {
        it('add: a new auto-spelling phoneme respells', () => {
            const g = grapheme('G', 'g');
            const word = autoWord('ka', ['k', 'a']);
            expect(phonemeApi.add({ grapheme_id: g.id, phoneme: 'k', use_in_auto_spelling: true }).success).toBe(true);
            expect(order(word.id)).toEqual([createGraphemeEntry(g.id), 'a']);
        });

        it('update: changing the text respells words that matched the OLD value and the NEW one', () => {
            const g = grapheme('G', 'k');
            const wasK = autoWord('ka', [createGraphemeEntry(g.id), 'a']);
            const willBeT = autoWord('ta', ['t', 'a']);
            const phoneme = getPhonemesByGraphemeId(g.id)[0];

            expect(phonemeApi.update(phoneme.id, { phoneme: 't' }).success).toBe(true);

            expect(order(wasK.id)).toEqual(['k', 'a']);
            expect(order(willBeT.id)).toEqual([createGraphemeEntry(g.id), 'a']);
        });

        it('update: switching auto-spelling off returns words to placeholders; on brings them back', () => {
            const g = grapheme('G', 'k');
            const word = autoWord('ka', [createGraphemeEntry(g.id), 'a']);
            const phoneme = getPhonemesByGraphemeId(g.id)[0];

            phonemeApi.update(phoneme.id, { use_in_auto_spelling: false });
            expect(order(word.id)).toEqual(['k', 'a']);

            phonemeApi.update(phoneme.id, { use_in_auto_spelling: true });
            expect(order(word.id)).toEqual([createGraphemeEntry(g.id), 'a']);
        });

        it('update: a context-only edit touches no word', () => {
            const g = grapheme('G', 'k');
            // Deliberately stale: a respell WOULD rewrite it.
            const word = autoWord('ka', ['k', 'a']);
            const phoneme = getPhonemesByGraphemeId(g.id)[0];
            phonemeApi.update(phoneme.id, { context: 'word-initial' });
            expect(order(word.id)).toEqual(['k', 'a']);
        });

        it('update: an unknown phoneme is NOT_FOUND', () => {
            expect(phonemeApi.update(9999, { phoneme: 'x' }).error?.code).toBe('NOT_FOUND');
        });

        it('delete: removing the phoneme returns the words to placeholders', () => {
            const g = grapheme('G', 'k');
            const word = autoWord('ka', [createGraphemeEntry(g.id), 'a']);
            const phoneme = getPhonemesByGraphemeId(g.id)[0];
            expect(phonemeApi.delete(phoneme.id).success).toBe(true);
            expect(order(word.id)).toEqual(['k', 'a']);
            expect(phonemeApi.delete(phoneme.id).error?.code).toBe('NOT_FOUND');
        });

        it('deleteAllForGrapheme respells every word its phonemes spelled', () => {
            const g = grapheme('G', 'k');
            phonemeApi.add({ grapheme_id: g.id, phoneme: 'q', use_in_auto_spelling: true });
            const ka = autoWord('ka', [createGraphemeEntry(g.id), 'a']);
            const qa = autoWord('qa', [createGraphemeEntry(g.id), 'a']);
            expect(phonemeApi.deleteAllForGrapheme(g.id).data).toBe(2);
            expect(order(ka.id)).toEqual(['k', 'a']);
            expect(order(qa.id)).toEqual(['q', 'a']);
        });

        it('replaceAll: one atomic replacement, one respell over old and new phonemes', () => {
            const g = grapheme('G', 'k');
            const wasK = autoWord('ka', [createGraphemeEntry(g.id), 'a']);
            const willBeT = autoWord('ta', ['t', 'a']);

            const res = phonemeApi.replaceAll({
                grapheme_id: g.id,
                phonemes: [{ phoneme: 't', use_in_auto_spelling: true }, { phoneme: '  ', use_in_auto_spelling: true }],
            });

            expect(res.success).toBe(true);
            expect(res.data!.phonemes.map(p => p.phoneme)).toEqual(['t']);
            expect(res.data!.lexiconRespelled).toBe(2);
            expect(order(wasK.id)).toEqual(['k', 'a']);
            expect(order(willBeT.id)).toEqual([createGraphemeEntry(g.id), 'a']);
        });

        it('replaceAll: a rejected row keeps the previous phonemes and respells nothing', () => {
            const g = grapheme('G', 'k');
            const word = autoWord('ka', [createGraphemeEntry(g.id), 'a']);

            const res = phonemeApi.replaceAll({
                grapheme_id: g.id,
                phonemes: [{ phoneme: 't' }, { phoneme: 'x'.repeat(LIMITS.PHONEME + 1) }],
            });

            expect(res.success).toBe(false);
            expect(getPhonemesByGraphemeId(g.id).map(p => p.phoneme)).toEqual(['k']);
            expect(order(word.id)).toEqual([createGraphemeEntry(g.id), 'a']);
        });

        it('replaceAll: an unknown grapheme is NOT_FOUND', () => {
            expect(phonemeApi.replaceAll({ grapheme_id: 9999, phonemes: [] }).error?.code).toBe('NOT_FOUND');
        });

        it('setGraphemePhonemes validates every row before writing any', () => {
            const g = grapheme('G', 'k');
            expect(() => setGraphemePhonemes(g.id, [{ phoneme: 'a' }, { phoneme: 'x'.repeat(LIMITS.PHONEME + 1) }])).toThrow();
            expect(getPhonemesByGraphemeId(g.id).map(p => p.phoneme)).toEqual(['k']);
        });
    });

    describe('graphemeApi.delete with respellLexicon', () => {
        it('regenerates auto-spelled words against the graphemes that remain', () => {
            const first = grapheme('KA-1', 'ka');
            const second = grapheme('KA-2', 'ka');
            const word = autoWord('kato', [createGraphemeEntry(first.id), 't', 'o']);

            const res = graphemeApi.delete(first.id, { respellLexicon: true });

            expect(res.success).toBe(true);
            expect(res.data!.lexiconRespelled).toBe(1);
            // The sound is still covered — by the other grapheme — so the word
            // is spelled with it, not with a placeholder.
            expect(order(word.id)).toEqual([createGraphemeEntry(second.id), 't', 'o']);
            expect(getLexiconById(word.id)!.needs_attention).toBe(false);
            expect(countForeignKeyViolations()).toBe(0);
        });

        it('keeps the phoneme placeholder for an auto-spelled word with no pronunciation', () => {
            const ka = grapheme('KA', 'ka');
            const word = createLexicon({ lemma: 'lemma-only', auto_spell: true, glyph_order: [createGraphemeEntry(ka.id), 'x'] });
            const res = graphemeApi.delete(ka.id, { respellLexicon: true });
            expect(res.data!.lexiconRespelled).toBe(1);
            expect(order(word.id)).toEqual(['ka', 'x']);
        });

        it('flags a manually spelled word instead of regenerating it', () => {
            const ka = grapheme('KA', 'ka');
            grapheme('K', 'k');
            const manual = createLexicon({ lemma: 'kato', pronunciation: 'kato', auto_spell: false, glyph_order: [createGraphemeEntry(ka.id), 't', 'o'] });
            const res = graphemeApi.delete(ka.id, { respellLexicon: true });
            expect(res.data).toMatchObject({ lexiconRespelled: 0, lexiconMarked: 1 });
            expect(order(manual.id)).toEqual(['ka', 't', 'o']);
            expect(getLexiconById(manual.id)!.needs_attention).toBe(true);
        });

        it('counts a word once when both the substitution and the regeneration touch it', () => {
            const ka = grapheme('KA', 'ka');
            grapheme('K', 'k');
            const word = autoWord('kato', [createGraphemeEntry(ka.id), 't', 'o']);
            const res = graphemeApi.delete(ka.id, { respellLexicon: true });
            expect(res.data!.lexiconRespelled).toBe(1);
            expect(order(word.id)[0]).toMatch(/^grapheme-/);
        });
    });
});
