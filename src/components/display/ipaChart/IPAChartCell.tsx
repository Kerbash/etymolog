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
import { guideTooltipLine } from './guideTiers';
import type { GuideTier } from '../../../generator';
import styles from './IPAChartCell.module.scss';

/** Tier to the class that paints it. A lookup, so an unknown tier paints nothing. */
const GUIDE_CLASS: Record<GuideTier, string> = {
    core: styles.guideCore,
    flavour: styles.guideFlavour,
    avoid: styles.guideAvoid,
};

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
 *
 * @example
 * // With the flavour guide on. The chart does the lookup; the cell is told
 * // one tier and one name, and paints them.
 * <IPAChartCell ipa="θ" guide="core" guideLabel="Elvish / flowing" />
 */
export default function IPAChartCell({
    ipa,
    grapheme,
    onClick,
    isLoading = false,
    className,
    size = 'medium',
    description,
    guide = null,
    guideLabel,
}: IPAChartCellProps) {
    const isAssigned = Boolean(grapheme && grapheme.glyphs.length > 0);

    /** "Elvish / flowing: core sound", or nothing when no guide is on. */
    const guideLine = guide ? guideTooltipLine(guideLabel, guide) : null;

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
        // The guide line goes LAST: it is advice about a flavour, and it must
        // not push the two facts about the user's own script down the tooltip.
        if (guideLine) parts.push(guideLine);
        return parts.join('\n');
    }, [description, isAssigned, grapheme, guideLine]);

    /**
     * The accessible name carries the guide too.
     *
     * `HoverToolTip` portals its content and renders it only while open, so a
     * screen-reader user who never hovers would otherwise have no way to learn
     * that the cell is lit — and the overlay's whole purpose is to say which
     * sounds belong to the flavour.
     */
    const ariaLabel = [
        `${ipa}${description ? `: ${description}` : ''}`,
        guideLine,
    ]
        .filter(Boolean)
        .join(' — ');

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
                guide ? GUIDE_CLASS[guide] : undefined,
                className
            )}
            /* The tier as data, not only as a hashed CSS-module class: it is
               what a debugger, a test and a future "show me only the core
               sounds" filter all need, and none of them can read a class name
               that changes with every build. */
            data-guide={guide ?? undefined}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={onClick ? 0 : -1}
            aria-label={ariaLabel}
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
