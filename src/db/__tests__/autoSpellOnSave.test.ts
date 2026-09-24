/**
 * Auto-spell owns the spelling on SAVE, too
 * -----------------------------------------
 * An auto-spelled word's spelling is DERIVED: whatever the speller makes of its
 * pronunciation against the graphemes that exist now. The respell pass has
 * always kept it that way when the SCRIPT changes; these tests pin the other
 * half — `lexicon.create` and `lexicon.update` derive it on save instead of
 * storing whatever glyph_order the caller sent. Before, a hand edit made while
 * auto-spell was on was stored, looked fine, and was silently respelled away by
 * the next grapheme change.
 *
 * Derivation goes through ONE function (`deriveAutoSpelledGlyphOrder`) shared
 * with the respell pass, so save and respell can never disagree.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

import { initDatabase, clearDatabase, createGraphemeEntry } from '../index';
import { lexiconApi } from '../api/lexiconApi';
import { glyphApi } from '../api/glyphApi';
import { graphemeApi } from '../api/graphemeApi';
import { deriveAutoSpelledGlyphOrder } from '../respellService';

function seedKa(): number {
    const glyph = glyphApi.create({ name: 'ka-mark', svg_data: '<svg/>' });
    const grapheme = graphemeApi.create({
        name: 'ka',
        glyphs: [{ glyph_id: glyph.data!.id, position: 0 }],
        phonemes: [{ phoneme: 'ka', use_in_auto_spelling: true }],
    });
    return grapheme.data!.id;
}

describe('auto-spell on save', () => {
    beforeAll(async () => {
        await initDatabase();
    });
    beforeEach(() => {
        clearDatabase();
    });

    it('derive: pronunciation → storage-form spelling; nothing to derive from → null', () => {
        const ka = seedKa();
        expect(deriveAutoSpelledGlyphOrder('kato')).toEqual([createGraphemeEntry(ka), 't', 'o']);
        expect(deriveAutoSpelledGlyphOrder('  ')).toBeNull();
        expect(deriveAutoSpelledGlyphOrder(null)).toBeNull();
    });

    it('create: an auto-spelled word stores the DERIVED spelling, not the one sent', () => {
        const ka = seedKa();
        const created = lexiconApi.create({
            pronunciation: 'kato',
            auto_spell: true,
            glyph_order: ['x', 'y'],
        });
        expect(created.data!.glyph_order).toBe(JSON.stringify([createGraphemeEntry(ka), 't', 'o']));
    });

    it('create: auto-spell defaults to on, so an unspecified word is derived too', () => {
        const ka = seedKa();
        const created = lexiconApi.create({ pronunciation: 'ka' });
        expect(created.data!.glyph_order).toBe(JSON.stringify([createGraphemeEntry(ka)]));
    });

    it('create: a manual word keeps exactly what was sent', () => {
        seedKa();
        const created = lexiconApi.create({ pronunciation: 'kato', auto_spell: false, glyph_order: ['x', 'y'] });
        expect(created.data!.glyph_order).toBe(JSON.stringify(['x', 'y']));
    });

    it('create: auto-spell with NO pronunciation keeps the sent spelling (nothing to derive)', () => {
        const created = lexiconApi.create({ meanings: [{ meaning: 'thing' }], auto_spell: true, glyph_order: ['x'] });
        expect(created.data!.glyph_order).toBe(JSON.stringify(['x']));
    });

    it('update: a still-auto-spelled word is re-derived from its NEW pronunciation', () => {
        const ka = seedKa();
        const created = lexiconApi.create({ pronunciation: 'ka', auto_spell: true });
        const updated = lexiconApi.update(created.data!.id, { pronunciation: 'kaka', glyph_order: ['junk'] });
        expect(updated.data!.glyph_order).toBe(JSON.stringify([createGraphemeEntry(ka), createGraphemeEntry(ka)]));
    });

    it('update: an omitted auto_spell keeps the stored one (still derived)', () => {
        const ka = seedKa();
        const created = lexiconApi.create({ pronunciation: 'ka', auto_spell: true });
        const updated = lexiconApi.update(created.data!.id, { glyph_order: ['junk'] });
        expect(updated.data!.glyph_order).toBe(JSON.stringify([createGraphemeEntry(ka)]));
    });

    it('update: turning auto-spell OFF keeps the hand spelling sent with it', () => {
        seedKa();
        const created = lexiconApi.create({ pronunciation: 'ka', auto_spell: true });
        const updated = lexiconApi.update(created.data!.id, { auto_spell: false, glyph_order: ['hand'] });
        expect(updated.data!.glyph_order).toBe(JSON.stringify(['hand']));
        expect(updated.data!.auto_spell).toBe(false);
    });

    it('update: turning auto-spell ON derives it right away', () => {
        const ka = seedKa();
        const created = lexiconApi.create({ pronunciation: 'ka', auto_spell: false, glyph_order: ['hand'] });
        const updated = lexiconApi.update(created.data!.id, { auto_spell: true });
        expect(updated.data!.glyph_order).toBe(JSON.stringify([createGraphemeEntry(ka)]));
    });
});
