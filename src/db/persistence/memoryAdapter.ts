/**
 * In-memory adapter — for tests and for environments with no durable storage.
 *
 * `failNextSaveWith` lets a test simulate a quota/write failure on the next
 * `save()` call without monkey-patching globals.
 */

import { PersistenceError, type DbStorageAdapter, type PersistenceErrorCode, type StoredDb } from './types';

export interface MemoryAdapter extends DbStorageAdapter {
    /** Make the next `save()` reject with this code (one-shot). */
    failNextSaveWith(code: PersistenceErrorCode | null): void;
    /** Number of successful saves so far. */
    readonly saveCount: number;
}

export function createMemoryAdapter(): MemoryAdapter {
    let current: StoredDb | null = null;
    let previous: StoredDb | null = null;
    let failWith: PersistenceErrorCode | null = null;
    let saveCount = 0;

    const clone = (entry: StoredDb | null): StoredDb | null =>
        entry ? { ...entry, bytes: new Uint8Array(entry.bytes) } : null;

    return {
        kind: 'memory',
        get saveCount() {
            return saveCount;
        },
        failNextSaveWith(code) {
            failWith = code;
        },
        async load() {
            return clone(current);
        },
        async loadPrevious() {
            return clone(previous);
        },
        async save(entry) {
            if (failWith) {
                const code = failWith;
                failWith = null;
                throw new PersistenceError(code, `Simulated ${code} failure`);
            }
            previous = current;
            current = clone(entry);
            saveCount++;
        },
        async clear() {
            current = null;
            previous = null;
        },
    };
}
