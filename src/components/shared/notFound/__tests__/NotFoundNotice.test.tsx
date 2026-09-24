// @vitest-environment happy-dom
/**
 * NotFoundNotice — an unknown address inside a tab says so and offers the way
 * back, instead of an empty panel or a silent redirect.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import NotFoundNotice from '../NotFoundNotice';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

function renderAt(path: string) {
    act(() => {
        root.render(
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/script-maker/create" element={<p>create page</p>} />
                    <Route path="/script-maker/*" element={<NotFoundNotice backTo="/script-maker" backLabel="Go to the graphemes" />} />
                </Routes>
            </MemoryRouter>,
        );
    });
}

describe('NotFoundNotice', () => {
    it('names the address and links back to the tab', () => {
        renderAt('/script-maker/graphemes/create');
        expect(container.textContent).toContain('There is no page here');
        expect(container.textContent).toContain('/script-maker/graphemes/create');
        const link = container.querySelector('a');
        expect(link?.getAttribute('href')).toBe('/script-maker');
        expect(link?.textContent).toContain('Go to the graphemes');
    });

    it('is not shown for a real page', () => {
        renderAt('/script-maker/create');
        expect(container.textContent).toContain('create page');
        expect(container.textContent).not.toContain('There is no page here');
    });
});
