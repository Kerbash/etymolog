// @vitest-environment happy-dom
/**
 * FieldHelp — the reason this component exists is keyboard reachability.
 *
 * The help icons it replaces were spans carrying a `title` attribute: not
 * focusable, so keyboard and touch users could not reach the explanation at all,
 * and `title` is inconsistently surfaced by screen readers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import FieldHelp from '../FieldHelp';

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

const trigger = () => container.querySelector('button') as HTMLButtonElement;

describe('FieldHelp', () => {
    it('renders a real, focusable button', () => {
        render(<FieldHelp text="Auto-spelling derives the spelling from the pronunciation." />);

        expect(trigger()).not.toBeNull();
        // type="button" matters: an unqualified button inside a form submits it.
        expect(trigger().getAttribute('type')).toBe('button');

        trigger().focus();
        expect(document.activeElement).toBe(trigger());
    });

    it('names the trigger, defaulting to "Help"', () => {
        render(<FieldHelp text="explanation" />);
        expect(trigger().getAttribute('aria-label')).toBe('Help');

        render(<FieldHelp text="explanation" label="What auto-spelling does" />);
        expect(trigger().getAttribute('aria-label')).toBe('What auto-spelling does');
    });

    it('describes the trigger with a resolvable, text-bearing element', () => {
        // The tooltip node is portalled and only exists while open, so the
        // aria-describedby target has to be a durable copy in the DOM.
        render(<FieldHelp text="Derived from the pronunciation." />);

        const describedBy = trigger().getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();

        const description = container.querySelector(`#${CSS.escape(describedBy!)}`);
        expect(description).not.toBeNull();
        expect(description!.textContent).toBe('Derived from the pronunciation.');
    });

    it('renders the icon as decorative', () => {
        render(<FieldHelp text="explanation" />);
        const icon = trigger().querySelector('.bi-question-circle');
        expect(icon).not.toBeNull();
        expect(icon!.getAttribute('aria-hidden')).toBe('true');
    });

    it('generates a unique description id per instance', () => {
        render(
            <>
                <FieldHelp text="first" />
                <FieldHelp text="second" />
            </>,
        );
        const ids = Array.from(container.querySelectorAll('button')).map((b) =>
            b.getAttribute('aria-describedby'),
        );
        expect(new Set(ids).size).toBe(2);
    });
});
