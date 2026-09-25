// @vitest-environment happy-dom
/**
 * Blocks page — the Block Designer against a REAL database inside
 * `EtymologProvider` (plan Phase 5).
 *
 * Mounted through `WritingSystemMain` at `/writing-system/blocks`, so the
 * Direction · Blocks sub-nav and the route are exercised too. Asserted:
 *
 *  - add a role → its row appears, and its chip in the template editor;
 *  - build a `C1 V` template with two rectangles → Save → `blockScheme.get()`
 *    returns it, and it validates with no issues;
 *  - reordering templates (↑/↓) persists the order;
 *  - enabling with zero templates warns (here AND on the Direction page);
 *  - Discard restores the saved scheme;
 *  - the live preview renders a composed block `<svg>` for a real word;
 *  - "Check all my words" → "Try it" shows that word in "Try a word";
 *  - "Add templates from my word shapes" opens an inline choice; "One
 *    template per shape" and the recommended "One flexible template" both
 *    seed from the generator profile, once;
 *  - the role-delete guard;
 *  - the "Splitting words" and "Consonants with no vowel" sections: both
 *    render above Roles, editing them marks the page dirty, Save stores the
 *    normalised values and leaves the page CLEAN (no phantom change, N1), and
 *    the mark is chosen through the real grapheme picker.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;

vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
);
vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

import { clearDatabase, initDatabase } from '../../../../db/database';
import { etymologApi } from '../../../../db/api';
import { EtymologProvider } from '../../../../db/context';
import type { BlockScheme } from '../../../../blocks';
import { validateBlockScheme } from '../../../../blocks';
import { BLOCKS_WITHOUT_TEMPLATES_MESSAGE } from '../../../../rules';
import { NotificationProvider } from '../../../shared/notifications/NotificationProvider';
import ConfirmDialogProvider from '../../../shared/confirmDialog/ConfirmDialogProvider';
import { UnsavedChangesRegistry } from '../../../shell';
import { ROUTES } from '../../../../url_mapping';
import { WritingSystemMain } from '../index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function settle(times = 6) {
    for (let i = 0; i < times; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
    }
}

async function mount(path: string = ROUTES.writingSystemBlocks) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(
            <MemoryRouter initialEntries={[path]}>
                <EtymologProvider>
                    <NotificationProvider>
                        <ConfirmDialogProvider>
                            <UnsavedChangesRegistry>
                                <Routes>
                                    <Route path="/writing-system/*" element={<WritingSystemMain />} />
                                </Routes>
                            </UnsavedChangesRegistry>
                        </ConfirmDialogProvider>
                    </NotificationProvider>
                </EtymologProvider>
            </MemoryRouter>,
        );
    });
    await settle(10);
}

const $ = <T extends Element = HTMLElement>(selector: string) => container!.querySelector<T & Element>(selector) as T | null;
const $$ = <T extends Element = HTMLElement>(selector: string) => [...container!.querySelectorAll(selector)] as T[];

function byLabel<T extends HTMLElement = HTMLElement>(label: string): T {
    const el = container!.querySelector(`[aria-label="${label}"]`);
    if (!el) throw new Error(`no element labelled "${label}"`);
    return el as T;
}

function button(text: string): HTMLButtonElement {
    const found = $$<HTMLButtonElement>('button').find((b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text);
    if (!found) throw new Error(`no button "${text}" (have: ${$$('button').map((b) => b.textContent?.trim() || b.getAttribute('aria-label')).join(' | ')})`);
    return found;
}

async function click(el: Element) {
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle(2);
}

async function typeInto(input: HTMLInputElement, value: string) {
    await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle(1);
}

async function choose(select: HTMLSelectElement, value: string) {
    await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle(1);
}

async function save() {
    const saveButton = button('Save');
    expect(saveButton.disabled).toBe(false);
    await click(saveButton);
    await settle(4);
}

const stored = (): BlockScheme => etymologApi.blockScheme.get().data!;
const roleRows = () => $$('tr[data-role-id]');

/** k and a graphemes with glyphs whose path names them; a "head" group. */
function seedScript() {
    const svg = (tag: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${tag}"/></svg>`;
    const glyph = (tag: string) => etymologApi.glyph.create({ name: tag, svg_data: svg(tag) }).data!.id;
    for (const phoneme of ['k', 'a']) {
        etymologApi.grapheme.create({
            name: phoneme,
            glyphs: [{ glyph_id: glyph(`${phoneme}-glyph`), position: 0 }],
            phonemes: [{ phoneme, use_in_auto_spelling: true }],
        });
    }
}

/** A saved CV scheme (roles C1, V) with two templates, for reorder / guard / preview tests. */
function saveTwoTemplateScheme(enabled = true): BlockScheme {
    const scheme: BlockScheme = {
        version: 1,
        enabled,
        roles: [
            { id: 'role-1', label: 'C1', colour: 'var(--red)', matcher: { kind: 'class', letter: 'C' } },
            { id: 'role-2', label: 'V', colour: 'var(--blue)', matcher: { kind: 'class', letter: 'V' } },
            { id: 'role-3', label: 'Spare', matcher: { kind: 'any' } },
        ],
        templates: [
            { id: 'tpl-1', name: 'Onset only', pattern: ['role-1'], slots: [{ roleId: 'role-1', groupId: null, x: 0, y: 0, w: 1, h: 1 }] },
            {
                id: 'tpl-2',
                name: 'CV',
                pattern: ['role-1', 'role-2'],
                slots: [
                    { roleId: 'role-1', groupId: null, x: 0, y: 0, w: 1, h: 0.5 },
                    { roleId: 'role-2', groupId: null, x: 0, y: 0.5, w: 1, h: 0.5 },
                ],
            },
        ],
    };
    expect(etymologApi.blockScheme.save(scheme).data!.issues).toEqual([]);
    return scheme;
}

beforeAll(async () => {
    await initDatabase();
});

beforeEach(() => {
    clearDatabase();
});

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount());
        root = null;
    }
    container?.remove();
    container = null;
});

