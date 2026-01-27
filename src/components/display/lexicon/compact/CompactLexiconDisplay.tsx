import DOMPurify from 'dompurify';
import type { LexiconComplete, GraphemeComplete } from '../../../../db/types';
import styles from './compact.module.scss';
import classNames from 'classnames';

interface CompactLexiconDisplayProps {
    lexiconData: LexiconComplete;
    /** Map of grapheme ID to GraphemeComplete for SVG lookup */
    graphemeMap?: Map<number, GraphemeComplete>;
    onClick?: () => void;
}

/**
 * Compact display for a lexicon entry - shows lemma, spelling graphemes, pronunciation, and truncated meaning.
 * Designed for grid layout display.
 */
export default function CompactLexiconDisplay({ lexiconData, graphemeMap, onClick }: CompactLexiconDisplayProps) {
    // Combine all spelling grapheme SVGs (from their glyphs)
    // Use graphemeMap if provided, otherwise try to access glyphs directly (for GraphemeComplete data)
    const combinedSvg = lexiconData.spelling
        .flatMap(grapheme => {
            // Try to get full grapheme data from map
            const fullGrapheme = graphemeMap?.get(grapheme.id);
            const glyphs = fullGrapheme?.glyphs ?? (grapheme as GraphemeComplete).glyphs;
            return glyphs?.map(glyph => glyph.svg_data) ?? [];
        })
        .join('');

    const sanitizedSvg = combinedSvg ? DOMPurify.sanitize(combinedSvg, {
        USE_PROFILES: { svg: true, svgFilters: true },
    }) : '';

    // Truncate meaning for compact display
    const truncatedMeaning = lexiconData.meaning
        ? lexiconData.meaning.length > 50
            ? `${lexiconData.meaning.substring(0, 47)}...`
            : lexiconData.meaning
        : null;

    return (
        <div
            className={classNames(styles.compactCard, { [styles.clickable]: !!onClick })}
            onClick={onClick}
        >
            <h3 className={styles.lemma}>{lexiconData.lemma}</h3>

            {sanitizedSvg ? (
                <div
                    className={styles.svgContainer}
                    dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
                />
            ) : (
                <div className={styles.noSpelling}>(no spelling)</div>
            )}

            <span className={styles.pronunciation}>
                {lexiconData.pronunciation ? `/${lexiconData.pronunciation}/` : '—'}
            </span>

            {truncatedMeaning && (
                <p className={styles.meaning}>{truncatedMeaning}</p>
            )}

            <div className={styles.badges}>
                {!lexiconData.is_native && (
                    <span className={styles.externalBadge}>External</span>
                )}
                {lexiconData.part_of_speech && (
                    <span className={styles.posBadge}>{lexiconData.part_of_speech}</span>
                )}
            </div>
        </div>
    );
}
