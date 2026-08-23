// @vitest-environment happy-dom
/**
 * PwaUpdateGate — the three wires between React and the update controller.
 *
 * The one that matters is the dirty gate. A precached SPA that reloads itself
 * the instant a deploy lands would eat a half-written lexicon entry, because
 * form drafts live in React state and never reach SQLite until the user
 * submits. So: an update that arrives while an editor is dirty WAITS, and the
 * moment that editor goes away (which, in this app, is a route change) it goes
 * in.
 *
 * The database is not involved and is not mocked — nothing under test touches
 * it. `flush` is injected into the controller instead.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';

import {
    installPwaUpdates,
    resetPwaUpdatesForTests,
    PWA_APPLIED_FLAG,
    type FlagStorage,
    type PwaUpdateController,
    type RegisterSWLike,
    type RegisterSWLikeOptions,
} from '../updateController';
import PwaUpdateGate from '../PwaUpdateGate';
import { UnsavedChangesRegistry, useRegisterUnsaved } from '../../components/shell/unsavedChanges';
import { NotificationProvider } from '../../components/shared/notifications/NotificationProvider';
import ConfirmDialogProvider from '../../components/shared/confirmDialog/ConfirmDialogProvider';
import { APP_VERSION } from '../../config/version';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let controller: PwaUpdateController;
let swOptions: RegisterSWLikeOptions | undefined;
let storage: Map<string, string>;
const updateSW = vi.fn(() => Promise.resolve());
const registrationUpdate = vi.fn(() => Promise.resolve());
const flush = vi.fn(() => Promise.resolve());

const registerSW: RegisterSWLike = (options) => {
    swOptions = options;
    options?.onRegisteredSW?.('/etymolog/sw.js', {
        update: registrationUpdate,
    } as unknown as ServiceWorkerRegistration);
    return updateSW;
};

const flagStorage: FlagStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
        storage.set(key, value);
    },
    removeItem: (key) => {
        storage.delete(key);
    },
};

/** An always-mounted editor whose dirty flag the test drives from props. */
function Editor({ dirty }: { dirty: boolean }) {
    useRegisterUnsaved('test-editor', dirty);
    return null;
}

function Page({ label }: { label: string }) {
    const navigate = useNavigate();
    return (
        <button type="button" data-testid="go" onClick={() => navigate(label === 'a' ? '/b' : '/a')}>
            {label}
        </button>
    );
}

function Harness({ dirty }: { dirty: boolean }) {
    return (
        <MemoryRouter initialEntries={['/a']}>
            <NotificationProvider>
                <ConfirmDialogProvider>
                    <UnsavedChangesRegistry>
                        <PwaUpdateGate />
                        <Editor dirty={dirty} />
                        <Routes>
                            <Route path="/a" element={<Page label="a" />} />
                            <Route path="/b" element={<Page label="b" />} />
                        </Routes>
                    </UnsavedChangesRegistry>
                </ConfirmDialogProvider>
            </NotificationProvider>
        </MemoryRouter>
    );
}

function mount(dirty = false) {
    act(() => root.render(<Harness dirty={dirty} />));
}

function rerender(dirty: boolean) {
    act(() => root.render(<Harness dirty={dirty} />));
}

async function navigate() {
    await act(async () => {
        (container.querySelector('[data-testid="go"]') as HTMLButtonElement).click();
    });
}

const bannerText = () => document.body.querySelector('[role="status"]')?.textContent ?? '';

beforeEach(() => {
    swOptions = undefined;
    storage = new Map();
    updateSW.mockClear();
    registrationUpdate.mockClear();
    flush.mockClear();
    resetPwaUpdatesForTests();
    controller = installPwaUpdates({
        registerSW,
        checkIntervalMs: 0,
        routeCheckThrottleMs: 5 * 60 * 1000,
        flush,
        storage: flagStorage,
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

describe('PwaUpdateGate — the dirty probe', () => {
    it('lets the controller read the unsaved-changes registry', async () => {
        mount(true);

        await act(async () => {
            swOptions?.onNeedRefresh?.();
        });

        // Dirty: the update parks instead of reloading the tab out from under
        // the editor.
        expect(controller.getState().status).toBe('ready');
        expect(updateSW).not.toHaveBeenCalled();
    });

    it('applies straight away when no editor is dirty', async () => {
        mount(false);

        await act(async () => {
            swOptions?.onNeedRefresh?.();
        });

        expect(flush).toHaveBeenCalledTimes(1);
        expect(updateSW).toHaveBeenCalledWith(true);
    });

    it('clears the probe on unmount, so a dead tree cannot veto an update', async () => {
        mount(true);
        act(() => root.unmount());

        await act(async () => {
            swOptions?.onNeedRefresh?.();
        });

        expect(updateSW).toHaveBeenCalledWith(true);
    });
});

describe('PwaUpdateGate — route changes', () => {
    it('checks for a new build on an in-app navigation', async () => {
        mount(false);
        // The mount itself counts as the first route change; it consumed the
        // throttle window, so this asserts on that single call.
        expect(registrationUpdate).toHaveBeenCalledTimes(1);

        await navigate();

        // Throttled — five minutes have not passed.
        expect(registrationUpdate).toHaveBeenCalledTimes(1);
    });

    it('does not apply a held-back update while the editor is still dirty', async () => {
        mount(true);
        await act(async () => {
            swOptions?.onNeedRefresh?.();
        });

        await navigate();

        expect(updateSW).not.toHaveBeenCalled();
        expect(controller.getState().status).toBe('ready');
    });

    it('applies the held-back update on the first route change after it goes clean', async () => {
        mount(true);
        await act(async () => {
            swOptions?.onNeedRefresh?.();
        });
        expect(updateSW).not.toHaveBeenCalled();

        rerender(false);
        await navigate();

        expect(flush).toHaveBeenCalledTimes(1);
        expect(updateSW).toHaveBeenCalledWith(true);
    });

    it('still applies after the banner has been snoozed', async () => {
        mount(true);
        await act(async () => {
            swOptions?.onNeedRefresh?.();
        });
        act(() => controller.dismiss());

        rerender(false);
        await navigate();

        expect(updateSW).toHaveBeenCalledWith(true);
    });
});

describe('PwaUpdateGate — the boot notice', () => {
    it('announces the new version once when the applied flag is set', async () => {
        storage.set(PWA_APPLIED_FLAG, '1');

        mount(false);
        await act(async () => {});

        expect(bannerText()).toContain(`Updated to v${APP_VERSION}`);
        // Read-and-clear: a second mount (or StrictMode's double effect) is
        // not a second update.
        expect(storage.has(PWA_APPLIED_FLAG)).toBe(false);
    });

    it('says nothing on an ordinary boot', async () => {
        mount(false);
        await act(async () => {});

        expect(bannerText()).not.toContain('Updated to');
    });
});
