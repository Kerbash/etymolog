// @vitest-environment happy-dom
/**
 * Deleting a grapheme that words are spelled with — the app's only two-stage
 * confirmation, and the only destructive action that REWRITES other records.
 *
 * The service has always refused this delete with `CONSTRAINT_VIOLATION` unless
 * `respellLexicon` is passed. Neither call site handled that: the gallery card
 * and the edit page each asked ONE question whose message described behaviour
 * the service does not have, then surfaced the refusal as a raw error the user
 * could do nothing about. The words that made it fail were never named.
 *
 * The database here is REAL, so the last assertion is the one that matters:
 * after confirming, the word is actually respelled — the flow is not just
 * passing the right flag, it is producing the right outcome.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { Route, Routes } from 'react-router-dom';

import { clearDatabase, initDatabase } from '../../../../db/database';
import { glyphApi } from '../../../../db/api/glyphApi';
import { graphemeApi } from '../../../../db/api/graphemeApi';
import { lexiconApi } from '../../../../db/api/lexiconApi';
import { createGraphemeEntry } from '../../../../db/utils/spellingUtils';
import GraphemeEditPage from '../editGrapheme/GraphemeEditPage';
import { confirmAction, findButton, mountHarness, settle, type Harness } from './testHarness';

let harness: Harness | null = null;

beforeAll(async () => {
    await initDatabase();
});

beforeEach(() => {
    clearDatabase();
});

afterEach(() => {
    harness?.unmount();
    harness = null;
});

/** A grapheme "ka" (phoneme /ka/) used by one auto-spelled word. */
function seedGraphemeUsedByAWord() {
    const glyph = glyphApi.create({ name: 'ka-mark', svg_data: '<svg/>' });
    const grapheme = graphemeApi.create({
        name: 'ka',
        glyphs: [{ glyph_id: glyph.data!.id, position: 0 }],
        phonemes: [{ phoneme: 'ka', use_in_auto_spelling: true }],
    });
    const word = lexiconApi.create({
        lemma: 'kato',
        pronunciation: 'kato',
        auto_spell: true,
        glyph_order: [createGraphemeEntry(grapheme.data!.id), 'to'],
    });
    expect(word.success).toBe(true);
    return { graphemeId: grapheme.data!.id, wordId: word.data!.id };
}

async function mountEditPage(graphemeId: number) {
    return mountHarness(
        <Routes>
            <Route path="/script-maker/grapheme/db/:id" element={<GraphemeEditPage />} />
            <Route path="/script-maker" element={<p>grapheme gallery</p>} />
        </Routes>,
        `/script-maker/grapheme/db/${graphemeId}`,
    );
}

/** All text currently on screen, including the portaled dialog. */
const screenText = () => document.body.textContent ?? '';

describe('grapheme delete — when words use it', () => {
    it('refuses the first delete and asks a SECOND question that names the word', async () => {
        const { graphemeId } = seedGraphemeUsedByAWord();
        harness = await mountEditPage(graphemeId);

        await act(async () => findButton('Delete grapheme', harness!.container)!.click());
        await settle();

        // Stage one: the ordinary danger confirmation.
        expect(screenText()).toContain('Delete grapheme "ka"?');
        await act(async () => confirmAction('confirm')!.click());
        await settle();

        // Stage two: the service refused, so the user is told WHY and by what.
        expect(screenText()).toContain('is used in 1 word');
        expect(screenText()).toContain('kato');
        expect(screenText()).toContain('respelled');
        expect(screenText()).toContain('flagged for review');

        // Nothing has been deleted while the question is on screen.
        expect(graphemeApi.getById(graphemeId).success).toBe(true);
    });

    it('deletes nothing when the respell question is declined', async () => {
        const { graphemeId, wordId } = seedGraphemeUsedByAWord();
        harness = await mountEditPage(graphemeId);

        await act(async () => findButton('Delete grapheme', harness!.container)!.click());
        await settle();
        await act(async () => confirmAction('confirm')!.click());
        await settle();
        await act(async () => confirmAction('cancel')!.click());
        await settle();

        expect(graphemeApi.getById(graphemeId).success).toBe(true);
        // The spelling still REFERENCES the grapheme (`grapheme-<id>`), not
        // the phoneme it would be respelled to.
        const word = lexiconApi.getByIdComplete(wordId);
        expect(word.data!.glyph_order).toBe(JSON.stringify([`grapheme-${graphemeId}`, 'to']));
    });

    it('respells the word and deletes the grapheme once confirmed', async () => {
        const { graphemeId, wordId } = seedGraphemeUsedByAWord();
        harness = await mountEditPage(graphemeId);

        await act(async () => findButton('Delete grapheme', harness!.container)!.click());
        await settle();
        await act(async () => confirmAction('confirm')!.click());
        await settle();
        await act(async () => confirmAction('confirm')!.click());
        await settle();

        expect(graphemeApi.getById(graphemeId).success).toBe(false);

        // The auto-spelled word keeps its place in the spelling, written with
        // the grapheme's phoneme instead of a reference to a row that is gone.
        const word = lexiconApi.getByIdComplete(wordId);
        expect(word.success).toBe(true);
        expect(word.data!.glyph_order).toBe(JSON.stringify(['ka', 'to']));
        expect(word.data!.needs_attention).toBe(false);

        // …and the page leaves for the gallery rather than sitting on a record
        // that no longer exists.
        expect(harness.text()).toContain('grapheme gallery');
    });

    it('deletes an UNUSED grapheme after a single question', async () => {
        const glyph = glyphApi.create({ name: 'solo', svg_data: '<svg/>' });
        const grapheme = graphemeApi.create({
            name: 'zu',
            glyphs: [{ glyph_id: glyph.data!.id, position: 0 }],
            phonemes: [{ phoneme: 'zu' }],
        });
        harness = await mountEditPage(grapheme.data!.id);

        await act(async () => findButton('Delete grapheme', harness!.container)!.click());
        await settle();
        await act(async () => confirmAction('confirm')!.click());
        await settle();

        expect(graphemeApi.getById(grapheme.data!.id).success).toBe(false);
        // No second dialog — there was nothing to respell.
        expect(confirmAction('confirm')).toBeNull();
    });
});
