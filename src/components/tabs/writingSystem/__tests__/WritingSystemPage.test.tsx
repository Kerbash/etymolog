// @vitest-environment happy-dom
/**
 * WritingSystemPage — names, warnings and the strict settings write.
 *
 * Three things that were wrong on this page and are now asserted:
 *
 *  1. **Every `<select>` has an accessible name.** They sat in a `<td>` next to
 *     the rule's label, which associates nothing — a screen reader announced
 *     five unnamed comboboxes. `aria-labelledby` points each one at its own
 *     rule-name cell.
 *  2. **`validateWritingSystem` is actually called.** It existed and nothing
 *     used it, so a user could set words and lines to run along the same axis —
 *     every wrapped line stacking on the last — with no warning anywhere.
 *  3. **The whole `writingSystem` object is spread on write.**
 *     `api.settings.update` is strict: a partial nested object is not a patch,
 *     it is a replacement, and the missing keys fail validation. This is the
 *     kind of thing that works in a manual click-through (because the defaults
 *     happen to match) and breaks on a customised language.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;

vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
);
vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

const update = vi.fn(() => ({ success: true, data: null }));

/** The writing-system settings the page renders, per test. */
let writingSystem: Record<string, string> = {
    glyphDirection: 'ltr',
    wordOrder: 'ltr',
    lineProgression: 'ttb',
    wordWrap: 'word',
    baselineAlignment: 'center',
};

vi.mock('../../../../db', () => ({
    useEtymolog: () => ({
        api: { settings: { update } },
        data: { graphemesComplete: [], glyphsWithUsage: [], lexiconComplete: [] },
        settings: { writingSystem },
        isReady: true,
        error: null,
    }),
}));

const { default: WritingSystemPage } = await import('../WritingSystemPage');
const { NotificationProvider } = await import('../../../shared/notifications/NotificationProvider');

let container: HTMLDivElement;
let root: Root;

function mount() {
    act(() => {
        root.render(
            <MemoryRouter>
                <NotificationProvider>
                    <WritingSystemPage />
                </NotificationProvider>
            </MemoryRouter>,
        );
    });
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    writingSystem = {
        glyphDirection: 'ltr',
        wordOrder: 'ltr',
        lineProgression: 'ttb',
        wordWrap: 'word',
        baselineAlignment: 'center',
    };
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

const selects = () => Array.from(container.querySelectorAll('select')) as HTMLSelectElement[];

/** The name a screen reader would announce for a control. */
function accessibleName(control: HTMLElement): string {
    const labelledBy = control.getAttribute('aria-labelledby');
    if (labelledBy) {
        return labelledBy
            .split(/\s+/)
            .map((id) => container.querySelector(`#${CSS.escape(id)}`)?.textContent ?? '')
            .join(' ')
            .trim();
    }
    return control.getAttribute('aria-label')?.trim() ?? '';
}

describe('WritingSystemPage — accessible names', () => {
    it('gives every rule select a non-empty accessible name', () => {
        mount();

        const found = selects();
        expect(found.length).toBeGreaterThan(0);
        for (const select of found) {
            expect(accessibleName(select), `select ${select.value} has no name`).not.toBe('');
        }
    });

    it('names each select after its own rule', () => {
        mount();

        const names = selects().map(accessibleName);
        expect(names).toContain('Glyph Direction');
        expect(names).toContain('Word Order');
        expect(names).toContain('Line Progression');
        // Every name is distinct — a shared name is as useless as none.
        expect(new Set(names).size).toBe(names.length);
    });

    it('uses real column headers and a caption per category', () => {
        mount();

        const tables = Array.from(container.querySelectorAll('table'));
        expect(tables.length).toBeGreaterThan(0);
        for (const table of tables) {
            expect(table.querySelector('caption')?.textContent).toBeTruthy();
            expect(table.querySelectorAll('tbody').length).toBe(1);
            for (const th of Array.from(table.querySelectorAll('thead th'))) {
                expect(th.getAttribute('scope')).toBe('col');
            }
        }
    });

    it('spells btt as "Bottom to Top"', () => {
        mount();

        const options = Array.from(container.querySelectorAll('option[value="btt"]'));
        expect(options.length).toBeGreaterThan(0);
        for (const option of options) {
            expect(option.textContent).toBe('Bottom to Top');
        }
    });
});

describe('WritingSystemPage — the contradiction warning', () => {
    it('warns when word order and line progression share an axis', () => {
        writingSystem = { ...writingSystem, wordOrder: 'ltr', lineProgression: 'ltr' };
        mount();

        expect(container.textContent).toContain('same axis');
        expect(container.textContent).toContain('contradict');
    });

    it('stays quiet on a coherent combination', () => {
        writingSystem = { ...writingSystem, wordOrder: 'ltr', lineProgression: 'ttb' };
        mount();

        expect(container.textContent).not.toContain('same axis');
    });
});

describe('WritingSystemPage — saving', () => {
    it('sends the WHOLE writingSystem object, not just the changed key', async () => {
        mount();

        const target = selects().find(
            (select) => accessibleName(select) === 'Word Order',
        ) as HTMLSelectElement;

        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLSelectElement.prototype,
                'value',
            )?.set;
            setter?.call(target, 'rtl');
            target.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(update).toHaveBeenCalledTimes(1);
        expect(update).toHaveBeenCalledWith({
            writingSystem: {
                glyphDirection: 'ltr',
                wordOrder: 'rtl',
                lineProgression: 'ttb',
                wordWrap: 'word',
                baselineAlignment: 'center',
            },
        });
    });

    it('confirms the save instead of doing it in silence', async () => {
        mount();

        const target = selects()[0];
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLSelectElement.prototype,
                'value',
            )?.set;
            setter?.call(target, 'rtl');
            target.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
        });

        // The toast portals onto the body.
        expect(document.body.textContent).toContain('Rule saved');
    });
});
