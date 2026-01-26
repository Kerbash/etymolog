import { Link, useNavigate } from "react-router-dom";
import classNames from "classnames";
import { flex, sizing } from "utils-styles";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import NewGlyphForm from "./NewGlyphForm.tsx";
import styles from "../newGrapheme/newGrapheme.module.scss";

export default function NewGlyphPage() {
    const navigate = useNavigate();
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
                    onSuccess={(glyph) => {
                        // Navigate to the glyph edit page after successful creation
                        if (glyph && (glyph as any).id) {
                            navigate(`/script-maker/glyphs/db/${(glyph as any).id}`);
                        } else {
                            // Fallback: go back to gallery if no id returned
                            navigate('/script-maker/glyphs');
                        }
                    }}
                    onCancel={() => {
                        // optional: nothing here
                    }}
                />
            </div>
        </div>
    );
}
