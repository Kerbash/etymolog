// @vitest-environment happy-dom
/**
 * GlyphCanvasInput — blocks while spelling (BLOCK_SCRIPT_PLAN Phase 6).
 *
 * The REAL canvas input, inside the REAL `EtymologProvider` over a real
 * (sql.js) database with a SAVED block scheme — the canvas reads the scheme
 * and the grapheme index from context, exactly as in the lexicon form. Seed:
 * graphemes k (default + "head"), a, t (default + "head"); templates C1 V C2
 * then C1 V, the onset slot drawing the "head" group.
 *
 * Covered:
 *  - outlines group `C1 V C2` (and `C1 V` + single) by entry position;
 *  - the preview strip renders the composed word;
 *  - the popover pins a variant (`grapheme-<k>@<head>` in the hidden input),
 *    "Auto" strips it, "Split before" inserts `.`, "Join" removes it;
 *  - the Boundary key and the physical `.` key insert a boundary, drawn as a
 *    boundary tile; the Join key (right after it) inserts `‿`, drawn as a
 *    slim join tile (CONLANG_EDGES_PLAN.md §5.2);
 *  - the auto-spell lock: popover read-only with the lock's text; a derived
 *    spelling containing `.` shows a boundary tile;
 *  - scheme disabled: none of the block UI mounts, `.` does nothing, and the
 *    hidden input serialises exactly as before (pinned fixture);
 *  - a pinned spelling loaded into the canvas round-trips unchanged (with the
 *    scheme on AND off);
 *  - the pin-carrying selection model, pure.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, type RefObject } from 'react';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;

vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
})));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

import { EtymologProvider } from '../../../../../db/context';
import { useEtymolog } from '../../../../../db/context/etymologContext';
import { clearDatabase, initDatabase } from '../../../../../db/database';
import { etymologApi } from '../../../../../db/api';
import { deriveAutoSpelledGlyphOrder } from '../../../../../db/respellService';
import { createGraphemeEntry, type SpellingEntry } from '../../../../../db/utils/spellingUtils';
import type { BlockScheme } from '../../../../../blocks';
import { SmartForm, useSmartForm } from 'smart-form/smartForm';
import GlyphCanvasInput from '../GlyphCanvasInput';
import type { GlyphCanvasInputRef, LockedSpelling } from '../types';
import {
    createAppendStrategy,
    createCursorStrategy,
    createPrependStrategy,
} from '../strategies';
import {
    insertAt,
    insertWithStrategy,
    removeAt,
    removeWithStrategy,
    selectionFromIds,
    setPinAt,
} from '../utils/selectionModel';
import {
    createBoundaryGlyph,
    isBoundaryGlyphName,
    BOUNDARY_CHARACTER,
    createJoinGlyph,
    isJoinGlyphName,
    JOIN_CHARACTER,
} from '../utils';
import type { InsertionStrategy } from '../types';

// =============================================================================
// SEED
// =============================================================================

interface Seed {
    k: number;
    a: number;
    t: number;
    kHead: number;
    tHead: number;
    kDefault: number;
    headGroup: number;
    scheme: BlockScheme;
}

function svgOf(tag: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${tag}"/></svg>`;
}

function seed(enabled = true): Seed {
    const head = etymologApi.variantGroup.create({ name: 'head' }).data!;
    const glyph = (tag: string) => etymologApi.glyph.create({ name: tag, svg_data: svgOf(tag) }).data!.id;
    const make = (phoneme: string, headTag?: string) => etymologApi.grapheme.create({
        name: phoneme,
        glyphs: [{ glyph_id: glyph(`${phoneme}-default`), position: 0 }],
        phonemes: [{ phoneme, use_in_auto_spelling: true }],
        ...(headTag ? { variants: [{ name: 'Head', group_id: head.id, glyphs: [{ glyph_id: glyph(headTag), position: 0 }] }] } : {}),
    }).data!.id;
    const k = make('k', 'k-head');
    const a = make('a');
    const t = make('t', 't-head');

    const scheme: BlockScheme = {
        version: 1,
        enabled,
        roles: [
            { id: 'C1', label: 'Onset', colour: 'var(--status-good)', matcher: { kind: 'class', letter: 'C' } },
            { id: 'V', label: 'Nucleus', matcher: { kind: 'class', letter: 'V' } },
            { id: 'C2', label: 'Coda', matcher: { kind: 'class', letter: 'C' } },
        ],
        templates: [
            {
                id: 'cvc',
                name: 'CVC',
                pattern: ['C1', 'V', 'C2'],
                slots: [
                    { roleId: 'C1', groupId: head.id, x: 0, y: 0, w: 1, h: 0.5 },
                    { roleId: 'V', groupId: null, x: 0, y: 0.5, w: 0.5, h: 0.5 },
                    { roleId: 'C2', groupId: null, x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
                ],
            },
            {
                id: 'cv',
                name: 'CV',
                pattern: ['C1', 'V'],
                slots: [
                    { roleId: 'C1', groupId: head.id, x: 0, y: 0, w: 1, h: 0.5 },
                    { roleId: 'V', groupId: null, x: 0, y: 0.5, w: 1, h: 0.5 },
                ],
            },
        ],
    };
    expect(etymologApi.blockScheme.save(scheme).data!.issues).toEqual([]);

    const all = etymologApi.grapheme.getAllComplete().data!.graphemes;
    const variantsOf = (id: number) => all.find((g) => g.id === id)!.variants!;
    return {
        k, a, t,
        kHead: variantsOf(k).find((v) => !v.is_default)!.id,
        kDefault: variantsOf(k).find((v) => v.is_default)!.id,
        tHead: variantsOf(t).find((v) => !v.is_default)!.id,
        headGroup: head.id,
        scheme,
    };
}

// =============================================================================
// HARNESS
// =============================================================================

const FIELD = 'spelling';
let fieldRef: RefObject<unknown> | null = null;
let latestOrder: SpellingEntry[] | null = null;

function CanvasHost({ initial, locked }: { initial: SpellingEntry[]; locked?: LockedSpelling | null }) {
    const { registerField, registerForm } = useSmartForm({ mode: 'onChange' });
    const formProps = registerForm('blocksForm', { submitFunc: async () => ({ success: true }), lockFormOnSubmit: false });
    const { data } = useEtymolog();
    const field = registerField(FIELD, { defaultValue: [] });
    // Mirrored in an effect, not during render (a render must stay pure).
    const ref = field.registerSmartFieldProps.ref as RefObject<unknown>;
    useEffect(() => {
        fieldRef = ref;
    }, [ref]);
    return (
        <SmartForm {...formProps} registerField={registerField}>
            <GlyphCanvasInput
                {...field}
                availableGlyphs={data.graphemesComplete}
                initialGlyphOrder={initial}
                onSelectionChange={(_ids, _virtual, order) => { latestOrder = order ?? null; }}
                locked={locked ?? null}
                enableIpaMode
            />
        </SmartForm>
    );
}

let container: HTMLDivElement;
let root: Root;

async function settle(times = 8) {
    for (let i = 0; i < times; i++) {
        await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    }
}

async function mount(initial: SpellingEntry[], locked?: LockedSpelling | null) {
    await act(async () => {
        root.render(
            <EtymologProvider>
                <CanvasHost initial={initial} locked={locked} />
            </EtymologProvider>,
        );
    });
    await settle();
}

/** The canvas handle (the SmartForm field ref the input fills). */
function canvasHandle(): GlyphCanvasInputRef {
    const current = fieldRef?.current as GlyphCanvasInputRef | null | undefined;
    expect(current).toBeTruthy();
    return current!;
}

