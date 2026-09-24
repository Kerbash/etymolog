// @vitest-environment happy-dom
/**
 * Grapheme FORMS in the Script Maker (block-script Phase 2).
 *
 * End to end against the REAL database (sql.js) and the provider-wrapped api,
 * so draft → submit hook → api → row is proven, not mocked:
 *
 *  - create with two other forms → the variant rows, groups and glyphs;
 *  - edit: rename, regroup (including two forms SWAPPING groups — the
 *    one-form-per-group index must never trip mid-save), remove, add;
 *  - "Make default" is persisted as a `setDefault` (asserted on `is_default`),
 *    on edit and on create;
 *  - a glyph MOVED between forms survives with `autoManageGlyphs` on;
 *  - an empty form blocks the submit with a message and writes nothing;
 *  - removing a form asks only when words pin it, and cancelling saves nothing;
 *  - the edit page: the forms render as cards, the default section cannot lose
 *    its last glyph, Make default / Add a form work through the real UI;
 *  - the detailed display lists the forms, the compact card counts them;
 *  - `VariantGroupsDialog` add / rename / delete round-trip through the api.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';

import { clearDatabase, initDatabase } from '../../../../db/database';
import { etymologApi } from '../../../../db/api';
import type { Glyph, GraphemeComplete } from '../../../../db/types';
import { createLexicon, getLexiconById } from '../../../../db/lexiconService';
import { createGraphemeEntry, deserializeGlyphOrder } from '../../../../db/utils/spellingUtils';
import {
    initialDefaultForm,
    initialVariantDrafts,
    makeDraftDefault,
    useGraphemeSubmit,
    type DefaultFormDraft,
    type VariantDraft,
} from '../../../form/graphemeForm';
import DetailedGraphemeDisplay from '../../../display/grapheme/detailed/detailed';
import CompactGraphemeDisplay from '../../../display/grapheme/compact/compact';
import GraphemeEditPage from '../editGrapheme/GraphemeEditPage';
import { VariantGroupsDialog } from '../variantGroups';
import { confirmAction, findButton, mountHarness, settle, type Harness } from './testHarness';

type Submit = (data: Record<string, unknown>) => Promise<{ success: boolean; message?: string }>;
let submit: Submit | null = null;
let harness: Harness | null = null;

interface HookProps {
    mode: 'create' | 'edit';
    glyphs: Glyph[];
    variants: VariantDraft[];
    defaultForm?: DefaultFormDraft;
    initialData?: GraphemeComplete;
    onId?: (id: number) => void;
}

function SubmitHarness(props: HookProps) {
    const fn = useGraphemeSubmit({
        mode: props.mode,
        initialData: props.initialData,
        glyphs: props.glyphs,
        variants: props.variants,
        defaultForm: props.defaultForm,
        onSuccess: props.onId,
    });
    useEffect(() => {
        submit = fn;
    });
    return null;
}

const FORM = { graphemeName: 'ka', pronunciations: [{ pronunciation: 'ka', useInAutoSpelling: true }] };

function glyph(name: string): Glyph {
    return etymologApi.glyph.create({ name, svg_data: `<svg data-n="${name}"/>` }).data!;
}

function group(name: string): number {
    return etymologApi.variantGroup.create({ name }).data!.id;
}

function draft(key: string, name: string, groupId: number | null, glyphs: Glyph[], id: number | null = null): VariantDraft {
    return { key, id, name, groupId, glyphs };
}

function complete(id: number): GraphemeComplete {
    return etymologApi.grapheme.getByIdComplete(id).data!;
}

/** variant rows of a grapheme: [name, group_id, is_default, glyph names]. */
function rows(graphemeId: number) {
    return (complete(graphemeId).variants ?? []).map((v) => [v.name, v.group_id, v.is_default, v.glyphs.map((g) => g.name)]);
}

/** The element (anywhere in the document) whose aria-label is exactly `label`. */
function byLabel<T extends HTMLElement = HTMLButtonElement>(label: string): T {
    const found = Array.from(document.body.querySelectorAll<T>('[aria-label]')).find(
        (el) => el.getAttribute('aria-label') === label,
    );
    if (!found) throw new Error(`nothing labelled ${label}`);
    return found;
}

async function run(data: Record<string, unknown> = FORM) {
    let result: { success: boolean; message?: string } | undefined;
    await act(async () => {
        result = await submit!(data);
    });
    await settle();
    return result!;
}

