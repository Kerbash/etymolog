/**
 * LexiconGallery
 * ----------------
 * Gallery component for displaying lexicon entries.
 * Uses the reusable DataGallery component from cyber-components.
 *
 * Features:
 * - Search by lemma, pronunciation, or meaning
 * - View mode toggle (expanded/compact)
 * - Pagination
 * - Sort by name, descendants, or created date
 * - Filter by native/external
 * - Delete with protection check
 */

import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { LexiconComplete, GraphemeComplete } from '../../../../db/types';
import { DetailedLexiconDisplay } from '../../../display/lexicon/detailed';
import { CompactLexiconDisplay } from '../../../display/lexicon/compact';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import Modal from 'cyber-components/container/modal/modal.tsx';
import Button from 'cyber-components/interactable/buttons/button/button.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button/button.tsx';
import { DataGallery, type GalleryViewMode, type SortOption } from 'cyber-components/display/dataGallery';
import { useEtymolog } from '../../../../db';

export type ViewMode = 'expanded' | 'compact';
export type NativeFilter = 'all' | 'native' | 'external';

interface LexiconGalleryProps {
    lexicons: LexiconComplete[];
    graphemeMap: Map<number, GraphemeComplete>;
    isLoading?: boolean;
    error?: Error | null;
    defaultViewMode?: ViewMode;
    onLexiconClick?: (lexicon: LexiconComplete) => void;
}

// Sort options for the gallery
const SORT_OPTIONS: SortOption[] = [
    { value: 'pronunciation-asc', displayComponent: <span>Pronunciation (A-Z)</span> },
    { value: 'pronunciation-desc', displayComponent: <span>Pronunciation (Z-A)</span> },
    { value: 'descendants-desc', displayComponent: <span>Most Descendants</span> },
    { value: 'descendants-asc', displayComponent: <span>Fewest Descendants</span> },
    { value: 'created-desc', displayComponent: <span>Newest First</span> },
    { value: 'created-asc', displayComponent: <span>Oldest First</span> },
];

// Results per page options
const RESULTS_PER_PAGE_OPTIONS = [12, 24, 48, 96];

/**
 * Self-contained gallery component for displaying lexicon entries.
 */
