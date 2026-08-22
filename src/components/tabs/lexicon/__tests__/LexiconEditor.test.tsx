// @vitest-environment happy-dom
/**
 * LexiconEditor — one form, two modes, and the unsaved-changes wiring.
 *
 * What is pinned here:
 *
 *  - create mode goes through `api.lexicon.create` and lands on the new word's
 *    VIEW route (it used to `console.error` on failure and navigate on success
 *    with no message either way);
 *  - edit mode hands the word to the fields as `initialData` and updates the
 *    existing row rather than creating a second one;
 *  - the editor REGISTERS its dirty state with `UnsavedChangesRegistry`, and
 *    stops being dirty once the save lands. That registration is the only thing
 *    standing between a half-typed word and a primary-nav tab click —
 *    `NavigationGuard` cannot see a react-router navigation, because it never
 *    passes through an anchor.
 *
 * `LexiconFormFields` is stubbed with a single real SmartForm-registered input.
 * The composite inputs it normally renders (a drawing canvas, a meanings table,
 * an ancestry picker) are three separate components with their own tests; what
 * is under test here is the EDITOR's contract with them.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

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
const update = vi.fn(() => ({ success: true, data: { id: 7 } }));
const updateAncestry = vi.fn(() => ({ success: true, data: null }));

/** The arguments one of the zero-arg mocks above was actually called with. */
const argsOf = (mock: { mock: { calls: unknown[][] } }, call = 0): unknown[] =>
    mock.mock.calls[call] as unknown[];
const refresh = vi.fn();

vi.mock('../../../../db', () => ({
    useEtymolog: () => ({
        api: { lexicon: { create, update, updateAncestry } },
        data: { lexiconComplete: [], graphemesComplete: [] },
        settings: { defaultGalleryView: 'detailed' },
        refresh,
        isReady: true,
        error: null,
    }),
}));

/** Captured on every render so the test can inspect what the editor passed. */
let fieldsProps: Record<string, unknown> | null = null;

vi.mock('../../../form/lexiconForm', () => ({
    LexiconFormFields: (props: Record<string, unknown>) => {
        fieldsProps = props;
        const registerField = props.registerField as (
            name: string,
            options: Record<string, unknown>,
        ) => { registerSmartFieldProps: Record<string, unknown> };
        // `defaultValue` is forwarded exactly as the real fields component
        // forwards it, because the prefill's whole contract is about what
        // SmartForm does with a seeded value: it fills the field and marks it
        // non-empty WITHOUT marking the form changed.
        const field = registerField('pronunciation', {
            defaultValue: props.initialPronunciation,
        });
        return (
            <input
                data-testid="pronunciation"
                {...(field.registerSmartFieldProps as object)}
            />
        );
    },
}));

const { default: LexiconEditor } = await import('../editor/LexiconEditor');
const { NotificationProvider } = await import('../../../shared/notifications/NotificationProvider');
const { default: ConfirmDialogProvider } = await import(
    '../../../shared/confirmDialog/ConfirmDialogProvider'
);
const { UnsavedChangesRegistry, useUnsavedChanges } = await import(
    '../../../shell/unsavedChanges'
);

let container: HTMLDivElement;
let root: Root;
let dirtyProbe: () => boolean = () => false;

function Probe() {
    const { isDirty } = useUnsavedChanges();
    const { pathname } = useLocation();
    // In an effect, not during render: assigning to a module-level binding
    // while rendering is a side effect, and React may run a render twice.
    useEffect(() => {
        dirtyProbe = isDirty;
    }, [isDirty]);
    return <p data-testid="pathname">{pathname}</p>;
}

