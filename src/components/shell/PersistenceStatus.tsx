import { useCallback, useState } from 'react';

import NotificationBanner, {
    type NotificationBannerAction,
    type NotificationBannerSeverity,
} from 'cyber-components/interactable/information/notificationBanner';
import { downloadBlob } from 'utils-func/graphic/export';

import { useEtymolog, persistDatabaseNow } from '../../db';
import { useNotify } from '../shared';
import styles from './PersistenceStatus.module.scss';

/**
 * Distance from the top of the viewport for the shell's PERSISTENT banner, in
 * px: the sticky header's 57px plus the banner's own 16px gutter.
 *
 * The transient toast surface (`NotificationProvider` in `App.tsx`) keeps the
 * default 16 and therefore floats OVER the header. That separation is
 * deliberate — both banners are `position: fixed` and horizontally centred, so
 * giving them the same offset would stack a storage error underneath a
 * "Rule saved" toast and hide it.
 */
export const SHELL_BANNER_OFFSET_TOP = 73;

const STATUS_TEXT: Record<string, string> = {
    idle: 'Saved',
    pending: 'Unsaved changes',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Not saved',
};

const ADAPTER_TEXT: Record<string, string> = {
    indexeddb: 'Stored in this browser (IndexedDB)',
    localstorage: 'Stored in this browser (localStorage fallback, ~4 MB limit)',
    memory: 'In memory only — nothing is written to durable storage',
};

/**
 * The footer's live save indicator.
 *
 * `aria-live="polite"` rather than assertive: saving is ambient information,
 * and this text changes on every debounce window. Polite means a screen reader
 * finishes the sentence it is on before mentioning it.
 */
export function PersistenceStatusText() {
    const { persistence } = useEtymolog();

    const label = persistence.error
        ? 'Not saved'
        : (STATUS_TEXT[persistence.status] ?? 'Saved');

    const adapter = persistence.adapter
        ? ADAPTER_TEXT[persistence.adapter]
        : 'Storage not configured yet';

    const savedAt = persistence.lastSavedAt
        ? ` Last saved ${new Date(persistence.lastSavedAt).toLocaleTimeString()}.`
        : '';

    return (
        <span
            className={styles.status}
            role="status"
            aria-live="polite"
            data-persistence-status={persistence.status}
            title={`${adapter}.${savedAt}`}
        >
            {label}
        </span>
    );
}

interface ShellIssue {
    /** Stable identity of the CONDITION, used to key the dismissal. */
    key: string;
    severity: NotificationBannerSeverity;
    title: string;
    message: string;
    actions?: NotificationBannerAction[];
}

/**
 * ShellStatusBanner — the one persistent surface for "your data is at risk".
 *
 * Mounted ONCE by `AppShell`. Everything it reports is a condition that stays
 * true until something is done about it (storage refused the write, the boot
 * fell back to the previous snapshot, the schema has orphaned rows), which is
 * why it is a persistent banner and not a toast: a 2.5-second notice that the
 * browser cannot save the conlang is worse than none.
 *
 * Dismissal is keyed by the CONDITION *and its generation*: the condition's
 * key plus the last successful save (for storage errors) or the violation
 * count (for the repair warning). Closing a quota banner therefore does not
 * suppress a later foreign-key warning, and the same quota error re-raises
 * once a successful save has happened in between — a dismissal that silenced
 * "your data is not being saved" for the rest of the session would defeat the
 * banner's whole reason to exist.
 */
