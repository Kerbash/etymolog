/**
 * FolderTreeSelect (shared/directory)
 * -----------------------------------
 * A plain `<select>` that renders the folder hierarchy with indented labels — no
 * new package deps, and the tree is small, so a native select is both the
 * lightest and the most accessible control here. Shared by the item form's
 * folder picker, the "Move to folder" dialog, and the move-a-folder dialog.
 *
 * The value is the folder id or `null` (the root / unfiled level, shown as the
 * first option). It is a plain controlled input, NOT a SmartForm field: callers
 * report it up alongside their other plain state, which keeps it out of the
 * dirty-on-mount latch machinery entirely.
 *
 * Generalised from `LexiconFolder` to `FolderRecord` in Phase 3; the old lexicon
 * path re-exports this module.
 */

import classNames from 'classnames';
import { useId, useMemo } from 'react';

import type { FolderRecord } from '../../../db/types';
import { buildFolderOptions } from './folderTree';

import styles from './directory.module.scss';

export interface FolderTreeSelectProps {
    folders: readonly FolderRecord[];
    /** Selected folder id, or null for the root / unfiled level. */
    value: number | null;
    onChange: (folderId: number | null) => void;
    /** Visible label. When omitted, pass `ariaLabel` for an accessible name. */
    label?: string;
    ariaLabel?: string;
    /** Copy for the root option. Default `'Root (no folder)'`. */
    rootLabel?: string;
    /** Drop this folder and its subtree from the options (move-a-folder case). */
    excludeId?: number;
    disabled?: boolean;
    className?: string;
}

export default function FolderTreeSelect({
    folders,
    value,
    onChange,
    label,
    ariaLabel,
    rootLabel = 'Root (no folder)',
    excludeId,
    disabled = false,
    className,
}: FolderTreeSelectProps) {
    const selectId = useId();
    const options = useMemo(
        () => buildFolderOptions(folders, excludeId !== undefined ? { excludeId } : {}),
        [folders, excludeId],
    );

    return (
        <div className={classNames(styles.selectField, className)}>
            {label && (
                <label htmlFor={selectId} className={styles.selectLabel}>
                    {label}
                </label>
            )}
            <select
                id={selectId}
                className={styles.select}
                value={value === null ? '' : String(value)}
                aria-label={label ? undefined : ariaLabel}
                disabled={disabled}
                onChange={(e) => {
                    const next = e.target.value;
                    onChange(next === '' ? null : Number.parseInt(next, 10));
                }}
            >
                <option value="">{rootLabel}</option>
                {options.map((option) => (
                    <option key={option.id} value={String(option.id)}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
