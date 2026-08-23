// @vitest-environment happy-dom
/**
 * ShellStatusBanner — the "a new version is ready" branch.
 *
 * This is the only issue in the banner that reports GOOD news, and it is
 * deliberately last in the chain: a waiting deploy must never cover "the
 * browser refused to save your conlang". Reaching it at all means the update
 * could not be applied silently, i.e. an editor was dirty — so the copy has to
 * say what pressing the button costs.
 *
 * Its dismissal is also the odd one out. Every other issue re-raises once its
 * condition regenerates (a later save invalidates a quota dismissal); this one
 * snoozes in the CONTROLLER for the session, because otherwise the next
 * autosave would put it straight back on screen.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import type { DatabaseHealth } from '../../../db/database';
import type { PersistenceState } from '../../../db/persistence/types';
import {
    installPwaUpdates,
    resetPwaUpdatesForTests,
    type PwaUpdateController,
    type RegisterSWLike,
    type RegisterSWLikeOptions,
} from '../../../pwa';

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

const state = { persistence: SAVED, health: HEALTHY };

vi.mock('../../../db', () => ({
    useEtymolog: () => ({
        api: { database: { repair: vi.fn(), export: vi.fn() } },
        persistence: state.persistence,
        health: state.health,
    }),
    persistDatabaseNow: vi.fn(() => Promise.resolve()),
}));

const { ShellStatusBanner, PWA_UPDATE_ISSUE_KEY } = await import('../PersistenceStatus');
const { NotificationProvider } = await import('../../shared/notifications/NotificationProvider');

let container: HTMLDivElement;
let root: Root;
let controller: PwaUpdateController;
let swOptions: RegisterSWLikeOptions | undefined;
const updateSW = vi.fn(() => Promise.resolve());
const flush = vi.fn(() => Promise.resolve());

const registerSW: RegisterSWLike = (options) => {
    swOptions = options;
    options?.onRegisteredSW?.('/etymolog/sw.js', {
        update: vi.fn(() => Promise.resolve()),
    } as unknown as ServiceWorkerRegistration);
    return updateSW;
};

function render() {
    act(() => {
        root.render(
            <NotificationProvider>
                <ShellStatusBanner />
            </NotificationProvider>,
        );
    });
}

/** Park a waiting update without letting it auto-apply (as a dirty tab would). */
async function raiseUpdate() {
    controller.setDirtyProbe(() => true);
    await act(async () => {
        swOptions?.onNeedRefresh?.();
    });
}

/** `visible={false}` keeps the node until AnimatePresence finishes its exit. */
async function flushExit() {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 600));
    });
}

const banner = () => container.querySelector('[role="alert"], [role="status"]');
const bannerText = () => banner()?.textContent ?? '';
const button = (label: string) =>
    Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === label,
    ) as HTMLButtonElement | undefined;

beforeEach(() => {
    state.persistence = SAVED;
    state.health = HEALTHY;
    swOptions = undefined;
    updateSW.mockClear();
    flush.mockClear();
    resetPwaUpdatesForTests();
    controller = installPwaUpdates({
        registerSW,
        checkIntervalMs: 0,
        flush,
        storage: null,
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
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
    resetPwaUpdatesForTests();
});

describe('ShellStatusBanner — new version ready', () => {
    it('stays quiet while no update is waiting', () => {
        render();
        expect(banner()).toBeNull();
    });

    it('announces the waiting build, politely, with one primary action', async () => {
        render();
        await raiseUpdate();

        expect(bannerText()).toContain('A new version is ready');
        expect(button('Reload now')).toBeDefined();
        // Info, not an interruption: nothing is broken.
        expect(container.querySelector('[role="alert"]')).toBeNull();
        expect(container.querySelector('[role="status"]')).not.toBeNull();
    });

    it('warns that unsaved form edits are the price of reloading now', async () => {
        render();
        await raiseUpdate();

        expect(bannerText()).toContain('unsaved form edits');
        expect(bannerText()).toContain('leave this form');
    });

    it('flushes persistence and hands over when Reload now is pressed', async () => {
        render();
        await raiseUpdate();

        await act(async () => {
            button('Reload now')!.click();
        });

        expect(flush).toHaveBeenCalledTimes(1);
        expect(updateSW).toHaveBeenCalledWith(true);
    });

    it('disables the action while the handover is in flight', async () => {
        render();
        await raiseUpdate();
        await act(async () => {
            button('Reload now')!.click();
        });

        expect(controller.getState().status).toBe('applying');
        expect(button('Reload now')?.disabled).toBe(true);
    });

    it('snoozes for the session when dismissed', async () => {
        render();
        await raiseUpdate();

        await act(async () => {
            (
                container.querySelector('[aria-label="Dismiss"]') as HTMLButtonElement
            )?.click();
        });
        await flushExit();

        expect(controller.getState().snoozed).toBe(true);
        expect(banner()).toBeNull();
    });

    it('yields to a storage error — damage outranks an improvement', async () => {
        state.persistence = {
            ...SAVED,
            status: 'error',
            error: { code: 'QUOTA', message: 'localStorage is full' },
        };
        render();
        await raiseUpdate();

        expect(bannerText()).toContain('Storage is full');
        expect(bannerText()).not.toContain('A new version is ready');
    });

    it('yields to a foreign-key warning too', async () => {
        state.health = { ...HEALTHY, fkViolations: 2 };
        render();
        await raiseUpdate();

        expect(bannerText()).toContain('Damaged references');
    });

    it('exports its condition key so the dismissal branch stays discoverable', () => {
        expect(PWA_UPDATE_ISSUE_KEY).toBe('pwa-update-ready');
    });
});
