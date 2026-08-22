// @vitest-environment happy-dom
/**
 * GlyphPickerModal — "Select existing glyph", which shipped as a `disabled`
 * button labelled "(coming soon)".
 *
 * Three properties, in order of how much damage their absence did:
 *
 *  1. **`onSelect` fires ONCE.** `EntityGallery` deliberately does not forward
 *     `onItemActivate` to `DataGallery`, because the gridcell wrapper's own
 *     click handler fires it too — a card that is itself a `<button>` plus a
 *     forwarded handler adds the glyph TWICE per click. That is a one-line
 *     regression away at all times, so it is asserted here rather than trusted.
 *  2. **No nested interactive elements.** The card body is display-only; the
 *     `<button>` is the card's single hit area.
 *  3. Search filters, and glyphs already on the grapheme are not offered again.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react-dom/test-utils';

import { clearDatabase, initDatabase } from '../../../../db/database';
import { glyphApi } from '../../../../db/api/glyphApi';
import type { Glyph } from '../../../../db';
import GlyphPickerModal from '../../../form/graphemeForm/GlyphPickerModal';
import { mountHarness, settle, type Harness } from './testHarness';

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

function seedGlyphs(): Record<string, number> {
    const ids: Record<string, number> = {};
    for (const name of ['alpha', 'beta', 'gamma']) {
        const result = glyphApi.create({ name, svg_data: '<svg/>', category: 'letters' });
        expect(result.success).toBe(true);
        ids[name] = result.data!.id;
    }
    return ids;
}

/** The modal portals onto `document.body`, so cards are searched there. */
const cardButtons = () =>
    Array.from(document.body.querySelectorAll('button[aria-label^="Add glyph"]')) as HTMLButtonElement[];

const searchInput = () =>
    document.body.querySelector('input[type="search"], input[type="text"]') as HTMLInputElement | null;

async function open(onSelect: (glyph: Glyph) => void, excludeIds: number[] = []) {
    harness = await mountHarness(
        <GlyphPickerModal
            isOpen
            setIsOpen={() => {}}
            onSelect={onSelect}
            excludeIds={excludeIds}
        />,
    );
    await settle();
}

describe('GlyphPickerModal', () => {
    it('lists every glyph as a single button', async () => {
        seedGlyphs();
        await open(vi.fn());

        expect(cardButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
            'Add glyph alpha',
            'Add glyph beta',
            'Add glyph gamma',
        ]);
    });

    it('calls onSelect exactly ONCE per click', async () => {
        seedGlyphs();
        const onSelect = vi.fn();
        await open(onSelect);

        await act(async () => {
            cardButtons()[1].click();
        });
        await settle();

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect((onSelect.mock.calls[0][0] as Glyph).name).toBe('beta');
        // The picker hands back a plain Glyph — `usageCount` is a gallery
        // concern and must not ride into the grapheme's glyph list.
        expect(onSelect.mock.calls[0][0]).not.toHaveProperty('usageCount');
    });

    it('has no interactive element nested inside a card', async () => {
        seedGlyphs();
        await open(vi.fn());

        for (const card of cardButtons()) {
            expect(card.querySelector('a, button, input, select, [role="button"]')).toBeNull();
        }
    });

    it('filters by name as the user searches', async () => {
        seedGlyphs();
        await open(vi.fn());

        const input = searchInput();
        expect(input, 'the picker should have a search box').not.toBeNull();

        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value',
            )?.set;
            setter?.call(input, 'bet');
            input!.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await settle();

        expect(cardButtons().map((b) => b.getAttribute('aria-label'))).toEqual(['Add glyph beta']);
    });

    it('does not offer a glyph that is already on the grapheme', async () => {
        const ids = seedGlyphs();
        await open(vi.fn(), [ids.beta]);

        expect(cardButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
            'Add glyph alpha',
            'Add glyph gamma',
        ]);
    });

    it('explains the empty case instead of showing a bare grid', async () => {
        await open(vi.fn());

        expect(harness!.text() + document.body.textContent).toContain('No glyphs yet');
    });
});
