// @vitest-environment happy-dom
/**
 * LoadingState — the announcement contract.
 *
 * The point of the component is that the loading region ANNOUNCES itself: a bare
 * `<div>Loading…</div>` that is later replaced is never announced by a screen
 * reader, which is what the app's ten loading strings did. The skeleton bars
 * themselves must stay decorative so the region announces once, not once per bar.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import LoadingState from '../LoadingState';

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

const region = () => container.querySelector('[role="status"]') as HTMLElement;

describe('LoadingState', () => {
    it('announces itself as a status region with a default label', () => {
        render(<LoadingState variant="page" />);
        expect(region()).not.toBeNull();
        expect(region().getAttribute('aria-label')).toBe('Loading');
    });

    it('uses a caller-supplied label', () => {
        render(<LoadingState variant="gallery" label="Loading words" />);
        expect(region().getAttribute('aria-label')).toBe('Loading words');
    });

    it('gallery renders `count` skeleton cards (default 6)', () => {
        render(<LoadingState variant="gallery" />);
        const grid = region().firstElementChild!;
        expect(grid.children.length).toBe(6);

        render(<LoadingState variant="gallery" count={3} />);
        expect(region().firstElementChild!.children.length).toBe(3);
    });

    it('form renders a label+field pair per field (default 4)', () => {
        render(<LoadingState variant="form" />);
        const stack = region().firstElementChild!;
        expect(stack.children.length).toBe(4);
        // Each field is a label bar plus an input bar.
        expect(stack.children[0].children.length).toBe(2);

        render(<LoadingState variant="form" count={2} />);
        expect(region().firstElementChild!.children.length).toBe(2);
    });

    it('inline uses the DotLoader and exposes exactly one live region', () => {
        render(<LoadingState variant="inline" />);

        // `DotLoader` hardcodes role="status" with no opt-out, so the markup
        // genuinely contains two. What must be true is that only ONE of them is
        // in the accessibility tree — the inner one sits under an aria-hidden
        // ancestor, which removes its whole subtree.
        const statusNodes = Array.from(container.querySelectorAll('[role="status"]'));
        expect(statusNodes.length).toBe(2);

        const exposed = statusNodes.filter((el) => !el.closest('[aria-hidden="true"]'));
        expect(exposed.length).toBe(1);
        expect(exposed[0]).toBe(region());
        expect(exposed[0].getAttribute('aria-label')).toBe('Loading');
    });
});
