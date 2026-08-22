/**
 * Composed block strategy — role-based word/line splitting, direction matrix,
 * wrapping modes. Pure geometry; no DOM, no database.
 */

import { describe, it, expect } from 'vitest';
import { createComposedBlockStrategy, splitIntoWords } from '../strategies/composedBlockStrategy';
import { getStrategy } from '../strategies';
import type { RenderableGlyph, LayoutStrategyConfig } from '../types';
import type { WritingSystemSettings, DirectionValue } from '../../../../db/api/types';
import { DEFAULT_WRITING_SYSTEM_SETTINGS } from '../../../../db/api/types';

const CONFIG: LayoutStrategyConfig = { glyphWidth: 10, glyphHeight: 10, spacing: 2, padding: 0 };

function glyph(name: string, role?: RenderableGlyph['role']): RenderableGlyph {
    return { id: name.charCodeAt(0), name, svg_data: '<svg/>', isVirtual: false, sourceIndex: 0, ...(role ? { role } : {}) };
}

/** "ab cd" with a two-glyph first word: a b | sep | c d */
function phrase(): RenderableGlyph[] {
    return [glyph('a'), glyph('b'), glyph(' ', 'word-separator'), glyph('c'), glyph('d')];
}

function ws(overrides: Partial<WritingSystemSettings> = {}): WritingSystemSettings {
    return { ...DEFAULT_WRITING_SYSTEM_SETTINGS, ...overrides };
}

describe('splitIntoWords', () => {
    it('splits on role, not on index, so multi-glyph graphemes stay intact', () => {
        const groups = splitIntoWords(phrase());
        expect(groups.map(g => g.glyphs.map(x => x.name).join(''))).toEqual(['ab', ' ', 'cd']);
        expect(groups.every(g => !g.isLineBreak)).toBe(true);
    });

    it('treats a configured grapheme separator the same as a virtual space', () => {
        const sep = { ...glyph('S'), isVirtual: false, role: 'word-separator' as const };
        const groups = splitIntoWords([glyph('a'), sep, glyph('b')]);
        expect(groups.map(g => g.glyphs.map(x => x.name).join(''))).toEqual(['a', 'S', 'b']);
    });

    it('emits line breaks as markers and punctuation as its own group', () => {
        const groups = splitIntoWords([glyph('a'), glyph('.', 'punctuation'), glyph('\n', 'line-break'), glyph('b')]);
        expect(groups.map(g => [g.glyphs.map(x => x.name).join(''), g.isLineBreak])).toEqual([
            ['a', false], ['.', false], ['\n', true], ['b', false],
        ]);
    });

    it('returns one word when nothing carries a role', () => {
        expect(splitIntoWords([glyph('a'), glyph('b')])).toHaveLength(1);
    });
});

