import { useState } from "react";
import classNames from "classnames";
import GlyphForm from "../../../form/glyphForm/GlyphForm";
import { type Glyph } from "../../../../db";
import styles from "../newGrapheme/newGrapheme.module.scss";

export interface NewGlyphFormProps {
    onSuccess?: (glyph: Glyph) => void;
    onCancel?: () => void;
    className?: string;
}

export default function NewGlyphForm({ onSuccess, onCancel, className }: NewGlyphFormProps) {
    const [error, setError] = useState<string | null>(null);

    return (
        <div className={classNames(className)}>
            {error && (
                <div className={styles.errorMessage}>
                    {error}
                </div>
            )}

            <GlyphForm
                mode="create"
                onSuccess={(glyph) => {
                    setError(null);
                    onSuccess && onSuccess(glyph);
                }}
                onCancel={() => onCancel && onCancel()}
                onError={(msg) => setError(msg)}
            />
        </div>
    );
}
