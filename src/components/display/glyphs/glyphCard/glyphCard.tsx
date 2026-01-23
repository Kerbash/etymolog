import React from 'react';
import type { GlyphWithUsage } from '../../../../db/types';
import classNames from 'classnames';
import {flex, sizing} from 'utils-styles';
import HoverToolTip from 'cyber-components/interactable/information/hoverToolTip/hoverToolTip';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton';
import styles from './glyphCard.module.scss';

interface GlyphCardProps {
    glyph: GlyphWithUsage;
    onDelete: (id: number) => void;
}

export default function GlyphCard({ glyph, onDelete }: GlyphCardProps) {
    const usage = glyph.usageCount ?? 0;
    const usageText = usage === 0 ? 'Not used' : `Used by ${usage} grapheme${usage === 1 ? '' : 's'}`;

    return (
        <HoverToolTip content={usageText} className={sizing.fitContent}>
            <div className={classNames(flex.flexColumn, styles.container)}>
                <div className={styles.topRight}>
                    <IconButton
                        iconName="trash"
                        iconColor={'var(--status-bad)'}
                        onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            onDelete(glyph.id);
                        }}
                        aria-label={`Delete glyph ${glyph.name}`}
                    />
                </div>

                <div className={styles.name}>{glyph.name}</div>

                <div className={styles.svgWrapper}>
                    <div
                        className={styles.svgContainer}
                        dangerouslySetInnerHTML={{ __html: glyph.svg_data }}
                    />
                </div>
            </div>
        </HoverToolTip>
    );
}
