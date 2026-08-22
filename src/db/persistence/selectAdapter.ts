/**
 * Backend selection + one-time localStorage → IndexedDB migration.
 *
 * Preference order: IndexedDB (large quota, atomic rotation) → localStorage
 * (legacy, ~3.7 MB effective ceiling) → memory (nothing survives a reload; the
 * scheduler reports this as `UNAVAILABLE` so the shell can warn the user).
 *
 * Migration rule: when IndexedDB opens but holds nothing and localStorage holds
 * a database, copy it across. The localStorage copy is removed ONLY after the
 * IndexedDB write succeeds, so an interrupted migration re-runs harmlessly.
 */

import { createIndexedDbAdapter } from './indexedDbAdapter';
import { createLocalStorageAdapter } from './localStorageAdapter';
import { createMemoryAdapter } from './memoryAdapter';
import type { DbStorageAdapter } from './types';
import { dbLog } from '../utils/logger';

export interface SelectedAdapter {
    adapter: DbStorageAdapter;
    /** True when a localStorage database was copied into IndexedDB during this selection. */
    migratedFromLocalStorage: boolean;
}

export async function selectStorageAdapter(): Promise<SelectedAdapter> {
    const hasIndexedDb = typeof indexedDB !== 'undefined';
    const hasLocalStorage = typeof localStorage !== 'undefined';

    if (hasIndexedDb) {
        try {
            const idb = createIndexedDbAdapter();
            await idb.probe();

            let migrated = false;
            if (hasLocalStorage && (await idb.load()) === null) {
                const legacy = createLocalStorageAdapter();
                const stored = await legacy.load();
                if (stored) {
                    await idb.save(stored);
                    await legacy.clear();
                    migrated = true;
                    dbLog.info('Migrated database from localStorage to IndexedDB');
                }
            }
            return { adapter: idb, migratedFromLocalStorage: migrated };
        } catch (error) {
            dbLog.warn('IndexedDB unavailable, falling back:', error);
        }
    }

    if (hasLocalStorage) {
        return { adapter: createLocalStorageAdapter(), migratedFromLocalStorage: false };
    }

    dbLog.warn('No durable storage available; changes will not survive a reload');
    return { adapter: createMemoryAdapter(), migratedFromLocalStorage: false };
}
