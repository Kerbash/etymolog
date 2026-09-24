import type { GraphemeComplete } from '../../../../db/types.ts';
import { GlyphSpellingDisplay } from '../../spelling';
import styles from './compact.module.scss';
import classNames from 'classnames';

interface CompactGraphemeDisplayProps {
    graphemeData: GraphemeComplete;
    onClick?: () => void;
}

/**
 * Compact display for a grapheme - shows name, SVG, and primary pronunciation.
 * Designed for grid layout display. Only the DEFAULT form is drawn; a grapheme
 * with other forms gets a small "+N forms" badge in the corner (absolutely
 * positioned, so the card never grows).
 */
export default function CompactGraphemeDisplay({ graphemeData, onClick }: CompactGraphemeDisplayProps) {
    // Get the primary pronunciation (first one with auto-spelling, or just first)
    const primaryPhoneme = graphemeData.phonemes.find(p => p.use_in_auto_spelling)
        || graphemeData.phonemes[0];
    // `variants` absent ⇒ default form only (P5).
    const otherFormCount = Math.max(0, (graphemeData.variants?.length ?? 0) - 1);
    const formsLabel = `+${otherFormCount} form${otherFormCount === 1 ? '' : 's'}`;

    return (
        <div
            className={classNames(styles.compactCard, { [styles.clickable]: !!onClick })}
            onClick={onClick}
        >
            {otherFormCount > 0 && (
                <span className={styles.formsBadge} title={formsLabel}>
                    {formsLabel}
                </span>
            )}
            <h3 className={styles.name}>{graphemeData.name}</h3>
            <div className={styles.svgContainer}>
                <GlyphSpellingDisplay
                    glyphs={graphemeData.glyphs}
                    strategy="ltr"
                    config={{ glyphWidth: 56, glyphHeight: 56, spacing: 2, padding: 4 }}
                    emptyContent={<span>—</span>}
                />
            </div>
            <span className={styles.pronunciation}>
                {primaryPhoneme ? `/${primaryPhoneme.phoneme}/` : '—'}
            </span>
        </div>
    );
}
