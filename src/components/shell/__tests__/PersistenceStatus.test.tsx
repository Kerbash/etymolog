// @vitest-environment happy-dom
/**
 * ShellStatusBanner — the "your data is at risk" surface.
 *
 * The conditions it reports are the ones that used to be invisible: a quota
 * rejection, an unavailable store, a boot that fell back to the previous
 * snapshot. Each has a different remedy, so each has to reach the user WITH its
 * actions attached — a generic "something went wrong" is what the console was
 * already doing.
 *
 * Dismissal is keyed by CONDITION rather than by banner instance, which is the
 * subtle part: closing a quota banner must not swallow the foreign-key warning
 * that appears afterwards.
 *
 * The database module is mocked because none of this is about SQLite — it is
 * about how three pieces of state map onto one banner — and a real
 * `initDatabase()` here would make the test depend on sql.js WASM loading.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import type { DatabaseHealth } from '../../../db/database';
import type { PersistenceState } from '../../../db/persistence/types';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const HEALTHY: DatabaseHealth = {
    fkViolations: 0,
    schemaMigration: null,
    crcMismatch: false,
    restoredFromBackup: false,
    startedFresh: false,
    migratedFromLocalStorage: false,
};

const SAVED: PersistenceState = {
    status: 'saved',
    adapter: 'indexeddb',
    dirty: false,
    lastSavedAt: '2026-08-22T00:00:00.000Z',
    lastSavedBytes: 1024,
    error: null,
};

/** Mutable state the mocked context hands back on every render. */
const state = {
    persistence: SAVED,
    health: HEALTHY,
};

const repairMock = vi.fn(() => ({ success: true as const, data: { total: 3 } }));
const exportMock = vi.fn(() => ({ success: true as const, data: new Blob(['{}']) }));

vi.mock('../../../db', () => ({
    useEtymolog: () => ({
        api: { database: { repair: repairMock, export: exportMock } },
        persistence: state.persistence,
        health: state.health,
    }),
    persistDatabaseNow: vi.fn(() => Promise.resolve()),
}));

// Imported AFTER the mock so the component picks up the mocked module.
const { ShellStatusBanner, PersistenceStatusText } = await import('../PersistenceStatus');
const { NotificationProvider } = await import('../../shared/notifications/NotificationProvider');

let container: HTMLDivElement;
let root: Root;

function render(el: React.ReactElement) {
    act(() => {
        root.render(<NotificationProvider>{el}</NotificationProvider>);
    });
}

/**
 * Let the banner's AnimatePresence EXIT finish.
 *
 * `visible={false}` does not unmount the node immediately — motion keeps it in
 * the DOM until the exit transition ends. Without this wait an
 * "expect(banner()).toBeNull()" asserts on the still-animating element and
 * fails for a reason that has nothing to do with the logic under test.
 */
async function flushExit() {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 600));
    });
}

beforeEach(() => {
    state.persistence = SAVED;
    state.health = HEALTHY;
    repairMock.mockClear();
    exportMock.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    try {
        act(() => root.unmount());
    } catch {
        /* already unmounted */
    }
    container.parentNode?.removeChild(container);
});

/** The banner is `role="alert"` for error/warning and `role="status"` otherwise. */
const banner = () => container.querySelector('[role="alert"], [role="status"]');
const bannerText = () => banner()?.textContent ?? '';
const buttonLabels = () =>
    Array.from(container.querySelectorAll('button'))
        .map((b) => b.textContent?.trim())
        .filter(Boolean);

