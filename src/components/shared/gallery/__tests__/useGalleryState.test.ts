/**
 * `applyGallery` — the pure half of the shared gallery state.
 *
 * The invariant under test is the one the three hand-rolled galleries got
 * wrong: the page being SHOWN is derived from the page the user asked for, not
 * stored alongside it. Each of them wrote
 *
 * ```ts
 * const valid = Math.min(curPage, maxPage);
 * if (valid !== curPage) setCurPage(valid);   // during render
 * ```
 *
 * which sets state during render AND renders the wrong page once whenever the
 * result set shrinks. Deriving cannot do either.
 *
 * Node environment: nothing here touches the DOM or React.
 */

import { describe, expect, it } from 'vitest';

import {
    applyGallery,
    hasActiveGalleryFilters,
    normalizeViewMode,
    type GalleryAdapters,
    type GalleryQuery,
} from '../useGalleryState';

interface Word {
    id: number;
    name: string;
    native: boolean;
    uses: number;
}

const WORDS: Word[] = [
    { id: 1, name: 'kato', native: true, uses: 3 },
    { id: 2, name: 'mira', native: false, uses: 7 },
    { id: 3, name: 'sona', native: true, uses: 1 },
    { id: 4, name: 'katu', native: false, uses: 5 },
    { id: 5, name: 'veli', native: true, uses: 9 },
];

const ADAPTERS: GalleryAdapters<Word> = {
    search: (word, query) => word.name.includes(query),
    filter: (word, filter) => (filter === 'native' ? word.native : !word.native),
    sort: (a, b, sortBy) => {
        if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
        if (sortBy === 'uses-desc') return b.uses - a.uses;
        return 0;
    },
};

const query = (over: Partial<GalleryQuery> = {}): GalleryQuery => ({
    query: '',
    filter: 'all',
    sortBy: 'name-asc',
    page: 1,
    pageSize: 2,
    ...over,
});

describe('applyGallery — the derived page clamp', () => {
    it('clamps the page down when the result set shrinks', () => {
        // 5 items at 2 per page → 3 pages; the user is on page 3.
        const before = applyGallery(WORDS, query({ page: 3 }), ADAPTERS);
        expect(before.maxPage).toBe(3);
        expect(before.page).toBe(3);
        expect(before.pageItems).toHaveLength(1);

        // Two items deleted → 2 pages. The SAME requested page now derives to 2,
        // with real content on it, on the FIRST render.
        const after = applyGallery(WORDS.slice(0, 3), query({ page: 3 }), ADAPTERS);
        expect(after.maxPage).toBe(2);
        expect(after.page).toBe(2);
        expect(after.pageItems).toHaveLength(1);
        expect(after.total).toBe(3);
    });

    it('never derives a page below 1, and an empty gallery is page 1 of 1', () => {
        const empty = applyGallery([], query({ page: 4 }), ADAPTERS);
        expect(empty).toMatchObject({ page: 1, maxPage: 1, total: 0 });
        expect(empty.pageItems).toEqual([]);

        const negative = applyGallery(WORDS, query({ page: -3 }), ADAPTERS);
        expect(negative.page).toBe(1);
    });

    it('does not write the clamped page back — the caller keeps its intent', () => {
        // The proof that nothing is stored: the SAME input state produces the
        // same derived page every time, and the state object is untouched.
        const state = query({ page: 9 });
        const first = applyGallery(WORDS, state, ADAPTERS);
        const second = applyGallery(WORDS, state, ADAPTERS);

        expect(state.page).toBe(9);
        expect(first.page).toBe(3);
        expect(second.page).toBe(3);
    });

    it('leaves the caller’s array unmutated when sorting', () => {
        const items = [...WORDS];
        applyGallery(items, query({ sortBy: 'name-desc' }), ADAPTERS);
        expect(items.map((w) => w.id)).toEqual([1, 2, 3, 4, 5]);
    });
});

describe('applyGallery — search, filter and sort compose', () => {
    it('applies filter, then search, then sort, then the page slice', () => {
        const result = applyGallery(
            WORDS,
            query({ filter: 'native', query: '  KA  ', sortBy: 'name-asc', pageSize: 10 }),
            ADAPTERS,
        );

        // filter: native → kato, sona, veli
        // search "ka" (trimmed + lower-cased by applyGallery) → kato
        expect(result.pageItems.map((w) => w.name)).toEqual(['kato']);
        expect(result.total).toBe(1);
    });

    it('sorts the WHOLE filtered set before paginating, not each page', () => {
        const page1 = applyGallery(WORDS, query({ sortBy: 'uses-desc', page: 1 }), ADAPTERS);
        const page2 = applyGallery(WORDS, query({ sortBy: 'uses-desc', page: 2 }), ADAPTERS);

        expect(page1.pageItems.map((w) => w.uses)).toEqual([9, 7]);
        expect(page2.pageItems.map((w) => w.uses)).toEqual([5, 3]);
    });

    it('treats the `all` filter as no filter, and never calls the filter adapter for it', () => {
        let called = 0;
        const spied: GalleryAdapters<Word> = {
            ...ADAPTERS,
            filter: (word, filter) => {
                called += 1;
                return ADAPTERS.filter!(word, filter);
            },
        };

        const result = applyGallery(WORDS, query({ filter: 'all', pageSize: 10 }), spied);
        expect(called).toBe(0);
        expect(result.total).toBe(WORDS.length);
    });

    it('ignores a whitespace-only query', () => {
        const result = applyGallery(WORDS, query({ query: '   ', pageSize: 10 }), ADAPTERS);
        expect(result.total).toBe(WORDS.length);
    });
});

describe('applyGallery — page size', () => {
    it('re-derives a valid page when the page size grows past the result count', () => {
        // Page 3 of 2-per-page is real; at 96 per page there is only one page,
        // so the user must land on it rather than on an empty page 3.
        const small = applyGallery(WORDS, query({ page: 3, pageSize: 2 }), ADAPTERS);
        expect(small.page).toBe(3);

        const large = applyGallery(WORDS, query({ page: 3, pageSize: 96 }), ADAPTERS);
        expect(large.page).toBe(1);
        expect(large.maxPage).toBe(1);
        expect(large.pageItems).toHaveLength(5);
    });

    it('survives a zero or fractional page size instead of dividing by zero', () => {
        const zero = applyGallery(WORDS, query({ pageSize: 0 }), ADAPTERS);
        expect(zero.maxPage).toBe(5);
        expect(zero.pageItems).toHaveLength(1);

        const fractional = applyGallery(WORDS, query({ pageSize: 2.7 }), ADAPTERS);
        expect(fractional.pageItems).toHaveLength(2);
    });
});

describe('gallery helpers', () => {
    it('reports active filters for a query OR a non-all filter', () => {
        expect(hasActiveGalleryFilters({ query: '', filter: 'all' })).toBe(false);
        expect(hasActiveGalleryFilters({ query: '  ', filter: 'all' })).toBe(false);
        expect(hasActiveGalleryFilters({ query: 'ka', filter: 'all' })).toBe(true);
        expect(hasActiveGalleryFilters({ query: '', filter: 'native' })).toBe(true);
    });

    it('maps the legacy `expanded` view-mode setting onto `detailed`', () => {
        expect(normalizeViewMode('expanded')).toBe('detailed');
        expect(normalizeViewMode('compact')).toBe('compact');
        expect(normalizeViewMode('detailed')).toBe('detailed');
        expect(normalizeViewMode(undefined)).toBe('detailed');
    });
});
