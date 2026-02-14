import { useState, useEffect } from 'react';
import classNames from 'classnames';
import Modal from 'cyber-components/container/modal/modal.tsx';
import Button from 'cyber-components/interactable/buttons/button/button.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button/button.tsx';
import { graphic, flex } from 'utils-styles';
import styles from './ConlangNameModal.module.scss';

interface ConlangNameModalProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    initialName?: string;
    onSubmit: (name: string) => void;
    allowClose?: boolean;
}

export default function ConlangNameModal({
    isOpen,
    setIsOpen,
    initialName = '',
    onSubmit,
    allowClose = true,
}: ConlangNameModalProps) {
    const [name, setName] = useState(initialName);

    useEffect(() => {
        if (isOpen) {
            setName(initialName);
        }
    }, [isOpen, initialName]);

    const trimmedName = name.trim();
    const isValid = trimmedName.length > 0;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isValid) {
            onSubmit(trimmedName);
            setIsOpen(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            setIsOpen={setIsOpen}
            allowClose={allowClose}
        >
            <form
                onSubmit={handleSubmit}
                className={classNames(styles.modalContent, flex.flexColumn, flex.flexGapM)}
            >
                <h2 className={graphic.underlineHighlightColorPrimary}>
                    {initialName ? 'Rename Conlang' : 'Name Your Conlang'}
                </h2>

                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter conlang name..."
                    autoFocus
                    style={{
                        padding: '0.5em',
                        fontSize: '1rem',
                        background: 'var(--surface-raised)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '4px',
                        outline: 'none',
                    }}
                />

                <div className={classNames(flex.flexRow, flex.justifyContentEnd, flex.flexGapS)}>
                    {allowClose && (
                        <Button
                            type="button"
                            className={buttonStyles.secondary}
                            onClick={() => setIsOpen(false)}
                        >
                            Cancel
                        </Button>
                    )}
                    <Button
                        type="submit"
                        className={buttonStyles.primary}
                        disabled={!isValid}
                    >
                        {initialName ? 'Rename' : 'Create'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
