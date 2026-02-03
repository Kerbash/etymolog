/**
 * IPACombinedChart Component
 *
 * Combines both the IPA Consonant Chart and Vowel Chart into a single
 * pannable/zoomable canvas for better mobile support.
 *
 * @module display/ipaChart/IPACombinedChart
 */

import { useRef } from 'react';
import classNames from 'classnames';
import { PannableCanvas } from 'cyber-components/interactable/canvas/pannableCanvas';
import type { PannableCanvasRef } from 'cyber-components/interactable/canvas/pannableCanvas';
import IPAConsonantChart from './IPAConsonantChart';
import IPAVowelChart from './IPAVowelChart';
import type { GraphemeComplete } from '../../../db/types';
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

    return (
        <div className={classNames(styles.container, className)}>
            <PannableCanvas
                ref={canvasRef}
                minScale={0.3}
                maxScale={2}
                showControls
                centerOnInit
                contentDimensions={{ initialPosition: 'top' }}
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
