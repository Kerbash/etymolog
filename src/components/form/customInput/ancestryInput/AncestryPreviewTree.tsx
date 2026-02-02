/**
 * AncestryPreviewTree
 * -------------------
 * Wraps CanvasDAGChart to display an ancestry tree preview.
 * Shows selected ancestors and their full ancestry chains in a
 * left-to-right chart (ancestors on left, current word on right).
 *
 * Uses DAG (Directed Acyclic Graph) rendering to properly support:
 * - Multiple parents (compound words, blends)
 * - Diamond patterns (shared ancestors)
 * - Edge labels showing ancestry types
 */

import { useMemo, useCallback, memo } from 'react';
import type { Lexicon, LexiconAncestryNode, AncestryType } from '@src/db/types';
import { CanvasDAGChart } from 'cyber-components/interactable/canvas/canvasFlowChart';
import type { DAGInput } from 'cyber-components/interactable/canvas/canvasFlowChart';
import AncestryNodeDisplay from './AncestryNodeDisplay';
import { ancestryToDAG, selectedAncestorsToDAG, ANCESTRY_TYPE_COLORS } from './ancestryTreeTransformer';
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
 * Displays an ancestry tree using CanvasDAGChart.
 *
 * When `ancestryTree` is provided, displays the full recursive ancestry.
 * Otherwise, displays a simple graph of selected ancestors -> current word.
 * Always shows at least the current word node.
 *
 * DAG format properly handles multiple parents (e.g., compound words)
 * without node duplication or freezing issues.
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

    // Create the current word node for when there are no ancestors
    const currentWordOnlyDAG = useMemo<DAGInput>(() => ({
        nodes: {
            [currentWord.id ? `lexicon-${currentWord.id}` : 'current-word']: {
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
                data: {
                    isCurrentWord: true,
                    lexiconId: currentWord.id,
                },
            },
        },
        edges: [],
    }), [currentWord.id, currentWord.lemma, renderNode]);

    // Transform data to DAGInput format
    const dagData = useMemo<DAGInput>(() => {
        // 1. Generate the FULL graph from persisted history (if available)
        let fullDAG: DAGInput | null = null;
        if (ancestryTree && ancestryTree.ancestors && ancestryTree.ancestors.length > 0) {
            fullDAG = ancestryToDAG(ancestryTree, {
                renderNode,
                currentWordId: currentWord.id,
                maxDepth: 10,
            });
        }

        // 2. Generate the BASIC graph from current form selection
        if (selectedAncestors && selectedAncestors.length > 0) {
            const basicDAG = selectedAncestorsToDAG(
                selectedAncestors.map(a => ({
                    ancestor: a.ancestor,
                    ancestryType: a.ancestryType,
                })),
                currentWord,
                renderNode
            );

            // 3. Merge: Use Basic DAG as base (correct direct parents), enrich with Full DAG (deep history)
            if (fullDAG) {
                const mergedNodes = { ...basicDAG.nodes };
                const mergedEdges = [...basicDAG.edges];
                const existingEdgeKeys = new Set(mergedEdges.map(e => `${e.sourceId}->${e.targetId}`));

                // Identify selected ancestor IDs
                // const selectedIds = new Set(selectedAncestors.map(a => `lexicon-${a.ancestor.id}`));

                // Find edges in fullDAG that do NOT connect to the current word
                // (i.e., edges deep in the history)
                // AND ensure they belong to a chain that eventually connects to a selected ancestor
                // const currentWordNodeId = currentWord.id ? `lexicon-${currentWord.id}` : 'current-word';

                // We want to keep all nodes/edges from fullDAG that are "upstream" of any node currently in basicDAG (except the current word itself)

                // Simple approach: Add all nodes/edges from fullDAG excluding those directly touching currentWordNodeId
                // provided they are reachable from the selected ancestors.

                // Better: Just check if a selected ancestor exists in fullDAG.
                // If yes, copy its entire upstream subgraph from fullDAG to mergedDAG.

                for (const ancestor of selectedAncestors) {
                    const ancestorNodeId = `lexicon-${ancestor.ancestor.id}`;

                    // If this ancestor existed in the persisted history
                    if (fullDAG.nodes[ancestorNodeId]) {
                        // Traverse upstream from this node in fullDAG
                        const stack = [ancestorNodeId];
                        const visited = new Set<string>();

                        while (stack.length > 0) {
                            const nodeId = stack.pop()!;
                            if (visited.has(nodeId)) continue;
                            visited.add(nodeId);

                            // Copy node if not present
                            if (!mergedNodes[nodeId] && fullDAG.nodes[nodeId]) {
                                mergedNodes[nodeId] = fullDAG.nodes[nodeId];
                            }

                            // Find incoming edges to this node in fullDAG
                            const incomingEdges = fullDAG.edges.filter(e => e.targetId === nodeId);

                            for (const edge of incomingEdges) {
                                // Add edge if not present
                                const edgeKey = `${edge.sourceId}->${edge.targetId}`;
                                if (!existingEdgeKeys.has(edgeKey)) {
                                    mergedEdges.push(edge);
                                    existingEdgeKeys.add(edgeKey);
                                }

                                // Add source to stack
                                stack.push(edge.sourceId);
                            }
                        }
                    }
                }

                return { nodes: mergedNodes, edges: mergedEdges };
            }

            return basicDAG;
        }

        // Fallback: If no selection but we have history (e.g. initial load before form init?), use history
        // But `selectedAncestors` should be populated if `rows` are populated.
        // If rows are empty, we show empty.

        return currentWordOnlyDAG;
    }, [ancestryTree, selectedAncestors, currentWord, renderNode, currentWordOnlyDAG]);

    // Count ancestors for display
    const ancestorCount = selectedAncestors?.length ?? 0;

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
                <CanvasDAGChart
                    data={dagData}
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
                    ariaLabel="Etymology graph showing word ancestry"
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
