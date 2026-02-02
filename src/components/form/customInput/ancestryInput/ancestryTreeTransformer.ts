/**
 * Ancestry Tree Transformer
 * -------------------------
 * Transforms LexiconAncestryNode data into FlowChartNode or DAGInput format.
 *
 * The key transformation is REVERSING the tree direction:
 * - LexiconAncestryNode: Current word is root, ancestors are children
 * - FlowChartNode/DAGInput: Root ancestors are parents (left), current word is leaf (right)
 *
 * This ensures the chart displays ancestors on the left flowing to
 * the current word on the right in horizontal layout.
 *
 * **Recommended:** Use DAGInput format (ancestryToDAG, selectedAncestorsToDAG) for
 * multiple parents support. FlowChartNode format is kept for backward compatibility.
 */

import type { ReactNode } from 'react';
import type { LexiconAncestryNode, AncestryType, Lexicon } from '../../../../db/types';
import type { FlowChartNode, DAGInput, DAGEdge, DAGNodeData } from 'cyber-components/interactable/canvas/canvasFlowChart';

/**
 * Color mapping for ancestry types (matching EtymologyTreeNode)
 */
export const ANCESTRY_TYPE_COLORS: Record<AncestryType, string> = {
    derived: 'var(--status-info)',
    borrowed: 'var(--status-warning)',
    compound: 'var(--status-good)',
    blend: 'var(--color-primary)',
    calque: 'var(--status-neutral, #888)',
    other: 'var(--text-secondary)',
};

/**
 * Options for the transformation
 */
export interface TransformOptions {
    /** Function to create the display element for a node */
    renderNode: (entry: LexiconAncestryNode['entry'], isCurrentWord: boolean, ancestryType?: AncestryType | null) => ReactNode;
    /** ID of the current word being edited */
    currentWordId?: number;
    /** Maximum depth to traverse (default: 10) */
    maxDepth?: number;
}

/**
 * Internal intermediate structure during tree reversal
 */
interface ReversedNode {
    id: string;
    entry: LexiconAncestryNode['entry'];
    ancestryType: AncestryType | null;
    children: ReversedNode[];
    isCurrentWord: boolean;
}

/**
 * Transforms a LexiconAncestryNode tree into FlowChartNode format.
 *
 * The transformation reverses the tree so that:
 * - Root ancestors (words with no ancestors) become the left-most nodes
 * - The current word becomes the right-most node
 * - Ancestry types are attached to the connection leading TO a node
 *
 * @param rootNode - The root LexiconAncestryNode (current word with its ancestry tree)
 * @param options - Transformation options including render function
 * @returns Array of FlowChartNode trees (one for each root ancestor chain)
 */
export function ancestryToFlowChart(
    rootNode: LexiconAncestryNode,
    options: TransformOptions
): FlowChartNode[] {
    const { renderNode, currentWordId, maxDepth = 10 } = options;

    // Step 1: Collect all unique root ancestors (leaves of the original tree)
    // These will become the roots of the reversed tree
    const roots = findRootAncestors(rootNode, maxDepth);

    // If no ancestors, just return the current word as a single node
    if (roots.length === 0) {
        return [{
            id: `lexicon-${rootNode.entry.id}`,
            displayElement: renderNode(rootNode.entry, true, null),
            children: [],
            data: {
                lexiconId: rootNode.entry.id,
                isCurrentWord: true,
            },
        }];
    }

    // Step 2: Build the reversed tree structure
    // Start from each root ancestor and build paths to the current word
    const reversedTree = buildReversedTree(rootNode, currentWordId);

    // Step 3: Convert to FlowChartNode format
    return reversedTree.map(node => convertToFlowChartNode(node, renderNode));
}

/**
 * Finds all root ancestors (nodes with no further ancestors) in the tree.
 */
