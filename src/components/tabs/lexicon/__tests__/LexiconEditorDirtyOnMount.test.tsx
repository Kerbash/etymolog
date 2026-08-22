// @vitest-environment happy-dom
/**
 * LexiconEditor — the create form must NOT be dirty on mount.
 *
 * `LexiconEditor.test.tsx` and `pronunciationPrefill.test.tsx` both STUB the
 * three composite inputs (glyph canvas, meanings table, ancestry picker), which
 * is why neither of them ever saw the bug this file pins: a freshly loaded,
 * untouched create form armed `NavigationGuard`, so leaving the page — e.g.
 * straight after the generator's "Edit & add" — asked "Leave site?".
 *
 * Two things are therefore deliberately different here:
 *
 *  - the REAL `LexiconFormFields` is mounted, composite inputs and all; and
 *  - the tree is wrapped in `<StrictMode>`, because `src/main.tsx` wraps the
 *    real app in it. StrictMode double-invokes every mount effect
 *    (create → destroy → create) while KEEPING the component's refs, so an
 *    effect that guards itself with a `useRef(true)` "is this the first render"
 *    latch runs its body on the second invocation. That is exactly what marked
 *    the untouched form changed in Chrome and could never happen in a
 *    non-strict test.
 *
 * The dirty flag is read through BOTH surfaces it is published on, because they
 * cover disjoint exits (see the `LexiconEditor` header comment):
 *
 *  - `UnsavedChangesRegistry.isDirty()` — in-app react-router navigation;
 *  - a cancelable `beforeunload` on `window` — the document-level guard. The
 *    handler is only attached while `NavigationGuard active` is true, so
 *    `defaultPrevented` is a faithful proxy for the prop, checked the same way
 *    the browser reproduction checks it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode, useEffect } from 'react';
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

const create = vi.fn(() => ({
    success: true,
    data: { id: 42, lemma: 'kato', pronunciation: 'kato' },
}));
const previewAutoSpelling = vi.fn(() => ({
    success: true,
    data: { success: true, spelling: [], segments: [], unmatchedParts: [], hasVirtualGlyphs: false },
}));

/**
 * The database context, mocked richly enough for the REAL fields component:
 * the ancestry section calls three read APIs on mount and the glyph canvas
 * reads `data.graphemesComplete`.
 */
vi.mock('../../../../db', () => ({
    useEtymolog: () => ({
        api: {
            lexicon: {
                create,
                update: vi.fn(() => ({ success: true, data: { id: 7 } })),
                updateAncestry: vi.fn(() => ({ success: true, data: null })),
                previewAutoSpelling,
                wouldCreateCycle: () => ({ success: true, data: false }),
                getAllDescendantIds: () => ({ success: true, data: [] }),
                getAncestryTree: () => ({ success: true, data: null }),
            },
        },
        data: { lexiconComplete: [], graphemesComplete: [] },
        settings: { defaultGalleryView: 'detailed' },
        refresh: vi.fn(),
        batchMutations: <T,>(fn: () => T): T => fn(),
        isReady: true,
        error: null,
    }),
}));

const { default: LexiconEditor } = await import('../editor/LexiconEditor');
const { NotificationProvider } = await import('../../../shared/notifications/NotificationProvider');
const { default: ConfirmDialogProvider } = await import(
    '../../../shared/confirmDialog/ConfirmDialogProvider'
);
const { UnsavedChangesRegistry, useUnsavedChanges } = await import('../../../shell/unsavedChanges');

let container: HTMLDivElement;
let root: Root;
let dirtyProbe: () => boolean = () => false;

function Probe() {
    const { isDirty } = useUnsavedChanges();
    useEffect(() => {
        dirtyProbe = isDirty;
    }, [isDirty]);
    return null;
}