/** A stored grapheme "ka": default [a], forms "head" (group H) [b] and "side" (group S) [c]. */
function seedStored() {
    const [a, b, c] = [glyph('a'), glyph('b'), glyph('c')];
    const H = group('head');
    const S = group('side');
    const created = etymologApi.grapheme.create({
        name: 'ka',
        glyphs: [{ glyph_id: a.id, position: 0 }],
        phonemes: [{ phoneme: 'ka', use_in_auto_spelling: true }],
        variants: [
            { name: 'head', group_id: H, glyphs: [{ glyph_id: b.id, position: 0 }] },
            { name: 'side', group_id: S, glyphs: [{ glyph_id: c.id, position: 0 }] },
        ],
    }).data!;
    return { id: created.id, a, b, c, H, S };
}

async function mountEdit(initial: GraphemeComplete, glyphs: Glyph[], variants: VariantDraft[], defaultForm?: DefaultFormDraft) {
    harness = await mountHarness(
        <SubmitHarness mode="edit" initialData={initial} glyphs={glyphs} variants={variants} defaultForm={defaultForm} />,
    );
}

beforeAll(async () => {
    await initDatabase();
});
beforeEach(() => {
    clearDatabase();
    submit = null;
});
afterEach(() => {
    etymologApi.settings.update({ autoManageGlyphs: false });
    harness?.unmount();
    harness = null;
});

describe('create with forms', () => {
    it('writes each form as a variant row with its group and glyphs', async () => {
        const [a, b, c] = [glyph('a'), glyph('b'), glyph('c')];
        const H = group('head');
        let id = -1;
        harness = await mountHarness(
            <SubmitHarness
                mode="create"
                glyphs={[a]}
                variants={[draft('k1', 'head', H, [b, a]), draft('k2', 'plain', null, [c])]}
                onId={(n) => { id = n; }}
            />,
        );
        const result = await run();
        expect(result.success).toBe(true);
        expect(rows(id)).toEqual([
            ['Default', null, true, ['a']],
            ['head', H, false, ['b', 'a']],
            ['plain', null, false, ['c']],
        ]);
        // GraphemeComplete.glyphs keeps meaning the DEFAULT form (P3).
        expect(complete(id).glyphs.map((g) => g.name)).toEqual(['a']);
    });

    it('an empty form blocks the submit with a message naming it, and writes nothing', async () => {
        const a = glyph('a');
        harness = await mountHarness(
            <SubmitHarness mode="create" glyphs={[a]} variants={[draft('k1', 'head', null, [])]} />,
        );
        const result = await run();
        expect(result.success).toBe(false);
        expect(result.message).toContain('"head" has no glyphs');
        expect(etymologApi.grapheme.getAll().data?.graphemes ?? []).toHaveLength(0);
    });

    it('two forms in the same group are refused before any write', async () => {
        const [a, b, c] = [glyph('a'), glyph('b'), glyph('c')];
        const H = group('head');
        harness = await mountHarness(
            <SubmitHarness
                mode="create"
                glyphs={[a]}
                variants={[draft('k1', 'one', H, [b]), draft('k2', 'two', H, [c])]}
            />,
        );
        const result = await run();
        expect(result.success).toBe(false);
        expect(result.message).toContain('Only one form can be in the group "head"');
        expect(etymologApi.grapheme.getAll().data?.graphemes ?? []).toHaveLength(0);
    });

    it('make default before the first save: the named form is the default row', async () => {
        const [a, b] = [glyph('a'), glyph('b')];
        const H = group('head');
        const swapped = makeDraftDefault(
            { defaultGlyphs: [a], defaultForm: initialDefaultForm('create'), variants: [draft('k1', 'head', H, [b])] },
            'k1',
        );
        let id = -1;
        harness = await mountHarness(
            <SubmitHarness
                mode="create"
                glyphs={swapped.defaultGlyphs}
                variants={swapped.variants}
                defaultForm={swapped.defaultForm}
                onId={(n) => { id = n; }}
            />,
        );
        expect((await run()).success).toBe(true);
        expect(rows(id)).toEqual([
            ['head', H, true, ['b']],
            ['Default', null, false, ['a']],
        ]);
    });
});

