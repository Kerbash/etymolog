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
import IPAExtraSoundsChart from './IPAExtraSoundsChart';
import IPAVowelChart from './IPAVowelChart';
import type { GuideOverlayProps } from './types';
import type { GraphemeComplete } from '../../../db/types';
import styles from './IPACombinedChart.module.scss';

export interface IPACombinedChartProps extends GuideOverlayProps {
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
    guide = null,
    guideLabel,
}: IPACombinedChartProps) {
    const canvasRef = useRef<PannableCanvasRef>(null);

    return (
        <div className={classNames(styles.container, className)}>
            <PannableCanvas
                ref={canvasRef}
                minScale={0.3}
                maxScale={2}
                showControls
                /* Wheel-zoom OFF: this chart is a full-width viewport in a
                   normally-scrolling page, and PannableCanvas' wheel-zoom binds a
                   non-passive wheel listener that preventDefault()s the page
                   scroll — so a wheel over the chart (i.e. most of the page)
                   stalled scrolling and forced users onto the scrollbar. Zoom
                   stays available via the on-canvas +/−/⟲ controls and pinch. */
                enableWheel={false}
                contentDimensions={{
                    initialPosition: "top",
                    autoFit: {
                        enabled: true,
                        axis: 'width',
                        padding: 16,
                        refitOnResize: true,
                    },
                }}
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
                        guide={guide}
                        guideLabel={guideLabel}
                        className={styles.consonantChart}
                    />

                    {/* Between the two big charts, not after them: it is a
                        consonant strip, and the sounds in it belong next to the
                        pulmonic grid they are missing from rather than below
                        the vowels. */}
                    <IPAExtraSoundsChart
                        phonemeMap={phonemeMap}
                        onCellClick={onCellClick}
                        isLoading={isLoading}
                        guide={guide}
                        guideLabel={guideLabel}
                        className={styles.extraChart}
                    />

                    <IPAVowelChart
                        phonemeMap={phonemeMap}
                        onCellClick={onCellClick}
                        isLoading={isLoading}
                        guide={guide}
                        guideLabel={guideLabel}
                        className={styles.vowelChart}
                    />
                </div>
            </PannableCanvas>
        </div>
    );
}
