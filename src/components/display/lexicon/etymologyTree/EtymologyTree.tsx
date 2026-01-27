/**
 * EtymologyTree
 * ----------------
 * Visual tree component for displaying etymology/ancestry relationships.
 * Shows ancestors flowing into the current word.
 */

import type { LexiconAncestryNode } from '../../../../db/types';
import EtymologyTreeNode from './EtymologyTreeNode';
import styles from './EtymologyTree.module.scss';

export interface EtymologyTreeProps {
    /** The root node (current word with its ancestry tree) */
    rootNode: LexiconAncestryNode;
    /** Direction to display: 'ancestors' shows parents above, 'descendants' shows children below */
    direction?: 'ancestors' | 'descendants' | 'both';
    /** Maximum depth to display (default: 3) */
    maxDepth?: number;
    /** Callback when a node is clicked */
    onNodeClick?: (lexiconId: number) => void;
    /** ID of the current word (highlighted differently) */
    currentWordId?: number;
}

/**
 * EtymologyTree - Visual tree for etymology relationships
 *
 * Displays a hierarchical view of word ancestry. The tree flows from
 * ancestors at the top down to the current word at the bottom.
 */
export default function EtymologyTree({
    rootNode,
    direction = 'ancestors',
    maxDepth = 3,
    onNodeClick,
    currentWordId,
}: EtymologyTreeProps) {
    const hasAncestors = rootNode.ancestors && rootNode.ancestors.length > 0;

    if (!hasAncestors && direction === 'ancestors') {
        return (
            <div className={styles.emptyTree}>
                <p>No etymology data available for this word.</p>
            </div>
        );
    }

    return (
        <div className={styles.treeContainer}>
            <div className={styles.tree}>
                <EtymologyTreeNode
                    node={rootNode}
                    depth={0}
                    maxDepth={maxDepth}
                    isRoot={true}
                    onNodeClick={onNodeClick}
                    currentWordId={currentWordId}
                />
            </div>

            {/* Legend */}
            <div className={styles.legend}>
                <span className={styles.legendTitle}>Ancestry Types:</span>
                <div className={styles.legendItems}>
                    <span className={styles.legendItem}>
                        <span className={styles.legendColor} style={{ backgroundColor: 'var(--status-info)' }} />
                        derived
                    </span>
                    <span className={styles.legendItem}>
                        <span className={styles.legendColor} style={{ backgroundColor: 'var(--status-warning)' }} />
                        borrowed
                    </span>
                    <span className={styles.legendItem}>
                        <span className={styles.legendColor} style={{ backgroundColor: 'var(--status-good)' }} />
                        compound
                    </span>
                    <span className={styles.legendItem}>
                        <span className={styles.legendColor} style={{ backgroundColor: 'var(--color-primary)' }} />
                        blend
                    </span>
                    <span className={styles.legendItem}>
                        <span className={styles.legendColor} style={{ backgroundColor: 'var(--status-neutral, #888)' }} />
                        calque
                    </span>
                    <span className={styles.legendItem}>
                        <span className={styles.legendColor} style={{ backgroundColor: 'var(--text-secondary)' }} />
                        other
                    </span>
                </div>
            </div>
        </div>
    );
}
