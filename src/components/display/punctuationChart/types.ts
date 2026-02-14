/**
 * Punctuation Chart Component Types
 *
 * @module display/punctuationChart/types
 */

import type { GraphemeComplete } from '../../../db/types';
import type { PunctuationConfig } from '../../../db/api/types';
import type { PunctuationKey, PunctuationMark, PunctuationCategory } from '../../../data/punctuationData';

/**
 * Props for the PunctuationCell component.
 */
export interface PunctuationCellProps {
    /** The punctuation mark data */
    mark: PunctuationMark;
    /** The current configuration for this punctuation */
    config: PunctuationConfig;
    /** The grapheme associated with this punctuation, if any */
    grapheme?: GraphemeComplete | null;
    /** Callback when user wants to assign a grapheme */
    onAssign?: (key: PunctuationKey) => void;
    /** Callback when user wants to toggle "no glyph" mode */
    onToggleNoGlyph?: (key: PunctuationKey, useNoGlyph: boolean) => void;
    /** Callback when user wants to clear the assignment */
    onClear?: (key: PunctuationKey) => void;
    /** Whether the cell is currently loading */
    isLoading?: boolean;
    /** Optional custom class name */
    className?: string;
}

/**
 * Props for the PunctuationTable component.
 */
export interface PunctuationTableProps {
    /** Map of punctuation keys to their grapheme assignments */
    graphemeMap: Map<PunctuationKey, GraphemeComplete>;
    /** Current punctuation settings */
    settings: Record<PunctuationKey, PunctuationConfig>;
    /** Callback when user wants to assign a grapheme */
    onAssign?: (key: PunctuationKey) => void;
    /** Callback when user wants to toggle "no glyph" mode */
    onToggleNoGlyph?: (key: PunctuationKey, useNoGlyph: boolean) => void;
    /** Callback when user wants to clear the assignment */
    onClear?: (key: PunctuationKey) => void;
    /** Whether the table is loading */
    isLoading?: boolean;
    /** Optional filter by category */
    category?: PunctuationCategory;
    /** Optional class name */
    className?: string;
}

/**
 * Props for the main Punctuation Page.
 */
export interface PunctuationPageProps {
    /** Optional class name */
    className?: string;
}


