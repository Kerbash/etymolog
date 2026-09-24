// @vitest-environment happy-dom
/**
 * GraphemePickerModal's KIND filter: "Word symbols" (logograms), "Marks" and
 * "All". Real provider stack and database (`testHarness`), real gallery.
 *
 *  - the default is Word symbols when the script has any, else All;
 *    `defaultFilter` may ask for Marks;
 *  - a filter whose list would be empty is hidden (All never is), and an
 *    asked-for empty filter falls back to All;
 *  - each filter shows exactly its kind; a mark is never a word symbol;
 *  - `hideMarks` (the word form's Logogram tab) leaves marks out entirely.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { act } from 'react-dom/test-utils';

import { clearDatabase, initDatabase } from '../../../../db/database';
import { etymologApi } from '../../../../db/api';
import { MARK_CATEGORY, WORD_SYMBOL_CATEGORY } from '../../../../db/wordSymbolService';
import { mountHarness, settle, type Harness } from '../../../tabs/grapheme/__tests__/testHarness';
import GraphemePickerModal, { type GraphemePickerFilter } from '../GraphemePickerModal';

let harness: Harness | null = null;

function makeGrapheme(name: string, category: string | null, phonemes: string[] = []): number {
    const glyphId = etymologApi.glyph.create({ name: `${name}-glyph`, svg_data: '<svg/>' }).data!.id;
    return etymologApi.grapheme.create({
        name,
        category: category ?? undefined,
        glyphs: [{ glyph_id: glyphId, position: 0 }],
        phonemes: phonemes.map((phoneme) => ({ phoneme, use_in_auto_spelling: true })),
    }).data!.id;
}

async function openPicker(props: { defaultFilter?: GraphemePickerFilter; hideMarks?: boolean } = {}) {
    harness = await mountHarness(
        <GraphemePickerModal isOpen setIsOpen={() => {}} onSelect={() => {}} {...props} />,
    );
}

const filterButton = (value: GraphemePickerFilter) =>
    document.body.querySelector<HTMLButtonElement>(`[data-picker-filter="${value}"]`);
const filterLabels = () =>
    [...document.body.querySelectorAll<HTMLButtonElement>('[data-picker-filter]')].map((b) => b.textContent);
const pressed = () =>
    document.body.querySelector<HTMLButtonElement>('[data-picker-filter][aria-pressed="true"]')?.dataset.pickerFilter;
/** Whether a grapheme's name is shown in the grid (the filter bar holds no names). */
const shows = (name: string) => (document.body.textContent ?? '').includes(name);

async function press(value: GraphemePickerFilter) {
    await act(async () => {
        filterButton(value)!.click();
    });
    await settle(2);
}

beforeAll(async () => {
    await initDatabase();
});
beforeEach(() => {
    clearDatabase();
});
afterEach(() => {
    harness?.unmount();
    harness = null;
});

describe('GraphemePickerModal — kind filters', () => {
    it('labels the three filters in plain words and starts on Word symbols', async () => {
        makeGrapheme('Kay', null, ['k']);
        makeGrapheme('Moon', WORD_SYMBOL_CATEGORY);
        makeGrapheme('Halant', MARK_CATEGORY);
        await openPicker();

        expect(filterLabels()).toEqual(['Word symbols (1)', 'Marks (1)', 'All (3)']);
        expect(pressed()).toBe('logograms');
        expect(shows('Moon')).toBe(true);
        expect(shows('Halant')).toBe(false);
        expect(shows('Kay')).toBe(false);

        await press('marks');
        expect(pressed()).toBe('marks');
        expect(shows('Halant')).toBe(true);
        expect(shows('Moon')).toBe(false);

        await press('all');
        expect(shows('Halant') && shows('Moon') && shows('Kay')).toBe(true);
    });

    it('a sound-less mark is a mark, not a word symbol', async () => {
        makeGrapheme('Halant', MARK_CATEGORY);
        makeGrapheme('Dot', null);
        await openPicker();
        expect(filterLabels()).toEqual(['Word symbols (1)', 'Marks (1)', 'All (2)']);
        expect(shows('Dot')).toBe(true);
        expect(shows('Halant')).toBe(false);
    });

    it('defaultFilter may ask for Marks', async () => {
        makeGrapheme('Moon', WORD_SYMBOL_CATEGORY);
        makeGrapheme('Halant', MARK_CATEGORY);
        await openPicker({ defaultFilter: 'marks' });
        expect(pressed()).toBe('marks');
        expect(shows('Halant')).toBe(true);
        expect(shows('Moon')).toBe(false);
    });

    it('hides a filter whose list would be empty; All always shows', async () => {
        makeGrapheme('Kay', null, ['k']);
        await openPicker();
        expect(filterLabels()).toEqual(['All (1)']);
        expect(pressed()).toBe('all');
        expect(shows('Kay')).toBe(true);
    });

    it('only marks: Word symbols is hidden, the default is All', async () => {
        makeGrapheme('Halant', MARK_CATEGORY);
        makeGrapheme('Kay', null, ['k']);
        await openPicker();
        expect(filterLabels()).toEqual(['Marks (1)', 'All (2)']);
        expect(pressed()).toBe('all');
    });

    it('an asked-for filter with nothing in it falls back to All', async () => {
        makeGrapheme('Moon', WORD_SYMBOL_CATEGORY);
        makeGrapheme('Kay', null, ['k']);
        await openPicker({ defaultFilter: 'marks' });
        expect(filterButton('marks')).toBeNull();
        expect(pressed()).toBe('all');
        expect(shows('Moon') && shows('Kay')).toBe(true);
    });

    it('hideMarks (the Logogram tab) leaves marks out of every filter', async () => {
        makeGrapheme('Moon', WORD_SYMBOL_CATEGORY);
        makeGrapheme('Halant', MARK_CATEGORY);
        makeGrapheme('Kay', null, ['k']);
        await openPicker({ hideMarks: true });
        expect(filterLabels()).toEqual(['Word symbols (1)', 'All (2)']);
        expect(shows('Halant')).toBe(false);
        await press('all');
        expect(shows('Moon') && shows('Kay')).toBe(true);
        expect(shows('Halant')).toBe(false);
    });
});
