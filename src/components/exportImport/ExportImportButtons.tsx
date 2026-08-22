import { useState } from 'react';
import DropDownSmall from 'cyber-components/container/dropDownSmall/dropDownSmall.tsx';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import { useEtymolog } from '../../db';
import { useConfirm } from '../shared';
import { useExportImport } from './useExportImport';
import ImportJsonModal from './ImportJsonModal';
import ImportImageModal from './ImportImageModal';
import graphic_template from '@styles/graphic_template.module.scss';

type PendingImport = { type: 'json'; data: string } | { type: 'image'; data: File };

export function ExportButton() {
    const { handleExportJson, handleExportImage } = useExportImport();

    return (
        /* `DropDownSmall` BUILDS the toggle element itself and renders
            `toggleBtn` as its children, so the DEFAULT `toggleBtnAs="button"`
            already gives a real, focusable, Enter/Space-operable button with
            `aria-expanded` / `aria-haspopup` / `aria-label` on it. This used to
            pass `toggleBtnAs="div"` (to avoid nesting `IconButton`'s own
            `<button>` inside it), which left a `<div aria-haspopup>` no screen
            reader announced as a control and no keyboard could reach. Rendering
            the IconButton `as="span"` keeps the header's button styling while
            the real button is the one the browser and AT see. */
        <DropDownSmall
            toggleBtn={<IconButton as="span" iconName="download">Export</IconButton>}
            contentPin="bottom-end"
            ariaLabel="Export conlang data"
        >
            <button className={graphic_template.menuItem} onClick={handleExportJson}>
                Export as JSON
            </button>
            <button className={graphic_template.menuItem} onClick={handleExportImage}>
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
    const confirm = useConfirm();

    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [importJsonOpen, setImportJsonOpen] = useState(false);
    const [importImageOpen, setImportImageOpen] = useState(false);

    // Import REPLACES everything. It used to confirm through a hand-rolled modal
    // whose "Confirm Import" button was `buttonStyles.primary` — indistinguishable
    // from a Save. It is a danger-toned confirmation now, and it names the conlang
    // whose data is about to be overwritten.
    const requestImport = async (pending: PendingImport) => {
        const confirmed = await confirm({
            title: `Replace all data in "${settings.conlangName}"?`,
            message:
                `Importing overwrites every glyph, grapheme and lexicon entry in ` +
                `"${settings.conlangName}" with the contents of this file. The current ` +
                `data cannot be recovered afterwards — export it first if you want a copy.`,
            confirmLabel: 'Replace and import',
            tone: 'danger',
        });
        if (!confirmed) return;

        if (pending.type === 'json') {
            handleImportJson(pending.data, onSuccess);
        } else {
            handleImportImage(pending.data, onSuccess);
        }
    };

    return (
        <>
            <DropDownSmall
                /* Real <button> toggle — see the note on ExportButton. */
                toggleBtn={<IconButton as="span" iconName="upload">Import</IconButton>}
                contentPin="bottom-end"
                ariaLabel="Import conlang data"
                isOpen={dropdownOpen}
                onOpenChange={setDropdownOpen}
            >
                <button className={graphic_template.menuItem} onClick={() => { setDropdownOpen(false); setImportJsonOpen(true); }}>
                    Import JSON
                </button>
                <button className={graphic_template.menuItem} onClick={() => { setDropdownOpen(false); setImportImageOpen(true); }}>
                    Import Image
                </button>
            </DropDownSmall>

            <ImportJsonModal
                isOpen={importJsonOpen}
                setIsOpen={setImportJsonOpen}
                onImport={(json) => void requestImport({ type: 'json', data: json })}
            />

            <ImportImageModal
                isOpen={importImageOpen}
                setIsOpen={setImportImageOpen}
                onImport={(file) => void requestImport({ type: 'image', data: file })}
            />

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
