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
import type { GraphemeComplete, SpellingDisplayEntry } from '../../../db/types';
import { ComposedSyllablePreview, useSyllablePreviewSpeller } from '../composedSyllable';
import styles from './CustomSyllabaryChart.module.scss';

/**
 * Assigned cells draw their grapheme; an EMPTY cell draws the dimmed composed
 * preview when the block scheme can spell it from existing signs, and its IPA
 * label otherwise.
 */
function CellContent({ ipa, grapheme, preview }: {
    ipa: string;
    grapheme: GraphemeComplete | null;
    preview?: { consonant: string; vowel: string; entries: SpellingDisplayEntry[] } | null;
}) {
    if (!grapheme && preview) {
        return <ComposedSyllablePreview consonant={preview.consonant} vowel={preview.vowel} entries={preview.entries} />;
    }
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

    // Block script: empty cells preview the syllable composed from existing
    // signs. Null (no previews, no spelling work) unless the scheme is on.
    const spellPreview = useSyllablePreviewSpeller();

    // The axes are read out of `chart` first: member expressions as memo
    // dependencies defeat the React compiler (plan P8).
    const xAxis = chart.xAxis;
    const yAxis = chart.yAxis;

    const tableBody = useMemo(() => {
        return yAxis.map(consonant => (
            <tr key={consonant}>
                <th className={styles.rowHeader} scope="row" title={consonant}>
                    {consonant}
                </th>
                {xAxis.map(vowel => {
                    const syllable = consonant + vowel;
                    const grapheme = phonemeMap.get(syllable) ?? null;
                    // Only an EMPTY cell, and only while blocks are on.
                    const entries = !grapheme && spellPreview ? spellPreview(consonant, vowel) : null;
                    return (
                        <td
                            key={vowel}
                            data-ipa={syllable}
                            className={classNames(styles.syllableCell, grapheme && styles.assigned)}
                        >
                            <CellContent
                                ipa={syllable}
                                grapheme={grapheme}
                                preview={entries ? { consonant, vowel, entries } : null}
                            />
                        </td>
                    );
                })}
            </tr>
        ));
    }, [xAxis, yAxis, phonemeMap, spellPreview]);

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