const hidden = () => document.querySelector<HTMLInputElement>(`input[name="${FIELD}"]`)!.value;
const outlines = () => Array.from(container.querySelectorAll('[data-block-entries]')).map((g) => g.getAttribute('data-block-entries'));
const previewStrip = () => container.querySelector('[data-testid="block-preview-strip"]');
const popover = () => document.querySelector('[data-testid="block-popover"]');
const boundaryTiles = () => container.querySelectorAll('[data-boundary="true"]');
const joinTiles = () => container.querySelectorAll('[data-join="true"]');
const JOIN_KEY = 'button[aria-label="Join - keep the signs on both sides in one block"]';
const BOUNDARY_KEY = 'button[aria-label="Boundary - insert a block boundary"]';

function blockButton(name: string): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>(`button[aria-label^="Block ${name}:"]`);
    expect(button).not.toBeNull();
    return button!;
}

function buttonByText(text: string): HTMLButtonElement | undefined {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === text);
}

async function click(element: HTMLElement) {
    await act(async () => { element.click(); });
    await settle(3);
}

async function choose(select: HTMLSelectElement, value: string) {
    await act(async () => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle(3);
}

async function pressKey(key: string) {
    await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
    await settle(3);
}

async function openKeyboard() {
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="Open glyph keyboard"]')!);
}

