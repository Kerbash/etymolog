import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { GraphemeComplete } from '../../../../db/types';
import DetailedGraphemeDisplay from './graphemeDisplay/detailed/detailed.tsx';
import CompactGraphemeDisplay from './graphemeDisplay/compact/compact.tsx';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button/button.tsx';
import SvgIcon from 'cyber-components/graphics/decor/svgIcon/svgIcon.tsx';
import classNames from 'classnames';
import styles from './graphemeGallery.module.scss';

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

/**
 * Self-contained gallery component for displaying graphemes
 * Features: search, view mode toggle (expanded/compact), grid display for compact
 */
export default function GraphemeGallery({
    graphemes,
    isLoading,
    error,
    defaultViewMode = 'expanded',
    onGraphemeClick,
}: GraphemeGalleryProps) {
    const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
    const [searchQuery, setSearchQuery] = useState('');

    // Filter graphemes based on search query
    const filteredGraphemes = useMemo(() => {
        if (!searchQuery.trim()) {
            return graphemes;
        }

        const query = searchQuery.toLowerCase().trim();
        return graphemes.filter(grapheme => {
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
    }, [graphemes, searchQuery]);

    if (isLoading) {
        return <div className={styles.galleryContainer}>Loading graphemes...</div>;
    }

    if (error) {
        return <div className={styles.galleryContainer}>Error loading graphemes: {error.message}</div>;
    }

    if (graphemes.length === 0) {
        return (
            <div className={classNames(styles.galleryContainer, styles.emptyState)}>
                <p>No graphemes found. Create one to get started!</p>
                <IconButton
                    as={Link}
                    to="/script-maker/create"
                    iconName="plus-lg"
                    className={buttonStyles.primary}
                >
                    Add Your First Glyph
                </IconButton>
            </div>
        );
    }

    return (
        <div className={styles.galleryContainer}>
            {/* Toolbar: Search + View Toggle */}
            <div className={styles.toolbar}>
                {/* Search Input */}
                <div className={styles.searchContainer} style={{ position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="Search by name, pronunciation..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            paddingLeft: '2rem',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '20px',
                            background: 'var(--surface-base)',
                            color: 'var(--text-primary)',
                            fontSize: '0.875rem',
                        }}
                    />
                    <SvgIcon
                        iconName="search"
                        size="1rem"
                        style={{
                            position: 'absolute',
                            left: '0.75rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            pointerEvents: 'none',
                            color: 'var(--text-secondary)',
                        }}
                    />
                </div>

                {/* View Mode Toggle */}
                <div className={styles.viewToggle}>
                    <button
                        className={classNames(styles.viewButton, { [styles.active]: viewMode === 'expanded' })}
                        onClick={() => setViewMode('expanded')}
                        title="Expanded view"
                    >
                        <SvgIcon iconName="list" size="1.25rem" />
                    </button>
                    <button
                        className={classNames(styles.viewButton, { [styles.active]: viewMode === 'compact' })}
                        onClick={() => setViewMode('compact')}
                        title="Compact grid view"
                    >
                        <SvgIcon iconName="grid-3x3-gap" size="1.25rem" />
                    </button>
                </div>

                {/* Result count */}
                <span className={styles.resultCount}>
                    {filteredGraphemes.length} of {graphemes.length} graphemes
                </span>
            </div>

            {/* Gallery Content */}
            <div className={styles.galleryContent}>
                {filteredGraphemes.length === 0 ? (
                    <div className={styles.noResults}>
                        No graphemes match your search "{searchQuery}"
                    </div>
                ) : viewMode === 'expanded' ? (
                    <div className={styles.expandedList}>
                        {filteredGraphemes.map((grapheme) => (
                            <DetailedGraphemeDisplay key={grapheme.id} graphemeData={grapheme} />
                        ))}
                    </div>
                ) : (
                    <div className={styles.compactGrid}>
                        {filteredGraphemes.map((grapheme) => (
                            <CompactGraphemeDisplay
                                key={grapheme.id}
                                graphemeData={grapheme}
                                onClick={onGraphemeClick ? () => onGraphemeClick(grapheme) : undefined}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