describe('createComposedBlockStrategy', () => {
    it('keeps the separator after the whole two-glyph word (ltr)', () => {
        const { positions } = createComposedBlockStrategy(ws()).calculate(phrase(), CONFIG);
        const xs = positions.map(p => [p.glyph.name, p.x]);
        expect(xs).toEqual([['a', 0], ['b', 12], [' ', 24], ['c', 36], ['d', 48]]);
        expect(positions.every(p => p.y === 0)).toBe(true);
    });

    it('does not position line-break glyphs and starts a new line for them', () => {
        const glyphs = [glyph('a'), glyph('\n', 'line-break'), glyph('b')];
        const { positions } = createComposedBlockStrategy(ws()).calculate(glyphs, CONFIG);
        expect(positions.map(p => p.glyph.name)).toEqual(['a', 'b']);
        expect(positions[1].y).toBeGreaterThan(positions[0].y);
        expect(positions[1].x).toBe(0);
    });

    it('wraps whole words when a line overflows (wordWrap: word)', () => {
        const glyphs = [glyph('a'), glyph('b'), glyph(' ', 'word-separator'), glyph('c'), glyph('d'), glyph(' ', 'word-separator'), glyph('e'), glyph('f')];
        // Room for "ab" + sep + "cd" (22 + 2 + 10 + 2 + 22 = 58) but not a third word.
        const { positions } = createComposedBlockStrategy(ws()).calculate(glyphs, { ...CONFIG, maxWidth: 60 });
        const rows = new Map<number, string[]>();
        for (const p of positions) {
            if (!rows.has(p.y)) rows.set(p.y, []);
            rows.get(p.y)!.push(p.glyph.name);
        }
        const lines = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, names]) => names.join(''));
        expect(lines).toEqual(['ab cd', ' ef']);
    });

    it('never wraps with wordWrap: none', () => {
        const glyphs = phrase();
        const { positions } = createComposedBlockStrategy(ws({ wordWrap: 'none' })).calculate(glyphs, { ...CONFIG, maxWidth: 20 });
        expect(new Set(positions.map(p => p.y)).size).toBe(1);
    });

    it('breaks inside a word with wordWrap: glyph', () => {
        const glyphs = [glyph('a'), glyph('b'), glyph('c'), glyph('d'), glyph('e')];
        // 2 glyphs fit per line: (22 + 2) / 12 = 2
        const { positions } = createComposedBlockStrategy(ws({ wordWrap: 'glyph' })).calculate(glyphs, { ...CONFIG, maxWidth: 22 });
        const ys = [...new Set(positions.map(p => p.y))];
        expect(ys).toHaveLength(3);
        expect(positions.filter(p => p.y === ys[0]).map(p => p.glyph.name)).toEqual(['a', 'b']);
        expect(positions.filter(p => p.y === ys[2]).map(p => p.glyph.name)).toEqual(['e']);
    });

    it('produces monotonic offsets for every direction combination', () => {
        const dirs: DirectionValue[] = ['ltr', 'rtl', 'ttb', 'btt'];
        for (const glyphDirection of dirs) {
            for (const wordOrder of dirs) {
                for (const lineProgression of dirs) {
                    const strategy = createComposedBlockStrategy(ws({ glyphDirection, wordOrder, lineProgression, wordWrap: 'none' }));
                    const { positions, bounds } = strategy.calculate(phrase(), CONFIG);
                    expect(positions).toHaveLength(5);
                    expect(positions.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
                    expect(bounds.width).toBeGreaterThan(0);
                    // Within the first word, glyph b follows a along glyphDirection's axis and sign.
                    const a = positions.find(p => p.glyph.name === 'a')!;
                    const b = positions.find(p => p.glyph.name === 'b')!;
                    const horizontal = glyphDirection === 'ltr' || glyphDirection === 'rtl';
                    const delta = horizontal ? b.x - a.x : b.y - a.y;
                    const expectedSign = glyphDirection === 'rtl' || glyphDirection === 'btt' ? -1 : 1;
                    expect(Math.sign(delta)).toBe(expectedSign);
                    expect(horizontal ? b.y : b.x).toBe(horizontal ? a.y : a.x);
                }
            }
        }
    });

    it('aligns vertical words to the baseline of the tallest word on the line', () => {
        const glyphs = [glyph('a'), glyph('b'), glyph(' ', 'word-separator'), glyph('c')];
        const bottom = createComposedBlockStrategy(ws({ glyphDirection: 'ttb', baselineAlignment: 'bottom' })).calculate(glyphs, CONFIG);
        const top = createComposedBlockStrategy(ws({ glyphDirection: 'ttb', baselineAlignment: 'top' })).calculate(glyphs, CONFIG);
        const c = (r: typeof bottom) => r.positions.find(p => p.glyph.name === 'c')!;
        expect(c(top).y).toBe(0);
        expect(c(bottom).y).toBe(12); // tallest word is 22 high; single glyph sits 12 lower
    });

    it('is what getStrategy returns for composed-block without explicit settings', () => {
        const fallback = getStrategy('composed-block');
        expect(fallback.name).toBe('composed-block');
        const { positions } = fallback.calculate(phrase(), CONFIG);
        expect(positions.map(p => p.x)).toEqual([0, 12, 24, 36, 48]);
    });
});