beforeAll(async () => {
    await initDatabase();
});

beforeEach(() => {
    clearDatabase();
    fieldRef = null;
    latestOrder = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    document.body.innerHTML = '';
});

const g = createGraphemeEntry;

// =============================================================================
// 1. OUTLINES + PREVIEW
// =============================================================================

describe('block outlines and the preview strip', () => {
    it('groups C1 V C2 into one outline, captioned with the template, coloured by the first role', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a), g(s.t)]);

        expect(outlines()).toEqual(['0,1,2']);
        const rect = container.querySelector<SVGRectElement>('[data-block-entries] rect')!;
        expect(rect.style.stroke).toBe('var(--status-good)');
        expect(blockButton('CVC')).toBeDefined();
        expect(container.querySelector('[data-block-entries]')!.textContent).toContain('CVC');
    });

    it('a CV block then a lone entry: only the block is outlined', async () => {
        const s = seed();
        // k a . t → CV + t (the boundary keeps t out of a CVC)
        await mount([g(s.k), g(s.a), '.', g(s.t)]);
        expect(outlines()).toEqual(['0,1']);
        expect(boundaryTiles()).toHaveLength(1);
    });

    it('the preview strip renders the composed block (the onset in its head form)', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a), g(s.t)]);
        const strip = previewStrip();
        expect(strip).not.toBeNull();
        expect(strip!.textContent).toContain('This is how the word renders everywhere else');
        expect(strip!.innerHTML).toContain('k-head');
        expect(strip!.innerHTML).not.toContain('k-default');
    });

    it('a boundary is a boundary tile on the canvas, never a text glyph', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a), '.', g(s.k), g(s.a)]);
        expect(boundaryTiles()).toHaveLength(1);
        expect(boundaryTiles()[0].textContent).toContain('Block boundary');
        expect(container.innerHTML).not.toContain('>.</text>');
        expect(outlines()).toEqual(['0,1', '3,4']);
    });
});

// =============================================================================
// 2. POPOVER
// =============================================================================

