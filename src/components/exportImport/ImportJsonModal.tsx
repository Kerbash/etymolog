import { useState, useId } from 'react';
import Modal from 'cyber-components/container/modal/modal.tsx';
import { DialogPanel, FormActionBar } from '../shared';
import styles from './exportImport.module.scss';

interface ImportJsonModalProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    onImport: (json: string) => void;
}

/**
 * The modal shell. The FORM is a separate component mounted only while the
 * modal is open, so its state starts empty on every open instead of being
 * cleared by an effect (`react-hooks/set-state-in-effect`) — the same pattern
 * `CreateChartModal` uses.
 */
export default function ImportJsonModal({ isOpen, setIsOpen, onImport }: ImportJsonModalProps) {
    return (
        <Modal isOpen={isOpen} setIsOpen={setIsOpen}>
            <DialogPanel size="md" title="Import from JSON">
                {isOpen && (
                    <ImportJsonForm
                        onImport={onImport}
                        onClose={() => setIsOpen(false)}
                    />
                )}
            </DialogPanel>
        </Modal>
    );
}

interface ImportJsonFormProps {
    onImport: (json: string) => void;
    onClose: () => void;
}

function ImportJsonForm({ onImport, onClose }: ImportJsonFormProps) {
    const [value, setValue] = useState('');
    const [error, setError] = useState('');
    const textareaId = useId();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) {
            setError('Please paste JSON data');
            return;
        }
        onImport(trimmed);
        onClose();
    };

    return (
        <form onSubmit={handleSubmit} className={styles.form}>
            {/* The textarea was unlabelled: a screen reader announced
                "edit text, blank" and nothing about what to paste. */}
            <label htmlFor={textareaId}>Etymolog JSON export data</label>
            <textarea
                id={textareaId}
                className={styles.textarea}
                value={value}
                onChange={(e) => { setValue(e.target.value); setError(''); }}
                placeholder="Paste Etymolog JSON export data here..."
                autoFocus
            />

            {error && <p className={styles.errorMessage}>{error}</p>}

            <FormActionBar
                onCancel={onClose}
                submitLabel="Import"
                disabled={!value.trim()}
            />
        </form>
    );
}
