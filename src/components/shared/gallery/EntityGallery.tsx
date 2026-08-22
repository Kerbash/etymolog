import classNames from 'classnames';
import { useCallback, useId, useMemo, type ReactNode } from 'react';

import {
    DataGallery,
    type GalleryViewMode,
    type SortOption,
} from 'cyber-components/display/dataGallery';
import EmptyState from 'cyber-components/display/emptyState';
import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';

import LoadingState from '../loadingState';
import EntityCard from './EntityCard';
import {
    applyGallery,
    GALLERY_FILTER_ALL,
    GALLERY_PAGE_SIZES,
    hasActiveGalleryFilters,
    type GalleryAdapters,
    type GalleryState,
} from './useGalleryState';

import styles from './EntityGallery.module.scss';

/** One option of the gallery's single filter select. */
export interface GalleryFilterOption {
    value: string;
    label: string;
}

/** Copy for the "there is nothing here" state. */
export interface GalleryEmptyCopy {
    /** Bootstrap icon name, decorative. */
    icon?: string;
    title: string;
    description?: string;
    /**
     * The call to action that creates the first item. A "nothing yet" state
     * without one is a dead end — which is what all three galleries shipped in
     * selection mode.
     */
    action?: ReactNode;
}

export interface EntityGalleryProps<T> {
    /**
     * The FULL list. `EntityGallery` owns search, filter, sort and pagination —
     * callers must not pre-slice, or the pager will lie.
     */
    items: readonly T[];
    /** Toolbar state from {@link useGalleryState}. */
    state: GalleryState;
    /** Per-entity search/filter/sort behaviour. */
    adapters?: GalleryAdapters<T>;
    keyExtractor: (item: T) => string | number;
    /** The card BODY. Must render nothing interactive — see {@link EntityCard}. */
    renderItem: (item: T, viewMode: GalleryViewMode) => ReactNode;
    /** Accessible name of one card's clickable region. */
    itemLabel: (item: T) => string;
    /** Where a card navigates. Ignored in selection mode. */
    itemHref?: (item: T) => string;
    /**
     * Activation handler for a card that has no `itemHref` — the card renders
     * as a `<button>` instead of a `<Link>`. Ignored in selection mode and when
     * `itemHref` is set (a link cannot also be a button).
     */
    onItemActivate?: (item: T) => void;
    /** Row of controls below the card body. Ignored in selection mode. */
    renderActions?: (item: T) => ReactNode;

    /**
     * Picker mode: every card becomes ONE `<button>` that calls `onSelect`, and
     * the actions row (delete, edit) is suppressed — a picker must not be able
     * to destroy the thing the user came to choose.
     */
    selectionMode?: boolean;
    onSelect?: (item: T) => void;

    /** Accessible name of the gallery region. */
    ariaLabel: string;
    /**
     * `false` while the database is still booting. Renders
     * `LoadingState variant="gallery"` — a card-shaped skeleton, so the grid
     * does not jump when the data lands.
     */
    isReady?: boolean;
    error?: Error | null;

    searchPlaceholder?: string;
    sortOptions: SortOption[];
    /** Renders the labelled filter select when present. */
    filterOptions?: readonly GalleryFilterOption[];
    /** Visible label for that select. Default `'Filter'`. */
    filterLabel?: string;
    /** Show the compact/detailed toggle. Default `true`. */
    showViewToggle?: boolean;
    minItemWidth?: string;
    maxItemWidth?: string;
    itemGap?: string;
    /** Extra toolbar content, right-aligned (a settings switch, a legend). */
    toolbarEndSlot?: ReactNode;

    /** Copy for "nothing exists yet". */
    empty: GalleryEmptyCopy;
    /**
     * Copy for "your search/filter matched nothing". A Clear-filters action is
     * ALWAYS appended by this component — the two states differ in what the
     * user can do about them, and a filtered-empty grid with no way back is the
     * single most common dead end in the app.
     */
    noMatch?: Partial<GalleryEmptyCopy>;

    className?: string;
}

/**
 * EntityGallery — the app's only gallery.
 *
 * Wraps cyber `DataGallery` (presentation-only: the parent owns search, sort
 * and page state) with the four things every gallery in this app needs and none
 * of them agreed on:
 *
 *  1. a LABELLED filter select — the lexicon's was a bare `<select>` preceded
 *     by a `<span>Filter:</span>`, which is not a label by any definition a
 *     screen reader recognises;
 *  2. the TWO empty states, told apart properly — "no words yet" (offer the
 *     CTA that makes one) versus "nothing matched" (offer the way back);
 *  3. a card-shaped loading skeleton instead of the word "Loading";
 *  4. selection mode, so the pickers (`PunctuationPage` today, the glyph picker
 *     in Phase 7) reuse the same grid instead of a fourth copy.
 *
 * Activation lives on the CARD (a `Link` or a `button`), not on `DataGallery`'s
 * `onItemActivate`: the gridcell wrapper's click handler fires that callback
 * too, so wiring both would navigate — or select — twice per click.
 */
