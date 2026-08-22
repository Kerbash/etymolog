// @vitest-environment happy-dom
/**
 * Phase 5 — independent adversarial audit.
 *
 * This suite is not a second copy of the component suites. It attacks the four
 * places where the generator page can lose or corrupt the user's work, and it
 * does so through the WHOLE page rather than through one component, because
 * every one of them is a seam between two pieces that each look correct alone:
 *
 *  1. **The settings round trip.** `api.settings.update` replaces a nested key
 *     wholesale and validates strictly, so every write from this page has to
 *     carry `profile` AND `guidePresetId`, and a refused write has to leave the
 *     user's text on screen instead of silently reverting it. The component
 *     suites assert this for the controls they own; here it is asserted for
 *     EVERY control on the page from one table, so a control added later
 *     without the spread fails a test nobody had to remember to write.
 *  2. **`?preset=`.** The parameter's only producer is the IPA chart's guide
 *     legend, which links with the guide id — and the generator sets the guide
 *     to the profile's own flavour. Following that link therefore normally
 *     arrives with the flavour the profile ALREADY has, and re-applying a
 *     preset overwrites the whole profile. (D1, fixed.)
 *  3. **The batch add.** Two clicks that land in one React batch used to create
 *     every selected word twice. (D2, fixed.)
 *  4. **The prefill.** A create form that arrives dirty asks the user to
 *     confirm discarding a word they never typed.
 *
 * `harness.tsx` supplies a REACTIVE mock of the database context: a settings
 * write really lands and really re-renders, which is the only way a stale-key
 * or lost-update bug is observable at all.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode, useEffect } from 'react';
import { act } from 'react-dom/test-utils';

vi.mock('../../../../../db', async () => {
    const harness = await import('./harness');
    return { useEtymolog: harness.useHarnessEtymolog };
});

/**
 * The generator barrel, with `generateWords` spied.
 *
 * `importOriginal` rather than a hand-written stub: the page feeds the real
 * engine and renders its real output, and what is under test is HOW OFTEN the
 * page asks for a batch and WITH WHAT — a fake engine would answer neither.
 */
vi.mock('../../../../../generator', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
        ...actual,
        generateWords: vi.fn(actual.generateWords as (...args: never[]) => unknown),
    };
});

