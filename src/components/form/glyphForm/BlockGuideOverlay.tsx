/**
 * The chosen template drawn on the glyph canvas (`guideOverlay`, 300 × 300
 * space): every box of the template faint, the chosen box tinted and outlined
 * in its role's colour. See `blockGuide.ts`.
 */

import type { CSSProperties } from 'react';

import { GLYPH_GUIDE_INSET } from '../../../db/utils/glyphMetrics';
import type { BlockGuideOption } from './blockGuide';

import styles from './glyphFormFields.module.scss';

const CANVAS_SIZE = 300;

type BoxStyle = CSSProperties & { '--role-colour'?: string };

export interface BlockGuideOverlayProps {
    guide: BlockGuideOption;
    colours: Map<string, string | undefined>;
}

export default function BlockGuideOverlay({ guide, colours }: BlockGuideOverlayProps) {
    const origin = CANVAS_SIZE * GLYPH_GUIDE_INSET;
    const size = CANVAS_SIZE * (1 - 2 * GLYPH_GUIDE_INSET);
    return (
        <g data-block-guide="">
            {guide.template.slots.map((slot) => {
                const chosen = slot.roleId === guide.slot.roleId;
                const colour = colours.get(slot.roleId);
                const style: BoxStyle = colour ? { '--role-colour': colour } : {};
                return (
                    <rect
                        key={slot.roleId}
                        x={origin + slot.x * size}
                        y={origin + slot.y * size}
                        width={slot.w * size}
                        height={slot.h * size}
                        className={chosen ? styles.guideBoxChosen : styles.guideBox}
                        style={style}
                        data-guide-box={chosen ? 'chosen' : ''}
                    />
                );
            })}
        </g>
    );
}