describe('edit forms', () => {
    it('renames, regroups, removes and adds in one save', async () => {
        const { id, a, b, S } = seedStored();
        const d = glyph('d');
        const initial = complete(id);
        const [head] = initialVariantDrafts('edit', initial);
        await mountEdit(initial, [a], [
            // "head" renamed and moved to S; "side" removed (frees S); a new form added.
            { ...head, name: 'tall', groupId: S },
            draft('new', 'extra', null, [d]),
        ]);
        expect((await run()).success).toBe(true);
        expect(rows(id)).toEqual([
            ['Default', null, true, ['a']],
            ['tall', S, false, ['b']],
            ['extra', null, false, ['d']],
        ]);
        // The renamed form is the SAME row (updated, not recreated).
        expect(complete(id).variants![1].id).toBe(head.id);
        expect(complete(id).variants![1].glyphs[0].id).toBe(b.id);
    });

    it('two forms can SWAP groups (the one-per-group index never trips mid-save)', async () => {
        const { id, a, H, S } = seedStored();
        const initial = complete(id);
        const [head, side] = initialVariantDrafts('edit', initial);
        await mountEdit(initial, [a], [
            { ...head, groupId: S },
            { ...side, groupId: H },
        ]);
        expect((await run()).success).toBe(true);
        expect(rows(id).map(([name, groupId]) => [name, groupId])).toEqual([
            ['Default', null],
            ['head', S],
            ['side', H],
        ]);
    });

    it('make default swaps is_default in the DB and keeps every form\'s glyphs', async () => {
        const { id, a, H } = seedStored();
        const initial = complete(id);
        const before = initialVariantDrafts('edit', initial);
        const headId = before[0].id!;
        const swapped = makeDraftDefault(
            { defaultGlyphs: [a], defaultForm: initialDefaultForm('edit', initial), variants: before },
            before[0].key,
        );
        await mountEdit(initial, swapped.defaultGlyphs, swapped.variants, swapped.defaultForm);
        expect((await run()).success).toBe(true);

        const variants = complete(id).variants!;
        const byId = new Map(variants.map((v) => [v.id, v]));
        expect(byId.get(headId)!.is_default).toBe(true);
        expect(variants.filter((v) => v.is_default)).toHaveLength(1);
        expect(complete(id).glyphs.map((g) => g.name)).toEqual(['b']);
        expect(rows(id)).toEqual([
            ['head', H, true, ['b']],
            ['Default', null, false, ['a']],
            ['side', expect.any(Number), false, ['c']],
        ]);
    });

    it('make default then remove the old default in the same save', async () => {
        const { id, a } = seedStored();
        const initial = complete(id);
        const swapped = makeDraftDefault(
            { defaultGlyphs: [a], defaultForm: initialDefaultForm('edit', initial), variants: initialVariantDrafts('edit', initial) },
            initialVariantDrafts('edit', initial)[0].key,
        );
        // The card now holding the old default is dropped.
        await mountEdit(initial, swapped.defaultGlyphs, swapped.variants.slice(1), swapped.defaultForm);
        expect((await run()).success).toBe(true);
        expect(rows(id).map(([name, , isDefault]) => [name, isDefault])).toEqual([
            ['head', true],
            ['side', false],
        ]);
    });

    it('a glyph MOVED from one form to another survives with autoManageGlyphs on', async () => {
        etymologApi.settings.update({ autoManageGlyphs: true });
        const { id, a, b, c } = seedStored();
        const initial = complete(id);
        const [head, side] = initialVariantDrafts('edit', initial);
        // b leaves "head" (which takes a instead) and joins "side".
        await mountEdit(initial, [a], [
            { ...head, glyphs: [a] },
            { ...side, glyphs: [c, b] },
        ]);
        expect((await run()).success).toBe(true);
        expect(rows(id).map(([name, , , glyphs]) => [name, glyphs])).toEqual([
            ['Default', ['a']],
            ['head', ['a']],
            ['side', ['c', 'b']],
        ]);
        expect(etymologApi.glyph.getById(b.id).success).toBe(true);
    });

    it('an empty form blocks the edit submit and nothing is written', async () => {
        const { id, a } = seedStored();
        const initial = complete(id);
        const [head, side] = initialVariantDrafts('edit', initial);
        await mountEdit(initial, [a], [{ ...head, name: 'renamed' }, { ...side, glyphs: [] }]);
        const result = await run();
        expect(result.success).toBe(false);
        expect(result.message).toContain('"side" has no glyphs');
        expect(rows(id)[1][0]).toBe('head');
    });
});

