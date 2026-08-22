// @vitest-environment happy-dom
/**
 * LexiconViewPage — the dead ends and the naming.
 *
 *  - A bad id and a missing word both used to be a bare `<p>` with a naked link
 *    under it. Both are now an `EmptyState` with a real action.
 *  - Delete goes through the ONE app-wide confirmation dialog and only calls the
 *    API once the user confirms — cancelling must delete nothing.
 *  - The page title and the delete confirmation NAME THE SAME STRING. They did
 *    not: the heading used `pronunciation ?? lemma` while the dialog asked about
 *    `lemma`, so on any word where the two differ the confirmation was about a
 *    word the user was not looking at. `lexiconDisplayName` is now the single
 *    rule, imported by both.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

/**
 * A word whose pronunciation and lemma DIFFER — the case where the old title
 * and the old confirmation named two different strings.
 */
const WORD = {
    id: 7,
    lemma: 'kat',
    pronunciation: 'kato',
    is_native: true,
    auto_spell: false,
    meaning: null,
    meanings: [],
    ancestors: [],
    descendants: [],
    spelling: [],
    spellingDisplay: [],
    glyph_order: '[]',
    hasIpaFallbacks: false,
    needs_attention: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
};

const getByIdComplete = vi.fn();
const getAncestryTree = vi.fn(() => ({ success: true, data: null }));
const remove = vi.fn(() => ({ success: true, data: null }));
const refresh = vi.fn();

vi.mock('../../../../db', () => ({
    useEtymolog: () => ({
        api: {
            lexicon: {
                getByIdComplete,
                getAncestryTree,
                delete: remove,
            },
        },
        data: { graphemesComplete: [] },
        settings: { defaultGalleryView: 'detailed' },
        refresh,
        isReady: true,
        error: null,
    }),
}));

// The detailed display renders a whole glyph canvas; the view page's contract
// is what it puts AROUND that, and the display has its own tests.
vi.mock('../../../display/lexicon/detailed', () => ({
    DetailedLexiconDisplay: () => <p>detailed display</p>,
}));

const { default: LexiconViewPage } = await import('../viewLexicon/LexiconViewPage');
const { NotificationProvider } = await import('../../../shared/notifications/NotificationProvider');
const { default: ConfirmDialogProvider } = await import(
    '../../../shared/confirmDialog/ConfirmDialogProvider'
);

let container: HTMLDivElement;
let root: Root;

function Probe() {
    const { pathname } = useLocation();
    return <p data-testid="pathname">{pathname}</p>;
}

function mount(path = '/lexicon/db/7') {
    act(() => {
        root.render(
            <MemoryRouter initialEntries={[path]}>
                <NotificationProvider>
                    <ConfirmDialogProvider>
                        <Probe />
                        <Routes>
                            <Route path="/lexicon/db/:id" element={<LexiconViewPage />} />
                            <Route path="/lexicon" element={<p>list page</p>} />
                        </Routes>
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
    getByIdComplete.mockReturnValue({ success: true, data: WORD });
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

const text = () => container.textContent ?? '';
const pathname = () => container.querySelector('[data-testid="pathname"]')?.textContent;

/** The confirm dialog portals out of `container`. */
const confirmAction = (which: 'confirm' | 'cancel') =>
    document.body.querySelector(`[data-confirmation-action="${which}"]`) as HTMLElement | null;

const deleteButton = () =>
    Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent ?? '').includes('Delete'),
    ) as HTMLButtonElement;

describe('LexiconViewPage — dead ends', () => {
    it('shows an EmptyState with a way back when the word does not exist', () => {
        getByIdComplete.mockReturnValue({ success: true, data: null });
        mount();

        expect(text()).toContain('That word does not exist');
        const back = container.querySelector('a[href="/lexicon"]');
        expect(back).not.toBeNull();
        expect(back?.textContent).toBe('Back to Lexicon');
    });

    it('shows an EmptyState when the id is not a number at all', () => {
        mount('/lexicon/db/not-an-id');

        expect(text()).toContain('That is not a word id');
        expect(getByIdComplete).not.toHaveBeenCalled();
        expect(container.querySelector('a[href="/lexicon"]')).not.toBeNull();
    });
});

describe('LexiconViewPage — delete', () => {
    it('asks first, and does nothing at all when the user cancels', async () => {
        mount();

        await act(async () => {
            deleteButton().click();
        });

        expect(confirmAction('confirm')).not.toBeNull();
        expect(remove).not.toHaveBeenCalled();

        await act(async () => {
            confirmAction('cancel')!.click();
        });

        expect(remove).not.toHaveBeenCalled();
        expect(pathname()).toBe('/lexicon/db/7');
    });

    it('calls api.lexicon.delete and returns to the list once confirmed', async () => {
        mount();

        await act(async () => {
            deleteButton().click();
        });
        await act(async () => {
            confirmAction('confirm')!.click();
        });

        expect(remove).toHaveBeenCalledTimes(1);
        expect(remove).toHaveBeenCalledWith(7);
        expect(refresh).toHaveBeenCalled();
        expect(pathname()).toBe('/lexicon');
    });
});

describe('LexiconViewPage — one display name', () => {
    it('titles the page with the pronunciation, not the lemma', () => {
        mount();

        const heading = container.querySelector('h2');
        expect(heading?.textContent).toBe('kato');
        expect(heading?.textContent).not.toBe('kat');
    });

    it('names the SAME string in the delete confirmation', async () => {
        mount();

        await act(async () => {
            deleteButton().click();
        });

        const dialog = document.body.textContent ?? '';
        expect(dialog).toContain('Delete word "kato"?');
        // The regression: the dialog used to ask about the lemma.
        expect(dialog).not.toContain('Delete word "kat"?');
    });
});

describe('LexiconViewPage — etymology', () => {
    it('offers "Add ancestors" instead of a sentence when there is no etymology', () => {
        mount();

        expect(text()).toContain('No ancestors recorded');
        const add = container.querySelector('a[href="/lexicon/db/7/edit"]');
        expect(add).not.toBeNull();
    });

    it('links Edit to the edit ROUTE rather than toggling an in-page mode', () => {
        mount();

        const edit = Array.from(container.querySelectorAll('a')).find(
            (a) => a.getAttribute('href') === '/lexicon/db/7/edit',
        );
        expect(edit).toBeDefined();
    });
});
