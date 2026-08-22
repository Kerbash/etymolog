/**
 * useGalleryState + applyGallery — the ONE gallery state model.
 *
 * The app had three byte-similar copies of this logic (`LexiconGallery`,
 * `graphemeGallery`, `galleryGlyphs`), each with the same defect:
 *
 * ```ts
 * const validCurPage = Math.min(curPage, maxPage);
 * if (validCurPage !== curPage) setCurPage(validCurPage);   // during RENDER
 * ```
 *
 * Calling a setter during render is what `react-hooks/set-state-in-effect`
 * exists to catch. It also cannot be right: the clamped page is a FUNCTION of
 * the filtered length and the page size, so storing it is storing a value that
 * is already derivable — and the store is one render behind whenever the list
 * shrinks (delete the last item on page 3 and the grid renders empty once
 * before the correction lands).
 *
 * Here the stored page is the user's INTENT and `applyGallery` derives the
 * effective page from it. Nothing is ever set during render, and a list that
 * shrinks under the user's feet renders the correct page on the FIRST pass.
 */

import { useCallback, useMemo, useState } from 'react';

import type { GalleryViewMode } from 'cyber-components/display/dataGallery';

import { useEtymolog } from '../../../db';

/** The page-size choices offered by every gallery in the app. */
export const GALLERY_PAGE_SIZES = [12, 24, 48, 96] as const;

/** The sentinel `filter` value meaning "no filter applied". */
export const GALLERY_FILTER_ALL = 'all';

/**
 * Everything a gallery toolbar can change. Deliberately flat and serialisable:
 * a future "remember my last view" feature stores this object and nothing else.
 */
export interface GalleryState {
    /** Free-text search box contents. */
    query: string;
    setQuery: (query: string) => void;
    /** The active value of the single filter select (`'all'` when off). */
    filter: string;
    setFilter: (filter: string) => void;
    /** The active sort option's `value`. */
    sortBy: string;
    setSortBy: (sortBy: string) => void;
    /**
     * The page the user asked for (1-based). NOT necessarily the page being
     * shown — see `applyGallery`, which clamps it against the current result
     * count. Read `applyGallery(...).page` for what is on screen.
     */
    page: number;
    setPage: (page: number) => void;
    pageSize: number;
    setPageSize: (pageSize: number) => void;
    viewMode: GalleryViewMode;
    setViewMode: (viewMode: GalleryViewMode) => void;
}

export interface GalleryStateOptions {
    /** Initial sort option value. Must be one of the gallery's `sortOptions`. */
    defaultSort: string;
    /** Initial filter value. Defaults to `'all'`. */
    defaultFilter?: string;
    /** Initial page size. Defaults to 24. */
    defaultPageSize?: number;
    /**
     * Initial view mode. Defaults to the user's `settings.defaultGalleryView`
     * (the legacy `'expanded'` value maps to `'detailed'`), which is what that
     * setting was always supposed to control and never did — all three
     * galleries hardcoded their own default and ignored it.
     */
    defaultViewMode?: GalleryViewMode;
}

/** `settings.defaultGalleryView` carries a legacy third value. */
export function normalizeViewMode(value: string | undefined): GalleryViewMode {
    return value === 'compact' ? 'compact' : 'detailed';
}

/**
 * The toolbar state of one gallery.
 *
 * Every setter that changes the RESULT SET also resets the page: staying on
 * page 4 after typing a query that matches two items is how a search comes back
 * "empty".
 */
export function useGalleryState({
    defaultSort,
    defaultFilter = GALLERY_FILTER_ALL,
    defaultPageSize = 24,
    defaultViewMode,
}: GalleryStateOptions): GalleryState {
    const { settings } = useEtymolog();

    const [query, setQueryRaw] = useState('');
    const [filter, setFilterRaw] = useState(defaultFilter);
    const [sortBy, setSortBy] = useState(defaultSort);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSizeRaw] = useState(defaultPageSize);
    const [viewMode, setViewMode] = useState<GalleryViewMode>(
        () => defaultViewMode ?? normalizeViewMode(settings?.defaultGalleryView),
    );

    const setQuery = useCallback((next: string) => {
        setQueryRaw(next);
        setPage(1);
    }, []);

    const setFilter = useCallback((next: string) => {
        setFilterRaw(next);
        setPage(1);
    }, []);

    const setPageSize = useCallback((next: number) => {
        setPageSizeRaw(next);
        setPage(1);
    }, []);

    return useMemo(
        () => ({
            query,
            setQuery,
            filter,
            setFilter,
            sortBy,
            setSortBy,
            page,
            setPage,
            pageSize,
            setPageSize,
            viewMode,
            setViewMode,
        }),
        [query, setQuery, filter, setFilter, sortBy, page, pageSize, setPageSize, viewMode],
    );
}

/** The per-entity behaviour a gallery needs. All three are optional. */
export interface GalleryAdapters<T> {
    /** `true` when `item` matches the (already lower-cased, trimmed) query. */
    search?: (item: T, query: string) => boolean;
    /** `true` when `item` passes `filter`. Never called for `'all'`. */
    filter?: (item: T, filter: string) => boolean;
    /** Comparator for the given sort value. */
    sort?: (a: T, b: T, sortBy: string) => number;
}

/** The subset of `GalleryState` `applyGallery` reads — pure data, no setters. */
export interface GalleryQuery {
    query: string;
    filter: string;
    sortBy: string;
    page: number;
    pageSize: number;
}

export interface GalleryPage<T> {
    /** The items to render — already filtered, sorted and sliced. */
    pageItems: T[];
    /** How many items survived search + filter (NOT the page length). */
    total: number;
    /** Page count, never below 1 (an empty gallery is still "page 1 of 1"). */
    maxPage: number;
    /**
     * The page actually being shown: `state.page` clamped into `[1, maxPage]`.
     * DERIVED — never written back into state. This is the whole point.
     */
    page: number;
}

/**
 * Pure: search → filter → sort → paginate.
 *
 * @example
 * ```ts
 * const { pageItems, total, maxPage, page } = applyGallery(words, state, {
 *     search: (w, q) => w.lemma.toLowerCase().includes(q),
 *     sort: (a, b, by) => (by === 'name-asc' ? a.lemma.localeCompare(b.lemma) : 0),
 * });
 * ```
 */
export function applyGallery<T>(
    items: readonly T[],
    state: GalleryQuery,
    adapters: GalleryAdapters<T> = {},
): GalleryPage<T> {
    let result: T[] = items as T[];

    if (adapters.filter && state.filter && state.filter !== GALLERY_FILTER_ALL) {
        result = result.filter((item) => adapters.filter!(item, state.filter));
    }

    const query = state.query.trim().toLowerCase();
    if (query && adapters.search) {
        result = result.filter((item) => adapters.search!(item, query));
    }

    if (adapters.sort) {
        // Copy before sorting: `items` belongs to the caller (usually a context
        // data slice), and `Array.prototype.sort` mutates in place.
        result = [...result].sort((a, b) => adapters.sort!(a, b, state.sortBy));
    }

    const total = result.length;
    const pageSize = Math.max(1, Math.floor(state.pageSize) || 1);
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, Math.floor(state.page) || 1), maxPage);
    const start = (page - 1) * pageSize;

    return { pageItems: result.slice(start, start + pageSize), total, maxPage, page };
}

/** True when the user has narrowed the list — drives the "no match" copy. */
export function hasActiveGalleryFilters(state: Pick<GalleryQuery, 'query' | 'filter'>): boolean {
    return state.query.trim() !== '' || (state.filter !== GALLERY_FILTER_ALL && state.filter !== '');
}
