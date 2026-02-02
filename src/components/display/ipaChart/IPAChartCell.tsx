/**
 * IPAChartCell Component
 *
 * A single cell in the IPA chart that displays either:
 * - A glyph/grapheme if the IPA character has been assigned
 * - A grayed-out IPA character if not assigned
 *
 * Clicking the cell navigates to create/edit grapheme pages.
 *
 * @module display/ipaChart/IPAChartCell
 */

import { useMemo } from 'react';
import classNames from 'classnames';
import HoverToolTip from 'cyber-components/interactable/information/hoverToolTip/hoverToolTip';
import GlyphSpellingDisplay from '../spelling/GlyphSpellingDisplay';
import type { IPAChartCellProps } from './types';
import styles from './IPAChartCell.module.scss';

/**
 * IPAChartCell - Displays an IPA character with its associated grapheme (if any).
 *
 * When a grapheme is assigned, it shows the glyph(s) from that grapheme.
 * When unassigned, it shows the IPA character in a grayed-out style.
 *
 * @example
 * // Assigned cell with grapheme
 * <IPAChartCell
 *   ipa="p"
 *   grapheme={graphemeData}
 *   onClick={(ipa, grapheme) => navigate(`/edit/${grapheme.id}`)}
 *   description="Voiceless bilabial plosive"
 * />
 *
 * @example
 * // Unassigned cell
 * <IPAChartCell
 *   ipa="ʈ"
 *   onClick={(ipa) => navigate(`/create?phoneme=${ipa}`)}
 *   description="Voiceless retroflex plosive"
 * />
 */
export default function IPAChartCell({
    ipa,
    grapheme,
    onClick,
    isLoading = false,
    className,
    size = 'medium',
    description,
}: IPAChartCellProps) {
    const isAssigned = Boolean(grapheme && grapheme.glyphs.length > 0);

    const handleClick = () => {
        if (onClick && !isLoading) {
            onClick(ipa, grapheme);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick && !isLoading) {
            e.preventDefault();
            onClick(ipa, grapheme);
        }
    };

    // Build tooltip content
    const tooltipContent = useMemo(() => {
        const parts: string[] = [];
        if (description) parts.push(description);
        if (isAssigned) {
            parts.push(`Grapheme: ${grapheme!.name}`);
        } else {
            parts.push('Click to create grapheme');
        }
        return parts.join('\n');
    }, [description, isAssigned, grapheme]);

    const cellContent = (
        <div
            className={classNames(
                styles.cell,
                styles[size],
                {
                    [styles.assigned]: isAssigned,
                    [styles.unassigned]: !isAssigned,
                    [styles.loading]: isLoading,
                    [styles.clickable]: Boolean(onClick),
                },
                className
            )}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={onClick ? 0 : -1}
            aria-label={`${ipa}${description ? `: ${description}` : ''}`}
        >
            {isLoading ? (
                <div className={styles.loadingIndicator}>...</div>
            ) : isAssigned ? (
                <div className={styles.glyphContainer}>
                    <GlyphSpellingDisplay
                        glyphs={grapheme!.glyphs}
                        strategy="ltr"
                        config={{ glyphWidth: 40, glyphHeight: 40, spacing: 0, padding: 0 }}
                        showVirtualGlyphStyling={false}
                        className={styles.glyphDisplay}
                    />
                </div>
            ) : (
                <span className={styles.ipaText}>{ipa}</span>
            )}
        </div>
    );

    // Wrap with tooltip if we have content
    if (tooltipContent) {
        return (
            <HoverToolTip content={tooltipContent} className={styles.tooltipWrapper}>
                {cellContent}
            </HoverToolTip>
        );
    }

    return cellContent;
}
