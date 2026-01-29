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
 * Compact display for a lexicon entry - shows lemma, spelling graphemes/IPA, pronunciation, and truncated meaning.
 * Designed for grid layout display.
 */
export default function CompactLexiconDisplay({ lexiconData, graphemeMap, onClick }: CompactLexiconDisplayProps) {
    // Build combined SVG from grapheme entries only
    const combinedSvg = (lexiconData.spellingDisplay?.filter(e => e.type === 'grapheme').map(e => {
        const grapheme = e.type === 'grapheme' ? e.grapheme : null;
        if (!grapheme) return [] as string[];
        const fullGrapheme = graphemeMap?.get(grapheme.id);
        const glyphs = fullGrapheme?.glyphs ?? (grapheme as GraphemeComplete).glyphs;
        return glyphs?.map(glyph => glyph.svg_data) ?? [];
    }).flat() ?? [])
        .join('');

    const sanitizedSvg = combinedSvg ? DOMPurify.sanitize(combinedSvg, {
        USE_PROFILES: { svg: true, svgFilters: true },
    }) : '';

    // Render a short textual spelling (mixing grapheme names and IPA chars)
    const textualSpelling = (lexiconData.spellingDisplay ?? lexiconData.spelling.map(g => ({ type: 'grapheme', grapheme: g } as any))).map((entry: any, i: number) => {
        if (entry.type === 'grapheme') return entry.grapheme?.name ?? '?';
        return entry.ipaCharacter ?? entry;
    }).join(' ');

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

            <div className={styles.spellingText} title={textualSpelling}>{textualSpelling}</div>

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
