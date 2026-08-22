// @vitest-environment happy-dom
/**
 * PageHeader — the landmark and the breadcrumb contract.
 *
 * What is worth pinning (the rest is layout SCSS):
 *  - it renders a real `<header>` landmark, which is the thing eight hand-rolled
 *    nav rows never did;
 *  - the LAST breadcrumb is not a link and carries `aria-current="page"` — a
 *    link to where you already are is a dead control a screen-reader user has to
 *    tab past;
 *  - the heading level is selectable, because the app shell owns the page `h1`
 *    and a second `h1` per page breaks the document outline.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import PageHeader from '../PageHeader';

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
        root.render(<MemoryRouter>{el}</MemoryRouter>);
    });

describe('PageHeader', () => {
    it('renders a <header> landmark with the title', () => {
        render(<PageHeader title="Lexicon" />);

        const header = container.querySelector('header');
        expect(header).not.toBeNull();
        expect(header!.querySelector('h2')?.textContent).toBe('Lexicon');
    });

    it('defaults to h2 and honours as="h1"', () => {
        render(<PageHeader title="Lexicon" />);
        expect(container.querySelector('h2')).not.toBeNull();
        expect(container.querySelector('h1')).toBeNull();

        render(<PageHeader title="Lexicon" as="h1" />);
        expect(container.querySelector('h1')?.textContent).toBe('Lexicon');
    });

    it('renders the description and the actions slot', () => {
        render(
            <PageHeader
                title="Lexicon"
                description="Every word in your language."
                actions={<button type="button">New word</button>}
            />,
        );

        expect(container.textContent).toContain('Every word in your language.');
        expect(container.querySelector('button')?.textContent).toBe('New word');
    });

    it('renders a labelled breadcrumb whose LAST item is aria-current, not a link', () => {
        render(
            <PageHeader
                title="Edit word"
                breadcrumb={[
                    { to: '/lexicon', label: 'Lexicon' },
                    { to: '/lexicon/db/1', label: 'kata' },
                    { to: '/lexicon/db/1/edit', label: 'Edit' },
                ]}
            />,
        );

        const nav = container.querySelector('nav[aria-label="Breadcrumb"]');
        expect(nav).not.toBeNull();

        const items = Array.from(nav!.querySelectorAll('li'));
        expect(items.length).toBe(3);

        // The first two are links…
        expect(items[0].querySelector('a')?.getAttribute('href')).toBe('/lexicon');
        expect(items[1].querySelector('a')?.getAttribute('href')).toBe('/lexicon/db/1');

        // …the last one is not, and announces itself as the current page.
        expect(items[2].querySelector('a')).toBeNull();
        const current = nav!.querySelector('[aria-current="page"]');
        expect(current?.textContent).toBe('Edit');
    });

    it('renders no breadcrumb nav when the trail is empty', () => {
        render(<PageHeader title="Lexicon" breadcrumb={[]} />);
        expect(container.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();
    });

    it('renders the back link as a router Link with an arrow icon', () => {
        render(<PageHeader title="Edit glyph" back={{ to: '/script-maker/glyphs', label: 'Back to glyphs' }} />);

        const link = container.querySelector('a[href="/script-maker/glyphs"]');
        expect(link).not.toBeNull();
        expect(link!.textContent).toContain('Back to glyphs');
        // Decorative icon: the visible label carries the meaning.
        expect(link!.querySelector('.bi-arrow-left')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('renders the facts strip through QuickFactsRow', () => {
        render(
            <PageHeader
                title="Lexicon"
                facts={[
                    { label: 'Words', value: 12, big: true },
                    { label: 'Needs attention', value: 3 },
                ]}
            />,
        );

        expect(container.textContent).toContain('Words');
        expect(container.textContent).toContain('12');
        expect(container.textContent).toContain('Needs attention');
    });
});
