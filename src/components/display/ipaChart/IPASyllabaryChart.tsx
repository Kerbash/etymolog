/**
 * IPASyllabaryChart Component
 *
 * Displays a hiragana-style CV syllabary grid with IPA consonants as rows
 * and IPA vowels as columns. Each cell represents a consonant+vowel syllable.
 *
 * Performance: renders ~2,200 cells as lightweight <td> elements with
 * event delegation (single click handler on <tbody>) instead of mounting
 * individual React components per cell.
 *
 * @module display/ipaChart/IPASyllabaryChart
 */

import { useMemo, useCallback } from 'react';
import classNames from 'classnames';
import GlyphSpellingDisplay from '../spelling/GlyphSpellingDisplay';
import type { IPASyllabaryChartProps } from './types';
import { guideTooltipLine } from './guideTiers';
import type { GuideMap, GuideTier } from '../../../generator';
import type { GraphemeComplete } from '../../../db/types';
import {
    SYLLABARY_VOWELS,
    SYLLABARY_CONSONANT_GROUPS,
    VOWEL_BACKNESS_GROUPS,
    getSyllable,
} from '../../../data/syllabaryChartData';
import styles from './IPASyllabaryChart.module.scss';

/**
 * Render the content of a single cell.
 * Assigned cells get a GlyphSpellingDisplay; unassigned get plain text.
 */
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

/** Tier to header class. A lookup, so an unrecognised tier paints nothing. */
const GUIDE_HEADER_CLASS: Record<GuideTier, string> = {
    core: styles.guideCore,
    flavour: styles.guideFlavour,
    avoid: styles.guideAvoid,
};

/**
 * The class and the `title` for one HEADER cell.
 *
 * Only headers are painted. A syllabary is ~40 columns by ~50 rows, and ringing
 * two thousand cells because their consonant is in the flavour produces a wall
 * of colour that says nothing — the row and the column ARE the two sounds, so
 * painting them says the same thing once each.
 */
function guideHeader(
    symbol: string,
    guide: GuideMap | null | undefined,
    guideLabel: string | undefined,
): { className: string | undefined; title: string; tier: GuideTier | undefined } {
    const tier = guide?.get(symbol) ?? null;
    if (!tier) return { className: undefined, title: symbol, tier: undefined };
    return {
        className: GUIDE_HEADER_CLASS[tier],
        title: `${symbol} — ${guideTooltipLine(guideLabel, tier)}`,
        /* The tier as DATA, for the same reason `IPAChartCell` carries it: a
           CSS-module class name is hashed per build, so a test, a debugger and
           any future "show me only the core sounds" filter have nothing stable
           to read. The syllabary was the one painted surface without it. */
        tier,
    };
}

/**
 * IPASyllabaryChart - Renders a CV syllabary grid.
 *
 * Uses event delegation: a single onClick on <tbody> reads `data-ipa`
 * from the clicked cell to identify the syllable — no per-cell handlers.
 */
export default function IPASyllabaryChart({
    phonemeMap,
    onCellClick,
    isLoading = false,
    className,
    guide = null,
    guideLabel,
}: IPASyllabaryChartProps) {
    // Event delegation: single handler on <tbody>
    const handleBodyClick = useCallback(
        (e: React.MouseEvent<HTMLTableSectionElement>) => {
            if (!onCellClick || isLoading) return;

            // Walk up from target to find the <td> with data-ipa
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
        [onCellClick, isLoading, phonemeMap]
    );

    // Build the table body
    const tableBody = useMemo(() => {
        const rows: JSX.Element[] = [];

        // Special "∅" row — standalone vowels (no consonant)
        rows.push(
            <tr key="vowel-only" className={styles.vowelRow}>
                <th className={styles.rowHeader} scope="row" title="Vowels only (no consonant)">
                    ∅
                </th>
                {SYLLABARY_VOWELS.map(vowel => {
                    const grapheme = phonemeMap.get(vowel) ?? null;
                    return (
                        <td
                            key={vowel}
                            data-ipa={vowel}
                            className={classNames(styles.syllableCell, grapheme && styles.assigned)}
                        >
                            <CellContent ipa={vowel} grapheme={grapheme} />
                        </td>
                    );
                })}
            </tr>
        );

        // Consonant group rows
        for (const group of SYLLABARY_CONSONANT_GROUPS) {
            if (group.consonants.length === 0) continue;

            rows.push(
                <tr key={`group-${group.label}`} className={styles.groupSeparator}>
                    <td colSpan={SYLLABARY_VOWELS.length + 1}>{group.label}</td>
                </tr>
            );

            for (const consonant of group.consonants) {
                const header = guideHeader(consonant, guide, guideLabel);
                rows.push(
                    <tr key={`row-${consonant}`}>
                        <th
                            className={classNames(styles.rowHeader, header.className)}
                            scope="row"
                            title={header.title}
                            data-guide={header.tier}
                        >
                            {consonant}
                        </th>
                        {SYLLABARY_VOWELS.map(vowel => {
                            const syllable = getSyllable(consonant, vowel);
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
                );
            }
        }

        return rows;
        // The guide paints the ROW HEADERS, which are built in here — so a
        // flavour change has to invalidate this memo or the overlay freezes.
    }, [phonemeMap, guide, guideLabel]);

    // Backness group colSpan headers
    const backnessHeaders = useMemo(() => (
        VOWEL_BACKNESS_GROUPS.map(group => (
            <th
                key={group.backness}
                className={styles.backnessHeader}
                colSpan={group.vowels.length}
                scope="colgroup"
            >
                {group.label}
            </th>
        ))
    ), []);

    return (
        <div className={classNames(styles.syllabaryChart, className)}>
            <h3 className={styles.chartTitle}>Syllabary (CV)</h3>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th className={styles.cornerCell} />
                        {backnessHeaders}
                    </tr>
                    <tr>
                        <th className={styles.cornerCell} />
                        {SYLLABARY_VOWELS.map(vowel => {
                            const header = guideHeader(vowel, guide, guideLabel);
                            return (
                                <th
                                    key={vowel}
                                    className={classNames(styles.columnHeader, header.className)}
                                    scope="col"
                                    title={header.title}
                                    data-guide={header.tier}
                                >
                                    {vowel}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody onClick={handleBodyClick}>
                    {tableBody}
                </tbody>
            </table>
        </div>
    );
}
