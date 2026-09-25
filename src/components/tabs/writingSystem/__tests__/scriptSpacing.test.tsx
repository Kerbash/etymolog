// @vitest-environment happy-dom
/**
 * ScriptSpacingSettings + WordSeparationSetting — the two conlang-wide spacing
 * controls (SCRIPT_SPACING_PLAN Phase B §4–5).
 *
 * Asserted here: letter spacing writes the WHOLE `writingSystem` (strict
 * update); word separation derives its mode from `punctuation.wordSeparator`
 * and writes it back whole — Space / Nothing / A glyph, the last only once a
 * grapheme is picked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const update = vi.fn(() => ({ success: true, data: null }));

// ONE stable hook value (P7): a per-call object loops the render and kills the
// worker. Fields are replaced in place between tests.
const hookValue = {
    api: { settings: { update } },
    data: { graphemesComplete: [] as { id: number; name: string }[] },
    settings: {
        writingSystem: { letterSpacing: 'auto' as string },
        punctuation: { wordSeparator: { graphemeId: null as number | null, useNoGlyph: false } },
    },
    isReady: true,
    error: null,
};

vi.mock('../../../../db', () => ({ useEtymolog: () => hookValue }));

const { default: ScriptSpacingSettings } = await import('../ScriptSpacingSettings');
const { NotificationProvider } = await import('../../../shared/notifications/NotificationProvider');

let container: HTMLDivElement;
let root: Root;

function mount() {
    act(() => {
        root.render(
            <NotificationProvider>
                <ScriptSpacingSettings />
            </NotificationProvider>,
        );
    });
}

function setSettings(writingSystem: { letterSpacing: string }, wordSeparator: { graphemeId: number | null; useNoGlyph: boolean }) {
    hookValue.settings.writingSystem = writingSystem;
    hookValue.settings.punctuation = { wordSeparator };
}

const $ = <T extends Element = HTMLElement>(selector: string) => container.querySelector<T>(selector);

async function choose(select: HTMLSelectElement, value: string) {
    await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    setSettings({ letterSpacing: 'auto' }, { graphemeId: null, useNoGlyph: false });
    hookValue.data.graphemesComplete = [];
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

describe('ScriptSpacingSettings — letter spacing', () => {
    it('writes the whole writingSystem with the chosen letterSpacing', async () => {
        mount();
        await choose($<HTMLSelectElement>('[data-letter-spacing]')!, 'wide');
        expect(update).toHaveBeenCalledWith({ writingSystem: { letterSpacing: 'wide' } });
    });

    it('shows the current value', () => {
        setSettings({ letterSpacing: 'tight' }, { graphemeId: null, useNoGlyph: false });
        mount();
        expect($<HTMLSelectElement>('[data-letter-spacing]')!.value).toBe('tight');
    });
});

describe('WordSeparationSetting — mode derivation and writes', () => {
    it('derives Space from the default config', () => {
        mount();
        expect($<HTMLSelectElement>('[data-word-separation]')!.value).toBe('space');
        expect($('[data-word-separator-grapheme]')).toBeNull();
    });

    it('derives Nothing from useNoGlyph', () => {
        setSettings({ letterSpacing: 'auto' }, { graphemeId: null, useNoGlyph: true });
        mount();
        expect($<HTMLSelectElement>('[data-word-separation]')!.value).toBe('nothing');
    });

    it('derives A glyph from an assigned grapheme and lists graphemes by name', () => {
        hookValue.data.graphemesComplete = [{ id: 5, name: 'zed' }, { id: 3, name: 'alef' }];
        setSettings({ letterSpacing: 'auto' }, { graphemeId: 5, useNoGlyph: false });
        mount();
        expect($<HTMLSelectElement>('[data-word-separation]')!.value).toBe('glyph');
        const picker = $<HTMLSelectElement>('[data-word-separator-grapheme]')!;
        expect(picker.value).toBe('5');
        // Sorted by name: alef (3) before zed (5).
        const options = [...picker.querySelectorAll('option')].map((o) => o.textContent);
        expect(options).toEqual(['Select a grapheme…', 'alef', 'zed']);
    });

    it('choosing Space writes a plain virtual space', async () => {
        setSettings({ letterSpacing: 'auto' }, { graphemeId: 5, useNoGlyph: false });
        mount();
        await choose($<HTMLSelectElement>('[data-word-separation]')!, 'space');
        expect(update).toHaveBeenCalledWith({ punctuation: { wordSeparator: { graphemeId: null, useNoGlyph: false } } });
    });

    it('choosing Nothing writes useNoGlyph while keeping the grapheme', async () => {
        setSettings({ letterSpacing: 'auto' }, { graphemeId: 5, useNoGlyph: false });
        mount();
        await choose($<HTMLSelectElement>('[data-word-separation]')!, 'nothing');
        expect(update).toHaveBeenCalledWith({ punctuation: { wordSeparator: { graphemeId: 5, useNoGlyph: true } } });
    });

    it('choosing A glyph with nothing picked writes nothing until a grapheme is chosen', async () => {
        hookValue.data.graphemesComplete = [{ id: 7, name: 'sep' }];
        mount();
        await choose($<HTMLSelectElement>('[data-word-separation]')!, 'glyph');
        // The picker appears, but nothing is stored yet.
        expect(update).not.toHaveBeenCalled();
        expect($('[data-word-separator-grapheme]')).not.toBeNull();

        await choose($<HTMLSelectElement>('[data-word-separator-grapheme]')!, '7');
        expect(update).toHaveBeenCalledWith({ punctuation: { wordSeparator: { graphemeId: 7, useNoGlyph: false } } });
    });
});
