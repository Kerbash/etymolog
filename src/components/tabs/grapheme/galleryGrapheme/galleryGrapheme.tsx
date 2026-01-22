import { useGraphemes } from "../../../../db/useGraphemes";
import DetailedGraphemeDisplay from "./graphemeDisplay/detailed/detailed.tsx";

export default function GraphemeView() {
    const { graphemesComplete, isLoading, error } = useGraphemes();

    if (isLoading) {
        return <div>Loading graphemes...</div>;
    }

    if (error) {
        return <div>Error loading graphemes: {error.message}</div>;
    }

    if (graphemesComplete.length === 0) {
        return <div>No graphemes found. Create one to get started!</div>;
    }

    return (
        <div>
            {graphemesComplete.map((grapheme) => (
                <DetailedGraphemeDisplay key={grapheme.id} graphemeData={grapheme} />
            ))}
        </div>
    );
}