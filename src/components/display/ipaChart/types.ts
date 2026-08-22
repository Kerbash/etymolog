/**
 * IPA Chart Component Types
 *
 * @module display/ipaChart/types
 */

import type { GraphemeComplete } from '../../../db/types';
import type { GuideMap, GuideTier } from '../../../generator';

/**
 * The flavour-guide overlay, shared by every chart.
 *
 * It is PRESENTATION and nothing else: a chart looks each of its symbols up in
 * `guide` and paints the tier it finds. No chart knows what a preset is, which
 * is why the label arrives as a string — the cell needs the preset's NAME for
 * its tooltip and has no business importing the preset registry to get it.
 */
export interface GuideOverlayProps {
    /**
     * Base symbol to tier, from `guideMapFor(preset)`. `null` / absent = no
     * overlay, which is the default state of every chart.
     */
    guide?: GuideMap | null;
    /** The preset's display name, for the cell tooltips ("Elvish / flowing: core sound"). */
    guideLabel?: string;
}

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
    /**
     * Which flavour tier this ONE sound is in, already looked up by the chart.
     * The cell never sees the map — it is the dumbest thing on the page.
     */
    guide?: GuideTier | null;
    /** The preset's display name, used only in the tooltip / accessible name. */
    guideLabel?: string;
}

/**
 * Props for consonant chart component.
 */
export interface IPAConsonantChartProps extends GuideOverlayProps {
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
export interface IPAVowelChartProps extends GuideOverlayProps {
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
 * Props for syllabary chart component.
 */
export interface IPASyllabaryChartProps extends GuideOverlayProps {
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