describe('removing a pinned form', () => {
    function pinWord(graphemeId: number, variantId: number) {
        return createLexicon({
            lemma: 'pinned',
            auto_spell: false,
            glyph_order: [createGraphemeEntry(graphemeId, variantId)],
        });
    }

    it('does NOT ask when no word pins the form', async () => {
        const { id, a } = seedStored();
        const initial = complete(id);
        await mountEdit(initial, [a], initialVariantDrafts('edit', initial).slice(1));
        expect((await run()).success).toBe(true);
        expect(confirmAction('confirm')).toBeNull();
        expect(rows(id).map(([name]) => name)).toEqual(['Default', 'side']);
    });

    it('asks when words pin it; cancelling saves nothing, confirming deletes and strips the pin', async () => {
        const { id, a } = seedStored();
        const initial = complete(id);
        const headId = initial.variants!.find((v) => v.name === 'head')!.id;
        const word = pinWord(id, headId);
        await mountEdit(initial, [a], initialVariantDrafts('edit', initial).slice(1));

        // Cancel.
        let pending: Promise<{ success: boolean; message?: string }> | undefined;
        await act(async () => {
            pending = submit!(FORM);
        });
        await settle();
        expect(document.body.textContent).toContain('1 word pins this form; it will fall back to the default.');
        await act(async () => {
            confirmAction('cancel')!.click();
        });
        const cancelled = await pending!;
        expect(cancelled.success).toBe(false);
        expect(rows(id).map(([name]) => name)).toEqual(['Default', 'head', 'side']);

        // Confirm.
        await act(async () => {
            pending = submit!(FORM);
        });
        await settle();
        await act(async () => {
            confirmAction('confirm')!.click();
        });
        expect((await pending!).success).toBe(true);
        await settle();
        expect(rows(id).map(([name]) => name)).toEqual(['Default', 'side']);
        expect(deserializeGlyphOrder(getLexiconById(word.id)!.glyph_order)).toEqual([createGraphemeEntry(id)]);
    });
});

describe('the edit page', () => {
    async function mountEditPage(graphemeId: number) {
        harness = await mountHarness(
            <Routes>
                <Route path="/script-maker/grapheme/db/:id" element={<GraphemeEditPage />} />
                <Route path="/script-maker" element={<p>grapheme gallery</p>} />
            </Routes>,
            `/script-maker/grapheme/db/${graphemeId}`,
        );
        await settle(4);
    }

    it('titles the glyph section as the default form and renders a card per stored form', async () => {
        const { id } = seedStored();
        await mountEditPage(id);
        const text = harness!.text();
        expect(text).toContain('Glyphs (default form)');
        expect(text).toContain('Other forms');
        const names = Array.from(harness!.container.querySelectorAll<HTMLInputElement>('li input[id$="-name"]')).map((i) => i.value);
        expect(names).toEqual(['head', 'side']);
    });

    it('the default section cannot remove its last glyph', async () => {
        const { id } = seedStored();
        await mountEditPage(id);
        const remove = harness!.container.querySelector<HTMLButtonElement>(
            'button[aria-label="Remove glyph a from this grapheme"]',
        );
        expect(remove).not.toBeNull();
        expect(remove!.disabled).toBe(true);
    });

    it('Make default in the UI swaps the two glyph lists, and saving persists it', async () => {
        const { id } = seedStored();
        await mountEditPage(id);
        await act(async () => {
            byLabel('Make the form "head" the default').click();
        });
        await settle();
        // The default section now shows b; the first card holds the old default (a).
        expect(harness!.container.querySelector('button[aria-label="Remove glyph b from this grapheme"]')).not.toBeNull();
        const names = Array.from(harness!.container.querySelectorAll<HTMLInputElement>('li input[id$="-name"]')).map((i) => i.value);
        expect(names).toEqual(['Default', 'side']);
        expect(harness!.text()).toContain('Default form: head');

        await act(async () => {
            findButton('Save changes', harness!.container)!.click();
        });
        await settle(8);
        const stored = complete(id);
        expect(stored.variants!.find((v) => v.is_default)!.name).toBe('head');
        expect(stored.glyphs.map((g) => g.name)).toEqual(['b']);
    });

    it('adding a form in the UI and saving creates it', async () => {
        const { id } = seedStored();
        await mountEditPage(id);
        await act(async () => {
            findButton('Add a form', harness!.container)!.click();
        });
        await settle();
        const names = Array.from(harness!.container.querySelectorAll<HTMLInputElement>('li input[id$="-name"]')).map((i) => i.value);
        expect(names).toEqual(['head', 'side', 'Form 4']);
        // A new form with no glyph refuses to save and says why.
        await act(async () => {
            findButton('Save changes', harness!.container)!.click();
        });
        await settle(6);
        expect(document.body.textContent).toContain('"Form 4" has no glyphs');
        expect(rows(id)).toHaveLength(3);
    });
});

