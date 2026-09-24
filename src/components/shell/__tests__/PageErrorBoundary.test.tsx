// @vitest-environment happy-dom
/**
 * PageErrorBoundary — a page that throws shows a recoverable notice instead of
 * blanking the app, and moving to another route clears it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import PageErrorBoundary from '../PageErrorBoundary';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let shouldThrow = true;

function Page({ label }: { label: string }) {
    if (shouldThrow) throw new Error(`boom on ${label}`);
    return <p>{label} works</p>;
}

function render(resetKey: string) {
    act(() => {
        root.render(
            <PageErrorBoundary resetKey={resetKey}>
                <Page label={resetKey} />
            </PageErrorBoundary>,
        );
    });
}

const button = (text: string) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

beforeEach(() => {
    shouldThrow = true;
    // React logs caught render errors; keep the test output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
});

describe('PageErrorBoundary', () => {
    it('renders the page when nothing throws', () => {
        shouldThrow = false;
        render('/lexicon');
        expect(container.textContent).toContain('/lexicon works');
    });

    it('a throwing page shows an alert with what happened and what is safe', () => {
        render('/lexicon');
        const alert = container.querySelector('[role="alert"]');
        expect(alert).not.toBeNull();
        expect(alert!.textContent).toContain('This page stopped working');
        expect(alert!.textContent).toContain('Your language is saved');
        expect(alert!.textContent).toContain('boom on /lexicon');
        expect(button('Try again')).toBeDefined();
        expect(button('Reload the app')).toBeDefined();
    });

    it('"Try again" re-renders the page', () => {
        render('/lexicon');
        shouldThrow = false;
        act(() => button('Try again')!.click());
        expect(container.textContent).toContain('/lexicon works');
    });

    it('navigating to another route clears the error', () => {
        render('/lexicon');
        shouldThrow = false;
        render('/translator');
        expect(container.querySelector('[role="alert"]')).toBeNull();
        expect(container.textContent).toContain('/translator works');
    });

    it('re-rendering on the SAME route keeps the notice (no retry loop)', () => {
        render('/lexicon');
        shouldThrow = false;
        render('/lexicon');
        expect(container.querySelector('[role="alert"]')).not.toBeNull();
    });
});
