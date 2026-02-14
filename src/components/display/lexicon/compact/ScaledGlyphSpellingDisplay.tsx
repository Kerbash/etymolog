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

        // Use ResizeObserver to measure the natural size of the content
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;

                if (width === 0 || height === 0) continue;

                // Calculate scale to fit within maxWidth and maxHeight
                const scaleX = width > maxWidth ? maxWidth / width : 1;
                const scaleY = height > maxHeight ? maxHeight / height : 1;
                const newScale = Math.min(scaleX, scaleY, 1); // Never scale up, only down

                setScale(newScale);
            }
        });

        resizeObserver.observe(contentRef.current);

        return () => {
            resizeObserver.disconnect();
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


