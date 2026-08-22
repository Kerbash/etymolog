/**
 * localStorage adapter
 *
 * The legacy backend (and the fallback when IndexedDB is unavailable). Bytes are
 * base64-encoded under the same keys the app has always used, so an existing
 * install keeps loading its data without a migration step:
 *
 *   etymolog_db_v3            base64 of the SQLite bytes   (current)
 *   etymolog_db_v3_crc32      CRC-32 as lowercase hex      (current)
 *   etymolog_db_v3_meta       { savedAt, schemaVersion }   (current, new)
 *   etymolog_db_v3_prev*      the same three keys for the previous slot
 *
 * localStorage is synchronous and has a hard, browser-specific ceiling
 * (commonly ~5 MB of UTF-16 code units per origin). Base64 inflates by 4/3, so
 * the practical database ceiling is ~3.7 MB. We refuse writes that would
 * obviously exceed a conservative soft limit BEFORE touching storage, so the
 * error is a typed `QUOTA` rather than a browser exception after `previous`
 * has already been rotated.
 */

import { PersistenceError, type DbStorageAdapter, type StoredDb } from './types';

export const LS_CURRENT_KEY = 'etymolog_db_v3';
export const LS_CURRENT_CRC_KEY = 'etymolog_db_v3_crc32';
export const LS_CURRENT_META_KEY = 'etymolog_db_v3_meta';
export const LS_PREVIOUS_KEY = 'etymolog_db_v3_prev';
export const LS_PREVIOUS_CRC_KEY = 'etymolog_db_v3_prev_crc32';
export const LS_PREVIOUS_META_KEY = 'etymolog_db_v3_prev_meta';

/**
 * Hard ceiling on ONE base64 payload. Browsers cap localStorage around 5 MB of
 * characters, so nothing above this can ever be written. Steady state is
 * `current` + `previous` = 2 × payload; when that no longer fits, `save()`
 * gives up the previous slot before failing (see below), so the practical
 * ceiling with a backup is ~2.2 MB and without one ~4.5 MB.
 */
export const LS_SOFT_LIMIT_CHARS = 4.5 * 1024 * 1024;

const CHUNK = 0x8000;

/** Chunked base64 encode — `String.fromCharCode.apply` over 32 KB slices, no per-byte array. */
export function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
        const slice = bytes.subarray(i, i + CHUNK);
        binary += String.fromCharCode.apply(null, slice as unknown as number[]);
    }
    return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}

interface SlotKeys {
    data: string;
    crc: string;
    meta: string;
}

const CURRENT: SlotKeys = { data: LS_CURRENT_KEY, crc: LS_CURRENT_CRC_KEY, meta: LS_CURRENT_META_KEY };
const PREVIOUS: SlotKeys = { data: LS_PREVIOUS_KEY, crc: LS_PREVIOUS_CRC_KEY, meta: LS_PREVIOUS_META_KEY };

function isQuotaError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const e = error as { name?: string; code?: number };
    return e.name === 'QuotaExceededError'
        || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || e.code === 22
        || e.code === 1014;
}

function readSlot(storage: Storage, keys: SlotKeys): StoredDb | null {
    const data = storage.getItem(keys.data);
    if (!data) return null;
    const bytes = base64ToBytes(data);
    const crcHex = storage.getItem(keys.crc);
    let meta: { savedAt?: string; schemaVersion?: number } = {};
    try {
        meta = JSON.parse(storage.getItem(keys.meta) ?? '{}');
    } catch {
        meta = {};
    }
    return {
        bytes,
        // A missing CRC (pre-CRC installs) is recorded as -1 so the loader can
        // tell "no checksum" apart from "checksum mismatch".
        crc: crcHex ? parseInt(crcHex, 16) : -1,
        savedAt: meta.savedAt ?? '',
        schemaVersion: meta.schemaVersion ?? 0,
    };
}

function writeSlot(storage: Storage, keys: SlotKeys, data: string, crc: number, meta: string): void {
    storage.setItem(keys.data, data);
    storage.setItem(keys.crc, crc.toString(16));
    storage.setItem(keys.meta, meta);
}

function clearSlot(storage: Storage, keys: SlotKeys): void {
    storage.removeItem(keys.data);
    storage.removeItem(keys.crc);
    storage.removeItem(keys.meta);
}

export function createLocalStorageAdapter(storage: Storage = localStorage): DbStorageAdapter {
    return {
        kind: 'localstorage',

        async load() {
            return readSlot(storage, CURRENT);
        },

        async loadPrevious() {
            return readSlot(storage, PREVIOUS);
        },

        async save(entry) {
            const encoded = bytesToBase64(entry.bytes);
            if (encoded.length > LS_SOFT_LIMIT_CHARS) {
                throw new PersistenceError(
                    'QUOTA',
                    `Database (${(entry.bytes.length / 1024 / 1024).toFixed(1)} MB) exceeds the localStorage ceiling. Export your conlang and free storage, or use a browser with IndexedDB.`,
                );
            }
            const meta = JSON.stringify({ savedAt: entry.savedAt, schemaVersion: entry.schemaVersion });

            // Rotate current → previous, then write current. If either write
            // hits quota, the backup is the thing to sacrifice: drop `previous`
            // and write `current` alone. Without this retry a conlang that had
            // grown past half the quota could never be saved again — every
            // attempt rotated, overflowed and failed identically.
            const currentData = storage.getItem(CURRENT.data);
            const writeCurrent = () => writeSlot(storage, CURRENT, encoded, entry.crc, meta);
            try {
                if (currentData) {
                    writeSlot(
                        storage,
                        PREVIOUS,
                        currentData,
                        parseInt(storage.getItem(CURRENT.crc) ?? '0', 16),
                        storage.getItem(CURRENT.meta) ?? '{}',
                    );
                }
                writeCurrent();
            } catch (error) {
                if (!isQuotaError(error)) {
                    throw new PersistenceError('WRITE_FAILED', error instanceof Error ? error.message : 'localStorage write failed', error);
                }
                clearSlot(storage, PREVIOUS);
                try {
                    writeCurrent();
                } catch (retryError) {
                    if (isQuotaError(retryError)) {
                        throw new PersistenceError('QUOTA', 'Browser storage is full; the latest changes could not be saved.', retryError);
                    }
                    throw new PersistenceError('WRITE_FAILED', retryError instanceof Error ? retryError.message : 'localStorage write failed', retryError);
                }
            }
        },

        async clear() {
            clearSlot(storage, CURRENT);
            clearSlot(storage, PREVIOUS);
        },
    };
}
