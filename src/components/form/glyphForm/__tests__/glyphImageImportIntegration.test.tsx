// @vitest-environment happy-dom
/**
 * GlyphFormFields × the image-import control.
 *
 * The contract Phase 2 has to hold end-to-end: importing an image writes the
 * codec's SVG into the `glyphSvg` SmartForm field, so it rides the SAME submit
 * path a drawing takes (`useGlyphSubmit` reads `glyphSvg`, normalises and the
 * api sanitises). What is proved here, with the codec and the canvas stubbed:
 *
 *  - after an import the submit payload's `glyphSvg` is the imported SVG;
 *  - the canvas is replaced by a read-only preview while an import is active;
 *  - "Clear import / draw instead" removes the import and returns the drawer;
 *  - edit-opening a glyph whose stored SVG is an `<image>` import starts in the
 *    preview (so the un-drawable markup is not silently blanked) and does NOT
 *    dirty the form on mount.
 *
 * The real codec (`rasterFileToGlyphSvg`) needs a canvas happy-dom lacks, so it
 * is mocked; its own maths/envelopes are covered in `rasterToGlyphSvg.test.ts`.
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

const IMPORTED_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><mask id="m"><image href="data:image/png;base64,AAAA"/></mask><rect width="64" height="64" fill="currentColor" mask="url(#m)"/></svg>';

const importFileToGlyphSvg = vi.fn(async () => ({ svg: IMPORTED_SVG, mode: 'line-art' as const }));
vi.mock('../../glyphImport/rasterToGlyphSvg', () => ({
    importFileToGlyphSvg,
    // GlyphImageImport also names these from the module; harmless if unused.
    ACCEPTED_RASTER_MIME: ['image/png'],
}));

/** Stub the canvas drawer to a hidden input that binds the field. */
vi.mock('smart-form/input/basic/svgDrawerInput/svgDrawerInput.tsx', () => ({
    default: (props: {
        registerSmartFieldProps: { ref?: React.Ref<HTMLInputElement>; name?: string };
    }) => (
        <input
            type="hidden"
            data-testid="drawer-stub"
            ref={props.registerSmartFieldProps.ref}
            name={props.registerSmartFieldProps.name}
        />
    ),
}));

/** Stub the text input so `glyphName` can be filled deterministically. */
vi.mock('smart-form/input/fancy/redditStyle/labelShiftTextInput/labelShiftTextInput.tsx', () => ({
    default: (props: {
        displayName?: string;
        registerSmartFieldProps: {
            ref?: React.Ref<HTMLInputElement>;
            name?: string;
            onChange?: (e: unknown) => void;
        };
    }) => (
        <input
            type="text"
            aria-label={props.displayName}
            data-fieldname={props.registerSmartFieldProps.name}
            ref={props.registerSmartFieldProps.ref}
            name={props.registerSmartFieldProps.name}
            onChange={props.registerSmartFieldProps.onChange}
        />
    ),
}));

const { default: GlyphFormFields } = await import('../GlyphFormFields');
const { SmartForm, useSmartForm } = await import('smart-form/smartForm');
import type { Glyph } from '../../../../db';

let container: HTMLDivElement;
let root: Root;
const submitted: Array<Record<string, unknown>> = [];
/** The live form state, captured on every render (see pronunciationPrefill). */
let formState: Record<string, unknown> = {};

function Host({ initialData, mode = 'create' }: { initialData?: Glyph | null; mode?: 'create' | 'edit' }) {
    const { registerField, unregisterField, registerForm } = useSmartForm({ mode: 'onChange' });
    const formProps = registerForm('glyphTestForm', {
        submitFunc: async (data: Record<string, unknown>) => {
            submitted.push(data);
            return { success: true };
        },
        lockFormOnSubmit: false,
    });
    useEffect(() => {
        formState = formProps.formState as unknown as Record<string, unknown>;
    });
    return (
        <SmartForm {...formProps} registerField={registerField} unregisterField={unregisterField}>
            <GlyphFormFields registerField={registerField} mode={mode} initialData={initialData} />
            <button type="submit">save</button>
        </SmartForm>
    );
}

function mount(node: React.ReactNode) {
    act(() => {
        root.render(node);
    });
}

async function settle() {
    for (let i = 0; i < 4; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

function fileInput(): HTMLInputElement {
    const el = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!el) throw new Error('no file input');
    return el;
}

async function pickFile() {
    const file = new File(['x'], 'symbol.png', { type: 'image/png' });
    const input = fileInput();
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
}

function setName(value: string) {
    const el = container.querySelector<HTMLInputElement>('input[data-fieldname="glyphName"]');
    if (!el) throw new Error('no name input');
    act(() => {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

async function submit() {
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await Promise.resolve();
    });
    await settle();
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    submitted.length = 0;
    formState = {};
    importFileToGlyphSvg.mockClear();
});

afterEach(() => {
    try {
        act(() => root.unmount());
    } catch {
        /* already unmounted */
    }
    container.remove();
    vi.clearAllMocks();
});

describe('GlyphFormFields — image import wiring', () => {
    it('starts in draw mode with the canvas and the import control', async () => {
        mount(<Host />);
        await settle();
        expect(container.querySelector('[data-testid="drawer-stub"]')).not.toBeNull();
        expect(container.querySelector('input[type="file"]')).not.toBeNull();
    });

    it('writes the imported SVG into glyphSvg and it reaches the submit payload', async () => {
        mount(<Host />);
        await settle();
        setName('star');
        await pickFile();

        // The canvas is gone, a preview is shown.
        expect(container.querySelector('[data-testid="drawer-stub"]')).toBeNull();
        expect(container.querySelector('[role="img"]')).not.toBeNull();

        await submit();
        expect(importFileToGlyphSvg).toHaveBeenCalledOnce();
        expect(submitted).toHaveLength(1);
        expect(submitted[0].glyphSvg).toBe(IMPORTED_SVG);
        expect(submitted[0].glyphName).toBe('star');
    });

    it('clear returns to the drawing canvas', async () => {
        mount(<Host />);
        await settle();
        await pickFile();
        expect(container.querySelector('[data-testid="drawer-stub"]')).toBeNull();

        const clearBtn = [...container.querySelectorAll('button')].find((b) =>
            /clear import/i.test(b.textContent ?? ''),
        );
        expect(clearBtn).toBeTruthy();
        await act(async () => {
            clearBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await settle();
        expect(container.querySelector('[data-testid="drawer-stub"]')).not.toBeNull();
        expect(container.querySelector('[role="img"]')).toBeNull();
    });
});

describe('GlyphFormFields — editing an imported glyph', () => {
    const importedGlyph: Glyph = {
        id: 3,
        name: 'moon',
        category: 'logogram',
        notes: null,
        svg_data: IMPORTED_SVG,
        created_at: '',
        updated_at: '',
    } as unknown as Glyph;

    it('opens directly in the preview (drawer would blank the <image> markup)', async () => {
        mount(<Host mode="edit" initialData={importedGlyph} />);
        await settle();
        expect(container.querySelector('[data-testid="drawer-stub"]')).toBeNull();
        expect(container.querySelector('[role="img"]')).not.toBeNull();
    });

    it('does not dirty the form on mount (isChanged stays false) and re-submits the stored SVG', async () => {
        mount(<Host mode="edit" initialData={importedGlyph} />);
        await settle();
        expect(formState.isChanged).toBe(false);
        await submit();
        expect(submitted[0].glyphSvg).toBe(IMPORTED_SVG);
    });
});
