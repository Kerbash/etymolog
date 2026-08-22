// @vitest-environment happy-dom
/**
 * EntityGallery — the four things the three hand-rolled galleries each got
 * wrong in a different way.
 *
 *  1. TWO empty states, told apart. "No words yet" offers the CTA that makes
 *     one; "nothing matched" offers the way back. Getting the second one wrong
 *     is a dead end — the lexicon's version rendered two sentences and no
 *     control at all.
 *  2. Selection mode is ONE `<button>` per card. The galleries rendered a
 *     `<div role="button">` containing an absolutely-positioned delete
 *     `<button>`: an interactive element inside an interactive element, which
 *     is invalid HTML and gives the accessibility tree two conflicting answers
 *     about what the card is.
 *  3. Every toolbar `<select>` has an accessible name. The lexicon's filter was
 *     a bare `<select>` preceded by a `<span>Filter:</span>`, which names
 *     nothing.
 *  4. A gallery that is not ready yet renders a card SKELETON, not nothing.
 *
 * The database is mocked: none of the above is about SQLite.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;

const matchMediaMock = vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
}));
vi.stubGlobal('matchMedia', matchMediaMock);
vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

vi.mock('../../../../db', () => ({
    useEtymolog: () => ({
        settings: { defaultGalleryView: 'detailed' },
        api: {},
        data: {},
    }),
}));

const { useEffect } = await import('react');
const { default: EntityGallery } = await import('../EntityGallery');
const { useGalleryState } = await import('../useGalleryState');

interface Word {
    id: number;
    name: string;
}

const WORDS: Word[] = [
    { id: 1, name: 'kato' },
    { id: 2, name: 'mira' },
    { id: 3, name: 'sona' },
];

const SORT_OPTIONS = [{ value: 'name-asc', displayComponent: <span>Name</span> }];

const FILTER_OPTIONS = [
    { value: 'all', label: 'All words' },
    { value: 'short', label: 'Short only' },
];

let container: HTMLDivElement;
let root: Root;

interface HarnessProps {
    items?: Word[];
    selectionMode?: boolean;
    onSelect?: (word: Word) => void;
    isReady?: boolean;
    initialQuery?: string;
    withFilter?: boolean;
}

/**
 * Mounts the gallery with real state, and exposes a way to pre-set the query so
 * the "no match" branch can be reached without driving the debounced search
 * input.
 */
function Harness({
    items = WORDS,
    selectionMode = false,
    onSelect,
    isReady = true,
    initialQuery,
    withFilter = true,
}: HarnessProps) {
    const state = useGalleryState({ defaultSort: 'name-asc' });
    const { setQuery } = state;

    useEffect(() => {
        if (initialQuery !== undefined) setQuery(initialQuery);
    }, [initialQuery, setQuery]);

    return (
        <EntityGallery<Word>
            items={items}
            state={state}
            adapters={{
                search: (word, query) => word.name.includes(query),
                filter: (word, filter) => (filter === 'short' ? word.name.length < 4 : true),
                sort: (a, b) => a.name.localeCompare(b.name),
            }}
            keyExtractor={(word) => word.id}
            renderItem={(word) => <span>{word.name}</span>}
            itemLabel={(word) => word.name}
            itemHref={selectionMode ? undefined : (word) => `/lexicon/db/${word.id}`}
            renderActions={
                selectionMode
                    ? undefined
                    : (word) => <button type="button">Delete {word.name}</button>
            }
            selectionMode={selectionMode}
            onSelect={onSelect}
            ariaLabel="Test gallery"
            isReady={isReady}
            sortOptions={SORT_OPTIONS}
            filterOptions={withFilter ? FILTER_OPTIONS : undefined}
            filterLabel="Word origin"
            empty={{
                icon: 'journal-text',
                title: 'No words yet',
                description: 'Add your first word.',
                action: <button type="button">Create your first word</button>,
            }}
            noMatch={{ title: 'No words match' }}
        />
    );
}

