// @vitest-environment happy-dom
/**
 * Mount harness for the word-generator suites.
 *
 * The generator is PRESENTATION plus arithmetic over a settings key, so these
 * suites mock the database context rather than booting sql.js: what is under
 * test is what the page does with a profile, and a real database would add a
 * five-second boot and a second thing that can fail.
 *
 * The mock is REACTIVE on purpose. `api.settings.update` really does write to
 * the harness's settings object and really does notify the components reading
 * it, because half of what this phase has to get right is the round trip — a
 * preset click that writes a partial key, or a debounce that writes a stale
 * one, only shows up when the write comes back. A `vi.fn()` that recorded the
 * call and changed nothing would pass either way.
 *
 * Named `harness.tsx` so the `*.test.*` include pattern skips it.
 *
 * @module tabs/lexicon/generator/__tests__/harness
 */

import { vi } from 'vitest';
import { useEffect, useReducer, type ReactNode } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { cloneDefaultWordGeneratorSettings } from '../../../../../generator';
import type {
    AutoSpellEntry,
    AutoSpellResultExtended,
    GraphemeComplete,
    LexiconComplete,
} from '../../../../../db/types';

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

// =============================================================================
// FIXTURES
// =============================================================================

let nextId = 1;

/** A grapheme with one glyph and one phoneme, which is all any of this reads. */
export function grapheme(
    phoneme: string,
    options: { useInAutoSpelling?: boolean; name?: string } = {},
): GraphemeComplete {
    const id = nextId++;
    return {
        id,
        name: options.name ?? phoneme,
        notes: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        glyphs: [
            {
                id: 1000 + id,
                name: `glyph-${id}`,
                svg_data: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
                category: null,
                notes: null,
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-01T00:00:00.000Z',
            },
        ],
        phonemes: [
            {
                id: 2000 + id,
                grapheme_id: id,
                phoneme,
                use_in_auto_spelling: options.useInAutoSpelling ?? true,
                context: null,
            },
        ],
    } as unknown as GraphemeComplete;
}

/** A lexicon row — only `pronunciation` is read by the generator. */
export function word(pronunciation: string): LexiconComplete {
    const id = nextId++;
    return {
        id,
        lemma: pronunciation,
        pronunciation,
        is_native: true,
        auto_spell: true,
        glyph_order: '[]',
        needs_attention: false,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        spelling: [],
        spellingDisplay: [],
        ancestors: [],
        descendants: [],
        meanings: [],
        hasIpaFallbacks: false,
    } as unknown as LexiconComplete;
}

/**
 * A stand-in auto-spell: every character becomes a virtual glyph.
 *
 * Deliberately NOT the real DP matcher — the real one is tested in
 * `db/__tests__/autoSpellService.test.ts`, and what these suites need is a
 * result whose shape is known so the glyph_order that reaches
 * `api.lexicon.create` can be asserted exactly.
 */
export function fakeAutoSpell(pronunciation: string): AutoSpellResultExtended {
    const spelling: AutoSpellEntry[] = Array.from(pronunciation).map((character, position) => ({
        grapheme_id: -(position + 1),
        position,
        isVirtual: true,
        ipaCharacter: character,
    }));
    return {
        success: true,
        spelling,
        segments: Array.from(pronunciation),
        unmatchedParts: [],
        hasVirtualGlyphs: true,
    };
}

// =============================================================================
// THE REACTIVE MOCK CONTEXT
// =============================================================================

export interface HarnessState {
    settings: Record<string, unknown>;
    data: { graphemesComplete: GraphemeComplete[]; lexiconComplete: LexiconComplete[] };
    isReady: boolean;
    error: Error | null;
    /** Set to make `api.settings.update` refuse, the way strict validation does. */
    rejectSettings: string | null;
    /** Pronunciations `api.lexicon.create` should fail on. */
    failCreateFor: Set<string>;
}

function freshState(): HarnessState {
    return {
        settings: {
            defaultGalleryView: 'detailed',
            wordGenerator: cloneDefaultWordGeneratorSettings(),
        },
        data: { graphemesComplete: [], lexiconComplete: [] },
        isReady: true,
        error: null,
        rejectSettings: null,
        failCreateFor: new Set(),
    };
}

export const state: HarnessState = freshState();

const listeners = new Set<() => void>();

/** Tell every mounted component that the harness state changed. */
export function notifyHarness(): void {
    for (const listener of [...listeners]) listener();
}

export const settingsUpdate = vi.fn((patch: Record<string, unknown>) => {
    if (state.rejectSettings) {
        return { success: false, error: { code: 'VALIDATION_ERROR', message: state.rejectSettings } };
    }
    // Wholesale, like the real one: a nested key is REPLACED, not merged —
    // which is exactly why every caller has to spread the whole key.
    state.settings = { ...state.settings, ...patch };
    notifyHarness();
    return { success: true, data: state.settings };
});

export const lexiconCreate = vi.fn((input: { pronunciation?: string }) => {
    if (input.pronunciation && state.failCreateFor.has(input.pronunciation)) {
        return { success: false, error: { code: 'OPERATION_FAILED', message: 'nope' } };
    }
    return { success: true, data: { id: nextId++, ...input } };
});