describe('ShellStatusBanner', () => {
    it('shows nothing while storage is healthy', () => {
        render(<ShellStatusBanner />);
        expect(banner()).toBeNull();
    });

    it('raises a QUOTA error with Export and Retry', () => {
        state.persistence = {
            ...SAVED,
            status: 'error',
            dirty: true,
            error: { code: 'QUOTA', message: 'localStorage is full' },
        };
        render(<ShellStatusBanner />);

        expect(bannerText()).toContain('Storage is full');
        expect(buttonLabels()).toEqual(expect.arrayContaining(['Export JSON', 'Retry']));
        // An error must not be a polite status — it has to interrupt.
        expect(container.querySelector('[role="alert"]')).not.toBeNull();
    });

    it('warns that nothing will survive a reload when storage is UNAVAILABLE', () => {
        state.persistence = {
            ...SAVED,
            status: 'error',
            adapter: null,
            error: { code: 'UNAVAILABLE', message: 'IndexedDB blocked' },
        };
        render(<ShellStatusBanner />);

        expect(bannerText()).toContain('not being saved');
        expect(bannerText()).toContain('survive a reload');
    });

    it('offers Retry (and only Retry) for a WRITE_FAILED', () => {
        state.persistence = {
            ...SAVED,
            status: 'error',
            error: { code: 'WRITE_FAILED', message: 'the write blew up' },
        };
        render(<ShellStatusBanner />);

        expect(bannerText()).toContain('the write blew up');
        expect(buttonLabels()).toContain('Retry');
        expect(buttonLabels()).not.toContain('Export JSON');
    });

    it('reports a boot that fell back to the previous snapshot', () => {
        state.health = { ...HEALTHY, restoredFromBackup: true };
        render(<ShellStatusBanner />);

        expect(bannerText()).toContain('Recovered from the previous snapshot');
        // Informational, not an interruption.
        expect(container.querySelector('[role="alert"]')).toBeNull();
    });

    it('offers Repair for foreign-key violations and clears itself afterwards', async () => {
        state.health = { ...HEALTHY, fkViolations: 3 };
        render(<ShellStatusBanner />);
        expect(bannerText()).toContain('Damaged references');

        act(() => {
            (
                Array.from(container.querySelectorAll('button')).find(
                    (b) => b.textContent?.trim() === 'Repair',
                ) as HTMLButtonElement
            ).click();
        });

        expect(repairMock).toHaveBeenCalledTimes(1);
        // The report's total is what makes the toast worth reading — "repaired"
        // with no number does not tell the user whether anything was wrong.
        expect(container.textContent).toContain('Repaired 3 damaged rows');
        // `health` is only re-sampled at boot, so the component dismisses the
        // condition itself — otherwise the warning would be unremovable.
        //
        // Asserted on the container's TEXT rather than on `banner()`: the
        // success toast is itself a `role="status"` banner, so the node-level
        // query would find it and read as a failure.
        await flushExit();
        expect(container.textContent).not.toContain('Damaged references');
    });

    it('re-raises a dismissed storage error once a save has succeeded in between', async () => {
        state.persistence = {
            ...SAVED,
            status: 'error',
            error: { code: 'QUOTA', message: 'full' },
        };
        render(<ShellStatusBanner />);
        act(() => {
            (container.querySelector('[aria-label="Dismiss"]') as HTMLButtonElement).click();
        });
        await flushExit();
        expect(banner()).toBeNull();

        // A successful save (new lastSavedAt) clears the condition...
        state.persistence = { ...SAVED, lastSavedAt: '2026-08-22T01:00:00.000Z' };
        render(<ShellStatusBanner />);
        expect(banner()).toBeNull();

        // ...and the SAME error afterwards is a new condition: it must show again,
        // otherwise one dismissal silences "not saving" for the whole session.
        state.persistence = {
            ...SAVED,
            lastSavedAt: '2026-08-22T01:00:00.000Z',
            status: 'error',
            error: { code: 'QUOTA', message: 'full again' },
        };
        render(<ShellStatusBanner />);
        expect(bannerText()).toContain('Storage is full');
    });

    it('stays dismissed until the underlying condition changes', async () => {
        state.persistence = {
            ...SAVED,
            status: 'error',
            error: { code: 'QUOTA', message: 'full' },
        };
        render(<ShellStatusBanner />);
        expect(bannerText()).toContain('Storage is full');

        act(() => {
            (container.querySelector('[aria-label="Dismiss"]') as HTMLButtonElement).click();
        });
        await flushExit();
        expect(banner()).toBeNull();

        // Same condition, re-rendered: still dismissed.
        render(<ShellStatusBanner />);
        expect(banner()).toBeNull();

        // A DIFFERENT condition is a different banner, and must appear.
        state.persistence = SAVED;
        state.health = { ...HEALTHY, fkViolations: 1 };
        render(<ShellStatusBanner />);
        expect(bannerText()).toContain('Damaged references');
    });
});

describe('PersistenceStatusText', () => {
    it('announces politely and names the current state', () => {
        render(<PersistenceStatusText />);
        const status = container.querySelector('[role="status"]')!;
        expect(status.getAttribute('aria-live')).toBe('polite');
        expect(status.textContent).toBe('Saved');
    });

    it('distinguishes saving, unsaved and failed', () => {
        state.persistence = { ...SAVED, status: 'saving' };
        render(<PersistenceStatusText />);
        expect(container.querySelector('[role="status"]')!.textContent).toBe('Saving…');

        state.persistence = { ...SAVED, status: 'pending', dirty: true };
        render(<PersistenceStatusText />);
        expect(container.querySelector('[role="status"]')!.textContent).toBe('Unsaved changes');

        state.persistence = {
            ...SAVED,
            status: 'error',
            error: { code: 'WRITE_FAILED', message: 'nope' },
        };
        render(<PersistenceStatusText />);
        expect(container.querySelector('[role="status"]')!.textContent).toBe('Not saved');
    });

    it('names the storage backend in the title, so "where is my data" is answerable', () => {
        render(<PersistenceStatusText />);
        expect(container.querySelector('[role="status"]')!.getAttribute('title')).toContain(
            'IndexedDB',
        );
    });
});
