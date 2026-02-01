/**
 * AncestryPreviewTree
 * -------------------
 * Wraps CanvasFlowChart to display an ancestry tree preview.
 * Shows selected ancestors and their full ancestry chains in a
 * left-to-right flowchart (ancestors on left, current word on right).
 */

import { useMemo, useCallback, memo } from 'react';
import type { Lexicon, LexiconAncestryNode, AncestryType } from '../../../../db/types';
import CanvasFlowChart from 'cyber-components/interactable/canvas/canvasFlowChart';
import type { FlowChartNode } from 'cyber-components/interactable/canvas/canvasFlowChart';
import AncestryNodeDisplay from './AncestryNodeDisplay';
import { ancestryToFlowChart, selectedAncestorsToFlowChart, ANCESTRY_TYPE_COLORS } from './ancestryTreeTransformer';
import styles from './AncestryPreviewTree.module.scss';

export interface AncestryPreviewTreeProps {
    /** Full ancestry tree data (if available) */
    ancestryTree?: LexiconAncestryNode | null;
    /** Selected ancestors from the form (used when no full tree available) */
    selectedAncestors?: Array<{
        ancestor: Lexicon;
        ancestryType: AncestryType;
    }>;
    /** Current word being edited */
    currentWord: {
        id?: number;
        lemma: string;
    };
    /** Maximum height for the tree container */
    maxHeight?: number;
    /** Callback when a node is clicked */
    onNodeClick?: (lexiconId: number) => void;
}

/**
 * Displays an ancestry tree using CanvasFlowChart.
 *
 * When `ancestryTree` is provided, displays the full recursive ancestry.
 * Otherwise, displays a simple tree of selected ancestors -> current word.
 * Always shows at least the current word node.
 */
const AncestryPreviewTree = memo(function AncestryPreviewTree({
    ancestryTree,
    selectedAncestors,
    currentWord,
    maxHeight = 300,
    onNodeClick,
}: AncestryPreviewTreeProps) {
    // Render function for nodes
    const renderNode = useCallback((
        entry: LexiconAncestryNode['entry'],
        isCurrentWord: boolean,
        ancestryType?: AncestryType | null
    ) => {
        return (
            <AncestryNodeDisplay
                entry={entry}
                isCurrentWord={isCurrentWord}
                ancestryType={ancestryType}
                onClick={onNodeClick}
            />
        );
    }, [onNodeClick]);

    // Create the current word node (always shown)
    const currentWordNode = useMemo<FlowChartNode>(() => ({
        id: currentWord.id ? `lexicon-${currentWord.id}` : 'current-word',
        displayElement: renderNode(
            {
                id: currentWord.id ?? -1,
                lemma: currentWord.lemma,
                pronunciation: null,
                is_native: true,
            } as LexiconAncestryNode['entry'],
            true,
            null
        ),
        children: [],
        data: {
            isCurrentWord: true,
            lexiconId: currentWord.id,
        },
    }), [currentWord.id, currentWord.lemma, renderNode]);

    // Transform data to FlowChartNode format
    const flowChartData = useMemo<FlowChartNode[]>(() => {
        // If we have full ancestry tree with ancestors, use it
        if (ancestryTree && ancestryTree.ancestors && ancestryTree.ancestors.length > 0) {
            return ancestryToFlowChart(ancestryTree, {
                renderNode,
                currentWordId: currentWord.id,
                maxDepth: 10,
            });
        }

        // If we have selected ancestors from form, use simple preview
        if (selectedAncestors && selectedAncestors.length > 0) {
            return selectedAncestorsToFlowChart(
                selectedAncestors.map(a => ({
                    entry: a.ancestor,
                    ancestryType: a.ancestryType,
                })),
                currentWord,
                renderNode
            );
        }

        // No ancestors - return just the current word node
        return [currentWordNode];
    }, [ancestryTree, selectedAncestors, currentWord, renderNode, currentWordNode]);

    // Count ancestors for display
    const ancestorCount = ancestryTree?.ancestors?.length ?? selectedAncestors?.length ?? 0;

    return (
        <div className={styles.previewContainer} style={{ maxHeight }}>
            <div className={styles.header}>
                <span className={styles.title}>
                    Etymology Tree Preview
                    {ancestorCount === 0 && (
                        <span className={styles.noAncestorsHint}> (no ancestors)</span>
                    )}
                </span>
                <div className={styles.legend}>
                    {Object.entries(ANCESTRY_TYPE_COLORS).slice(0, 4).map(([type, color]) => (
                        <span key={type} className={styles.legendItem}>
                            <span
                                className={styles.legendDot}
                                style={{ backgroundColor: color }}
                            />
                            {type}
                        </span>
                    ))}
                </div>
            </div>

            <div className={styles.chartContainer}>
                <CanvasFlowChart
                    data={flowChartData}
                    layout={{
                        direction: 'horizontal',
                        levelSpacing: 100,
                        siblingSpacing: 30,
                        nodePadding: 4,
                        minNodeWidth: 60,
                        minNodeHeight: 24,
                    }}
                    connectorStyle={{
                        curveType: 'bezier',
                        strokeWidth: 2,
                        stroke: 'var(--border-primary)',
                        showArrow: true,
                    }}
                    animation={{
                        enabled: true,
                        staggerDelay: 50,
                        animateConnectors: true,
                    }}
                    showControls={true}
                    showDirectionArrow={true}
                    initialScale={0.9}
                    minScale={0.3}
                    maxScale={2}
                    ariaLabel="Etymology tree showing word ancestry"
                />
            </div>

            <div className={styles.footer}>
                <span className={styles.footerNote}>
                    ← Root ancestors | Current word →
                </span>
            </div>
        </div>
    );
});

export default AncestryPreviewTree;
