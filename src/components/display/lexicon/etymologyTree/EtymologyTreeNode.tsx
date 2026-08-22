/**
 * EtymologyTreeNode
 * -----------------
 * One node of the etymology tree, rendered recursively.
 *
 * Two changes worth knowing about:
 *
 *  1. the ancestry colour is a MODIFIER CLASS from `ancestryTypeStyles`, not an
 *     inline `style={{ backgroundColor: … }}` — the map used to be duplicated
 *     between this file and the legend, so the two could drift;
 *  2. `node.truncated` is honoured. `getAncestryTree` marks a subtree it cut at
 *     `maxDepth` (or a cycle guard) rather than returning it as a childless
 *     node — without rendering that flag, a word whose ancestry runs deeper
 *     than the limit LOOKS like a root, which is the opposite of true.
 */

import classNames from 'classnames';
import { useCallback, useState } from 'react';

import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';

import type { LexiconAncestryNode } from '../../../../db/types';
import { lexiconDisplayName } from '../../../tabs/lexicon/lexiconIdentity';
import { ancestryTypeClass } from './ancestryTypeStyles';

import styles from './EtymologyTree.module.scss';

interface EtymologyTreeNodeProps {
    node: LexiconAncestryNode;
    depth: number;
    maxDepth: number;
    isRoot?: boolean;
    onNodeClick?: (lexiconId: number) => void;
    currentWordId?: number;
}

export default function EtymologyTreeNode({
    node,
    depth,
    maxDepth,
    isRoot = false,
    onNodeClick,
    currentWordId,
}: EtymologyTreeNodeProps) {
    const [isExpanded, setIsExpanded] = useState(depth < 2);

    const hasAncestors = node.ancestors && node.ancestors.length > 0;
    const canExpand = hasAncestors && depth < maxDepth;
    const isCurrent = node.entry.id === currentWordId;
    const isClickable = Boolean(onNodeClick) && !isCurrent;

    const toggleExpand = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsExpanded((prev) => !prev);
    }, []);

    const handleClick = useCallback(() => {
        if (isClickable) onNodeClick?.(node.entry.id);
    }, [isClickable, onNodeClick, node.entry.id]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if ((e.key === 'Enter' || e.key === ' ') && isClickable) {
                e.preventDefault();
                onNodeClick?.(node.entry.id);
            }
        },
        [isClickable, onNodeClick, node.entry.id],
    );

    return (
        <div className={styles.nodeContainer}>
            {canExpand && isExpanded && (
                <div className={styles.ancestorsBranch}>
                    {node.ancestors.map((ancestor) => (
                        <div key={ancestor.entry.id} className={styles.ancestorWrapper}>
                            <EtymologyTreeNode
                                node={ancestor}
                                depth={depth + 1}
                                maxDepth={maxDepth}
                                onNodeClick={onNodeClick}
                                currentWordId={currentWordId}
                            />
                            <div
                                className={classNames(
                                    styles.connector,
                                    ancestryTypeClass(ancestor.ancestry_type),
                                )}
                            />
                        </div>
                    ))}
                </div>
            )}

            <div
                className={classNames(styles.node, {
                    [styles.root]: isRoot,
                    [styles.current]: isCurrent,
                    [styles.clickable]: isClickable,
                })}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
            >
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

                {!isRoot && node.ancestry_type && (
                    <span
                        className={classNames(
                            styles.ancestryBadge,
                            ancestryTypeClass(node.ancestry_type),
                        )}
                    >
                        {node.ancestry_type}
                    </span>
                )}

                <span className={styles.lemma}>{lexiconDisplayName(node.entry)}</span>

                {node.entry.pronunciation && (
                    <span className={styles.pronunciation}>/{node.entry.pronunciation}/</span>
                )}

                {/* Cut by the depth limit: say so, rather than letting it read
                    as a root that genuinely has no ancestors. */}
                {node.truncated && (
                    <span
                        className={styles.truncatedBadge}
                        title="This word has more ancestors than the tree is showing"
                    >
                        …
                        <span className={styles.srOnly}>
                            More ancestors not shown at this depth
                        </span>
                    </span>
                )}

                {hasAncestors && depth >= maxDepth && (
                    <span className={styles.moreIndicator}>+{node.ancestors.length}</span>
                )}
            </div>
        </div>
    );
}
