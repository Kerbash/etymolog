import { useState, useEffect } from 'react';
import classNames from 'classnames';
import Modal from 'cyber-components/container/modal/modal.tsx';
import Button from 'cyber-components/interactable/buttons/button/button.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button/button.tsx';
import { flex, sizing } from 'utils-styles';
import styles from './exportImport.module.scss';

interface ImportImageModalProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    onImport: (file: File) => void;
}

export default function ImportImageModal({ isOpen, setIsOpen, onImport }: ImportImageModalProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setSelectedFile(null);
            setError('');
        }
    }, [isOpen]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setError('');
        const file = e.target.files?.[0];
        if (!file) return;
        setSelectedFile(file);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile) {
            setError('Please select a file');
            return;
        }
        onImport(selectedFile);
        setIsOpen(false);
    };

    return (
        <Modal isOpen={isOpen} setIsOpen={setIsOpen}>
            <form
                onSubmit={handleSubmit}
                className={classNames(styles.modalContent, flex.flexColumn, flex.flexGapM)}
            >
                <h2 style={{ margin: 0 }}>Import from Image</h2>

                <input
                    type="file"
                    accept=".png"
                    onChange={handleFileChange}
                    className={styles.fileInput}
                />

                {selectedFile && <p className={styles.fileName}>Selected: {selectedFile.name}</p>}
                {error && <p className={styles.errorMessage}>{error}</p>}

                <div className={classNames(flex.flexRow, flex.justifyContentEnd, flex.flexGapS)}>
                    <Button
                        type="button"
                        className={buttonStyles.secondary}
                        onClick={() => setIsOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        className={buttonStyles.primary}
                        disabled={!selectedFile}
                    >
                        Import
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