interface Dismissal {
    key: string;
    /** `persistence.lastSavedAt` when dismissed — a later successful save invalidates it. */
    savedAt: string | null;
    /** `health.fkViolations` when dismissed — a different count is a new condition. */
    fkViolations: number;
}
export function ShellStatusBanner() {
    const { api, persistence, health } = useEtymolog();
    const notify = useNotify();
    const [dismissed, setDismissed] = useState<Dismissal | null>(null);
    const [repairing, setRepairing] = useState(false);

    const exportJson = useCallback(() => {
        const result = api.database.export('json');
        if (!result.success || !result.data) {
            notify.error(result.error?.message ?? 'Export failed.');
            return;
        }
        downloadBlob(result.data, 'etymolog-rescue.json');
    }, [api, notify]);

    const retrySave = useCallback(() => {
        void persistDatabaseNow().catch((err: unknown) => {
            notify.error(err instanceof Error ? err.message : 'The save failed again.');
        });
    }, [notify]);

    const repair = useCallback(() => {
        setRepairing(true);
        const result = api.database.repair();
        setRepairing(false);
        if (!result.success || !result.data) {
            notify.error(result.error?.message ?? 'Repair failed.');
            return;
        }
        const total = result.data.total;
        notify.success(
            total === 0
                ? 'Nothing to repair — the database is already consistent.'
                : `Repaired ${total} damaged row${total === 1 ? '' : 's'}.`,
        );
        // The provider re-samples `health` after a repair, which clears the
        // condition in the real app; the local dismissal covers the render
        // between the two so the warning never lingers after a success.
        setDismissed({ key: 'fk-violations', savedAt: persistence.lastSavedAt, fkViolations: health.fkViolations });
    }, [api, notify, persistence.lastSavedAt, health.fkViolations]);

    const issue = ((): ShellIssue | null => {
        const error = persistence.error;
        if (error?.code === 'QUOTA') {
            return {
                key: 'persist-QUOTA',
                severity: 'error',
                title: 'Storage is full',
                message:
                    'The browser refused to save this conlang because its storage quota is ' +
                    'used up. Export a copy now, free some space, then retry.',
                actions: [
                    { label: 'Export JSON', onClick: exportJson, variant: 'primary' },
                    { label: 'Retry', onClick: retrySave },
                ],
            };
        }
        if (error?.code === 'UNAVAILABLE') {
            return {
                key: 'persist-UNAVAILABLE',
                severity: 'warning',
                title: 'Changes are not being saved',
                message:
                    'No durable storage is available in this browser (private mode blocks it). ' +
                    'Nothing you do here will survive a reload — export before you close the tab.',
                actions: [{ label: 'Export JSON', onClick: exportJson, variant: 'primary' }],
            };
        }
        if (error?.code === 'WRITE_FAILED') {
            return {
                key: 'persist-WRITE_FAILED',
                severity: 'error',
                title: 'The last save failed',
                message: error.message,
                actions: [{ label: 'Retry', onClick: retrySave, variant: 'primary' }],
            };
        }
        if (health.fkViolations > 0) {
            return {
                key: 'fk-violations',
                severity: 'warning',
                title: 'Damaged references found',
                message:
                    `${health.fkViolations} row${health.fkViolations === 1 ? '' : 's'} point at ` +
                    'data that no longer exists. Repairing prunes them and rebuilds the ' +
                    'ancestry index; nothing you can still see is deleted.',
                actions: [
                    { label: 'Repair', onClick: repair, variant: 'primary', disabled: repairing },
                ],
            };
        }
        if (health.restoredFromBackup || health.crcMismatch) {
            return {
                key: 'restored-from-backup',
                severity: 'info',
                title: 'Recovered from the previous snapshot',
                message:
                    'The most recent save could not be read, so the snapshot before it was ' +
                    'loaded. Anything changed in the last few seconds before the tab closed ' +
                    'may be missing.',
            };
        }
        return null;
    })();

    const isDismissed =
        issue !== null &&
        dismissed !== null &&
        dismissed.key === issue.key &&
        dismissed.savedAt === persistence.lastSavedAt &&
        dismissed.fkViolations === health.fkViolations;
    const visible = issue !== null && !isDismissed;

    return (
        <NotificationBanner
            // Keyed by condition so a new issue remounts the banner (and replays
            // its enter animation) rather than swapping text inside the old one.
            key={issue?.key ?? 'none'}
            visible={visible}
            severity={issue?.severity ?? 'info'}
            title={issue?.title}
            message={issue?.message}
            actions={issue?.actions}
            offsetTop={SHELL_BANNER_OFFSET_TOP}
            onDismiss={() =>
                issue &&
                setDismissed({ key: issue.key, savedAt: persistence.lastSavedAt, fkViolations: health.fkViolations })
            }
        />
    );
}
