/**
 * VariantGroupsDialog
 * -------------------
 * The script's variant groups — named buckets of forms ("head", "geometric",
 * "prefix form"…). A block layout's slot names a group, and the composer draws
 * each sign in its form from that group. This dialog lists them and adds,
 * renames (inline) and deletes them.
 *
 * Self-contained on purpose (`open` / `onClose` only): the grapheme form opens
 * it from "Manage groups…", and the Blocks page reuses it.
 *
 * Reads the list from the context slice (`data.variantGroups`); every write
 * goes through the provider-wrapped `api.variantGroup.*`, which refreshes the
 * slice (and, for a delete, the graphemes whose forms it ungroups). Deleting
 * asks first and says how many forms use the group — they are NOT deleted,
 * only ungrouped.
 *
 * Plain inputs rather than SmartForm: each action is a single one-field write
 * with its own button, and a form wrapper would add a submit pipeline around
 * a text box.
 */

import { useCallback, useState, type KeyboardEvent } from "react";

import Modal from "cyber-components/container/modal/modal.tsx";
import IconButton from "cyber-components/interactable/buttons/iconButton/iconButton.tsx";
import Button, { buttonStyles } from "cyber-components/interactable/buttons/button";

import { useEtymolog, type VariantGroup } from "../../../../db";
import { DialogPanel, useApiAction, useConfirm } from "../../../shared";

import styles from "./variantGroupsDialog.module.scss";

export interface VariantGroupsDialogProps {
    open: boolean;
    onClose: () => void;
}

/** Enter commits, Escape cancels — without reaching any outer form. */
function onEditKeys(commit: () => void, cancel?: () => void) {
    return (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            commit();
        } else if (event.key === "Escape" && cancel) {
            // Keep Escape from also closing the whole dialog mid-rename.
            event.preventDefault();
            event.stopPropagation();
            cancel();
        }
    };
}

export default function VariantGroupsDialog({ open, onClose }: VariantGroupsDialogProps) {
    const { api, data } = useEtymolog();
    const runApiAction = useApiAction();
    const confirm = useConfirm();
    const groups = data.variantGroups;

    const [newName, setNewName] = useState("");
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState("");

    const setIsOpen = useCallback(
        (next: boolean) => {
            if (!next) {
                setEditingId(null);
                onClose();
            }
        },
        [onClose],
    );

    const addGroup = useCallback(async () => {
        const name = newName.trim();
        if (!name) return;
        const result = await runApiAction(() => api.variantGroup.create({ name }), {
            errorTitle: "Could not add the group",
        });
        if (result.success) setNewName("");
    }, [api, newName, runApiAction]);

    const startRename = useCallback((group: VariantGroup) => {
        setEditingId(group.id);
        setEditName(group.name);
    }, []);

    const commitRename = useCallback(async () => {
        if (editingId === null) return;
        const name = editName.trim();
        const current = groups.find((g) => g.id === editingId);
        if (!name || name === current?.name) {
            setEditingId(null);
            return;
        }
        const result = await runApiAction(() => api.variantGroup.update(editingId, { name }), {
            errorTitle: "Could not rename the group",
        });
        if (result.success) setEditingId(null);
    }, [api, editName, editingId, groups, runApiAction]);

    const deleteGroup = useCallback(
        async (group: VariantGroup) => {
            const usage = api.variantGroup.getUsageCount(group.id);
            const count = usage.success ? (usage.data ?? 0) : 0;
            const message =
                count > 0
                    ? `${count} form${count === 1 ? " uses" : "s use"} this group. ` +
                      `${count === 1 ? "It is" : "They are"} kept, with no group, and block ` +
                      "layouts that name the group draw the default form instead."
                    : "No form uses this group.";
            const ok = await confirm({
                title: `Delete the group "${group.name}"?`,
                message,
                confirmLabel: "Delete group",
                tone: "danger",
            });
            if (!ok) return;
            await runApiAction(() => api.variantGroup.delete(group.id), {
                errorTitle: "Could not delete the group",
                success: `Deleted the group "${group.name}".`,
            });
        },
        [api, confirm, runApiAction],
    );

    return (
        <Modal isOpen={open} setIsOpen={setIsOpen} allowClose>
            <DialogPanel
                size="sm"
                title="Variant groups"
                actions={
                    <Button type="button" onClick={onClose} className={buttonStyles.secondary}>
                        Done
                    </Button>
                }
            >
                <p className={styles.intro}>
                    A group gathers one form of many signs — &ldquo;head&rdquo;, &ldquo;narrow&rdquo;…
                    A block layout picks, for each slot, the sign&rsquo;s form in that slot&rsquo;s
                    group. A sign can have at most one form per group.
                </p>

                {groups.length === 0 ? (
                    <p className={styles.empty}>No groups yet.</p>
                ) : (
                    <ul className={styles.list} aria-label="Variant groups">
                        {groups.map((group) => (
                            <li key={group.id} className={styles.row}>
                                {editingId === group.id ? (
                                    <>
                                        <input
                                            className={styles.input}
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            onKeyDown={onEditKeys(
                                                () => void commitRename(),
                                                () => setEditingId(null),
                                            )}
                                            aria-label={`New name for the group "${group.name}"`}
                                            autoFocus
                                        />
                                        <div className={styles.rowActions}>
                                            <IconButton
                                                type="button"
                                                iconName="check-lg"
                                                onClick={() => void commitRename()}
                                                aria-label={`Save the name of "${group.name}"`}
                                            />
                                            <IconButton
                                                type="button"
                                                iconName="x-lg"
                                                onClick={() => setEditingId(null)}
                                                aria-label="Cancel renaming"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <span className={styles.name}>{group.name}</span>
                                        <div className={styles.rowActions}>
                                            <IconButton
                                                type="button"
                                                iconName="pencil"
                                                onClick={() => startRename(group)}
                                                aria-label={`Rename the group "${group.name}"`}
                                            />
                                            <IconButton
                                                type="button"
                                                iconName="trash"
                                                onClick={() => void deleteGroup(group)}
                                                aria-label={`Delete the group "${group.name}"`}
                                            />
                                        </div>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                <div className={styles.addRow}>
                    <input
                        className={styles.input}
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={onEditKeys(() => void addGroup())}
                        placeholder="New group name"
                        aria-label="New group name"
                    />
                    <IconButton
                        type="button"
                        iconName="plus-lg"
                        onClick={() => void addGroup()}
                        disabled={newName.trim() === ""}
                        className={buttonStyles.primary}
                    >
                        Add group
                    </IconButton>
                </div>
            </DialogPanel>
        </Modal>
    );
}