describe('the block popover', () => {
    it('pins a variant: the hidden input serialises grapheme-<k>@<head>; Auto strips it', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a), g(s.t)]);

        await click(blockButton('CVC'));
        expect(popover()).not.toBeNull();
        expect(popover()!.textContent).toContain('Onset');
        expect(document.body.textContent).toContain('Block: CVC');

        const onsetSelect = document.querySelector<HTMLSelectElement>('select[aria-label="Form of k (Onset)"]')!;
        const labels = Array.from(onsetSelect.options).map((o) => o.textContent);
        expect(labels[0]).toBe('Auto (head)');
        expect(labels).toContain('Head');

        // The coda slot has no group: "Auto (default form)".
        const codaSelect = document.querySelector<HTMLSelectElement>('select[aria-label="Form of t (Coda)"]')!;
        expect(codaSelect.options[0].textContent).toBe('Auto (default form)');

        // Pin the coda to t's head form.
        await choose(codaSelect, String(s.tHead));
        expect(JSON.parse(hidden())).toEqual([g(s.k), g(s.a), g(s.t, s.tHead)]);
        expect(canvasHandle().glyphOrder).toEqual([g(s.k), g(s.a), `grapheme-${s.t}@${s.tHead}`]);
        expect(latestOrder).toEqual([g(s.k), g(s.a), g(s.t, s.tHead)]);
        // The pin is marked on the tile and drawn in the preview.
        expect(container.querySelectorAll('[data-pinned="true"]')).toHaveLength(1);
        expect(previewStrip()!.innerHTML).toContain('t-head');

        // Auto strips it again.
        const codaAgain = document.querySelector<HTMLSelectElement>('select[aria-label="Form of t (Coda)"]')!;
        expect(codaAgain.value).toBe(String(s.tHead));
        await choose(codaAgain, '');
        expect(JSON.parse(hidden())).toEqual([g(s.k), g(s.a), g(s.t)]);
        expect(container.querySelectorAll('[data-pinned="true"]')).toHaveLength(0);
    });

    it('pins the onset too (grapheme-<k>@<variant>), even to its default form', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a)]);
        await click(blockButton('CV'));
        await choose(document.querySelector<HTMLSelectElement>('select[aria-label="Form of k (Onset)"]')!, String(s.kDefault));
        expect(JSON.parse(hidden())).toEqual([`grapheme-${s.k}@${s.kDefault}`, g(s.a)]);
    });

    it('"Split before" inserts a "." before that slot\'s entry and re-segments', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a), g(s.t)]);
        await click(blockButton('CVC'));

        // No "Split before" on the first slot.
        expect(buttonByText('Split before Onset')).toBeUndefined();
        await click(buttonByText('Split before Coda')!);

        expect(JSON.parse(hidden())).toEqual([g(s.k), g(s.a), '.', g(s.t)]);
        expect(outlines()).toEqual(['0,1']);
        expect(boundaryTiles()).toHaveLength(1);
        expect(popover()).toBeNull();
    });

    it('"Join with next block" removes the "." right after the block', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a), '.', g(s.t), g(s.a)]);
        expect(outlines()).toEqual(['0,1', '3,4']);

        await click(container.querySelector<HTMLButtonElement>('[data-block-entries="0,1"] button')!);
        await click(buttonByText('Join with next block')!);

        expect(JSON.parse(hidden())).toEqual([g(s.k), g(s.a), g(s.t), g(s.a)]);
        expect(outlines()).toEqual(['0,1,2']);
    });

    it('offers no Join when no boundary follows the block', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a), g(s.t)]);
        await click(blockButton('CVC'));
        expect(buttonByText('Join with next block')).toBeUndefined();
    });

    it('a pin survives an edit elsewhere in the word (backspace at the end)', async () => {
        const s = seed();
        await mount([g(s.k, s.kHead), g(s.a), g(s.t)]);
        await openKeyboard();
        await pressKey('Backspace');
        expect(JSON.parse(hidden())).toEqual([g(s.k, s.kHead), g(s.a)]);
    });
});

// =============================================================================
// 3. BOUNDARY ENTRY
// =============================================================================