/** The word form's three composite inputs, stubbed — none is part of this contract. */
vi.mock('../../../../form/customInput/glyphCanvasInput', () => ({
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
vi.mock('../../../../form/customInput/meaningTableInput', () => ({
    MeaningTableInput: () => <div data-testid="meanings" />,
}));
vi.mock('../../../../form/customInput/ancestryInput', () => ({
    AncestryInput: () => <div data-testid="ancestry" />,
}));
vi.mock('../../../../../db/autoSpellService', () => ({ buildVirtualGlyphMap: () => new Map() }));

const {
    mount,
    settle,
    waitForWrite,
    click,
    type: typeInto,
    blur,
    button,
    grapheme,
    word,
    resetHarness,
    state,
    storedProfile,
    storedWordGenerator,
    settingsUpdate,
    lexiconCreate,
    previewAutoSpelling,
    refresh,
    batchMutations,
    notifyHarness,
} = await import('./harness');
type Mounted = import('./harness').Mounted;

const { default: WordGeneratorPage } = await import('../WordGeneratorPage');
const { LexiconFormFields } = await import('../../../../form/lexiconForm/LexiconFormFields');
const { NotificationProvider } = await import(
    '../../../../shared/notifications/NotificationProvider'
);
const { SmartForm, useSmartForm } = await import('smart-form/smartForm');
const generatorBarrel = await import('../../../../../generator');
const { PRESETS, LIMITS } = generatorBarrel;
const generateWordsSpy = generatorBarrel.generateWords as unknown as ReturnType<typeof vi.fn>;

let view: Mounted;

// =============================================================================
// MOUNTING AND QUERYING
// =============================================================================

const SCRIPT = ['t', 'k', 'n', 's', 'a', 'i', 'o'];

function open(path = '/lexicon/generate', options: { strict?: boolean; script?: string[] } = {}) {
    // The script is seeded HERE: `open` is what mounts, so graphemes set after
    // it would be asserted against a page that never saw them.
    state.data.graphemesComplete = (options.script ?? SCRIPT).map((phoneme) => grapheme(phoneme));
    const tree = (
        <NotificationProvider>
            <WordGeneratorPage />
        </NotificationProvider>
    );
    view = mount(options.strict ? <StrictMode>{tree}</StrictMode> : tree, path);
    return view;
}

/** The control a `<label for>` with exactly this text names. */
function labelled<T extends HTMLElement>(text: string): T {
    const label = Array.from(view.container.querySelectorAll('label')).find(
        (element) => (element.textContent ?? '').trim() === text,
    );
    const element = label?.htmlFor
        ? view.container.querySelector<T>(`#${CSS.escape(label.htmlFor)}`)
        : (label?.querySelector<T>('input, select, textarea') ?? null);
    if (!element) throw new Error(`no control labelled "${text}"`);
    return element;
}

function switchNamed(label: string): Element {
    const element = view.container.querySelector(`[role="switch"][aria-label="${label}"]`);
    if (!element) throw new Error(`no switch labelled "${label}"`);
    return element;
}

/** Pick an option the way React hears it. */
function choose(select: HTMLSelectElement, value: string): void {
    act(() => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

/** The chip button for one sound, by the phoneme its accessible name starts with. */
function chip(phoneme: string): HTMLButtonElement {
    const found = Array.from(view.container.querySelectorAll('button')).find((element) =>
        (element.getAttribute('aria-label') ?? '').startsWith(`${phoneme} — `),
    );
    if (!found) throw new Error(`no chip for "${phoneme}"`);
    return found as HTMLButtonElement;
}

function byAriaLabel(text: string): HTMLElement {
    const element = view.container.querySelector<HTMLElement>(`[aria-label="${text}"]`);
    if (!element) throw new Error(`nothing labelled "${text}"`);
    return element;
}

function checkboxes(): HTMLInputElement[] {
    return Array.from(view.container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
}

function addSelectedButton(): HTMLButtonElement {
    const found = Array.from(view.container.querySelectorAll('button')).find((element) =>
        (element.textContent ?? '').startsWith('Add ') &&
        (element.textContent ?? '').endsWith(' selected'),
    );
    if (!found) throw new Error('no "Add N selected" button');
    return found as HTMLButtonElement;
}

/** The single argument of the most recent settings write. */
function lastPatch(): Record<string, unknown> {
    const call = settingsUpdate.mock.calls.at(-1);
    if (!call) throw new Error('no settings write was made');
    return call[0] as Record<string, unknown>;
}

/** The `wordGenerator` value of the most recent write. */
function lastKey(): Record<string, unknown> {
    return lastPatch().wordGenerator as Record<string, unknown>;
}

beforeEach(() => {
    resetHarness();
    generateWordsSpy.mockClear();
});

afterEach(() => {
    view?.unmount();
});

// =============================================================================
// 1 — EVERY WRITE CARRIES THE WHOLE KEY
// =============================================================================

/**
 * One entry per control that persists something.
 *
 * A table rather than a test each: the failure this guards against is not "this
 * control is wrong", it is "the NEXT control will be written without the
 * spread", and a table is the only shape that makes adding a control to the
 * page and forgetting the test impossible to miss in review.
 */
const WRITING_CONTROLS: readonly { name: string; act: () => void }[] = [
    { name: 'choosing a flavour', act: () => click(view.container.querySelectorAll('input[type="radio"]')[0]) },
    { name: 'switching the sound source', act: () => click(switchNamed("Use my script's sounds")) },
    { name: 'cycling a chip tilt', act: () => click(chip('t')) },
    { name: 'quick-adding a shape', act: () => click(button(view.container, 'CVN')) },
    { name: 'removing a shape', act: () => click(byAriaLabel('Remove shape CV')) },
    { name: 'raising the syllable minimum', act: () => choose(labelled('Syllables per word'), '3') },
    { name: 'lowering the syllable maximum', act: () => choose(labelled('Most syllables per word'), '1') },
    { name: 'flipping the sonority rule', act: () => click(switchNamed('Clusters must rise and fall in sonority')) },
    { name: 'flipping the s+stop licence', act: () => click(switchNamed('Allow s + stop at the start of a word')) },
    { name: 'flipping geminates', act: () => click(switchNamed('Allow doubled consonants')) },
    { name: 'flipping vowel harmony', act: () => click(switchNamed('Vowel harmony (front and back)')) },
    { name: 'changing the cluster budget', act: () => choose(labelled('Consonant clusters per word'), '0') },
];

describe('audit — every write carries the whole wordGenerator key', () => {
    for (const control of WRITING_CONTROLS) {
        it(`${control.name} writes profile AND guidePresetId, and nothing else`, async () => {
            open();
            // A guide the user set on the IPA chart. It is not this page's
            // business, and a partial write is exactly how it disappears.
            (storedWordGenerator() as { guidePresetId: string | null }).guidePresetId = 'sinitic';
            await settle();

            control.act();
            await settle();

            expect(Object.keys(lastPatch())).toEqual(['wordGenerator']);
            expect(Object.keys(lastKey()).sort()).toEqual(['guidePresetId', 'profile']);
            // Choosing a flavour is the ONE control that is allowed to move the
            // guide, because a flavour is one idea rather than two settings.
            expect(lastKey().guidePresetId).toBe(
                control.name === 'choosing a flavour' ? PRESETS[0].id : 'sinitic',
            );
        });
    }

    it('a debounced text edit carries the whole key too', async () => {
        open();
        (storedWordGenerator() as { guidePresetId: string | null }).guidePresetId = 'sinitic';
        await settle();

        typeInto(labelled('Never generate'), 'mb nd');
        await waitForWrite();

        expect(Object.keys(lastKey()).sort()).toEqual(['guidePresetId', 'profile']);
        expect(lastKey().guidePresetId).toBe('sinitic');
        expect(storedProfile().forbidden).toEqual(['mb', 'nd']);
    });

    it('a template pattern edit carries the whole key too', async () => {
        open();
        (storedWordGenerator() as { guidePresetId: string | null }).guidePresetId = 'sinitic';
        await settle();

        typeInto(labelled('Shape 1'), 'CVN');
        await waitForWrite();

        expect(lastKey().guidePresetId).toBe('sinitic');
        expect((storedProfile().syllables as { pattern: string }[])[0].pattern).toBe('CVN');
    });

    it('adding a sound carries the whole key too', async () => {
        open();
        (storedWordGenerator() as { guidePresetId: string | null }).guidePresetId = 'sinitic';
        await settle();

        typeInto(labelled('Add a sound'), 'ʃ');
        click(button(view.container, 'Add'));
        await settle();

        expect(lastKey().guidePresetId).toBe('sinitic');
        expect(storedProfile().inventory).toContain('ʃ');
    });

    it('choosing Custom clears the flavour label and leaves the chart guide alone', async () => {
        open();
        await settle();
        // Custom is only reachable from a flavour: on a fresh profile it is
        // already the selected radio and clicking it fires no change at all.
        click(view.container.querySelectorAll('input[type="radio"]')[0]);
        await settle();
        const shapes = JSON.stringify(storedProfile().syllables);

        const radios = view.container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
        click(radios[radios.length - 1]);
        await settle();

        expect(Object.keys(lastKey()).sort()).toEqual(['guidePresetId', 'profile']);
        expect(storedProfile().presetId).toBeNull();
        // "Custom" is a provenance label, not an edit: the profile in front of
        // the user IS their custom one, and the chart keeps its guide.
        expect(JSON.stringify(storedProfile().syllables)).toBe(shapes);
        expect(storedWordGenerator().guidePresetId).toBe(PRESETS[0].id);
    });

    it('removing a forbidden chip carries the whole key too', async () => {
        open();
        typeInto(labelled('Never generate'), 'mb nd');
        await waitForWrite();
        (storedWordGenerator() as { guidePresetId: string | null }).guidePresetId = 'sinitic';

        click(byAriaLabel('Stop forbidding mb'));
        await settle();

        expect(lastKey().guidePresetId).toBe('sinitic');
        expect(storedProfile().forbidden).toEqual(['nd']);
    });
});

describe('audit — the syllable count selects cannot describe an impossible range', () => {
    it('drags the maximum up with a minimum that passes it', async () => {
        open();
        await settle();
        choose(labelled('Syllables per word'), '4');
        await settle();

        const range = storedProfile().syllableCount as { min: number; max: number };
        expect(range.min).toBe(4);
        expect(range.max).toBeGreaterThanOrEqual(4);
    });

    it('drags the minimum down with a maximum below it', async () => {
        open();
        await settle();
        choose(labelled('Syllables per word'), '3');
        await settle();
        choose(labelled('Most syllables per word'), '1');
        await settle();

        const range = storedProfile().syllableCount as { min: number; max: number };
        expect(range.max).toBe(1);
        expect(range.min).toBe(1);
    });

    it('never offers a value the shared limits would reject', () => {
        open();
        const values = Array.from(labelled<HTMLSelectElement>('Syllables per word').options).map(
            (option) => Number(option.value),
        );
        expect(Math.min(...values)).toBe(LIMITS.MIN_SYLLABLE_COUNT);
        expect(Math.max(...values)).toBe(LIMITS.MAX_SYLLABLE_COUNT);
    });
});

// =============================================================================
// 2 — A REFUSED WRITE
// =============================================================================

describe('audit — a settings write the validator refuses', () => {
    it('says so instead of failing silently', async () => {
        open();
        await settle();
        state.rejectSettings = 'Invalid settings: wordGenerator.profile.syllables[0]';

        typeInto(labelled('Shape 1'), 'CVN');
        await waitForWrite();
        await settle();

        expect(view.text()).toContain('Could not save the generator settings');
        expect(view.text()).toContain('wordGenerator.profile.syllables[0]');
    });

    it('leaves the typed text on screen and still editable', async () => {
        open();
        await settle();
        state.rejectSettings = 'nope';

        const input = labelled<HTMLInputElement>('Shape 1');
        typeInto(input, 'CVN');
        await waitForWrite();

        // The draft survives because nothing rewrote the profile; reverting the
        // box to the stored value would look like the page eating the keystroke.
        expect(input.value).toBe('CVN');
        typeInto(input, 'CVNC');
        expect(labelled<HTMLInputElement>('Shape 1').value).toBe('CVNC');
    });

    it('does not retry, and does not queue the patch for the next write', async () => {
        open();
        await settle();
        state.rejectSettings = 'nope';

        typeInto(labelled('Shape 1'), 'CVN');
        await waitForWrite();
        const afterFirst = settingsUpdate.mock.calls.length;
        expect(afterFirst).toBe(1);

        await waitForWrite();
        await settle();
        expect(settingsUpdate.mock.calls.length).toBe(afterFirst);
    });

    it('leaves the stored profile exactly as it was', async () => {
        open();
        await settle();
        const before = JSON.stringify(storedProfile());
        state.rejectSettings = 'nope';

        click(switchNamed('Allow doubled consonants'));
        await settle();

        expect(JSON.stringify(storedProfile())).toBe(before);
    });

    it('accepts the next change once the validator is happy again', async () => {
        open();
        await settle();
        state.rejectSettings = 'nope';
        click(switchNamed('Allow doubled consonants'));
        await settle();

        state.rejectSettings = null;
        click(switchNamed('Allow doubled consonants'));
        await settle();

        expect((storedProfile().clusters as { allowGeminates: boolean }).allowGeminates).toBe(true);
    });
});

// =============================================================================
// 3 — THE DEBOUNCE AND THE DRAFT
// =============================================================================

describe('audit — the debounce and the draft', () => {
    it('shows the parser\'s error and persists nothing for a pattern that does not parse', async () => {
        open();
        await settle();

        const input = labelled<HTMLInputElement>('Shape 1');
        typeInto(input, 'CVX');
        blur(input);
        await waitForWrite();

        expect(view.text()).toContain('position');
        expect(settingsUpdate).not.toHaveBeenCalled();
        expect((storedProfile().syllables as { pattern: string }[])[0].pattern).toBe('CV');
        // And the text stays: replacing it with the last value that parsed
        // would be the page silently undoing the user.
        expect(labelled<HTMLInputElement>('Shape 1').value).toBe('CVX');
    });

    it('flushes a pending edit when the page is left inside the debounce window', async () => {
        open();
        await settle();
        typeInto(labelled('Shape 1'), 'CVN');
        expect(settingsUpdate).not.toHaveBeenCalled();

        view.unmount();
        await settle();

        expect(settingsUpdate).toHaveBeenCalledTimes(1);
        expect((storedProfile().syllables as { pattern: string }[])[0].pattern).toBe('CVN');
    });

    it('lands BOTH rows when two are edited inside one window', async () => {
        open();
        await settle();
        // Two shapes exist on the default profile; each row rewrites the whole
        // `syllables` array, so a patch built from a stale array would revert
        // the other row. The function form is what prevents it.
        typeInto(labelled('Shape 1'), 'CVN');
        typeInto(labelled('Shape 2'), 'CVC');
        await waitForWrite();

        const patterns = (storedProfile().syllables as { pattern: string }[]).map(
            (entry) => entry.pattern,
        );
        expect(patterns[0]).toBe('CVN');
        expect(patterns[1]).toBe('CVC');
        expect(settingsUpdate).toHaveBeenCalledTimes(1);
    });

    it('applies a pending text edit BEFORE an immediate one rather than dropping it', async () => {
        open();
        await settle();
        typeInto(labelled('Never generate'), 'mb');
        click(switchNamed('Allow doubled consonants'));
        await settle();

        expect(storedProfile().forbidden).toEqual(['mb']);
        expect((storedProfile().clusters as { allowGeminates: boolean }).allowGeminates).toBe(true);
        expect(settingsUpdate).toHaveBeenCalledTimes(1);
    });

    it('throws a half-typed pattern away when a flavour replaces the profile under it', async () => {
        open();
        await settle();
        typeInto(labelled('Shape 1'), 'CVX');

        click(view.container.querySelectorAll('input[type="radio"]')[1]);
        await waitForWrite();
        await settle();

        // The draft's epoch is the profile object; a preset replaces it, so the
        // box snaps to the flavour's own first shape rather than showing an
        // error over a profile that says something else entirely.
        expect(labelled<HTMLInputElement>('Shape 1').value).not.toBe('CVX');
        expect(
            (storedProfile().syllables as { pattern: string }[]).some(
                (entry) => entry.pattern === 'CVX',
            ),
        ).toBe(false);
    });

    it('flushes the forbidden box on blur instead of waiting out the window', async () => {
        open();
        await settle();
        const input = labelled<HTMLInputElement>('Never generate');
        typeInto(input, 'mb, nd');
        blur(input);
        await settle();

        expect(storedProfile().forbidden).toEqual(['mb', 'nd']);
    });
});

// =============================================================================
// 4 — ?preset=
// =============================================================================

describe('audit — the ?preset= hand-off from the IPA chart', () => {
    it('applies exactly once under StrictMode, where every effect runs twice', async () => {
        open('/lexicon/generate?preset=island', { strict: true });
        await settle();

        // The app really is wrapped in <StrictMode> (`src/main.tsx`), so a
        // mount-once latch that lives anywhere but a ref would double-write.
        expect(settingsUpdate).toHaveBeenCalledTimes(1);
        expect(storedProfile().presetId).toBe('island');
        expect(storedWordGenerator().guidePresetId).toBe('island');
    });

    it('strips the parameter so a reload does not re-apply it', async () => {
        open('/lexicon/generate?preset=island');
        await settle();
        expect(view.container.querySelectorAll('a[href*="preset="]').length).toBe(0);
        // Nothing writes again once the parameter is gone.
        settingsUpdate.mockClear();
        notifyHarness();
        await settle();
        expect(settingsUpdate).not.toHaveBeenCalled();
    });

    it('ignores an id no flavour matches without writing anything', async () => {
        open('/lexicon/generate?preset=not-a-flavour');
        await settle();
        expect(settingsUpdate).not.toHaveBeenCalled();
        expect(storedProfile().presetId).toBeNull();
    });

    /**
     * D1 — the destructive case.
     *
     * `GuideLegend` links to `${lexiconGenerate}?preset=${preset.id}` with the
     * GUIDE's id, and the generator sets the guide to the profile's own flavour
     * whenever a flavour is chosen. So the normal journey chart → generator
     * arrives carrying the flavour the profile ALREADY has — and applying a
     * preset overwrites the whole profile. Before the fix, a user who picked
     * "Island", spent ten minutes tuning its shapes, went to look at the chart
     * and came back through that link lost every edit with no undo and no
     * notice.
     */
    it('does NOT re-apply a flavour the profile already has', async () => {
        const key = storedWordGenerator() as { profile: Record<string, unknown> };
        key.profile.presetId = 'island';
        key.profile.syllables = [{ pattern: 'CVCC', weight: 9 }];
        key.profile.forbidden = ['mb'];

        open('/lexicon/generate?preset=island');
        await settle();

        expect(settingsUpdate).not.toHaveBeenCalled();
        expect(storedProfile().syllables).toEqual([{ pattern: 'CVCC', weight: 9 }]);
        expect(storedProfile().forbidden).toEqual(['mb']);
    });

    it('still strips the parameter when it changed nothing', async () => {
        (storedWordGenerator() as { profile: Record<string, unknown> }).profile.presetId = 'island';
        open('/lexicon/generate?preset=island');
        await settle();

        // Left in place it would fire the moment anything re-mounted the page.
        expect(view.text()).toContain('Word generator');
        settingsUpdate.mockClear();
        notifyHarness();
        await settle();
        expect(settingsUpdate).not.toHaveBeenCalled();
    });

    it('DOES apply a different flavour over an existing one', async () => {
        const key = storedWordGenerator() as { profile: Record<string, unknown> };
        key.profile.presetId = 'island';

        open('/lexicon/generate?preset=flowing');
        await settle();

        expect(storedProfile().presetId).toBe('flowing');
        expect(storedWordGenerator().guidePresetId).toBe(PRESETS[0].id);
    });
});

// =============================================================================
// 5 — THE BATCH
// =============================================================================

describe('audit — the batch is derived, and derived once', () => {
    it('asks the engine exactly once for a mount', async () => {
        open();
        await settle();
        expect(generateWordsSpy).toHaveBeenCalledTimes(1);
    });

    it('does not ask again when an unrelated context value ticks', async () => {
        open();
        await settle();
        generateWordsSpy.mockClear();

        // The persistence status, a glyph saved elsewhere, an import finishing.
        notifyHarness();
        await settle();
        notifyHarness();
        await settle();

        expect(generateWordsSpy).not.toHaveBeenCalled();
    });

    it('does not ask again when the results selection changes', async () => {
        open();
        await settle();
        generateWordsSpy.mockClear();

        click(checkboxes()[0]);
        await settle();

        expect(generateWordsSpy).not.toHaveBeenCalled();
    });

    it('passes the batch size the header select shows', async () => {
        open();
        await settle();
        choose(labelled('Words'), '10');
        await settle();

        const options = generateWordsSpy.mock.calls.at(-1)?.[2] as { count: number };
        expect(options.count).toBe(10);
    });

    it('passes the lexicon as the dedupe set', async () => {
        state.data.lexiconComplete = [word('ˈka.ta'), word('sona')];
        open();
        await settle();

        const options = generateWordsSpy.mock.calls.at(-1)?.[2] as { existing: Set<string> };
        // Normalised on the way in: the lexicon stores what the user typed and
        // the engine produces bare strings.
        expect(options.existing.has('kata')).toBe(true);
        expect(options.existing.has('sona')).toBe(true);
    });

    it('Regenerate asks with a new seed', async () => {
        open();
        await settle();
        const before = (generateWordsSpy.mock.calls.at(-1)?.[2] as { seed: number }).seed;

        click(button(view.container, 'Regenerate'));
        await settle();

        const after = (generateWordsSpy.mock.calls.at(-1)?.[2] as { seed: number }).seed;
        expect(after).not.toBe(before);
    });

    it('Same seed asks again with the SAME seed', async () => {
        open();
        await settle();
        const before = (generateWordsSpy.mock.calls.at(-1)?.[2] as { seed: number }).seed;
        const calls = generateWordsSpy.mock.calls.length;

        click(button(view.container, 'Same seed'));
        await settle();

        expect(generateWordsSpy.mock.calls.length).toBeGreaterThan(calls);
        expect((generateWordsSpy.mock.calls.at(-1)?.[2] as { seed: number }).seed).toBe(before);
    });

    it('re-rolls the same seed through the new rules when a switch is flipped', async () => {
        open();
        await settle();
        const before = (generateWordsSpy.mock.calls.at(-1)?.[2] as { seed: number }).seed;

        click(switchNamed('Allow doubled consonants'));
        await settle();

        expect((generateWordsSpy.mock.calls.at(-1)?.[2] as { seed: number }).seed).toBe(before);
        expect(generateWordsSpy.mock.calls.length).toBeGreaterThan(1);
    });

    it('surfaces the engine\'s own warnings where the user can read them', async () => {
        // A shape whose required slot has no sound left to fill it: the engine
        // prunes it and says so.
        open('/lexicon/generate', { script: ['a', 'i'] });
        await settle();

        const batch = generateWordsSpy.mock.results.at(-1)?.value as { warnings: string[] };
        expect(batch.warnings.length).toBeGreaterThan(0);
        for (const warning of batch.warnings) expect(view.text()).toContain(warning);
    });

    it('explains a shortfall inline with the reason', async () => {
        open('/lexicon/generate', { script: ['t', 'k'] });
        await settle();

        expect(view.text()).toContain('Fewer words than asked for');
        expect(view.text()).toContain('no vowels');
    });
});

// =============================================================================
// 6 — ADDING TO THE LEXICON
// =============================================================================

/** Select the first N rows and press "Add N selected". */
function addFirst(count: number): string[] {
    const boxes = checkboxes().slice(0, count);
    const ipas = boxes.map((box) => (box.getAttribute('aria-label') ?? '').replace('Select ', ''));
    for (const box of boxes) click(box);
    click(addSelectedButton());
    return ipas;
}

describe('audit — adding selected words', () => {
    it('creates each word once, native and auto-spelt', async () => {
        open();
        await settle();
        const ipas = addFirst(3);
        await settle();

        expect(lexiconCreate).toHaveBeenCalledTimes(3);
        for (const call of lexiconCreate.mock.calls) {
            expect(call[0]).toMatchObject({ is_native: true, auto_spell: true });
        }
        expect(lexiconCreate.mock.calls.map((call) => (call[0] as { pronunciation: string }).pronunciation)).toEqual(ipas);
    });

    it('builds glyph_order from the preview — real graphemes as ids, the rest as IPA', async () => {
        // A preview with one real grapheme and one invented fallback, returned
        // out of order so the `position` sort is the thing under test.
        previewAutoSpelling.mockImplementation((pronunciation: string) => ({
            success: true,
            data: {
                success: true,
                spelling: [
                    { grapheme_id: -2, position: 1, isVirtual: true, ipaCharacter: 'ə' },
                    { grapheme_id: 42, position: 0, isVirtual: false },
                ],
                segments: [pronunciation],
                unmatchedParts: [],
                hasVirtualGlyphs: true,
            },
        }));

        open();
        await settle();
        addFirst(1);
        await settle();

        expect((lexiconCreate.mock.calls[0][0] as { glyph_order: unknown }).glyph_order).toEqual([
            'grapheme-42',
            'ə',
        ]);
        previewAutoSpelling.mockReset();
        previewAutoSpelling.mockImplementation((pronunciation: string) => {
            const spelling = Array.from(pronunciation).map((character, position) => ({
                grapheme_id: -(position + 1),
                position,
                isVirtual: true,
                ipaCharacter: character,
            }));
            return {
                success: true,
                data: { success: true, spelling, segments: [], unmatchedParts: [], hasVirtualGlyphs: true },
            };
        });
    });

    it('refreshes ONCE for the whole batch, not per word', async () => {
        open();
        await settle();
        addFirst(5);
        await settle();

        expect(lexiconCreate).toHaveBeenCalledTimes(5);
        // FIXED in Phase 6 (D4). The loop used to end with its own `refresh()`,
        // which was one full re-read of all three slices — while the context
        // ALSO re-read the lexicon after each of the five creates, so the real
        // count was six. `batchMutations` makes the context coalesce its own
        // refreshes and the hand-rolled one goes away entirely.
        expect(batchMutations).toHaveBeenCalledTimes(1);
        expect(refresh).not.toHaveBeenCalled();
    });

    it('says how many landed in ONE notice', async () => {
        open();
        await settle();
        addFirst(4);
        await settle();

        expect(view.text()).toContain('Added 4 words to the lexicon.');
        expect(view.container.querySelectorAll('[role="status"], [role="alert"]').length).toBeLessThan(3);
    });

    /**
     * D2 — two clicks inside one React batch.
     *
     * A double-click, or a click plus an Enter on a still-focused button, can
     * reach the handler twice before React has re-rendered with the state the
     * first click set. Both calls then see the same `selected` and the same
     * `visible`, and the whole selection is created a second time — duplicate
     * words in the lexicon, from one gesture. The `isAdding` flag could never
     * catch it: it is set and cleared inside one synchronous call, so no render
     * ever observes it as true.
     */
    it('creates nothing twice when the button is hit twice in one tick', async () => {
        open();
        await settle();
        const boxes = checkboxes().slice(0, 2);
        for (const box of boxes) click(box);

        const add = addSelectedButton();
        act(() => {
            add.click();
            add.click();
        });
        await settle();

        expect(lexiconCreate).toHaveBeenCalledTimes(2);
        const created = lexiconCreate.mock.calls.map(
            (call) => (call[0] as { pronunciation: string }).pronunciation,
        );
        expect(new Set(created).size).toBe(2);
    });

    it('takes the added rows out of the list and clears their selection', async () => {
        open();
        await settle();
        const before = checkboxes().length;
        const ipas = addFirst(2);
        await settle();

        expect(checkboxes().length).toBe(before - 2);
        // By the row's own label, not by page text: the display form separates
        // syllables with a dot, so a short word is a substring of half the list.
        const remaining = checkboxes().map((box) => box.getAttribute('aria-label'));
        for (const ipa of ipas) expect(remaining).not.toContain(`Select ${ipa}`);
        expect(addSelectedButton().textContent).toContain('Add 0 selected');
    });

    it('keeps a word that failed and removes the ones that did not', async () => {
        open();
        await settle();
        const ipas = checkboxes()
            .slice(0, 3)
            .map((box) => (box.getAttribute('aria-label') ?? '').replace('Select ', ''));
        state.failCreateFor = new Set([ipas[1]]);

        addFirst(3);
        await settle();

        expect(view.text()).toContain('Added 2 words to the lexicon.');
        const remaining = checkboxes().map((box) => box.getAttribute('aria-label'));
        // Only the failure is still there — and it is still SELECTED, so the
        // next press retries exactly it.
        expect(remaining).toContain(`Select ${ipas[1]}`);
        expect(remaining).not.toContain(`Select ${ipas[0]}`);
        expect(remaining).not.toContain(`Select ${ipas[2]}`);
        expect(addSelectedButton().textContent).toContain('Add 1 selected');
    });

    it('names the failures when the whole selection was refused', async () => {
        open();
        await settle();
        const ipas = checkboxes()
            .slice(0, 2)
            .map((box) => (box.getAttribute('aria-label') ?? '').replace('Select ', ''));
        state.failCreateFor = new Set(ipas);

        addFirst(2);
        await settle();

        // The notice queue shows one at a time, so the warning is only visible
        // when there is no success notice ahead of it — which is exactly the
        // case where the user needs it.
        expect(view.text()).toContain('2 words could not be added');
        for (const ipa of ipas) expect(view.text()).toContain(ipa);
    });

    it('lets a failed word be retried after the cause is gone', async () => {
        open();
        await settle();
        const first = (checkboxes()[0].getAttribute('aria-label') ?? '').replace('Select ', '');
        state.failCreateFor = new Set([first]);

        addFirst(1);
        await settle();
        expect(lexiconCreate).toHaveBeenCalledTimes(1);

        state.failCreateFor = new Set();
        lexiconCreate.mockClear();
        // Still selected: nothing to re-tick, just press again. A guard that
        // remembered the attempt rather than the RESULT would refuse here.
        click(addSelectedButton());
        await settle();

        expect((lexiconCreate.mock.calls[0][0] as { pronunciation: string }).pronunciation).toBe(first);
        expect(checkboxes().map((box) => box.getAttribute('aria-label'))).not.toContain(
            `Select ${first}`,
        );
    });

    it('does nothing at all when nothing is selected', async () => {
        open();
        await settle();
        expect(addSelectedButton().disabled).toBe(true);
        click(addSelectedButton());
        await settle();

        expect(lexiconCreate).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
    });
});

describe('audit — words the lexicon already has', () => {
    /**
     * FINDING (D3) — FIXED in Phase 6 by DELETING the pill.
     *
     * The "already in lexicon" pill was unreachable. The same normalised set is
     * BOTH the engine's dedupe input and the pill's predicate:
     * `useGeneratorProfile` builds it with `normalizePronunciation`,
     * `generateWords` rejects any candidate whose normalised form is in it
     * (`engine/generate.ts` `reject('duplicate')`), and the row then asked
     * `existing.has(normalizePronunciation(word.ipa))` — which cannot be true of
     * a word that survived the engine. A lexicon that changes under the page
     * changes the set's identity, so the batch is re-derived with the new word
     * excluded rather than left standing with a pill on it.
     *
     * Of the two ways to make it mean something (drop `existing` from the
     * engine call, or drop the pill) the product answer was the pill: silently
     * not offering a word you already have is better than offering it with a
     * label. The engine dedupe stays, and what is pinned here is the guarantee
     * the user actually gets.
     */
    it('never offers a word the lexicon already has', async () => {
        open();
        await settle();
        const shown = checkboxes().map((box) =>
            (box.getAttribute('aria-label') ?? '').replace('Select ', ''),
        );
        // Store the first one back, stress-marked and spaced, the way a user
        // types it — the normalisation is what makes this the same word.
        state.data.lexiconComplete = [word(`ˈ${shown[0]}`)];
        act(() => {
            state.data = { ...state.data };
            notifyHarness();
        });
        await settle();

        const after = checkboxes().map((box) =>
            (box.getAttribute('aria-label') ?? '').replace('Select ', ''),
        );
        expect(after).not.toContain(shown[0]);
    });

    it('treats ɡ and g as the same sound when comparing', async () => {
        open('/lexicon/generate', { script: ['g', 'a'] });
        await settle();
        const shown = (checkboxes()[0].getAttribute('aria-label') ?? '').replace('Select ', '');
        expect(shown).toContain('g');

        state.data.lexiconComplete = [word(shown.replace(/g/g, 'ɡ'))];
        act(() => {
            state.data = { ...state.data };
            notifyHarness();
        });
        await settle();

        const after = checkboxes().map((box) =>
            (box.getAttribute('aria-label') ?? '').replace('Select ', ''),
        );
        expect(after).not.toContain(shown);
    });

    it('offers its words normally against a lexicon that shares none of them', async () => {
        state.data.lexiconComplete = [word('qqqqqq')];
        open();
        await settle();
        expect(checkboxes().length).toBeGreaterThan(0);
        // No leftover pill wording anywhere on the row.
        expect(view.text()).not.toContain('already in lexicon');
    });
});

// =============================================================================
// 7 — COPY, WITH AND WITHOUT A CLIPBOARD
// =============================================================================

describe('audit — copying', () => {
    it('warns rather than throwing when the browser will not give one', async () => {
        // happy-dom DOES define `navigator.clipboard`; the browsers that do not
        // are plain http, embedded webviews and old builds, and an unguarded
        // call there throws inside the click handler and takes the page down.
        Object.defineProperty(globalThis.navigator, 'clipboard', {
            value: undefined,
            configurable: true,
        });
        try {
            open();
            await settle();
            const copy = Array.from(view.container.querySelectorAll('button')).find(
                (element) => (element.getAttribute('aria-label') ?? '').startsWith('Copy '),
            );
            expect(copy).toBeDefined();
            expect(() => click(copy)).not.toThrow();
            await settle();
            expect(view.text()).toContain('Could not copy');
        } finally {
            Reflect.deleteProperty(globalThis.navigator, 'clipboard');
        }
    });

    it('copies every visible word, one per line, when there is one', async () => {
        const writeText = vi.fn((_text: string) => Promise.resolve());
        Object.defineProperty(globalThis.navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        });
        try {
            open();
            await settle();
            click(button(view.container, 'Copy all'));
            await settle();

            const text = writeText.mock.calls[0][0];
            expect(text.split('\n').length).toBe(checkboxes().length);
        } finally {
            Reflect.deleteProperty(globalThis.navigator, 'clipboard');
        }
    });
});

// =============================================================================
// 8 — ACCESSIBILITY
// =============================================================================

/** The accessible name of a form control, by the three routes this page uses. */
function accessibleName(control: Element): string {
    const aria = control.getAttribute('aria-label');
    if (aria) return aria.trim();
    const describedBy = control.getAttribute('aria-labelledby');
    if (describedBy) {
        return describedBy
            .split(/\s+/)
            .map((id) => view.container.querySelector(`[id="${CSS.escape(id)}"]`)?.textContent ?? '')
            .join(' ')
            .trim();
    }
    const id = control.getAttribute('id');
    if (id) {
        const label = view.container.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label) return (label.textContent ?? '').trim();
    }
    return (control.closest('label')?.textContent ?? '').trim();
}

describe('audit — accessibility', () => {
    it('gives every form control on the page a name', async () => {
        open();
        await settle();

        const unnamed = Array.from(view.container.querySelectorAll('input, select, textarea'))
            .filter((control) => accessibleName(control).length === 0)
            .map((control) => control.outerHTML.slice(0, 120));
        expect(unnamed).toEqual([]);
    });

    it('makes the flavour cards ONE native radio group', async () => {
        open();
        await settle();

        const radios = Array.from(
            view.container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
        );
        expect(radios.length).toBeGreaterThan(1);
        expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
        // Exactly one is checked, always — a group with nothing checked reads
        // as broken rather than as "no flavour", which is why Custom is real.
        expect(radios.filter((radio) => radio.checked).length).toBe(1);
    });

    it('gives the tilt glyph a name in words, not just a mark', async () => {
        open();
        await settle();
        const button = chip('t');

        expect(button.getAttribute('aria-label')).toBe('t — normal, in your script');
        click(button);
        await settle();
        expect(chip('t').getAttribute('aria-label')).toBe('t — common, in your script');
        // The glyph itself is decoration and must not be read twice.
        expect(button.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    });

    it('names every result row\'s checkbox with the word it selects', async () => {
        open();
        await settle();

        for (const box of checkboxes()) {
            expect(box.getAttribute('aria-label')).toMatch(/^Select .+/);
        }
    });

    it('puts the section headings under the page heading, not beside it', async () => {
        open();
        await settle();
        const levels = Array.from(view.container.querySelectorAll('h2')).map((heading) =>
            heading.getAttribute('aria-level'),
        );
        expect(levels.filter((level) => level === '3').length).toBe(5);
    });

    it('points an invalid shape row at the message that explains it', async () => {
        open();
        await settle();
        const input = labelled<HTMLInputElement>('Shape 1');
        typeInto(input, 'CVX');
        await settle();

        expect(input.getAttribute('aria-invalid')).toBe('true');
        const messageId = input.getAttribute('aria-describedby');
        expect(messageId).toBeTruthy();
        expect(
            view.container.querySelector(`[id="${CSS.escape(messageId!)}"]`)?.textContent ?? '',
        ).toContain('position');
    });
});

// =============================================================================
// 9 — THE PRONUNCIATION PREFILL
// =============================================================================

/**
 * The word form's fields, hosted in a bare SmartForm.
 *
 * The editor's own suite proves the query parameter REACHES the fields; what is
 * proved here is the half that only shows up in the real app: the prefill has
 * to survive StrictMode's double mount, and it has to be text rather than
 * markup no matter what the URL carried.
 */
let formState: Record<string, unknown> = {};

function PrefillHost({ prefill, mode = 'create' }: { prefill?: string; mode?: 'create' | 'edit' }) {
    const { registerField, registerForm } = useSmartForm({ mode: 'onChange' });
    const formProps = registerForm('auditForm', {
        submitFunc: async () => ({ success: true }),
        lockFormOnSubmit: false,
    });
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

function openForm(prefill?: string, options: { strict?: boolean; mode?: 'create' | 'edit' } = {}) {
    const tree = <PrefillHost prefill={prefill} mode={options.mode} />;
    view = mount(options.strict ? <StrictMode>{tree}</StrictMode> : tree, '/lexicon/create');
    return view;
}

function pronunciationInput(): HTMLInputElement {
    const input = view.container.querySelector<HTMLInputElement>(
        'input[type="text"], input:not([type])',
    );
    if (!input) throw new Error('no pronunciation input');
    return input;
}

describe('audit — the pronunciation prefill', () => {
    it('survives StrictMode\'s double mount', async () => {
        // `src/main.tsx` really does wrap the app in <StrictMode>, so a prefill
        // that only lands on a single effect pass is a prefill that is missing
        // in development and present in production.
        openForm('kato', { strict: true });
        await settle(3);

        expect(pronunciationInput().value).toBe('kato');
        expect(formState.isChanged).toBe(false);
        expect(formState.isSubmittable).toBe(true);
    });

    it('lets auto-spell read it from the DOM immediately, under StrictMode', async () => {
        openForm('kato', { strict: true });
        await settle(3);
        click(view.container.querySelector('[data-testid="auto-spell"]'));

        expect(previewAutoSpelling).toHaveBeenCalledWith('kato');
    });

    it('carries a stressed, spaced pronunciation through the URL round trip', async () => {
        const raw = 'ˈka ta';
        const roundTripped = new URLSearchParams(
            `pronunciation=${encodeURIComponent(raw)}`,
        ).get('pronunciation');
        expect(roundTripped).toBe(raw);

        openForm(roundTripped ?? undefined);
        await settle(3);
        expect(pronunciationInput().value).toBe(raw);
        expect(formState.isChanged).toBe(false);
    });

    it('carries a long vowel and a tie bar through unchanged', async () => {
        const raw = 'kaːt͡ʃo';
        const roundTripped = new URLSearchParams(
            `pronunciation=${encodeURIComponent(raw)}`,
        ).get('pronunciation');

        openForm(roundTripped ?? undefined);
        await settle(3);
        expect(pronunciationInput().value).toBe(raw);
    });

    it('treats a markup-shaped value as text and nothing else', async () => {
        const raw = '<img src=x onerror=alert(1)>';
        openForm(raw);
        await settle(3);

        expect(pronunciationInput().value).toBe(raw);
        expect(view.container.querySelectorAll('img').length).toBe(0);
    });

    it('ignores the prefill entirely in edit mode', async () => {
        openForm('kato', { mode: 'edit' });
        await settle(3);
        // The stored word owns the field there; a query string must not be able
        // to rewrite a word being edited.
        expect(pronunciationInput().value).toBe('');
    });

    it('leaves an empty form empty and unsubmittable', async () => {
        openForm(undefined);
        await settle(3);
        expect(pronunciationInput().value).toBe('');
        expect(formState.isSubmittable).toBe(false);
        expect(formState.isChanged).toBe(false);
    });
});

// =============================================================================
// 10 — LINKS OUT
// =============================================================================

describe('audit — the way out of a generated word', () => {
    it('links every row to the word form with its pronunciation encoded', async () => {
        open();
        await settle();

        const ipas = checkboxes().map((box) =>
            (box.getAttribute('aria-label') ?? '').replace('Select ', ''),
        );
        const hrefs = Array.from(view.container.querySelectorAll('a'))
            .map((anchor) => anchor.getAttribute('href') ?? '')
            .filter((href) => href.includes('pronunciation='));

        expect(hrefs.length).toBe(ipas.length);
        for (const [index, href] of hrefs.entries()) {
            expect(href).toBe(`/lexicon/create?pronunciation=${encodeURIComponent(ipas[index])}`);
            // What the router will hand back has to be the word itself.
            expect(new URLSearchParams(href.split('?')[1]).get('pronunciation')).toBe(ipas[index]);
        }
    });

    it('offers both ways out when there is nothing to build from', async () => {
        open('/lexicon/generate', { script: [] });
        await settle();

        expect(view.text()).toContain('No sounds yet');
        const hrefs = Array.from(view.container.querySelectorAll('a')).map((anchor) =>
            anchor.getAttribute('href'),
        );
        expect(hrefs).toContain('/script-maker');
        expect(button(view.container, 'Pick a flavour')).toBeDefined();
    });
});
