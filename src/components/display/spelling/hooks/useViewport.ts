/**
 * useViewport Hook
 *
 * Manages viewport state and transformations for interactive mode.
 * Provides methods for zoom, pan, and fit-to-view operations.
 *
 * @module display/spelling/hooks/useViewport
 */

import { useCallback, useRef, useMemo } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import type { ViewportConfig, ViewportTransform, LayoutBounds, GlyphSpellingDisplayRef } from '../types';

/**
 * Default viewport configuration.
 */
export const DEFAULT_VIEWPORT_CONFIG: Required<ViewportConfig> = {
    width: undefined as unknown as number,
    height: undefined as unknown as number,
    initialZoom: 1,
    minZoom: 0.1,
    maxZoom: 5,
    initialX: 0,
    initialY: 0,
};

/**
 * Resolves viewport config with defaults.
 */
export function resolveViewportConfig(config?: ViewportConfig): Required<Omit<ViewportConfig, 'width' | 'height'>> & Pick<ViewportConfig, 'width' | 'height'> {
    return {
        ...DEFAULT_VIEWPORT_CONFIG,
        ...config,
    };
}

/**
 * Hook for managing viewport state and transformations.
 *
 * @param contentBounds - The bounds of the content being displayed
 * @param config - Viewport configuration
 * @param onTransformChange - Callback when transform changes
 * @returns Viewport ref and control methods
 */
export function useViewport(
    contentBounds: LayoutBounds,
    config?: ViewportConfig,
    onTransformChange?: (transform: ViewportTransform) => void
) {
    const transformRef = useRef<ReactZoomPanPinchRef>(null);
    const resolvedConfig = useMemo(() => resolveViewportConfig(config), [config]);

    /**
     * Get current transform state.
     */
    const getTransform = useCallback((): ViewportTransform => {
        const instance = transformRef.current?.instance;
        if (!instance) {
            return {
                scale: resolvedConfig.initialZoom,
                positionX: resolvedConfig.initialX,
                positionY: resolvedConfig.initialY,
            };
        }
        return {
            scale: instance.transformState.scale,
            positionX: instance.transformState.positionX,
            positionY: instance.transformState.positionY,
        };
    }, [resolvedConfig]);

    /**
     * Reset viewport to initial state.
     */
    const resetView = useCallback(() => {
        transformRef.current?.resetTransform();
    }, []);

    /**
     * Fit all content in the viewport.
     */
    const fitToView = useCallback(() => {
        transformRef.current?.centerView();
    }, []);

    /**
     * Set zoom level programmatically.
     */
    const setZoom = useCallback((scale: number) => {
        const clampedScale = Math.max(
            resolvedConfig.minZoom,
            Math.min(resolvedConfig.maxZoom, scale)
        );
        transformRef.current?.setTransform(
            getTransform().positionX,
            getTransform().positionY,
            clampedScale
        );
    }, [resolvedConfig.minZoom, resolvedConfig.maxZoom, getTransform]);

    /**
     * Pan to specific coordinates.
     */
    const panTo = useCallback((x: number, y: number) => {
        transformRef.current?.setTransform(x, y, getTransform().scale);
    }, [getTransform]);

    /**
     * Get content bounds.
     */
    const getContentBounds = useCallback((): LayoutBounds => {
        return contentBounds;
    }, [contentBounds]);

    /**
     * Handle transform change from react-zoom-pan-pinch.
     */
    const handleTransformChange = useCallback((ref: ReactZoomPanPinchRef) => {
        if (onTransformChange) {
            onTransformChange({
                scale: ref.state.scale,
                positionX: ref.state.positionX,
                positionY: ref.state.positionY,
            });
        }
    }, [onTransformChange]);

    /**
     * Create ref methods object for imperative handle.
     */
    const refMethods: GlyphSpellingDisplayRef = useMemo(() => ({
        resetView,
        fitToView,
        setZoom,
        panTo,
        getTransform,
        getContentBounds,
    }), [resetView, fitToView, setZoom, panTo, getTransform, getContentBounds]);

    return {
        transformRef,
        resolvedConfig,
        refMethods,
        handleTransformChange,
    };
}
