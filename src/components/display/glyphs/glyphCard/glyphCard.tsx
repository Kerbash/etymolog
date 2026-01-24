import React from 'react';
import { Link } from 'react-router-dom';
import type { GlyphWithUsage } from '../../../../db/types';
import classNames from 'classnames';
import {flex, sizing} from 'utils-styles';
import HoverToolTip from 'cyber-components/interactable/information/hoverToolTip/hoverToolTip';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton';
import styles from './glyphCard.module.scss';

/**
 * Interaction mode for GlyphCard:
 * - 'route': Navigate to edit page (default behavior)
 * - 'modal': Call onClick callback (for modal editing)
 * - 'none': No click interaction (display only)
 */
export type GlyphCardInteractionMode = 'route' | 'modal' | 'none';

interface GlyphCardProps {
    glyph: GlyphWithUsage;
    /** Callback when delete button is clicked */
    onDelete?: (id: number) => void;
    /**
     * Interaction mode for the card click:
     * - 'route': Navigate to edit page (default)
     * - 'modal': Call onClick callback for modal editing
     * - 'none': No click interaction
     */
    interactionMode?: GlyphCardInteractionMode;
    /**
     * @deprecated Use interactionMode='none' instead
     * If true, the card will not be a link to the edit page
     */
    disableLink?: boolean;
    /** Callback when card is clicked (only used when interactionMode='modal') */
    onClick?: (glyph: GlyphWithUsage) => void;
    /** Hide the delete button */
    hideDelete?: boolean;
}

export default function GlyphCard({
    glyph,
    onDelete,
    disableLink = false,
    interactionMode,
    onClick,
    hideDelete = false,
}: GlyphCardProps) {
    const usage = glyph.usageCount ?? 0;
    const usageText = usage === 0 ? 'Not used' : `Used by ${usage} grapheme${usage === 1 ? '' : 's'}`;

    // Determine actual interaction mode (support legacy disableLink prop)
    const actualMode: GlyphCardInteractionMode = interactionMode ?? (disableLink ? 'none' : 'route');

    const cardContent = (
        <div className={classNames(flex.flexColumn, styles.container)}>
            {!hideDelete && onDelete && (
                <div className={styles.topRight}>
                    <IconButton
                        iconName="trash"
                        iconColor={'var(--status-bad)'}
                        onClick={(e: React.MouseEvent) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDelete(glyph.id);
                        }}
                        aria-label={`Delete glyph ${glyph.name}`}
                    />
                </div>
            )}

            <div className={styles.name}>{glyph.name}</div>

            <div className={styles.svgWrapper}>
                <div
                    className={styles.svgContainer}
                    dangerouslySetInnerHTML={{ __html: glyph.svg_data }}
                />
            </div>
        </div>
    );

    // Mode: modal - clickable div that triggers onClick callback
    if (actualMode === 'modal') {
        return (
            <HoverToolTip content={usageText} className={sizing.fitContent}>
                <div
                    className={styles.cardWrapper}
                    onClick={() => onClick?.(glyph)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onClick?.(glyph);
                        }
                    }}
                >
                    {cardContent}
                </div>
            </HoverToolTip>
        );
    }

    // Mode: none - non-interactive display
    if (actualMode === 'none') {
        return (
            <HoverToolTip content={usageText} className={sizing.fitContent}>
                <div className={styles.cardWrapper}>
                    {cardContent}
                </div>
            </HoverToolTip>
        );
    }

    // Mode: route (default) - link to edit page
    return (
        <HoverToolTip content={usageText} className={sizing.fitContent}>
            <Link
                to={`/script-maker/glyphs/db/${glyph.id}`}
                className={styles.cardLink}
            >
                {cardContent}
            </Link>
        </HoverToolTip>
    );
}