function findRootAncestors(
    node: LexiconAncestryNode,
    maxDepth: number,
    depth: number = 0,
    visited: Set<number> = new Set()
): LexiconAncestryNode[] {
    // Prevent infinite loops from cycles
    if (visited.has(node.entry.id) || depth > maxDepth) {
        return [];
    }
    visited.add(node.entry.id);

    // If no ancestors, this is a root
    if (!node.ancestors || node.ancestors.length === 0) {
        return [node];
    }

    // Otherwise, recursively find roots in ancestors
    const roots: LexiconAncestryNode[] = [];
    for (const ancestor of node.ancestors) {
        roots.push(...findRootAncestors(ancestor, maxDepth, depth + 1, visited));
    }
    return roots;
}

/**
 * Builds the reversed tree where root ancestors are parents and current word is leaf.
 */
function buildReversedTree(
    rootNode: LexiconAncestryNode,
    currentWordId?: number
): ReversedNode[] {
    // Map to collect all nodes by ID
    const nodeMap = new Map<number, ReversedNode>();
    // Map to track parent-child relationships (child -> parent)
    const parentMap = new Map<number, { parentId: number; ancestryType: AncestryType | null }[]>();

    // Traverse the original tree and collect relationships
    collectRelationships(rootNode, nodeMap, parentMap, currentWordId);

    // Find root ancestors (nodes that are not children of anyone in our tree)
    const allChildIds = new Set<number>();
    for (const parents of parentMap.values()) {
        for (const { parentId } of parents) {
            allChildIds.add(parentId);
        }
    }

    // Build trees starting from root ancestors
    const roots: ReversedNode[] = [];
    for (const [id, node] of nodeMap) {
        // If this node has no parents in our map, it's a root
        if (!parentMap.has(id) || parentMap.get(id)!.length === 0) {
            const built = buildSubtree(node, nodeMap, parentMap, currentWordId);
            if (built) {
                roots.push(built);
            }
        }
    }

    // If we found no roots (shouldn't happen), return the current word
    if (roots.length === 0 && nodeMap.has(rootNode.entry.id)) {
        return [nodeMap.get(rootNode.entry.id)!];
    }

    return roots;
}

/**
 * Traverses the original tree and collects all nodes and their relationships.
 */
function collectRelationships(
    node: LexiconAncestryNode,
    nodeMap: Map<number, ReversedNode>,
    parentMap: Map<number, { parentId: number; ancestryType: AncestryType | null }[]>,
    currentWordId?: number,
    visited: Set<number> = new Set()
): void {
    if (visited.has(node.entry.id)) return;
    visited.add(node.entry.id);

    // Add this node to the map
    if (!nodeMap.has(node.entry.id)) {
        nodeMap.set(node.entry.id, {
            id: `lexicon-${node.entry.id}`,
            entry: node.entry,
            ancestryType: node.ancestry_type,
            children: [],
            isCurrentWord: node.entry.id === currentWordId,
        });
    }

    // For each ancestor, record that this node is a child of that ancestor
    for (const ancestor of node.ancestors ?? []) {
        // Collect relationships for the ancestor
        collectRelationships(ancestor, nodeMap, parentMap, currentWordId, visited);

        // Record: ancestor -> this node (with ancestry type)
        const ancestorId = ancestor.entry.id;
        if (!parentMap.has(ancestorId)) {
            parentMap.set(ancestorId, []);
        }
        parentMap.get(ancestorId)!.push({
            parentId: node.entry.id,
            ancestryType: ancestor.ancestry_type,
        });
    }
}

/**
 * Builds the subtree for a node in the reversed direction.
 */
