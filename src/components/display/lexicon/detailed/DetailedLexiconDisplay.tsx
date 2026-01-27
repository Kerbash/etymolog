import DOMPurify from 'dompurify';
import type { LexiconComplete, GraphemeComplete } from '../../../../db/types';
import './detailed.css';

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
    // Combine all spelling grapheme SVGs (from their glyphs)
    // Use graphemeMap if provided, otherwise try to access glyphs directly (for GraphemeComplete data)
    const combinedSvg = lexiconData.spelling
        .flatMap(grapheme => {
            // Try to get full grapheme data from map
            const fullGrapheme = graphemeMap?.get(grapheme.id);
            const glyphs = fullGrapheme?.glyphs ?? (grapheme as GraphemeComplete).glyphs;
            return glyphs?.map(glyph => glyph.svg_data) ?? [];
        })
        .join('');

    const sanitizedSvg = combinedSvg ? DOMPurify.sanitize(combinedSvg, {
        USE_PROFILES: { svg: true, svgFilters: true },
    }) : '';

    const ancestorCount = lexiconData.ancestors?.length ?? 0;
    const descendantCount = lexiconData.descendants?.length ?? 0;

    return (
        <div className="detailed-lexicon-display">
            <div className="detailed-lexicon-left">
                {sanitizedSvg ? (
                    <div
                        className="detailed-lexicon-svg"
                        dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
                    />
                ) : (
                    <div className="detailed-lexicon-no-spelling">
                        No spelling
                    </div>
                )}
                <h2 className="detailed-lexicon-lemma">{lexiconData.lemma}</h2>
                {lexiconData.pronunciation && (
                    <span className="detailed-lexicon-pronunciation">
                        /{lexiconData.pronunciation}/
                    </span>
                )}
                <div className="detailed-lexicon-badges">
                    {!lexiconData.is_native && (
                        <span className="external-badge">External</span>
                    )}
                    {lexiconData.auto_spell && (
                        <span className="auto-spell-badge">Auto-spell</span>
                    )}
                </div>
            </div>

            <div className="detailed-lexicon-right">
                {lexiconData.meaning && (
                    <div className="detail-section">
                        <h3 className="section-header">Meaning</h3>
                        <p className="meaning-text">{lexiconData.meaning}</p>
                    </div>
                )}

                {lexiconData.part_of_speech && (
                    <div className="detail-section">
                        <h3 className="section-header">Part of Speech</h3>
                        <span className="pos-value">{lexiconData.part_of_speech}</span>
                    </div>
                )}

                {lexiconData.spelling.length > 0 && (
                    <div className="detail-section">
                        <h3 className="section-header">Spelling</h3>
                        <div className="grapheme-list">
                            {lexiconData.spelling.map((grapheme, index) => (
                                <span key={`${grapheme.id}-${index}`} className="grapheme-name">
                                    {grapheme.name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {showAncestry && (ancestorCount > 0 || descendantCount > 0) && (
                    <div className="detail-section etymology-section">
                        <h3 className="section-header">Etymology</h3>
                        <div className="etymology-stats">
                            {ancestorCount > 0 && (
                                <span className="etymology-stat">
                                    {ancestorCount} ancestor{ancestorCount !== 1 ? 's' : ''}
                                </span>
                            )}
                            {descendantCount > 0 && (
                                <span className="etymology-stat">
                                    {descendantCount} descendant{descendantCount !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                        {lexiconData.ancestors?.length > 0 && (
                            <div className="ancestor-list">
                                {lexiconData.ancestors.map((entry, index) => (
                                    <span key={`${entry.ancestor.id}-${index}`} className="ancestor-item">
                                        <span className="ancestor-type">{entry.ancestry_type}</span>
                                        <span className="ancestor-lemma">{entry.ancestor.lemma}</span>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {lexiconData.notes && (
                    <div className="detail-section">
                        <h3 className="section-header">Notes</h3>
                        <p className="notes-text">{lexiconData.notes}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
