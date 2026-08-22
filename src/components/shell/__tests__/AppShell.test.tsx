// @vitest-environment happy-dom
/**
 * AppShell — the landmarks, the keyboard-operable primary nav, and the
 * unsaved-changes gate.
 *
 * What is being pinned here is exactly what the audit found missing:
 *
 *  - FOUR landmarks (`header` / `nav` / `main` / `footer`) plus a skip link.
 *    The old shell was nested `<div>`s, so a screen-reader user had no way to
 *    reach — or skip — the navigation.
 *  - A real tablist. `RouterTabContainer` rendered its toggles as `<div
 *    onClick>` with no role, no tabIndex and no key handling, which made the
 *    app's only top-level navigation unreachable from a keyboard. ArrowRight
 *    must both MOVE FOCUS and NAVIGATE.
 *  - A dirty editor must be able to stop a tab switch. `NavigationGuard`
 *    cannot: a tab click never passes through an anchor, so react-router
 *    navigates with nothing to intercept it.
 *
 * The database is mocked. None of the above is about SQLite, and a real
 * `initDatabase()` would make a nav test depend on sql.js WASM loading.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { DatabaseHealth } from '../../../db/database';
import type { PersistenceState } from '../../../db/persistence/types';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom has neither, and both are read at mount: `matchMedia` by
// DarkmodeSwitch and by TabContainer's dropdown-mode probe, `ResizeObserver` by
// TabContainer's overflow measurement.
const matchMediaMock = vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
}));
vi.stubGlobal('matchMedia', matchMediaMock);
vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

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
    adapter: 'memory',
    dirty: false,
    lastSavedAt: null,
    lastSavedBytes: null,
    error: null,
};

const settingsUpdate = vi.fn();

vi.mock('../../../db', () => ({
    useEtymolog: () => ({
        api: {
            settings: { update: settingsUpdate, reset: vi.fn() },
            database: { reset: vi.fn(), repair: vi.fn(), export: vi.fn() },
        },
        settings: { conlangName: 'Kavi' },
        data: { lexiconCount: 0, graphemeCount: 0, glyphCount: 0 },
        persistence: SAVED,
        health: HEALTHY,
        refresh: vi.fn(),
    }),
    persistDatabaseNow: vi.fn(() => Promise.resolve()),
}));

const { default: AppShell } = await import('../AppShell');
const { useRegisterUnsaved } = await import('../unsavedChanges');
const { NotificationProvider } = await import('../../shared/notifications/NotificationProvider');
const { default: ConfirmDialogProvider } = await import(
    '../../shared/confirmDialog/ConfirmDialogProvider'
);

let container: HTMLDivElement;
let root: Root;

/** Publishes the current pathname into the DOM so assertions can read it. */
function LocationProbe() {
    const { pathname } = useLocation();
    return <p data-testid="pathname">{pathname}</p>;
}

/** A page that claims to hold unsaved input for as long as it is mounted. */
function DirtyPage() {
    useRegisterUnsaved('test-editor', true);
    const { pathname } = useLocation();
    return <p data-testid="pathname">{pathname}</p>;
}

function mount(initialPath = '/lexicon', LexiconPage: React.ComponentType = LocationProbe) {
    act(() => {
        root.render(
            <MemoryRouter initialEntries={[initialPath]}>
                <NotificationProvider>
                    <ConfirmDialogProvider>
                        <Routes>
                            <Route element={<AppShell />}>
                                <Route path="lexicon/*" element={<LexiconPage />} />
                                <Route path="script-maker/*" element={<LocationProbe />} />
                                <Route path="writing-system/*" element={<LocationProbe />} />
                                <Route path="translator/*" element={<LocationProbe />} />
                            </Route>
                        </Routes>
                    </ConfirmDialogProvider>
                </NotificationProvider>
            </MemoryRouter>,
        );
    });
}

beforeEach(() => {
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
    vi.clearAllMocks();
});