/** Mount the editor the way `main.tsx` does — inside `<StrictMode>`. */
function mount(initialPath: string) {
    act(() => {
        root.render(
            <StrictMode>
                <MemoryRouter initialEntries={[initialPath]}>
                    <NotificationProvider>
                        <ConfirmDialogProvider>
                            <UnsavedChangesRegistry>
                                <Probe />
                                <Routes>
                                    <Route
                                        path="/lexicon/create"
                                        element={<LexiconEditor mode="create" />}
                                    />
                                    <Route path="/lexicon/db/:id" element={<p>view page</p>} />
                                    <Route path="/lexicon" element={<p>list</p>} />
                                </Routes>
                            </UnsavedChangesRegistry>
                        </ConfirmDialogProvider>
                    </NotificationProvider>
                </MemoryRouter>
            </StrictMode>,
        );
    });
}

/** Flush effects AND the deferred `setTimeout(…, 0)` the prefill runs in. */
async function settle(times = 3) {
    for (let index = 0; index < times; index++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }
}

/**
 * Whether a document-level exit would be blocked right now.
 *
 * `NavigationGuard` attaches its `beforeunload` handler only while `active` is
 * true, so this is the prop, observed through the behaviour that matters. It is
 * also the exact check used against the real dev server in Chrome.
 */
function beforeUnloadIsBlocked(): boolean {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
}

/** The pronunciation input — the first text input the form renders. */
function pronunciationInput(): HTMLInputElement {
    const input = container.querySelector<HTMLInputElement>(
        'input[type="text"], input:not([type])',
    );
    if (!input) throw new Error('no pronunciation input');
    return input;
}

function typeInto(input: HTMLInputElement, value: string) {
    act(() => {
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
        )?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    dirtyProbe = () => false;
});

afterEach(() => {
    try {
        act(() => root.unmount());
    } catch {
        /* already unmounted */
    }
    container.parentNode?.removeChild(container);
    vi.clearAllMocks();
});

describe('LexiconEditor — an untouched create form is not dirty (StrictMode, real fields)', () => {
    it('is clean on mount with no query string', async () => {
        mount('/lexicon/create');
        await settle();

        expect(dirtyProbe()).toBe(false);
        expect(beforeUnloadIsBlocked()).toBe(false);
    });

    it('is clean on mount after the generator prefill', async () => {
        mount('/lexicon/create?pronunciation=kato');
        await settle();

        // The prefill lands in a deferred `setTimeout`; `settle()` has run it.
        expect(pronunciationInput().value).toBe('kato');
        expect(dirtyProbe()).toBe(false);
        expect(beforeUnloadIsBlocked()).toBe(false);
    });

    it('stays clean while nothing happens', async () => {
        mount('/lexicon/create?pronunciation=kato');
        await settle(6);

        expect(dirtyProbe()).toBe(false);
        expect(beforeUnloadIsBlocked()).toBe(false);
    });

    it('becomes dirty once the pronunciation is typed into', async () => {
        mount('/lexicon/create?pronunciation=kato');
        await settle();
        expect(dirtyProbe()).toBe(false);

        typeInto(pronunciationInput(), 'katoni');
        await settle();

        expect(dirtyProbe()).toBe(true);
        expect(beforeUnloadIsBlocked()).toBe(true);
    });

    it('becomes dirty once a meaning is typed into', async () => {
        mount('/lexicon/create');
        await settle();
        expect(dirtyProbe()).toBe(false);

        // The meanings table starts with one blank row; its text inputs come
        // after the pronunciation input in document order. Typing into a row
        // does NOT change the table's `rows`, so this exercises the inner
        // form's dirty flag being mirrored onto the outer field.
        const inputs = Array.from(
            container.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])'),
        );
        const meaningInput = inputs[1];
        expect(meaningInput).toBeTruthy();

        typeInto(meaningInput, 'cat');
        await settle();

        expect(dirtyProbe()).toBe(true);
        expect(beforeUnloadIsBlocked()).toBe(true);
    });

    it('becomes dirty once a meaning row is added', async () => {
        mount('/lexicon/create');
        await settle();
        expect(dirtyProbe()).toBe(false);

        const addMeaning = container.querySelector<HTMLElement>('[aria-label="Add Meaning"]');
        expect(addMeaning).toBeTruthy();
        act(() => addMeaning!.click());
        await settle();

        expect(dirtyProbe()).toBe(true);
        expect(beforeUnloadIsBlocked()).toBe(true);
    });
});
