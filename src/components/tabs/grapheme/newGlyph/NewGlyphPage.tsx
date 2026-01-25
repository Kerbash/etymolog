import { Link } from "react-router-dom";
import classNames from "classnames";
import { flex, sizing } from "utils-styles";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import NewGlyphForm from "./NewGlyphForm.tsx";
import styles from "../newGrapheme/newGrapheme.module.scss";

export default function NewGlyphPage() {
    return (
        <div style={{ padding: '1rem' }} className={classNames(sizing.parentSize)}>
            <nav className={classNames(flex.flexRow, flex.flexGapM)} style={{ marginBottom: '1rem' }}>
                <IconButton as={Link} to="/script-maker/glyphs" iconName="arrow-left">
                    Back to Gallery
                </IconButton>
            </nav>

            <div className={styles.pageContainer}>
                <h2>Create New Glyph</h2>
                <NewGlyphForm
                    onSuccess={() => {
                        // on success the form's parent (router) will handle navigation
                    }}
                    onCancel={() => {
                        // optional: nothing here
                    }}
                />
            </div>
        </div>
    );
}