describe('displays', () => {
    it('the detailed display lists every other form with name · group', async () => {
        const { id } = seedStored();
        const plain = etymologApi.variant.create(id, { name: 'loose', glyphs: [{ glyph_id: glyph('z').id, position: 0 }] });
        expect(plain.success).toBe(true);
        harness = await mountHarness(<DetailedGraphemeDisplay graphemeData={complete(id)} />);
        const list = harness.container.querySelector('ul[aria-label="Other forms of ka"]');
        expect(list).not.toBeNull();
        const captions = Array.from(list!.querySelectorAll('li')).map((li) => li.textContent);
        expect(captions).toEqual(['head · head', 'side · side', 'loose · no group']);
    });

    it('the detailed display shows no Forms row for a single-form grapheme (or absent variants)', async () => {
        const a = glyph('a');
        const created = etymologApi.grapheme.create({ name: 'solo', glyphs: [{ glyph_id: a.id, position: 0 }] }).data!;
        const { variants: _drop, ...literal } = complete(created.id);
        harness = await mountHarness(
            <>
                <DetailedGraphemeDisplay graphemeData={complete(created.id)} />
                <DetailedGraphemeDisplay graphemeData={literal} />
            </>,
        );
        expect(harness.text()).not.toContain('Forms');
    });

    it('the compact card badges "+N forms" only when there are other forms', async () => {
        const { id } = seedStored();
        const a = glyph('solo-mark');
        const solo = etymologApi.grapheme.create({ name: 'solo', glyphs: [{ glyph_id: a.id, position: 0 }] }).data!;
        harness = await mountHarness(
            <>
                <div data-testid="multi"><CompactGraphemeDisplay graphemeData={complete(id)} /></div>
                <div data-testid="solo"><CompactGraphemeDisplay graphemeData={complete(solo.id)} /></div>
            </>,
        );
        expect(harness.container.querySelector('[data-testid="multi"]')!.textContent).toContain('+2 forms');
        expect(harness.container.querySelector('[data-testid="solo"]')!.textContent).not.toContain('form');
    });
});

describe('VariantGroupsDialog', () => {
    const groupNames = () => (etymologApi.variantGroup.getAll().data?.groups ?? []).map((g) => g.name);

    function setInput(input: HTMLInputElement, value: string) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    it('adds, renames and deletes groups through the api', async () => {
        const { id } = seedStored(); // groups "head" (used by one form) and "side"
        harness = await mountHarness(<VariantGroupsDialog open onClose={() => {}} />);
        await settle();

        // Add.
        const addInput = document.body.querySelector<HTMLInputElement>('input[aria-label="New group name"]')!;
        await act(async () => setInput(addInput, 'narrow'));
        await act(async () => findButton('Add group')!.click());
        await settle();
        expect(groupNames()).toEqual(['head', 'side', 'narrow']);
        expect(document.body.textContent).toContain('narrow');

        // Rename (inline).
        await act(async () => {
            byLabel('Rename the group "narrow"').click();
        });
        const renameInput = byLabel<HTMLInputElement>('New name for the group "narrow"');
        await act(async () => setInput(renameInput, 'thin'));
        await act(async () => {
            byLabel('Save the name of "narrow"').click();
        });
        await settle();
        expect(groupNames()).toEqual(['head', 'side', 'thin']);

        // Delete a used group: the confirm says how many forms use it.
        await act(async () => {
            byLabel('Delete the group "head"').click();
        });
        await settle();
        expect(document.body.textContent).toContain('1 form uses this group.');
        await act(async () => confirmAction('confirm')!.click());
        await settle();
        expect(groupNames()).toEqual(['side', 'thin']);
        // The form survives, ungrouped.
        expect(rows(id).find(([name]) => name === 'head')![1]).toBeNull();
    });

    it('cancelling the delete keeps the group', async () => {
        group('head');
        harness = await mountHarness(<VariantGroupsDialog open onClose={() => {}} />);
        await settle();
        await act(async () => {
            byLabel('Delete the group "head"').click();
        });
        await settle();
        expect(document.body.textContent).toContain('No form uses this group.');
        await act(async () => confirmAction('cancel')!.click());
        await settle();
        expect(groupNames()).toEqual(['head']);
    });
});
