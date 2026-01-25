import { useState } from "react";
import classNames from "classnames";
import Modal from "cyber-components/container/modal/modal.tsx";
import { graphic } from "utils-styles";
import { type Glyph } from "../../../../db";
import NewGlyphForm from "./NewGlyphForm.tsx";
import styles from "../newGrapheme/newGrapheme.module.scss";

interface NewGlyphModalProps {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    onGlyphCreated: (glyph: Glyph) => void;
}

export default function NewGlyphModal({ isOpen, setIsOpen, onGlyphCreated }: NewGlyphModalProps) {
    const [error, setError] = useState<string | null>(null);

    const handleClose = () => {
        setError(null);
        setIsOpen(false);
    };

    return (
        <Modal
            isOpen={isOpen}
            setIsOpen={setIsOpen}
            onClose={handleClose}
            allowClose={true}
        >
            <div className={classNames(styles.modalContent)}>
                <h2 className={graphic.underlineHighlightColorPrimary}>
                    Create New Glyph
                </h2>

                {error && (
                    <div className={styles.errorMessage}>
                        {error}
                    </div>
                )}

                <NewGlyphForm
                    onSuccess={(glyph) => {
                        setError(null);
                        setIsOpen(false);
                        // notify parent after a short delay so modal close has propagated
                        setTimeout(() => onGlyphCreated(glyph), 20);
                    }}
                    onCancel={() => handleClose()}
                />
            </div>
        </Modal>
    );
}
