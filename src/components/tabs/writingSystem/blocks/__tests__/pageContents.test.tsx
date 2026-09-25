// @vitest-environment happy-dom
/**
 * PageContents — the "On this page" jump links (BLOCK_PLACEMENT_PLAN.md §5).
 *
 * Checked here in isolation: it renders one anchor per link, in order, with
 * `#id` hrefs; a click is intercepted (default prevented, the hash never
 * reaches the URL) and drives `scrollIntoView` + focus on the matching target;
 * a link whose target is absent is a harmless no-op. The whole-page ordering
 * and id-coverage assertions live in `blocksPage.test.tsx`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import PageContents from '../PageContents';
import type { PageContentsLink } from '../PageContents';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const LINKS: readonly PageContentsLink[] = [
    { id: 'sec-one', label: 'One' },
    { id: 'sec-two', label: 'Two' },
];

let container: HTMLDivElement;
let root: Root;

/** Render the nav plus two real sections it can jump to. */
function mount(links: readonly PageContentsLink[] = LINKS) {
    act(() => {
        root.render(
            <div>
                <PageContents links={links} />
                <section id="sec-one">one</section>
                <section id="sec-two">two</section>
            </div>,
        );
    });
}

function links(): HTMLAnchorElement[] {
    return [...container.querySelectorAll<HTMLAnchorElement>('[data-page-contents] a')];
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
});

describe('PageContents', () => {
    it('renders a labelled nav with one anchor per link, in order, with #id hrefs', () => {
        mount();
        const nav = container.querySelector('nav[data-page-contents]');
        expect(nav?.getAttribute('aria-label')).toBe('On this page');
        expect(links().map((a) => a.textContent)).toEqual(['One', 'Two']);
        expect(links().map((a) => a.getAttribute('href'))).toEqual(['#sec-one', '#sec-two']);
    });

    it('a click scrolls and focuses the target, prevents default, and never changes the hash', () => {
        const scrollIntoView = vi.fn();
        (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollIntoView;
        mount();
        const target = document.getElementById('sec-two')!;
        const hashBefore = window.location.hash;

        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        act(() => {
            links()[1].dispatchEvent(event);
        });

        expect(event.defaultPrevented).toBe(true);
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(scrollIntoView.mock.instances[0]).toBe(target);
        expect(scrollIntoView.mock.calls[0][0]).toEqual({ behavior: 'smooth', block: 'start' });
        expect(target.tabIndex).toBe(-1);
        expect(document.activeElement).toBe(target);
        expect(window.location.hash).toBe(hashBefore);
    });

    it('a click on a link whose target is missing is a harmless no-op', () => {
        const scrollIntoView = vi.fn();
        (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollIntoView;
        mount([{ id: 'nowhere', label: 'Gone' }]);
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        act(() => {
            links()[0].dispatchEvent(event);
        });
        expect(event.defaultPrevented).toBe(true);
        expect(scrollIntoView).not.toHaveBeenCalled();
    });
});