function buildSubtree(
    node: ReversedNode,
    nodeMap: Map<number, ReversedNode>,
    parentMap: Map<number, { parentId: number; ancestryType: AncestryType | null }[]>,
    currentWordId?: number,
    visited: Set<number> = new Set()
): ReversedNode | null {
    const nodeId = parseInt(node.id.replace('lexicon-', ''), 10);
    if (visited.has(nodeId)) return null;
    visited.add(nodeId);

    // Get children of this node (nodes that have this as a parent)
    const childRelations = parentMap.get(nodeId) ?? [];
    const children: ReversedNode[] = [];

    for (const { parentId, ancestryType } of childRelations) {
        const childNode = nodeMap.get(parentId);
        if (childNode) {
            const builtChild = buildSubtree(
                { ...childNode, ancestryType },
                nodeMap,
                parentMap,
                currentWordId,
                visited
            );
            if (builtChild) {
                children.push(builtChild);
            }
        }
    }

    return {
        ...node,
        children,
        isCurrentWord: nodeId === currentWordId,
    };
}

/**
 * Converts a ReversedNode to FlowChartNode format.
 */
function convertToFlowChartNode(
    node: ReversedNode,
    renderNode: TransformOptions['renderNode']
): FlowChartNode {
    return {
        id: node.id,
        displayElement: renderNode(node.entry, node.isCurrentWord, node.ancestryType),
        children: node.children.map(child => convertToFlowChartNode(child, renderNode)),
        data: {
            lexiconId: parseInt(node.id.replace('lexicon-', ''), 10),
            isCurrentWord: node.isCurrentWord,
            // This label will be shown on the connector TO this node
            connectionLabel: node.ancestryType ?? undefined,
            connectionLabelStyle: node.ancestryType ? {
                fill: ANCESTRY_TYPE_COLORS[node.ancestryType],
            } : undefined,
        },
    };
}

/**
 * Creates a simple tree for preview from the currently selected ancestors.
 * Used when we don't have full ancestry data yet.
 *
 * @param ancestors - Array of selected ancestor entries
 * @param currentWord - The current word being edited
 * @param renderNode - Function to render node content
 */
export function selectedAncestorsToFlowChart(
    ancestors: Array<{
        entry: LexiconAncestryNode['entry'];
        ancestryType: AncestryType;
    }>,
    currentWord: { lemma: string; id?: number },
    renderNode: TransformOptions['renderNode']
): FlowChartNode[] {
    // Create the current word node
    const currentWordNode: FlowChartNode = {
        id: currentWord.id ? `lexicon-${currentWord.id}` : 'current-word',
        displayElement: renderNode(
            { id: currentWord.id ?? -1, lemma: currentWord.lemma } as LexiconAncestryNode['entry'],
            true,
            null
        ),
        children: [],
        data: {
            isCurrentWord: true,
            lexiconId: currentWord.id,
        },
    };

    // If no ancestors, just return the current word
    if (ancestors.length === 0) {
        return [currentWordNode];
    }

    // Create ancestor nodes that all point to the current word
    // In the flowchart, ancestors are parents (left) -> current word is child (right)
    return ancestors.map((ancestor, index) => ({
        id: `lexicon-${ancestor.entry.id}`,
        displayElement: renderNode(ancestor.entry, false, null),
        children: [
            // Only include current word in first ancestor to avoid duplication
            ...(index === 0 ? [{
                ...currentWordNode,
                data: {
                    ...currentWordNode.data,
                    connectionLabel: ancestor.ancestryType,
                    connectionLabelStyle: {
                        fill: ANCESTRY_TYPE_COLORS[ancestor.ancestryType],
                    },
                },
            }] : []),
        ],
        data: {
            lexiconId: ancestor.entry.id,
            isCurrentWord: false,
        },
    }));
}

// =============================================================================
// DAG TRANSFORMERS (for CanvasDAGChart - supports multiple parents)
// =============================================================================

/**
 * Transforms a LexiconAncestryNode tree into DAGInput format.
 *
 * Unlike FlowChart format (tree-only), DAGInput properly supports:
 * - Multiple parents (compound words, blends)
 * - Diamond patterns (shared ancestors)
 * - Edge labels with ancestry types
 *
 * @param rootNode - The root LexiconAncestryNode (current word with its ancestry tree)
 * @param options - Transformation options including render function
 * @returns DAGInput with nodes record and edges array
 */