export default function EntityGallery<T>({
    items,
    state,
    adapters,
    keyExtractor,
    renderItem,
    itemLabel,
    itemHref,
    onItemActivate,
    renderActions,
    selectionMode = false,
    onSelect,
    ariaLabel,
    isReady = true,
    error,
    searchPlaceholder = 'Search…',
    sortOptions,
    filterOptions,
    filterLabel = 'Filter',
    showViewToggle = true,
    minItemWidth = '200px',
    maxItemWidth,
    itemGap = '1rem',
    toolbarEndSlot,
    empty,
    noMatch,
    className,
}: EntityGalleryProps<T>) {
    const filterId = useId();

    const { pageItems, total, maxPage, page } = useMemo(
        () => applyGallery(items, state, adapters),
        [items, state, adapters],
    );

    const filtered = hasActiveGalleryFilters(state);

    const renderCard = useCallback(
        (item: T, viewMode: GalleryViewMode) => {
            const label = itemLabel(item);

            if (selectionMode) {
                return (
                    <EntityCard
                        label={label}
                        onActivate={onSelect ? () => onSelect(item) : undefined}
                        compact={viewMode === 'compact'}
                    >
                        {renderItem(item, viewMode)}
                    </EntityCard>
                );
            }

            const to = itemHref?.(item);

            return (
                <EntityCard
                    label={label}
                    to={to}
                    onActivate={!to && onItemActivate ? () => onItemActivate(item) : undefined}
                    actions={renderActions?.(item)}
                    compact={viewMode === 'compact'}
                >
                    {renderItem(item, viewMode)}
                </EntityCard>
            );
        },
        [
            itemLabel,
            itemHref,
            onItemActivate,
            renderActions,
            renderItem,
            selectionMode,
            onSelect,
        ],
    );

    const emptySlot = useMemo(() => {
        if (filtered) {
            return (
                <EmptyState
                    icon={noMatch?.icon ?? 'search'}
                    title={noMatch?.title ?? 'Nothing matched'}
                    description={
                        noMatch?.description ??
                        'No items match the current search and filter. Clear them to see everything again.'
                    }
                    // ALWAYS an escape hatch — see the `noMatch` prop doc.
                    action={
                        <Button
                            type="button"
                            className={buttonStyles.secondary}
                            onClick={() => {
                                state.setQuery('');
                                state.setFilter(GALLERY_FILTER_ALL);
                            }}
                        >
                            Clear filters
                        </Button>
                    }
                    ariaLive="polite"
                />
            );
        }

        return (
            <EmptyState
                icon={empty.icon}
                title={empty.title}
                description={empty.description}
                action={selectionMode ? undefined : empty.action}
            />
        );
    }, [filtered, noMatch, empty, selectionMode, state]);

    return (
        <div className={classNames(styles.root, className)}>
            {filterOptions && filterOptions.length > 0 && (
                <div className={styles.filterBar}>
                    <label htmlFor={filterId} className={styles.filterLabel}>
                        {filterLabel}
                    </label>
                    <select
                        id={filterId}
                        className={styles.filterSelect}
                        value={state.filter}
                        onChange={(e) => state.setFilter(e.target.value)}
                    >
                        {filterOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {!isReady && !error ? (
                <LoadingState variant="gallery" label={`Loading ${ariaLabel.toLowerCase()}`} />
            ) : (
                <DataGallery
                    data={pageItems}
                    keyExtractor={(item: T) => keyExtractor(item)}
                    renderDetailed={(item: T) => renderCard(item, 'detailed')}
                    renderCompact={(item: T) => renderCard(item, 'compact')}
                    minItemWidth={minItemWidth}
                    maxItemWidth={maxItemWidth}
                    itemGap={itemGap}
                    searchFn={state.setQuery}
                    searchQuery={state.query}
                    onSearchQueryChange={state.setQuery}
                    searchPlaceholder={searchPlaceholder}
                    sortOptions={sortOptions}
                    sortBy={state.sortBy}
                    setSortBy={state.setSortBy}
                    viewMode={state.viewMode}
                    setViewMode={state.setViewMode}
                    showDisplaySwitch={showViewToggle}
                    curPage={page}
                    setCurPage={state.setPage}
                    maxPage={maxPage}
                    maxResultPerPage={state.pageSize}
                    setMaxResultPerPage={state.setPageSize}
                    maxResultOptions={[...GALLERY_PAGE_SIZES]}
                    totalCount={total}
                    error={error ?? null}
                    emptySlot={emptySlot}
                    toolbarEndSlot={toolbarEndSlot}
                    keyboardNavigation={{ enabled: true, mode: 'roving', wrapAround: true }}
                    virtualization={{
                        autoEnableThreshold: 100,
                        estimatedItemHeight: state.viewMode === 'detailed' ? 180 : 200,
                    }}
                    ariaLabel={ariaLabel}
                    styling={{ content: { className: styles.grid } }}
                />
            )}
        </div>
    );
}