export default function LexiconGallery({
    lexicons,
    graphemeMap,
    isLoading,
    error,
    defaultViewMode = 'expanded',
    onLexiconClick,
}: LexiconGalleryProps) {
    const { api, refresh } = useEtymolog();

    // Local delete modal state
    const [lexiconToDelete, setLexiconToDelete] = useState<LexiconComplete | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

    // Map legacy view mode to DataGallery view mode
    const mapViewMode = (mode: ViewMode): GalleryViewMode =>
        mode === 'expanded' ? 'detailed' : 'compact';

    // Gallery state
    const [viewMode, setViewMode] = useState<GalleryViewMode>(mapViewMode(defaultViewMode));
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('pronunciation-asc');
    const [curPage, setCurPage] = useState(1);
    const [maxResultPerPage, setMaxResultPerPage] = useState(24);
    const [nativeFilter, setNativeFilter] = useState<NativeFilter>('all');

    // Filter and sort lexicons
    const filteredAndSortedLexicons = useMemo(() => {
        let result = lexicons;

        // Filter by native/external
        if (nativeFilter === 'native') {
            result = result.filter(lex => lex.is_native);
        } else if (nativeFilter === 'external') {
            result = result.filter(lex => !lex.is_native);
        }

        // Filter by search query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(lexicon => {
                // Search by pronunciation (primary)
                if (lexicon.pronunciation?.toLowerCase().includes(query)) {
                    return true;
                }
                // Fallback: search by lemma
                if (lexicon.lemma.toLowerCase().includes(query)) {
                    return true;
                }
                // Search by meaning
                if (lexicon.meaning?.toLowerCase().includes(query)) {
                    return true;
                }
                return false;
            });
        }

        // Sort
        result = [...result].sort((a, b) => {
            switch (sortBy) {
                case 'pronunciation-asc':
                    return (a.pronunciation ?? a.lemma).localeCompare(b.pronunciation ?? b.lemma);
                case 'pronunciation-desc':
                    return (b.pronunciation ?? b.lemma).localeCompare(a.pronunciation ?? a.lemma);
                case 'descendants-desc':
                    return (b.descendants?.length ?? 0) - (a.descendants?.length ?? 0);
                case 'descendants-asc':
                    return (a.descendants?.length ?? 0) - (b.descendants?.length ?? 0);
                case 'created-desc':
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                case 'created-asc':
                    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                default:
                    return 0;
            }
        });

        return result;
    }, [lexicons, searchQuery, sortBy, nativeFilter]);

    // Calculate pagination
    const maxPage = Math.max(1, Math.ceil(filteredAndSortedLexicons.length / maxResultPerPage));

    // Ensure current page is valid
    const validCurPage = Math.min(curPage, maxPage);
    if (validCurPage !== curPage) {
        setCurPage(validCurPage);
    }

    // Get current page data
    const paginatedLexicons = useMemo(() => {
        const startIndex = (validCurPage - 1) * maxResultPerPage;
        return filteredAndSortedLexicons.slice(startIndex, startIndex + maxResultPerPage);
    }, [filteredAndSortedLexicons, validCurPage, maxResultPerPage]);

    // Handlers
    const handleSearch = useCallback((query: string) => {
        setSearchQuery(query);
        setCurPage(1);
    }, []);

    const handleItemActivate = useCallback((lexicon: LexiconComplete) => {
        if (onLexiconClick) {
            onLexiconClick(lexicon);
        }
    }, [onLexiconClick]);

    // Delete handlers with protection check
    const handleDelete = useCallback((lexicon: LexiconComplete, e?: React.MouseEvent) => {
        e?.stopPropagation();

        // Check for descendants (protection)
        const descendantCount = lexicon.descendants?.length ?? 0;
        if (descendantCount > 0) {
            const descendantNames = lexicon.descendants
                .slice(0, 3)
                .map(d => d.descendant.lemma)
                .join(', ');
            const moreText = descendantCount > 3 ? ` and ${descendantCount - 3} more` : '';
            setDeleteWarning(
                `This word has ${descendantCount} descendant${descendantCount !== 1 ? 's' : ''}: ${descendantNames}${moreText}. ` +
                `Deleting it will remove the etymology links from those words.`
            );
        } else {
            setDeleteWarning(null);
        }

        setLexiconToDelete(lexicon);
    }, []);

    const confirmDelete = useCallback(async () => {
        if (!lexiconToDelete) return;
        setIsDeleting(true);
        try {
            const result = api.lexicon.delete(lexiconToDelete.id);
            if (!result.success) {
                console.error('Failed to delete lexicon entry:', result.error?.message);
            } else {
                try { refresh?.(); } catch (e) { /* ignore refresh errors */ }
            }
            setLexiconToDelete(null);
            setDeleteWarning(null);
        } catch (err) {
            console.error('Failed to delete lexicon entry', err);
        } finally {
            setIsDeleting(false);
        }
    }, [api, refresh, lexiconToDelete]);

    // Renderers
    const renderDetailed = useCallback((lexicon: LexiconComplete) => (
        <div
            onClick={() => onLexiconClick?.(lexicon)}
            style={{
                cursor: onLexiconClick ? 'pointer' : 'default',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                borderRadius: '8px',
                position: 'relative',
            }}
            className={onLexiconClick ? 'lexicon-clickable' : undefined}
            role={onLexiconClick ? 'button' : undefined}
            tabIndex={onLexiconClick ? 0 : undefined}
            onKeyDown={onLexiconClick ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onLexiconClick(lexicon);
                }
            } : undefined}
            onMouseEnter={(e) => {
                if (onLexiconClick) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                }
            }}
            onMouseLeave={(e) => {
                if (onLexiconClick) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                }
            }}
        >
            {/* Top-right delete button */}
            <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
                <IconButton
                    iconName="trash"
                    iconColor={'var(--status-bad)'}
                    onClick={(e: React.MouseEvent) => handleDelete(lexicon, e)}
                    aria-label={`Delete ${lexicon.pronunciation ?? lexicon.lemma}`}
                />
            </div>

            <DetailedLexiconDisplay
                lexiconData={lexicon}
                graphemeMap={graphemeMap}
            />
        </div>
    ), [onLexiconClick, handleDelete, graphemeMap]);

    const renderCompact = useCallback((lexicon: LexiconComplete) => (
        <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 10 }}>
                <IconButton
                    iconName="trash"
                    iconColor={'var(--status-bad)'}
                    onClick={(e: React.MouseEvent) => handleDelete(lexicon, e)}
                    aria-label={`Delete ${lexicon.pronunciation ?? lexicon.lemma}`}
                />
            </div>
            <CompactLexiconDisplay
                lexiconData={lexicon}
                graphemeMap={graphemeMap}
                onClick={onLexiconClick ? () => onLexiconClick(lexicon) : undefined}
            />
        </div>
    ), [onLexiconClick, handleDelete, graphemeMap]);

    // Filter buttons slot
    const filterSlot = useMemo(() => (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Filter:</span>
            <select
                value={nativeFilter}
                onChange={(e) => {
                    setNativeFilter(e.target.value as NativeFilter);
                    setCurPage(1);
                }}
                style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-primary)',
                    background: 'var(--surface-base)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                }}
            >
                <option value="all">All Words</option>
                <option value="native">Native Only</option>
                <option value="external">External Only</option>
            </select>
        </div>
    ), [nativeFilter]);

    // Custom empty slot with create button
    const emptySlot = useCallback(({ searchQuery, hasActiveFilters }: { searchQuery?: string; hasActiveFilters?: boolean }) => {
        const hasFilters = hasActiveFilters || nativeFilter !== 'all';
        if (searchQuery || hasFilters) {
            return (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <p>No words match your search {searchQuery && `"${searchQuery}"`}</p>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Try adjusting your search or filter settings
                    </p>
                </div>
            );
        }
        return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p>No words found. Create one to get started!</p>
                <IconButton
                    as={Link}
                    to="/lexicon/create"
                    iconName="plus-lg"
                    className={buttonStyles.primary}
                    style={{ marginTop: '1rem' }}
                >
                    Create Your First Word
                </IconButton>
            </div>
        );
    }, [nativeFilter]);

    return (
        <>
            {/* Filter controls */}
            <div style={{ marginBottom: '0.5rem' }}>{filterSlot}</div>

            <DataGallery
                // Data
                data={paginatedLexicons}
                keyExtractor={(lexicon) => lexicon.id}

                // Renderers
                renderDetailed={renderDetailed}
                renderCompact={renderCompact}
                minItemWidth="200px"
                itemGap="1rem"

                // Search
                searchFn={handleSearch}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                searchPlaceholder="Search by lemma, pronunciation, meaning..."

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
                totalCount={filteredAndSortedLexicons.length}

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
                    estimatedItemHeight: viewMode === 'detailed' ? 180 : 200,
                }}
                styling={{
                    content: {
                        style: {padding: '1rem'},
                    }
                }}

                // Accessibility
                ariaLabel="Lexicon gallery"
            />

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={lexiconToDelete !== null}
                setIsOpen={(open) => {
                    if (!open) {
                        setLexiconToDelete(null);
                        setDeleteWarning(null);
                    }
                }}
                onClose={() => {
                    setLexiconToDelete(null);
                    setDeleteWarning(null);
                }}
                allowClose={true}
            >
                <div style={{ padding: '1rem', minWidth: 320 }}>
                    <h2 style={{ marginTop: 0 }}>Delete word</h2>

                    <p>
                        Are you sure you want to delete <strong>{lexiconToDelete?.pronunciation ?? lexiconToDelete?.lemma}</strong>?
                    </p>

                    {deleteWarning && (
                        <div style={{
                            padding: '0.75rem',
                            background: 'var(--status-warning-bg, #fef3cd)',
                            border: '1px solid var(--status-warning, #ffc107)',
                            borderRadius: '4px',
                            marginBottom: '1rem',
                            fontSize: '0.875rem',
                        }}>
                            <strong>Warning:</strong> {deleteWarning}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                        <Button
                            onClick={() => {
                                setLexiconToDelete(null);
                                setDeleteWarning(null);
                            }}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={confirmDelete}
                            disabled={isDeleting}
                            style={{ background: 'var(--danger)', color: 'white' }}
                        >
                            {isDeleting ? 'Deleting...' : 'Delete Word'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
