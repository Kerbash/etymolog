/**
 * IPAConsonantChart Component
 *
 * Displays the IPA pulmonic consonant chart as an interactive table.
 * Place of articulation as columns, manner of articulation as rows.
 * Each cell contains voiceless/voiced pairs.
 *
 * @module display/ipaChart/IPAConsonantChart
 */

import { useMemo, useCallback } from 'react';
import classNames from 'classnames';
import IPAChartCell from './IPAChartCell';
import type { IPAConsonantChartProps } from './types';
import {
    IPA_CONSONANT_CHART,
    PLACES_OF_ARTICULATION,
    MANNERS_OF_ARTICULATION,
    isImpossibleCell,
    type PlaceOfArticulation,
    type MannerOfArticulation,
} from '../../../data/ipaChartData';
import styles from './IPAConsonantChart.module.scss';

/**
 * IPAConsonantChart - Renders the full pulmonic consonant chart.
 *
 * @example
 * const phonemeMap = api.grapheme.getPhonemeMap().data;
 *
 * <IPAConsonantChart
 *   phonemeMap={phonemeMap}
 *   onCellClick={(ipa, grapheme) => {
 *     if (grapheme) {
 *       navigate(`/script-maker/grapheme/db/${grapheme.id}`);
 *     } else {
 *       navigate(`/script-maker/create?phoneme=${encodeURIComponent(ipa)}`);
 *     }
 *   }}
 * />
 */
export default function IPAConsonantChart({
    phonemeMap,
    onCellClick,
    isLoading = false,
    className,
    compact = false,
}: IPAConsonantChartProps) {
    // Memoize the cell lookup
    const getGrapheme = useCallback(
        (ipa: string | null) => {
            if (!ipa) return null;
            return phonemeMap.get(ipa) ?? null;
        },
        [phonemeMap]
    );

    // Generate description for a consonant
    const getDescription = useCallback(
        (manner: MannerOfArticulation, place: PlaceOfArticulation, voiced: boolean) => {
            const voicing = voiced ? 'Voiced' : 'Voiceless';
            const mannerLabel = MANNERS_OF_ARTICULATION.find(m => m.key === manner)?.label || manner;
            const placeLabel = PLACES_OF_ARTICULATION.find(p => p.key === place)?.label || place;
            return `${voicing} ${placeLabel.toLowerCase()} ${mannerLabel.toLowerCase()}`;
        },
        []
    );

    // Render a single consonant cell (voiceless/voiced pair)
    const renderConsonantCell = useCallback(
        (manner: MannerOfArticulation, place: PlaceOfArticulation) => {
            const cell = IPA_CONSONANT_CHART[manner][place];
            const impossible = isImpossibleCell(manner, place);

            // Impossible/shaded cell
            if (impossible) {
                return (
                    <td key={`${manner}-${place}`} className={styles.impossibleCell}>
                        <div className={styles.shadedArea} />
                    </td>
                );
            }

            // Empty cell (no sounds in this position)
            if (!cell.voiceless && !cell.voiced) {
                return (
                    <td key={`${manner}-${place}`} className={styles.emptyCell}>
                        <div className={styles.cellPair}>
                            <div className={styles.emptyHalf} />
                            <div className={styles.emptyHalf} />
                        </div>
                    </td>
                );
            }

            return (
                <td key={`${manner}-${place}`} className={styles.consonantCell}>
                    <div className={styles.cellPair}>
                        {/* Voiceless */}
                        <div className={styles.cellHalf}>
                            {cell.voiceless ? (
                                <IPAChartCell
                                    ipa={cell.voiceless}
                                    grapheme={getGrapheme(cell.voiceless)}
                                    onClick={onCellClick}
                                    isLoading={isLoading}
                                    size="small"
                                    description={getDescription(manner, place, false)}
                                />
                            ) : (
                                <span className={styles.emptySound} />
                            )}
                        </div>
                        {/* Voiced */}
                        <div className={styles.cellHalf}>
                            {cell.voiced ? (
                                <IPAChartCell
                                    ipa={cell.voiced}
                                    grapheme={getGrapheme(cell.voiced)}
                                    onClick={onCellClick}
                                    isLoading={isLoading}
                                    size="small"
                                    description={getDescription(manner, place, true)}
                                />
                            ) : (
                                <span className={styles.emptySound} />
                            )}
                        </div>
                    </div>
                </td>
            );
        },
        [getGrapheme, onCellClick, isLoading, getDescription]
    );

    // Memoize the table rows
    const tableRows = useMemo(() => {
        return MANNERS_OF_ARTICULATION.map(manner => (
            <tr key={manner.key}>
                <th className={styles.rowHeader} scope="row">
                    {manner.label}
                </th>
                {PLACES_OF_ARTICULATION.map(place =>
                    renderConsonantCell(manner.key as MannerOfArticulation, place.key as PlaceOfArticulation)
                )}
            </tr>
        ));
    }, [renderConsonantCell]);

    return (
        <div className={classNames(styles.consonantChart, className)}>
            <h3 className={styles.chartTitle}>Consonants (Pulmonic)</h3>
            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.cornerCell} />
                            {PLACES_OF_ARTICULATION.map(place => (
                                <th
                                    key={place.key}
                                    className={styles.columnHeader}
                                    scope="col"
                                    title={place.label}
                                >
                                    {compact ? place.abbr || place.label : place.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>{tableRows}</tbody>
                </table>
            </div>
            <div className={styles.legend}>
                <span className={styles.legendItem}>
                    <span className={styles.legendVoiceless}>◌</span> Voiceless
                </span>
                <span className={styles.legendItem}>
                    <span className={styles.legendVoiced}>◌</span> Voiced
                </span>
                <span className={styles.legendItem}>
                    <span className={styles.legendShaded} /> Impossible
                </span>
            </div>
        </div>
    );
}
