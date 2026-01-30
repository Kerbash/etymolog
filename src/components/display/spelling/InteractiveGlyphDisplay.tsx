/**
 * InteractiveGlyphDisplay Component
 * 
 * Wraps GlyphSpellingCore with pan/zoom functionality using react-zoom-pan-pinch.
 * This creates the "simulated paper" experience with viewport control.
 *
 * @module display/spelling/InteractiveGlyphDisplay
 */
import { forwardRef, useImperativeHandle } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import classNames from 'classnames';
import type { 
    PositionedGlyph, 
    LayoutBounds, 
    GlyphSpellingDisplayRef,
    ViewportConfig,
    CanvasConfig,
    ViewportTransform,
} from './types';
import { GlyphSpellingCore } from './GlyphSpellingCore';
import { useViewport } from './hooks/useViewport';
import styles from './GlyphSpellingDisplay.module.scss';
export interface InteractiveGlyphDisplayProps {
    positions: PositionedGlyph[];
    bounds: LayoutBounds;
    showVirtualGlyphStyling?: boolean;
    viewport?: ViewportConfig;
    canvas?: CanvasConfig;
    disableInteraction?: boolean;
    showControls?: boolean;
    onTransformChange?: (transform: ViewportTransform) => void;
    className?: string;
}
export const InteractiveGlyphDisplay = forwardRef<GlyphSpellingDisplayRef, InteractiveGlyphDisplayProps>(
    function InteractiveGlyphDisplay(
        {
            positions,
            bounds,
            showVirtualGlyphStyling = true,
            viewport,
            canvas,
            disableInteraction = false,
            showControls = true,
            onTransformChange,
            className,
        },
        ref
    ) {
        const {
            transformRef,
            resolvedConfig,
            refMethods,
            handleTransformChange,
        } = useViewport(bounds, viewport, onTransformChange);
        // Expose imperative methods
        useImperativeHandle(ref, () => refMethods, [refMethods]);
        // Calculate canvas dimensions
        const canvasWidth = canvas?.width ?? bounds.width;
        const canvasHeight = canvas?.height ?? bounds.height;
        // Viewport dimensions
        const viewportWidth = viewport?.width ?? '100%';
        const viewportHeight = viewport?.height ?? bounds.height;
        return (
            <div
                className={classNames(styles.interactiveContainer, className)}
                style={{
                    width: viewportWidth,
                    height: viewportHeight,
                }}
            >
                <TransformWrapper
                    ref={transformRef}
                    initialScale={resolvedConfig.initialZoom}
                    minScale={resolvedConfig.minZoom}
                    maxScale={resolvedConfig.maxZoom}
                    initialPositionX={resolvedConfig.initialX}
                    initialPositionY={resolvedConfig.initialY}
                    centerOnInit
                    /* Do not set the global `disabled` prop here. When `disabled` is true
                       react-zoom-pan-pinch may skip initial transform/centering which
                       causes a malformed viewport. Instead we disable specific
                       interaction handlers below so the viewer remains static but the
                       transform initialization still runs. */
                    doubleClick={{ disabled: disableInteraction, mode: 'reset' }}
                    wheel={{ disabled: disableInteraction, step: 0.1 }}
                    panning={{ disabled: disableInteraction, velocityDisabled: false }}
                    pinch={{ disabled: disableInteraction }}
                    onTransformed={handleTransformChange}
                >
                    {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                            <TransformComponent
                                wrapperStyle={{
                                    width: '100%',
                                    height: '100%',
                                    overflow: 'hidden',
                                }}
                                contentStyle={{
                                    width: canvasWidth,
                                    height: canvasHeight,
                                }}
                            >
                                <GlyphSpellingCore
                                    positions={positions}
                                    bounds={bounds}
                                    showVirtualGlyphStyling={showVirtualGlyphStyling}
                                    backgroundColor={canvas?.backgroundColor}
                                    showPaperEffect={canvas?.showPaperEffect}
                                />
                            </TransformComponent>
                            {showControls && !disableInteraction && (
                                <div className={styles.controls}>
                                    <button
                                        type="button"
                                        className={styles.controlButton}
                                        onClick={() => zoomIn()}
                                        aria-label="Zoom in"
                                    >
                                        +
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.controlButton}
                                        onClick={() => zoomOut()}
                                        aria-label="Zoom out"
                                    >
                                        −
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.controlButton}
                                        onClick={() => resetTransform()}
                                        aria-label="Reset view"
                                    >
                                        ⟲
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </TransformWrapper>
            </div>
        );
    }
);
export default InteractiveGlyphDisplay;