export const previewAutoSpelling = vi.fn((pronunciation: string) => ({
    success: true,
    data: fakeAutoSpell(pronunciation),
}));

export const refresh = vi.fn();

/**
 * The context's refresh-batching primitive, as a PASS-THROUGH.
 *
 * The real one (`EtymologProvider`) coalesces the per-mutation refreshes the
 * wrapped api fires; this harness's `api` fires none, so there is nothing to
 * coalesce and running `fn` straight through is the faithful stand-in. It is
 * still a spy, so a suite can assert the add loop opened exactly one batch —
 * which is the property that matters here, the coalescing itself being pinned
 * against the real provider in `db/__tests__/EtymologContext.test.tsx`.
 */
export const batchMutations = vi.fn(<T,>(fn: () => T): T => fn());

export const api = {
    settings: { update: settingsUpdate },
    lexicon: { create: lexiconCreate, previewAutoSpelling },
};

/**
 * The mocked `useEtymolog`.
 *
 * A real hook, not a plain getter: it subscribes to the harness so a write
 * through `api.settings.update` re-renders the tree, which is what makes the
 * settings round trip observable.
 */
export function useHarnessEtymolog() {
    const [, force] = useReducer((tick: number) => tick + 1, 0);
    useEffect(() => {
        listeners.add(force);
        return () => {
            listeners.delete(force);
        };
    }, []);

    return {
        api,
        data: state.data,
        settings: state.settings,
        refresh,
        batchMutations,
        isReady: state.isReady,
        error: state.error,
    };
}

/** The whole `../../../../../db` module, mocked. */
export const dbModuleMock = { useEtymolog: useHarnessEtymolog };

/** Put the harness back to a clean state. Call from `beforeEach`. */
export function resetHarness(): void {
    Object.assign(state, freshState());
    settingsUpdate.mockClear();
    lexiconCreate.mockClear();
    previewAutoSpelling.mockClear();
    refresh.mockClear();
    batchMutations.mockClear();
}

/** The `wordGenerator` key as the harness currently holds it. */
export function storedWordGenerator(): Record<string, unknown> {
    return state.settings.wordGenerator as Record<string, unknown>;
}

/** The stored profile. */
export function storedProfile(): Record<string, unknown> {
    return storedWordGenerator().profile as Record<string, unknown>;
}

// =============================================================================
// MOUNTING
// =============================================================================

export interface Mounted {
    container: HTMLDivElement;
    root: Root;
    text: () => string;
    rerender: (children: ReactNode) => void;
    unmount: () => void;
}

/** Render `children` under a router and the notification provider. */
export function mount(children: ReactNode, path = '/lexicon/generate'): Mounted {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const tree = (next: ReactNode) => (
        <MemoryRouter initialEntries={[path]}>{next}</MemoryRouter>
    );

    act(() => {
        root.render(tree(children));
    });

    return {
        container,
        root,
        text: () => container.textContent ?? '',
        rerender: (next: ReactNode) => {
            act(() => {
                root.render(tree(next));
            });
        },
        unmount: () => {
            try {
                act(() => root.unmount());
            } catch {
                /* already unmounted */
            }
            container.parentNode?.removeChild(container);
        },
    };
}

/** Flush effects and timers between interactions. */
export async function settle(times = 2): Promise<void> {
    for (let index = 0; index < times; index++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }
}

/**
 * Wait past the profile write debounce.
 *
 * Real timers, not fake ones: the debounce is a `setTimeout` inside a hook
 * whose cleanup also runs on unmount, and swapping the clock out from under
 * React's own scheduling has produced more flake in this repo than the third of
 * a second it saves.
 */
export async function waitForWrite(ms = 320): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, ms));
    });
}

/** Click an element inside `act`. */
export function click(element: Element | null | undefined): void {
    if (!element) throw new Error('click(): nothing to click');
    act(() => {
        (element as HTMLElement).click();
    });
}

/** Type into a controlled input the way React hears it. */
export function type(input: Element | null | undefined, value: string): void {
    if (!input) throw new Error('type(): no input');
    const element = input as HTMLInputElement;
    act(() => {
        // The native setter, because React installs its own on the instance and
        // reads `_valueTracker` to decide whether the value really changed.
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
        )?.set;
        setter?.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

/** Blur an input inside `act`. */
export function blur(input: Element | null | undefined): void {
    if (!input) throw new Error('blur(): no input');
    act(() => {
        (input as HTMLElement).dispatchEvent(new FocusEvent('blur', { bubbles: false }));
        (input as HTMLElement).dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
}

/** Every button whose visible text matches. */
export function buttons(scope: ParentNode, text: string): HTMLButtonElement[] {
    return Array.from(scope.querySelectorAll('button')).filter(
        (button) => (button.textContent ?? '').trim() === text,
    );
}

/** The first button whose visible text matches, or `undefined`. */
export function button(scope: ParentNode, text: string): HTMLButtonElement | undefined {
    return buttons(scope, text)[0];
}

/** The first element matching a selector, typed. */
export function query<T extends Element>(scope: ParentNode, selector: string): T | null {
    return scope.querySelector<T>(selector);
}
