// @vitest-environment happy-dom
/**
 * CustomChartsPage — the empty state and the delete.
 *
 *  - The empty state used to be the sentence 'No custom charts yet. Click
 *    "Create Chart" to get started.' pointing at a button that lived above it,
 *    between the stats bar and the list — below the fold on a phone. It is an
 *    `EmptyState` WITH the call to action in it now, and the button is also in
 *    the page header where every other primary action is.
 *  - Delete goes through the app-wide confirmation dialog. This was the app's
 *    LAST `window.confirm`: a native dialog that cannot be styled, is announced
 *    differently by every browser, and blocks the JS thread.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';

import { clearDatabase, initDatabase } from '../../../../db/database';
import { settingsApi, resetSettingsForTests } from '../../../../db/api/settingsApi';
import type { CustomChartDefinition } from '../../../../db/api/types';
import CustomChartsPage from '../customCharts/CustomChartsPage';
import { confirmAction, mountHarness, settle, type Harness } from './testHarness';

let harness: Harness | null = null;

const CHART: CustomChartDefinition = {
    id: 'chart-1',
    name: 'Nasals',
    createdAt: '2026-01-01T00:00:00.000Z',
    type: 'basic',
    ipaCharacters: ['m', 'n', 'ŋ'],
};

beforeAll(async () => {
    await initDatabase();
});

beforeEach(() => {
    clearDatabase();
    resetSettingsForTests();
});

afterEach(() => {
    harness?.unmount();
    harness = null;
});

const createButtons = (h: Harness) =>
    Array.from(h.container.querySelectorAll('button, a')).filter((element) =>
        (element.textContent ?? '').includes('Create chart'),
    );

describe('CustomChartsPage — the empty state', () => {
    it('offers the call to action inside the empty state, not only in the header', async () => {
        harness = await mountHarness(<CustomChartsPage />, '/script-maker/custom-charts');

        expect(harness.text()).toContain('No custom charts yet');
        // One in the header, one in the empty state — the empty state must not
        // be a dead end that describes a button somewhere else on the page.
        expect(createButtons(harness).length).toBe(2);
    });

    it('opens the create dialog from the empty state CTA', async () => {
        harness = await mountHarness(<CustomChartsPage />, '/script-maker/custom-charts');

        await act(async () => {
            (createButtons(harness!).at(-1) as HTMLElement).click();
        });
        await settle();

        expect(document.body.textContent).toContain('Choose a chart type');
    });
});

describe('CustomChartsPage — delete', () => {
    it('asks through the app dialog and removes the chart only once confirmed', async () => {
        expect(settingsApi.update({ customCharts: [CHART] }).success).toBe(true);

        harness = await mountHarness(<CustomChartsPage />, '/script-maker/custom-charts');
        expect(harness.text()).toContain('Nasals');

        // The card's delete is an icon button — its NAME is the only thing
        // identifying it, which is the point of naming it.
        const deleteButton = harness.container.querySelector(
            'button[aria-label="Delete Nasals"]',
        ) as HTMLButtonElement | null;
        expect(deleteButton, 'the chart card should offer a delete').not.toBeNull();

        await act(async () => deleteButton!.click());
        await settle();

        expect(document.body.textContent).toContain('Delete chart "Nasals"?');
        // Deleting a LAYOUT must not read as deleting the graphemes on it.
        expect(document.body.textContent).toContain('are NOT deleted');
        expect(settingsApi.get().data?.customCharts).toHaveLength(1);

        await act(async () => confirmAction('cancel')!.click());
        await settle();
        expect(settingsApi.get().data?.customCharts).toHaveLength(1);

        await act(async () =>
            (
                harness!.container.querySelector(
                    'button[aria-label="Delete Nasals"]',
                ) as HTMLButtonElement
            ).click(),
        );
        await settle();
        await act(async () => confirmAction('confirm')!.click());
        await settle();

        expect(settingsApi.get().data?.customCharts).toEqual([]);
    });
});
