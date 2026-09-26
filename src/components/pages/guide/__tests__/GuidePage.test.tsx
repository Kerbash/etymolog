// @vitest-environment happy-dom
/**
 * The Guide is a small nested route tree: a layout (bar + right menu) with an
 * overview index and one page per writing-system family at `/guide/<slug>`. The
 * tests mount the real routes so navigation between the pages is exercised.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { GuideLayout, GuideIndex, GuideSectionPage } from '..';
import { GUIDE_SECTIONS, GUIDE_GROUPS } from '../guideContent';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(entry: string | { pathname: string; state?: unknown } = '/guide') {
    act(() => {
        root.render(
            <MemoryRouter initialEntries={['/script-maker', entry]} initialIndex={1}>
                <Routes>
                    <Route path="/guide" element={<GuideLayout />}>
                        <Route index element={<GuideIndex />} />
                        <Route path=":slug" element={<GuideSectionPage />} />
                    </Route>
                    <Route path="/lexicon" element={<div data-editor="lexicon">lexicon</div>} />
                    <Route path="/script-maker" element={<div data-editor="script-maker">script maker</div>} />
                </Routes>
            </MemoryRouter>,
        );
    });
}

function click(el: Element | null) {
    act(() => el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
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

describe('Guide', () => {
    it('overview lists a card and a menu link for every section, grouped', () => {
        mount('/guide');
        // Every section has a card and a menu link.
        const overviewText = container.querySelector('main')?.textContent ?? '';
        for (const section of GUIDE_SECTIONS) expect(overviewText, section.slug).toContain(section.title);

        const menuLinks = [...container.querySelectorAll('[data-guide-menu] a')].map((a) => a.textContent);
        expect(menuLinks[0]).toBe('Overview');
        for (const section of GUIDE_SECTIONS) expect(menuLinks, section.slug).toContain(section.title);
        // Group headings appear in both the overview and the menu.
        for (const group of GUIDE_GROUPS) expect(overviewText, group.id).toContain(group.label);
    });

    it('renders a comprehensive reference page with its screenshot', () => {
        mount('/guide/blocks-templates');
        expect(container.querySelector('#guide-section-title')?.textContent).toBe('Blocks: templates & layout');
        expect(container.querySelector('figure img')).not.toBeNull();
        expect(container.textContent).toContain('layout editor');
    });

    it('opens a section page directly and shows its walk-through', () => {
        mount('/guide/abugida');
        const heading = container.querySelector('#guide-section-title');
        expect(heading?.textContent).toBe('Abugida & syllable blocks');
        // The abugida body names the Block script.
        expect(container.textContent).toContain('Block script');
    });

    it('an unknown slug redirects to the overview', () => {
        mount('/guide/does-not-exist');
        expect(container.querySelector('#guide-section-title')).toBeNull();
        expect(container.querySelector('[class*="cardGrid"]')).not.toBeNull();
    });

    it('a menu link navigates to that family’s page', () => {
        mount('/guide');
        const logogram = [...container.querySelectorAll('[data-guide-menu] a')].find((a) => a.textContent === 'Logogram');
        click(logogram!);
        expect(container.querySelector('#guide-section-title')?.textContent).toBe('Logogram');
    });

    it('"Back to editor" returns to the page the guide was opened from', () => {
        mount({ pathname: '/guide', state: { from: '/script-maker' } });
        expect(container.querySelector('[data-editor]')).toBeNull();
        click(container.querySelector('[data-back-to-editor]'));
        expect(container.querySelector('[data-editor=script-maker]')).not.toBeNull();
    });

    it('"Back to editor" still leaves the guide after browsing between sections', () => {
        // Opened from Script Maker, then the reader clicks through to a section.
        mount({ pathname: '/guide', state: { from: '/script-maker' } });
        click([...container.querySelectorAll('[data-guide-menu] a')].find((a) => a.textContent === 'Logogram')!);
        expect(container.querySelector('#guide-section-title')?.textContent).toBe('Logogram');
        // Back must go to the editor, NOT step back to the overview.
        click(container.querySelector('[data-back-to-editor]'));
        expect(container.querySelector('[data-editor=script-maker]')).not.toBeNull();
    });

    it('"Back to editor" falls back to the lexicon when opened directly', () => {
        mount('/guide');
        click(container.querySelector('[data-back-to-editor]'));
        expect(container.querySelector('[data-editor=lexicon]')).not.toBeNull();
    });
});
