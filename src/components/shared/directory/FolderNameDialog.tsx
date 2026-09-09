/**
 * FolderNameDialog (shared/directory)
 * -----------------------------------
 * The one name-entry dialog for both "New folder" and "Rename folder". A single
 * text field in a modal is genuinely overkill for SmartForm (per the CLAUDE.md
 * form guidance — this is the notified exception), so it is a plain controlled
 * input, wrapped in a real `<form>`, inside the app's shared `DialogPanel` +
 * `FormActionBar` chrome. The `<form>` means Enter in the field submits exactly
 * as the "Create folder" / "Save name" button does (the button is a genuine
 * `type="submit"`), with the disabled-when-empty guard honoured on both paths.
 *
 * Lifecycle: the WHOLE `<Modal>` is mounted only WHILE the dialog is open, so
 * the headlessui `Dialog` and its content share ONE lifecycle — opening mounts
 * both, closing unmounts both atomically. That is what keeps every close from
 * stranding an invisible, click-eating dialog shell in the DOM: the earlier
 * pattern kept `<Modal isOpen={isOpen}>` permanently mounted and gated only the
 * inner form on `{isOpen && …}`, so on close the content vanished while the
 * transitioning Dialog panel lingered mid-transition (a full-viewport container
 * with `pointer-events: auto` and a panel still tagged `data-open`), swallowing
 * every subsequent click. Mounting the Modal itself on `isOpen` removes it —
 * portal and all — the instant the dialog closes.
 *
 * Because the Modal remounts on every open, `name` still seeds fresh from
 * `initialName` through `useState` with no reseeding effect (which the
 * React-Compiler lint bans as a synchronous setState in an effect), and the
 * create dialog never re-shows a stale name.
 *
 * Moved from `tabs/lexicon/folders/` in Phase 3 (it never had a domain type of
 * its own); the old path re-exports this module.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';

import Modal from 'cyber-components/container/modal/modal';

import DialogPanel from '../dialogPanel';
import { FormActionBar } from '../forms';

import styles from './directory.module.scss';

export interface FolderNameDialogProps {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    /** Dialog heading, e.g. "New folder" or "Rename folder". */
    title: string;
    /** Submit button label. Default `'Save'`. */
    submitLabel?: string;
    /** Field label. Default `'Folder name'`. */
    fieldLabel?: string;
    /** Seed value — empty for create, the current name for rename. */
    initialName?: string;
    /** Called with the trimmed name. The dialog closes itself first. */
    onSubmit: (name: string) => void;
}

interface FolderNameFormProps {
    title: string;
    submitLabel: string;
    fieldLabel: string;
    initialName: string;
    onCancel: () => void;
    onSubmit: (name: string) => void;
}

function FolderNameForm({
    title,
    submitLabel,
    fieldLabel,
    initialName,
    onCancel,
    onSubmit,
}: FolderNameFormProps) {
    const [name, setName] = useState(initialName);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus on mount — the dialog only mounts this form when it opens.
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const trimmed = name.trim();
    const canSubmit = trimmed !== '';

    // A real form submit: fired by Enter in the field AND by the submit button,
    // so both paths go through the one guarded handler.
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmit) return;
        onSubmit(trimmed);
    };

    return (
        <form onSubmit={handleSubmit}>
            <DialogPanel
                title={title}
                size="sm"
                actions={
                    <FormActionBar
                        onCancel={onCancel}
                        submitLabel={submitLabel}
                        submitType="submit"
                        disabled={!canSubmit}
                    />
                }
            >
                <div className={styles.nameField}>
                    <label className={styles.nameLabel} htmlFor="folder-name-input">
                        {fieldLabel}
                    </label>
                    <input
                        id="folder-name-input"
                        ref={inputRef}
                        className={styles.nameInput}
                        type="text"
                        value={name}
                        maxLength={200}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
            </DialogPanel>
        </form>
    );
}

export default function FolderNameDialog({
    isOpen,
    setIsOpen,
    title,
    submitLabel = 'Save',
    fieldLabel = 'Folder name',
    initialName = '',
    onSubmit,
}: FolderNameDialogProps) {
    // Gate the ENTIRE Modal on `isOpen` (not just the inner form) so the
    // headlessui Dialog mounts and unmounts atomically with its content — see
    // the module header for why this prevents the stranded, click-eating shell.
    if (!isOpen) return null;
    return (
        <Modal isOpen setIsOpen={setIsOpen} allowClose>
            <FolderNameForm
                title={title}
                submitLabel={submitLabel}
                fieldLabel={fieldLabel}
                initialName={initialName}
                onCancel={() => setIsOpen(false)}
                onSubmit={(name) => {
                    setIsOpen(false);
                    onSubmit(name);
                }}
            />
        </Modal>
    );
}
