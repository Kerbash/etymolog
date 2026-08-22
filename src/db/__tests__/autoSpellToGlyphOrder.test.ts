/**
 * `autoSpellToGlyphOrder` — the bridge from an auto-spell result to storage.
 *
 * Node environment (the file's default): this is a pure function over plain
 * objects and needs neither a DOM nor a database.
 *
 * What is pinned here is everything that produced a WRONG WORD when the
 * conversion was done inline at a call site: the order has to come from
 * `position` rather than from the array, and an entry that cannot be
 * represented in `glyph_order` has to be dropped rather than stringified —
 * `"grapheme--3"` parses back as an IPA character and renders as that literal
 * text inside the user's word.
 */

import { describe, it, expect } from 'vitest';

import {
    autoSpellToGlyphOrder,
    deserializeGlyphOrder,
    extractGraphemeIds,
    fromGlyphOrder,
    isGraphemeEntry,
    parseGlyphOrder,
    serializeGlyphOrder,
    validateGlyphOrder,
} from '../utils/spellingUtils';
import type { AutoSpellEntry } from '../types';

const real = (id: number, position: number): AutoSpellEntry => ({
    grapheme_id: id,
    position,
    isVirtual: false,
});

const virtual = (ipa: string, position: number, id = -position - 1): AutoSpellEntry => ({
    grapheme_id: id,
    position,
    isVirtual: true,
    ipaCharacter: ipa,
});

describe('autoSpellToGlyphOrder', () => {
    it('turns a real grapheme into a "grapheme-<id>" reference', () => {
        expect(autoSpellToGlyphOrder([real(7, 0)])).toEqual(['grapheme-7']);
    });

    it('turns a virtual entry into its bare IPA character', () => {
        expect(autoSpellToGlyphOrder([virtual('ə', 0)])).toEqual(['ə']);
    });

    it('keeps a mixed spelling in word order', () => {
        const entries = [real(1, 0), virtual('ʃ', 1), real(2, 2)];
        expect(autoSpellToGlyphOrder(entries)).toEqual(['grapheme-1', 'ʃ', 'grapheme-2']);
    });

    it('orders by position, not by array order', () => {
        // The auto-spell walk emits in whatever order the DP resolved; the
        // field that means "where in the word" is `position`.
        const entries = [real(3, 2), real(1, 0), real(2, 1)];
        expect(autoSpellToGlyphOrder(entries)).toEqual([
            'grapheme-1',
            'grapheme-2',
            'grapheme-3',
        ]);
    });

    it('does not mutate the array it was given', () => {
        const entries = [real(3, 2), real(1, 0)];
        const snapshot = entries.map((entry) => entry.position);
        autoSpellToGlyphOrder(entries);
        expect(entries.map((entry) => entry.position)).toEqual(snapshot);
    });

    it('returns an empty array for an empty spelling', () => {
        expect(autoSpellToGlyphOrder([])).toEqual([]);
    });

    it('drops a virtual entry that carries no IPA character', () => {
        // It cannot be represented at all — and writing its negative id would
        // put the text "grapheme--3" into the word.
        const orphan: AutoSpellEntry = { grapheme_id: -3, position: 0, isVirtual: true };
        expect(autoSpellToGlyphOrder([orphan, real(5, 1)])).toEqual(['grapheme-5']);
    });

    it('drops a virtual entry whose IPA character is the empty string', () => {
        const empty: AutoSpellEntry = {
            grapheme_id: -1,
            position: 0,
            isVirtual: true,
            ipaCharacter: '',
        };
        expect(autoSpellToGlyphOrder([empty])).toEqual([]);
    });

    it('drops a real entry with a non-positive grapheme id', () => {
        // `isGraphemeEntry('grapheme-0')` is false, so it would round-trip as
        // an IPA character rather than as a reference.
        expect(isGraphemeEntry('grapheme-0')).toBe(false);
        expect(autoSpellToGlyphOrder([real(0, 0), real(-4, 1), real(9, 2)])).toEqual([
            'grapheme-9',
        ]);
    });

    it('keeps a multi-character IPA fallback intact', () => {
        expect(autoSpellToGlyphOrder([virtual('t͡ʃ', 0), virtual('aː', 1)])).toEqual([
            't͡ʃ',
            'aː',
        ]);
    });

    it('produces entries the parser reads back as the same two kinds', () => {
        const glyphOrder = autoSpellToGlyphOrder([real(12, 0), virtual('ø', 1)]);
        expect(parseGlyphOrder(glyphOrder)).toEqual([
            { type: 'grapheme', rawValue: 'grapheme-12', graphemeId: 12 },
            { type: 'ipa', rawValue: 'ø', ipaCharacter: 'ø' },
        ]);
    });

    it('tolerates a non-array (a failed auto-spell result read straight through)', () => {
        expect(autoSpellToGlyphOrder(undefined as unknown as AutoSpellEntry[])).toEqual([]);
    });
});

/**
 * A virtual glyph now stands for a whole SOUND, so a `glyph_order` entry can be
 * several code points long (`t͡s`, `aː`, `pʰ`). Nothing in the storage format
 * has a per-entry length assumption — this suite is what keeps it that way.
 */
describe('multi-code-point virtual entries in glyph_order', () => {
    const SOUNDS = ['t͡s', 'aː', 'pʰ', 'ã', 'ˈ'];

    it('round-trips through serialize/deserialize unchanged', () => {
        const glyphOrder = autoSpellToGlyphOrder([
            virtual('t͡s', 0),
            real(4, 1),
            virtual('aː', 2),
            virtual('pʰ', 3),
        ]);
        expect(glyphOrder).toEqual(['t͡s', 'grapheme-4', 'aː', 'pʰ']);

        const json = serializeGlyphOrder(glyphOrder);
        expect(deserializeGlyphOrder(json)).toEqual(glyphOrder);
        // Each entry is still ONE entry, however many code points it holds.
        expect(deserializeGlyphOrder(json)).toHaveLength(4);
    });

    it('validates clean — a long IPA entry is not a malformed grapheme reference', () => {
        for (const sound of SOUNDS) {
            expect(validateGlyphOrder([sound, 'grapheme-1'])).toEqual([]);
        }
        // The one thing that still must not validate.
        expect(validateGlyphOrder(['grapheme-0'])).toEqual([
            'Entry at position 0 has invalid grapheme reference: grapheme-0',
        ]);
    });

    it('parses back as one ipa entry per sound, with the sound intact', () => {
        expect(parseGlyphOrder(SOUNDS)).toEqual(
            SOUNDS.map((sound) => ({ type: 'ipa', rawValue: sound, ipaCharacter: sound }))
        );
    });

    it('counts one IPA fallback per sound, not one per code point', () => {
        expect(extractGraphemeIds(['t͡s', 'grapheme-2', 'aː'])).toEqual({
            graphemeIds: [2],
            hasIpaFallbacks: true,
            ipaFallbackCount: 2,
        });
    });

    it('comes back out of glyph_order as the same strings for the UI', () => {
        expect(fromGlyphOrder(['grapheme-3', 't͡s', 'aː'])).toEqual([3, 't͡s', 'aː']);
    });
});
