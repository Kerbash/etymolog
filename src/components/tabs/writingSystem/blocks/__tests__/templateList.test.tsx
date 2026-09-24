// @vitest-environment happy-dom
/**
 * TemplateList — the pattern chips carry each slot's count ("C2 · optional"),
 * in the visible chip text and in the chips' accessible name, and say nothing
 * extra for a box that holds exactly one sign.
 *
 * The "Add templates from my word shapes" button opens an inline choice —
 * one flexible template (recommended, preselected) or one per shape — and Add
 * runs the chosen seed; with no word shapes it seeds straight away.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

import type { BlockRole, BlockTemplate } from '../../../../../blocks';
import TemplateList from '../TemplateList';
import type { TemplateListProps } from '../TemplateList';

const ROLES: BlockRole[] = [
    { id: 'role-1', label: 'C1', colour: 'var(--red)', matcher: { kind: 'class', letter: 'C' } },
    { id: 'role-2', label: 'V', matcher: { kind: 'class', letter: 'V' } },
    { id: 'role-3', label: 'C2', matcher: { kind: 'class', letter: 'C' } },
];

const TEMPLATES: BlockTemplate[] = [
    {
        id: 'tpl-1',
        name: 'Syllable',
        pattern: ['role-1', 'role-2', 'role-3'],
        slots: [
            { roleId: 'role-1', groupId: null, x: 0, y: 0, w: 0.25, h: 1, min: 0, max: 3 },
            { roleId: 'role-2', groupId: null, x: 0.25, y: 0, w: 0.5, h: 1 },
            { roleId: 'role-3', groupId: null, x: 0.75, y: 0, w: 0.25, h: 1, min: 0 },
        ],
    },
    {
        id: 'tpl-2',
        name: 'Imported',
        pattern: ['role-1', 'role-2'],
        slots: [
            { roleId: 'role-1', groupId: null, x: 0, y: 0, w: 0.5, h: 1, max: 3, arrange: 'column' },
            { roleId: 'role-2', groupId: null, x: 0.5, y: 0, w: 0.5, h: 1, max: 4 },
        ],
    },
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(overrides: Partial<TemplateListProps> = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const noop = () => {};
    await act(async () => {
        root!.render(
            <TemplateList
                templates={TEMPLATES}
                roles={ROLES}
                editingId={null}
                onReorder={noop}
                onMove={noop}
                onEdit={noop}
                onDuplicate={noop}
                onRemove={noop}
                onNew={noop}
                onSeed={noop}
                hasWordShapes
                seedReport={null}
                {...overrides}
            />,
        );
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

const chipsOf = (templateId: string) =>
    container!.querySelector(`[data-template-id="${templateId}"] [aria-label^="Pattern:"]`)!;

describe('TemplateList pattern chips', () => {
    it('show each slot count, and nothing extra for exactly one', async () => {
        await mount();
        const chips = chipsOf('tpl-1');
        expect([...chips.children].map((c) => c.textContent)).toEqual(['C1 · up to 3', 'V', 'C2 · optional']);
        expect(chips.getAttribute('aria-label')).toBe('Pattern: C1 (up to 3), V, C2 (optional)');
    });

    it('read presets and custom counts alike', async () => {
        await mount();
        const chips = chipsOf('tpl-2');
        expect([...chips.children].map((c) => c.textContent)).toEqual(['C1 · 1–3', 'V · 1–4']);
        expect(chips.getAttribute('aria-label')).toBe('Pattern: C1 (1–3), V (1–4)');
    });
});

const buttonNamed = (text: string) =>
    [...container!.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) ?? null;

async function click(el: Element) {
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

const seedButton = () => buttonNamed('Add templates from my word shapes')!;
const choicePanel = () => container!.querySelector<HTMLElement>('[data-seed-choice]');

describe('TemplateList seed choice', () => {
    it('opens inline under the header, with the flexible template recommended and preselected', async () => {
        await mount();
        expect(choicePanel()).toBeNull();
        expect(seedButton().getAttribute('aria-expanded')).toBe('false');

        await click(seedButton());
        const panel = choicePanel()!;
        expect(panel).not.toBeNull();
        expect(seedButton().getAttribute('aria-expanded')).toBe('true');
        expect(seedButton().getAttribute('aria-controls')).toBe(panel.id);
        // Not a modal: it sits inside the section, before the list.
        expect(container!.querySelector('[role="dialog"]')).toBeNull();
        expect(panel.getAttribute('role')).toBe('group');
        const titleId = panel.getAttribute('aria-labelledby')!;
        expect(container!.querySelector(`[id="${titleId}"]`)?.textContent).toBe('Add templates from your word shapes');

        const radios = [...panel.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
        expect(radios.map((r) => r.value)).toEqual(['flexible', 'perShape']);
        expect(radios.map((r) => r.checked)).toEqual([true, false]);
        const [flexible, perShape] = radios.map((r) => r.closest('label')!.textContent);
        expect(flexible).toContain('One flexible template');
        expect(flexible).toContain('Recommended');
        expect(flexible).toContain(
            'A single template whose boxes take as many consonants as your shapes need, e.g. up to 2 at the start and 1 at the end. Works best with By syllable.',
        );
        expect(perShape).toContain('One template per shape');
        expect(perShape).toContain('A separate template for every shape (CV, CVC, CCVC…), as before.');
        expect(perShape).not.toContain('Recommended');
        expect(buttonNamed('Add')).not.toBeNull();
        expect(buttonNamed('Cancel')).not.toBeNull();
    });

    it('Add runs the chosen seed and closes the panel', async () => {
        const onSeed = vi.fn();
        await mount({ onSeed });
        await click(seedButton());
        await click(buttonNamed('Add')!);
        expect(onSeed).toHaveBeenCalledWith('flexible');
        expect(choicePanel()).toBeNull();

        await click(seedButton());
        await click(choicePanel()!.querySelector('input[value="perShape"]')!);
        await click(buttonNamed('Add')!);
        expect(onSeed).toHaveBeenLastCalledWith('perShape');
        expect(onSeed).toHaveBeenCalledTimes(2);
    });

    it('Cancel (or the button again) closes it without seeding', async () => {
        const onSeed = vi.fn();
        await mount({ onSeed });
        await click(seedButton());
        await click(buttonNamed('Cancel')!);
        expect(choicePanel()).toBeNull();
        await click(seedButton());
        await click(seedButton());
        expect(choicePanel()).toBeNull();
        expect(onSeed).not.toHaveBeenCalled();
    });

    it('with no word shapes the button seeds straight away (nothing to choose)', async () => {
        const onSeed = vi.fn();
        await mount({ onSeed, hasWordShapes: false });
        expect(seedButton().hasAttribute('aria-expanded')).toBe(false);
        await click(seedButton());
        expect(choicePanel()).toBeNull();
        expect(onSeed).toHaveBeenCalledWith('perShape');
    });
});
