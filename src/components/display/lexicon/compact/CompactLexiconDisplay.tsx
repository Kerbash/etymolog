import type { LexiconComplete, GraphemeComplete, SpellingDisplayEntry } from '../../../../db/types';
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
    // Render a short textual spelling (mixing grapheme names and IPA chars).
    // The legacy `spelling` fallback is TYPED into `SpellingDisplayEntry` rather
    // than cast to `any`: the two shapes are close enough that a cast silently
    // accepted the wrong one, and `entry.ipaCharacter ?? entry` used to be able
    // to stringify a whole Grapheme object into the card.
    const entries: SpellingDisplayEntry[] =
        lexiconData.spellingDisplay ??
        lexiconData.spelling.map((grapheme, position) => ({
            type: 'grapheme' as const,
            position,
            grapheme,
        }));

    const textualSpelling = entries
        .map((entry) =>
            entry.type === 'grapheme' ? (entry.grapheme?.name ?? '?') : (entry.ipaCharacter ?? ''),
        )
        .join(' ');

    // Get the primary meaning from meanings array, or fall back to meaning field
    const primaryMeaning = lexiconData.meanings && lexiconData.meanings.length > 0
        ? lexiconData.meanings[0].meaning
        : lexiconData.meaning;

    // Truncate meaning for compact display
    const truncatedMeaning = primaryMeaning
        ? primaryMeaning.length > 50
            ? `${primaryMeaning.substring(0, 47)}...`
            : primaryMeaning
        : null;

    const hasSpelling = lexiconData.spellingDisplay && lexiconData.spellingDisplay.length > 0;
    const additionalMeaningCount = lexiconData.meanings && lexiconData.meanings.length > 1
        ? lexiconData.meanings.length - 1
        : 0;

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
                <p className={styles.meaning}>
                    {truncatedMeaning}
                    {additionalMeaningCount > 0 && (
                        <span className={styles.moreMeaningsBadge}>+{additionalMeaningCount} more</span>
                    )}
                </p>
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
