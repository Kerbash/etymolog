/**
 * IPACombinedChart Component
 *
 * Combines both the IPA Consonant Chart and Vowel Chart into a single
 * pannable/zoomable canvas for better mobile support.
 *
 * @module display/ipaChart/IPACombinedChart
 */

import { useMemo, useRef } from 'react';
import classNames from 'classnames';
import { PannableCanvas } from 'cyber-components/interactable/canvas/pannableCanvas';
import type { PannableCanvasRef } from 'cyber-components/interactable/canvas/pannableCanvas';
import IPAConsonantChart from './IPAConsonantChart';
import IPAVowelChart from './IPAVowelChart';
import type { GraphemeComplete } from '../../../db/types';
import {
    PLACES_OF_ARTICULATION,
    MANNERS_OF_ARTICULATION,
} from '../../../data/ipaChartData';
import styles from './IPACombinedChart.module.scss';

export interface IPACombinedChartProps {
    /** Map of phonemes to graphemes for lookup */
    phonemeMap: Map<string, GraphemeComplete>;
    /** Click handler for IPA cells */
    onCellClick?: (ipa: string, grapheme?: GraphemeComplete | null) => void;
    /** Whether the chart is loading */
    isLoading?: boolean;
    /** Optional class name */
    className?: string;
}

// Layout constants
const CELL_SIZE = 48;
const CELL_PAIR_WIDTH = CELL_SIZE * 2 + 2; // Two cells + gap
const ROW_HEADER_WIDTH = 100;
const COLUMN_HEADER_HEIGHT = 50;
const SECTION_GAP = 48;
const PADDING = 24;
const VOWEL_CHART_SIZE = 600;

/**
 * IPACombinedChart - Combined consonant and vowel charts in a pannable canvas.
 *
 * This component is optimized for mobile viewing by allowing users to
 * pan and zoom to see all IPA sounds clearly.
 *
 * @example
 * <IPACombinedChart
 *   phonemeMap={phonemeMap}
 *   onCellClick={(ipa, grapheme) => handleNavigation(ipa, grapheme)}
 *   isLoading={false}
 * />
 */
export default function IPACombinedChart({
    phonemeMap,
    onCellClick,
    isLoading = false,
    className,
}: IPACombinedChartProps) {
    const canvasRef = useRef<PannableCanvasRef>(null);

    // Calculate content dimensions based on chart data
    const { canvasWidth, canvasHeight, initialScale } = useMemo(() => {
        // Consonant chart dimensions
        // Added extra buffer to width to prevent clipping
        const consonantWidth =
            ROW_HEADER_WIDTH + PLACES_OF_ARTICULATION.length * CELL_PAIR_WIDTH + PADDING * 2 + 100;
        const consonantHeight =
            COLUMN_HEADER_HEIGHT +
            MANNERS_OF_ARTICULATION.length * CELL_SIZE +
            60; // Extra for title and legend

        // Vowel chart dimensions
        const vowelWidth = VOWEL_CHART_SIZE + PADDING * 2 + 100;
        const vowelHeight = VOWEL_CHART_SIZE + 80; // Extra for title and legend

        // Combined dimensions
        const width = Math.max(consonantWidth, vowelWidth);
        const height = consonantHeight + SECTION_GAP + vowelHeight;

        // Calculate initial scale to fit viewport
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth - 32 : 1200;
        const scale = Math.min(1, viewportWidth / width);

        return {
            canvasWidth: width,
            canvasHeight: height,
            initialScale: scale,
        };
    }, []);

    return (
        <div className={classNames(styles.container, className)}>
            <PannableCanvas
                ref={canvasRef}
                initialScale={initialScale}
                minScale={0.3}
                maxScale={2}
                showControls
                centerOnInit
                doubleClickMode="disabled"
                controlsPosition="bottom-right"
                ariaLabel="IPA Chart - International Phonetic Alphabet"
                className={styles.canvas}
            >
                <div className={styles.chartsLayout}>
                    <IPAConsonantChart
                        phonemeMap={phonemeMap}
                        onCellClick={onCellClick}
                        isLoading={isLoading}
                        className={styles.consonantChart}
                    />

                    <IPAVowelChart
                        phonemeMap={phonemeMap}
                        onCellClick={onCellClick}
                        isLoading={isLoading}
                        className={styles.vowelChart}
                    />
                </div>
            </PannableCanvas>
        </div>
    );
}
