/**
 * url_mapping — the route table itself.
 *
 * Two things are worth locking down here, and neither shows up as a type error:
 *
 *  1. `resolveUrl` must accept a template with NO params. Phase 5 made the
 *     argument optional so every navigation in the app can go through one
 *     function; a required-params signature is what pushed half the call sites
 *     into using the raw constant instead.
 *  2. Every `TAB_ROUTES.path` must be a real `ROUTES` entry. The tab strip, the
 *     route tree and the active-tab derivation all read this table, so a path
 *     that exists only here is a tab that navigates to a 404 — and, because the
 *     shell redirects unknown paths back to the lexicon, it would look like a
 *     tab that simply refuses to open.
 */

import { describe, it, expect } from 'vitest';

import { ROUTES, TAB_ROUTES, activeTabId, resolveUrl } from '../url_mapping';

describe('resolveUrl', () => {
    it('substitutes named params', () => {
        expect(resolveUrl(ROUTES.lexiconView, { id: 42 })).toBe('/lexicon/db/42');
        expect(resolveUrl(ROUTES.lexiconEdit, { id: 42 })).toBe('/lexicon/db/42/edit');
        expect(resolveUrl(ROUTES.glyphEdit, { id: 7 })).toBe('/script-maker/glyphs/db/7');
        expect(resolveUrl(ROUTES.graphemeEdit, { id: '7' })).toBe('/script-maker/grapheme/db/7');
    });

    it('returns the template unchanged when no params are given', () => {
        expect(resolveUrl(ROUTES.lexicon)).toBe('/lexicon');
        expect(resolveUrl(ROUTES.translator)).toBe('/translator');
        expect(resolveUrl(ROUTES.writingSystem)).toBe('/writing-system');
    });

    it('leaves placeholders it was not given a value for', () => {
        // Not a silent success: an unresolved `:id` is visible in the URL bar
        // and in any test that asserts on it, which is the failure mode we
        // want over quietly navigating to "/lexicon/db/undefined".
        expect(resolveUrl(ROUTES.lexiconView, {})).toBe('/lexicon/db/:id');
    });
});

describe('ROUTES', () => {
    it('declares the word-generator route under the lexicon tab', () => {
        // The IPA chart's guide legend links here with `?preset=<id>`, so the
        // constant has to exist before the page does — a hardcoded
        // '/lexicon/generate' in the legend is exactly the drift
        // `url_mapping.ts` exists to prevent.
        expect(ROUTES.lexiconGenerate).toBe('/lexicon/generate');
        expect(activeTabId(ROUTES.lexiconGenerate)).toBe('lexicon');
        expect(resolveUrl(ROUTES.lexiconGenerate)).toBe('/lexicon/generate');
    });

    it('has no duplicate paths', () => {
        const values = Object.values(ROUTES);
        expect(new Set(values).size).toBe(values.length);
    });
});

describe('TAB_ROUTES', () => {
    const routeValues = new Set<string>(Object.values(ROUTES));

    it('points every tab at a declared route', () => {
        for (const tab of TAB_ROUTES) {
            expect(routeValues.has(tab.path)).toBe(true);
        }
    });

    it("uses each route's first segment as the tab id", () => {
        // This is the contract `activeTabId()` relies on: the active tab is
        // derived from `location.pathname`'s first segment with no lookup table.
        for (const tab of TAB_ROUTES) {
            expect(tab.path).toBe(`/${tab.id}`);
        }
    });

    it('has unique ids and a label for each', () => {
        const ids = TAB_ROUTES.map((tab) => tab.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const tab of TAB_ROUTES) {
            expect(tab.label.length).toBeGreaterThan(0);
        }
    });

    it('derives the active tab from a pathname, deep links included', () => {
        expect(activeTabId('/lexicon')).toBe('lexicon');
        expect(activeTabId('/lexicon/db/42/edit')).toBe('lexicon');
        expect(activeTabId('/script-maker/glyphs/db/7')).toBe('script-maker');
        expect(activeTabId('/writing-system')).toBe('writing-system');
        expect(activeTabId('/translator')).toBe('translator');
    });

    it('falls back to the first tab for the index and for unknown paths', () => {
        // The shell redirects both cases to the lexicon, so the strip has to
        // agree rather than render with nothing selected.
        expect(activeTabId('/')).toBe('lexicon');
        expect(activeTabId('')).toBe('lexicon');
        expect(activeTabId('/not-a-tab/at/all')).toBe('lexicon');
    });

    it('covers the four top-level areas', () => {
        expect(TAB_ROUTES.map((tab) => tab.id)).toEqual([
            'lexicon',
            'script-maker',
            'writing-system',
            'translator',
        ]);
    });
});
