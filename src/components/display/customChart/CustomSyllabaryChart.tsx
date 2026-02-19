/**
 * CustomSyllabaryChart Component
 *
 * Renders a 2D grid with user-defined X/Y axes.
 * Cell at [x,y] = phoneme "y + x", resolved via phonemeMap.
 *
 * @module display/customChart/CustomSyllabaryChart
 */

import { useMemo, useCallback } from 'react';
import classNames from 'classnames';
import GlyphSpellingDisplay from '../spelling/GlyphSpellingDisplay';
import type { CustomSyllabaryChartProps } from './types';
import type { GraphemeComplete } from '../../../db/types';
import styles from './CustomSyllabaryChart.module.scss';

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

export default function CustomSyllabaryChart({
    chart,
    phonemeMap,
    onCellClick,
    className,
}: CustomSyllabaryChartProps) {
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

    const tableBody = useMemo(() => {
        return chart.yAxis.map(consonant => (
            <tr key={consonant}>
                <th className={styles.rowHeader} scope="row" title={consonant}>
                    {consonant}
                </th>
                {chart.xAxis.map(vowel => {
                    const syllable = consonant + vowel;
                    const grapheme = phonemeMap.get(syllable) ?? null;
                    return (
                        <td
                            key={vowel}
                            data-ipa={syllable}
                            className={classNames(styles.syllableCell, grapheme && styles.assigned)}
                        >
                            <CellContent ipa={syllable} grapheme={grapheme} />
                        </td>
                    );
                })}
            </tr>
        ));
    }, [chart.xAxis, chart.yAxis, phonemeMap]);

    return (
        <div className={classNames(styles.syllabaryChart, className)}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th className={styles.cornerCell} />
                        {chart.xAxis.map(vowel => (
                            <th
                                key={vowel}
                                className={styles.columnHeader}
                                scope="col"
                                title={vowel}
                            >
                                {vowel}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody onClick={handleBodyClick}>
                    {tableBody}
                </tbody>
            </table>
        </div>
    );
}
