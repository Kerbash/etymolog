import { useEtymolog } from '../../../../db';
import GraphemeGallery from './graphemeGallery.tsx';

export default function GraphemeView() {
    const { data, isLoading, error } = useEtymolog();

    return (
        <GraphemeGallery
            graphemes={data.graphemesComplete}
            isLoading={isLoading}
            error={error}
            defaultViewMode="expanded"
        />
    );
}