import { useState, useEffect } from 'react';
import classNames from 'classnames';
import Modal from 'cyber-components/container/modal/modal.tsx';
import Button from 'cyber-components/interactable/buttons/button/button.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button/button.tsx';
import { flex, sizing } from 'utils-styles';
import styles from './exportImport.module.scss';

interface ImportJsonModalProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    onImport: (json: string) => void;
}

export default function ImportJsonModal({ isOpen, setIsOpen, onImport }: ImportJsonModalProps) {
    const [value, setValue] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setValue('');
            setError('');
        }
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) {
            setError('Please paste JSON data');
            return;
        }
        onImport(trimmed);
        setIsOpen(false);
    };

    return (
        <Modal isOpen={isOpen} setIsOpen={setIsOpen}>
            <form
                onSubmit={handleSubmit}
                className={classNames(styles.modalContent, flex.flexColumn, flex.flexGapM)}
            >
                <h2 style={{ margin: 0 }}>Import from JSON</h2>

                <textarea
                    className={styles.textarea}
                    value={value}
                    onChange={(e) => { setValue(e.target.value); setError(''); }}
                    placeholder="Paste Etymolog JSON export data here..."
                    autoFocus
                />

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
                        disabled={!value.trim()}
                    >
                        Import
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
