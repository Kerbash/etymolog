/**
 * checkWords — "Check all my words", pure (CONLANG_EDGES_PLAN.md §6.1 / §6.4).
 *
 * Asserted: every list (unplaced, lone consonants with and without the mark,
 * unreadable), the clean count, one word in several lists, `count` exact while
 * `rows` stop at `MAX_WORD_CHECK_ROWS`, unused templates (none for an empty
 * lexicon), words with no spelling skipped and not counted, and the readout
 * matching the preview caption's (`summarizeBlocks`) for the same word.
 */

import { describe, expect, it } from 'vitest';

import type { BlockScheme } from '../../../../../blocks';
import type { GraphemeComplete, SpellingDisplayEntry } from '../../../../../db/types';
import { A, K, T, cvcScheme, gEntry, glyph, grapheme, mapOf } from '../../../../display/spelling/__tests__/blockFixtures';
import { summarizeBlocks } from '../blockSchemeDraft';
import { MAX_WORD_CHECK_ROWS, checkWords } from '../checkWords';
import type { CheckedWord } from '../checkWords';

const MARK = grapheme({ id: 40, phoneme: null, glyphs: [glyph(41, 'virama')] });
/** A syllable sign: one grapheme whose sound is `ka`. */
const KA = grapheme({ id: 5, phoneme: 'ka', glyphs: [glyph(51, 'ka-sign')] });
/** Spelled with, but NOT in the index: its entry cannot be read. */
const GONE = grapheme({ id: 99, phoneme: 'x', glyphs: [glyph(991, 'gone')] });

const map = mapOf(K, A, T, MARK, KA);
const MARKED: BlockScheme = { ...cvcScheme(), leftovers: { markGraphemeId: MARK.id, placement: 'below' } };

let nextId = 1;
function word(label: string, signs: readonly GraphemeComplete[]): CheckedWord {
    const spellingDisplay: SpellingDisplayEntry[] = signs.map((g, i) => gEntry(g, i));
    return { id: nextId++, lemma: `${label}-lemma`, pronunciation: label, spellingDisplay };
}