describe('boundary entries', () => {
    it('the physical "." key inserts a boundary while the keyboard is open', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a), g(s.t)]);
        await openKeyboard();
        await pressKey('.');
        expect(JSON.parse(hidden())).toEqual([g(s.k), g(s.a), g(s.t), '.']);
        expect(boundaryTiles()).toHaveLength(1);
    });

    it('"." typed in the keyboard\'s search box is text, not a boundary', async () => {
        const s = seed();
        await mount([g(s.k)]);
        await openKeyboard();
        const search = document.querySelector<HTMLInputElement>('[role="dialog"] input');
        expect(search).not.toBeNull();
        search!.focus();
        await pressKey('.');
        expect(canvasHandle().glyphOrder).toEqual([g(s.k)]);
    });

    it('the "·" Boundary key sits in the keyboard and inserts one', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a)]);
        await openKeyboard();
        const key = document.querySelector<HTMLButtonElement>('button[aria-label="Boundary - insert a block boundary"]');
        expect(key).not.toBeNull();
        expect(key!.textContent).toContain('Boundary');
        await click(key!);
        expect(JSON.parse(hidden())).toEqual([g(s.k), g(s.a), '.']);
    });

    it('the "‿" Join key sits right after Boundary and inserts one, drawn as a join tile', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a)]);
        await openKeyboard();
        const key = document.querySelector<HTMLButtonElement>(JOIN_KEY);
        expect(key).not.toBeNull();
        expect(key!.textContent).toContain('Join');
        expect(key!.textContent).toContain(JOIN_CHARACTER);
        // Directly after the Boundary key: the next button in the keyboard.
        const boundaryKey = document.querySelector<HTMLButtonElement>(BOUNDARY_KEY)!;
        const keys = Array.from(document.querySelectorAll('button'));
        expect(keys.indexOf(key!)).toBe(keys.indexOf(boundaryKey) + 1);

        await click(key!);
        expect(JSON.parse(hidden())).toEqual([g(s.k), g(s.a), JOIN_CHARACTER]);
        expect(joinTiles()).toHaveLength(1);
        expect(joinTiles()[0].textContent).toContain('Block join');
        expect(joinTiles()[0].textContent).toContain(JOIN_CHARACTER);
        expect(boundaryTiles()).toHaveLength(0);
        // A join is not an IPA fallback: no "(includes IPA)" note.
        expect(container.textContent).not.toContain('(includes IPA)');
    });

    it('a stored "‿" loads as a join tile, never a text glyph, and round-trips', async () => {
        const s = seed();
        const order = [g(s.k), g(s.a), JOIN_CHARACTER, g(s.t)];
        await mount(order);
        expect(joinTiles()).toHaveLength(1);
        expect(container.textContent).not.toContain('(includes IPA)');
        expect(canvasHandle().glyphOrder).toEqual(order);
    });

    it('the physical "." key still inserts a boundary, not a join', async () => {
        const s = seed();
        await mount([g(s.k)]);
        await openKeyboard();
        await pressKey('.');
        expect(JSON.parse(hidden())).toEqual([g(s.k), '.']);
        expect(joinTiles()).toHaveLength(0);
    });

    it('helpers: the join glyph is the "‿" virtual glyph, distinct from the boundary', () => {
        const join = createJoinGlyph();
        expect(join.ipaCharacter).toBe(JOIN_CHARACTER);
        expect(JOIN_CHARACTER).toBe('‿');
        expect(join.id).toBeLessThan(0);
        expect(join.id).not.toBe(createBoundaryGlyph().id);
        expect(createJoinGlyph().id).toBe(join.id);
        expect(isJoinGlyphName('‿')).toBe(true);
        expect(isJoinGlyphName('.')).toBe(false);
        expect(isJoinGlyphName(' ')).toBe(false);
        expect(isBoundaryGlyphName('‿')).toBe(false);
    });

    it('helpers: the boundary glyph is the "." virtual glyph', () => {
        const boundary = createBoundaryGlyph();
        expect(boundary.ipaCharacter).toBe(BOUNDARY_CHARACTER);
        expect(boundary.id).toBeLessThan(0);
        expect(isBoundaryGlyphName('.')).toBe(true);
        expect(isBoundaryGlyphName(' ')).toBe(false);
        expect(isBoundaryGlyphName('a')).toBe(false);
    });
});

// =============================================================================
// 4. AUTO-SPELL LOCK
// =============================================================================

describe('under the auto-spell lock', () => {
    const LOCK_TOOLTIP = 'Disable auto-spell to modify the spelling';

    it('the popover is read-only and says why; the preview still shows', async () => {
        const s = seed();
        const locked: LockedSpelling = {
            glyphOrder: [g(s.k), g(s.a), g(s.t)],
            message: 'Auto-spell is on',
            tooltip: LOCK_TOOLTIP,
        };
        await mount([g(s.k), g(s.a), g(s.t)], locked);
        expect(previewStrip()).not.toBeNull();

        await click(blockButton('CVC'));
        expect(popover()!.textContent).toContain(LOCK_TOOLTIP);
        const selects = Array.from(document.querySelectorAll<HTMLSelectElement>('[data-testid="block-popover"] select'));
        expect(selects.length).toBe(3);
        expect(selects.every((select) => select.disabled)).toBe(true);
        expect(buttonByText('Split before Coda')!.disabled).toBe(true);

        // Even a forced change event does not write a pin.
        await choose(selects[0], String(s.kHead));
        expect(canvasHandle().glyphOrder).toEqual([g(s.k), g(s.a), g(s.t)]);
    });

    it('a derived spelling with "." (auto-spell of "ka.ta") shows a boundary tile and two blocks', async () => {
        const s = seed();
        const derived = deriveAutoSpelledGlyphOrder('ka.ta');
        expect(derived).toEqual([g(s.k), g(s.a), '.', g(s.t), g(s.a)]);
        await mount([], { glyphOrder: derived, message: 'Auto-spell is on', tooltip: LOCK_TOOLTIP });

        expect(boundaryTiles()).toHaveLength(1);
        expect(outlines()).toEqual(['0,1', '3,4']);
        expect(canvasHandle().glyphOrder).toEqual(derived);
    });
});

