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
 *
 * EVERY CARD IS THE SAME SIZE. Each row below the band (title, meaning,
 * badges) is always rendered — empty rows keep their height — and every text
 * row is ONE line that ends in an ellipsis, with the full text on hover. A
 * word with a long meaning, no meaning, or a part-of-speech badge therefore
 * lines up with every other card in the grid.
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

export default function CompactLexiconDisplay({ lexiconData, graphemeMap, onClick }: CompactLexiconDisplayProps) {
    // Get the primary meaning from meanings array, or fall back to meaning field
    const primaryMeaning = lexiconData.meanings && lexiconData.meanings.length > 0
        ? lexiconData.meanings[0].meaning
        : lexiconData.meaning;

    const title = lexiconData.pronunciation ? `/${lexiconData.pronunciation}/` : lexiconData.lemma;

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
            <h3 className={styles.title} title={title}>
                {title}
            </h3>

            {/* Always rendered — an empty row keeps its height — so a word
                without a meaning is as tall as one with. The text ellipsizes;
                the "+N more" badge never does. */}
            <p className={styles.meaning} title={primaryMeaning ?? undefined}>
                {primaryMeaning ? (
                    <>
                        <span className={styles.meaningText}>{primaryMeaning}</span>
                        {additionalMeaningCount > 0 && (
                            <span className={styles.moreMeaningsBadge}>+{additionalMeaningCount} more</span>
                        )}
                    </>
                ) : (
                    <span aria-hidden="true">{'\u00a0'}</span>
                )}
            </p>

            <div className={styles.badges}>
                {!lexiconData.is_native && (
                    <span className={styles.externalBadge}>External</span>
                )}
                {lexiconData.part_of_speech && (
                    <span className={styles.posBadge} title={lexiconData.part_of_speech}>
                        {lexiconData.part_of_speech}
                    </span>
                )}
            </div>
        </div>
    );
}
