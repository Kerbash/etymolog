/**
 * Phrase Display Component
 * -------------------------
 * Displays the translated phrase on a pannable/zoomable canvas.
 * Wrapper around GlyphSpellingDisplay.
 */

import { useRef } from 'react';
import type { PhraseTranslationResult, GraphemeComplete } from '../../../../db/types';
import type { LayoutStrategyType } from '../../../display/spelling/types';
import type { GlyphSpellingDisplayRef } from '../../../display/spelling/types';
import GlyphSpellingDisplay from '../../../display/spelling/GlyphSpellingDisplay';
import ExportDropdown from './ExportDropdown';
import styles from '../translator.module.scss';

interface PhraseDisplayProps {
    translationResult: PhraseTranslationResult;
    strategy: LayoutStrategyType;
    /** Map of grapheme ID to GraphemeComplete for resolving glyphs */
    graphemeMap?: Map<number, GraphemeComplete>;
}

export default function PhraseDisplay({
    translationResult,
    strategy,
    graphemeMap
}: PhraseDisplayProps) {
    const glyphSpellingRef = useRef<GlyphSpellingDisplayRef>(null);

    return (
        <div className={styles.displayContainer}>
            <div className={styles.displayHeader}>
                <h3 className={styles.displayTitle}>Translation</h3>
                <ExportDropdown
                    phrase={translationResult.originalPhrase}
                    glyphSpellingRef={glyphSpellingRef}
                />
            </div>

            <div className={styles.canvasWrapper}>
                <GlyphSpellingDisplay
                    ref={glyphSpellingRef}
                    mode="interactive"
                    glyphs={translationResult.combinedSpelling}
                    graphemeMap={graphemeMap}
                    strategy={strategy}
                    canvas={{
                        width: 800,
                        height: 600,
                        showPaperEffect: true
                    }}
                    viewport={{
                        initialZoom: 1,
                        minZoom: 0.5,
                        maxZoom: 4
                    }}
                    showControls={true}
                    showVirtualGlyphStyling={true}
                />
            </div>

            {translationResult.hasVirtualGlyphs && (
                <div className={styles.warning}>
                    ⚠️ Some words used virtual glyphs (shown as dashed boxes).
                    Add these words to your lexicon for proper spelling.
                </div>
            )}

            {/* Translation metadata */}
            <div className={styles.metadata}>
                <div className={styles.metadataItem}>
                    <strong>Words translated:</strong> {translationResult.wordTranslations.length}
                </div>
                <div className={styles.metadataItem}>
                    <strong>Lexicon matches:</strong>{' '}
                    {translationResult.wordTranslations.filter(t => t.type === 'lexicon').length}
                </div>
                <div className={styles.metadataItem}>
                    <strong>Autospelled:</strong>{' '}
                    {translationResult.wordTranslations.filter(t => t.type === 'autospell').length}
                </div>
            </div>
        </div>
    );
}