// =============================================================================
// 5. SCHEME OFF + ROUND TRIP
// =============================================================================

describe('with the scheme disabled', () => {
    it('none of the block UI mounts, "." does nothing, and serialisation is unchanged', async () => {
        const s = seed(false);
        await mount([g(s.k), g(s.a), g(s.t)]);
        // Pinned fixture: the hidden input carries glyph_order JSON from mount.
        expect(hidden()).toBe(`["grapheme-${s.k}","grapheme-${s.a}","grapheme-${s.t}"]`);

        expect(previewStrip()).toBeNull();
        expect(outlines()).toEqual([]);
        expect(container.querySelector('button[aria-label^="Block "]')).toBeNull();

        await openKeyboard();
        expect(document.querySelector('button[aria-label="Boundary - insert a block boundary"]')).toBeNull();
        expect(document.querySelector(JOIN_KEY)).toBeNull();
        await pressKey('.');
        expect(canvasHandle().glyphOrder).toEqual([g(s.k), g(s.a), g(s.t)]);

        // Pinned fixture of today's serialisation after one backspace.
        await pressKey('Backspace');
        expect(hidden()).toBe(`["grapheme-${s.k}","grapheme-${s.a}"]`);
    });

    it('a stored "." stays an ordinary IPA entry (text glyph, not a boundary tile)', async () => {
        const s = seed(false);
        await mount([g(s.k), '.', g(s.a)]);
        expect(boundaryTiles()).toHaveLength(0);
        expect(canvasHandle().glyphOrder).toEqual([g(s.k), '.', g(s.a)]);
    });

    it('a stored "‿" stays an ordinary IPA entry (text glyph, not a join tile)', async () => {
        const s = seed(false);
        await mount([g(s.k), JOIN_CHARACTER, g(s.a)]);
        expect(joinTiles()).toHaveLength(0);
        expect(canvasHandle().glyphOrder).toEqual([g(s.k), JOIN_CHARACTER, g(s.a)]);
    });

    it('a pinned spelling round-trips unchanged (scheme off)', async () => {
        const s = seed(false);
        const order = [g(s.k, s.kHead), g(s.a), g(s.t, s.tHead)];
        await mount(order);
        expect(canvasHandle().glyphOrder).toEqual(order);
    });
});

describe('round trip with the scheme on', () => {
    it('a pinned spelling loaded into the canvas round-trips unchanged', async () => {
        const s = seed();
        const order = [g(s.k, s.kHead), g(s.a), '.', g(s.t, s.tHead), g(s.a)];
        await mount(order);
        expect(canvasHandle().glyphOrder).toEqual(order);
        expect(JSON.parse(hidden())).toEqual(order);
        expect(container.querySelectorAll('[data-pinned="true"]')).toHaveLength(2);
        // Loading is not an edit: no change was reported.
        expect(latestOrder).toBeNull();
    });

    it('setGlyphOrder keeps pins', async () => {
        const s = seed();
        await mount([]);
        const order = [g(s.t, s.tHead), g(s.a)];
        await act(async () => { canvasHandle().setGlyphOrder(order); });
        await settle(3);
        expect(canvasHandle().glyphOrder).toEqual(order);
        expect(JSON.parse(hidden())).toEqual(order);
    });
});

// =============================================================================
// 6. SELECTION MODEL (pure)
// =============================================================================

