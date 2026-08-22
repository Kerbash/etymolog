// @vitest-environment happy-dom
/**
 * TranslatorHome — the states, and the strategy actually reaching the display.
 *
 *  - Before anything is typed the page is an `EmptyState` that says what to do,
 *    not a heading over an empty box.
 *  - The layout strategy the `<select>` reports is the strategy `PhraseDisplay`
 *    RENDERS WITH. `strategy="block"` was hardcoded until Phase 3, which made
 *    six of the eight spelling strategies unreachable from the UI; nothing was
 *    testing that the wiring stays connected.
 *  - A failed translation notifies. It used to land in a bespoke
 *    `div role="alert"` that no other failure in the app used.
 *
 * `PhraseDisplay` is mocked: it mounts a pan/zoom SVG canvas whose viewport
 * hooks need layout, and what is under test is the value handed TO it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as Record<string, unknown>).__ETYMOLOG_ALLOW_UNSANITIZED_SVG__ = true;

vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
);
vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

const RESULT = {
    originalPhrase: 'hello',
    combinedSpelling: [],
    wordTranslations: [],
    hasVirtualGlyphs: false,
};

const translate = vi.fn(() => ({ success: true, data: RESULT }));

/**
 * The context value is a STABLE object, deliberately.
 *
 * A factory that returns fresh `{}` literals per call gives the debounce effect
 * a new `settings.punctuation` identity on every render, so it re-runs, sets
 * `isTranslating` back to true and schedules another translation — forever. The
 * real provider memoises; a mock that does not would be testing a bug it
 * invented.
 */
const CONTEXT_VALUE = {
    api: { phrase: { translate } },
    data: { graphemesComplete: [] },
    settings: { punctuation: {}, writingSystem: {} },
};

vi.mock('../../../../db/context/etymologContext', () => ({
    useEtymolog: () => CONTEXT_VALUE,
}));

/** Records the strategy the display was asked to render with. */
let renderedStrategy: string | null = null;

vi.mock('../_components/PhraseDisplay', () => ({
    default: ({ strategy }: { strategy: string }) => {
        renderedStrategy = strategy;
        return <p data-testid="display">strategy: {strategy}</p>;
    },
}));

const { default: TranslatorHome } = await import('../TranslatorHome');
const { NotificationProvider } = await import('../../../shared/notifications/NotificationProvider');

let container: HTMLDivElement;
let root: Root;

function mount() {
    act(() => {
        root.render(
            <NotificationProvider>
                <TranslatorHome />
            </NotificationProvider>,
        );
    });
}

beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    renderedStrategy = null;
    translate.mockReturnValue({ success: true, data: RESULT });
});

afterEach(() => {
    try {
        act(() => root.unmount());
    } catch {
        /* already unmounted */
    }
    container.parentNode?.removeChild(container);
    vi.useRealTimers();
    vi.clearAllMocks();
});

const text = () => container.textContent ?? '';
const textarea = () => container.querySelector('textarea') as HTMLTextAreaElement;
const strategySelect = () => container.querySelector('select') as HTMLSelectElement;

/**
 * Set a controlled element's value the way a real user event would.
 *
 * A plain `el.value = x` does NOT work on a React-controlled input: React
 * replaces the instance's `value` property with a tracked setter, so assigning
 * through it updates the tracker as well and React concludes nothing changed —
 * `onChange` never fires and the component's state stays put. Writing through
 * the PROTOTYPE setter leaves the tracker stale, which is the signal React uses
 * to decide a change happened.
 */
function setControlledValue(el: HTMLTextAreaElement | HTMLSelectElement, value: string) {
    const prototype =
        el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLSelectElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
}

/** Type a phrase and let the 300 ms debounce fire. */
function typePhrase(value: string) {
    act(() => {
        const el = textarea();
        setControlledValue(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
        vi.advanceTimersByTime(350);
    });
}

describe('TranslatorHome — empty state', () => {
    it('tells the user what to do before anything is typed', () => {
        mount();

        expect(text()).toContain('Type a phrase to see it in your script');
        expect(container.querySelector('[data-testid="display"]')).toBeNull();
        expect(translate).not.toHaveBeenCalled();
    });

    it('returns to the empty state when the phrase is cleared again', () => {
        mount();
        typePhrase('hello');
        expect(container.querySelector('[data-testid="display"]')).not.toBeNull();

        typePhrase('');
        expect(text()).toContain('Type a phrase to see it in your script');
        expect(container.querySelector('[data-testid="display"]')).toBeNull();
    });

    it('treats a whitespace-only phrase as no phrase', () => {
        mount();
        typePhrase('   ');

        expect(translate).not.toHaveBeenCalled();
        expect(text()).toContain('Type a phrase to see it in your script');
    });
});

describe('TranslatorHome — the strategy select drives the display', () => {
    it('starts on the block strategy', () => {
        mount();
        typePhrase('hello');

        expect(renderedStrategy).toBe('block');
    });

    it('changes the strategy PhraseDisplay renders with', () => {
        mount();
        typePhrase('hello');

        act(() => {
            const select = strategySelect();
            setControlledValue(select, 'spiral');
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(renderedStrategy).toBe('spiral');
        expect(text()).toContain('strategy: spiral');
    });

    it('gives the strategy select a real label', () => {
        mount();

        const select = strategySelect();
        const label = container.querySelector(`label[for="${select.id}"]`);
        expect(select.id).not.toBe('');
        expect(label?.textContent).toBe('Layout strategy');
    });
});

describe('TranslatorHome — failure', () => {
    it('notifies when the translation fails, and shows no stale result', () => {
        mount();
        translate.mockReturnValue({
            success: false,
            error: { code: 'UNKNOWN_ERROR', message: 'No graphemes defined' },
        } as never);

        typePhrase('hello');

        expect(text()).toContain('No graphemes defined');
        expect(container.querySelector('[data-testid="display"]')).toBeNull();
    });

    it('drops the previous result rather than leaving it on screen', () => {
        mount();
        typePhrase('hello');
        expect(container.querySelector('[data-testid="display"]')).not.toBeNull();

        translate.mockReturnValue({
            success: false,
            error: { code: 'UNKNOWN_ERROR', message: 'Translation failed' },
        } as never);
        typePhrase('hello there');

        expect(container.querySelector('[data-testid="display"]')).toBeNull();
    });
});
