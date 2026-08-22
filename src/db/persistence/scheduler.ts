/**
 * Persistence scheduler
 *
 * The services call `schedulePersist()` after every mutation (the transaction
 * helper does it once per outermost commit). Writes are coalesced with a
 * trailing debounce so a burst of mutations — composing a grapheme with five
 * glyphs and three phonemes — produces ONE serialisation instead of nine.
 *
 * Guarantees:
 *   - `dirty` stays true until a save SUCCEEDS, so a failed write is retried on
 *     the next schedule/flush rather than lost.
 *   - Only one save is in flight at a time; mutations that land during a save
 *     trigger another save immediately after it finishes.
 *   - `flushPersist()` is the "I need this on disk now" path (import, reset,
 *     close, tab hidden, page unload). It resolves once the write has landed.
 *   - State changes are broadcast to subscribers so the shell can show
 *     Saved / Saving / Unsaved / Error and offer remedies.
 *
 * The scheduler never imports `database.ts` — the bytes come from the
 * `exportBytes` function passed at configuration — which keeps the dependency
 * graph acyclic (database → scheduler, transaction → scheduler).
 */

import { crc32 } from '../exportImport/crc32';
import { dbLog } from '../utils/logger';
import { PersistenceError, type DbStorageAdapter, type PersistenceState } from './types';

export const DEFAULT_PERSIST_DEBOUNCE_MS = 300;

interface SchedulerConfig {
    adapter: DbStorageAdapter;
    exportBytes: () => Uint8Array;
    schemaVersion: number;
    debounceMs?: number;
}

type Listener = (state: PersistenceState) => void;

let config: SchedulerConfig | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let inFlight: Promise<void> | null = null;
let lifecycleInstalled = false;
const listeners = new Set<Listener>();

let state: PersistenceState = {
    status: 'idle',
    adapter: null,
    dirty: false,
    lastSavedAt: null,
    lastSavedBytes: null,
    error: null,
};

function setState(patch: Partial<PersistenceState>): void {
    state = { ...state, ...patch };
    listeners.forEach(listener => {
        try {
            listener(state);
        } catch (error) {
            dbLog.error('Persistence listener threw:', error);
        }
    });
}

export function getPersistenceState(): PersistenceState {
    return state;
}

export function subscribePersistence(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function isPersistenceConfigured(): boolean {
    return config !== null;
}

function clearTimer(): void {
    if (timer !== null) {
        clearTimeout(timer);
        timer = null;
    }
}

/**
 * Wire the scheduler to a storage backend. Called once by `initDatabase()`.
 * Re-configuring (e.g. tests swapping adapters) discards any pending timer.
 */
export function configurePersistence(next: SchedulerConfig): void {
    clearTimer();
    config = next;
    setState({
        status: 'idle',
        adapter: next.adapter.kind,
        dirty,
        error: next.adapter.kind === 'memory'
            ? { code: 'UNAVAILABLE', message: 'No durable storage is available; changes will be lost on reload.' }
            : null,
    });
    installLifecycleFlush();
}

/**
 * Mark the database dirty and (re)arm the debounce timer.
 * Safe to call before configuration — the dirty flag is remembered and the
 * first configured flush picks it up.
 */
export function schedulePersist(): void {
    dirty = true;
    if (!config) {
        setState({ dirty: true });
        return;
    }
    setState({ status: inFlight ? 'saving' : 'pending', dirty: true });
    clearTimer();
    timer = setTimeout(() => {
        timer = null;
        void flushPersist();
    }, config.debounceMs ?? DEFAULT_PERSIST_DEBOUNCE_MS);
    // In Node (tests) a pending timer must not keep the process alive.
    (timer as { unref?: () => void }).unref?.();
}

async function runSave(cfg: SchedulerConfig): Promise<void> {
    dirty = false;
    setState({ status: 'saving' });
    try {
        const bytes = cfg.exportBytes();
        await cfg.adapter.save({
            bytes,
            crc: crc32(bytes),
            savedAt: new Date().toISOString(),
            schemaVersion: cfg.schemaVersion,
        });
        setState({
            status: dirty ? 'pending' : 'saved',
            dirty,
            lastSavedAt: new Date().toISOString(),
            lastSavedBytes: bytes.length,
            error: null,
        });
    } catch (error) {
        // Keep the data dirty so the next schedule/flush retries.
        dirty = true;
        const mapped = error instanceof PersistenceError
            ? { code: error.code, message: error.message }
            : { code: 'WRITE_FAILED' as const, message: error instanceof Error ? error.message : 'Persist failed' };
        dbLog.error('Failed to persist database:', error);
        setState({ status: 'error', dirty: true, error: mapped });
    }
}

/**
 * Write now if dirty. Resolves after the write has landed (or failed — the
 * failure is recorded in state, not thrown, so callers on the unload path
 * never see a rejection).
 */
export async function flushPersist(): Promise<void> {
    clearTimer();
    if (!config) return;
    if (inFlight) {
        await inFlight;
        // Mutations may have landed during the previous save.
        if (!dirty) return;
    }
    if (!dirty) return;
    const cfg = config;
    inFlight = runSave(cfg).finally(() => {
        inFlight = null;
    });
    await inFlight;
    // A write that completed while another save was running is still dirty.
    if (dirty && state.status !== 'error') {
        await flushPersist();
    }
}

function installLifecycleFlush(): void {
    if (lifecycleInstalled || typeof window === 'undefined' || typeof document === 'undefined') return;
    lifecycleInstalled = true;
    // `pagehide` fires for navigation, close, and bfcache entry; `visibilitychange`
    // → hidden is the earliest reliable signal on mobile, where `pagehide` may
    // never arrive before the tab is discarded.
    window.addEventListener('pagehide', () => {
        void flushPersist();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            void flushPersist();
        }
    });
}

/**
 * Forget the backend (the database is closing). Subscribers are kept — the
 * shell stays mounted across a close/re-open — and `dirty` is preserved so a
 * re-configure picks up anything that never landed.
 */
export function detachPersistence(): void {
    clearTimer();
    config = null;
    setState({ status: 'idle', adapter: null });
}

/** Tests only: forget configuration, timers, dirty flag and subscribers. */
export function resetPersistenceForTests(): void {
    clearTimer();
    config = null;
    dirty = false;
    inFlight = null;
    listeners.clear();
    state = {
        status: 'idle',
        adapter: null,
        dirty: false,
        lastSavedAt: null,
        lastSavedBytes: null,
        error: null,
    };
}
