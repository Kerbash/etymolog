/**
 * GlyphCanvas Component
 *
 * A pannable/zoomable canvas for displaying selected glyphs.
 * Uses PannableCanvas for consistent pan and zoom functionality.
 *
 * @module glyphCanvasInput/GlyphCanvas
 */

'use client';

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { PannableCanvas } from 'cyber-components/interactable/canvas/pannableCanvas';
import type { PannableCanvasRef } from 'cyber-components/interactable/canvas/pannableCanvas';
import classNames from 'classnames';
import DOMPurify from 'dompurify';

import type { GlyphCanvasProps, GlyphCanvasRef, CanvasGlyph } from './types';
import { calculateGlyphLayout, calculateBounds, isVirtualGlyphId } from './utils';

import styles from './GlyphCanvas.module.scss';

/**
 * GlyphCanvas
 *
 * A display-only canvas that renders glyphs with pan and zoom support.
 * Glyphs are positioned based on the configured writing direction.
 *
 * @example
 * ```tsx
 * const canvasRef = useRef<GlyphCanvasRef>(null);
 *
 * <GlyphCanvas
 *   ref={canvasRef}
 *   selectedGlyphIds={[1, 2, 3]}
 *   glyphMap={glyphMap}
 *   layout={{ direction: 'ltr' }}
 * />
 *
 * // Later:
 * canvasRef.current?.fitToView();
 * ```
 */
const GlyphCanvas = forwardRef<GlyphCanvasRef, GlyphCanvasProps>(
    function GlyphCanvas(
        {
            selectedGlyphIds,
            glyphMap,
            layout = {},
            initialScale = 1,
            minScale = 0.25,
            maxScale = 3,
            showControls = true,
            emptyStateContent,
            className,
            style,
            minHeight = '120px',
        },
        ref
    ) {
        const pannableRef = useRef<PannableCanvasRef>(null);

        // Get glyphs from IDs
        const selectedGlyphs = useMemo(() => {
            return selectedGlyphIds
                .map(id => glyphMap.get(id))
                .filter((g): g is NonNullable<typeof g> => g !== undefined);
        }, [selectedGlyphIds, glyphMap]);

        // Calculate positioned glyphs
        const positionedGlyphs = useMemo(() => {
            return calculateGlyphLayout(selectedGlyphs, layout);
        }, [selectedGlyphs, layout]);

        // Calculate canvas bounds
        const bounds = useMemo(() => {
            return calculateBounds(positionedGlyphs, layout);
        }, [positionedGlyphs, layout]);

        // SVG dimensions
        const svgWidth = Math.max(bounds.width, 200);
        const svgHeight = Math.max(bounds.height, 80);

        // Expose imperative methods - delegate to PannableCanvas
        useImperativeHandle(ref, () => ({
            resetView: () => {
                pannableRef.current?.resetView();
            },
            fitToView: () => {
                pannableRef.current?.fitToView();
            },
        }), []);

        // Empty state
        if (selectedGlyphIds.length === 0) {
            return (
                <div
                    className={classNames(styles.canvasContainer, styles.empty, className)}
                    style={{ ...style, minHeight }}
                >
                    {emptyStateContent ?? (
                        <span className={styles.emptyText}>
                            No glyphs selected. Click the keyboard button to add glyphs.
                        </span>
                    )}
                </div>
            );
        }

        return (
            <div
                className={classNames(styles.canvasContainer, className)}
                style={{ ...style, minHeight }}
            >
                <PannableCanvas
                    ref={pannableRef}
                    contentDimensions={{ width: svgWidth, height: svgHeight }}
                    initialScale={initialScale}
                    minScale={minScale}
                    maxScale={maxScale}
                    showControls={showControls}
                    centerOnInit
                    enableVelocity
                    className={styles.canvasInner}
                    ariaLabel={`Canvas with ${selectedGlyphIds.length} glyphs`}
                >
                    <svg
                        width={svgWidth}
                        height={svgHeight}
                        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                        className={styles.svg}
                        role="img"
                        aria-label={`Canvas with ${selectedGlyphIds.length} glyphs`}
                    >
                        {positionedGlyphs.map((pg) => (
                            <GlyphNode key={`${pg.glyph.id}-${pg.index}`} positionedGlyph={pg} />
                        ))}
                    </svg>
                </PannableCanvas>
            </div>
        );
    }
);

/**
 * Individual glyph node rendered on the canvas.
 * Virtual glyphs (negative IDs) are rendered with distinct styling.
 */
function GlyphNode({ positionedGlyph }: { positionedGlyph: CanvasGlyph }) {
    const { glyph, x, y, width, height } = positionedGlyph;

    // Check if this is a virtual glyph
    const isVirtual = isVirtualGlyphId(glyph.id);

    // Sanitize SVG data
    const sanitizedSvg = useMemo(() => {
        return DOMPurify.sanitize(glyph.svg_data, {
            USE_PROFILES: { svg: true, svgFilters: true },
        });
    }, [glyph.svg_data]);

    return (
        <g
            className={classNames(styles.glyphNode, {
                [styles.virtualGlyph]: isVirtual,
            })}
            transform={`translate(${x}, ${y})`}
        >
            {/* Tooltip for virtual glyphs */}
            {isVirtual && (
                <title>IPA Fallback: {glyph.name}</title>
            )}

            {/* Background - different style for virtual glyphs */}
            <rect
                className={classNames(styles.glyphBackground, {
                    [styles.virtualBackground]: isVirtual,
                })}
                width={width}
                height={height}
                rx={4}
                ry={4}
            />

            {/* Glyph SVG content via foreignObject */}
            <foreignObject
                width={width}
                height={height}
                className={styles.glyphForeignObject}
            >
                <div
                    className={classNames(styles.glyphContent, {
                        [styles.virtualContent]: isVirtual,
                    })}
                    dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
                />
            </foreignObject>
        </g>
    );
}

export default GlyphCanvas;
export { GlyphCanvas };
