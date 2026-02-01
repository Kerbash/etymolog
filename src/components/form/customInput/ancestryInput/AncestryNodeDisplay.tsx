/**
 * AncestryNodeDisplay
 * -------------------
 * Display component for a single node in the ancestry flowchart.
 * Reuses styling patterns from EtymologyTreeNode for consistency.
 */

import { memo } from 'react';
import type { AncestryType, Lexicon } from '../../../../db/types';
import { ANCESTRY_TYPE_COLORS } from './ancestryTreeTransformer';
import styles from './AncestryNodeDisplay.module.scss';
import classNames from 'classnames';

export interface AncestryNodeDisplayProps {
    /** The lexicon entry data */
    entry: Pick<Lexicon, 'id' | 'lemma' | 'pronunciation' | 'is_native'>;
    /** Whether this is the current word being edited */
    isCurrentWord?: boolean;
    /** The ancestry type (shown as a badge if provided) */
    ancestryType?: AncestryType | null;
    /** Whether the node is clickable */
    onClick?: (id: number) => void;
}

/**
 * Displays a lexicon entry as a flowchart node.
 * Shows lemma, pronunciation, native status, and ancestry type badge.
 */
const AncestryNodeDisplay = memo(function AncestryNodeDisplay({
    entry,
    isCurrentWord = false,
    ancestryType,
    onClick,
}: AncestryNodeDisplayProps) {
    const handleClick = () => {
        if (onClick && entry.id > 0) {
            onClick(entry.id);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick && entry.id > 0) {
            e.preventDefault();
            onClick(entry.id);
        }
    };

    const isClickable = !!onClick && entry.id > 0 && !isCurrentWord;

    return (
        <div
            className={classNames(styles.nodeDisplay, {
                [styles.currentWord]: isCurrentWord,
                [styles.external]: !entry.is_native,
                [styles.clickable]: isClickable,
            })}
            onClick={isClickable ? handleClick : undefined}
            onKeyDown={isClickable ? handleKeyDown : undefined}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
        >
            {/* Ancestry type badge (shows the relationship TO this node from its parent) */}
            {ancestryType && (
                <span
                    className={styles.ancestryBadge}
                    style={{ backgroundColor: ANCESTRY_TYPE_COLORS[ancestryType] }}
                    title={`Relationship: ${ancestryType}`}
                >
                    {ancestryType.charAt(0).toUpperCase()}
                </span>
            )}

            {/* External/borrowed indicator */}
            {!entry.is_native && entry.id > 0 && (
                <span className={styles.externalBadge} title="External/borrowed word">
                    ↗
                </span>
            )}

            {/* Lemma */}
            <span className={styles.lemma}>{entry.lemma}</span>

            {/* Pronunciation */}
            {entry.pronunciation && (
                <span className={styles.pronunciation}>/{entry.pronunciation}/</span>
            )}

            {/* Current word indicator */}
            {isCurrentWord && (
                <span className={styles.currentIndicator} title="Current word">
                    ●
                </span>
            )}
        </div>
    );
});

export default AncestryNodeDisplay;
