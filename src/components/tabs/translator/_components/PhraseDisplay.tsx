/**
 * Phrase Display Component
 * -------------------------
 * Displays the translated phrase on a pannable/zoomable canvas.
 * Wrapper around GlyphSpellingDisplay.
 */

import { useMemo, useRef } from 'react';

import QuickFactsRow, { type QuickFact } from 'cyber-components/display/quickFactsRow';
import type { PhraseTranslationResult, GraphemeComplete } from '../../../../db/types';
import type { WritingSystemSettings } from '../../../../db/api/types';
import type { LayoutStrategyType } from '../../../display/spelling/types';
import type { GlyphSpellingDisplayRef } from '../../../display/spelling/types';
import GlyphSpellingDisplay from '../../../display/spelling/GlyphSpellingDisplay';
import SvgIcon from 'cyber-components/graphics/decor/svgIcon/svgIcon';
import ExportDropdown from './ExportDropdown';
import styles from '../translator.module.scss';

interface PhraseDisplayProps {
    translationResult: PhraseTranslationResult;
    strategy: LayoutStrategyType;
    /** Map of grapheme ID to GraphemeComplete for resolving glyphs */
    graphemeMap?: Map<number, GraphemeComplete>;
    /** Writing system settings for composed block layout */
    writingSystem?: WritingSystemSettings;
}

export default function PhraseDisplay({
    translationResult,
    strategy,
    graphemeMap,
    writingSystem,
}: PhraseDisplayProps) {
    const glyphSpellingRef = useRef<GlyphSpellingDisplayRef>(null);

    // The same three numbers the hand-built `.metadata` row showed, in the
    // component the rest of the app uses for a stat strip — so the translator's
    // stats look like the lexicon's and the chart pages'.
    const facts = useMemo<QuickFact[]>(
        () => [
            { label: 'Words translated', value: translationResult.wordTranslations.length, big: true },
            {
                label: 'Lexicon matches',
                value: translationResult.wordTranslations.filter((t) => t.type === 'lexicon').length,
                big: true,
            },
            {
                label: 'Auto-spelled',
                value: translationResult.wordTranslations.filter((t) => t.type === 'autospell')
                    .length,
                big: true,
            },
        ],
        [translationResult.wordTranslations],
    );

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
                    writingSystem={writingSystem}
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
                    showVirtualGlyphStyling={false}
                />
            </div>

            {translationResult.hasVirtualGlyphs && (
                <div className={styles.warning}>
                    {/* An emoji is not an icon: it renders in a different font
                        per platform, is read aloud as "warning sign" by screen
                        readers on top of the sentence that already says it, and
                        cannot take a token colour. */}
                    <SvgIcon
                        iconName="exclamation-triangle"
                        color="var(--status-warning)"
                        aria-hidden="true"
                    />
                    <span>
                        Some words used virtual glyphs (shown as dashed boxes).
                        Add these words to your lexicon for proper spelling.
                    </span>
                </div>
            )}

            <QuickFactsRow items={facts} className={styles.metadata} />
        </div>
    );
}
