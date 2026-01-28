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

import {useState, useMemo, useCallback} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import type {GraphemeComplete} from '@src/db';
import DetailedGraphemeDisplay from '../../../display/grapheme/detailed/detailed.tsx';
import CompactGraphemeDisplay from '../../../display/grapheme/compact/compact.tsx';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import Modal from 'cyber-components/container/modal/modal.tsx';
import Button from 'cyber-components/interactable/buttons/button/button.tsx';
import {buttonStyles} from 'cyber-components/interactable/buttons/button/button.tsx';
import {DataGallery, type GalleryViewMode, type SortOption} from 'cyber-components/display/dataGallery';
import {useEtymolog} from '@src/db';

// Map our legacy ViewMode to DataGallery's GalleryViewMode
export type ViewMode = 'expanded' | 'compact';

interface GraphemeGalleryProps {
    // Make graphemes optional so this component can act as a container when
    // no prop is provided (it will source data from useEtymolog()).
    graphemes?: GraphemeComplete[];
    isLoading?: boolean;
    error?: Error | null;
    /** Initial view mode */
    defaultViewMode?: ViewMode;
    /** Called when a grapheme is clicked (for compact view) */
    onGraphemeClick?: (grapheme: GraphemeComplete) => void;
}

// Sort options for the gallery
const SORT_OPTIONS: SortOption[] = [
    {value: 'name-asc', displayComponent: <span>Name (A-Z)</span>},
    {value: 'name-desc', displayComponent: <span>Name (Z-A)</span>},
    {value: 'glyphs-desc', displayComponent: <span>Most Glyphs</span>},
    {value: 'glyphs-asc', displayComponent: <span>Fewest Glyphs</span>},
];

// Results per page options
const RESULTS_PER_PAGE_OPTIONS = [12, 24, 48, 96];

/**
 * Self-contained gallery component for displaying graphemes
 * Now uses DataGallery for consistent UI and features
 */
