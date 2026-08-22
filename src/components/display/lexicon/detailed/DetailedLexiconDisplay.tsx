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
                {/* Primary title: pronunciation in slashes, or lemma fallback */}
                <h2 className={styles.detailedLexiconLemma}>{lexiconData.pronunciation ? `/${lexiconData.pronunciation}/` : lexiconData.lemma}</h2>

                {/* A LABELLED group: "External" and "Auto-spell" sat here as
                    bare chips with no indication of what dimension they
                    describe, which is how the walk-through read them as noise
                    next to the title and the "No spelling" placeholder. The
                    group name says they are STATUS. */}
                <div
                    className={styles.detailedLexiconBadges}
                    role="group"
                    aria-label="Word status"
                >
                    {!lexiconData.is_native && (
                        <span className={styles.externalBadge}>External</span>
                    )}
                    {lexiconData.auto_spell && (
                        <span className={styles.autoSpellBadge}>Auto-spell</span>
                    )}
                </div>
            </div>

            <div className={styles.detailedLexiconRight}>
                {(lexiconData.meanings && lexiconData.meanings.length > 0) || lexiconData.meaning ? (
                    <div className={styles.detailSection}>
                        <h3 className={styles.sectionHeader}>Meaning{lexiconData.meanings && lexiconData.meanings.length > 1 ? 's' : ''}</h3>
                        {lexiconData.meanings && lexiconData.meanings.length > 0 ? (
                            <ol className={styles.meaningsList}>
                                {lexiconData.meanings.map((meaning, index) => (
                                    <li key={meaning.id || index} className={styles.meaningItem}>
                                        <span className={styles.meaningText}>{meaning.meaning}</span>
                                        {meaning.part_of_speech && (
                                            <span className={styles.meaningPos}> — {meaning.part_of_speech}</span>
                                        )}
                                        {meaning.usage_notes && (
                                            <span className={styles.usageNotes}> (usage: {meaning.usage_notes})</span>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            lexiconData.meaning && (
                                <p className={styles.meaningText}>{lexiconData.meaning}</p>
                            )
                        )}
                    </div>
                ) : null}

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
                                        <span className={styles.ancestorLemma}>{entry.ancestor.pronunciation ?? entry.ancestor.lemma}</span>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}
