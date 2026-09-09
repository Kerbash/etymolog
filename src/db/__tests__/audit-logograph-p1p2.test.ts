/**
 * Adversarial audit — Logograph Phases 1 & 2 (lemma derivation + meaning rows)
 * ---------------------------------------------------------------------------
 * These pin defects the Phase-1 implementation missed once a word can be named
 * by its MEANING rather than its pronunciation:
 *
 *  1. A meaning may be up to `LIMITS.MEANING` (2000) chars, but the derived
 *     NOT-NULL `lemma` is capped at `LIMITS.LEMMA` (500) and the service
 *     validates that cap. A meaning-only word whose first meaning exceeds 500
 *     chars therefore failed to create/update with a confusing "Lemma exceeds
 *     maximum length" error the user could not act on — they never typed a
 *     lemma. The API now truncates the meaning-derived lemma (a display name),
 *     while the meaning row keeps its full text.
 *
 *  2. The API trimmed meaning rows but did NOT drop the empty ones, so a
 *     leading blank meaning row persisted as junk AND blanked out the primary
 *     (legacy) `meaning` column — because the service takes `meanings[0]` as
 *     the primary — even when a real meaning followed. Empty rows are now
 *     dropped, keeping storage in step with the "first non-empty meaning"
 *     lemma rule.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import { initDatabase, clearDatabase, getLexiconById, getLexiconComplete } from '../index';
import { lexiconApi } from '../api/lexiconApi';
import { LIMITS } from '../utils/sanitize';

describe('audit P1 — meaning-derived lemma length', () => {
    beforeAll(async () => {
        await initDatabase();
    });
    beforeEach(() => {
        clearDatabase();
    });

    it('creates a meaning-only word whose first meaning exceeds the lemma cap', () => {
        const longMeaning = 'x'.repeat(LIMITS.MEANING); // 2000 chars — a legal meaning
        const res = lexiconApi.create({ meanings: [{ meaning: longMeaning }] });

        expect(res.success).toBe(true);
        const word = getLexiconComplete(res.data!.id)!;
        // lemma is truncated to the cap …
        expect(word.lemma.length).toBe(LIMITS.LEMMA);
        expect(word.lemma).toBe('x'.repeat(LIMITS.LEMMA));
        // … but the meaning row keeps its full text.
        expect(word.meanings[0]?.meaning).toBe(longMeaning);
    });

    it('clears the pronunciation on edit with a long meaning without a lemma-length crash', () => {
        const created = lexiconApi.create({ pronunciation: 'kato', meanings: [{ meaning: 'cat' }] });
        const id = created.data!.id;
        const longMeaning = 'y'.repeat(700);

        const res = lexiconApi.update(id, { pronunciation: null, meanings: [{ meaning: longMeaning }] });

        expect(res.success).toBe(true);
        const word = getLexiconById(id)!;
        expect(word.pronunciation).toBeNull();
        expect(word.lemma.length).toBe(LIMITS.LEMMA);
    });

    it('a legal (≤ cap) meaning still names the word in full', () => {
        const res = lexiconApi.create({ meanings: [{ meaning: 'boredom' }] });
        expect(res.data!.lemma).toBe('boredom');
    });
});

describe('audit P1 — empty meaning rows are dropped', () => {
    beforeAll(async () => {
        await initDatabase();
    });
    beforeEach(() => {
        clearDatabase();
    });

    it('does not persist a leading blank meaning row, and the primary meaning is the real one', () => {
        const res = lexiconApi.create({
            pronunciation: 'abc',
            meanings: [{ meaning: '   ' }, { meaning: 'night' }],
        });
        expect(res.success).toBe(true);

        const word = getLexiconComplete(res.data!.id)!;
        // Only the real meaning survives — the blank row is gone.
        expect(word.meanings.map(m => m.meaning)).toEqual(['night']);
        // The primary/legacy column is the real meaning, not an empty string.
        expect(word.meaning).toBe('night');
    });

    it('an all-blank meanings array persists no rows (with a pronunciation naming the word)', () => {
        const res = lexiconApi.create({
            pronunciation: 'abc',
            meanings: [{ meaning: '   ' }, { meaning: '' }],
        });
        expect(res.success).toBe(true);

        const word = getLexiconComplete(res.data!.id)!;
        expect(word.meanings).toHaveLength(0);
        expect(word.meaning).toBeNull();
        expect(word.lemma).toBe('abc');
    });

    it('drops blank rows on update while keeping the omitted-vs-cleared distinction', () => {
        const created = lexiconApi.create({
            pronunciation: 'kato',
            meanings: [{ meaning: 'cat' }, { meaning: 'feline' }],
        });
        const id = created.data!.id;

        // Update with a blank leading row + a real one: blank dropped.
        lexiconApi.update(id, { meanings: [{ meaning: '  ' }, { meaning: 'kitty' }] });
        let word = getLexiconComplete(id)!;
        expect(word.meanings.map(m => m.meaning)).toEqual(['kitty']);
        expect(word.meaning).toBe('kitty');

        // Omitting meanings entirely leaves the stored meanings untouched.
        lexiconApi.update(id, { notes: 'just a note' });
        word = getLexiconComplete(id)!;
        expect(word.meanings.map(m => m.meaning)).toEqual(['kitty']);
    });
});
