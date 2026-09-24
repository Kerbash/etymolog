// @vitest-environment happy-dom
/**
 * VariantsSection ("Other forms") as a UI, plus the pure forms model it and the
 * submit hook share (`variantDrafts.ts`). The save path — drafts → api → rows —
 * is covered end to end in `tabs/grapheme/__tests__/graphemeVariants.test.tsx`.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { useEffect, useState } from 'react';

import { clearDatabase, initDatabase } from '../../../../db/database';
import { etymologApi } from '../../../../db/api';
import type { Glyph, GraphemeComplete, GraphemeVariantWithGlyphs } from '../../../../db/types';
import {
    mountHarness,
    settle,
    findButton,
    type Harness,
} from '../../../tabs/grapheme/__tests__/testHarness';
import VariantsSection from '../VariantsSection';
import {
    formsChanged,
    initialDefaultForm,
    initialVariantDrafts,
    makeDraftDefault,
    validateForms,
    type VariantDraft,
} from '../variantDrafts';

let harness: Harness | null = null;
let latest: VariantDraft[] = [];
let madeDefault: string[] = [];

function Controlled({ initial, defaultGroupId = null }: { initial: VariantDraft[]; defaultGroupId?: number | null }) {
    const [variants, setVariants] = useState(initial);
    useEffect(() => {
        latest = variants;
    });
    return (
        <VariantsSection
            variants={variants}
            onChange={setVariants}
            onMakeDefault={(key) => madeDefault.push(key)}
            defaultGroupId={defaultGroupId}
        />
    );
}

const glyphA: Glyph = { id: 1, name: 'a', svg_data: '<svg/>', category: null, notes: null, folder_id: null, created_at: '', updated_at: '' };
const glyphB: Glyph = { ...glyphA, id: 2, name: 'b' };

function draft(key: string, name: string, groupId: number | null, glyphs: Glyph[] = [glyphA], id: number | null = null): VariantDraft {
    return { key, id, name, groupId, glyphs };
}

function byLabel<T extends HTMLElement = HTMLButtonElement>(label: string): T {
    const found = Array.from(document.body.querySelectorAll<T>('[aria-label]')).find(
        (el) => el.getAttribute('aria-label') === label,
    );
    if (!found) throw new Error(`nothing labelled ${label}`);
    return found;
}

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

beforeAll(async () => {
    await initDatabase();
});
beforeEach(() => {
    clearDatabase();
    latest = [];
    madeDefault = [];
});
afterEach(() => {
    harness?.unmount();
    harness = null;
});

describe('VariantsSection', () => {
    it('explains what forms are for when there are none, and "Add a form" appends an empty draft', async () => {
        harness = await mountHarness(<Controlled initial={[]} />);
        expect(harness.text()).toContain('Different looks for the same sign — a block layout picks the form by group');

        await act(async () => findButton('Add a form', harness!.container)!.click());
        await act(async () => findButton('Add a form', harness!.container)!.click());
        expect(latest.map((d) => [d.name, d.id, d.groupId, d.glyphs.length])).toEqual([
            ['Form 2', null, null, 0],
            ['Form 3', null, null, 0],
        ]);
        expect(new Set(latest.map((d) => d.key)).size).toBe(2);
        expect(harness.text()).toContain('No glyphs in this form yet');
    });

    it('the name is a plain controlled input; Remove form drops the card', async () => {
        harness = await mountHarness(<Controlled initial={[draft('k1', 'head', null), draft('k2', 'side', null)]} />);
        const input = harness.container.querySelector<HTMLInputElement>('li input[id$="-name"]')!;
        await act(async () => setValue(input, 'tall'));
        expect(latest.map((d) => d.name)).toEqual(['tall', 'side']);

        await act(async () => byLabel('Remove the form "side"').click());
        expect(latest.map((d) => d.key)).toEqual(['k1']);
    });

    it('the group select lists the script groups and greys out one another form (or the default) holds', async () => {
        const H = etymologApi.variantGroup.create({ name: 'head' }).data!.id;
        const S = etymologApi.variantGroup.create({ name: 'side' }).data!.id;
        const T = etymologApi.variantGroup.create({ name: 'tall' }).data!.id;
        harness = await mountHarness(
            <Controlled initial={[draft('k1', 'one', H), draft('k2', 'two', null)]} defaultGroupId={T} />,
        );
        await settle();
        const selects = harness.container.querySelectorAll<HTMLSelectElement>('select');
        const options = Array.from(selects[1].options).map((o) => [o.textContent, o.disabled]);
        expect(options).toEqual([
            ['No group', false],
            ['head (used by "one")', true],
            ['side', false],
            ['tall (used by the default form)', true],
        ]);

        await act(async () => setValue(selects[1], String(S)));
        expect(latest[1].groupId).toBe(S);
        await act(async () => setValue(selects[1], ''));
        expect(latest[1].groupId).toBeNull();
    });

    it('a stale group id (group deleted meanwhile) shows as "No group"', async () => {
        harness = await mountHarness(<Controlled initial={[draft('k1', 'one', 999)]} />);
        await settle();
        expect(harness.container.querySelector<HTMLSelectElement>('select')!.value).toBe('');
    });

    it('Make default reports the card, and is off for a form with no glyphs', async () => {
        harness = await mountHarness(<Controlled initial={[draft('k1', 'full', null), draft('k2', 'empty', null, [])]} />);
        expect(byLabel('Make the form "empty" the default').disabled).toBe(true);
        await act(async () => byLabel('Make the form "full" the default').click());
        expect(madeDefault).toEqual(['k1']);
    });

    it('"Manage groups…" opens the variant groups dialog', async () => {
        harness = await mountHarness(<Controlled initial={[draft('k1', 'one', null)]} />);
        await act(async () => findButton('Manage groups', harness!.container)!.click());
        await settle();
        expect(document.body.textContent).toContain('Variant groups');
        expect(document.body.textContent).toContain('No groups yet.');
    });
});

describe('the forms model (variantDrafts)', () => {
    const variant = (id: number, isDefault: boolean, name: string, groupId: number | null, glyphs: Glyph[]): GraphemeVariantWithGlyphs => ({
        id, grapheme_id: 1, group_id: groupId, name, is_default: isDefault, sort_order: id, created_at: '', updated_at: '', glyphs,
    });
    const stored: GraphemeComplete = {
        id: 1, name: 'ka', category: null, notes: null, folder_id: null, created_at: '', updated_at: '',
        glyphs: [glyphA], phonemes: [],
        variants: [variant(10, true, 'Default', null, [glyphA]), variant(11, false, 'head', 7, [glyphB])],
    };

    it('initial drafts: the non-default variants with id-derived keys; none on create or when variants is absent', () => {
        expect(initialVariantDrafts('edit', stored)).toEqual([
            { key: 'variant-11', id: 11, name: 'head', groupId: 7, glyphs: [glyphB] },
        ]);
        expect(initialVariantDrafts('create', stored)).toEqual([]);
        const { variants: _absent, ...literal } = stored;
        expect(initialVariantDrafts('edit', literal)).toEqual([]);
        expect(initialDefaultForm('edit', stored)).toEqual({ id: 10, name: 'Default', groupId: null });
        expect(initialDefaultForm('edit', literal)).toEqual({ id: null, name: 'Default', groupId: null });
    });

    it('makeDraftDefault swaps identity AND glyphs, keeping the card key in place', () => {
        const state = { defaultGlyphs: [glyphA], defaultForm: initialDefaultForm('edit', stored), variants: initialVariantDrafts('edit', stored) };
        const next = makeDraftDefault(state, 'variant-11');
        expect(next.defaultGlyphs).toEqual([glyphB]);
        expect(next.defaultForm).toEqual({ id: 11, name: 'head', groupId: 7 });
        expect(next.variants).toEqual([{ key: 'variant-11', id: 10, name: 'Default', groupId: null, glyphs: [glyphA] }]);
        // Twice is the identity.
        expect(makeDraftDefault(next, 'variant-11')).toEqual(state);
        // Unknown key: unchanged.
        expect(makeDraftDefault(state, 'nope')).toBe(state);
    });

    it('validateForms: names, empty forms, duplicate groups (default included)', () => {
        const noGroup = { id: null, name: 'Default', groupId: null };
        const name = (id: number) => `g${id}`;
        expect(validateForms(noGroup, [draft('k', 'a', 1)], name)).toBeNull();
        expect(validateForms(noGroup, [draft('k', '  ', 1)], name)).toBe('Every form needs a name.');
        expect(validateForms(noGroup, [draft('k', 'x', null, [])], name)).toContain('"x" has no glyphs');
        expect(validateForms(noGroup, [draft('k', 'a', 1), draft('j', 'b', 1)], name)).toBe('Only one form can be in the group "g1".');
        expect(validateForms({ ...noGroup, groupId: 2 }, [draft('k', 'a', 2)], name)).toBe('Only one form can be in the group "g2".');
    });

    it('formsChanged drives the edit page dirty flag', () => {
        const defaultForm = initialDefaultForm('edit', stored);
        const drafts = initialVariantDrafts('edit', stored);
        expect(formsChanged(stored, defaultForm, drafts)).toBe(false);
        expect(formsChanged(stored, defaultForm, [{ ...drafts[0], name: 'tall' }])).toBe(true);
        expect(formsChanged(stored, defaultForm, [{ ...drafts[0], glyphs: [glyphA] }])).toBe(true);
        expect(formsChanged(stored, defaultForm, [])).toBe(true);
        expect(formsChanged(stored, { ...defaultForm, id: 11 }, drafts)).toBe(true);
    });
});
