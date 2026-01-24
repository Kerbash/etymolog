/**
 * GraphemeGallery
 * ----------------
 * Refactored to use the reusable DataGallery component from cyber-components.
 *
 * Features:
 * - Search by name, phoneme, or glyph name
 * - View mode toggle (expanded/compact)
 * - Pagination
 * - Keyboard navigation
 * - Virtualization for large datasets
 */

import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { GraphemeComplete } from '../../../../db/types';
import DetailedGraphemeDisplay from '../../../display/grapheme/detailed/detailed.tsx';
import CompactGraphemeDisplay from '../../../display/grapheme/compact/compact.tsx';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button/button.tsx';
import { DataGallery, type GalleryViewMode, type SortOption } from 'cyber-components/display/dataGallery';

// Map our legacy ViewMode to DataGallery's GalleryViewMode
export type ViewMode = 'expanded' | 'compact';

interface GraphemeGalleryProps {
    graphemes: GraphemeComplete[];
    isLoading?: boolean;
    error?: Error | null;
    /** Initial view mode */
    defaultViewMode?: ViewMode;
    /** Called when a grapheme is clicked (for compact view) */
    onGraphemeClick?: (grapheme: GraphemeComplete) => void;
}

// Sort options for the gallery
const SORT_OPTIONS: SortOption[] = [
    { value: 'name-asc', displayComponent: <span>Name (A-Z)</span> },
    { value: 'name-desc', displayComponent: <span>Name (Z-A)</span> },
    { value: 'glyphs-desc', displayComponent: <span>Most Glyphs</span> },
    { value: 'glyphs-asc', displayComponent: <span>Fewest Glyphs</span> },
];

// Results per page options
const RESULTS_PER_PAGE_OPTIONS = [12, 24, 48, 96];

/**
 * Self-contained gallery component for displaying graphemes
 * Now uses DataGallery for consistent UI and features
 */
