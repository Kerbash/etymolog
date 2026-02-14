import { useRef, useEffect, useState } from 'react';
import type { SpellingDisplayEntry, GraphemeComplete } from '../../../../db/types';
import { GlyphSpellingDisplay } from '../../spelling';
import styles from './compact.module.scss';

interface ScaledGlyphSpellingDisplayProps {
    glyphs: SpellingDisplayEntry[];
    graphemeMap?: Map<number, GraphemeComplete>;
    maxWidth: number;
    maxHeight: number;
}

/**
 * Wrapper around GlyphSpellingDisplay that automatically scales content to fit within
 * the specified dimensions. This component measures the natural size of the content
 * and applies CSS transform:scale() to shrink it if needed.
 */
export function ScaledGlyphSpellingDisplay({
    glyphs,
    graphemeMap,
    maxWidth,
    maxHeight,
}: ScaledGlyphSpellingDisplayProps) {
    const contentRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        if (!contentRef.current) return;

        // Robust measurement helper: prefer ResizeObserver but fall back to
        // getBoundingClientRect (and inspecting child SVG) when needed.
        const measureAndSet = () => {
            const el = contentRef.current;
            if (!el) return;

            // Try ResizeObserver-like contentRect via getBoundingClientRect
            let rect = el.getBoundingClientRect();
            let width = rect.width;
            let height = rect.height;

            // If wrapper reports 0, try measuring the first child (actual content)
            if ((width === 0 || height === 0) && el.firstElementChild) {
                const childRect = el.firstElementChild.getBoundingClientRect();
                width = childRect.width || width;
                height = childRect.height || height;
            }

            // If still 0, try to query an inner SVG as last resort
            if ((width === 0 || height === 0)) {
                const svg = el.querySelector('svg');
                if (svg) {
                    const svgRect = (svg as SVGSVGElement).getBoundingClientRect();
                    width = svgRect.width || width;
                    height = svgRect.height || height;
                }
            }

            if (width === 0 || height === 0) return;

            const scaleX = maxWidth && width > maxWidth ? maxWidth / width : 1;
            const scaleY = maxHeight && height > maxHeight ? maxHeight / height : 1;
            const newScale = Math.min(scaleX, scaleY, 1);

            setScale((prev) => {
                // Avoid unnecessary state updates
                if (Math.abs(prev - newScale) < 1e-4) return prev;
                return newScale;
            });
        };

        // ResizeObserver to handle dynamic content changes
        const resizeObserver = new ResizeObserver(() => {
            measureAndSet();
        });
        resizeObserver.observe(contentRef.current);

        // Also measure once after the browser paints (initial render)
        const rafId = requestAnimationFrame(measureAndSet);

        // Window resize fallback
        const onWinResize = () => measureAndSet();
        window.addEventListener('resize', onWinResize);

        return () => {
            resizeObserver.disconnect();
            cancelAnimationFrame(rafId);
            window.removeEventListener('resize', onWinResize);
        };
    }, [maxWidth, maxHeight]);

    if (!glyphs || glyphs.length === 0) {
        return null;
    }

    return (
        <div className={styles.scaledSpellingWrapper}>
            <div
                ref={contentRef}
                className={styles.scaledSpellingContent}
                style={{
                    // Ensure the content participates in layout so we can measure it.
                    display: 'inline-block',
                    transform: `scale(${scale})`,
                    transformOrigin: 'center center',
                }}
            >
                <GlyphSpellingDisplay
                    glyphs={glyphs}
                    graphemeMap={graphemeMap}
                    strategy="ltr"
                    config="compact"
                    glyphEmPx={32}
                />
            </div>
        </div>
    );
}

