/**
 * CompactLexiconDisplay — the lexicon grid card.
 *
 * Three things, top to bottom: the word in the script, the word as sound, the
 * word's meaning. The script is the hero, in a GLYPH BAND that is the same
 * size on every card (a 2:1 box — its height is half the card's width) so a
 * grid of words lines up; inside it every glyph is the same size, and a word
 * that is too long for the band is scaled down as a whole — never up.
 *
 * The band used to be a DOM-measuring wrapper that applied `transform: scale`
 * after a ResizeObserver fired, so cards resized a frame late and never agreed
 * on a glyph size. It is now `GlyphSpellingDisplay fit="shrink"`: pure CSS, no
 * measuring, no state.
 *
 * The line of grapheme NAMES under the glyphs ("Ae L O") is gone: it named
 * the drawings, which the drawings already show. What identifies a word to a
 * reader is how it sounds, so the title is the pronunciation — the IPA the
 * author typed — and the lemma only when there is no pronunciation.
 */

import classNames from 'classnames';

import type { LexiconComplete, GraphemeComplete } from '../../../../db/types';
import { GlyphSpellingDisplay } from '../../spelling';
import styles from './compact.module.scss';

interface CompactLexiconDisplayProps {
    lexiconData: LexiconComplete;
    /** Map of grapheme ID to GraphemeComplete for SVG lookup */
    graphemeMap?: Map<number, GraphemeComplete>;
    onClick?: () => void;
}

/** The longest meaning the card shows before an ellipsis. */
const MEANING_MAX = 50;

export default function CompactLexiconDisplay({ lexiconData, graphemeMap, onClick }: CompactLexiconDisplayProps) {
    // Get the primary meaning from meanings array, or fall back to meaning field
    const primaryMeaning = lexiconData.meanings && lexiconData.meanings.length > 0
        ? lexiconData.meanings[0].meaning
        : lexiconData.meaning;

    // Truncate meaning for compact display
    const truncatedMeaning = primaryMeaning
        ? primaryMeaning.length > MEANING_MAX
            ? `${primaryMeaning.substring(0, MEANING_MAX - 3)}...`
            : primaryMeaning
        : null;

    const hasSpelling = Boolean(lexiconData.spellingDisplay && lexiconData.spellingDisplay.length > 0);
    const additionalMeaningCount = lexiconData.meanings && lexiconData.meanings.length > 1
        ? lexiconData.meanings.length - 1
        : 0;

    return (
        <div
            className={classNames(styles.compactCard, { [styles.clickable]: !!onClick })}
            onClick={onClick}
        >
            {/* The band is rendered whether or not there is a spelling, so a
                word without one keeps the grid's rhythm instead of collapsing. */}
            <div className={styles.glyphBand} data-testid="glyph-band">
                {hasSpelling ? (
                    <GlyphSpellingDisplay
                        glyphs={lexiconData.spellingDisplay}
                        graphemeMap={graphemeMap}
                        strategy="ltr"
                        config="card"
                        fit="shrink"
                        overflow="visible"
                    />
                ) : (
                    <span className={styles.noSpelling}>(no spelling)</span>
                )}
            </div>

            {/* Title: the pronunciation in /slashes/, the lemma only without one. */}
            <h3 className={styles.title}>
                {lexiconData.pronunciation ? `/${lexiconData.pronunciation}/` : lexiconData.lemma}
            </h3>

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
