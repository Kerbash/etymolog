/**
 * @vitest-environment happy-dom
 */
/**
 * CompactLexiconDisplay — the lexicon grid card.
 *
 * Pins the rework: a glyph band on every card (spelling or not), the spelling
 * rendered shrink-to-fit at the `card` preset, the pronunciation as the title,
 * and NO line of grapheme names under the glyphs.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import CompactLexiconDisplay from '../compact/CompactLexiconDisplay';
import type { LexiconComplete, GraphemeComplete } from '../../../../db/types';

function render(element: React.ReactElement): HTMLDivElement {
    const container = document.createElement('div');
    document.body.appendChild(container);
    flushSync(() => createRoot(container).render(element));
    return container;
}

const grapheme = (id: number, name: string): GraphemeComplete => ({
    id, name, category: null, notes: null, created_at: '', updated_at: '',
    glyphs: [{ id, name, svg_data: '<svg viewBox="0 0 100 100"><path d="M0 0h1"/></svg>', category: null, notes: null, created_at: '', updated_at: '' }],
    phonemes: [],
} as unknown as GraphemeComplete);

const graphemeMap = new Map<number, GraphemeComplete>([
    [1, grapheme(1, 'Ae')], [2, grapheme(2, 'L')], [3, grapheme(3, 'O')],
]);

function lexicon(overrides: Partial<LexiconComplete> = {}): LexiconComplete {
    return {
        id: 1,
        lemma: 'Ae L O',
        pronunciation: 'aelo',
        is_native: true,
        auto_spell: false,
        meaning: 'great',
        part_of_speech: null,
        notes: null,
        glyph_order: '[]',
        needs_attention: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        spellingDisplay: [1, 2, 3].map((id, position) => ({
            type: 'grapheme' as const, position, grapheme: graphemeMap.get(id)!,
        })),
        spelling: [],
        meanings: [{ id: 1, lexicon_id: 1, meaning: 'great', part_of_speech: null, usage_notes: null, definition_order: 0 }],
        ancestors: [],
        descendants: [],
        hasIpaFallbacks: false,
        ...overrides,
    };
}

describe('CompactLexiconDisplay', () => {
    it('titles the card with the pronunciation and shows no grapheme-name line', () => {
        const el = render(createElement(CompactLexiconDisplay, { lexiconData: lexicon(), graphemeMap }));
        expect(el.querySelector('h3')?.textContent).toBe('/aelo/');
        expect(el.textContent).not.toContain('Ae L O');
        expect(el.textContent).toContain('great');
    });

    it('falls back to the lemma only when there is no pronunciation', () => {
        const el = render(createElement(CompactLexiconDisplay, { lexiconData: lexicon({ pronunciation: null }), graphemeMap }));
        expect(el.querySelector('h3')?.textContent).toBe('Ae L O');
    });

    it('renders the spelling in the glyph band, shrink-to-fit at the card preset', () => {
        const el = render(createElement(CompactLexiconDisplay, { lexiconData: lexicon(), graphemeMap }));
        const band = el.querySelector('[data-testid="glyph-band"]');
        expect(band).toBeTruthy();
        const display = band?.querySelector('div');
        // `fit="shrink"`: natural width capped at the parent's (`min(100%, …)`,
        // which happy-dom's style parser drops — the class is the stable
        // signal), height from the aspect ratio.
        expect(display?.className).toMatch(/shrink/);
        expect(display?.getAttribute('style')).toContain('height: auto');
        expect(band?.querySelectorAll('svg svg')).toHaveLength(3);
        // The `card` preset really is applied: an 80px box, cells of 40.
        const boxes = [...(band?.querySelectorAll('svg svg') ?? [])].map((s) => s.getAttribute('width'));
        expect(boxes).toEqual(['80', '80', '80']);
        const xs = [...(band?.querySelectorAll('svg svg') ?? [])].map((s) => Number(s.getAttribute('x')));
        expect(xs[1] - xs[0]).toBe(40);
    });

    it('keeps the band — and the grid rhythm — for a word without a spelling', () => {
        const el = render(createElement(CompactLexiconDisplay, { lexiconData: lexicon({ spellingDisplay: [] }), graphemeMap }));
        const band = el.querySelector('[data-testid="glyph-band"]');
        expect(band).toBeTruthy();
        expect(band?.textContent).toContain('(no spelling)');
        expect(band?.querySelector('svg')).toBeNull();
    });
});
