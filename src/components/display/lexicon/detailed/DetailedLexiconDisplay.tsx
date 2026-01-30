import type { LexiconComplete, GraphemeComplete } from '../../../../db/types';
import { GlyphSpellingDisplay } from '../../spelling';
import styles from './detailed.module.scss';

interface DetailedLexiconDisplayProps {
    lexiconData: LexiconComplete;
    /** Map of grapheme ID to GraphemeComplete for SVG lookup */
    graphemeMap?: Map<number, GraphemeComplete>;
    showAncestry?: boolean;
}

/**
 * Detailed display for a lexicon entry - shows full information including
 * spelling visualization, lemma, pronunciation, meaning, etymology info.
 */
export default function DetailedLexiconDisplay({
    lexiconData,
    graphemeMap,
    showAncestry = true
}: DetailedLexiconDisplayProps) {
    const ancestorCount = lexiconData.ancestors?.length ?? 0;
    const descendantCount = lexiconData.descendants?.length ?? 0;
    const hasSpelling = lexiconData.spellingDisplay && lexiconData.spellingDisplay.length > 0;

    console.log("graphemeMap:", graphemeMap, " SpellingDisplay:", lexiconData.spellingDisplay);
    return (
        <div className={styles.detailedLexiconDisplay}>
            <div className={styles.detailedLexiconLeft}>
                {hasSpelling ? (
                    <div className={styles.detailedLexiconSvg}>
                        <GlyphSpellingDisplay
                            glyphs={lexiconData.spellingDisplay}
                            graphemeMap={graphemeMap}
                            strategy="ltr"
                            config="compact"
                            glyphEmPx={64}
                            zoom={1}
                            emptyContent={<span>No spelling</span>}
                        />
                    </div>
                ) : (
                    <div className={styles.detailedLexiconNoSpelling}>
                        No spelling
                    </div>
                )}
                <h2 className={styles.detailedLexiconLemma}>{lexiconData.lemma}</h2>
                {lexiconData.pronunciation && (
                    <span className={styles.detailedLexiconPronunciation}>
                        /{lexiconData.pronunciation}/
                    </span>
                )}
                <div className={styles.detailedLexiconBadges}>
                    {!lexiconData.is_native && (
                        <span className={styles.externalBadge}>External</span>
                    )}
                    {lexiconData.auto_spell && (
                        <span className={styles.autoSpellBadge}>Auto-spell</span>
                    )}
                </div>
            </div>

            <div className={styles.detailedLexiconRight}>
                {lexiconData.meaning && (
                    <div className={styles.detailSection}>
                        <h3 className={styles.sectionHeader}>Meaning</h3>
                        <p className={styles.meaningText}>{lexiconData.meaning}</p>
                    </div>
                )}

                {lexiconData.part_of_speech && (
                    <div className={styles.detailSection}>
                        <h3 className={styles.sectionHeader}>Part of Speech</h3>
                        <span className={styles.posValue}>{lexiconData.part_of_speech}</span>
                    </div>
                )}

                {(lexiconData.spellingDisplay && lexiconData.spellingDisplay.length > 0) && (
                    <div className={styles.detailSection}>
                        <h3 className={styles.sectionHeader}>Spelling</h3>
                        <div className={styles.graphemeList}>
                            {lexiconData.spellingDisplay.map((entry, index) => (
                                entry.type === 'grapheme' ? (
                                    <span key={`g-${entry.grapheme?.id}-${index}`} className={styles.graphemeName}>
                                        {entry.grapheme?.name ?? '�'}
                                    </span>
                                ) : (
                                    <span key={`ipa-${index}`} className={styles.ipaChar} title={`IPA: ${entry.ipaCharacter}`}>
                                        {entry.ipaCharacter}
                                    </span>
                                )
                            ))}
                        </div>
                    </div>
                )}

                {showAncestry && (ancestorCount > 0 || descendantCount > 0) && (
                    <div className={`${styles.detailSection} ${styles.etymologySection}`}>
                        <h3 className={styles.sectionHeader}>Etymology</h3>
                        <div className={styles.etymologyStats}>
                            {ancestorCount > 0 && (
                                <span className={styles.etymologyStat}>
                                    {ancestorCount} ancestor{ancestorCount !== 1 ? 's' : ''}
                                </span>
                            )}
                            {descendantCount > 0 && (
                                <span className={styles.etymologyStat}>
                                    {descendantCount} descendant{descendantCount !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                        {lexiconData.ancestors?.length > 0 && (
                            <div className={styles.ancestorList}>
                                {lexiconData.ancestors.map((entry, index) => (
                                    <span key={`${entry.ancestor.id}-${index}`} className={styles.ancestorItem}>
                                        <span className={styles.ancestorType}>{entry.ancestry_type}</span>
                                        <span className={styles.ancestorLemma}>{entry.ancestor.lemma}</span>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {lexiconData.notes && (
                    <div className={styles.detailSection}>
                        <h3 className={styles.sectionHeader}>Notes</h3>
                        <p className={styles.notesText}>{lexiconData.notes}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
