import type { LexiconComplete, GraphemeComplete } from '../../../../db/types';
import { GlyphSpellingDisplay } from '../../spelling';
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
    // Render a short textual spelling (mixing grapheme names and IPA chars)
    const textualSpelling = (lexiconData.spellingDisplay ?? lexiconData.spelling.map(g => ({ type: 'grapheme', grapheme: g } as any))).map((entry: any) => {
        if (entry.type === 'grapheme') return entry.grapheme?.name ?? '?';
        return entry.ipaCharacter ?? entry;
    }).join(' ');

    // Truncate meaning for compact display
    const truncatedMeaning = lexiconData.meaning
        ? lexiconData.meaning.length > 50
            ? `${lexiconData.meaning.substring(0, 47)}...`
            : lexiconData.meaning
        : null;

    const hasSpelling = lexiconData.spellingDisplay && lexiconData.spellingDisplay.length > 0;

    return (
        <div
            className={classNames(styles.compactCard, { [styles.clickable]: !!onClick })}
            onClick={onClick}
        >
            <h3 className={styles.lemma}>{lexiconData.lemma}</h3>

            {hasSpelling ? (
                <div className={styles.svgContainer}>
                    <GlyphSpellingDisplay
                        glyphs={lexiconData.spellingDisplay}
                        graphemeMap={graphemeMap}
                        strategy="ltr"
                        config="compact"
                        emptyContent={<span className={styles.noSpelling}>(no spelling)</span>}
                    />
                </div>
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
