/**
 * MoveToFolderDialog (shared/directory)
 * -------------------------------------
 * A small modal wrapping the shared {@link FolderTreeSelect}; picking a
 * destination and confirming files the target (root = unfiled). Used both to
 * move an ITEM into a folder (from a card/page) and to move a FOLDER under a new
 * parent — the latter passes `excludeId` so the folder cannot be filed under
 * itself or one of its own descendants.
 *
 * Lifecycle: the WHOLE `<Modal>` mounts only WHILE the dialog is open, so the
 * headlessui `Dialog` and its content share ONE lifecycle (open mounts both,
 * close unmounts both). This is what stops a close from leaving an invisible,
 * click-eating dialog shell in the DOM — the old pattern kept the Modal mounted
 * permanently and gated only the inner form, so on close the content vanished
 * while the transitioning Dialog panel lingered mid-transition and swallowed
 * every subsequent click. Because the Modal remounts on each open the selection
 * still seeds fresh from `currentFolderId` via `useState` — no reseeding effect
 * (which the React-Compiler lint bans).
 *
 * Generalised from `LexiconFolder` to `FolderRecord` (plus `excludeId`, title
 * and label overrides) in Phase 3; the old lexicon path re-exports this module.
 */

import { useState } from 'react';

import Modal from 'cyber-components/container/modal/modal';

import type { FolderRecord } from '../../../db/types';
import DialogPanel from '../dialogPanel';
import { FormActionBar } from '../forms';
import FolderTreeSelect from './FolderTreeSelect';

export interface MoveToFolderDialogProps {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    folders: readonly FolderRecord[];
    /** The target's current folder id, or null for the root / unfiled level. */
    currentFolderId: number | null;
    /** Called with the chosen destination. The dialog closes itself first. */
    onMove: (folderId: number | null) => void;
    /** Dialog heading. Default `'Move to folder'`. */
    title?: string;
    /** Visible label for the picker. Default `'Destination folder'`. */
    fieldLabel?: string;
    /** Submit button label. Default `'Move'`. */
    submitLabel?: string;
    /**
     * Drop this folder and its subtree from the destination options — set when
     * moving a FOLDER so it can't be filed under itself or a descendant.
     */
    excludeId?: number;
}

interface MoveFormProps {
    folders: readonly FolderRecord[];
    currentFolderId: number | null;
    title: string;
    fieldLabel: string;
    submitLabel: string;
    excludeId?: number;
    onCancel: () => void;
    onMove: (folderId: number | null) => void;
}

function MoveForm({
    folders,
    currentFolderId,
    title,
    fieldLabel,
    submitLabel,
    excludeId,
    onCancel,
    onMove,
}: MoveFormProps) {
    const [selected, setSelected] = useState<number | null>(currentFolderId);

    return (
        <DialogPanel
            title={title}
            size="sm"
            actions={
                <FormActionBar
                    onCancel={onCancel}
                    submitLabel={submitLabel}
                    submitType="button"
                    onSubmit={() => onMove(selected)}
                />
            }
        >
            <FolderTreeSelect
                folders={folders}
                value={selected}
                onChange={setSelected}
                label={fieldLabel}
                excludeId={excludeId}
            />
        </DialogPanel>
    );
}

export default function MoveToFolderDialog({
    isOpen,
    setIsOpen,
    folders,
    currentFolderId,
    onMove,
    title = 'Move to folder',
    fieldLabel = 'Destination folder',
    submitLabel = 'Move',
    excludeId,
}: MoveToFolderDialogProps) {
    // Gate the ENTIRE Modal on `isOpen` (not just the inner form) so the
    // headlessui Dialog mounts and unmounts atomically with its content — see
    // the module header for why this prevents the stranded, click-eating shell.
    if (!isOpen) return null;
    return (
        <Modal isOpen setIsOpen={setIsOpen} allowClose>
            <MoveForm
                folders={folders}
                currentFolderId={currentFolderId}
                title={title}
                fieldLabel={fieldLabel}
                submitLabel={submitLabel}
                excludeId={excludeId}
                onCancel={() => setIsOpen(false)}
                onMove={(folderId) => {
                    setIsOpen(false);
                    onMove(folderId);
                }}
            />
        </Modal>
    );
}
