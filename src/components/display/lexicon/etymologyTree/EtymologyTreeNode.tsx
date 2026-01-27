/**
 * EtymologyTreeNode
 * ----------------
 * Recursive component for rendering a single node in the etymology tree.
 */

import { useState, useCallback } from 'react';
import type { LexiconAncestryNode, AncestryType } from '../../../../db/types';
import styles from './EtymologyTree.module.scss';
import classNames from 'classnames';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';

interface EtymologyTreeNodeProps {
    node: LexiconAncestryNode;
    depth: number;
    maxDepth: number;
    isRoot?: boolean;
    onNodeClick?: (lexiconId: number) => void;
    currentWordId?: number;
}

// Color mapping for ancestry types
const ANCESTRY_TYPE_COLORS: Record<AncestryType, string> = {
    derived: 'var(--status-info)',
    borrowed: 'var(--status-warning)',
    compound: 'var(--status-good)',
    blend: 'var(--color-primary)',
    calque: 'var(--status-neutral, #888)',
    other: 'var(--text-secondary)',
};

export default function EtymologyTreeNode({
    node,
    depth,
    maxDepth,
    isRoot = false,
    onNodeClick,
    currentWordId,
}: EtymologyTreeNodeProps) {
    const [isExpanded, setIsExpanded] = useState(depth < 2); // Auto-expand first 2 levels

    const hasAncestors = node.ancestors && node.ancestors.length > 0;
    const canExpand = hasAncestors && depth < maxDepth;
    const isCurrent = node.entry.id === currentWordId;

    const toggleExpand = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsExpanded(prev => !prev);
    }, []);

    const handleClick = useCallback(() => {
        if (onNodeClick && !isCurrent) {
            onNodeClick(node.entry.id);
        }
    }, [onNodeClick, node.entry.id, isCurrent]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if ((e.key === 'Enter' || e.key === ' ') && onNodeClick && !isCurrent) {
            e.preventDefault();
            onNodeClick(node.entry.id);
        }
    }, [onNodeClick, node.entry.id, isCurrent]);

    const ancestryColor = node.ancestry_type
        ? ANCESTRY_TYPE_COLORS[node.ancestry_type]
        : 'var(--border-primary)';

    return (
        <div className={styles.nodeContainer}>
            {/* Ancestors branch (displayed above/before the node) */}
            {canExpand && isExpanded && (
                <div className={styles.ancestorsBranch}>
                    {node.ancestors.map((ancestor, index) => (
                        <div key={ancestor.entry.id} className={styles.ancestorWrapper}>
                            <EtymologyTreeNode
                                node={ancestor}
                                depth={depth + 1}
                                maxDepth={maxDepth}
                                onNodeClick={onNodeClick}
                                currentWordId={currentWordId}
                            />
                            {/* Connector line */}
                            <div
                                className={styles.connector}
                                style={{
                                    borderColor: ancestor.ancestry_type
                                        ? ANCESTRY_TYPE_COLORS[ancestor.ancestry_type]
                                        : 'var(--border-primary)',
                                }}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* The node itself */}
            <div
                className={classNames(styles.node, {
                    [styles.root]: isRoot,
                    [styles.current]: isCurrent,
                    [styles.clickable]: onNodeClick && !isCurrent,
                })}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                role={onNodeClick && !isCurrent ? 'button' : undefined}
                tabIndex={onNodeClick && !isCurrent ? 0 : undefined}
            >
                {/* Expand/collapse button */}
                {canExpand && (
                    <IconButton
                        iconName={isExpanded ? 'chevron-up' : 'chevron-down'}
                        onClick={toggleExpand}
                        iconSize="0.75rem"
                        themeType="basic"
                        className={styles.expandButton}
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    />
                )}

                {/* Ancestry type badge (if not root) */}
                {!isRoot && node.ancestry_type && (
                    <span
                        className={styles.ancestryBadge}
                        style={{ backgroundColor: ancestryColor }}
                    >
                        {node.ancestry_type}
                    </span>
                )}

                {/* Lemma */}
                <span className={styles.lemma}>{node.entry.lemma}</span>

                {/* Pronunciation */}
                {node.entry.pronunciation && (
                    <span className={styles.pronunciation}>/{node.entry.pronunciation}/</span>
                )}

                {/* Indicator for more ancestors at depth limit */}
                {hasAncestors && depth >= maxDepth && (
                    <span className={styles.moreIndicator}>+{node.ancestors.length}</span>
                )}
            </div>
        </div>
    );
}