describe('selection model: pins follow their entries', () => {
    const pinned = { ids: [1, 1, 2], pins: [7, null, null] };

    it('append: insert and backspace keep pins aligned', () => {
        const strategy = createAppendStrategy();
        const inserted = insertWithStrategy(strategy, pinned, 3, null);
        expect(inserted.selection).toEqual({ ids: [1, 1, 2, 3], pins: [7, null, null, null] });
        const removed = removeWithStrategy(strategy, pinned, null);
        expect(removed.selection).toEqual({ ids: [1, 1], pins: [7, null] });
    });

    it('prepend: removing the FIRST of two identical entries drops ITS pin, not the other\'s', () => {
        const strategy = createPrependStrategy();
        const removed = removeWithStrategy(strategy, pinned, null);
        expect(removed.selection).toEqual({ ids: [1, 2], pins: [null, null] });
        const inserted = insertWithStrategy(strategy, pinned, 9, null);
        expect(inserted.selection).toEqual({ ids: [9, 1, 1, 2], pins: [null, 7, null, null] });
    });

    it('cursor: insert in the middle shifts later pins', () => {
        const strategy = createCursorStrategy();
        const out = insertWithStrategy(strategy, { ids: [1, 2, 3], pins: [null, null, 5] }, 9, 1);
        expect(out.selection).toEqual({ ids: [1, 9, 2, 3], pins: [null, null, null, 5] });
        expect(out.cursor).toBe(2);
    });

    it('an id-aware strategy falls back to prefix/suffix agreement, never guessing', () => {
        // Replaces the whole selection with a sorted copy — ids matter to it.
        const sorting: InsertionStrategy = {
            name: 'sorting',
            insert: (sel, id) => ({ selection: [...sel, id].sort((x, y) => x - y), cursor: null }),
            remove: (sel) => ({ selection: sel.slice(0, -1), cursor: null }),
            clear: () => ({ selection: [], cursor: null }),
        };
        const out = insertWithStrategy(sorting, { ids: [5, 8], pins: [50, 80] }, 6, null);
        expect(out.selection.ids).toEqual([5, 6, 8]);
        expect(out.selection.pins).toEqual([50, null, 80]);
    });

    it('setPinAt / insertAt / removeAt', () => {
        const base = selectionFromIds([1, 2]);
        const withPin = setPinAt(base, 1, 4);
        expect(withPin).toEqual({ ids: [1, 2], pins: [null, 4] });
        expect(withPin.ids).not.toBe(base.ids); // a new identity: the change effect must run
        expect(setPinAt(base, 5, 4)).toBe(base);
        expect(insertAt(withPin, 1, -3)).toEqual({ ids: [1, -3, 2], pins: [null, null, 4] });
        expect(removeAt(insertAt(withPin, 1, -3), 1)).toEqual(withPin);
    });
});

// =============================================================================
// KEYBOARD INSERTION POINT + MISSING-GROUP NOTE (E2E follow-ups)
// =============================================================================

/** The focusable spelling canvas (only present when the cursor is enabled). */
const canvasGroup = () => container.querySelector<HTMLElement>('[role="group"][tabindex="0"]');

