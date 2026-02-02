/**
 * IPAVowelChart Component
 *
 * Displays the IPA vowel chart as an interactive SVG trapezoid.
 * Vowels are positioned according to height (vertical) and backness (horizontal).
 *
 * @module display/ipaChart/IPAVowelChart
 */

import { useMemo, useCallback } from 'react';
import classNames from 'classnames';
import IPAChartCell from './IPAChartCell';
import type { IPAVowelChartProps } from './types';
import {
    IPA_VOWEL_CHART,
    getVowelCoordinates,
    VOWEL_HEIGHT_LABELS,
    VOWEL_BACKNESS_LABELS,
} from '../../../data/ipaChartData';
import styles from './IPAVowelChart.module.scss';

/**
 * IPAVowelChart - Renders the IPA vowel trapezoid.
 *
 * The classic IPA vowel chart is a trapezoid shape where:
 * - X-axis represents backness (front → central → back)
 * - Y-axis represents height (close → open)
 * - Paired vowels show unrounded (left) and rounded (right) variants
 *
 * @example
 * <IPAVowelChart
 *   phonemeMap={phonemeMap}
 *   onCellClick={(ipa, grapheme) => handleNavigation(ipa, grapheme)}
 * />
 */
export default function IPAVowelChart({
    phonemeMap,
    onCellClick,
    isLoading = false,
    className,
}: IPAVowelChartProps) {
    const getGrapheme = useCallback(
        (ipa: string) => phonemeMap.get(ipa) ?? null,
        [phonemeMap]
    );

    // Group vowels by position for paired rendering
    const vowelsByPosition = useMemo(() => {
        const grouped = new Map<string, typeof IPA_VOWEL_CHART>();

        for (const vowel of IPA_VOWEL_CHART) {
            const key = `${vowel.height}-${vowel.backness}`;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key)!.push(vowel);
        }

        // Sort each group: unrounded first, then rounded
        for (const [_key, vowels] of grouped) {
            vowels.sort((a, b) => {
                if (a.rounded === b.rounded) return 0;
                return a.rounded ? 1 : -1;
            });
        }

        return grouped;
    }, []);

    // Render vowel cells positioned on the chart
    const vowelCells = useMemo(() => {
        const cells: JSX.Element[] = [];
        // Scale factor: viewBox is 600 units, cells sized to fit glyphs properly
        const cellSize = 48; // Size in viewBox units - matches consonant cell size

        for (const [positionKey, vowels] of vowelsByPosition) {
            // Get coordinates from first vowel (they share position)
            const baseCoords = getVowelCoordinates(vowels[0]);
            // Scale coordinates to 600 unit viewBox
            const coords = {
                x: baseCoords.x * 6,
                y: baseCoords.y * 6,
            };

            // Calculate pair offset - tighter spacing
            const hasPair = vowels.length === 2;
            const pairOffset = hasPair ? 26 : 0;

            vowels.forEach((vowel, idx) => {
                const xOffset = hasPair ? (idx === 0 ? -pairOffset : pairOffset) : 0;

                cells.push(
                    <g
                        key={vowel.ipa}
                        transform={`translate(${coords.x + xOffset}, ${coords.y})`}
                        className={styles.vowelGroup}
                    >
                        <foreignObject
                            x={-cellSize / 2}
                            y={-cellSize / 2}
                            width={cellSize}
                            height={cellSize}
                            className={styles.vowelForeignObject}
                        >
                            <IPAChartCell
                                ipa={vowel.ipa}
                                grapheme={getGrapheme(vowel.ipa)}
                                onClick={onCellClick}
                                isLoading={isLoading}
                                size="vowel"
                                description={vowel.name}
                            />
                        </foreignObject>
                    </g>
                );
            });

            // Draw connecting line for pairs
            if (hasPair) {
                cells.push(
                    <line
                        key={`${positionKey}-line`}
                        x1={coords.x - pairOffset + cellSize / 2 + 2}
                        y1={coords.y}
                        x2={coords.x + pairOffset - cellSize / 2 - 2}
                        y2={coords.y}
                        className={styles.pairLine}
                    />
                );
            }
        }

        return cells;
    }, [vowelsByPosition, getGrapheme, onCellClick, isLoading]);

    return (
        <div className={classNames(styles.vowelChart, className)}>
            <h3 className={styles.chartTitle}>Vowels</h3>
            <div className={styles.chartContainer}>
                <svg
                    viewBox="0 0 600 600"
                    className={styles.vowelSvg}
                    preserveAspectRatio="xMidYMid meet"
                >
                    <defs>
                        <marker
                            id="arrowhead"
                            markerWidth="5"
                            markerHeight="3.5"
                            refX="0"
                            refY="1.75"
                            orient="auto"
                        >
                            <polygon
                                points="0 0, 5 1.75, 0 3.5"
                                fill="var(--text-muted, #666)"
                            />
                        </marker>
                    </defs>

                    {/* Trapezoid outline - scaled to 600 */}
                    <path
                        d={`
                            M 60 30
                            L 540 30
                            L 360 570
                            L 240 570
                            Z
                        `}
                        className={styles.trapezoidOutline}
                    />

                    {/* Horizontal guide lines for heights */}
                    {VOWEL_HEIGHT_LABELS.map((height, idx) => {
                        // Calculate y position and trapezoid width at that height (scaled to 600)
                        const yPercent = 30 + (idx * 540 / (VOWEL_HEIGHT_LABELS.length - 1));
                        const leftX = 60 + (idx * 180 / (VOWEL_HEIGHT_LABELS.length - 1));
                        const rightX = 540 - (idx * 180 / (VOWEL_HEIGHT_LABELS.length - 1));

                        return (
                            <g key={height.key}>
                                <line
                                    x1={leftX}
                                    y1={yPercent}
                                    x2={rightX}
                                    y2={yPercent}
                                    className={styles.guideLine}
                                />
                            </g>
                        );
                    })}

                    {/* Vertical guide lines for backness */}
                    <line x1={300} y1={30} x2={300} y2={570} className={styles.guideLine} />

                    {/* Backness labels (top) */}
                    {VOWEL_BACKNESS_LABELS.map((backness, idx) => {
                        const xPositions = [90, 300, 510];
                        return (
                            <text
                                key={backness.key}
                                x={xPositions[idx]}
                                y={18}
                                className={styles.axisLabel}
                                textAnchor="middle"
                            >
                                {backness.label}
                            </text>
                        );
                    })}

                    {/* Height labels (left side) */}
                    {VOWEL_HEIGHT_LABELS.map((height, idx) => {
                        const yPercent = 30 + (idx * 540 / (VOWEL_HEIGHT_LABELS.length - 1));
                        const leftX = 60 + (idx * 180 / (VOWEL_HEIGHT_LABELS.length - 1));

                        return (
                            <text
                                key={height.key}
                                x={leftX - 8}
                                y={yPercent + 4}
                                className={styles.heightLabel}
                                textAnchor="end"
                            >
                                {height.label}
                            </text>
                        );
                    })}

                    {/* Vowel cells */}
                    {vowelCells}
                </svg>
            </div>
            <div className={styles.legend}>
                <span className={styles.legendItem}>
                    Unrounded • Rounded pairs connected by line
                </span>
            </div>
        </div>
    );
}
