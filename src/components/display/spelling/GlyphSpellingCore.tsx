/**
 * GlyphSpellingCore Component
 * Pure SVG rendering of glyph sequences.
 * @module display/spelling/GlyphSpellingCore
 */
import { useMemo, memo, forwardRef } from 'react';
import DOMPurify from 'dompurify';
import classNames from 'classnames';
import type { PositionedGlyph, LayoutBounds } from './types';
import { boundsToViewBox } from './utils/bounds';
import { GLYPH_GUIDE_INSET } from '../../../db/utils/glyphMetrics';
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

/**
 * Default paper colour. A theme token so the paper follows the theme in the
 * app — it was a literal `white`, so in dark mode the `currentColor` ink went
 * white on white — with `white` as the `var()` FALLBACK, which is what an
 * export resolves to: the SVG/PNG exporters serialise this element verbatim
 * into a file where no app custom property exists, and an export must not
 * look different depending on the theme it was made in.
 */
export const PAPER_FILL = 'var(--page-background-primary, white)';
const GlyphItem = memo(function GlyphItem({
    positioned,
    showVirtualGlyphStyling,
}: {
    positioned: PositionedGlyph;
    showVirtualGlyphStyling: boolean;
}) {
    const { glyph, x, y, width: w, height: h, rotation } = positioned;
    const positionedSvg = useMemo(() => {
        const cleaned = DOMPurify.sanitize(glyph.svg_data, {
            USE_PROFILES: { svg: true, svgFilters: true },
        });
        const parser = new DOMParser();
        const doc = parser.parseFromString(cleaned, 'image/svg+xml');
        const svgEl = doc.documentElement;

        // Position and size as a nested SVG element (no foreignObject needed)
        svgEl.setAttribute('x', String(x));
        svgEl.setAttribute('y', String(y));
        svgEl.setAttribute('width', String(w));
        svgEl.setAttribute('height', String(h));

        if (!svgEl.getAttribute('viewBox')) {
            svgEl.setAttribute('viewBox', '0 0 100 100');
        }

        const serialized = new XMLSerializer().serializeToString(svgEl);
        return DOMPurify.sanitize(serialized, {
            USE_PROFILES: { svg: true, svgFilters: true },
        });
    }, [glyph.svg_data, x, y, w, h]);
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
            <g dangerouslySetInnerHTML={{ __html: positionedSvg }} />
            {/* The dashed "virtual" marker outlines the CELL, not the box:
                boxes overlap by their margins, so box outlines would cross. */}
            {glyph.isVirtual && showVirtualGlyphStyling && (
                <rect
                    x={x + w * GLYPH_GUIDE_INSET}
                    y={y + h * GLYPH_GUIDE_INSET}
                    width={w * (1 - 2 * GLYPH_GUIDE_INSET)}
                    height={h * (1 - 2 * GLYPH_GUIDE_INSET)}
                    rx={Math.min(w, h) * 0.05}
                    ry={Math.min(w, h) * 0.05}
                    className={styles.virtualBorder}
                    fill="none"
                    strokeDasharray="2,2"
                />
            )}
        </g>
    );
});
export const GlyphSpellingCore = memo(forwardRef<SVGSVGElement, GlyphSpellingCoreProps>(
    function GlyphSpellingCore({
        positions,
        bounds,
        showVirtualGlyphStyling = true,
        className,
        backgroundColor,
        showPaperEffect = false,
        zoom = 1,
    }, ref) {
        const viewBox = boundsToViewBox(bounds);
        return (
            <svg
                ref={ref}
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
                    className={styles.paperBackground}
                    // A `style`, not a `fill` attribute: presentation
                    // attributes cannot carry `var()`, inline CSS can.
                    style={{ fill: backgroundColor || PAPER_FILL }}
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
}));
export default GlyphSpellingCore;
