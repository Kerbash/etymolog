import type { GraphemeComplete } from '../../../../db/types.ts';
import { GlyphSpellingDisplay } from '../../spelling';
import './detailed.css';

interface DetailedGraphemeDisplayProps {
    graphemeData: GraphemeComplete;
}

export default function DetailedGraphemeDisplay({ graphemeData }: DetailedGraphemeDisplayProps) {
    return (
        <div className="detailed-grapheme-display">
            <div className="detailed-grapheme-left">
                <div className="detailed-grapheme-svg">
                    <GlyphSpellingDisplay
                        glyphs={graphemeData.glyphs}
                        strategy="ltr"
                        config="detailed"
                        emptyContent={<span>No glyphs</span>}
                    />
                </div>
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