async function canvasKey(key: string) {
    const el = canvasGroup();
    expect(el).not.toBeNull();
    await act(async () => {
        el!.focus();
        el!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
    await settle(2);
}

describe('the canvas insertion point', () => {
    it('← moves it; "." then inserts the boundary THERE, not at the end', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a), g(s.t), g(s.a)]);
        await canvasKey('ArrowLeft');
        await canvasKey('ArrowLeft');
        await openKeyboard();
        await pressKey('.');
        expect(JSON.parse(hidden())).toEqual([g(s.k), g(s.a), '.', g(s.t), g(s.a)]);
        expect(outlines()).toEqual(['0,1', '3,4']);
    });

    it('Backspace removes the glyph BEFORE the insertion point, keeping later pins', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a), g(s.t, s.tHead)]);
        await canvasKey('ArrowLeft'); // before t
        await openKeyboard();
        await pressKey('Backspace'); // removes a
        expect(JSON.parse(hidden())).toEqual([g(s.k), g(s.t, s.tHead)]);
    });

    it('Home jumps to the start; End goes back to appending', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a)]);
        await canvasKey('Home');
        await openKeyboard();
        await pressKey('.');
        expect(JSON.parse(hidden())).toEqual(['.', g(s.k), g(s.a)]);
        await canvasKey('End');
        await pressKey('.');
        expect(JSON.parse(hidden())).toEqual(['.', g(s.k), g(s.a), '.']);
    });

    it('draws a caret while the keyboard is open, and announces the position when focused', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a)]);
        expect(container.querySelector('[data-canvas-caret]')).toBeNull();
        await canvasKey('ArrowLeft');
        expect(container.querySelector('[data-canvas-caret]')).not.toBeNull();
        expect(canvasGroup()!.textContent).toContain('Insertion point after 1 of 2');
        await openKeyboard();
        expect(container.querySelector('[data-canvas-caret]')).not.toBeNull();
    });

    // Regression (live E2E): the pan surface prevents the default on
    // pointerdown, which cancelled focus-on-click — the arrows then did nothing.
    it('a press on the canvas focuses it; a press on a block caption button does not', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a), g(s.t)]);
        const surface = canvasGroup()!.querySelector('svg')!;
        await act(async () => {
            surface.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
        });
        expect(document.activeElement).toBe(canvasGroup());
        (document.activeElement as HTMLElement).blur();
        await act(async () => {
            blockButton('CVC').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
        });
        expect(document.activeElement).not.toBe(canvasGroup());
    });

    /** Tap tile `source` at `fraction` of its width (happy-dom has no layout: stub the box). */
    async function tapTile(source: number, fraction: number, dragPx = 0) {
        const tile = container.querySelector<SVGGElement>(`[data-tile-source="${source}"]`);
        expect(tile).not.toBeNull();
        tile!.getBoundingClientRect = () => ({ left: 100, top: 0, width: 40, height: 40, right: 140, bottom: 40, x: 100, y: 0, toJSON: () => ({}) });
        const x = 100 + 40 * fraction;
        await act(async () => {
            tile!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 20 }));
            tile!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x + dragPx, clientY: 20 }));
        });
        await settle(2);
    }

    it('tapping a tile\'s trailing half puts the caret after it; the leading half, before it', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a), g(s.t)]);
        await tapTile(1, 0.75); // after a
        await openKeyboard();
        await pressKey('.');
        expect(JSON.parse(hidden())).toEqual([g(s.k), g(s.a), '.', g(s.t)]);
        await tapTile(0, 0.25); // before k
        await pressKey('.');
        expect(JSON.parse(hidden())).toEqual(['.', g(s.k), g(s.a), '.', g(s.t)]);
    });

    it('a press that moved (a pan) does not move the caret', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a), g(s.t)]);
        await tapTile(0, 0.25, 30);
        await openKeyboard();
        await pressKey('.');
        expect(JSON.parse(hidden())).toEqual([g(s.k), g(s.a), g(s.t), '.']);
    });

    it('the block outline still opens the popover from its border', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a), g(s.t)]);
        const hit = container.querySelector<SVGRectElement>('[data-block-key] rect:last-of-type');
        expect(hit).not.toBeNull();
        await act(async () => { hit!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        await settle(3);
        expect(popover()).not.toBeNull();
    });

    it('the locked (auto-spelled) canvas is not focusable and has no cursor', async () => {
        const s = seed();
        await mount([g(s.k), g(s.a)], { glyphOrder: [g(s.k), g(s.a)], message: 'Auto-spell is on', tooltip: 'Auto-spell is on' });
        expect(canvasGroup()).toBeNull();
    });
});

describe('the block popover — a sign with no form in the slot\'s group', () => {
    it('says Auto draws the DEFAULT form, and explains why', async () => {
        const s = seed();
        const pGlyph = etymologApi.glyph.create({ name: 'p-default', svg_data: svgOf('p-default') }).data!.id;
        const p = etymologApi.grapheme.create({
            name: 'p',
            glyphs: [{ glyph_id: pGlyph, position: 0 }],
            phonemes: [{ phoneme: 'p', use_in_auto_spelling: true }],
        }).data!.id;
        await mount([g(p), g(s.a), g(s.t)]);
        await click(blockButton('CVC'));
        const onset = document.querySelector<HTMLSelectElement>('select[aria-label="Form of p (Onset)"]')!;
        expect(onset.options[0].textContent).toBe('Auto (default form — no head form)');
        const note = document.querySelector('[data-testid="missing-group-note"]');
        expect(note?.textContent).toContain('p has no “head” form');
        // k HAS a head form: its slot keeps the plain "Auto (head)" and no note.
        expect(document.querySelectorAll('[data-testid="missing-group-note"]')).toHaveLength(1);
    });
});
