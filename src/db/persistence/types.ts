/**
 * Persistence Layer — Types
 *
 * The database lives in memory (sql.js). Persistence is the act of writing the
 * serialised SQLite bytes to durable browser storage so they survive a reload.
 *
 * A `DbStorageAdapter` owns ONE storage backend (IndexedDB, localStorage, or an
 * in-memory map for tests) and exposes two slots:
 *
 *   - `current`  — the last successfully written snapshot
 *   - `previous` — the snapshot that `current` replaced
 *
 * `previous` exists so that a torn/corrupt `current` (CRC mismatch, truncated
 * write, tab killed mid-save) can be recovered from rather than silently
 * replaced with an empty database. Rotation is the adapter's job: `save()` must
 * move `current → previous` before writing the new bytes, and it must do so in
 * a way that cannot leave BOTH slots damaged if the write fails half-way.
 */

export type StorageAdapterKind = 'indexeddb' | 'localstorage' | 'memory';

/** One persisted snapshot of the database. */
export interface StoredDb {
    /** Raw SQLite file bytes (what `Database.export()` returns). */
    bytes: Uint8Array;
    /** CRC-32 of `bytes`, verified on load. */
    crc: number;
    /** ISO timestamp of the save. */
    savedAt: string;
    /** Schema version the bytes were written at (informational; migrations re-derive). */
    schemaVersion: number;
}

export type PersistenceErrorCode =
    /** The backend refused the write because storage is full. */
    | 'QUOTA'
    /** No durable backend is available (e.g. private mode blocked IndexedDB AND localStorage). */
    | 'UNAVAILABLE'
    /** Any other failure while writing. */
    | 'WRITE_FAILED';

/**
 * Typed failure thrown by adapters. The scheduler maps it onto
 * `PersistenceState.error` so the UI can offer the right remedy
 * (QUOTA → "export now / free space", UNAVAILABLE → "your data will not
 * survive a reload", WRITE_FAILED → "retry").
 */
export class PersistenceError extends Error {
    readonly code: PersistenceErrorCode;
    readonly cause?: unknown;

    constructor(code: PersistenceErrorCode, message: string, cause?: unknown) {
        super(message);
        this.name = 'PersistenceError';
        this.code = code;
        this.cause = cause;
    }
}

export interface DbStorageAdapter {
    readonly kind: StorageAdapterKind;
    /** Load the `current` slot, or `null` when nothing has been saved yet. */
    load(): Promise<StoredDb | null>;
    /** Load the `previous` slot (the snapshot before `current`), or `null`. */
    loadPrevious(): Promise<StoredDb | null>;
    /** Rotate `current → previous` and write `entry` as the new `current`. */
    save(entry: StoredDb): Promise<void>;
    /** Remove both slots. */
    clear(): Promise<void>;
}

export type PersistenceStatus =
    /** Nothing has been scheduled since configuration. */
    | 'idle'
    /** A write is scheduled (debounce window open) or queued behind an in-flight save. */
    | 'pending'
    /** A write is in flight. */
    | 'saving'
    /** The last write succeeded and nothing is dirty. */
    | 'saved'
    /** The last write failed; the dirty flag is retained so a retry will re-attempt. */
    | 'error';

export interface PersistenceState {
    status: PersistenceStatus;
    /** Which backend is in use, `null` before configuration. */
    adapter: StorageAdapterKind | null;
    /** True when there are in-memory changes not yet durably written. */
    dirty: boolean;
    lastSavedAt: string | null;
    /** Size in bytes of the last successful write. */
    lastSavedBytes: number | null;
    error: { code: PersistenceErrorCode; message: string } | null;
}
