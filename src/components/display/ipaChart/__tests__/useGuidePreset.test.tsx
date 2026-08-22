// @vitest-environment happy-dom
/**
 * useGuidePreset — the one derivation both chart pages share.
 *
 * Two contracts worth pinning beyond "it returns the preset":
 *
 *  - a STALE id resolves to no guide rather than to a crash. `guidePresetId` is
 *    validated as any non-empty string (validating it against the registry
 *    would make the profile validator import the presets, which import the
 *    profile), so an id nothing matches is a state the app can genuinely be in.
 *  - the derived values keep their IDENTITY across a re-render that changes
 *    nothing. `GuideLegend` memoises its coverage on `phonemes`, and a fresh
 *    array every render would recompute the whole thing on every keystroke
 *    anywhere in the tree.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { cloneDefaultWordGeneratorSettings, getPreset } from '../../../../generator';
import type { GuidePresetState } from '../useGuidePreset';
import type { WordGeneratorSettings } from '../../../../generator';
import type { GraphemeComplete } from '../../../../db/types';
import { mount, type Mounted } from './harness';

let wordGenerator: WordGeneratorSettings | undefined = cloneDefaultWordGeneratorSettings();

vi.mock('../../../../db', () => ({
    useEtymolog: () => ({
        api: {},
        data: { lexiconComplete: [], graphemesComplete: [] },
        settings: { conlangName: 'Test', wordGenerator },
        refresh: vi.fn(),
        isReady: true,
        error: null,
    }),
}));

const { useGuidePreset } = await import('../useGuidePreset');

const FLOWING = getPreset('flowing')!;

const PHONEMES = new Map<string, GraphemeComplete>([
    ['l', {} as GraphemeComplete],
    ['n', {} as GraphemeComplete],
    ['a', {} as GraphemeComplete],
]);

let view: Mounted | null = null;
let seen: GuidePresetState[] = [];

function Probe({ map }: { map: Map<string, GraphemeComplete> }) {
    const state = useGuidePreset(map);
    seen.push(state);
    return <span>{state.preset?.name ?? 'none'}</span>;
}

beforeEach(() => {
    seen = [];
    wordGenerator = cloneDefaultWordGeneratorSettings();
});

afterEach(() => {
    view?.unmount();
    view = null;
});

describe('useGuidePreset', () => {
    it('returns no guide when nothing is chosen', () => {
        view = mount(<Probe map={PHONEMES} />);
        const state = seen.at(-1)!;

        expect(state.preset).toBeNull();
        expect(state.guide).toBeNull();
        expect(state.guideLabel).toBeUndefined();
        expect(state.coverage).toBeNull();
        expect(state.coreFact).toBeNull();
    });

    it('resolves the chosen preset and its chart map', () => {
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'flowing' };
        view = mount(<Probe map={PHONEMES} />);
        const state = seen.at(-1)!;

        expect(state.preset?.id).toBe('flowing');
        expect(state.guideLabel).toBe(FLOWING.name);
        expect(state.guide!.get('l')).toBe('core');
        expect(state.guide!.size).toBeGreaterThan(0);
    });

    it('counts the script against the preset in "n / total" form', () => {
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'flowing' };
        view = mount(<Probe map={PHONEMES} />);
        const state = seen.at(-1)!;
        const total = state.coverage!.core.present.length + state.coverage!.core.missing.length;

        expect(state.coreFact).toBe(`${state.coverage!.core.present.length} / ${total}`);
        expect(state.coverage!.core.present.length).toBeGreaterThan(0);
    });

    it('treats an id no preset matches as no guide, and says which id it was', () => {
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'atlantean' };
        view = mount(<Probe map={PHONEMES} />);
        const state = seen.at(-1)!;

        expect(state.presetId).toBe('atlantean');
        expect(state.preset).toBeNull();
        expect(state.guide).toBeNull();
    });

    it('survives settings stored before the wordGenerator key existed', () => {
        wordGenerator = undefined;

        expect(() => {
            view = mount(<Probe map={PHONEMES} />);
        }).not.toThrow();
        expect(seen.at(-1)!.presetId).toBeNull();
    });

    it('keeps the derived values stable across an idle re-render', () => {
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'flowing' };
        view = mount(<Probe map={PHONEMES} />);
        view.rerender(<Probe map={PHONEMES} />);

        expect(seen.length).toBeGreaterThan(1);
        const [first, last] = [seen[0], seen.at(-1)!];
        expect(last.phonemes).toBe(first.phonemes);
        expect(last.guide).toBe(first.guide);
        expect(last.coverage).toBe(first.coverage);
    });

    it('recomputes when the script changes', () => {
        wordGenerator = { ...cloneDefaultWordGeneratorSettings(), guidePresetId: 'flowing' };
        view = mount(<Probe map={PHONEMES} />);
        const before = seen.at(-1)!.coverage!.core.present.length;

        const bigger = new Map(PHONEMES);
        bigger.set(FLOWING.sounds.core.find((s) => !PHONEMES.has(s))!, {} as GraphemeComplete);
        view.rerender(<Probe map={bigger} />);

        expect(seen.at(-1)!.coverage!.core.present.length).toBe(before + 1);
    });
});