function mount(props: HarnessProps = {}) {
    act(() => {
        root.render(
            <MemoryRouter>
                <Harness {...props} />
            </MemoryRouter>,
        );
    });
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
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

describe('EntityGallery — the two empty states', () => {
    it('offers the create CTA when nothing exists yet', () => {
        mount({ items: [] });

        expect(text()).toContain('No words yet');
        expect(text()).toContain('Create your first word');
        // The "nothing yet" state must NOT offer to clear filters — there are
        // none, and the offer would be a lie about why the grid is empty.
        expect(text()).not.toContain('Clear filters');
    });

    it('offers a Clear-filters action when a search matched nothing', async () => {
        mount({ initialQuery: 'zzz' });
        await act(async () => {
            await Promise.resolve();
        });

        expect(text()).toContain('No words match');

        const clear = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent === 'Clear filters',
        );
        expect(clear).toBeDefined();

        // And it actually clears: the items come back.
        act(() => {
            clear!.click();
        });
        expect(text()).toContain('kato');
        expect(text()).not.toContain('No words match');
    });

    it('treats a non-`all` filter as "filtered", not as "nothing yet"', () => {
        mount({ items: [{ id: 9, name: 'longword' }] });

        const select = container.querySelector('select') as HTMLSelectElement;
        act(() => {
            select.value = 'short';
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(text()).toContain('No words match');
        expect(text()).not.toContain('No words yet');
    });
});

describe('EntityGallery — selection mode', () => {
    it('renders exactly one button per item and calls onSelect with it', () => {
        const onSelect = vi.fn();
        mount({ selectionMode: true, onSelect });

        const cardButtons = Array.from(container.querySelectorAll('article button'));
        expect(cardButtons).toHaveLength(WORDS.length);

        act(() => {
            (cardButtons[0] as HTMLButtonElement).click();
        });
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect.mock.calls[0][0]).toMatchObject({ name: 'kato' });
    });

    it('names each card button, so a picker is navigable by control', () => {
        mount({ selectionMode: true, onSelect: vi.fn() });

        const labels = Array.from(container.querySelectorAll('article button')).map((b) =>
            b.getAttribute('aria-label'),
        );
        expect(labels).toEqual(['kato', 'mira', 'sona']);
    });

    it('suppresses the destructive card actions — a picker cannot delete', () => {
        mount({ selectionMode: true, onSelect: vi.fn() });
        expect(text()).not.toContain('Delete kato');
    });

    it('nests NO interactive element inside another', () => {
        mount({ selectionMode: true, onSelect: vi.fn() });

        expect(container.querySelectorAll('button button')).toHaveLength(0);
        expect(container.querySelectorAll('a button')).toHaveLength(0);
        expect(container.querySelectorAll('button a')).toHaveLength(0);
        expect(container.querySelectorAll('a a')).toHaveLength(0);
    });
});

describe('EntityGallery — normal mode', () => {
    it('makes the card a link and keeps the delete action OUTSIDE it', () => {
        mount();

        const links = Array.from(container.querySelectorAll('article a'));
        expect(links).toHaveLength(WORDS.length);
        expect(links[0].getAttribute('href')).toBe('/lexicon/db/1');

        // The action exists, and is not inside the link.
        expect(text()).toContain('Delete kato');
        expect(container.querySelectorAll('a button')).toHaveLength(0);
        expect(container.querySelectorAll('button button')).toHaveLength(0);
    });
});

describe('EntityGallery — toolbar accessibility', () => {
    it('gives every select an accessible name', () => {
        mount();

        const selects = Array.from(container.querySelectorAll('select'));
        expect(selects.length).toBeGreaterThan(0);

        for (const select of selects) {
            const ariaLabel = select.getAttribute('aria-label');
            const labelled =
                select.id && container.querySelector(`label[for="${select.id}"]`) !== null;
            expect(Boolean(ariaLabel) || labelled).toBe(true);
        }
    });

    it('labels the filter select with visible text, not a bare span', () => {
        mount();

        const select = container.querySelector('select') as HTMLSelectElement;
        const label = container.querySelector(`label[for="${select.id}"]`);
        expect(label?.textContent).toBe('Word origin');
    });
});

describe('EntityGallery — loading', () => {
    it('renders a card skeleton (not an empty grid) while the database boots', () => {
        mount({ isReady: false, items: [] });

        const status = container.querySelector('[role="status"]');
        expect(status).not.toBeNull();
        expect(status?.getAttribute('aria-label')).toBe('Loading test gallery');
        // Crucially NOT the "nothing yet" state — nothing is known yet.
        expect(text()).not.toContain('No words yet');
    });
});
