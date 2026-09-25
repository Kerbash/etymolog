// @vitest-environment happy-dom
/**
 * TemplateEditor — the controlled template editor of the Blocks page.
 *
 * Rendered in a tiny harness that owns the working copy (as BlocksPage does),
 * inside `EtymologProvider` on a real database (the live preview reads the
 * lexicon and graphemes from context). Asserted:
 *
 *  - a role chip appends ONE rectangle at the next even-row slot and never
 *    moves the rectangles already placed (even after the user moved them);
 *  - a chosen chip removes the role and its rectangle;
 *  - arrow keys move the focused rectangle by the 1/8 snap, or 1/32 with
 *    snapping off, and the geometry lands in the template's slot;
 *  - each rectangle's form `<select>` writes the slot's `groupId`;
 *  - Apply is disabled for an empty pattern or a blank name, and calls back;
 *  - the preview caption names the template under edit;
 *  - the "Selected box" panel follows the canvas selection and writes the
 *    slot's count (normalised) and arrangement; the rect readout, pattern
 *    line and chips carry the count; an imported custom count is shown as
 *    such, never snapped to a preset.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;

vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

import { clearDatabase, initDatabase } from '../../../../../db/database';
import { etymologApi } from '../../../../../db/api';
import { EtymologProvider } from '../../../../../db/context';
import type { VariantGroup } from '../../../../../db/types';
import type { BlockScheme, BlockTemplate } from '../../../../../blocks';
import TemplateEditor from '../TemplateEditor';

const SCHEME: BlockScheme = {
    version: 1,
    enabled: false,
    roles: [
        { id: 'role-1', label: 'C1', colour: 'var(--red)', matcher: { kind: 'class', letter: 'C' } },
        { id: 'role-2', label: 'V', colour: 'var(--blue)', matcher: { kind: 'class', letter: 'V' } },
        { id: 'role-3', label: 'C2', colour: 'var(--green)', matcher: { kind: 'class', letter: 'C' } },
    ],
    templates: [],
};

const EMPTY: BlockTemplate = { id: 'tpl-1', name: 'Syllable', pattern: [], slots: [] };

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latest: BlockTemplate = EMPTY;
const onApply = vi.fn();
const onCancel = vi.fn();

function Harness({ initial, groups }: { initial: BlockTemplate; groups: VariantGroup[] }) {
    const [template, setTemplate] = useState(initial);
    // Mirrored in an effect (not during render) for the assertions to read.
    useEffect(() => {
        latest = template;
    }, [template]);
    return (
        <TemplateEditor
            template={template}
            scheme={SCHEME}
            groups={groups}
            isNew
            onChange={setTemplate}
            onApply={onApply}
            onCancel={onCancel}
        />
    );
}

async function settle(times = 4) {
    for (let i = 0; i < times; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
}

async function mount(initial: BlockTemplate = EMPTY, groups: VariantGroup[] = []) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <EtymologProvider>
                <Harness initial={initial} groups={groups} />
            </EtymologProvider>,
        );
    });
    await settle(8);
}

function byLabel<T extends HTMLElement = HTMLElement>(label: string): T {
    const el = container!.querySelector(`[aria-label="${label}"]`);
    if (!el) throw new Error(`no element labelled "${label}"`);
    return el as T;
}

async function click(el: Element) {
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

async function key(el: Element, keyName: string, shiftKey = false) {
    await act(async () => {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, shiftKey, bubbles: true }));
    });
}

const rect = (roleId: string) => container!.querySelector(`[data-rect-id="${roleId}"]`)!;
const slot = (roleId: string) => latest.slots.find((s) => s.roleId === roleId)!;
const applyButton = () => [...container!.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Apply')!;

beforeAll(async () => {
    await initDatabase();
});

beforeEach(() => {
    clearDatabase();
    latest = EMPTY;
    onApply.mockClear();
    onCancel.mockClear();
});

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount());
        root = null;
    }
    container?.remove();
    container = null;
});

describe('TemplateEditor', () => {
    it('a role chip appends one rect at the next even-row slot and never moves the placed ones', async () => {
        await mount();
        expect(container!.textContent).toContain('Add roles to the pattern to place them here.');

        await click(byLabel('Add C1 to the pattern'));
        expect(latest.pattern).toEqual(['role-1']);
        expect(slot('role-1')).toMatchObject({ x: 0, y: 0, w: 1, h: 1, groupId: null });

        // The user shrinks C1 to the top half (Shift+Up = resize, 1/8 steps).
        for (let i = 0; i < 4; i++) await key(rect('role-1'), 'ArrowUp', true);
        expect(slot('role-1')).toMatchObject({ x: 0, y: 0, w: 1, h: 0.5 });

        await click(byLabel('Add V to the pattern'));
        expect(latest.pattern).toEqual(['role-1', 'role-2']);
        expect(slot('role-1')).toMatchObject({ x: 0, y: 0, w: 1, h: 0.5 });
        expect(slot('role-2')).toMatchObject({ x: 0.5, y: 0, w: 0.5, h: 1 });

        await click(byLabel('Add C2 to the pattern'));
        expect(slot('role-3')).toMatchObject({ x: 0.666667, y: 0, w: 0.333333, h: 1 });
        expect(slot('role-2')).toMatchObject({ x: 0.5, y: 0, w: 0.5, h: 1 });
        expect(container!.querySelector('[data-pattern-readout]')?.textContent).toBe('C1 → V → C2');
        expect([...container!.querySelectorAll('[data-rect-id]')].map((r) => r.getAttribute('data-rect-id'))).toEqual([
            'role-1',
            'role-2',
            'role-3',
        ]);
    });

    it('a chosen chip removes the role and its rectangle', async () => {
        await mount();
        await click(byLabel('Add C1 to the pattern'));
        await click(byLabel('Add V to the pattern'));
        const chosen = byLabel('Remove C1 from the pattern');
        expect(chosen.getAttribute('aria-pressed')).toBe('true');
        await click(chosen);
        expect(latest.pattern).toEqual(['role-2']);
        expect(latest.slots.map((s) => s.roleId)).toEqual(['role-2']);
        expect(container!.querySelector('[data-rect-id="role-1"]')).toBeNull();
    });

    it('arrow keys move by the 1/8 snap, or by 1/32 with snapping off', async () => {
        const half: BlockTemplate = {
            ...EMPTY,
            pattern: ['role-1'],
            slots: [{ roleId: 'role-1', groupId: null, x: 0, y: 0, w: 0.5, h: 0.5 }],
        };
        await mount(half);
        await key(rect('role-1'), 'ArrowRight');
        expect(slot('role-1')).toMatchObject({ x: 0.125, y: 0 });

        const snapToggle = [...container!.querySelectorAll('label')]
            .find((l) => l.textContent?.includes('Snap to a 1/8 grid'))!
            .querySelector('input')!;
        await click(snapToggle);
        expect(snapToggle.checked).toBe(false);
        await key(rect('role-1'), 'ArrowDown');
        expect(slot('role-1')).toMatchObject({ x: 0.125, y: 0.03125 });
    });

    it('the form select of a rectangle writes the slot group', async () => {
        const head = etymologApi.variantGroup.create({ name: 'head' }).data!;
        const groups = etymologApi.variantGroup.getAll().data!.groups;
        await mount({ ...EMPTY, pattern: ['role-1'], slots: [{ roleId: 'role-1', groupId: null, x: 0, y: 0, w: 1, h: 1 }] }, groups);

        const select = byLabel<HTMLSelectElement>('Form drawn in C1');
        expect([...select.options].map((o) => o.textContent)).toEqual(['Default form', 'head']);
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
            setter?.call(select, String(head.id));
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(slot('role-1').groupId).toBe(head.id);

        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
            setter?.call(select, '');
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(slot('role-1').groupId).toBeNull();
    });

    it('Apply needs a pattern and a name', async () => {
        await mount();
        expect(applyButton().disabled).toBe(true);
        await click(byLabel('Add C1 to the pattern'));
        expect(applyButton().disabled).toBe(false);

        const name = container!.querySelector<HTMLInputElement>('[data-template-editor] input')!;
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            setter?.call(name, '   ');
            name.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(applyButton().disabled).toBe(true);
        expect(name.getAttribute('aria-invalid')).toBe('true');

        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            setter?.call(name, 'Onset');
            name.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await click(applyButton());
        expect(onApply).toHaveBeenCalledTimes(1);
    });

    it('the preview caption names the template under edit (typed IPA, no lexicon)', async () => {
        const svg = (tag: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${tag}"/></svg>`;
        for (const phoneme of ['t', 'o']) {
            const glyphId = etymologApi.glyph.create({ name: phoneme, svg_data: svg(phoneme) }).data!.id;
            etymologApi.grapheme.create({
                name: phoneme,
                glyphs: [{ glyph_id: glyphId, position: 0 }],
                phonemes: [{ phoneme, use_in_auto_spelling: true }],
            });
        }
        await mount({ ...EMPTY, name: 'Open syllable' });
        await settle(4);
        expect(container!.textContent).toContain('Add a word to the lexicon, or type some IPA, to see a preview.');

        await click(byLabel('Add C1 to the pattern'));
        await click(byLabel('Add V to the pattern'));
        const ipa = byLabel<HTMLInputElement>('IPA to preview');
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            setter?.call(ipa, 'toto');
            ipa.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await settle(2);
        expect(container!.textContent).toContain('2 blocks: Open syllable, Open syllable');
    });

    describe('Selected box (how many signs)', () => {
        const THREE: BlockTemplate = {
            ...EMPTY,
            pattern: ['role-1', 'role-2', 'role-3'],
            slots: [
                { roleId: 'role-1', groupId: null, x: 0, y: 0, w: 0.25, h: 1 },
                { roleId: 'role-2', groupId: null, x: 0.25, y: 0, w: 0.5, h: 1 },
                { roleId: 'role-3', groupId: null, x: 0.75, y: 0, w: 0.25, h: 1 },
            ],
        };

        const panel = () => container!.querySelector<HTMLElement>('[data-slot-settings]')!;
        const countSelect = () => panel().querySelector<HTMLSelectElement>('[data-slot-count]');
        const arrangeSelect = () => panel().querySelector<HTMLSelectElement>('[data-slot-arrange]');
        const readout = () => container!.querySelector('[data-pattern-readout]')?.textContent;

        async function choose(select: HTMLSelectElement, value: string) {
            await act(async () => {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
                setter?.call(select, value);
                select.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }

        it('asks for a selection first, then shows the selected role', async () => {
            await mount(THREE);
            expect(panel().getAttribute('role')).toBe('group');
            expect(panel().textContent).toContain('Select a box in the layout to choose how many signs it holds.');
            expect(countSelect()).toBeNull();

            await key(rect('role-3'), 'Enter');
            const labelId = panel().getAttribute('aria-labelledby')!;
            expect(container!.querySelector(`[id="${labelId}"]`)?.textContent).toBe('Selected box: C2');
            expect(countSelect()!.getAttribute('aria-label')).toBe('C2 — How many signs');
            expect([...countSelect()!.options].map((o) => o.textContent)).toEqual([
                'Exactly one',
                'Optional (none or one)',
                'One to three',
                'Up to three (or none)',
            ]);
            expect(countSelect()!.value).toBe('one');
            // One sign: no arrangement to choose, no readout in the box.
            expect(arrangeSelect()).toBeNull();
            expect(rect('role-3').querySelector('[data-rect-count]')).toBeNull();

            await key(rect('role-1'), 'Enter');
            expect(countSelect()!.getAttribute('aria-label')).toBe('C1 — How many signs');
        });

        it('"Up to three (or none)" writes min 0 / max 3 and offers the arrangement', async () => {
            await mount(THREE);
            await key(rect('role-1'), 'Enter');
            await choose(countSelect()!, 'upToThree');
            expect(slot('role-1')).toEqual({ roleId: 'role-1', groupId: null, x: 0, y: 0, w: 0.25, h: 1, min: 0, max: 3 });
            expect(panel().querySelector('[data-slot-count-hint]')?.textContent).toContain('Up to three signs share this box');

            expect(arrangeSelect()).not.toBeNull();
            expect([...arrangeSelect()!.options].map((o) => o.textContent)).toEqual(['Side by side', 'Stacked']);
            expect(rect('role-1').querySelector('[data-rect-count]')?.textContent).toBe('up to 3 · side by side');
            // Several signs share the box: one muted line says they get smaller.
            expect(panel().querySelector('[data-slot-shared-hint]')?.textContent).toBe(
                'Signs that share a box are drawn smaller. Make the box bigger if they look cramped.',
            );
            expect(readout()).toBe('C1 (up to 3) → V → C2');
            expect(byLabel('Remove C1 (up to 3) from the pattern').textContent).toContain('C1 · up to 3');

            await choose(arrangeSelect()!, 'column');
            expect(slot('role-1').arrange).toBe('column');
            expect(rect('role-1').querySelector('[data-rect-count]')?.textContent).toBe('up to 3 · stacked');

            // Back to one sign: the arrangement goes with it (normalised form).
            await choose(countSelect()!, 'one');
            expect(slot('role-1')).toEqual({ roleId: 'role-1', groupId: null, x: 0, y: 0, w: 0.25, h: 1 });
            expect(arrangeSelect()).toBeNull();
            expect(panel().querySelector('[data-slot-shared-hint]')).toBeNull();
            expect(readout()).toBe('C1 → V → C2');
        });

        it('an optional box reads "optional" everywhere', async () => {
            await mount(THREE);
            await key(rect('role-3'), 'Enter');
            await choose(countSelect()!, 'optional');
            expect(slot('role-3').min).toBe(0);
            expect('max' in slot('role-3')).toBe(false);
            expect(panel().querySelector('[data-slot-count-hint]')?.textContent).toBe(
                'The block still fits when this sign is missing — the box is left empty.',
            );
            expect(arrangeSelect()).toBeNull();
            // At most one sign: nothing shares the box, so no size hint.
            expect(panel().querySelector('[data-slot-shared-hint]')).toBeNull();
            expect(rect('role-3').querySelector('[data-rect-count]')?.textContent).toBe('optional');
            expect(readout()).toBe('C1 → V → C2 (optional)');
            expect(byLabel('Remove C2 (optional) from the pattern').textContent).toContain('C2 · optional');
        });

        it('an imported custom count shows as "Custom (…)" and is replaced only on request', async () => {
            const imported: BlockTemplate = {
                ...THREE,
                slots: THREE.slots.map((s) => (s.roleId === 'role-1' ? { ...s, max: 2 as const } : s)),
            };
            await mount(imported);
            expect(readout()).toBe('C1 (1–2) → V → C2');
            await key(rect('role-1'), 'Enter');
            const select = countSelect()!;
            expect(select.value).toBe('custom');
            expect(select.options[select.selectedIndex].textContent).toBe('Custom (1–2)');
            expect(arrangeSelect()).not.toBeNull();
            expect(slot('role-1').max).toBe(2);

            await choose(select, 'oneToThree');
            expect(slot('role-1').max).toBe(3);
            expect([...countSelect()!.options].some((o) => o.value === 'custom')).toBe(false);
        });

        it('a selection whose role leaves the pattern clears the panel', async () => {
            await mount(THREE);
            await key(rect('role-3'), 'Enter');
            expect(countSelect()).not.toBeNull();
            await click(byLabel('Remove C2 from the pattern'));
            expect(countSelect()).toBeNull();
            expect(panel().textContent).toContain('Select a box in the layout');
        });
    });

    describe('Selected box (where the sign sits + how it fits)', () => {
        const THREE: BlockTemplate = {
            ...EMPTY,
            pattern: ['role-1', 'role-2', 'role-3'],
            slots: [
                { roleId: 'role-1', groupId: null, x: 0, y: 0, w: 0.25, h: 1 },
                { roleId: 'role-2', groupId: null, x: 0.25, y: 0, w: 0.5, h: 1 },
                { roleId: 'role-3', groupId: null, x: 0.75, y: 0, w: 0.25, h: 1 },
            ],
        };

        const panel = () => container!.querySelector<HTMLElement>('[data-slot-settings]')!;
        const pinGroup = () => panel().querySelector<HTMLElement>('[data-slot-pin]');
        const pinButton = (pin: string) => panel().querySelector<HTMLButtonElement>(`[data-slot-pin-option="${pin}"]`)!;
        const fillSelect = () => panel().querySelector<HTMLSelectElement>('[data-slot-fill]');

        async function choose(select: HTMLSelectElement, value: string) {
            await act(async () => {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
                setter?.call(select, value);
                select.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }

        it('offers a 3×3 pin radiogroup, centre checked by default', async () => {
            await mount(THREE);
            expect(pinGroup()).toBeNull(); // nothing selected yet
            await key(rect('role-1'), 'Enter');

            const group = pinGroup()!;
            expect(group.getAttribute('role')).toBe('radiogroup');
            const radios = [...group.querySelectorAll('[role="radio"]')];
            expect(radios).toHaveLength(9);
            expect(radios.map((r) => r.getAttribute('data-slot-pin-option'))).toEqual([
                'top-left', 'top', 'top-right',
                'left', 'center', 'right',
                'bottom-left', 'bottom', 'bottom-right',
            ]);
            expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual([
                'Top left', 'Top', 'Top right',
                'Left', 'Centre', 'Right',
                'Bottom left', 'Bottom', 'Bottom right',
            ]);
            // Default is centre; no `pin` key is stored for it.
            expect(pinButton('center').getAttribute('aria-checked')).toBe('true');
            expect('pin' in slot('role-1')).toBe(false);
        });

        it('picking a pin writes it, picking centre deletes the key', async () => {
            await mount(THREE);
            await key(rect('role-1'), 'Enter');

            await click(pinButton('bottom-left'));
            expect(slot('role-1').pin).toBe('bottom-left');
            expect(pinButton('bottom-left').getAttribute('aria-checked')).toBe('true');
            expect(pinButton('center').getAttribute('aria-checked')).toBe('false');

            await click(pinButton('center'));
            expect('pin' in slot('role-1')).toBe(false);
            expect(pinButton('center').getAttribute('aria-checked')).toBe('true');
        });

        it('picking Fill writes fill, picking Fit deletes the key', async () => {
            await mount(THREE);
            await key(rect('role-1'), 'Enter');

            const select = fillSelect()!;
            expect([...select.options].map((o) => o.textContent)).toEqual([
                'Fit inside the box',
                'Fill the box (may overflow)',
            ]);
            expect(select.value).toBe('fit');
            expect('fill' in slot('role-1')).toBe(false);

            await choose(select, 'fill');
            expect(slot('role-1').fill).toBe('fill');
            expect(panel().querySelector('[data-slot-fill-hint]')?.textContent).toContain('spills past the box edges');

            await choose(fillSelect()!, 'fit');
            expect('fill' in slot('role-1')).toBe(false);
            expect(panel().querySelector('[data-slot-fill-hint]')?.textContent).toBe(
                'The sign shrinks until it sits inside the box.',
            );
        });

        it('a pin change flows into the live preview’s composed SVG', async () => {
            const svg = (tag: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${tag}"/></svg>`;
            for (const phoneme of ['t', 'o']) {
                const glyphId = etymologApi.glyph.create({ name: phoneme, svg_data: svg(phoneme) }).data!.id;
                etymologApi.grapheme.create({
                    name: phoneme,
                    glyphs: [{ glyph_id: glyphId, position: 0 }],
                    phonemes: [{ phoneme, use_in_auto_spelling: true }],
                });
            }
            const cv: BlockTemplate = {
                ...EMPTY,
                name: 'Open syllable',
                pattern: ['role-1', 'role-2'],
                slots: [
                    { roleId: 'role-1', groupId: null, x: 0, y: 0, w: 0.5, h: 1 },
                    { roleId: 'role-2', groupId: null, x: 0.5, y: 0, w: 0.5, h: 1 },
                ],
            };
            await mount(cv);
            const ipa = byLabel<HTMLInputElement>('IPA to preview');
            await act(async () => {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                setter?.call(ipa, 'to');
                ipa.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await settle(4);

            const stage = () => container!.querySelector('[data-block-preview]')!.innerHTML;
            // Default placement composes centred, fit (xMidYMid meet).
            expect(stage()).toContain('xMidYMid');
            expect(stage()).not.toContain('xMinYMax');

            await key(rect('role-1'), 'Enter');
            await click(pinButton('bottom-left'));
            await settle(4);
            // The C1 cell is now pinned bottom-left (xMinYMax), proving the pin
            // reaches the composer through the template state (pitfall P7).
            expect(stage()).toContain('xMinYMax');
        });
    });
});
