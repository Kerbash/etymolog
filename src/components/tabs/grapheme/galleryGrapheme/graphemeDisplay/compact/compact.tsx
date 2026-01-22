import DOMPurify from 'dompurify';
import type { GraphemeComplete } from '../../../../../../db/types';
import styles from './compact.module.scss';
import classNames from 'classnames';

interface CompactGraphemeDisplayProps {
    graphemeData: GraphemeComplete;
    onClick?: () => void;
}

/**
 * Compact display for a grapheme - shows name, SVG, and primary pronunciation
 * Designed for grid layout display
 */
export default function CompactGraphemeDisplay({ graphemeData, onClick }: CompactGraphemeDisplayProps) {
    // Combine all glyph SVGs
    const combinedSvg = graphemeData.glyphs
        .map(glyph => glyph.svg_data)
        .join('');

    const sanitizedSvg = DOMPurify.sanitize(combinedSvg, {
        USE_PROFILES: { svg: true, svgFilters: true },
    });

    // Get the primary pronunciation (first one with auto-spelling, or just first)
    const primaryPhoneme = graphemeData.phonemes.find(p => p.use_in_auto_spelling)
        || graphemeData.phonemes[0];

    return (
        <div
            className={classNames(styles.compactCard, { [styles.clickable]: !!onClick })}
            onClick={onClick}
        >
            <h3 className={styles.name}>{graphemeData.name}</h3>
            <div
                className={styles.svgContainer}
                dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
            />
            <span className={styles.pronunciation}>
                {primaryPhoneme ? `/${primaryPhoneme.phoneme}/` : '—'}
            </span>
        </div>
    );
}
