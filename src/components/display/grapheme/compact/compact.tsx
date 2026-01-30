import type { GraphemeComplete } from '../../../../db/types.ts';
import { GlyphSpellingDisplay } from '../../spelling';
import styles from './compact.module.scss';
import classNames from 'classnames';

interface CompactGraphemeDisplayProps {
    graphemeData: GraphemeComplete;
    onClick?: () => void;
}

/**
 * Compact display for a grapheme - shows name, SVG, and primary pronunciation
 * Designed for grid layout display
 */
export default function CompactGraphemeDisplay({ graphemeData, onClick }: CompactGraphemeDisplayProps) {
    // Get the primary pronunciation (first one with auto-spelling, or just first)
    const primaryPhoneme = graphemeData.phonemes.find(p => p.use_in_auto_spelling)
        || graphemeData.phonemes[0];

    return (
        <div
            className={classNames(styles.compactCard, { [styles.clickable]: !!onClick })}
            onClick={onClick}
        >
            <h3 className={styles.name}>{graphemeData.name}</h3>
            <div className={styles.svgContainer}>
                <GlyphSpellingDisplay
                    glyphs={graphemeData.glyphs}
                    strategy="ltr"
                    config={{ glyphWidth: 28, glyphHeight: 28, spacing: 2, padding: 2 }}
                    emptyContent={<span>—</span>}
                />
            </div>
            <span className={styles.pronunciation}>
                {primaryPhoneme ? `/${primaryPhoneme.phoneme}/` : '—'}
            </span>
        </div>
    );
}
