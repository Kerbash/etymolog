// @vitest-environment happy-dom
/**
 * EntityEditLayout — the shared create/edit skeleton, and the one thing it
 * exists to guarantee: Delete is NOT next to Save.
 *
 * The four Script Maker forms used to render `[Save][Cancel][Delete]` as one
 * tight row, so the irreversible control sat one button-width from the one
 * pressed on every save. `FormActionBar`'s danger slot is a separate flex group
 * pushed to the opposite end of the row; this test pins the ORDER and the
 * separation structurally, because a CSS-only guarantee is one stylesheet edit
 * from being gone.
 *
 * It also pins the two states that used to be bare sentences — a form-shaped
 * skeleton while the database boots, and an `EmptyState` with a way out when
 * the record does not exist.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { Route, Routes } from 'react-router-dom';

import { clearDatabase, initDatabase } from '../../../../db/database';
import { glyphApi } from '../../../../db/api/glyphApi';
import GlyphEditPage from '../editGlyph/GlyphEditPage';
import EntityEditLayout from '../entityEdit/EntityEditLayout';
import { confirmAction, mountHarness, settle, type Harness } from './testHarness';

let harness: Harness | null = null;

beforeAll(async () => {
    await initDatabase();
});

beforeEach(() => {
    clearDatabase();
});

afterEach(() => {
    harness?.unmount();
    harness = null;
    vi.clearAllMocks();
});

const buttons = (h: Harness) =>
    Array.from(h.container.querySelectorAll('button')) as HTMLButtonElement[];

const labels = (h: Harness) => buttons(h).map((b) => (b.textContent ?? '').trim());

describe('EntityEditLayout — the action bar', () => {
    it('renders Cancel and Save, with Delete separated from them', async () => {
        harness = await mountHarness(
            <EntityEditLayout
                title="Edit thing"
                back={{ to: '/back', label: 'Back' }}
                onCancel={() => {}}
                submitLabel="Save changes"
                danger={{ label: 'Delete thing', onClick: () => {} }}
            >
                {(actionBar) => <form>{actionBar}</form>}
            </EntityEditLayout>,
        );

        expect(labels(harness)).toEqual(['Delete thing', 'Cancel', 'Save changes']);

        // Structural, not visual: the danger button and the Cancel/Save pair
        // must be in DIFFERENT wrappers, or "far apart" is one CSS edit from
        // "adjacent".
        const dangerButton = buttons(harness)[0];
        const saveButton = buttons(harness)[2];
        expect(dangerButton.parentElement).not.toBe(saveButton.parentElement);
    });

    it('omits the danger slot entirely when there is nothing to delete', async () => {
        harness = await mountHarness(
            <EntityEditLayout
                title="New thing"
                back={{ to: '/back', label: 'Back' }}
                onCancel={() => {}}
                submitLabel="Create thing"
            >
                {(actionBar) => <form>{actionBar}</form>}
            </EntityEditLayout>,
        );

        expect(labels(harness)).toEqual(['Cancel', 'Create thing']);
    });

    it('disables only the submit button when the form is not submittable', async () => {
        harness = await mountHarness(
            <EntityEditLayout
                title="Edit thing"
                back={{ to: '/back', label: 'Back' }}
                onCancel={() => {}}
                submitLabel="Save changes"
                submitDisabled
                danger={{ label: 'Delete thing', onClick: () => {} }}
            >
                {(actionBar) => <form>{actionBar}</form>}
            </EntityEditLayout>,
        );

        const [danger, cancel, save] = buttons(harness);
        expect(save.disabled).toBe(true);
        expect(cancel.disabled).toBe(false);
        // A form you cannot submit is exactly when you might want to abandon it.
        expect(danger.disabled).toBe(false);
    });

    it('calls onCancel from the Cancel button', async () => {
        const onCancel = vi.fn();
        harness = await mountHarness(
            <EntityEditLayout
                title="Edit thing"
                back={{ to: '/back', label: 'Back' }}
                onCancel={onCancel}
                submitLabel="Save"
            >
                {(actionBar) => <form>{actionBar}</form>}
            </EntityEditLayout>,
        );

        await act(async () => {
            buttons(harness!)[0].click();
        });
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});

describe('EntityEditLayout — the non-form states', () => {
    it('shows a form-shaped skeleton, not the word "Loading", while booting', async () => {
        harness = await mountHarness(
            <EntityEditLayout
                title="Edit thing"
                back={{ to: '/back', label: 'Back' }}
                onCancel={() => {}}
                submitLabel="Save"
                isReady={false}
            >
                {() => <form>never rendered</form>}
            </EntityEditLayout>,
        );

        const status = harness.container.querySelector('[role="status"]');
        expect(status).not.toBeNull();
        expect(harness.text()).not.toContain('never rendered');
        // The header stays up, so the page does not flash empty.
        expect(harness.container.querySelector('h2')?.textContent).toBe('Edit thing');
    });

    it('replaces the form with an EmptyState that has a way out when the record is missing', async () => {
        const onCancel = vi.fn();
        harness = await mountHarness(
            <EntityEditLayout
                title="Edit thing"
                back={{ to: '/back', label: 'Graphemes' }}
                onCancel={onCancel}
                submitLabel="Save"
                fatal={{ title: 'That thing does not exist', description: 'It may have been deleted.' }}
            >
                {() => <form>never rendered</form>}
            </EntityEditLayout>,
        );

        expect(harness.text()).toContain('That thing does not exist');
        expect(harness.text()).not.toContain('never rendered');

        const escape = buttons(harness).find((b) => (b.textContent ?? '').includes('Graphemes'));
        expect(escape, 'a fatal state must offer a way out').toBeDefined();
        await act(async () => escape!.click());
        expect(onCancel).toHaveBeenCalled();
    });
});

describe('GlyphEditPage — delete goes through the confirmation dialog', () => {
    it('deletes nothing until the dialog is confirmed', async () => {
        const glyph = glyphApi.create({ name: 'ka', svg_data: '<svg/>' });
        expect(glyph.success).toBe(true);
        const glyphId = glyph.data!.id;

        harness = await mountHarness(
            <Routes>
                <Route path="/script-maker/glyphs/db/:id" element={<GlyphEditPage />} />
                <Route path="/script-maker/glyphs" element={<p>glyph gallery</p>} />
            </Routes>,
            `/script-maker/glyphs/db/${glyphId}`,
        );

        const deleteButton = buttons(harness).find((b) =>
            (b.textContent ?? '').includes('Delete glyph'),
        );
        expect(deleteButton, 'the edit page should offer a delete').toBeDefined();

        await act(async () => deleteButton!.click());
        await settle();

        // The dialog is up and NOTHING has happened yet.
        expect(confirmAction('confirm')).not.toBeNull();
        expect(glyphApi.getById(glyphId).success).toBe(true);

        await act(async () => confirmAction('cancel')!.click());
        await settle();
        expect(glyphApi.getById(glyphId).success).toBe(true);

        // …and now for real.
        await act(async () => deleteButton!.click());
        await settle();
        await act(async () => confirmAction('confirm')!.click());
        await settle();

        expect(glyphApi.getById(glyphId).success).toBe(false);
    });
});
