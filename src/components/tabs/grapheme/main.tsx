import { Routes, Route, Link, useNavigate } from "react-router-dom";
import NewGlyphForm from "./newGlyph/newGlyph.tsx";
import GraphemeView from "./galleryGrapheme/galleryGrapheme.tsx";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import { buttonStyles } from "cyber-components/interactable/buttons/button/button.tsx";
import classNames from "classnames";
import { flex, sizing } from "utils-styles";

function GraphemeNav() {
    return (
        <nav className={classNames(flex.flexRow, flex.flexGapM)} style={{ marginBottom: '1rem' }}>
            <IconButton
                as={Link}
                to="/script-maker"
                iconName="grid-3x3-gap"
            >
                Gallery
            </IconButton>
            <IconButton
                as={Link}
                to="/script-maker/create"
                iconName="plus-lg"
                className={buttonStyles.primary}
            >
                Add Glyph
            </IconButton>
        </nav>
    );
}

function GraphemeHome() {
    return (
        <div className={classNames(flex.flexColumn, sizing.parentSize)}>
            <GraphemeNav />
            <GraphemeView />
        </div>
    );
}

function CreateGlyphPage() {
    const navigate = useNavigate();

    const handleSuccess = () => {
        navigate("/script-maker");
    };

    return (
        <div className={classNames(flex.flexColumn, sizing.parentSize)}>
            <nav className={classNames(flex.flexRow, flex.flexGapM)} style={{ marginBottom: '1rem' }}>
                <IconButton
                    as={Link}
                    to="/script-maker"
                    iconName="arrow-left"
                >
                    Back to Gallery
                </IconButton>
            </nav>
            <NewGlyphForm onSuccess={handleSuccess} />
        </div>
    );
}

export default function GraphemeMain() {
    return (
        <Routes>
            <Route index element={<GraphemeHome />} />
            <Route path="create" element={<CreateGlyphPage />} />
        </Routes>
    );
}
