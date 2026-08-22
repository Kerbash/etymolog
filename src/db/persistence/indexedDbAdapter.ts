/**
 * IndexedDB adapter — the primary backend.
 *
 * Stores the raw `Uint8Array` (no base64 inflation) in a single object store
 * with two fixed keys, `current` and `previous`. Rotation and the new write
 * happen inside ONE readwrite transaction, so a failure leaves storage exactly
 * as it was: IndexedDB transactions are atomic.
 *
 * Quota behaviour: IndexedDB budgets are orders of magnitude larger than
 * localStorage (hundreds of MB+), but a full disk or an aggressive private-mode
 * policy still surfaces as a `QuotaExceededError` on the transaction — mapped
 * to the typed `QUOTA` code here.
 */

import { PersistenceError, type DbStorageAdapter, type StoredDb } from './types';

export const IDB_NAME = 'etymolog';
export const IDB_STORE = 'database';
const IDB_VERSION = 1;
const KEY_CURRENT = 'current';
const KEY_PREVIOUS = 'previous';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
}

function isQuotaError(error: unknown): boolean {
    return !!error && typeof error === 'object' && (error as { name?: string }).name === 'QuotaExceededError';
}

/** Structured clone may hand back an ArrayBuffer in some engines — normalise. */
function normaliseStored(value: unknown): StoredDb | null {
    if (!value || typeof value !== 'object') return null;
    const v = value as Partial<StoredDb> & { bytes?: unknown };
    if (!v.bytes) return null;
    const bytes = v.bytes instanceof Uint8Array
        ? v.bytes
        : (v.bytes as object) instanceof ArrayBuffer
            ? new Uint8Array(v.bytes)
            : null;
    if (!bytes) return null;
    return {
        bytes,
        crc: typeof v.crc === 'number' ? v.crc : -1,
        savedAt: typeof v.savedAt === 'string' ? v.savedAt : '',
        schemaVersion: typeof v.schemaVersion === 'number' ? v.schemaVersion : 0,
    };
}

export interface IndexedDbAdapter extends DbStorageAdapter {
    /** Open the connection eagerly; rejects when IndexedDB cannot be used here. */
    probe(): Promise<void>;
}

export function createIndexedDbAdapter(factory: IDBFactory = indexedDB): IndexedDbAdapter {
    let connection: IDBDatabase | null = null;

    function open(): Promise<IDBDatabase> {
        if (connection) return Promise.resolve(connection);
        return new Promise((resolve, reject) => {
            let request: IDBOpenDBRequest;
            try {
                request = factory.open(IDB_NAME, IDB_VERSION);
            } catch (error) {
                reject(new PersistenceError('UNAVAILABLE', 'IndexedDB is not available in this browser context.', error));
                return;
            }
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE);
                }
            };
            request.onsuccess = () => {
                connection = request.result;
                // Another tab upgraded the schema — drop our handle so the next
                // call reopens at the new version instead of failing forever.
                connection.onversionchange = () => {
                    connection?.close();
                    connection = null;
                };
                resolve(connection);
            };
            request.onerror = () => reject(
                new PersistenceError('UNAVAILABLE', request.error?.message ?? 'IndexedDB open failed', request.error),
            );
            request.onblocked = () => reject(
                new PersistenceError('UNAVAILABLE', 'IndexedDB open is blocked by another tab.'),
            );
        });
    }

    async function readKey(key: string): Promise<StoredDb | null> {
        const db = await open();
        const tx = db.transaction(IDB_STORE, 'readonly');
        const value = await requestToPromise(tx.objectStore(IDB_STORE).get(key));
        await transactionDone(tx);
        return normaliseStored(value);
    }

    return {
        kind: 'indexeddb',

        probe: () => open().then(() => undefined),

        load: () => readKey(KEY_CURRENT),

        loadPrevious: () => readKey(KEY_PREVIOUS),

        async save(entry) {
            const db = await open();
            try {
                // Everything inside the transaction is driven from request
                // callbacks, never from an awaited promise: an IndexedDB
                // transaction auto-commits as soon as control returns to the event
                // loop with no pending request, so `await` between the GET and
                // the PUTs is a TransactionInactiveError waiting to happen.
                await new Promise<void>((resolve, reject) => {
                    const tx = db.transaction(IDB_STORE, 'readwrite');
                    const store = tx.objectStore(IDB_STORE);
                    const get = store.get(KEY_CURRENT);
                    get.onsuccess = () => {
                        if (get.result) {
                            store.put(get.result, KEY_PREVIOUS);
                        }
                        store.put(
                            { bytes: entry.bytes, crc: entry.crc, savedAt: entry.savedAt, schemaVersion: entry.schemaVersion },
                            KEY_CURRENT,
                        );
                    };
                    get.onerror = () => reject(get.error ?? new Error('IndexedDB read failed'));
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
                    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
                });
            } catch (error) {
                if (error instanceof PersistenceError) throw error;
                if (isQuotaError(error)) {
                    throw new PersistenceError('QUOTA', 'Browser storage is full; the latest changes could not be saved.', error);
                }
                throw new PersistenceError('WRITE_FAILED', error instanceof Error ? error.message : 'IndexedDB write failed', error);
            }
        },

        async clear() {
            const db = await open();
            const tx = db.transaction(IDB_STORE, 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            store.delete(KEY_CURRENT);
            store.delete(KEY_PREVIOUS);
            await transactionDone(tx);
        },
    };
}
