import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEtymolog, type GraphemeComplete } from '../../../../db';
import GraphemeGallery from './graphemeGallery.tsx';

export default function GraphemeView() {
    const { data, isLoading, error } = useEtymolog();
    const navigate = useNavigate();

    const handleGraphemeClick = useCallback((grapheme: GraphemeComplete) => {
        navigate(`/script-maker/grapheme/db/${grapheme.id}`);
    }, [navigate]);

    return (
        <GraphemeGallery
            graphemes={data.graphemesComplete}
            isLoading={isLoading}
            error={error}
            defaultViewMode="expanded"
            onGraphemeClick={handleGraphemeClick}
        />
    );
}