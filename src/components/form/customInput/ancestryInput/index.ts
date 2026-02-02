export { AncestryInput, default } from './AncestryInput';
export type { AncestryInputProps } from './AncestryInput';

export { default as AncestryPreviewTree } from './AncestryPreviewTree';
export type { AncestryPreviewTreeProps } from './AncestryPreviewTree';

export { default as AncestryNodeDisplay } from './AncestryNodeDisplay';
export type { AncestryNodeDisplayProps } from './AncestryNodeDisplay';

export {
    // DAG format (recommended - supports multiple parents)
    ancestryToDAG,
    selectedAncestorsToDAG,
    // FlowChart format (tree-only, backward compatibility)
    ancestryToFlowChart,
    selectedAncestorsToFlowChart,
    // Shared utilities
    ANCESTRY_TYPE_COLORS,
} from './ancestryTreeTransformer';
export type { TransformOptions } from './ancestryTreeTransformer';