describe('checkWords', () => {
    it('clean words land in no list and use their templates', () => {
        const words = [word('ka', [K, A]), word('kat', [K, A, T])];
        const check = checkWords(words, cvcScheme(), map);
        expect(check).toMatchObject({ checked: 2, clean: 2, unusedTemplates: [] });
        expect(check.unplaced).toEqual({ rows: [], count: 0 });
        expect(check.loneConsonants).toEqual({ rows: [], count: 0 });
        expect(check.unreadable).toEqual({ rows: [], count: 0 });
    });

    it('a vowel and a syllable sign drawn on their own are unplaced', () => {
        const kaa = word('kaa', [K, A, A]);
        const sign = word('KA', [KA]);
        const check = checkWords([kaa, sign], cvcScheme(), map);
        expect(check.clean).toBe(0);
        expect(check.unplaced.count).toBe(2);
        expect(check.unplaced.rows).toEqual([
            { wordId: kaa.id, label: 'kaa', readout: 'ka · a', detail: 'a at the end is drawn on its own' },
            { wordId: sign.id, label: 'KA', readout: 'ka', detail: 'ka (syllable sign) is drawn on its own' },
        ]);
        expect(check.loneConsonants.count).toBe(0);
    });

    it('lone consonants say whether the vowel-killer mark draws', () => {
        const kaat = word('kaat', [K, A, A, T]);
        // No mark in the scheme: drawn alone.
        expect(checkWords([kaat], cvcScheme(), map).loneConsonants.rows[0].detail).toBe('t at the end is drawn alone');
        // A mark the index has: drawn with it (the word is still not clean).
        const marked = checkWords([word('t', [T])], MARKED, map);
        expect(marked.loneConsonants.rows[0]).toMatchObject({ label: 't', readout: 't', detail: 't has the vowel-killer mark' });
        expect(marked.clean).toBe(0);
        // A mark since deleted from the index: the renderer draws it alone.
        expect(checkWords([word('t', [T])], MARKED, mapOf(K, A, T)).loneConsonants.rows[0].detail).toBe('t is drawn alone');
    });

    it('an entry that cannot be read is listed, and one word can be in several lists', () => {
        const mixed = word('taax', [T, A, A, GONE]);
        const check = checkWords([mixed], cvcScheme(), map);
        // t a → CV block; a alone; the unreadable sign alone.
        expect(check.unreadable.rows).toEqual([
            { wordId: mixed.id, label: 'taax', readout: `ta · a · ${GONE.name}`, detail: `${GONE.name} cannot be read` },
        ]);
        // The unknown sign is NOT also counted as unplaced.
        expect(check.unplaced.rows).toEqual([
            { wordId: mixed.id, label: 'taax', readout: `ta · a · ${GONE.name}`, detail: 'a in the middle is drawn on its own' },
        ]);

        const both = word('taat', [T, A, A, T]);
        const check2 = checkWords([both], cvcScheme(), map);
        expect(check2.unplaced.rows.map((r) => r.wordId)).toEqual([both.id]);
        expect(check2.loneConsonants.rows.map((r) => r.wordId)).toEqual([both.id]);
        expect(check2.clean).toBe(0);
    });

    it('several findings of one list share one row', () => {
        const check = checkWords([word('tt', [T, T])], cvcScheme(), map);
        expect(check.loneConsonants.count).toBe(1);
        expect(check.loneConsonants.rows[0].detail).toBe('t at the start is drawn alone; t at the end is drawn alone');
    });

    it('the label falls back to the lemma', () => {
        const w: CheckedWord = { id: 500, lemma: 'aa', pronunciation: null, spellingDisplay: [gEntry(A, 0)] };
        expect(checkWords([w], cvcScheme(), map).unplaced.rows[0].label).toBe('aa');
    });

    it('count stays exact while rows stop at MAX_WORD_CHECK_ROWS, in lexicon order', () => {
        const words = Array.from({ length: MAX_WORD_CHECK_ROWS + 50 }, (_, i) => word(`a${i}`, [A]));
        const check = checkWords(words, cvcScheme(), map);
        expect(check.checked).toBe(MAX_WORD_CHECK_ROWS + 50);
        expect(check.unplaced.count).toBe(MAX_WORD_CHECK_ROWS + 50);
        expect(check.unplaced.rows).toHaveLength(MAX_WORD_CHECK_ROWS);
        expect(check.unplaced.rows[0].label).toBe('a0');
        expect(check.unplaced.rows[MAX_WORD_CHECK_ROWS - 1].label).toBe(`a${MAX_WORD_CHECK_ROWS - 1}`);
    });

    it('lists the templates no checked word used; none for an empty lexicon', () => {
        expect(checkWords([word('ka', [K, A])], cvcScheme(), map).unusedTemplates).toEqual([{ id: 'cvc', name: 'CVC' }]);
        expect(checkWords([], cvcScheme(), map)).toEqual({
            checked: 0,
            clean: 0,
            unplaced: { rows: [], count: 0 },
            loneConsonants: { rows: [], count: 0 },
            unreadable: { rows: [], count: 0 },
            unusedTemplates: [],
        });
    });

    it('skips words with no spelling (not checked, not counted)', () => {
        const blank: CheckedWord = { id: 900, lemma: 'blank', pronunciation: 'blank', spellingDisplay: [] };
        const check = checkWords([blank], cvcScheme(), map);
        expect(check.checked).toBe(0);
        expect(check.unusedTemplates).toEqual([]);
        expect(checkWords([blank, word('ka', [K, A])], cvcScheme(), map)).toMatchObject({ checked: 1, clean: 1 });
    });

    it('reads every word exactly as the preview caption does', () => {
        const bySyllable: BlockScheme = { ...MARKED, split: { mode: 'syllables' } };
        const spellings = [[K, A, A, T], [T, A, A, GONE], [KA, T], [T, T], [K, A, T, A, A]];
        let compared = 0;
        for (const scheme of [cvcScheme(), MARKED, bySyllable]) {
            for (const signs of spellings) {
                const w = word('w', signs);
                const check = checkWords([w], scheme, map);
                const row = check.unplaced.rows[0] ?? check.loneConsonants.rows[0] ?? check.unreadable.rows[0];
                if (!row) continue;
                compared += 1;
                expect(row.readout).toBe(summarizeBlocks(w.spellingDisplay, scheme, map).readout);
            }
        }
        expect(compared).toBeGreaterThan(8);
    });

    it('agrees with the caption on how many consonants carry the mark', () => {
        const w = word('kaatt', [K, A, A, T, T]);
        const summary = summarizeBlocks(w.spellingDisplay, MARKED, map);
        const details = checkWords([w], MARKED, map).loneConsonants.rows[0].detail.split('; ');
        expect(details.filter((d) => d.endsWith('has the vowel-killer mark'))).toHaveLength(summary.lone);
        expect(summary.lone).toBeGreaterThan(0);
    });
});
