/**
 * IPA Chart Component Types
 *
 * @module display/ipaChart/types
 */

import type { GraphemeComplete } from '../../../db/types';

/**
 * Props for the IPAChartCell component.
 */
export interface IPAChartCellProps {
    /** The IPA character to display */
    ipa: string;
    /** The grapheme associated with this IPA character, if any */
    grapheme?: GraphemeComplete | null;
    /** Click handler for the cell */
    onClick?: (ipa: string, grapheme?: GraphemeComplete | null) => void;
    /** Whether the cell is currently loading */
    isLoading?: boolean;
    /** Optional custom class name */
    className?: string;
    /** Size of the cell */
    size?: 'small' | 'medium' | 'large' | 'vowel';
    /** Description/tooltip text */
    description?: string;
}

/**
 * Props for consonant chart component.
 */
export interface IPAConsonantChartProps {
    /** Map of phonemes to graphemes for lookup */
    phonemeMap: Map<string, GraphemeComplete>;
    /** Click handler for IPA cells */
    onCellClick?: (ipa: string, grapheme?: GraphemeComplete | null) => void;
    /** Whether the chart is loading */
    isLoading?: boolean;
    /** Optional class name */
    className?: string;
    /** Whether to use compact mode (abbreviations) */
    compact?: boolean;
}

/**
 * Props for vowel chart component.
 */
export interface IPAVowelChartProps {
    /** Map of phonemes to graphemes for lookup */
    phonemeMap: Map<string, GraphemeComplete>;
    /** Click handler for IPA cells */
    onCellClick?: (ipa: string, grapheme?: GraphemeComplete | null) => void;
    /** Whether the chart is loading */
    isLoading?: boolean;
    /** Optional class name */
    className?: string;
}

/**
 * Props for the main IPA Chart Page.
 */
export interface IPAChartPageProps {
    /** Optional class name */
    className?: string;
}
