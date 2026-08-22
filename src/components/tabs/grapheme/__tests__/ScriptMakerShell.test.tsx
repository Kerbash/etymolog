// @vitest-environment happy-dom
/**
 * The Script Maker shell — the nested nav and the two index headers.
 *
 * What is pinned here:
 *
 *  - the Graphemes/Glyphs strip is a REAL tablist, not two styled `<div>`s, and
 *    the ROUTER decides which tab is selected — a deep link to
 *    `/script-maker/glyphs` (or to a glyph edit page under it) must arrive with
 *    Glyphs already active, which is exactly what the `controlledActiveSection`
 *    wiring is for;
 *  - the header actions are LINKS. They used to be a floating `<nav>` of
 *    buttons above the gallery with an inline `marginBottom`; the point of
 *    moving them into `PageHeader` is that "New grapheme" is an `<a href>` a
 *    user can middle-click, not an `onClick` handler.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { Route, Routes } from 'react-router-dom';

import { clearDatabase, initDatabase } from '../../../../db/database';
import GraphemeMain from '../main';
import { mountHarness, settle, type Harness } from './testHarness';

/**
 * Mounted the way `App.tsx` mounts it — under the `script-maker/*` splat.
 *
 * That wrapper is load-bearing, not ceremony: the shell's own `<Routes>` sits
 * inside a PATHLESS layout route, and without a parent match consuming the
 * `/script-maker` segment the layout's `<Outlet/>` resolves to nothing and the
 * tab panel renders empty — the strip appears, the page does not.
 */
const mountShell = (path: string) =>
    mountHarness(
        <Routes>
            <Route path="/script-maker/*" element={<GraphemeMain />} />
        </Routes>,
        path,
    );

let harness: Harness | null = null;

beforeAll(async () => {
    await initDatabase();
});

beforeEach(() => {
    clearDatabase();
});

afterEach(() => {
    harness?.unmount();
    harness = null;
});

const tabs = (h: Harness) =>
    Array.from(h.container.querySelectorAll('[role="tab"]')) as HTMLElement[];

describe('Script Maker shell — the nested nav', () => {
    it('renders a tablist with Graphemes and Glyphs', async () => {
        harness = await mountShell('/script-maker');

        expect(harness.container.querySelector('[role="tablist"]')).not.toBeNull();
        expect(tabs(harness).map((tab) => tab.textContent)).toEqual(['Graphemes', 'Glyphs']);
    });

    it('marks Graphemes selected on the index route', async () => {
        harness = await mountShell('/script-maker');

        const selected = tabs(harness).filter((tab) => tab.getAttribute('aria-selected') === 'true');
        expect(selected).toHaveLength(1);
        expect(selected[0].textContent).toBe('Graphemes');
        expect(harness.text()).toContain('No graphemes yet');
    });

    it('marks Glyphs selected on /script-maker/glyphs', async () => {
        harness = await mountShell('/script-maker/glyphs');

        const selected = tabs(harness).filter((tab) => tab.getAttribute('aria-selected') === 'true');
        expect(selected).toHaveLength(1);
        expect(selected[0].textContent).toBe('Glyphs');
        expect(harness.text()).toContain('No glyphs yet');
    });

    it('keeps Glyphs selected on a nested glyph route', async () => {
        // The match is `${ROUTES.glyphs}/*`, not the bare path — a deep link to
        // an edit page under Glyphs used to leave Graphemes highlighted.
        harness = await mountShell('/script-maker/glyphs/create');

        const selected = tabs(harness).filter((tab) => tab.getAttribute('aria-selected') === 'true');
        expect(selected[0].textContent).toBe('Glyphs');
    });
});

describe('Script Maker shell — the page headers', () => {
    it('gives the grapheme index a title, stats and LINK actions', async () => {
        harness = await mountShell('/script-maker');

        const heading = harness.container.querySelector('h2');
        expect(heading?.textContent).toBe('Graphemes');

        const hrefs = Array.from(harness.container.querySelectorAll('a')).map((a) =>
            a.getAttribute('href'),
        );
        expect(hrefs).toContain('/script-maker/create');
        expect(hrefs).toContain('/script-maker/punctuation');
    });

    it('puts the three charts behind one "View chart" dropdown, as links', async () => {
        harness = await mountShell('/script-maker');

        const toggle = Array.from(harness.container.querySelectorAll('button, [role="button"]')).find(
            (element) => (element.textContent ?? '').includes('View chart'),
        ) as HTMLElement | undefined;
        expect(toggle, 'the View chart toggle should exist').toBeDefined();

        await act(async () => {
            toggle!.click();
        });
        await settle();

        // The menu may portal out of the container, so search the document.
        const hrefs = Array.from(document.body.querySelectorAll('a')).map((a) =>
            a.getAttribute('href'),
        );
        expect(hrefs).toContain('/script-maker/chart');
        expect(hrefs).toContain('/script-maker/syllabary');
        expect(hrefs).toContain('/script-maker/custom-charts');
    });

    it('gives the glyph index its own title, stats and New-glyph link', async () => {
        harness = await mountShell('/script-maker/glyphs');

        const heading = harness.container.querySelector('h2');
        expect(heading?.textContent).toBe('Glyphs');

        const hrefs = Array.from(harness.container.querySelectorAll('a')).map((a) =>
            a.getAttribute('href'),
        );
        expect(hrefs).toContain('/script-maker/glyphs/create');

        // Both facts are present even at zero — a stat strip that disappears
        // when the count is 0 is a layout that jumps on the first glyph.
        expect(harness.text()).toContain('Unused');
    });

    it('renders no inline margin styles on the header row', async () => {
        harness = await mountShell('/script-maker');

        const inlineMargins = Array.from(harness.container.querySelectorAll('[style]')).filter(
            (element) => (element.getAttribute('style') ?? '').includes('margin-bottom'),
        );
        expect(inlineMargins).toEqual([]);
    });
});
