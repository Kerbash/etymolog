// @vitest-environment happy-dom
/**
 * DialogPanel — the label wiring and the size contract.
 *
 * The label wiring is the part that silently rots: `aria-labelledby` pointing at
 * an id that no longer exists is indistinguishable from correct markup unless
 * something resolves the reference, so that is what these assertions do.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import DialogPanel from '../DialogPanel';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

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
});

const render = (el: React.ReactElement) =>
    act(() => {
        root.render(el);
    });

const panel = () => container.firstElementChild as HTMLElement;

describe('DialogPanel', () => {
    it('renders the title as an h2 and points aria-labelledby at it', () => {
        render(<DialogPanel title="Rename conlang">body</DialogPanel>);

        const labelledBy = panel().getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();

        const heading = container.querySelector(`#${CSS.escape(labelledBy!)}`);
        expect(heading).not.toBeNull();
        expect(heading!.tagName).toBe('H2');
        expect(heading!.textContent).toBe('Rename conlang');
    });

    it('omits aria-labelledby entirely when no title is given', () => {
        // A pointer to a non-existent id is WORSE than no pointer: assistive
        // tech resolves it to the empty string and announces an unnamed dialog.
        render(<DialogPanel>body</DialogPanel>);

        expect(panel().getAttribute('aria-labelledby')).toBeNull();
        expect(container.querySelector('h2')).toBeNull();
    });

    it('renders body and actions, and omits the actions row when absent', () => {
        render(
            <DialogPanel title="Confirm" actions={<button type="button">Save</button>}>
                <p>Body copy</p>
            </DialogPanel>,
        );
        expect(container.textContent).toContain('Body copy');
        expect(container.querySelector('button')?.textContent).toBe('Save');

        render(<DialogPanel title="Confirm">body</DialogPanel>);
        expect(container.querySelector('button')).toBeNull();
    });

    it('applies a distinct size class per size, defaulting to md', () => {
        render(<DialogPanel title="t">b</DialogPanel>);
        const md = panel().className;

        render(<DialogPanel title="t" size="sm">b</DialogPanel>);
        const sm = panel().className;

        render(<DialogPanel title="t" size="lg">b</DialogPanel>);
        const lg = panel().className;

        expect(md).toContain('sizeMd');
        expect(sm).toContain('sizeSm');
        expect(lg).toContain('sizeLg');
        expect(new Set([sm, md, lg]).size).toBe(3);
    });

    it('generates a UNIQUE title id per instance', () => {
        // Two panels on screen at once (a modal opened over another) must not
        // both claim the same id — the second aria-labelledby would resolve to
        // the FIRST panel's heading.
        render(
            <>
                <DialogPanel title="First">a</DialogPanel>
                <DialogPanel title="Second">b</DialogPanel>
            </>,
        );

        const ids = Array.from(container.querySelectorAll('[aria-labelledby]')).map((el) =>
            el.getAttribute('aria-labelledby'),
        );
        expect(ids.length).toBe(2);
        expect(new Set(ids).size).toBe(2);
    });

    it('merges a consumer className onto the panel rather than replacing it', () => {
        render(<DialogPanel title="t" className="consumer">b</DialogPanel>);
        expect(panel().className).toContain('consumer');
        expect(panel().className).toContain('panel');
    });
});