function mount(element: React.ReactNode, initialPath = '/lexicon/create') {
    act(() => {
        root.render(
            <MemoryRouter initialEntries={[initialPath]}>
                <NotificationProvider>
                    <ConfirmDialogProvider>
                        <UnsavedChangesRegistry>
                            <Probe />
                            <Routes>
                                <Route path="/lexicon/create" element={element} />
                                <Route path="/lexicon/db/:id/edit" element={element} />
                                <Route path="/lexicon/db/:id" element={<p>view page</p>} />
                                <Route path="/lexicon" element={<p>list</p>} />
                            </Routes>
                        </UnsavedChangesRegistry>
                    </ConfirmDialogProvider>
                </NotificationProvider>
            </MemoryRouter>,
        );
    });
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    fieldsProps = null;
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

const input = () => container.querySelector('[data-testid="pronunciation"]') as HTMLInputElement;
const form = () => container.querySelector('form') as HTMLFormElement;
const pathname = () => container.querySelector('[data-testid="pathname"]')?.textContent;

/** Type into the SmartForm-registered input the way a user would. */
function type(value: string) {
    act(() => {
        const el = input();
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

async function submit() {
    await act(async () => {
        form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await Promise.resolve();
    });
    // Let the async submit pipeline settle.
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}

const WORD = {
    id: 7,
    lemma: 'sona',
    pronunciation: 'sona',
    is_native: true,
    auto_spell: false,
    meaning: null,
    meanings: [],
    ancestors: [],
    descendants: [],
    spelling: [],
    glyph_order: '[]',
    needs_attention: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
} as never;

describe('LexiconEditor — create mode', () => {
    it('submits through api.lexicon.create and navigates to the new word', async () => {
        mount(<LexiconEditor mode="create" />);
        type('kato');
        await submit();

        expect(create).toHaveBeenCalledTimes(1);
        expect(update).not.toHaveBeenCalled();
        expect(argsOf(create)[0]).toMatchObject({ pronunciation: 'kato' });
        expect(refresh).toHaveBeenCalled();
        expect(pathname()).toBe('/lexicon/db/42');
    });

    it('titles itself "New word" and offers Cancel back to the list', () => {
        mount(<LexiconEditor mode="create" />);

        expect(container.textContent).toContain('New word');
        const cancel = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent === 'Cancel',
        );
        expect(cancel).toBeDefined();

        act(() => cancel!.click());
        expect(pathname()).toBe('/lexicon');
    });

    it('passes no initialData to the fields', () => {
        mount(<LexiconEditor mode="create" />);
        expect(fieldsProps?.mode).toBe('create');
        expect(fieldsProps?.initialData).toBeUndefined();
    });
});

describe('LexiconEditor — edit mode', () => {
    it('hands the existing word to the fields as initialData', () => {
        mount(<LexiconEditor mode="edit" initialData={WORD} />, '/lexicon/db/7/edit');

        expect(fieldsProps?.mode).toBe('edit');
        expect(fieldsProps?.initialData).toMatchObject({ id: 7, lemma: 'sona' });
        expect(container.textContent).toContain('Edit sona');
    });

    it('updates the existing row and its ancestry, then returns to the word', async () => {
        mount(<LexiconEditor mode="edit" initialData={WORD} />, '/lexicon/db/7/edit');
        type('sonu');
        await submit();

        expect(create).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledTimes(1);
        expect(argsOf(update)[0]).toBe(7);
        expect(argsOf(update)[1]).toMatchObject({ pronunciation: 'sonu' });
        expect(updateAncestry).toHaveBeenCalledTimes(1);
        expect(pathname()).toBe('/lexicon/db/7');
    });

    it('cancels back to the word being edited, not to the list', () => {
        mount(<LexiconEditor mode="edit" initialData={WORD} />, '/lexicon/db/7/edit');

        const cancel = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent === 'Cancel',
        );
        act(() => cancel!.click());
        expect(pathname()).toBe('/lexicon/db/7');
    });
});

describe('LexiconEditor — unsaved-changes registration', () => {
    it('is not dirty on mount', () => {
        mount(<LexiconEditor mode="create" />);
        expect(dirtyProbe()).toBe(false);
    });

    it('registers as dirty once the form is changed', () => {
        mount(<LexiconEditor mode="create" />);
        type('kato');
        expect(dirtyProbe()).toBe(true);
    });

    it('clears the registration once the save has landed', async () => {
        mount(<LexiconEditor mode="create" />);
        type('kato');
        expect(dirtyProbe()).toBe(true);

        await submit();

        // The editor unmounted on navigation, and unmounting unregisters — so a
        // successful save cannot leave a stale "dirty" behind that would prompt
        // the user on their very next navigation.
        expect(dirtyProbe()).toBe(false);
    });
});

describe('LexiconEditor — ?pronunciation= prefill', () => {
    it('hands the query value to the fields in create mode', () => {
        mount(<LexiconEditor mode="create" />, '/lexicon/create?pronunciation=kato');
        expect(fieldsProps?.initialPronunciation).toBe('kato');
        expect(input().value).toBe('kato');
    });

    it('decodes a percent-encoded pronunciation', () => {
        // The generator encodes what it links with; `useSearchParams` decodes.
        mount(<LexiconEditor mode="create" />, '/lexicon/create?pronunciation=ka%CB%90ta');
        expect(fieldsProps?.initialPronunciation).toBe('kaːta');
    });

    it('is NOT dirty — a link the user followed is not an edit they made', () => {
        mount(<LexiconEditor mode="create" />, '/lexicon/create?pronunciation=kato');
        // The leave guard must stay quiet: nothing has been typed, and being
        // asked to confirm discarding a word you never wrote is the bug.
        expect(dirtyProbe()).toBe(false);
    });

    it('becomes dirty as soon as the user types', () => {
        mount(<LexiconEditor mode="create" />, '/lexicon/create?pronunciation=kato');
        expect(dirtyProbe()).toBe(false);
        type('katoni');
        expect(dirtyProbe()).toBe(true);
    });

    it('submits the prefilled value without it being retyped', async () => {
        mount(<LexiconEditor mode="create" />, '/lexicon/create?pronunciation=kato');
        await submit();

        expect(create).toHaveBeenCalledTimes(1);
        expect(argsOf(create)[0]).toMatchObject({ pronunciation: 'kato' });
    });

    it('ignores the parameter in edit mode', () => {
        mount(
            <LexiconEditor mode="edit" initialData={WORD} />,
            '/lexicon/db/7/edit?pronunciation=kato',
        );
        // The stored word owns the field there; a query string must not be
        // able to silently rewrite a word being edited.
        expect(fieldsProps?.initialPronunciation).toBeUndefined();
    });

    it('passes nothing when there is no parameter', () => {
        mount(<LexiconEditor mode="create" />);
        expect(fieldsProps?.initialPronunciation).toBeUndefined();
    });
});
