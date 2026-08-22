// @vitest-environment happy-dom
/**
 * ExportImportButtons — the header's two dropdown toggles are real buttons.
 *
 * Both used to pass `toggleBtnAs="div"` to `DropDownSmall` (to avoid nesting
 * `IconButton`'s own `<button>` inside the toggle), which produced a
 * `<div aria-haspopup="true">`: not in the tab order, not announced as a
 * control, and unreachable with Enter/Space. The usability walk-through logged
 * it as "Header buttons Export / Import have no accessible names".
 *
 * These assertions pin the fix at the level a user experiences it: element
 * type, accessible name, and keyboard operation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const handleExportJson = vi.fn();
const handleExportImage = vi.fn();
const handleImportJson = vi.fn();
const handleImportImage = vi.fn();

vi.mock('../useExportImport', () => ({
    useExportImport: () => ({
        handleExportJson,
        handleExportImage,
        handleImportJson,
        handleImportImage,
    }),
}));

// The Import button reads the conlang name for its "replace everything?"
// confirmation; the database itself is not part of what is under test here.
vi.mock('../../../db', () => ({
    useEtymolog: () => ({ settings: { conlangName: 'Testlang' } }),
}));

const { ExportButton, ImportButton } = await import('../ExportImportButtons');
const { ConfirmDialogProvider } = await import('../../shared');

let container: HTMLDivElement;
let root: Root;

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

const render = (el: React.ReactElement) =>
    act(() => {
        root.render(<ConfirmDialogProvider>{el}</ConfirmDialogProvider>);
    });

/** The toggle DropDownSmall builds; it lives in the component's own subtree. */
const toggle = () => container.querySelector('[aria-haspopup]') as HTMLElement | null;

/**
 * The panel is portalled to a host appended to `document.body`, so it is never
 * inside `container`. Look it up by the id the toggle points at.
 */
const panel = () => {
    const id = toggle()?.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
};

describe.each([
    ['ExportButton', () => <ExportButton />, 'Export', 'Export conlang data', ['Export as JSON', 'Export as Image']],
    ['ImportButton', () => <ImportButton />, 'Import', 'Import conlang data', ['Import JSON', 'Import Image']],
] as const)('%s', (_name, element, visibleLabel, accessibleName, itemLabels) => {
    it('renders the toggle as a real <button>, not a div', () => {
        render(element());

        const el = toggle()!;
        expect(el).not.toBeNull();
        expect(el.tagName).toBe('BUTTON');
        // A real button also gets an explicit type, so it cannot submit a form
        // it happens to be rendered inside.
        expect(el.getAttribute('type')).toBe('button');
        // No interactive element nested inside an interactive element.
        expect(el.querySelector('button')).toBeNull();
    });

    it('has an accessible name that contains the visible label', () => {
        render(element());

        const el = toggle()!;
        expect(el.getAttribute('aria-label')).toBe(accessibleName);
        // WCAG 2.5.3 Label in Name: speech input must be able to say what it reads.
        expect(accessibleName).toContain(visibleLabel);
        expect(el.textContent).toContain(visibleLabel);
    });

    it('is focusable and reports its expanded state', () => {
        render(element());

        const el = toggle()!;
        expect(el.getAttribute('aria-expanded')).toBe('false');

        act(() => el.focus());
        expect(document.activeElement).toBe(el);
        // A <div> would need an explicit tabindex; a button is in the tab order
        // natively, so the attribute must NOT be needed here.
        expect(el.hasAttribute('tabindex')).toBe(false);
    });

    it('opens on click and lists its items', () => {
        render(element());

        act(() => toggle()!.click());

        expect(toggle()!.getAttribute('aria-expanded')).toBe('true');
        const items = Array.from(panel()!.querySelectorAll('button')).map(b => b.textContent?.trim());
        expect(items).toEqual([...itemLabels]);
    });

    it('closes on Escape and returns focus to the toggle', () => {
        render(element());

        const el = toggle()!;
        act(() => el.click());
        expect(el.getAttribute('aria-expanded')).toBe('true');

        act(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });

        expect(toggle()!.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(toggle());
    });

    it('walks the items with ArrowDown', () => {
        render(element());

        act(() => toggle()!.click());
        const items = Array.from(panel()!.querySelectorAll('button')) as HTMLElement[];

        act(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        });
        expect(document.activeElement).toBe(items[0]);

        act(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        });
        expect(document.activeElement).toBe(items[1]);
    });
});

describe('ExportButton actions', () => {
    it('runs the export the activated item names', () => {
        render(<ExportButton />);

        act(() => toggle()!.click());
        const items = Array.from(panel()!.querySelectorAll('button')) as HTMLElement[];

        act(() => items[0].click());
        expect(handleExportJson).toHaveBeenCalledTimes(1);
        expect(handleExportImage).not.toHaveBeenCalled();

        act(() => items[1].click());
        expect(handleExportImage).toHaveBeenCalledTimes(1);
    });
});
