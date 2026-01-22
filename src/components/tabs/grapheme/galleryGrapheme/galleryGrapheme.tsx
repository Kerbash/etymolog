import { useGraphemes } from '../../../../db/useGraphemes';
import GraphemeGallery from './graphemeGallery.tsx';

export default function GraphemeView() {
    const { graphemesComplete, isLoading, error } = useGraphemes();

    return (
        <GraphemeGallery
            graphemes={graphemesComplete}
            isLoading={isLoading}
            error={error}
            defaultViewMode="expanded"
        />
    );
}