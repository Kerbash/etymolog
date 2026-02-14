/**
 * PunctuationCell Component
 *
 * A single row/cell in the punctuation table that displays:
 * - The punctuation symbol
 * - Label and description
 * - Assigned grapheme (if any) or virtual glyph indicator
 * - "No glyph" toggle button (X)
 * - Assign/clear button
 *
 * @module display/punctuationChart/PunctuationCell
 */

import { useMemo } from 'react';
import classNames from 'classnames';
import HoverToolTip from 'cyber-components/interactable/information/hoverToolTip/hoverToolTip';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton';
import GlyphSpellingDisplay from '../spelling/GlyphSpellingDisplay';
import type { PunctuationCellProps } from './types';
import styles from './PunctuationCell.module.scss';

/**
 * PunctuationCell - Displays a punctuation mark with its configuration.
 *
 * @example
 * <PunctuationCell
 *   mark={wordSeparatorMark}
 *   config={{ graphemeId: null, useNoGlyph: false }}
 *   grapheme={assignedGrapheme}
 *   onAssign={(key) => openGraphemeSelector(key)}
 *   onToggleNoGlyph={(key, value) => updateSetting(key, { useNoGlyph: value })}
 * />
 */
export default function PunctuationCell({
    mark,
    config,
    grapheme,
    onAssign,
    onToggleNoGlyph,
    onClear,
    isLoading = false,
    className,
}: PunctuationCellProps) {
    const hasGrapheme = Boolean(grapheme && grapheme.glyphs.length > 0);
    const isNoGlyph = config.useNoGlyph;

    // Determine display state
    const displayState = useMemo(() => {
        if (isNoGlyph) return 'hidden';
        if (hasGrapheme) return 'assigned';
        return 'virtual';
    }, [isNoGlyph, hasGrapheme]);

    const handleAssignClick = () => {
        if (onAssign && !isLoading) {
            onAssign(mark.key);
        }
    };

    const handleNoGlyphToggle = () => {
        if (onToggleNoGlyph && !isLoading) {
            onToggleNoGlyph(mark.key, !isNoGlyph);
        }
    };

    const handleClear = () => {
        if (onClear && !isLoading) {
            onClear(mark.key);
        }
    };

    // Build tooltip for the "no glyph" button
    const noGlyphTooltip = isNoGlyph
        ? 'Click to show this punctuation mark'
        : 'Click to hide this punctuation mark (no glyph)';

    // Build description for the status
    const statusDescription = useMemo(() => {
        switch (displayState) {
            case 'hidden':
                return 'Hidden - will not be rendered';
            case 'assigned':
                return `Using grapheme: ${grapheme!.name}`;
            case 'virtual':
                return 'Using virtual glyph (dashed box)';
        }
    }, [displayState, grapheme]);

    return (
        <tr className={classNames(styles.cell, styles[displayState], className)}>
            {/* Symbol column */}
            <td className={styles.symbolColumn}>
                <HoverToolTip content={mark.englishEquivalent}>
                    <span className={styles.symbol}>
                        {mark.symbol}
                    </span>
                </HoverToolTip>
            </td>

            {/* Label column */}
            <td className={styles.labelColumn}>
                <div className={styles.labelContent}>
                    <span className={styles.label}>{mark.label}</span>
                    <span className={styles.description}>{mark.description}</span>
                </div>
            </td>

            {/* Display column */}
            <td className={styles.displayColumn}>
                {isLoading ? (
                    <div className={styles.loading}>Loading...</div>
                ) : displayState === 'hidden' ? (
                    <div className={styles.hiddenIndicator}>
                        <span className={styles.hiddenIcon}>✕</span>
                        <span className={styles.hiddenText}>Hidden</span>
                    </div>
                ) : hasGrapheme ? (
                    <div className={styles.glyphDisplay}>
                        <GlyphSpellingDisplay
                            glyphs={[grapheme!]}
                            strategy="ltr"
                            showVirtualGlyphStyling={false}
                        />
                    </div>
                ) : (
                    <div className={styles.virtualIndicator}>
                        <span className={styles.virtualSymbol}>{mark.symbol}</span>
                        <span className={styles.virtualText}>Virtual</span>
                    </div>
                )}
            </td>

            {/* Status column */}
            <td className={styles.statusColumn}>
                <HoverToolTip content={statusDescription}>
                    <span className={classNames(styles.statusBadge, styles[displayState])}>
                        {displayState === 'hidden' && 'Hidden'}
                        {displayState === 'assigned' && 'Assigned'}
                        {displayState === 'virtual' && 'Virtual'}
                    </span>
                </HoverToolTip>
            </td>

            {/* Actions column */}
            <td className={styles.actionsColumn}>
                <div className={styles.actions}>
                    {/* No glyph toggle (X button) */}
                    <HoverToolTip content={noGlyphTooltip}>
                        <IconButton
                            iconName={isNoGlyph ? 'eye' : 'eye-slash'}
                            onClick={handleNoGlyphToggle}
                            disabled={isLoading}
                            className={classNames(
                                styles.actionButton,
                                isNoGlyph && styles.activeNoGlyph
                            )}
                            aria-label={noGlyphTooltip}
                        />
                    </HoverToolTip>

                    {/* Assign grapheme button */}
                    {!isNoGlyph && (
                        <HoverToolTip content={hasGrapheme ? 'Change grapheme' : 'Assign grapheme'}>
                            <IconButton
                                iconName={hasGrapheme ? 'pencil' : 'plus-lg'}
                                onClick={handleAssignClick}
                                disabled={isLoading}
                                className={styles.actionButton}
                                aria-label={hasGrapheme ? 'Change grapheme' : 'Assign grapheme'}
                            />
                        </HoverToolTip>
                    )}

                    {/* Clear button (only when assigned) */}
                    {hasGrapheme && !isNoGlyph && (
                        <HoverToolTip content="Clear assignment">
                            <IconButton
                                iconName="x-lg"
                                onClick={handleClear}
                                disabled={isLoading}
                                className={styles.actionButton}
                                aria-label="Clear assignment"
                            />
                        </HoverToolTip>
                    )}
                </div>
            </td>
        </tr>
    );
}