describe('Writing System sub-nav', () => {
    it('shows Direction · Blocks and mounts the Blocks page at /writing-system/blocks', async () => {
        await mount();
        const nav = $('[aria-label="Writing System"]');
        expect(nav).not.toBeNull();
        expect(nav!.textContent).toContain('Direction');
        expect(nav!.textContent).toContain('Blocks');
        expect($('header h2')?.textContent).toContain('Blocks');
        expect($('[data-scheme-status]')?.textContent).toBe('0 roles · 0 templates · 0 variant groups');
    });

    it('the Direction page is unchanged at /writing-system', async () => {
        await mount(ROUTES.writingSystem);
        expect($('header h2')?.textContent).toContain('Writing System');
        expect($$('select').length).toBeGreaterThanOrEqual(5);
    });
});

describe('BlocksPage', () => {
    it('add a role → its row appears, and its chip in the template editor', async () => {
        await mount();
        expect(roleRows()).toHaveLength(0);
        await click(button('Add role'));
        expect(roleRows()).toHaveLength(1);
        expect(roleRows()[0].getAttribute('data-role-id')).toBe('role-1');

        await typeInto(byLabel<HTMLInputElement>('Label of role 1'), 'Onset');
        await click(button('New template'));
        expect($('[data-template-editor]')).not.toBeNull();
        const chip = byLabel<HTMLButtonElement>('Add Onset to the pattern');
        expect(chip.getAttribute('aria-pressed')).toBe('false');
        expect(chip.textContent).toContain('Onset');
    });

    it('builds a C1 V template with two rectangles → Save → the stored scheme has it, validated', async () => {
        await mount();
        await click(button('Add role'));
        await click(button('Add role'));
        await typeInto(byLabel<HTMLInputElement>('Label of role 1'), 'C1');
        await typeInto(byLabel<HTMLInputElement>('Label of role 2'), 'V');
        await choose(byLabel<HTMLSelectElement>('What V matches'), 'class:V');

        await click(button('New template'));
        await typeInto($<HTMLInputElement>('[data-template-editor] input')!, 'CV block');
        await click(byLabel('Add C1 to the pattern'));
        await click(byLabel('Add V to the pattern'));
        expect($('[data-pattern-readout]')?.textContent).toBe('C1 → V');
        // Two rectangles on the canvas, side by side.
        expect($$('[data-rect-id]').map((r) => r.getAttribute('data-rect-id'))).toEqual(['role-1', 'role-2']);

        await click(button('Apply'));
        expect($('[data-template-editor]')).toBeNull();
        expect($('[data-template-id="tpl-1"]')?.textContent).toContain('CV block');
        expect($('[data-scheme-status]')?.textContent).toBe('2 roles · 1 template · 0 variant groups');

        await save();
        const scheme = stored();
        expect(scheme.roles.map((r) => [r.id, r.label, r.matcher])).toEqual([
            ['role-1', 'C1', { kind: 'class', letter: 'C' }],
            ['role-2', 'V', { kind: 'class', letter: 'V' }],
        ]);
        expect(scheme.templates).toEqual([
            {
                id: 'tpl-1',
                name: 'CV block',
                pattern: ['role-1', 'role-2'],
                slots: [
                    { roleId: 'role-1', groupId: null, x: 0, y: 0, w: 1, h: 1 },
                    { roleId: 'role-2', groupId: null, x: 0.5, y: 0, w: 0.5, h: 1 },
                ],
            },
        ]);
        expect(validateBlockScheme(scheme).issues).toEqual([]);
        // Clean after the save: Save is disabled again, no "unsaved" note.
        expect(button('Save').disabled).toBe(true);
    });

    it('reordering templates persists the order', async () => {
        saveTwoTemplateScheme();
        await mount();
        expect($$('[data-template-id]').map((r) => r.getAttribute('data-template-id'))).toEqual(['tpl-1', 'tpl-2']);
        await click(byLabel('Move CV up'));
        expect($$('[data-template-id]').map((r) => r.getAttribute('data-template-id'))).toEqual(['tpl-2', 'tpl-1']);
        await save();
        expect(stored().templates.map((t) => t.id)).toEqual(['tpl-2', 'tpl-1']);
    });

    it('enabling with zero templates warns, and the Direction page warns about the saved scheme too', async () => {
        await mount();
        expect(container!.textContent).not.toContain(BLOCKS_WITHOUT_TEMPLATES_MESSAGE);
        await click($('input[role="switch"]')!);
        expect(container!.textContent).toContain(BLOCKS_WITHOUT_TEMPLATES_MESSAGE);
        await save();
        expect(stored().enabled).toBe(true);

        await act(async () => root!.unmount());
        container!.remove();
        await mount(ROUTES.writingSystem);
        expect(container!.textContent).toContain(BLOCKS_WITHOUT_TEMPLATES_MESSAGE);
    });

    it('Discard restores the saved scheme', async () => {
        saveTwoTemplateScheme(false);
        await mount();
        expect(button('Discard').disabled).toBe(true);
        await click($('input[role="switch"]')!);
        await click(button('Add role'));
        await click(byLabel('Delete Onset only'));
        expect(roleRows()).toHaveLength(4);
        expect($$('[data-template-id]')).toHaveLength(1);
        expect(container!.textContent).toContain('Unsaved changes');

        await click(button('Discard'));
        expect(roleRows()).toHaveLength(3);
        expect($$('[data-template-id]')).toHaveLength(2);
        expect($<HTMLInputElement>('input[role="switch"]')!.checked).toBe(false);
        expect(button('Save').disabled).toBe(true);
        expect(stored().templates).toHaveLength(2);
    });

    it('the live preview renders a composed block <svg> for a real word', async () => {
        seedScript();
        saveTwoTemplateScheme(false); // off: the preview forces it on anyway
        etymologApi.lexicon.create({ pronunciation: 'ka', meanings: [{ meaning: 'ka' }] });
        await mount();
        await click(byLabel('Edit CV'));

        // First match wins, and the preview renders the DRAFT order: the
        // one-slot "Onset only" template sits first, so it shadows CV…
        expect(container!.textContent).toContain('k · a → 1 block: Onset only · 1 sign on its own');
        // …until CV is moved up (not saved — the preview follows the draft).
        await click(byLabel('Move CV up'));

        const stage = $('[data-block-preview]')!;
        expect(stage).not.toBeNull();
        const blockSvgs = [...stage.querySelectorAll('svg')].filter(
            (svg) => [...svg.children].filter((c) => c.tagName.toLowerCase() === 'svg' && c.getAttribute('preserveAspectRatio') === 'xMidYMid meet').length >= 2,
        );
        expect(blockSvgs).toHaveLength(1);
        expect(stage.innerHTML).toContain('k-glyph');
        expect(stage.innerHTML).toContain('a-glyph');
        expect(container!.textContent).toContain('ka → 1 block: CV');

        // Typed IPA wins over the chosen word.
        await typeInto(byLabel<HTMLInputElement>('IPA to preview'), 'kaka');
        expect(container!.textContent).toContain('ka · ka → 2 blocks: CV, CV');
    });

    it('Check all my words → Try it puts that word in the Try a word preview', async () => {
        seedScript();
        saveTwoTemplateScheme();
        etymologApi.lexicon.create({ pronunciation: 'ka', meanings: [{ meaning: 'ka' }] });
        const kaa = etymologApi.lexicon.create({ pronunciation: 'kaa', meanings: [{ meaning: 'kaa' }] }).data!.id;
        await mount();

        // Typed IPA would hide the chosen word; "Try it" must clear it.
        await typeInto(byLabel<HTMLInputElement>('IPA to preview'), 'kakaka');
        expect($('[data-word-check]')).toBeNull();
        await click(button('Check 2 words'));
        // "Onset only" sits first, so every a is left on its own.
        expect($('[data-word-check-status]')!.textContent).toBe('2 words checked · 0 split cleanly');
        const row = $(`[data-word-check-group="unplaced"] [data-word-check-row="${kaa}"]`)!;
        expect(row.textContent).toContain('k · a · a');
        await click(row.querySelector('button')!);

        const select = byLabel<HTMLSelectElement>('Word to preview');
        expect(select.value).toBe(String(kaa));
        expect(byLabel<HTMLInputElement>('IPA to preview').value).toBe('');
        expect(select.disabled).toBe(false);
        expect(container!.textContent).toContain('k · a · a → 1 block: Onset only · 2 signs on their own');

        // A draft change makes the report stale.
        await click(byLabel('Move CV up'));
        expect($('[data-word-check-stale]')).not.toBeNull();
    });

    /** Open the seed choice, pick one, press Add. */
    async function seedWith(kind: 'flexible' | 'perShape') {
        await click(button('Add templates from my word shapes'));
        const panel = $('[data-seed-choice]')!;
        expect(panel).not.toBeNull();
        await click(panel.querySelector(`input[value="${kind}"]`)!);
        await click(button('Add'));
        expect($('[data-seed-choice]')).toBeNull();
    }

    it('"One flexible template" (recommended) adds ONE Syllable template first, once', async () => {
        await mount();
        await click(button('Add templates from my word shapes'));
        const panel = $('[data-seed-choice]')!;
        expect(panel.textContent).toContain('Recommended');
        expect(panel.querySelector<HTMLInputElement>('input[value="flexible"]')!.checked).toBe(true);
        await click(button('Add'));
        // The default profile is CV / CVC / V: the start and the end are both optional.
        expect($$('[data-template-id]')).toHaveLength(1);
        expect($$('[data-template-id]')[0].textContent).toContain('Syllable');
        expect($$('[data-template-id]')[0].textContent).toContain('C1 · optional');
        expect($$('[data-template-id]')[0].textContent).toContain('C2 · optional');
        expect(container!.textContent).toContain(
            'Added “Syllable”: up to 1 consonant at the start, up to 1 consonant at the end. New roles: C1, V, C2. Save to keep it.',
        );

        await seedWith('flexible');
        expect($$('[data-template-id]')).toHaveLength(1);
        expect(container!.textContent).toContain('Nothing added — “Syllable” already does this');

        // Per-shape templates added afterwards go BELOW it; CVC is skipped
        // because Syllable already has that role pattern (C1 V C2).
        await seedWith('perShape');
        await save();
        expect(stored().templates.map((t) => t.name)).toEqual(['Syllable', 'CV', 'V']);
        expect(validateBlockScheme(stored()).issues).toEqual([]);
        // Normalised (N1): saving leaves the page clean.
        expect(button('Save').disabled).toBe(true);
    });

    it('"One template per shape" seeds from the generator profile, once', async () => {
        await mount();
        await seedWith('perShape');
        // The default profile is CV / CVC / V.
        expect($$('[data-template-id]').map((r) => r.textContent)).toEqual([
            expect.stringContaining('CVC'),
            expect.stringContaining('CV'),
            expect.stringContaining('V'),
        ]);
        expect(container!.textContent).toContain('Added 3 templates');
        await seedWith('perShape');
        expect($$('[data-template-id]')).toHaveLength(3);
        expect(container!.textContent).toContain('No new templates');
        await save();
        expect(stored().templates.map((t) => t.name)).toEqual(['CVC', 'CV', 'V']);
        expect(validateBlockScheme(stored()).issues).toEqual([]);
    });

    it('a role a template uses cannot be deleted; an unused one can', async () => {
        saveTwoTemplateScheme();
        await mount();
        const [c1, v, spare] = roleRows();
        expect(c1.textContent).toContain('Used by 2 templates');
        expect(c1.querySelector('[aria-label^="Remove the role"]')).toBeNull();
        expect(v.textContent).toContain('Used by 1 template');
        await click(spare.querySelector('[aria-label="Remove the role Spare"]')!);
        expect(roleRows().map((r) => r.getAttribute('data-role-id'))).toEqual(['role-1', 'role-2']);

        // The template open in the editor counts too: add V to "Onset only"
        // without applying — V is now used by 2.
        await click(byLabel('Edit Onset only'));
        await click(byLabel('Add V to the pattern'));
        expect(roleRows()[1].textContent).toContain('Used by 2 templates');
    });

    it('an empty category blocks Save with the reason', async () => {
        await mount();
        await click(button('Add role'));
        await choose(byLabel<HTMLSelectElement>('What Role 1 matches'), 'category');
        const category = byLabel<HTMLInputElement>('Category Role 1 matches');
        expect(category.value).toBe('logogram');
        await typeInto(category, '');
        expect(container!.textContent).toContain('Role 1 matches a category but names none.');
        expect(button('Save').disabled).toBe(true);
    });
});

