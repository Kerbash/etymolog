// @vitest-environment happy-dom
/**
 * usePwaUpdate — React's window onto the singleton controller.
 *
 * The thing being pinned is that the store is EXTERNAL: the controller's state
 * moves from timers and service-worker callbacks that no component owns, and
 * the subscription has to carry those into a render without the component
 * polling for them.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import {
    installPwaUpdates,
    resetPwaUpdatesForTests,
    type PwaUpdateController,
    type RegisterSWLike,
    type RegisterSWLikeOptions,
} from '../updateController';
import { usePwaUpdate, type PwaUpdateHandle } from '../usePwaUpdate';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let controller: PwaUpdateController;
let renders = 0;
let latest: PwaUpdateHandle;
let swOptions: RegisterSWLikeOptions | undefined;
const updateSW = vi.fn(() => Promise.resolve());
const registrationUpdate = vi.fn(() => Promise.resolve());

const registerSW: RegisterSWLike = (options) => {
    swOptions = options;
    options?.onRegisteredSW?.('/etymolog/sw.js', {
        update: registrationUpdate,
    } as unknown as ServiceWorkerRegistration);
    return updateSW;
};

function Probe() {
    const handle = usePwaUpdate();
    // Published from an EFFECT, not from the render body: a module variable
    // written during render is a side effect React is allowed to discard, and
    // the commit count is exactly what the "no redundant re-render" case needs
    // to observe anyway.
    useEffect(() => {
        latest = handle;
        renders += 1;
    });
    return <span data-testid="status">{handle.status}</span>;
}

const statusText = () => container.querySelector('[data-testid="status"]')?.textContent;

beforeEach(() => {
    renders = 0;
    swOptions = undefined;
    updateSW.mockClear();
    registrationUpdate.mockClear();
    resetPwaUpdatesForTests();
    controller = installPwaUpdates({
        registerSW,
        checkIntervalMs: 0,
        flush: () => Promise.resolve(),
        storage: null,
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Probe />));
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

describe('usePwaUpdate', () => {
    it('starts from the controller state, with nothing on offer', () => {
        expect(statusText()).toBe('idle');
        expect(latest.updateReady).toBe(false);
        expect(latest.snoozed).toBe(false);
    });

    it('re-renders when a new version lands, and offers it', () => {
        // Dirty, so the controller stops at `ready` instead of reloading.
        controller.setDirtyProbe(() => true);

        act(() => {
            swOptions?.onNeedRefresh?.();
        });

        expect(statusText()).toBe('ready');
        expect(latest.updateReady).toBe(true);
    });

    it('treats `applying` as still on offer, so the banner does not flicker away', () => {
        act(() => {
            swOptions?.onNeedRefresh?.();
        });

        expect(statusText()).toBe('applying');
        expect(latest.updateReady).toBe(true);
    });

    it('does not re-render when the controller writes the same state again', () => {
        const before = renders;

        act(() => {
            controller.dismiss();
            controller.dismiss();
            controller.dismiss();
        });

        // Three writes, one actual change.
        expect(renders).toBe(before + 1);
        expect(latest.snoozed).toBe(true);
    });

    it('delegates apply() to the controller', async () => {
        controller.setDirtyProbe(() => true);
        act(() => {
            swOptions?.onNeedRefresh?.();
        });

        await act(async () => {
            latest.apply();
        });

        expect(updateSW).toHaveBeenCalledWith(true);
    });

    it('delegates dismiss() and checkNow() to the controller', async () => {
        act(() => {
            latest.dismiss();
        });
        expect(controller.getState().snoozed).toBe(true);

        await act(async () => {
            latest.checkNow();
        });
        expect(registrationUpdate).toHaveBeenCalled();
    });

    it('unsubscribes on unmount — a later change must not touch a dead tree', () => {
        act(() => root.unmount());
        const before = renders;

        act(() => {
            controller.dismiss();
        });

        expect(renders).toBe(before);
    });
});
