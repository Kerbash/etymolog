/**
 * Persistence layer tests
 *
 * Covers the scheduler (debounce, flush, retry-on-failure), the localStorage
 * adapter (encoding, rotation, soft quota), the backend selector, and the boot
 * recovery path (CRC mismatch → previous snapshot).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import {
    initDatabase,
    closeDatabase,
    clearDatabase,
    getDatabase,
    exportDatabaseBytes,
    getDatabaseHealth,
    PERSISTED_SCHEMA_VERSION,
} from '../database';
import {
    configurePersistence,
    schedulePersist,
    flushPersist,
    getPersistenceState,
    subscribePersistence,
    resetPersistenceForTests,
    createMemoryAdapter,
    createLocalStorageAdapter,
    selectStorageAdapter,
    bytesToBase64,
    base64ToBytes,
    LS_CURRENT_KEY,
    LS_CURRENT_CRC_KEY,
    LS_PREVIOUS_KEY,
    LS_SOFT_LIMIT_CHARS,
    PersistenceError,
} from '../persistence';
import { crc32 } from '../exportImport/crc32';
import { createGlyph } from '../glyphService';

function useMemoryAdapter(debounceMs = 300) {
    const adapter = createMemoryAdapter();
    configurePersistence({
        adapter,
        exportBytes: exportDatabaseBytes,
        schemaVersion: PERSISTED_SCHEMA_VERSION,
        debounceMs,
    });
    return adapter;
}

describe('persistence scheduler', () => {
    beforeAll(async () => {
        await initDatabase();
    });

    beforeEach(() => {
        clearDatabase();
        resetPersistenceForTests();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        resetPersistenceForTests();
    });

    it('coalesces a burst of schedules into a single save', async () => {
        const adapter = useMemoryAdapter();
        for (let i = 0; i < 10; i++) schedulePersist();
        expect(getPersistenceState().status).toBe('pending');
        expect(adapter.saveCount).toBe(0);

        await vi.advanceTimersByTimeAsync(400);

        expect(adapter.saveCount).toBe(1);
        expect(getPersistenceState().status).toBe('saved');
        expect(getPersistenceState().dirty).toBe(false);
    });

    it('does nothing when nothing is dirty', async () => {
        const adapter = useMemoryAdapter();
        await flushPersist();
        expect(adapter.saveCount).toBe(0);
        expect(getPersistenceState().status).toBe('idle');
    });

    it('flushPersist writes immediately and cancels the pending timer', async () => {
        const adapter = useMemoryAdapter();
        schedulePersist();
        await flushPersist();
        expect(adapter.saveCount).toBe(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(adapter.saveCount).toBe(1);
    });

    it('keeps the data dirty and exposes the error code when a save fails, then retries', async () => {
        const adapter = useMemoryAdapter();
        adapter.failNextSaveWith('QUOTA');
        schedulePersist();
        await flushPersist();

        const failed = getPersistenceState();
        expect(failed.status).toBe('error');
        expect(failed.error?.code).toBe('QUOTA');
        expect(failed.dirty).toBe(true);
        expect(adapter.saveCount).toBe(0);

        await flushPersist();
        expect(adapter.saveCount).toBe(1);
        expect(getPersistenceState().status).toBe('saved');
        expect(getPersistenceState().error).toBeNull();
    });

    it('saves what was written during an in-flight save', async () => {
        const adapter = useMemoryAdapter();
        schedulePersist();
        const first = flushPersist();
        // A mutation lands while the first save is running.
        schedulePersist();
        await first;
        await flushPersist();
        expect(adapter.saveCount).toBe(2);
        expect(getPersistenceState().dirty).toBe(false);
    });

    it('notifies subscribers on every state change and supports unsubscribe', async () => {
        useMemoryAdapter();
        const seen: string[] = [];
        const unsubscribe = subscribePersistence(s => seen.push(s.status));
        schedulePersist();
        await flushPersist();
        expect(seen).toEqual(['pending', 'saving', 'saved']);
        unsubscribe();
        schedulePersist();
        expect(seen).toHaveLength(3);
    });

    it('persists real bytes with a matching CRC and schema version', async () => {
        const adapter = useMemoryAdapter();
        createGlyph({ name: 'persisted', svg_data: '<svg/>' });
        await flushPersist();
        const stored = await adapter.load();
        expect(stored).not.toBeNull();
        expect(stored!.crc).toBe(crc32(stored!.bytes));
        expect(stored!.schemaVersion).toBe(PERSISTED_SCHEMA_VERSION);
        expect(stored!.bytes.length).toBeGreaterThan(0);
    });

    it('reports UNAVAILABLE when only the memory adapter is configured', () => {
        useMemoryAdapter();
        expect(getPersistenceState().error?.code).toBe('UNAVAILABLE');
    });

    it('re-applies foreign_keys after every export (sql.js export() reopens the connection)', () => {
        useMemoryAdapter();
        const db = getDatabase();
        exportDatabaseBytes();
        const pragma = db.exec('PRAGMA foreign_keys');
        expect(pragma[0].values[0][0]).toBe(1);
    });
});

describe('localStorage adapter', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('round-trips bytes through base64', () => {
        const bytes = new Uint8Array(70000).map((_, i) => i % 251);
        expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    });

    it('rotates current into previous on save and loads both', async () => {
        const adapter = createLocalStorageAdapter();
        const a = new Uint8Array([1, 2, 3]);
        const b = new Uint8Array([4, 5, 6]);
        await adapter.save({ bytes: a, crc: crc32(a), savedAt: '2026-01-01T00:00:00Z', schemaVersion: 5 });
        await adapter.save({ bytes: b, crc: crc32(b), savedAt: '2026-01-02T00:00:00Z', schemaVersion: 5 });

        const current = await adapter.load();
        const previous = await adapter.loadPrevious();
        expect(current!.bytes).toEqual(b);
        expect(current!.savedAt).toBe('2026-01-02T00:00:00Z');
        expect(previous!.bytes).toEqual(a);
        expect(previous!.crc).toBe(crc32(a));
        expect(localStorage.getItem(LS_CURRENT_CRC_KEY)).toBe(crc32(b).toString(16));
    });

    it('reads the legacy key layout (no meta, hex CRC) written by older builds', async () => {
        const legacy = new Uint8Array([9, 9, 9]);
        localStorage.setItem(LS_CURRENT_KEY, bytesToBase64(legacy));
        localStorage.setItem(LS_CURRENT_CRC_KEY, crc32(legacy).toString(16));
        const stored = await createLocalStorageAdapter().load();
        expect(stored!.bytes).toEqual(legacy);
        expect(stored!.crc).toBe(crc32(legacy));
        expect(stored!.schemaVersion).toBe(0);
    });

    it('reports a missing CRC as -1 rather than a mismatch', async () => {
        localStorage.setItem(LS_CURRENT_KEY, bytesToBase64(new Uint8Array([1])));
        const stored = await createLocalStorageAdapter().load();
        expect(stored!.crc).toBe(-1);
    });

    it('refuses a payload over the soft limit with a QUOTA error before touching storage', async () => {
        const adapter = createLocalStorageAdapter();
        const small = new Uint8Array([1]);
        await adapter.save({ bytes: small, crc: crc32(small), savedAt: '', schemaVersion: 5 });
        const huge = new Uint8Array(Math.ceil(LS_SOFT_LIMIT_CHARS * 0.8));
        await expect(
            adapter.save({ bytes: huge, crc: 0, savedAt: '', schemaVersion: 5 }),
        ).rejects.toMatchObject({ code: 'QUOTA' });
        // The previous good snapshot is untouched.
        expect((await adapter.load())!.bytes).toEqual(small);
        expect(localStorage.getItem(LS_PREVIOUS_KEY)).toBeNull();
    });

    it('maps a browser QuotaExceededError to the QUOTA code', async () => {
        const throwing = {
            getItem: () => null,
            setItem: () => {
                const err = new Error('full');
                err.name = 'QuotaExceededError';
                throw err;
            },
            removeItem: () => undefined,
            clear: () => undefined,
            key: () => null,
            length: 0,
        } as unknown as Storage;
        const adapter = createLocalStorageAdapter(throwing);
        await expect(
            adapter.save({ bytes: new Uint8Array([1]), crc: 0, savedAt: '', schemaVersion: 5 }),
        ).rejects.toBeInstanceOf(PersistenceError);
        await expect(
            adapter.save({ bytes: new Uint8Array([1]), crc: 0, savedAt: '', schemaVersion: 5 }),
        ).rejects.toMatchObject({ code: 'QUOTA' });
    });
});

describe('adapter selection', () => {
    it('falls back to localStorage when IndexedDB is absent (Node)', async () => {
        const { adapter, migratedFromLocalStorage } = await selectStorageAdapter();
        expect(adapter.kind).toBe('localstorage');
        expect(migratedFromLocalStorage).toBe(false);
    });
});

describe('boot recovery', () => {
    afterEach(async () => {
        resetPersistenceForTests();
        localStorage.clear();
        await closeDatabase();
        await initDatabase();
    });

    it('loads the previous snapshot when the current one fails its CRC', async () => {
        await initDatabase();
        clearDatabase();
        createGlyph({ name: 'survivor', svg_data: '<svg/>' });
        const good = exportDatabaseBytes();
        await closeDatabase();

        localStorage.clear();
        const adapter = createLocalStorageAdapter();
        await adapter.save({ bytes: good, crc: crc32(good), savedAt: '', schemaVersion: 5 });
        // Corrupt the current slot: flip bytes but keep the (now wrong) CRC.
        const corrupt = new Uint8Array(good);
        corrupt.fill(0, 16, 64);
        await adapter.save({ bytes: corrupt, crc: crc32(good), savedAt: '', schemaVersion: 5 });

        await initDatabase();
        const health = getDatabaseHealth();
        expect(health.crcMismatch).toBe(true);
        expect(health.restoredFromBackup).toBe(true);
        expect(health.startedFresh).toBe(false);
        const rows = getDatabase().exec('SELECT name FROM glyphs');
        expect(rows[0].values[0][0]).toBe('survivor');
    });

    it('starts fresh when neither snapshot can be opened', async () => {
        await closeDatabase();
        localStorage.clear();
        const adapter = createLocalStorageAdapter();
        const junk = new Uint8Array(200).fill(7);
        await adapter.save({ bytes: junk, crc: crc32(junk), savedAt: '', schemaVersion: 5 });

        await initDatabase();
        const health = getDatabaseHealth();
        expect(health.startedFresh).toBe(true);
        expect(getDatabase().exec('SELECT COUNT(*) FROM glyphs')[0].values[0][0]).toBe(0);
    });
});
