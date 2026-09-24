// @vitest-environment happy-dom
/**
 * The grapheme form's "No sound" option (its word-symbol / mark kind: `graphemeForm/__tests__/noSoundKind`).
 *
 * The data model never required a grapheme to have a pronunciation (phonemes
 * are a separate, optional table — word-form logograms already relied on it),
 * but the Script Maker form did: every grapheme needed at least one filled
 * pronunciation row. The option lifts that for logograms. What this pins:
 *
 *  - `initialIsLogogram` reads "no sound" off a stored grapheme (edit), and a
 *    new grapheme starts phonetic;
 *  - the submit hook saves a logogram with NO phonemes even when the hidden
 *    pronunciation table still holds rows (create AND edit), and still saves
 *    the rows for a phonetic grapheme.
 *
 * Real database (sql.js) and the provider-wrapped api, so hook → api → row is
 * proven end to end.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { useEffect } from 'react';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { clearDatabase, initDatabase } from '../../../../db/database';
import { etymologApi } from '../../../../db/api';
import type { Glyph, GraphemeComplete } from '../../../../db/types';
import { EtymologProvider } from '../../../../db/context';
import { NotificationProvider } from '../../../shared/notifications/NotificationProvider';
import { initialIsLogogram, useGraphemeSubmit } from '../../../form/graphemeForm';

type Submit = (data: Record<string, unknown>) => Promise<{ success: boolean }>;
let submit: Submit | null = null;

function Harness(props: {
    mode: 'create' | 'edit';
    glyph: Glyph;
    isLogogram: boolean;
    initialData?: GraphemeComplete;
    onId?: (id: number) => void;
}) {
    const fn = useGraphemeSubmit({
        mode: props.mode,
        initialData: props.initialData,
        glyphs: [props.glyph],
        isLogogram: props.isLogogram,
        onSuccess: props.onId,
    });
    useEffect(() => {
        submit = fn;
    });
    return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function settle(times = 6) {
    for (let i = 0; i < times; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
}

async function mount(ui: React.ReactNode) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <EtymologProvider>
                <NotificationProvider>{ui}</NotificationProvider>
            </EtymologProvider>,
        );
    });
    await settle(10);
}

const FORM_WITH_A_ROW = {
    graphemeName: 'moon',
    category: 'logogram',
    pronunciations: [{ pronunciation: 'mun', useInAutoSpelling: true }],
};

beforeAll(async () => {
    await initDatabase();
});
beforeEach(() => {
    clearDatabase();
    submit = null;
});
afterEach(() => {
    try {
        act(() => root?.unmount());
    } catch {
        /* already unmounted */
    }
    container?.parentNode?.removeChild(container);
    container = null;
    root = null;
});

describe('initialIsLogogram', () => {
    const base = { id: 1, name: 'x', category: null, notes: null, folder_id: null, created_at: '', updated_at: '', glyphs: [] };

    it('a new grapheme starts phonetic', () => {
        expect(initialIsLogogram('create', null)).toBe(false);
    });

    it('a stored grapheme with no phonemes is a logogram; one with phonemes is not', () => {
        expect(initialIsLogogram('edit', { ...base, phonemes: [] })).toBe(true);
        expect(initialIsLogogram('edit', {
            ...base,
            phonemes: [{ id: 1, grapheme_id: 1, phoneme: 'a', use_in_auto_spelling: true, context: null }],
        })).toBe(false);
    });
});

describe('useGraphemeSubmit with isLogogram', () => {
    it('create: a logogram is saved with NO phonemes, whatever the hidden table holds', async () => {
        const glyph = etymologApi.glyph.create({ name: 'moon', svg_data: '<svg/>' }).data!;
        let createdId = -1;
        await mount(<Harness mode="create" glyph={glyph} isLogogram onId={(id) => { createdId = id; }} />);

        let result: { success: boolean } | undefined;
        await act(async () => { result = await submit!(FORM_WITH_A_ROW); });

        expect(result?.success).toBe(true);
        const saved = etymologApi.grapheme.getByIdComplete(createdId);
        expect(saved.data?.phonemes).toHaveLength(0);
        expect(saved.data?.category).toBe('logogram');
    });

    it('create: a phonetic grapheme still saves its rows', async () => {
        const glyph = etymologApi.glyph.create({ name: 'moon', svg_data: '<svg/>' }).data!;
        let createdId = -1;
        await mount(<Harness mode="create" glyph={glyph} isLogogram={false} onId={(id) => { createdId = id; }} />);

        await act(async () => { await submit!(FORM_WITH_A_ROW); });

        const saved = etymologApi.grapheme.getByIdComplete(createdId);
        expect(saved.data?.phonemes.map((p) => p.phoneme)).toEqual(['mun']);
    });

    it('edit: switching an existing grapheme to a logogram removes its pronunciations', async () => {
        const glyph = etymologApi.glyph.create({ name: 'moon', svg_data: '<svg/>' }).data!;
        const created = etymologApi.grapheme.create({
            name: 'moon',
            glyphs: [{ glyph_id: glyph.id, position: 0 }],
            phonemes: [{ phoneme: 'mun', use_in_auto_spelling: true }],
        }).data!;
        const initial = etymologApi.grapheme.getByIdComplete(created.id).data!;

        await mount(<Harness mode="edit" glyph={glyph} isLogogram initialData={initial} />);
        await act(async () => { await submit!(FORM_WITH_A_ROW); });

        const saved = etymologApi.grapheme.getByIdComplete(created.id);
        expect(saved.data?.phonemes).toHaveLength(0);
    });
});