describe('BlocksPage — split and lone-consonant sections', () => {
    const sectionTitled = (title: string) =>
        $$<HTMLElement>('section').find((section) => section.querySelector('h3')?.textContent === title) ?? null;

    it('both sections, then Try a word and Check all my words, render between the toolbar and Roles', async () => {
        await mount();
        const titles = $$('section h3').map((h) => h.textContent);
        expect(titles.slice(0, 5)).toEqual(['Splitting words into blocks', 'Spacing', 'Consonants with no vowel', 'Try a word', 'Check all my words']);
        // Unset split: the note is visible, nothing was switched silently.
        expect($('[data-split-unset-note]')).not.toBeNull();
        expect(button('Save').disabled).toBe(true);
    });

    it('choosing By syllable marks the page dirty; Save stores it normalised and the page is clean', async () => {
        await mount();
        const split = sectionTitled('Splitting words into blocks')!;
        await click(split.querySelector('input[value="syllables"]')!);
        expect(container!.textContent).toContain('Unsaved changes');
        expect($('[data-split-unset-note]')).toBeNull();

        await click(split.querySelector('input[type="checkbox"]')!);
        await save();
        expect(stored().split).toEqual({ mode: 'syllables', sibilantClusters: true });
        expect(button('Save').disabled).toBe(true);
        expect(container!.textContent).not.toContain('Unsaved changes');

        // Unticking returns to the bare form — also saved clean.
        await click(sectionTitled('Splitting words into blocks')!.querySelector('input[type="checkbox"]')!);
        await save();
        expect(stored().split).toEqual({ mode: 'syllables' });
        expect(button('Save').disabled).toBe(true);
    });

    it('consonants that can carry a syllable: suggested from the real signs, saved normalised, page clean', async () => {
        // Signs read as k, a, r, n: only r and n are offered (k is a stop, a a vowel).
        const svg = (tag: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${tag}"/></svg>`;
        for (const phoneme of ['k', 'a', 'r', 'n']) {
            etymologApi.grapheme.create({
                name: phoneme,
                glyphs: [{ glyph_id: etymologApi.glyph.create({ name: phoneme, svg_data: svg(`${phoneme}-glyph`) }).data!.id, position: 0 }],
                phonemes: [{ phoneme, use_in_auto_spelling: true }],
            });
        }
        await mount();
        await click(sectionTitled('Splitting words into blocks')!.querySelector('input[value="syllables"]')!);
        await save();

        const suggestions = () => $('[data-syllabic-suggestions]');
        expect(suggestions()!.textContent).toContain('Suggested from your signs:');
        expect($$('[data-syllabic-suggestions] button').map((b) => b.textContent)).toEqual(['+ r', '+ n']);

        await click(button('Add r'));
        expect(container!.textContent).toContain('Unsaved changes');
        await save();
        expect(stored().split).toEqual({ mode: 'syllables', syllabicConsonants: ['r'] });
        expect(button('Save').disabled).toBe(true);
        expect(container!.textContent).not.toContain('Unsaved changes');

        // Toggling the s + consonant option keeps the list — and saves clean.
        await click(sectionTitled('Splitting words into blocks')!.querySelector('input[type="checkbox"]')!);
        await save();
        expect(stored().split).toEqual({ mode: 'syllables', sibilantClusters: true, syllabicConsonants: ['r'] });
        expect(button('Save').disabled).toBe(true);
    });

    it('choosing a vowel-killer mark through the picker marks dirty and saves; Discard/on-its-own clear it', async () => {
        seedScript();
        const halant = etymologApi.grapheme.create({
            name: 'Halant',
            glyphs: [{ glyph_id: etymologApi.glyph.create({ name: 'halant', svg_data: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="halant-glyph"/></svg>' }).data!.id, position: 0 }],
            phonemes: [],
        }).data!.id;
        await mount();

        const lone = () => sectionTitled('Consonants with no vowel')!;
        await click(lone().querySelector('input[value="mark"]')!);
        // Nothing valid to store yet: still clean.
        expect(button('Save').disabled).toBe(true);

        await click(button('Choose mark…'));
        const dialogTitle = [...document.body.querySelectorAll('h1, h2, h3')].find((h) => h.textContent === 'Choose the vowel-killer mark');
        expect(dialogTitle).toBeTruthy();
        const card = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Halant'));
        expect(card).toBeTruthy();
        await click(card!);
        await settle(2);

        expect(lone().querySelector('[data-mark-name]')?.textContent).toBe('Halant');
        expect(container!.textContent).toContain('Unsaved changes');
        await save();
        expect(stored().leftovers).toEqual({ markGraphemeId: halant, placement: 'below' });
        expect(button('Save').disabled).toBe(true);

        await click(lone().querySelector('input[value="alone"]')!);
        expect(container!.textContent).toContain('Unsaved changes');
        await click(button('Discard'));
        expect(lone().querySelector('[data-mark-name]')?.textContent).toBe('Halant');

        await click(lone().querySelector('input[value="alone"]')!);
        await save();
        expect('leftovers' in stored()).toBe(false);
        expect(button('Save').disabled).toBe(true);
    });
});

describe('BlocksPage — "On this page" contents', () => {
    /** The links expected under the header, in the page's own render order. */
    const EXPECTED: readonly [label: string, id: string][] = [
        ['Splitting', 'blocks-split'],
        ['Spacing', 'blocks-spacing'],
        ['Lone consonants', 'blocks-leftovers'],
        ['Try a word', 'blocks-try'],
        ['Check words', 'blocks-check'],
        ['Roles', 'blocks-roles'],
        ['Variant groups', 'blocks-groups'],
        ['Templates', 'blocks-templates'],
    ];

    const contentLinks = () => $$<HTMLAnchorElement>('nav[data-page-contents] a');

    it('renders the contents links in page order with #id hrefs', async () => {
        await mount();
        const nav = $('[data-page-contents]');
        expect(nav?.getAttribute('aria-label')).toBe('On this page');
        expect(contentLinks().map((a) => a.textContent)).toEqual(EXPECTED.map(([label]) => label));
        expect(contentLinks().map((a) => a.getAttribute('href'))).toEqual(EXPECTED.map(([, id]) => `#${id}`));
    });

    it('every link points at a section id that exists in the document', async () => {
        await mount();
        for (const [, id] of EXPECTED) {
            const target = container!.querySelector(`#${id}`);
            expect(target, `section #${id} missing`).not.toBeNull();
            expect(target!.tagName.toLowerCase()).toBe('section');
        }
    });

    it('clicking a link scrolls its section into view without changing the hash', async () => {
        // jsdom / happy-dom have no scrollIntoView — stub it to observe the call.
        const scrollIntoView = vi.fn();
        (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollIntoView;
        await mount();
        const hashBefore = window.location.hash;

        const templatesLink = contentLinks().find((a) => a.getAttribute('href') === '#blocks-templates')!;
        // A real browser click is cancelable; the shared `click` helper is not,
        // so dispatch one directly to exercise the handler's preventDefault.
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        await act(async () => {
            templatesLink.dispatchEvent(event);
        });

        const target = container!.querySelector('#blocks-templates')!;
        expect(event.defaultPrevented).toBe(true);
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(scrollIntoView.mock.instances[0]).toBe(target);
        expect(scrollIntoView.mock.calls[0][0]).toEqual({ behavior: 'smooth', block: 'start' });
        expect(window.location.hash).toBe(hashBefore);
    });
});
