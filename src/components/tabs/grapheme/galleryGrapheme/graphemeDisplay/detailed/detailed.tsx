import DOMPurify from 'dompurify';
import './detailed.css';

interface Phoneme {
    id: number;
    grapheme_id: number;
    phoneme: string;
    use_in_auto_spelling: boolean;
    context: string | null;
}

export interface GraphemeData {
    id: number;
    name: string;
    svg_data: string;
    notes: string;
    created_at: string;
    updated_at: string;
    phonemes: Phoneme[];
}

interface DetailedGraphemeDisplayProps {
    graphemeData: GraphemeData;
}

export default function DetailedGraphemeDisplay({ graphemeData }: DetailedGraphemeDisplayProps) {
    const sanitizedSvg = DOMPurify.sanitize(graphemeData.svg_data, {
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