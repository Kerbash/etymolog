// @vitest-environment happy-dom
/**
 * FormActionBar — button roles and the danger separation.
 *
 * The layout assertion is a real requirement, not cosmetics: the three edit
 * pages used to render [Save][Cancel][Delete] as one tight row, putting the
 * irreversible control one button-width from the one pressed on every save.
 * The danger slot is a SEPARATE flex child at the opposite end of a
 * space-between row.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import FormActionBar from '../FormActionBar';

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

const buttons = () => Array.from(container.querySelectorAll('button'));

describe('FormActionBar', () => {
    it('renders Cancel then Save, with Save as the submit button', () => {
        render(<FormActionBar onCancel={() => {}} />);

        expect(buttons().map((b) => b.textContent)).toEqual(['Cancel', 'Save']);
        expect(buttons()[0].getAttribute('type')).toBe('button');
        expect(buttons()[1].getAttribute('type')).toBe('submit');
    });

    it('omits Cancel when no handler is given', () => {
        render(<FormActionBar />);
        expect(buttons().map((b) => b.textContent)).toEqual(['Save']);
    });

    it('passes `disabled` through to the submit button only', () => {
        render(<FormActionBar onCancel={() => {}} disabled />);
        expect(buttons()[0].disabled).toBe(false);
        expect(buttons()[1].disabled).toBe(true);
    });

    it('fires the cancel and submit handlers', () => {
        const onCancel = vi.fn();
        const onSubmit = vi.fn();
        render(<FormActionBar onCancel={onCancel} onSubmit={onSubmit} submitType="button" />);

        act(() => buttons()[0].click());
        act(() => buttons()[1].click());

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('renders the danger action FIRST in the DOM and in its own slot', () => {
        const onDanger = vi.fn();
        render(
            <FormActionBar onCancel={() => {}} danger={{ label: 'Delete', onClick: onDanger }} />,
        );

        // Document order puts Delete at the far end of the row, away from Save.
        expect(buttons().map((b) => b.textContent)).toEqual(['Delete', 'Cancel', 'Save']);
        // …and in a different parent from the Cancel/Save pair.
        expect(buttons()[0].parentElement).not.toBe(buttons()[1].parentElement);

        act(() => buttons()[0].click());
        expect(onDanger).toHaveBeenCalledTimes(1);
    });

    it('honours custom labels', () => {
        render(<FormActionBar onCancel={() => {}} cancelLabel="Back" submitLabel="Create word" />);
        expect(buttons().map((b) => b.textContent)).toEqual(['Back', 'Create word']);
    });
});
