// @vitest-environment happy-dom
/**
 * `LexiconFormFields` — the create-mode pronunciation prefill.
 *
 * The editor test proves the query parameter reaches this component; what is
 * proved HERE is what it does with it, and the two halves have to hold at once:
 *
 *  - the DOM input really carries the value, because auto-spell reads the DOM
 *    node (`getSmartFieldValue`) rather than SmartForm's store — without the
 *    post-mount write the field could look filled while "Auto-spell" answered
 *    "Enter a pronunciation first"; and
 *  - the form is NOT marked changed, because `isChanged` is what the leave
 *    guard reads, and a create form that is dirty before anything is typed
 *    asks the user to confirm discarding a word that does not exist.
 *
 * The composite inputs are stubbed: a drawing canvas, a meanings table and an
 * ancestry picker are three components with their own suites, and none of them
 * is part of this contract.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

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

const previewAutoSpelling = vi.fn(() => ({
    success: true,
    data: { success: true, spelling: [], segments: [], unmatchedParts: [], hasVirtualGlyphs: false },
}));

vi.mock('../../../../db', () => ({
    useEtymolog: () => ({
        api: {
            lexicon: {
                previewAutoSpelling,
                wouldCreateCycle: () => ({ success: true, data: false }),
                getAllDescendantIds: () => ({ success: true, data: [] }),
                getAncestryTree: () => ({ success: true, data: null }),
            },
        },
        data: { graphemesComplete: [], lexiconComplete: [] },
        settings: {},
        refresh: vi.fn(),
        isReady: true,
        error: null,
    }),
}));

vi.mock('../../../../db/autoSpellService', () => ({
    buildVirtualGlyphMap: () => new Map(),
}));

/** The three composite inputs, stubbed down to nothing. */
vi.mock('../../customInput/glyphCanvasInput', () => ({
    GlyphCanvasInput: ({ onRequestAutoSpell }: { onRequestAutoSpell?: () => void }) => (
        <button type="button" data-testid="auto-spell" onClick={() => onRequestAutoSpell?.()}>
            Auto-spell
        </button>
    ),
}));
vi.mock('@src/components/form/customInput/glyphCanvasInput', () => ({
    GlyphCanvasInput: ({ onRequestAutoSpell }: { onRequestAutoSpell?: () => void }) => (
        <button type="button" data-testid="auto-spell" onClick={() => onRequestAutoSpell?.()}>
            Auto-spell
        </button>
    ),
}));
vi.mock('../../customInput/meaningTableInput', () => ({
    MeaningTableInput: () => <div data-testid="meanings" />,
}));
vi.mock('../../customInput/ancestryInput', () => ({
    AncestryInput: () => <div data-testid="ancestry" />,
}));

const { LexiconFormFields } = await import('../LexiconFormFields');
const { SmartForm, useSmartForm } = await import('smart-form/smartForm');

let container: HTMLDivElement;
let root: Root;
/** The live form state, captured on every render. */
let formState: Record<string, unknown> = {};

function Host({ prefill, mode = 'create' as const }: { prefill?: string; mode?: 'create' | 'edit' }) {
    const { registerField, registerForm } = useSmartForm({ mode: 'onChange' });
    const formProps = registerForm('testForm', {
        submitFunc: async () => ({ success: true }),
        lockFormOnSubmit: false,
    });
    // In an effect, not during render: assigning to a module-level binding
    // while rendering is a side effect, and React may render twice. No dep
    // array — every render's state should reach the assertions.
    useEffect(() => {
        formState = formProps.formState as unknown as Record<string, unknown>;
    });

    return (
        <SmartForm {...formProps} registerField={registerField}>
            <LexiconFormFields
                registerField={registerField}
                mode={mode}
                initialPronunciation={prefill}
            />
        </SmartForm>
    );
}

function mount(node: React.ReactNode) {
    act(() => {
        root.render(node);
    });
}

async function settle() {
    for (let index = 0; index < 3; index++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }
}

/** The pronunciation input — the only text input the stubbed form renders. */
function pronunciationInput(): HTMLInputElement {
    const input = container.querySelector<HTMLInputElement>('input[type="text"], input:not([type])');
    if (!input) throw new Error('no pronunciation input');
    return input;
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    previewAutoSpelling.mockClear();
});

afterEach(() => {
    try {
        act(() => root.unmount());
    } catch {
        /* already unmounted */
    }
    container.parentNode?.removeChild(container);
});

describe('LexiconFormFields — create-mode prefill', () => {
    it('puts the value in the DOM input', async () => {
        mount(<Host prefill="kato" />);
        await settle();
        expect(pronunciationInput().value).toBe('kato');
    });

    it('does not mark the form changed', async () => {
        mount(<Host prefill="kato" />);
        await settle();
        // The leave guard reads this. A prefill is a suggestion, not an edit.
        expect(formState.isChanged).toBe(false);
    });

    it('makes the form submittable without another keystroke', async () => {
        mount(<Host prefill="kato" />);
        await settle();
        // Pronunciation is a REQUIRED field: seeded properly it validates, and
        // `isSubmittable` (`isValid && !isEmpty`) goes true. A prefill that
        // only painted the DOM would leave the submit button dead under a
        // filled-in form.
        expect(formState.isValid).toBe(true);
        expect(formState.isSubmittable).toBe(true);
    });

    it('lets auto-spell read the value immediately', async () => {
        mount(<Host prefill="kato" />);
        await settle();

        act(() => {
            container.querySelector<HTMLButtonElement>('[data-testid="auto-spell"]')!.click();
        });

        // Auto-spell reads the DOM node, not the store — this is the assertion
        // that `defaultValue` alone would not satisfy.
        expect(previewAutoSpelling).toHaveBeenCalledWith('kato');
    });

    it('becomes changed once the user edits it', async () => {
        mount(<Host prefill="kato" />);
        await settle();

        const input = pronunciationInput();
        act(() => {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value',
            )?.set;
            setter?.call(input, 'katoni');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(formState.isChanged).toBe(true);
    });

    it('leaves the field empty when there is no prefill', async () => {
        mount(<Host />);
        await settle();
        expect(pronunciationInput().value).toBe('');
        expect(formState.isChanged).toBe(false);
        // Required and unfilled: not submittable, which is the whole point of
        // the field being required.
        expect(formState.isSubmittable).toBe(false);
    });

    it('ignores a whitespace-only prefill', async () => {
        mount(<Host prefill="   " />);
        await settle();
        expect(pronunciationInput().value).toBe('');
        expect(formState.isSubmittable).toBe(false);
    });

    it('applies the prefill once, not on every render', async () => {
        mount(<Host prefill="kato" />);
        await settle();

        const input = pronunciationInput();
        act(() => {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value',
            )?.set;
            setter?.call(input, 'sona');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        mount(<Host prefill="kato" />);
        await settle();

        // Re-applying would overwrite what the user typed every time anything
        // above this component re-rendered.
        expect(pronunciationInput().value).toBe('sona');
    });
});