export function ancestryToDAG(
    rootNode: LexiconAncestryNode,
    options: TransformOptions
): DAGInput {
    const { renderNode, currentWordId, maxDepth = 10 } = options;
    const nodes: Record<string, DAGNodeData> = {};
    const edges: DAGEdge[] = [];
    const visited = new Set<number>();

    // Add the current word as rightmost node
    const currentId = `lexicon-${rootNode.entry.id}`;
    nodes[currentId] = {
        displayElement: renderNode(rootNode.entry, true, null),
        data: {
            isCurrentWord: true,
            lexiconId: rootNode.entry.id,
        },
    };
    visited.add(rootNode.entry.id);

    /**
     * Recursively processes ancestors, adding nodes and edges.
     * Edges flow from ancestor (source) to child (target).
     */
    function processAncestors(
        node: LexiconAncestryNode,
        childId: string,
        depth: number
    ): void {
        if (depth > maxDepth) return;

        for (const ancestor of node.ancestors ?? []) {
            const ancestorId = `lexicon-${ancestor.entry.id}`;

            // Add edge: ancestor → child (with ancestry type label)
            edges.push({
                sourceId: ancestorId,
                targetId: childId,
                label: ancestor.ancestry_type ?? undefined,
                labelStyle: ancestor.ancestry_type ? {
                    fill: ANCESTRY_TYPE_COLORS[ancestor.ancestry_type],
                    fontSize: '0.65rem',
                } : undefined,
            });

            // Add node if not already visited (handles diamond patterns)
            if (!visited.has(ancestor.entry.id)) {
                visited.add(ancestor.entry.id);
                nodes[ancestorId] = {
                    displayElement: renderNode(
                        ancestor.entry,
                        ancestor.entry.id === currentWordId,
                        ancestor.ancestry_type
                    ),
                    data: {
                        lexiconId: ancestor.entry.id,
                        isCurrentWord: ancestor.entry.id === currentWordId,
                    },
                };

                // Recurse to ancestor's ancestors
                processAncestors(ancestor, ancestorId, depth + 1);
            }
        }
    }

    // Start processing from the root node's ancestors
    processAncestors(rootNode, currentId, 0);

    return { nodes, edges };
}

/**
 * Creates a DAGInput for preview from selected ancestors.
 * Used in create/edit forms when we don't have full ancestry data.
 *
 * All ancestors connect to the current word, properly handling
 * compound words and multiple parent scenarios.
 *
 * @param ancestors - Array of selected ancestor entries with ancestry types
 * @param currentWord - The current word being edited
 * @param renderNode - Function to render node content
 * @returns DAGInput with nodes record and edges array
 */
export function selectedAncestorsToDAG(
    ancestors: Array<{
        ancestor: Lexicon;
        ancestryType: AncestryType;
    }>,
    currentWord: { lemma: string; id?: number },
    renderNode: TransformOptions['renderNode']
): DAGInput {
    const nodes: Record<string, DAGNodeData> = {};
    const edges: DAGEdge[] = [];

    // Create the current word node
    const currentId = currentWord.id ? `lexicon-${currentWord.id}` : 'current-word';
    nodes[currentId] = {
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
    };

    // Add each ancestor and create edges
    for (const { ancestor, ancestryType } of ancestors) {
        const ancestorId = `lexicon-${ancestor.id}`;

        // Add ancestor node (skip if duplicate)
        if (!nodes[ancestorId]) {
            nodes[ancestorId] = {
                displayElement: renderNode(
                    ancestor as LexiconAncestryNode['entry'],
                    false,
                    ancestryType
                ),
                data: {
                    lexiconId: ancestor.id,
                    isCurrentWord: false,
                },
            };
        }

        // Add edge: ancestor → current word
        edges.push({
            sourceId: ancestorId,
            targetId: currentId,
            label: ancestryType,
            labelStyle: {
                fill: ANCESTRY_TYPE_COLORS[ancestryType],
                fontSize: '0.65rem',
            },
        });
    }

    return { nodes, edges };
}