const tabs = () => Array.from(container.querySelectorAll('[role="tab"]')) as HTMLElement[];
const activeTab = () => tabs().find((t) => t.getAttribute('aria-selected') === 'true');
const pathname = () => container.querySelector('[data-testid="pathname"]')?.textContent;

/** Fire a real keydown so React's synthetic handler runs, as a browser would. */
function pressKey(el: HTMLElement, key: string) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

/** The confirm dialog portals out of `container`. */
const confirmAction = (which: 'confirm' | 'cancel') =>
    document.body.querySelector(`[data-confirmation-action="${which}"]`) as HTMLElement | null;

describe('AppShell — landmarks', () => {
    it('renders header, nav, main and footer', () => {
        mount();

        expect(container.querySelector('header')).not.toBeNull();
        expect(container.querySelector('[role="navigation"][aria-label="Primary"]')).not.toBeNull();
        expect(container.querySelector('main#main-content')).not.toBeNull();
        expect(container.querySelector('footer')).not.toBeNull();
    });

    it('puts a skip link to #main-content first in the DOM', () => {
        mount();

        const link = container.querySelector('a[href="#main-content"]') as HTMLAnchorElement;
        expect(link).not.toBeNull();
        expect(link.textContent).toBe('Skip to content');
        // It has to be the FIRST focusable thing, or it is not a skip link.
        const focusable = container.querySelector('a, button, [role="tab"], input');
        expect(focusable).toBe(link);
    });

    it('uses the conlang name as the single h1', () => {
        mount();

        const headings = container.querySelectorAll('h1');
        expect(headings.length).toBe(1);
        expect(headings[0].textContent).toBe('Kavi');
    });

    it('renders one tab per TAB_ROUTES entry, with the pathname driving the active one', () => {
        mount('/translator');

        expect(tabs().map((t) => t.textContent)).toEqual([
            'Lexicon',
            'Script Maker',
            'Writing System',
            'Translator',
        ]);
        expect(activeTab()?.textContent).toBe('Translator');
    });
});

describe('AppShell — keyboard navigation', () => {
    it('moves focus AND navigates on ArrowRight', async () => {
        mount('/lexicon');
        expect(activeTab()?.textContent).toBe('Lexicon');

        await act(async () => {
            pressKey(activeTab()!, 'ArrowRight');
        });

        expect(pathname()).toBe('/script-maker');
        expect(activeTab()?.textContent).toBe('Script Maker');
        // Roving tabindex: focus follows selection, so the next Arrow press
        // continues from where the user is rather than from the first tab.
        expect(document.activeElement?.textContent).toBe('Script Maker');
        expect(activeTab()?.getAttribute('tabindex')).toBe('0');
    });

    it('wraps around on ArrowLeft from the first tab', async () => {
        mount('/lexicon');

        await act(async () => {
            pressKey(activeTab()!, 'ArrowLeft');
        });

        expect(pathname()).toBe('/translator');
    });

    it('navigates on click', async () => {
        mount('/lexicon');

        await act(async () => {
            tabs()[2].click();
        });

        expect(pathname()).toBe('/writing-system');
    });
});

describe('AppShell — unsaved changes', () => {
    it('blocks a tab switch until the discard confirmation resolves true', async () => {
        mount('/lexicon', DirtyPage);
        expect(pathname()).toBe('/lexicon');

        await act(async () => {
            tabs()[3].click();
        });

        // The navigation is PENDING on the dialog — the page has not changed.
        expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull();
        expect(pathname()).toBe('/lexicon');

        // Cancel: stay put.
        await act(async () => {
            confirmAction('cancel')!.click();
        });
        expect(pathname()).toBe('/lexicon');

        // Ask again and confirm: now it leaves.
        await act(async () => {
            tabs()[3].click();
        });
        await act(async () => {
            confirmAction('confirm')!.click();
        });
        expect(pathname()).toBe('/translator');
    });

    it('does not ask when nothing is dirty', async () => {
        mount('/lexicon');

        await act(async () => {
            tabs()[1].click();
        });

        expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
        expect(pathname()).toBe('/script-maker');
    });
});
