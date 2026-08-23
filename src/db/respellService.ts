/**
 * Respell Service
 *
 * Keeps auto-spelled words in step with the script.
 *
 * A word with `auto_spell` on has a DERIVED spelling: it is whatever the
 * auto-speller produces for the word's pronunciation against the graphemes
 * that exist right now. Until this service existed that derivation ran exactly
 * once — when the word was saved — so creating a grapheme for a sound that
 * twenty words were already using left all twenty showing the IPA placeholder,
 * and editing a grapheme's phoneme quietly made every word spelled with it
 * wrong. The word looked fine; it was simply stale.
 *
 * THE SCAN IS NARROW ON PURPOSE. The speller matches a phoneme as a literal
 * substring of the pronunciation, so a phoneme can only affect a word whose
 * pronunciation CONTAINS that phoneme's text. Every trigger therefore hands in
 * the phoneme strings that changed — both the old and the new value of an
 * edit, every phoneme of a created or deleted grapheme — and only the words
 * mentioning one of them are candidates (`getAutoSpelledLexiconMentioning`,
 * one `instr()` scan). The DP runs per candidate, not per word in the lexicon,
 * and the phoneme map it runs on is read once for the batch.
 *
 * A candidate is written only when its regenerated spelling DIFFERS from the
 * stored one, so an edit that changes nothing a word cares about (the phoneme
 * `context` note, say) touches no rows and bumps no `updated_at`.
 *
 * `needs_attention` is left alone either way. It is set by the things that
 * cannot be resolved automatically (a manual spelling that lost a grapheme, a
 * repair that found a dangling reference) and only the user clears it.
 *
 * @module db/respellService
 */

import { getDatabase } from './database';
import { withTransaction } from './utils/transaction';
import { getAutoSpelledLexiconMentioning, updateLexicon } from './lexiconService';
import { buildAutoSpellMappings, generateSpellingWithFallback } from './autoSpellService';
import { autoSpellToGlyphOrder, deserializeGlyphOrder, serializeGlyphOrder } from './utils/spellingUtils';

/** What a respell pass did. */
export interface RespellReport {
    /** Auto-spelled words whose pronunciation mentioned a changed phoneme. */
    scanned: number;
    /** Of those, the words whose spelling changed and was written. */
    respelled: number;
    /** Of those, the words the speller already agreed with. */
    unchanged: number;
    /** The `respelled` words by id. */
    respelledLexiconIds: number[];
}

export const EMPTY_RESPELL_REPORT: Readonly<RespellReport> = Object.freeze({
    scanned: 0,
    respelled: 0,
    unchanged: 0,
    respelledLexiconIds: Object.freeze([]) as unknown as number[],
});

/**
 * The phoneme strings of a set of phoneme rows, for handing to
 * `respellAutoSpelledWords`. Blanks are dropped; duplicates are harmless.
 */
export function phonemePatterns(phonemes: ReadonlyArray<{ phoneme: string }>): string[] {
    return phonemes.map(p => p.phoneme).filter(p => p.length > 0);
}

/**
 * Regenerate the spelling of every auto-spelled word whose pronunciation
 * mentions any of `patterns`, against the phonemes as they are NOW.
 *
 * Call it AFTER the phoneme change has been written — it reads the current
 * phoneme table. Runs in one transaction (a savepoint when the caller has one
 * open, so a grapheme delete and the respell it triggers commit together).
 *
 * @param patterns - Phoneme strings that changed: old AND new values.
 */
export function respellAutoSpelledWords(patterns: string[]): RespellReport {
    const candidates = getAutoSpelledLexiconMentioning(patterns);
    if (candidates.length === 0) return { ...EMPTY_RESPELL_REPORT, respelledLexiconIds: [] };

    return withTransaction(getDatabase(), () => {
        const mappings = buildAutoSpellMappings();
        const respelledLexiconIds: number[] = [];
        let unchanged = 0;

        for (const word of candidates) {
            // `pronunciation` is non-empty for every candidate (the query
            // guarantees it); the fallback speller therefore always succeeds.
            const result = generateSpellingWithFallback(word.pronunciation ?? '', mappings);
            if (!result.success) {
                unchanged++;
                continue;
            }
            const next = autoSpellToGlyphOrder(result.spelling);
            if (serializeGlyphOrder(next) === serializeGlyphOrder(deserializeGlyphOrder(word.glyph_order))) {
                unchanged++;
                continue;
            }
            updateLexicon(word.id, { glyph_order: next });
            respelledLexiconIds.push(word.id);
        }

        return {
            scanned: candidates.length,
            respelled: respelledLexiconIds.length,
            unchanged,
            respelledLexiconIds,
        };
    });
}
