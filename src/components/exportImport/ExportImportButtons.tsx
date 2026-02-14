import { useState } from 'react';
import classNames from 'classnames';
import DropDownSmall from 'cyber-components/container/dropDownSmall/dropDownSmall.tsx';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import Modal from 'cyber-components/container/modal/modal.tsx';
import Button from 'cyber-components/interactable/buttons/button/button.tsx';
import { buttonStyles } from 'cyber-components/interactable/buttons/button/button.tsx';
import { flex, sizing } from 'utils-styles';
import { useEtymolog } from '../../db';
import { useExportImport } from './useExportImport';
import ImportJsonModal from './ImportJsonModal';
import ImportImageModal from './ImportImageModal';
import styles from './exportImport.module.scss';

type ConfirmImport = { type: 'json'; data: string } | { type: 'image'; data: File };

export function ExportButton() {
    const { handleExportJson, handleExportImage } = useExportImport();

    return (
        <DropDownSmall
            toggleBtn={<IconButton iconName="download">Export</IconButton>}
            contentPin="bottom-end"
            ariaLabel="Export conlang data"
        >
            <button className={styles.menuItem} onClick={handleExportJson}>
                Export as JSON
            </button>
            <button className={styles.menuItem} onClick={handleExportImage}>
                Export as Image
            </button>
        </DropDownSmall>
    );
}

interface ImportButtonProps {
    onSuccess?: () => void;
}

export function ImportButton({ onSuccess }: ImportButtonProps = {}) {
    const { settings } = useEtymolog();
    const { handleImportJson, handleImportImage } = useExportImport();

    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [importJsonOpen, setImportJsonOpen] = useState(false);
    const [importImageOpen, setImportImageOpen] = useState(false);
    const [confirmImport, setConfirmImport] = useState<ConfirmImport | null>(null);

    const onJsonImportSubmit = (json: string) => {
        setConfirmImport({ type: 'json', data: json });
    };

    const onImageImportSubmit = (file: File) => {
        setConfirmImport({ type: 'image', data: file });
    };

    const handleConfirm = () => {
        if (!confirmImport) return;
        if (confirmImport.type === 'json') {
            handleImportJson(confirmImport.data, onSuccess);
        } else {
            handleImportImage(confirmImport.data, onSuccess);
        }
        setConfirmImport(null);
    };

    return (
        <>
            <DropDownSmall
                toggleBtn={<IconButton iconName="upload">Import</IconButton>}
                contentPin="bottom-end"
                ariaLabel="Import conlang data"
                isOpen={dropdownOpen}
                onOpenChange={setDropdownOpen}
            >
                <button className={styles.menuItem} onClick={() => { setDropdownOpen(false); setImportJsonOpen(true); }}>
                    Import JSON
                </button>
                <button className={styles.menuItem} onClick={() => { setDropdownOpen(false); setImportImageOpen(true); }}>
                    Import Image
                </button>
            </DropDownSmall>

            <ImportJsonModal
                isOpen={importJsonOpen}
                setIsOpen={setImportJsonOpen}
                onImport={onJsonImportSubmit}
            />

            <ImportImageModal
                isOpen={importImageOpen}
                setIsOpen={setImportImageOpen}
                onImport={onImageImportSubmit}
            />

            <Modal
                isOpen={confirmImport !== null}
                setIsOpen={(open) => { if (!open) setConfirmImport(null); }}
            >
                <div className={classNames(styles.modalContent, flex.flexColumn, flex.flexGapM)}>
                    <h2 style={{ margin: 0 }}>Confirm Import</h2>
                    <p style={{ margin: 0 }}>
                        This will replace <strong>ALL</strong> current data for <strong>{settings.conlangName}</strong>. Continue?
                    </p>
                    <div className={classNames(flex.flexRow, flex.justifyContentEnd, flex.flexGapS)}>
                        <Button
                            className={buttonStyles.secondary}
                            onClick={() => setConfirmImport(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            className={buttonStyles.primary}
                            onClick={handleConfirm}
                        >
                            Confirm Import
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
}

export default function ExportImportButtons() {
    return (
        <>
            <ExportButton />
            <ImportButton />
        </>
    );
}
