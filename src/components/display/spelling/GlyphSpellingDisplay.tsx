/**
 * GlyphSpellingDisplay Component
 *
 * Unified component for rendering glyph sequences with flexible layout strategies.
 * Replaces fragmented SVG concatenation across display components.
 *
 * @module display/spelling/GlyphSpellingDisplay
 */

import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import classNames from 'classnames';

import type { GlyphSpellingDisplayProps } from './types';
import { useNormalizedGlyphs } from './hooks/useNormalizedGlyphs';
import { useGlyphPositions } from './hooks/useGlyphPositions';
import { boundsToViewBox } from './utils/bounds';
import styles from './GlyphSpellingDisplay.module.scss';

/**
 * GlyphSpellingDisplay - Unified glyph sequence renderer.
 *
 * Renders glyph sequences using SVG with absolute positioning and pluggable
 * layout strategies. Accepts multiple input formats and handles virtual IPA
 * glyph rendering.
 *
 * @example
 * // Basic usage with SpellingDisplayEntry[]
 * <GlyphSpellingDisplay
 *   glyphs={lexiconData.spellingDisplay}
 *   graphemeMap={graphemeMap}
 *   strategy="ltr"
 *   config="compact"
 * />
 *
 * @example
 * // With custom config
 * <GlyphSpellingDisplay
 *   glyphs={graphemeData.glyphs}
 *   config={{ glyphWidth: 30, glyphHeight: 30, spacing: 4 }}
 *   emptyContent={<span>No glyphs</span>}
 * />
 */
export default function GlyphSpellingDisplay({
    glyphs,
    strategy = 'ltr',
    config,
    width,
    height,
    overflow = 'clip',
    glyphMap,
    graphemeMap,
    emptyContent,
    showVirtualGlyphStyling = true,
    className,
    style,
}: GlyphSpellingDisplayProps) {
    // Memoize normalization context to prevent unnecessary re-renders
    const normalizationContext = useMemo(
        () => ({ glyphMap, graphemeMap }),
        [glyphMap, graphemeMap]
    );

    // Normalize input data to RenderableGlyph[]
    const normalizedGlyphs = useNormalizedGlyphs(glyphs, normalizationContext);

    // Calculate positions using the selected strategy (config is already memoized in the hook)
    const { positions, bounds } = useGlyphPositions(normalizedGlyphs, strategy, config);

    // Handle empty state
    if (normalizedGlyphs.length === 0) {
        if (emptyContent) {
            return (
                <div
                    className={classNames(styles.container, styles.empty, className)}
                    style={style}
                >
                    {emptyContent}
                </div>
            );
        }
        return null;
    }

    // Calculate viewBox from bounds
    const viewBox = boundsToViewBox(bounds);

    // Map overflow behavior to CSS values
    const overflowMap = { clip: 'hidden', scroll: 'auto', visible: 'visible' } as const;

    // Container styles (memoized)
    const containerStyle = useMemo<React.CSSProperties>(
        () => ({
            ...style,
            width: width ?? bounds.width,
            height: height ?? bounds.height,
            overflow: overflowMap[overflow],
        }),
        [style, width, height, bounds.width, bounds.height, overflow]
    );

    return (
        <div
            className={classNames(styles.container, className)}
            style={containerStyle}
        >
            <svg
                className={styles.svg}
                viewBox={viewBox}
                preserveAspectRatio="xMidYMid meet"
                width="100%"
                height="100%"
            >
                {positions.map((positioned) => {
                    const { glyph, x, y, width: w, height: h, index, rotation } = positioned;

                    // Sanitize SVG data
                    const sanitizedSvg = DOMPurify.sanitize(glyph.svg_data, {
                        USE_PROFILES: { svg: true, svgFilters: true },
                    });

                    // Create transform for rotation if needed
                    const transform = rotation
                        ? `rotate(${rotation} ${x + w / 2} ${y + h / 2})`
                        : undefined;

                    return (
                        <g
                            key={`glyph-${glyph.id}-${index}`}
                            transform={transform}
                            className={classNames({
                                [styles.virtualGlyph]: glyph.isVirtual && showVirtualGlyphStyling,
                            })}
                        >
                            {/* Glyph container with positioning */}
                            <foreignObject x={x} y={y} width={w} height={h}>
                                <div
                                    // @ts-expect-error - xmlns is valid for foreignObject content
                                    xmlns="http://www.w3.org/1999/xhtml"
                                    className={styles.glyphWrapper}
                                    dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
                                />
                            </foreignObject>

                            {/* Virtual glyph indicator border */}
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
                })}
            </svg>
        </div>
    );
}