export default function GraphemeGallery({
                                            graphemes,
                                            isLoading: isLoadingProp,
                                            error: errorProp,
                                            defaultViewMode = 'expanded',
                                            onGraphemeClick,
                                        }: GraphemeGalleryProps) {
    // Use etymolog context for API + optionally data
    const etymolog = useEtymolog();
    const {
        api,
        refresh,
        data: etymologData,
        isLoading: etymologLoading,
        error: etymologError
    } = etymolog || ({} as any);

    // Provide default grapheme list / loading / error from context when props aren't passed
    const graphemesToRender: GraphemeComplete[] = graphemes ?? (etymologData?.graphemesComplete ?? []);
    const isLoading = isLoadingProp ?? Boolean(etymologLoading);
    const error = errorProp ?? (etymologError as Error | null | undefined) ?? null;

    // Local delete modal state
    const [graphemeToDelete, setGraphemeToDelete] = useState<number | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Map legacy view mode to DataGallery view mode
    const mapViewMode = (mode: ViewMode): GalleryViewMode =>
        mode === 'expanded' ? 'detailed' : 'compact';

    // Gallery state
    const [viewMode, setViewMode] = useState<GalleryViewMode>(mapViewMode(defaultViewMode));
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('name-asc');
    const [curPage, setCurPage] = useState(1);
    const [maxResultPerPage, setMaxResultPerPage] = useState(24);

    // Navigation / default click handler
    const navigate = useNavigate();
    const defaultOnGraphemeClick = useCallback((g: GraphemeComplete) => {
        navigate(`/script-maker/grapheme/db/${g.id}`);
    }, [navigate]);

    const internalOnGraphemeClick = onGraphemeClick ?? defaultOnGraphemeClick;

    // Filter and sort graphemes
    const filteredAndSortedGraphemes = useMemo(() => {
        let result = graphemesToRender;

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
    }, [graphemesToRender, searchQuery, sortBy]);

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
        if (internalOnGraphemeClick) {
            internalOnGraphemeClick(grapheme);
        }
    }, [internalOnGraphemeClick]);

    // New: open delete modal for a grapheme
    const handleDelete = useCallback((id: number, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setGraphemeToDelete(id);
    }, []);

    const confirmDelete = useCallback(async (id: number | null) => {
        if (id === null) return;
        setIsDeleting(true);
        try {
            const result = api.grapheme.delete(id);
            if (!result.success) {
                console.error('Failed to delete grapheme:', result.error?.message);
            } else {
                // Refresh context so UI updates immediately
                try {
                    refresh?.();
                } catch (e) { /* ignore refresh errors */
                }
            }
            // Close modal
            setGraphemeToDelete(null);
        } catch (err) {
            console.error('Failed to delete grapheme', err);
        } finally {
            setIsDeleting(false);
        }
    }, [api, refresh]);

    // Renderers
    const renderDetailed = useCallback((grapheme: GraphemeComplete) => (
        <div
            onClick={() => internalOnGraphemeClick?.(grapheme)}
            style={{
                cursor: 'pointer',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                borderRadius: '8px',
                position: 'relative', // for top-right button
            }}
            className={'grapheme-clickable'}
            role={'button'}
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    internalOnGraphemeClick(grapheme);
                }
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            {/* Top-right delete button */}
            <div style={{position: 'absolute', top: 8, right: 8, zIndex: 10}}>
                <IconButton
                    iconName="trash"
                    iconColor={'var(--status-bad)'}
                    onClick={(e: React.MouseEvent) => handleDelete(grapheme.id, e)}
                    aria-label={`Delete grapheme ${grapheme.name}`}
                />
            </div>

            <DetailedGraphemeDisplay graphemeData={grapheme}/>
        </div>
    ), [internalOnGraphemeClick, handleDelete]);

    const renderCompact = useCallback((grapheme: GraphemeComplete) => (
        <div style={{position: 'relative'}}>
            <div style={{position: 'absolute', top: 6, right: 6, zIndex: 10}}>
                <IconButton
                    iconName="trash"
                    iconColor={'var(--status-bad)'}
                    onClick={(e: React.MouseEvent) => handleDelete(grapheme.id, e)}
                    aria-label={`Delete grapheme ${grapheme.name}`}
                />
            </div>
            <CompactGraphemeDisplay
                graphemeData={grapheme}
                onClick={() => internalOnGraphemeClick(grapheme)}
            />
        </div>
    ), [internalOnGraphemeClick, handleDelete]);

    // Custom empty slot with create button
    const emptySlot = useCallback(({searchQuery, hasActiveFilters}: {
        searchQuery?: string;
        hasActiveFilters?: boolean
    }) => {
        if (searchQuery || hasActiveFilters) {
            return (
                <div style={{textAlign: 'center', padding: '2rem'}}>
                    <p>No graphemes match your search "{searchQuery}"</p>
                    <p style={{fontSize: '0.875rem', color: 'var(--text-secondary)'}}>
                        Try adjusting your search terms
                    </p>
                </div>
            );
        }
        return (
            <div style={{textAlign: 'center', padding: '2rem'}}>
                <p>No graphemes found. Create one to get started!</p>
                <IconButton
                    as={Link}
                    to="/script-maker/create"
                    iconName="plus-lg"
                    className={buttonStyles.primary}
                    style={{marginTop: '1rem'}}
                >
                    Add Your First Glyph
                </IconButton>
            </div>
        );
    }, []);

    return (
        <>
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

                // ... other props
                styling={{
                    content: {
                        style: {padding: '1rem 0.2rem'}       // inline style
                    }
                }}
            />

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={graphemeToDelete !== null}
                setIsOpen={(open) => {
                    if (!open) setGraphemeToDelete(null);
                }}
                onClose={() => setGraphemeToDelete(null)}
                allowClose={true}
            >
                <div style={{padding: '1rem', minWidth: 320}}>
                    <h2 style={{marginTop: 0}}>Delete grapheme</h2>

                    <p>Are you sure you would like to delete this grapheme?</p>

                    <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem'}}>
                        <Button onClick={() => setGraphemeToDelete(null)} disabled={isDeleting}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => confirmDelete(graphemeToDelete)}
                            disabled={isDeleting}
                            style={{background: 'var(--danger)', color: 'white'}}
                        >
                            {isDeleting ? 'Deleting...' : 'Delete grapheme'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
