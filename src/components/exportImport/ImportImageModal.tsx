import { useState, useId } from 'react';
import Modal from 'cyber-components/container/modal/modal.tsx';
import { DialogPanel, FormActionBar } from '../shared';
import styles from './exportImport.module.scss';

interface ImportImageModalProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    onImport: (file: File) => void;
}

/**
 * The modal shell. The FORM is a separate component mounted only while the
 * modal is open, so the previously-picked file cannot survive into the next
 * open and no effect has to clear it (`react-hooks/set-state-in-effect`).
 */
export default function ImportImageModal({ isOpen, setIsOpen, onImport }: ImportImageModalProps) {
    return (
        <Modal isOpen={isOpen} setIsOpen={setIsOpen}>
            <DialogPanel size="sm" title="Import from Image">
                {isOpen && (
                    <ImportImageForm
                        onImport={onImport}
                        onClose={() => setIsOpen(false)}
                    />
                )}
            </DialogPanel>
        </Modal>
    );
}

interface ImportImageFormProps {
    onImport: (file: File) => void;
    onClose: () => void;
}

function ImportImageForm({ onImport, onClose }: ImportImageFormProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [error, setError] = useState('');
    const fileInputId = useId();

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
        onClose();
    };

    return (
        <form onSubmit={handleSubmit} className={styles.form}>
            {/* The file input was unlabelled — see ImportJsonModal. */}
            <label htmlFor={fileInputId}>Etymolog PNG export</label>
            <input
                id={fileInputId}
                type="file"
                accept=".png"
                onChange={handleFileChange}
                className={styles.fileInput}
            />

            {selectedFile && <p className={styles.fileName}>Selected: {selectedFile.name}</p>}
            {error && <p className={styles.errorMessage}>{error}</p>}

            <FormActionBar
                onCancel={onClose}
                submitLabel="Import"
                disabled={!selectedFile}
            />
        </form>
    );
}