export default function GraphemeGallery({
    graphemes,
    isLoading,
    error,
    defaultViewMode = 'expanded',
    onGraphemeClick,
}: GraphemeGalleryProps) {
    // Map legacy view mode to DataGallery view mode
    const mapViewMode = (mode: ViewMode): GalleryViewMode =>
        mode === 'expanded' ? 'detailed' : 'compact';

    // Gallery state
    const [viewMode, setViewMode] = useState<GalleryViewMode>(mapViewMode(defaultViewMode));
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('name-asc');
    const [curPage, setCurPage] = useState(1);
    const [maxResultPerPage, setMaxResultPerPage] = useState(24);

    // Filter and sort graphemes
    const filteredAndSortedGraphemes = useMemo(() => {
        let result = graphemes;

        // Filter by search query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(grapheme => {
                // Search by name
                if (grapheme.name.toLowerCase().includes(query)) {
                    return true;
                }
                // Search by phoneme
                if (grapheme.phonemes.some(p => p.phoneme.toLowerCase().includes(query))) {
                    return true;
                }
                // Search by glyph name
                if (grapheme.glyphs.some(g => g.name.toLowerCase().includes(query))) {
                    return true;
                }
                return false;
            });
        }

        // Sort
        result = [...result].sort((a, b) => {
            switch (sortBy) {
                case 'name-asc':
                    return a.name.localeCompare(b.name);
                case 'name-desc':
                    return b.name.localeCompare(a.name);
                case 'glyphs-desc':
                    return b.glyphs.length - a.glyphs.length;
                case 'glyphs-asc':
                    return a.glyphs.length - b.glyphs.length;
                default:
                    return 0;
            }
        });

        return result;
    }, [graphemes, searchQuery, sortBy]);

    // Calculate pagination
    const maxPage = Math.max(1, Math.ceil(filteredAndSortedGraphemes.length / maxResultPerPage));

    // Ensure current page is valid
    const validCurPage = Math.min(curPage, maxPage);
    if (validCurPage !== curPage) {
        setCurPage(validCurPage);
    }

    // Get current page data
    const paginatedGraphemes = useMemo(() => {
        const startIndex = (validCurPage - 1) * maxResultPerPage;
        return filteredAndSortedGraphemes.slice(startIndex, startIndex + maxResultPerPage);
    }, [filteredAndSortedGraphemes, validCurPage, maxResultPerPage]);

    // Handlers
    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        setCurPage(1); // Reset to first page on search
    }, []);

    const handleItemActivate = useCallback((grapheme: GraphemeComplete) => {
        if (onGraphemeClick) {
            onGraphemeClick(grapheme);
        }
    }, [onGraphemeClick]);

    // Renderers
    const renderDetailed = useCallback((grapheme: GraphemeComplete) => (
        <div
            onClick={() => onGraphemeClick?.(grapheme)}
            style={{
                cursor: onGraphemeClick ? 'pointer' : 'default',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                borderRadius: '8px',
            }}
            className={onGraphemeClick ? 'grapheme-clickable' : undefined}
            role={onGraphemeClick ? 'button' : undefined}
            tabIndex={onGraphemeClick ? 0 : undefined}
            onKeyDown={onGraphemeClick ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onGraphemeClick(grapheme);
                }
            } : undefined}
            onMouseEnter={(e) => {
                if (onGraphemeClick) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                }
            }}
            onMouseLeave={(e) => {
                if (onGraphemeClick) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                }
            }}
        >
            <DetailedGraphemeDisplay graphemeData={grapheme} />
        </div>
    ), [onGraphemeClick]);

    const renderCompact = useCallback((grapheme: GraphemeComplete) => (
        <CompactGraphemeDisplay
            graphemeData={grapheme}
            onClick={onGraphemeClick ? () => onGraphemeClick(grapheme) : undefined}
        />
    ), [onGraphemeClick]);

    // Custom empty slot with create button
    const emptySlot = useCallback(({ searchQuery, hasActiveFilters }: { searchQuery?: string; hasActiveFilters?: boolean }) => {
        if (searchQuery || hasActiveFilters) {
            return (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <p>No graphemes match your search "{searchQuery}"</p>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Try adjusting your search terms
                    </p>
                </div>
            );
        }
        return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p>No graphemes found. Create one to get started!</p>
                <IconButton
                    as={Link}
                    to="/script-maker/create"
                    iconName="plus-lg"
                    className={buttonStyles.primary}
                    style={{ marginTop: '1rem' }}
                >
                    Add Your First Glyph
                </IconButton>
            </div>
        );
    }, []);

    return (
        <DataGallery
            // Data
            data={paginatedGraphemes}
            keyExtractor={(grapheme) => grapheme.id}

            // Renderers
            renderDetailed={renderDetailed}
            renderCompact={renderCompact}
            minItemWidth="200px"
            itemGap="1rem"

            // Search
            searchFn={handleSearch}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            searchPlaceholder="Search by name, pronunciation..."

            // Sorting
            sortOptions={SORT_OPTIONS}
            sortBy={sortBy}
            setSortBy={setSortBy}

            // View mode
            viewMode={viewMode}
            setViewMode={setViewMode}
            showDisplaySwitch={true}

            // Pagination
            curPage={validCurPage}
            setCurPage={setCurPage}
            maxPage={maxPage}
            maxResultPerPage={maxResultPerPage}
            setMaxResultPerPage={setMaxResultPerPage}
            maxResultOptions={RESULTS_PER_PAGE_OPTIONS}
            totalCount={filteredAndSortedGraphemes.length}

            // State
            isLoading={isLoading}
            error={error}
            emptySlot={emptySlot}

            // Interaction
            onItemActivate={handleItemActivate}

            // Keyboard navigation
            keyboardNavigation={{
                enabled: true,
                mode: 'roving',
                wrapAround: true,
            }}

            // Virtualization (auto-enables for 100+ items)
            virtualization={{
                autoEnableThreshold: 100,
                estimatedItemHeight: viewMode === 'detailed' ? 150 : 200,
            }}

            // Accessibility
            ariaLabel="Grapheme gallery"
        />
    );
}
