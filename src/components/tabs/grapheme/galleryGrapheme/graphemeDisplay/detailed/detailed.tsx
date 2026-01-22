import DOMPurify from 'dompurify';
import type { GraphemeComplete } from '../../../../../../db/types';
import './detailed.css';

interface DetailedGraphemeDisplayProps {
    graphemeData: GraphemeComplete;
}

export default function DetailedGraphemeDisplay({ graphemeData }: DetailedGraphemeDisplayProps) {
    // Combine all glyph SVGs into one display
    // For now, just show the first glyph if there's only one
    // In the future, this could render multiple glyphs side by side
    const combinedSvg = graphemeData.glyphs
        .map(glyph => glyph.svg_data)
        .join('');

    const sanitizedSvg = DOMPurify.sanitize(combinedSvg, {
        USE_PROFILES: { svg: true, svgFilters: true },
    });

    return (
        <div className="detailed-grapheme-display">
            <div className="detailed-grapheme-left">
                <div
                    className="detailed-grapheme-svg"
                    dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
                />
                <h2 className="detailed-grapheme-name">{graphemeData.name}</h2>
                {graphemeData.glyphs.length > 1 && (
                    <span className="glyph-count">{graphemeData.glyphs.length} glyphs</span>
                )}
            </div>

            <div className="detailed-grapheme-right">
                <h3 className="pronunciation-header">Pronunciations</h3>
                <div className="pronunciation-container">
                    {graphemeData.phonemes.length > 0 ? (
                        graphemeData.phonemes.map((phoneme) => (
                            <div key={phoneme.id} className="pronunciation-item">
                                <span className="phoneme-symbol">/{phoneme.phoneme}/</span>
                                {phoneme.context && (
                                    <span className="phoneme-context">{phoneme.context}</span>
                                )}
                                {phoneme.use_in_auto_spelling && (
                                    <span className="auto-spelling-badge">Auto</span>
                                )}
                            </div>
                        ))
                    ) : (
                        <p className="no-phonemes">No pronunciations defined</p>
                    )}
                </div>
            </div>
        </div>
    );
}