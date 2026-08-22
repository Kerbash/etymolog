// @vitest-environment happy-dom
/**
 * How a user REACHES the word generator.
 *
 * Three doors, and all three were missing before Phase 5: the route itself, the
 * secondary action on the lexicon header, and the empty-lexicon state — which
 * named the Script Maker in its copy while linking to neither it nor the
 * generator, the exact dead end an empty state exists to prevent.
 *
 * The suite reuses the generator's harness rather than building a second mock
 * context: the pages under test read the same three context values, and two
 * mocks of one module drift.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../../db', async () => {
    const harness = await import('../generator/__tests__/harness');
    return { useEtymolog: harness.useHarnessEtymolog };
});

const { mount, settle, grapheme, word, resetHarness, state } = await import(
    '../generator/__tests__/harness'
);
type Mounted = import('../generator/__tests__/harness').Mounted;

const { Route, Routes } = await import('react-router-dom');
const { default: LexiconMain } = await import('../main');
const { default: LexiconHome } = await import('../LexiconHome');
const { NotificationProvider } = await import(
    '../../../shared/notifications/NotificationProvider'
);
const { default: ConfirmDialogProvider } = await import(
    '../../../shared/confirmDialog/ConfirmDialogProvider'
);
const { UnsavedChangesRegistry } = await import('../../../shell/unsavedChanges');
const { ROUTES } = await import('../../../../url_mapping');

let view: Mounted;

function open(element: React.ReactNode, path: string): Mounted {
    view = mount(
        <NotificationProvider>
            <ConfirmDialogProvider>
                {/* The word form registers its dirty state with the shell; the
                    generator deliberately does not, which is only observable
                    with the registry actually present. */}
                <UnsavedChangesRegistry>{element}</UnsavedChangesRegistry>
            </ConfirmDialogProvider>
        </NotificationProvider>,
        path,
    );
    return view;
}

/**
 * Mount the tab the way `App.tsx` does — under a splat.
 *
 * `LexiconMain`'s own routes are RELATIVE (`create`, `generate`); mounted
 * without the parent segment they would resolve to `/create` and nothing would
 * match, which is a test artefact rather than a bug.
 */
function openTab(path: string): Mounted {
    return open(
        <Routes>
            <Route path="/lexicon/*" element={<LexiconMain />} />
        </Routes>,
        path,
    );
}

/** Every `href` on the page. */
function links(): string[] {
    return Array.from(view.container.querySelectorAll('a')).map(
        (anchor) => anchor.getAttribute('href') ?? '',
    );
}

beforeEach(() => {
    resetHarness();
});

afterEach(() => {
    view?.unmount();
});

describe('the lexicon route table', () => {
    it('mounts the generator at /lexicon/generate', async () => {
        state.data.graphemesComplete = [grapheme('t'), grapheme('a')];
        openTab(ROUTES.lexiconGenerate);
        await settle();

        expect(view.text()).toContain('Word generator');
    });

    it('still mounts the lexicon index at /lexicon', async () => {
        openTab(ROUTES.lexicon);
        await settle();

        expect(view.text()).toContain('Every word in your language');
        expect(view.text()).not.toContain('Word generator');
    });

    it('still mounts the word form at /lexicon/create', async () => {
        openTab(ROUTES.lexiconCreate);
        await settle();

        expect(view.text()).toContain('New word');
    });

    it('carries a query string through to the generator', async () => {
        state.data.graphemesComplete = [grapheme('t'), grapheme('a')];
        openTab(`${ROUTES.lexiconGenerate}?preset=island`);
        await settle();

        const stored = state.settings.wordGenerator as { profile: { presetId: string } };
        expect(stored.profile.presetId).toBe('island');
    });
});

describe('LexiconHome — the header actions', () => {
    it('offers both New word and Generate words', () => {
        open(<LexiconHome />, ROUTES.lexicon);

        expect(view.text()).toContain('New word');
        expect(view.text()).toContain('Generate words');
        expect(links()).toContain(ROUTES.lexiconCreate);
        expect(links()).toContain(ROUTES.lexiconGenerate);
    });

    it('puts New word last, where the primary action goes', () => {
        open(<LexiconHome />, ROUTES.lexicon);

        const header = view.container.querySelector('header');
        const hrefs = Array.from(header?.querySelectorAll('a') ?? []).map((anchor) =>
            anchor.getAttribute('href'),
        );
        // The generator is the faster way to fill an EMPTY lexicon, but "New
        // word" is what a user who already knows their word is looking for, so
        // it keeps the primary slot at the end of the row.
        expect(hrefs).toEqual([ROUTES.lexiconGenerate, ROUTES.lexiconCreate]);
    });
});

describe('LexiconHome — the empty state', () => {
    it('links to the Script Maker, the generator AND the word form', () => {
        open(<LexiconHome />, ROUTES.lexicon);

        expect(view.text()).toContain('No words yet');
        const hrefs = links();
        expect(hrefs).toContain(ROUTES.scriptMaker);
        expect(hrefs).toContain(ROUTES.lexiconGenerate);
        expect(hrefs).toContain(ROUTES.lexiconCreate);
    });

    it('says what each of them is for', () => {
        open(<LexiconHome />, ROUTES.lexicon);
        const text = view.text();
        expect(text).toContain('Open the Script Maker');
        expect(text).toContain('Generate words');
        expect(text).toContain('Create your first word');
    });

    it('drops the empty state once there are words', () => {
        state.data.lexiconComplete = [word('kata')];
        open(<LexiconHome />, ROUTES.lexicon);

        expect(view.text()).not.toContain('No words yet');
    });
});
