/**
 * PunctuationTable Component
 *
 * Displays all punctuation marks in a table format with their
 * current configuration and grapheme assignments.
 *
 * @module display/punctuationChart/PunctuationTable
 */

import { useMemo } from 'react';
import classNames from 'classnames';
import PunctuationCell from './PunctuationCell';
import type { PunctuationTableProps } from './types';
import {
    PUNCTUATION_CATEGORIES,
    getPunctuationByCategory,
    type PunctuationCategory,
    type PunctuationKey,
} from '../../../data/punctuationData';
import { DEFAULT_PUNCTUATION_CONFIG } from '../../../db/api/types';
import styles from './PunctuationTable.module.scss';

/**
 * PunctuationTable - Renders all punctuation marks organized by category.
 *
 * @example
 * <PunctuationTable
 *   graphemeMap={graphemeMap}
 *   settings={settings.punctuation}
 *   onAssign={handleAssign}
 *   onToggleNoGlyph={handleToggleNoGlyph}
 *   onClear={handleClear}
 * />
 */
export default function PunctuationTable({
    graphemeMap,
    settings,
    onAssign,
    onToggleNoGlyph,
    onClear,
    isLoading = false,
    category: filterCategory,
    className,
}: PunctuationTableProps) {
    // Filter categories if specified
    const categoriesToShow = useMemo(() => {
        if (filterCategory) {
            return PUNCTUATION_CATEGORIES.filter(c => c.key === filterCategory);
        }
        return PUNCTUATION_CATEGORIES;
    }, [filterCategory]);

    // Get configuration for a punctuation key
    const getConfig = (key: PunctuationKey) => {
        return settings[key] ?? DEFAULT_PUNCTUATION_CONFIG;
    };

    // Render a category section
    const renderCategory = (category: PunctuationCategory, categoryLabel: string) => {
        const marks = getPunctuationByCategory(category);
        if (marks.length === 0) return null;

        return (
            <tbody key={category} className={styles.categoryGroup}>
                <tr className={styles.categoryHeader}>
                    <td colSpan={5}>
                        <span className={styles.categoryLabel}>{categoryLabel}</span>
                    </td>
                </tr>
                {marks.map(mark => (
                    <PunctuationCell
                        key={mark.key}
                        mark={mark}
                        config={getConfig(mark.key)}
                        grapheme={graphemeMap.get(mark.key)}
                        onAssign={onAssign}
                        onToggleNoGlyph={onToggleNoGlyph}
                        onClear={onClear}
                        isLoading={isLoading}
                    />
                ))}
            </tbody>
        );
    };

    return (
        <div className={classNames(styles.container, className)}>
            <table className={styles.table}>
                <thead>
                    <tr className={styles.headerRow}>
                        <th className={styles.headerSymbol}>Symbol</th>
                        <th className={styles.headerLabel}>Name</th>
                        <th className={styles.headerDisplay}>Display</th>
                        <th className={styles.headerStatus}>Status</th>
                        <th className={styles.headerActions}>Actions</th>
                    </tr>
                </thead>
                {categoriesToShow.map(cat => renderCategory(cat.key, cat.label))}
            </table>
        </div>
    );
}

