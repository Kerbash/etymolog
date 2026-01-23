/**
 * GlyphGallery
 * ----------------
 * Refactored to use the reusable DataGallery component from cyber-components.
 *
 * This component now focuses on:
 * - Data fetching and state management (via useGlyphs/useGraphemes hooks)
 * - Delete modal logic
 * - Providing renderers for the DataGallery
 *
 * The DataGallery handles:
 * - Grid/list layout with responsive columns
 * - Search and filtering
 * - Pagination
 * - Keyboard navigation
 * - Virtualization for large datasets
 */

import {useState, useMemo, useCallback} from 'react';
import {useGlyphs, useGraphemes} from '../../../../db';
import type {GlyphWithUsage, GraphemeComplete} from '../../../../db/types';
import CompactGraphemeDisplay from '../galleryGrapheme/graphemeDisplay/compact/compact';
import DataGallery, {type SortOption} from 'cyber-components/display/dataGallery';
import GlyphCard from '../../../display/glyphs/glyphCard';
import Modal from "cyber-components/container/modal/modal.tsx";
import Button from "cyber-components/interactable/buttons/button/button.tsx";

/**
 * Simple glyph gallery: name on top, SVG in the middle.
 * Minimal styling so it matches the rest of the app's layout.
 */
export default function GlyphGallery() {
    // Data hooks
    const {glyphsWithUsage, isLoading, error, cascadeRemove} = useGlyphs();
    const {graphemesComplete, refresh: refreshGraphemes} = useGraphemes();

    // Gallery state
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('name-asc');
    const [curPage, setCurPage] = useState(1);
    const [maxResultPerPage, setMaxResultPerPage] = useState(24);

    // Delete modal state
    const [glyphToDelete, setGlyphToDelete] = useState<number | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Map glyph id -> array of grapheme objects that reference it
    const graphemesByGlyph = useMemo(() => {
        const map = new Map<number, GraphemeComplete[]>();
        if (!graphemesComplete) return map;

        for (const g of graphemesComplete) {
            for (const glyphEntry of g.glyphs) {
                const key = (glyphEntry as any).id as number;
                const arr = map.get(key) || [];
                arr.push(g as GraphemeComplete);
                map.set(key, arr);
            }
        }

        return map;
    }, [graphemesComplete]);

    // Filter and sort glyphs based on search and sort state
    const filteredAndSortedGlyphs = useMemo(() => {
        if (!glyphsWithUsage) return [];

        // Filter by search query
        let result = glyphsWithUsage;
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(g =>
                g.name.toLowerCase().includes(query)
            );
        }

        // Sort
        result = [...result].sort((a, b) => {
            switch (sortBy) {
                case 'name-asc':
                    return a.name.localeCompare(b.name);
                case 'name-desc':
                    return b.name.localeCompare(a.name);
                case 'usage-desc':
                    return (b.usageCount ?? 0) - (a.usageCount ?? 0);
                case 'usage-asc':
                    return (a.usageCount ?? 0) - (b.usageCount ?? 0);
                default:
                    return 0;
            }
        });

        return result;
    }, [glyphsWithUsage, searchQuery, sortBy]);

    // Calculate pagination
    const maxPage = Math.max(1, Math.ceil(filteredAndSortedGlyphs.length / maxResultPerPage));

    // Ensure current page is valid
    const validCurPage = Math.min(curPage, maxPage);
    if (validCurPage !== curPage) {
        setCurPage(validCurPage);
    }

    // Get current page data
    const paginatedGlyphs = useMemo(() => {
        const startIndex = (validCurPage - 1) * maxResultPerPage;
        return filteredAndSortedGlyphs.slice(startIndex, startIndex + maxResultPerPage);
    }, [filteredAndSortedGlyphs, validCurPage, maxResultPerPage]);

    // Handlers
    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        setCurPage(1); // Reset to first page on search
    }, []);

    const handleDelete = useCallback((id: number) => {
        setGlyphToDelete(id);
    }, []);

    const confirmDelete = useCallback(async (id: number) => {
        setIsDeleting(true);
        try {
            await cascadeRemove(id);
            refreshGraphemes();
            setGlyphToDelete(null);
        } catch (err) {
            console.error('Failed to delete glyph', err);
        } finally {
            setIsDeleting(false);
        }
    }, [cascadeRemove, refreshGraphemes]);

    // Renderers for DataGallery
    const renderGlyph = useCallback((glyph: GlyphWithUsage) => (
        <GlyphCard glyph={glyph} onDelete={handleDelete}/>
    ), [handleDelete]);

    return (
        <>
            <DataGallery
                // Data
                data={paginatedGlyphs}
                keyExtractor={(glyph) => glyph.id}

                // Renderers - use compact view for responsive multi-column grid
                // minItemWidth/maxItemWidth creates fluid growth: cards are at least 160px
                // and grow equally (1fr) to fill available space, shrinking when a new column fits
                renderDetailed={renderGlyph}
                renderCompact={renderGlyph}
                viewMode="compact"
                minItemWidth="160px"
                maxItemWidth="1fr"
                itemGap="1rem"

                // Search
                searchFn={handleSearch}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                searchPlaceholder="Search glyphs..."

                // Sorting
                sortOptions={SORT_OPTIONS}
                sortBy={sortBy}
                setSortBy={setSortBy}

                // Pagination
                curPage={validCurPage}
                setCurPage={setCurPage}
                maxPage={maxPage}
                maxResultPerPage={maxResultPerPage}
                setMaxResultPerPage={setMaxResultPerPage}
                maxResultOptions={RESULTS_PER_PAGE_OPTIONS}
                totalCount={filteredAndSortedGlyphs.length}

                // State
                isLoading={isLoading}
                error={error}
                emptyMessage="No glyphs found. Create one to get started."
                noResultsMessage="No glyphs match your search"

                // Keyboard navigation
                keyboardNavigation={{
                    enabled: true,
                    mode: 'roving',
                    wrapAround: true,
                }}

                // Virtualization (auto-enables for 100+ items)
                virtualization={{
                    autoEnableThreshold: 100,
                    estimatedItemHeight: 180,
                }}

                // Accessibility
                ariaLabel="Glyph gallery"

                // ... other props
                styling={{
                    content: {
                        style: {padding: '0.2rem'}       // inline style
                    }
                }}
            />

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={glyphToDelete !== null}
                setIsOpen={(open) => {
                    if (!open) setGlyphToDelete(null);
                }}
                onClose={() => setGlyphToDelete(null)}
                allowClose={true}
            >
                <div style={{padding: '1rem', minWidth: 360}}>
                    <h2 style={{marginTop: 0}}>Delete glyph</h2>

                    <p>
                        Are you sure you would like to delete this glyph?
                        {graphemesByGlyph.get(glyphToDelete ?? -1)?.length ? (
                            <>
                                {' '}The following grapheme(s) reference this glyph and will also be deleted unless you
                                unlink the glyph from those graphemes first:
                            </>
                        ) : null}
                    </p>

                    {/* List of affected graphemes */}
                    {graphemesByGlyph.get(glyphToDelete ?? -1)?.length ? (
                        <div style={{
                            display: 'grid',
                            gap: '0.5rem',
                            marginTop: '0.5rem',
                            maxHeight: '200px',
                            overflowY: 'auto'
                        }}>
                            {graphemesByGlyph.get(glyphToDelete ?? -1)?.map((gp) => (
                                <CompactGraphemeDisplay key={gp.id} graphemeData={gp}/>
                            ))}
                        </div>
                    ) : null}

                    <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem'}}>
                        <Button onClick={() => setGlyphToDelete(null)} disabled={isDeleting}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => glyphToDelete !== null && confirmDelete(glyphToDelete)}
                            disabled={isDeleting}
                            style={{background: 'var(--danger)', color: 'white'}}
                        >
                            {isDeleting ? 'Deleting...' : 'Delete glyph'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
}

// Sort options for the gallery
const SORT_OPTIONS: SortOption[] = [
    {value: 'name-asc', displayComponent: <span>Name (A-Z)</span>},
    {value: 'name-desc', displayComponent: <span>Name (Z-A)</span>},
    {value: 'usage-desc', displayComponent: <span>Most Used</span>},
    {value: 'usage-asc', displayComponent: <span>Least Used</span>},
];

// Results per page options
const RESULTS_PER_PAGE_OPTIONS = [12, 24, 48, 96];
