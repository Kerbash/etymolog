/**
 * GlyphSpellingCore Component
 * Pure SVG rendering of glyph sequences.
 * @module display/spelling/GlyphSpellingCore
 */
import { useMemo, memo } from 'react';
import DOMPurify from 'dompurify';
import classNames from 'classnames';
import type { PositionedGlyph, LayoutBounds } from './types';
import { boundsToViewBox } from './utils/bounds';
import styles from './GlyphSpellingDisplay.module.scss';
export interface GlyphSpellingCoreProps {
    positions: PositionedGlyph[];
    bounds: LayoutBounds;
    showVirtualGlyphStyling?: boolean;
    className?: string;
    backgroundColor?: string;
    showPaperEffect?: boolean;
    /** Viewport zoom level (1 = 100%, 2 = 200%, etc.) */
    zoom?: number;
}
const GlyphItem = memo(function GlyphItem({
    positioned,
    showVirtualGlyphStyling,
}: {
    positioned: PositionedGlyph;
    showVirtualGlyphStyling: boolean;
}) {
    const { glyph, x, y, width: w, height: h, rotation } = positioned;
    const sanitizedSvg = useMemo(() => DOMPurify.sanitize(glyph.svg_data, {
        USE_PROFILES: { svg: true, svgFilters: true },
    }), [glyph.svg_data]);
    const transform = rotation
        ? `rotate(${rotation} ${x + w / 2} ${y + h / 2})`
        : undefined;
    return (
        <g
            transform={transform}
            className={classNames({
                [styles.virtualGlyph]: glyph.isVirtual && showVirtualGlyphStyling,
            })}
        >
            <foreignObject x={x} y={y} width={w} height={h}>
                <div
                    // @ts-expect-error - xmlns is valid for foreignObject content
                    xmlns="http://www.w3.org/1999/xhtml"
                    className={styles.glyphWrapper}
                    dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
                />
            </foreignObject>
            {glyph.isVirtual && showVirtualGlyphStyling && (
                <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    className={styles.virtualBorder}
                    fill="none"
                    strokeDasharray="2,2"
                />
            )}
        </g>
    );
});
export const GlyphSpellingCore = memo(function GlyphSpellingCore({
    positions,
    bounds,
    showVirtualGlyphStyling = true,
    className,
    backgroundColor,
    showPaperEffect = false,
    zoom = 1,
}: GlyphSpellingCoreProps) {
    const viewBox = boundsToViewBox(bounds);
    return (
        <svg
            className={classNames(styles.svg, className, {
                [styles.paperEffect]: showPaperEffect,
            })}
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            width={bounds.width}
            height={bounds.height}
            style={{
                backgroundColor,
                transform: zoom !== 1 ? `scale(${zoom})` : undefined,
                transformOrigin: 'top left',
            }}
        >
            {showPaperEffect && (
                <rect
                    x={bounds.minX}
                    y={bounds.minY}
                    width={bounds.width}
                    height={bounds.height}
                    fill={backgroundColor || 'white'}
                    className={styles.paperBackground}
                />
            )}
            {positions.map((positioned) => (
                <GlyphItem
                    key={`glyph-${positioned.glyph.id}-${positioned.index}`}
                    positioned={positioned}
                    showVirtualGlyphStyling={showVirtualGlyphStyling}
                />
            ))}
        </svg>
    );
});
export default GlyphSpellingCore;
