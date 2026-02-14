import type { LexiconComplete, GraphemeComplete } from '../../../../db/types';
import { ScaledGlyphSpellingDisplay } from './ScaledGlyphSpellingDisplay';
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
            {/* Title: show pronunciation in /slashes/ if present, otherwise show lemma */}
            <h3 className={styles.lemma}>{lexiconData.pronunciation ? `/${lexiconData.pronunciation}/` : lexiconData.lemma}</h3>

            {hasSpelling ? (
                <div className={styles.spellingContainer}>
                    <ScaledGlyphSpellingDisplay
                        glyphs={lexiconData.spellingDisplay}
                        graphemeMap={graphemeMap}
                        maxWidth={180}
                        maxHeight={60}
                    />
                </div>
            ) : (
                <div className={styles.noSpelling}>(no spelling)</div>
            )}

            <div className={styles.spellingText} title={textualSpelling}>{textualSpelling}</div>

            {/* Pronunciation already shown in title; removed secondary pronunciation element */}

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
