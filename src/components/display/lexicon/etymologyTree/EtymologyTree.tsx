/**
 * EtymologyTree
 * -------------
 * Ancestors flowing down into the current word, with a legend of what the
 * relationship colours mean.
 *
 * The "no etymology" case is NOT handled here any more: the caller renders an
 * `EmptyState` with an "Add ancestors" action, because the page that shows this
 * tree is the one page that knows how to fix an empty one. A tree that renders
 * a sentence about being empty is a dead end.
 */

import MiniIconCard from 'cyber-components/display/cards/miniIconCard/miniIconCard';

import type { LexiconAncestryNode } from '../../../../db/types';
import { ANCESTRY_LEGEND } from './ancestryTypeStyles';
import EtymologyTreeNode from './EtymologyTreeNode';

import styles from './EtymologyTree.module.scss';

export interface EtymologyTreeProps {
    /** The root node (the current word with its ancestry tree). */
    rootNode: LexiconAncestryNode;
    /** `ancestors` shows parents above; the other directions are reserved. */
    direction?: 'ancestors' | 'descendants' | 'both';
    /** Maximum depth to display (default 3). */
    maxDepth?: number;
    onNodeClick?: (lexiconId: number) => void;
    /** The word being viewed — highlighted, and not clickable. */
    currentWordId?: number;
}

export default function EtymologyTree({
    rootNode,
    direction = 'ancestors',
    maxDepth = 3,
    onNodeClick,
    currentWordId,
}: EtymologyTreeProps) {
    const hasAncestors = rootNode.ancestors && rootNode.ancestors.length > 0;

    if (!hasAncestors && direction === 'ancestors') {
        return null;
    }

    return (
        <div className={styles.treeContainer}>
            <div className={styles.tree}>
                <EtymologyTreeNode
                    node={rootNode}
                    depth={0}
                    maxDepth={maxDepth}
                    isRoot
                    onNodeClick={onNodeClick}
                    currentWordId={currentWordId}
                />
            </div>

            <div className={styles.legend}>
                <h4 className={styles.legendTitle}>Ancestry types</h4>
                <ul className={styles.legendItems}>
                    {ANCESTRY_LEGEND.map((entry) => (
                        <li key={entry.type}>
                            <MiniIconCard
                                iconName="square-fill"
                                iconColor={entry.color}
                                iconSize="0.75em"
                                header={entry.label}
                                headerSize="0.8125rem"
                                description={entry.description}
                                descriptionSize="0.75rem"
                                className={styles.legendCard}
                            />
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
