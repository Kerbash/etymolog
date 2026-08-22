import type { GraphemeComplete } from '../../../../db/types.ts';
import { GlyphSpellingDisplay } from '../../spelling';
import styles from './detailed.module.scss';

interface DetailedGraphemeDisplayProps {
    graphemeData: GraphemeComplete;
}

export default function DetailedGraphemeDisplay({ graphemeData }: DetailedGraphemeDisplayProps) {
    return (
        <div className={styles.display}>
            <div className={styles.left}>
                <div className={styles.svg}>
                    <GlyphSpellingDisplay
                        glyphs={graphemeData.glyphs}
                        strategy="ltr"
                        config={{ glyphWidth: 96, glyphHeight: 96, spacing: 4, padding: 8 }}
                        emptyContent={<span>No glyphs</span>}
                    />
                </div>
                <h2 className={styles.name}>{graphemeData.name}</h2>
                {graphemeData.glyphs.length > 1 && (
                    <span className={styles.glyphCount}>{graphemeData.glyphs.length} glyphs</span>
                )}
            </div>

            <div className={styles.right}>
                <h3 className={styles.pronunciationHeader}>Pronunciations</h3>
                <div className={styles.pronunciationList}>
                    {graphemeData.phonemes.length > 0 ? (
                        graphemeData.phonemes.map((phoneme) => (
                            <div key={phoneme.id} className={styles.pronunciationItem}>
                                <span className={styles.phonemeSymbol}>/{phoneme.phoneme}/</span>
                                {phoneme.context && (
                                    <span className={styles.phonemeContext}>{phoneme.context}</span>
                                )}
                                {phoneme.use_in_auto_spelling && (
                                    <span className={styles.autoSpellingBadge}>Auto</span>
                                )}
                            </div>
                        ))
                    ) : (
                        <p className={styles.noPhonemes}>No pronunciations defined</p>
                    )}
                </div>
            </div>
        </div>
    );
}
