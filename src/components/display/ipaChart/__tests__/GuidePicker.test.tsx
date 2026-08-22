// @vitest-environment happy-dom
/**
 * GuidePicker — the control that turns a flavour on.
 *
 * The one thing that MUST be right here is the shape of the write.
 * `api.settings.update` is strict and takes nested keys wholesale, so sending
 * `{ wordGenerator: { guidePresetId } }` without spreading the rest of the key
 * silently resets the user's entire generator profile — inventory, templates,
 * constraints — to defaults, with no error and no visible symptom until they
 * next open the generator. That is asserted twice: once on the arguments, and
 * once by checking the profile survives the round trip.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';

import { cloneDefaultWordGeneratorSettings, PRESETS } from '../../../../generator';
import type { WordGeneratorSettings } from '../../../../generator';
import { GUIDE_PICKER_LABEL, NO_GUIDE_LABEL, NO_GUIDE_VALUE } from '../guideTiers';
import { mount, type Mounted } from './harness';

const update = vi.fn(() => ({ success: true, data: null }));

/** Mutable so each test can boot the picker with a different stored guide. */
let wordGenerator: WordGeneratorSettings | undefined = cloneDefaultWordGeneratorSettings();

vi.mock('../../../../db', () => ({
    useEtymolog: () => ({
        api: { settings: { update } },
        data: { lexiconComplete: [], graphemesComplete: [] },
        settings: { conlangName: 'Test', wordGenerator },
        refresh: vi.fn(),
        isReady: true,
        error: null,
    }),
}));

const { default: GuidePicker } = await import('../GuidePicker');
const { NotificationProvider } = await import('../../../shared/notifications/NotificationProvider');

let view: Mounted | null = null;

beforeEach(() => {
    update.mockClear();
    wordGenerator = cloneDefaultWordGeneratorSettings();
});

afterEach(() => {
    view?.unmount();
    view = null;
});

const render = () => {
    view = mount(
        <NotificationProvider>
            <GuidePicker />
        </NotificationProvider>,
    );
    return view.container.querySelector('select') as HTMLSelectElement;
};

/** Fire a real `change` on the select, the way a user's pick arrives. */
function choose(select: HTMLSelectElement, value: string): void {
    act(() => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

describe('GuidePicker — the options', () => {
    it('offers "No guide" plus every preset, in registry order', () => {
        const select = render();
        const options = Array.from(select.options).map((option) => option.value);

        expect(options).toEqual([NO_GUIDE_VALUE, ...PRESETS.map((preset) => preset.id)]);
    });

    it('shows each preset by its display name', () => {
        const select = render();
        const labels = Array.from(select.options).map((option) => option.textContent);

        expect(labels[0]).toBe(NO_GUIDE_LABEL);
        for (const preset of PRESETS) {
            expect(labels).toContain(preset.name);
        }
    });

    it('is labelled, visibly and accessibly', () => {
        const select = render();
        const label = view!.container.querySelector('label');

        expect(select.getAttribute('aria-label')).toBe(GUIDE_PICKER_LABEL);
        expect(label?.textContent).toBe(GUIDE_PICKER_LABEL);
        expect(label?.getAttribute('for')).toBe(select.id);
        expect(select.id.length).toBeGreaterThan(0);
    });
});

describe('GuidePicker — reading the stored value', () => {
    it('selects "No guide" when nothing is stored', () => {
        expect(render().value).toBe(NO_GUIDE_VALUE);
    });

    it('is controlled by settings, with no local state', () => {
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'guttural' };

        expect(render().value).toBe('guttural');
    });

    it('falls back to "No guide" for a stored id no preset matches', () => {
        // `guidePresetId` is validated as "any non-empty string" (checking it
        // against the registry would make the profile validator import the
        // presets). A `<select>` with an unmatched value renders EMPTY, which
        // reads as a broken control rather than as "nothing is painted".
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'atlantean' };

        expect(render().value).toBe(NO_GUIDE_VALUE);
    });

    it('survives a settings object with no wordGenerator key at all', () => {
        // Settings stored by a build older than Phase 2. The validator treats
        // an absent key as absent rather than invalid, so the reactive copy can
        // legitimately arrive without it.
        wordGenerator = undefined;

        expect(() => render()).not.toThrow();
        expect(view!.container.querySelector('select')!.value).toBe(NO_GUIDE_VALUE);
    });
});

describe('GuidePicker — writing', () => {
    it('sends the FULL nested wordGenerator object, not just the id', () => {
        const stored = cloneDefaultWordGeneratorSettings();
        stored.profile.inventory = ['k', 'a', 'n'];
        stored.profile.presetId = 'island';
        wordGenerator = stored;

        choose(render(), 'flowing');

        expect(update).toHaveBeenCalledTimes(1);
        const [payload] = update.mock.calls[0] as unknown as [
            { wordGenerator: WordGeneratorSettings },
        ];
        expect(payload.wordGenerator.guidePresetId).toBe('flowing');
        // The profile rode along untouched — this is the assertion that stands
        // between a flavour pick and a wiped generator profile.
        expect(payload.wordGenerator.profile.inventory).toEqual(['k', 'a', 'n']);
        expect(payload.wordGenerator.profile.presetId).toBe('island');
        expect(Object.keys(payload.wordGenerator).sort()).toEqual(['guidePresetId', 'profile']);
    });

    it('writes null when the user picks "No guide"', () => {
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'slavic' };

        choose(render(), NO_GUIDE_VALUE);

        const [payload] = update.mock.calls[0] as unknown as [
            { wordGenerator: WordGeneratorSettings },
        ];
        expect(payload.wordGenerator.guidePresetId).toBeNull();
    });

    it('does not write when the value has not changed', () => {
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'romance' };

        choose(render(), 'romance');

        expect(update).not.toHaveBeenCalled();
    });

    it('says nothing on success', async () => {
        // Silent on purpose: this control repaints the chart it sits above, and
        // the repaint is the feedback. A toast per pick would be noise.
        choose(render(), 'japanese');
        await act(async () => {
            await Promise.resolve();
        });

        expect(view!.text()).not.toContain('saved');
        expect(document.body.textContent).not.toContain('saved');
    });

    it('reports a refused write, which is the case with no visible symptom', async () => {
        update.mockReturnValueOnce({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'nope' },
        } as unknown as ReturnType<typeof update>);

        choose(render(), 'sinitic');
        await act(async () => {
            await Promise.resolve();
        });

        expect(document.body.textContent).toContain('nope');
    });
});
