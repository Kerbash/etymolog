/**
 * GlyphCanvasInput unit tests.
 *
 * The component itself needs a SmartForm field registration to mount, so what
 * is covered here is the logic it delegates to: the insertion strategies that
 * decide where a tapped glyph lands, and the normalisation that turns whatever
 * the parent passed (a raw glyph, a glyph with usage counts, or a whole
 * grapheme) into one renderable shape keyed by id.
 *
 * This file previously carried `@ts-nocheck` over three empty `describe.skip`
 * placeholders waiting for `@testing-library/react`; that dependency cannot be
 * added from a worktree, and the behaviour below needs no DOM.
 */
import { describe, it, expect } from 'vitest';

import {
    createAppendStrategy,
    createPrependStrategy,
    createCursorStrategy,
    getDefaultStrategyForDirection,
    defaultInsertionStrategy,
} from '../strategies';
import {
    buildRenderableMap,
    normalizeToRenderable,
    createVirtualGlyph,
    isVirtualGlyphId,
} from '../utils';
import type { Glyph, GlyphWithUsage, GraphemeComplete } from '../../../../../db/types';

const SVG = '<svg viewBox="0 0 100 100"><path d="M0 0 L100 100"/></svg>';

function makeGlyph(id: number, name: string): Glyph {
    return {
        id,
        name,
        svg_data: SVG,
        category: 'test',
        notes: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
    };
}

describe('GlyphCanvasInput insertion strategies', () => {
    it('appends to the end and backspaces from the end', () => {
        const strategy = createAppendStrategy();

        expect(strategy.insert([1, 2], 3, null)).toEqual({ selection: [1, 2, 3], cursor: null });
        expect(strategy.remove([1, 2, 3], null)).toEqual({ selection: [1, 2], cursor: null });
        expect(strategy.remove([], null)).toEqual({ selection: [], cursor: null });
        expect(strategy.clear()).toEqual({ selection: [], cursor: null });
    });

    it('prepends to the front and removes from the front', () => {
        const strategy = createPrependStrategy();

        expect(strategy.insert([1, 2], 3, null)).toEqual({ selection: [3, 1, 2], cursor: null });
        expect(strategy.remove([1, 2, 3], null)).toEqual({ selection: [2, 3], cursor: null });
        expect(strategy.remove([], null)).toEqual({ selection: [], cursor: null });
    });

    it('inserts at the cursor and advances it', () => {
        const strategy = createCursorStrategy();

        expect(strategy.insert([1, 2, 3], 4, 1)).toEqual({ selection: [1, 4, 2, 3], cursor: 2 });
        // A null cursor means "end of the sequence".
        expect(strategy.insert([1, 2], 3, null)).toEqual({ selection: [1, 2, 3], cursor: 3 });
        // Out-of-range cursors clamp rather than producing holes.
        expect(strategy.insert([1, 2], 9, 99)).toEqual({ selection: [1, 2, 9], cursor: 3 });
        expect(strategy.insert([1, 2], 9, -5)).toEqual({ selection: [9, 1, 2], cursor: 1 });
    });

    it('backspaces before the cursor and refuses at the start', () => {
        const strategy = createCursorStrategy();

        expect(strategy.remove([1, 2, 3], 2)).toEqual({ selection: [1, 3], cursor: 1 });
        expect(strategy.remove([1, 2, 3], null)).toEqual({ selection: [1, 2], cursor: null });
        // Cursor at position 0 has nothing to its left.
        expect(strategy.remove([1, 2, 3], 0)).toEqual({ selection: [1, 2, 3], cursor: 0 });
        expect(strategy.clear()).toEqual({ selection: [], cursor: 0 });
    });

    it('resolves a strategy for every writing direction', () => {
        for (const direction of ['ltr', 'rtl', 'ttb', 'btt', 'custom'] as const) {
            const strategy = getDefaultStrategyForDirection(direction);
            // Order is logical everywhere; the visual direction is the layout's job.
            expect(strategy.name).toBe('append');
            expect(strategy.insert([1], 2, null).selection).toEqual([1, 2]);
        }
        expect(defaultInsertionStrategy.name).toBe('append');
    });
});

describe('GlyphCanvasInput renderable normalisation', () => {
    it('normalises a plain glyph, keeping its real timestamps', () => {
        const renderable = normalizeToRenderable(makeGlyph(7, 'ka'));

        expect(renderable).toMatchObject({
            id: 7,
            name: 'ka',
            svg_data: SVG,
            category: 'test',
            created_at: '2026-01-01T00:00:00.000Z',
        });
    });

    it('carries the usage count of a GlyphWithUsage through', () => {
        const withUsage: GlyphWithUsage = { ...makeGlyph(8, 'ta'), usageCount: 4 };

        expect(normalizeToRenderable(withUsage).usageCount).toBe(4);
    });

    it('normalises a grapheme by combining its glyphs into one SVG', () => {
        const grapheme: GraphemeComplete = {
            id: 12,
            name: 'kʰa',
            category: null,
            notes: null,
            auto_manage_glyphs: 0,
            created_at: '2026-02-02T00:00:00.000Z',
            updated_at: '2026-02-03T00:00:00.000Z',
            glyphs: [makeGlyph(1, 'k'), makeGlyph(2, 'a')],
            phonemes: [],
        } as unknown as GraphemeComplete;

        const renderable = normalizeToRenderable(grapheme);

        expect(renderable.id).toBe(12);
        expect(renderable.name).toBe('kʰa');
        expect(renderable.svg_data).toContain('<svg');
        // The grapheme's OWN timestamps, not fabricated ones.
        expect(renderable.created_at).toBe('2026-02-02T00:00:00.000Z');
        expect(renderable.updated_at).toBe('2026-02-03T00:00:00.000Z');
    });

    it('builds a lookup map keyed by id from a mixed list', () => {
        const map = buildRenderableMap([
            makeGlyph(1, 'a'),
            { ...makeGlyph(2, 'b'), usageCount: 1 },
        ]);

        expect(map.size).toBe(2);
        expect(map.get(1)?.name).toBe('a');
        expect(map.get(2)?.usageCount).toBe(1);
    });

    it('gives virtual IPA glyphs a stable negative id the canvas can recognise', () => {
        const first = createVirtualGlyph('ə');
        const second = createVirtualGlyph('ə');

        expect(first.id).toBe(second.id);
        expect(first.id).toBeLessThan(0);
        expect(isVirtualGlyphId(first.id)).toBe(true);
        expect(isVirtualGlyphId(7)).toBe(false);
        expect(first.source).toBe('virtual-ipa');
        expect(first.svg_data).toContain('<svg');
    });
});
