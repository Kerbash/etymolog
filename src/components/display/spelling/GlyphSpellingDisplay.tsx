/**
 * GlyphSpellingDisplay Component
 *
 * Unified component for rendering glyph sequences with flexible layout strategies.
 * Supports both static display and interactive "simulated paper" mode with
 * pan/zoom/viewport control.
 *
 * @module display/spelling/GlyphSpellingDisplay
 */

import { useMemo, forwardRef, useImperativeHandle, useRef } from 'react';
import classNames from 'classnames';

import type { GlyphSpellingDisplayProps, GlyphSpellingDisplayRef } from './types';
import { useNormalizedGlyphs } from './hooks/useNormalizedGlyphs';
import { useGlyphPositions } from './hooks/useGlyphPositions';
import { GlyphSpellingCore } from './GlyphSpellingCore';
import { InteractiveGlyphDisplay } from './InteractiveGlyphDisplay';
import styles from './GlyphSpellingDisplay.module.scss';

/**
 * GlyphSpellingDisplay - Unified glyph sequence renderer.
 *
 * Renders glyph sequences using SVG with absolute positioning and pluggable
 * layout strategies. Supports two modes:
 *
 * - **Static mode** (default): Simple SVG display without interactivity
 * - **Interactive mode**: Full "simulated paper" with pan/zoom/viewport control
 *
 * @example
 * // Basic static usage
 * <GlyphSpellingDisplay
 *   glyphs={lexiconData.spellingDisplay}
 *   graphemeMap={graphemeMap}
 *   strategy="ltr"
 *   config="compact"
 * />
 *
 * @example
 * // Interactive mode with viewport control
 * const ref = useRef<GlyphSpellingDisplayRef>(null);
 *
 * <GlyphSpellingDisplay
 *   ref={ref}
 *   glyphs={longText}
 *   mode="interactive"
 *   canvas={{ width: 800, showPaperEffect: true }}
 *   viewport={{ initialZoom: 1, minZoom: 0.5, maxZoom: 3 }}
 *   onTransformChange={(t) => console.log('Zoom:', t.scale)}
 * />
 *
 * // Programmatic control
 * ref.current?.fitToView();
 * ref.current?.setZoom(2);
 *
 * @example
 * // Static interactive (no drag/zoom)
 * <GlyphSpellingDisplay
 *   glyphs={data}
 *   mode="interactive"
 *   disableInteraction
 *   showControls={false}
 * />
 */
const GlyphSpellingDisplay = forwardRef<GlyphSpellingDisplayRef, GlyphSpellingDisplayProps>(
    function GlyphSpellingDisplay(
        {
            glyphs,
            strategy = 'ltr',
            config,
            width,
            height,
            overflow = 'clip',
            mode = 'static',
            canvas,
            viewport,
            disableInteraction = false,
            showControls = true,
            onTransformChange,
            glyphMap,
            graphemeMap,
            emptyContent,
            showVirtualGlyphStyling = true,
            className,
            style,
            glyphEmPx,
            zoom = 1,
        },
        ref
    ) {
        // Internal ref for interactive mode
        const internalRef = useRef<GlyphSpellingDisplayRef>(null);
        // SVG ref for static mode
        const staticSvgRef = useRef<SVGSVGElement>(null);

        // Memoize normalization context to prevent unnecessary re-renders
        const normalizationContext = useMemo(
            () => ({ glyphMap, graphemeMap }),
            [glyphMap, graphemeMap]
        );

        // Normalize input data to RenderableGlyph[]
        const normalizedGlyphs = useNormalizedGlyphs(glyphs, normalizationContext);

        // If canvas.width is set and using block strategy, use it for wrapping
        const effectiveConfig = useMemo(() => {
            const base = (typeof config === 'string') ? {} : (config ?? {});
            const merged = { ...base } as Partial<typeof base & import('./types').LayoutStrategyConfig>;

            if (canvas?.width && (strategy === 'block' || !strategy)) {
                (merged as any).maxWidth = canvas.width;
            }

            // If glyphEmPx is provided, override glyph sizes
            if (typeof glyphEmPx === 'number' && glyphEmPx > 0) {
                (merged as any).glyphWidth = glyphEmPx;
                (merged as any).glyphHeight = glyphEmPx;
            }

            return merged as Partial<import('./types').LayoutStrategyConfig> | import('./types').LayoutPreset;
        }, [config, canvas?.width, strategy, glyphEmPx]);

        // Use block strategy by default if canvas width is set for wrapping
        const effectiveStrategy = useMemo(() => {
            if (canvas?.width && strategy === 'ltr') {
                return 'block';
            }
            return strategy;
        }, [strategy, canvas?.width]);

        // Calculate positions using the selected strategy
        const { positions, bounds } = useGlyphPositions(normalizedGlyphs, effectiveStrategy, effectiveConfig);

        // Forward ref methods
        useImperativeHandle(ref, () => ({
            resetView: () => internalRef.current?.resetView(),
            fitToView: () => internalRef.current?.fitToView(),
            setZoom: (scale: number) => internalRef.current?.setZoom(scale),
            panTo: (x: number, y: number) => internalRef.current?.panTo(x, y),
            getTransform: () => internalRef.current?.getTransform() ?? { scale: 1, positionX: 0, positionY: 0 },
            getContentBounds: () => internalRef.current?.getContentBounds() ?? bounds,
            getSvgElement: () => {
                // Try to get from interactive mode first, fall back to static mode
                if (internalRef.current?.getSvgElement) {
                    return internalRef.current.getSvgElement();
                }
                return staticSvgRef.current;
            },
        }), [bounds]);

        // Static mode container style - MUST be before conditional returns to satisfy hooks rules
        const overflowMap = { clip: 'hidden', scroll: 'auto', visible: 'visible' } as const;
        const containerStyle = useMemo<React.CSSProperties>(
            () => ({
                ...style,
                // Scale container dimensions by zoom factor
                width: typeof width === 'number' ? width * zoom : (width ?? bounds.width * zoom),
                height: typeof height === 'number' ? height * zoom : (height ?? bounds.height * zoom),
                overflow: overflowMap[overflow],
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                // If glyphEmPx was provided, set font-size on the container so 1em==glyphEmPx
                fontSize: glyphEmPx ? `${glyphEmPx}px` : undefined,
            }),
            [style, width, height, bounds.width, bounds.height, overflow, glyphEmPx, zoom]
        );

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

        // Interactive mode
        if (mode === 'interactive') {
            return (
                <div
                    className={classNames(styles.container, styles.interactive, className)}
                    style={style}
                >
                    <InteractiveGlyphDisplay
                        ref={internalRef}
                        positions={positions}
                        bounds={bounds}
                        showVirtualGlyphStyling={showVirtualGlyphStyling}
                        viewport={viewport}
                        canvas={canvas}
                        disableInteraction={disableInteraction}
                        showControls={showControls}
                        onTransformChange={onTransformChange}
                    />
                </div>
            );
        }

        // Static mode (default) - preserve backward compatibility
        return (
            <div
                className={classNames(styles.container, styles.centered, className)}
                style={containerStyle}
            >
                <GlyphSpellingCore
                    ref={staticSvgRef}
                    positions={positions}
                    bounds={bounds}
                    showVirtualGlyphStyling={showVirtualGlyphStyling}
                    zoom={zoom}
                />
            </div>
        );
    }
);

export default GlyphSpellingDisplay;
