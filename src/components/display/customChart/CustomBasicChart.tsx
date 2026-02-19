/**
 * CustomBasicChart Component
 *
 * Renders a flat chart of IPA characters as paired rows:
 * top row = IPA pronunciation, bottom row = grapheme (via GlyphSpellingDisplay).
 * Wraps into additional row pairs when characters exceed maxColumns.
 *
 * @module display/customChart/CustomBasicChart
 */

import React, { useMemo, useCallback } from 'react';
import classNames from 'classnames';
import GlyphSpellingDisplay from '../spelling/GlyphSpellingDisplay';
import type { CustomBasicChartProps } from './types';
import type { GraphemeComplete } from '../../../db/types';
import styles from './CustomBasicChart.module.scss';

const MAX_COLUMNS = 15;

function CellContent({ ipa, grapheme }: { ipa: string; grapheme: GraphemeComplete | null }) {
    if (grapheme && grapheme.glyphs.length > 0) {
        return (
            <div className={styles.cellAssigned}>
                <GlyphSpellingDisplay
                    glyphs={grapheme.glyphs}
                    strategy="ltr"
                    config={{ glyphWidth: 32, glyphHeight: 32, spacing: 0, padding: 0 }}
                    showVirtualGlyphStyling={false}
                    className={styles.glyphDisplay}
                />
            </div>
        );
    }
    return <span className={styles.cellIpa}>{ipa}</span>;
}

export default function CustomBasicChart({
    chart,
    phonemeMap,
    onCellClick,
    className,
}: CustomBasicChartProps) {
    const handleBodyClick = useCallback(
        (e: React.MouseEvent<HTMLTableSectionElement>) => {
            if (!onCellClick) return;
            let el = e.target as HTMLElement | null;
            while (el && el.tagName !== 'TBODY') {
                if (el.tagName === 'TD' && el.dataset.ipa) {
                    const ipa = el.dataset.ipa;
                    const grapheme = phonemeMap.get(ipa) ?? null;
                    onCellClick(ipa, grapheme);
                    return;
                }
                el = el.parentElement;
            }
        },
        [onCellClick, phonemeMap]
    );

    const chunks = useMemo(() => {
        const result: string[][] = [];
        for (let i = 0; i < chart.ipaCharacters.length; i += MAX_COLUMNS) {
            result.push(chart.ipaCharacters.slice(i, i + MAX_COLUMNS));
        }
        return result;
    }, [chart.ipaCharacters]);

    return (
        <div className={classNames(styles.basicChart, className)}>
            <table className={styles.table}>
                <tbody onClick={handleBodyClick}>
                    {chunks.map((chunk, chunkIdx) => (
                        <React.Fragment key={chunkIdx}>
                            <tr className={styles.ipaRow}>
                                {chunk.map(ipa => (
                                    <td
                                        key={ipa}
                                        data-ipa={ipa}
                                        className={classNames(
                                            styles.syllableCell,
                                            phonemeMap.has(ipa) && styles.assigned,
                                        )}
                                    >
                                        <span className={styles.cellIpaLabel}>{ipa}</span>
                                    </td>
                                ))}
                            </tr>
                            <tr className={styles.graphemeRow}>
                                {chunk.map(ipa => {
                                    const grapheme = phonemeMap.get(ipa) ?? null;
                                    return (
                                        <td
                                            key={ipa}
                                            data-ipa={ipa}
                                            className={classNames(
                                                styles.syllableCell,
                                                grapheme && styles.assigned,
                                            )}
                                        >
                                            <CellContent ipa={ipa} grapheme={grapheme} />
                                        </td>
                                    );
                                })}
                            </tr>
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
