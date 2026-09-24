// @vitest-environment happy-dom
/**
 * RolesEditor — the matcher `<select>` (CONLANG_EDGES_PLAN.md §5.3).
 *
 * Rendered in a tiny harness that owns the roles (as BlocksPage's draft
 * does). Asserted:
 *
 *  - the "mark (accent, tone…)" option is a shortcut: it writes
 *    `{ kind: 'category', category: MARK_CATEGORY }` and the text box shows
 *    `mark`;
 *  - a category matcher ALWAYS shows its text box; the select shows the
 *    shortcut while the box reads exactly `mark`, "category…" otherwise;
 *  - typing `markup` character by character passes through `mark` without
 *    losing the box (the bug this rule fixes);
 *  - switching to "category…" keeps the box text; only a switch from another
 *    kind starts at `logogram`;
 *  - the classes, syllable sign and anything still map as before.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { useState } from 'react';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import type { BlockRole, RoleMatcher } from '../../../../../blocks';
import { MARK_CATEGORY, WORD_SYMBOL_CATEGORY } from '../../../../../db/wordSymbolService';
import RolesEditor from '../RolesEditor';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const onMatcher = vi.fn();
const NO_USAGE: ReadonlyMap<string, number> = new Map();

function Harness({ initial }: { initial: RoleMatcher }) {
    const [roles, setRoles] = useState<BlockRole[]>([{ id: 'role-1', label: 'Tone', matcher: initial }]);
    return (
        <RolesEditor
            roles={roles}
            usage={NO_USAGE}
            onAdd={() => {}}
            onRemove={() => {}}
            onUpdate={(roleId, patch) => {
                if (patch.matcher) onMatcher(patch.matcher);
                setRoles((prev) => prev.map((role) => (role.id === roleId ? { ...role, ...patch } : role)));
            }}
        />
    );
}

async function mount(initial: RoleMatcher) {
    onMatcher.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(<Harness initial={initial} />);
    });
}

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount());
        root = null;
    }
    container?.remove();
    container = null;
});

const select = () => container!.querySelector<HTMLSelectElement>('select[aria-label="What Tone matches"]')!;
const categoryBox = () => container!.querySelector<HTMLInputElement>('input[aria-label="Category Tone matches"]');
const selectedText = () => select().selectedOptions[0]?.textContent;

async function choose(value: string) {
    const el = select();
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    await act(async () => {
        setter.call(el, value);
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

async function typeCategory(value: string) {
    const input = categoryBox()!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

describe('RolesEditor — the mark preset', () => {
    it('offers "mark (accent, tone…)" right before "category…"', async () => {
        await mount({ kind: 'any' });
        const labels = [...select().options].map((option) => option.textContent);
        const mark = labels.indexOf('mark (accent, tone…)');
        expect(mark).toBeGreaterThan(-1);
        expect(labels[mark + 1]).toBe('category…');
        expect(labels).toContain('syllable sign');
        expect(labels).toContain('anything');
    });

    it('choosing it fills the box with mark', async () => {
        await mount({ kind: 'class', letter: 'C' });
        expect(categoryBox()).toBeNull();
        await choose('mark');
        expect(onMatcher).toHaveBeenLastCalledWith({ kind: 'category', category: MARK_CATEGORY });
        expect(selectedText()).toBe('mark (accent, tone…)');
        expect(categoryBox()!.value).toBe(MARK_CATEGORY);
    });

    it('a stored mark category reads back as the preset, with its box', async () => {
        await mount({ kind: 'category', category: MARK_CATEGORY });
        expect(select().value).toBe('mark');
        expect(selectedText()).toBe('mark (accent, tone…)');
        expect(categoryBox()!.value).toBe(MARK_CATEGORY);
    });

    it('typing markup character by character keeps the box and ends with category markup', async () => {
        await mount({ kind: 'category', category: '' });
        let typed = '';
        for (const char of 'markup') {
            typed += char;
            await typeCategory(typed);
            expect(categoryBox()).not.toBeNull();
            expect(onMatcher).toHaveBeenLastCalledWith({ kind: 'category', category: typed });
            expect(select().value).toBe(typed === MARK_CATEGORY ? 'mark' : 'category');
        }
        expect(categoryBox()!.value).toBe('markup');
        expect(selectedText()).toBe('category…');
    });

    it('editing the preset in place: the box stays and the select follows the text', async () => {
        await mount({ kind: 'category', category: MARK_CATEGORY });
        await typeCategory('marks');
        expect(onMatcher).toHaveBeenLastCalledWith({ kind: 'category', category: 'marks' });
        expect(select().value).toBe('category');
        await typeCategory('mark');
        expect(select().value).toBe('mark');
        expect(categoryBox()!.value).toBe(MARK_CATEGORY);
    });

    it.each([WORD_SYMBOL_CATEGORY, 'numeral', 'Mark', ' mark'])(
        'any other category (%j) shows "category…" and its text box',
        async (category) => {
            await mount({ kind: 'category', category });
            expect(select().value).toBe('category');
            expect(selectedText()).toBe('category…');
            expect(categoryBox()!.value).toBe(category);
        },
    );

    it('switching from the preset to "category…" keeps the box text as is', async () => {
        await mount({ kind: 'category', category: MARK_CATEGORY });
        await choose('category');
        expect(onMatcher).toHaveBeenLastCalledWith({ kind: 'category', category: MARK_CATEGORY });
        expect(categoryBox()!.value).toBe(MARK_CATEGORY);
    });

    it('switching from another kind to "category…" starts at logogram', async () => {
        await mount({ kind: 'any' });
        await choose('category');
        expect(onMatcher).toHaveBeenLastCalledWith({ kind: 'category', category: WORD_SYMBOL_CATEGORY });
        expect(select().value).toBe('category');
        expect(categoryBox()!.value).toBe(WORD_SYMBOL_CATEGORY);
    });

    it('re-choosing "category…" keeps a typed category; the preset and anything map as expected', async () => {
        await mount({ kind: 'category', category: WORD_SYMBOL_CATEGORY });
        await typeCategory('numeral');
        expect(onMatcher).toHaveBeenLastCalledWith({ kind: 'category', category: 'numeral' });
        // Re-choosing "category…" keeps the typed text.
        await choose('category');
        expect(onMatcher).toHaveBeenLastCalledWith({ kind: 'category', category: 'numeral' });

        await choose('mark');
        expect(onMatcher).toHaveBeenLastCalledWith({ kind: 'category', category: MARK_CATEGORY });
        await choose('any');
        expect(onMatcher).toHaveBeenLastCalledWith({ kind: 'any' });
    });

    it('classes and syllable sign still map as before', async () => {
        await mount({ kind: 'category', category: MARK_CATEGORY });
        await choose('class:V');
        expect(onMatcher).toHaveBeenLastCalledWith({ kind: 'class', letter: 'V' });
        await choose('syllable');
        expect(onMatcher).toHaveBeenLastCalledWith({ kind: 'syllable' });
    });
});
