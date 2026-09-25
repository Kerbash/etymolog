﻿/**
 * @vitest-environment happy-dom
 */
/**
 * GlyphSpellingDisplay Tests
 * Tests for the simulated paper glyph display component.
 */
import { describe, it, expect } from 'vitest';
import { createElement, createRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { GlyphSpellingDisplay } from '../index';
import type { GlyphSpellingDisplayRef, RenderableGlyph } from '../types';
import { DEFAULT_WRITING_SYSTEM_SETTINGS } from '../../../../db/api/types';
// Helper to render component synchronously
function renderSync(element: React.ReactElement): { container: HTMLDivElement; root: Root } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => {
        root.render(element);
    });
    return { container, root };
}
// Mock glyphs for testing
const mockGlyphs: RenderableGlyph[] = [
    {
        id: 1,
        name: 'A',
        svg_data: '<svg viewBox="0 0 100 100"><text>A</text></svg>',
        isVirtual: false,
        sourceIndex: 0,
    },
    {
        id: 2,
        name: 'B',
        svg_data: '<svg viewBox="0 0 100 100"><text>B</text></svg>',
        isVirtual: false,
        sourceIndex: 1,
    },
    {
        id: 3,
        name: 'C',
        svg_data: '<svg viewBox="0 0 100 100"><text>C</text></svg>',
        isVirtual: false,
        sourceIndex: 2,
    },
];
const mockVirtualGlyph: RenderableGlyph = {
    id: -1,
    name: 'a',
    svg_data: '<svg viewBox="0 0 100 100"><text>a</text></svg>',
    isVirtual: true,
    ipaCharacter: 'a',
    sourceIndex: 0,
};
describe('GlyphSpellingDisplay', () => {
    describe('Static Mode (default)', () => {
        it('renders glyphs in static mode by default', () => {
            const { container } = renderSync(
                createElement(GlyphSpellingDisplay, { glyphs: mockGlyphs })
            );
            const svg = container.querySelector('svg');
            expect(svg).toBeTruthy();
            const nestedSvgs = container.querySelectorAll('svg svg');
            expect(nestedSvgs.length).toBe(3);
        });
        it('returns null when empty and no emptyContent', () => {
            const { container } = renderSync(
                createElement(GlyphSpellingDisplay, { glyphs: [] })
            );
            expect(container.children.length).toBe(0);
        });
        it('uses different layout strategies', () => {
            const { container: ltrContainer } = renderSync(
                createElement(GlyphSpellingDisplay, { glyphs: mockGlyphs, strategy: 'ltr' })
            );
            const { container: rtlContainer } = renderSync(
                createElement(GlyphSpellingDisplay, { glyphs: mockGlyphs, strategy: 'rtl' })
            );
            expect(ltrContainer.querySelector('svg')).toBeTruthy();
            expect(rtlContainer.querySelector('svg')).toBeTruthy();
        });
    });
    describe('Interactive Mode', () => {
        it('renders in interactive mode with controls', () => {
            const { container } = renderSync(
                createElement(GlyphSpellingDisplay, { 
                    glyphs: mockGlyphs,
                    mode: 'interactive'
                })
            );
            const buttons = container.querySelectorAll('button');
            expect(buttons.length).toBeGreaterThanOrEqual(3);
        });
        it('hides controls when showControls is false', () => {
            const { container } = renderSync(
                createElement(GlyphSpellingDisplay, { 
                    glyphs: mockGlyphs,
                    mode: 'interactive',
                    showControls: false
                })
            );
            const buttons = container.querySelectorAll('button');
            expect(buttons.length).toBe(0);
        });
        it('exposes ref methods', () => {
            const ref = createRef<GlyphSpellingDisplayRef>();
            renderSync(
                createElement(GlyphSpellingDisplay, { 
                    ref,
                    glyphs: mockGlyphs,
                    mode: 'interactive'
                })
            );
            expect(ref.current).toBeDefined();
            expect(typeof ref.current?.resetView).toBe('function');
            expect(typeof ref.current?.fitToView).toBe('function');
            expect(typeof ref.current?.setZoom).toBe('function');
            expect(typeof ref.current?.panTo).toBe('function');
            expect(typeof ref.current?.getTransform).toBe('function');
            expect(typeof ref.current?.getContentBounds).toBe('function');
        });
    });
    describe('Canvas Configuration', () => {
        it('paints the paper with the theme token and a white export fallback', () => {
            // A literal `white` paper put the `currentColor` ink white on white
            // in dark mode. The token follows the theme in the app; the `white`
            // fallback is what the SVG/PNG exporters (which serialise this rect
            // verbatim, into a file with no app CSS) resolve to.
            const { container } = renderSync(
                createElement(GlyphSpellingDisplay, {
                    glyphs: mockGlyphs,
                    mode: 'interactive',
                    canvas: { width: 800, height: 600, showPaperEffect: true },
                })
            );
            const paper = container.querySelector('svg > rect');
            expect(paper).toBeTruthy();
            expect(paper?.getAttribute('fill')).toBeNull();
            expect(paper?.getAttribute('style')).toContain('var(--page-background-primary, white)');
        });
        it('lets an explicit canvas backgroundColor win over the paper token', () => {
            const { container } = renderSync(
                createElement(GlyphSpellingDisplay, {
                    glyphs: mockGlyphs,
                    mode: 'interactive',
                    canvas: { width: 800, height: 600, showPaperEffect: true, backgroundColor: 'red' },
                })
            );
            const style = container.querySelector('svg > rect')?.getAttribute('style') ?? '';
            expect(style).toContain('fill: red');
            expect(style).not.toContain('var(');
        });
        it('uses canvas width for text wrapping', () => {
            const { container } = renderSync(
                createElement(GlyphSpellingDisplay, { 
                    glyphs: [...mockGlyphs, ...mockGlyphs, ...mockGlyphs],
                    mode: 'interactive',
                    canvas: { width: 100 }
                })
            );
            const svg = container.querySelector('svg');
            expect(svg).toBeTruthy();
        });
    });
    describe('Edge Cases', () => {
        it('handles very large number of glyphs', () => {
            const manyGlyphs = Array.from({ length: 100 }, (_, i) => ({
                ...mockGlyphs[0],
                id: i,
                sourceIndex: i,
            }));
            const { container } = renderSync(
                createElement(GlyphSpellingDisplay, { 
                    glyphs: manyGlyphs,
                    mode: 'interactive',
                    canvas: { width: 500 }
                })
            );
            const nestedSvgs = container.querySelectorAll('svg svg');
            expect(nestedSvgs.length).toBe(100);
        });
        it('handles mixed virtual and real glyphs', () => {
            const mixedGlyphs = [...mockGlyphs, mockVirtualGlyph];
            const { container } = renderSync(
                createElement(GlyphSpellingDisplay, { 
                    glyphs: mixedGlyphs,
                    showVirtualGlyphStyling: true
                })
            );
            const nestedSvgs = container.querySelectorAll('svg svg');
            expect(nestedSvgs.length).toBe(4);
        });
    });

    describe('letterSpacing (SCRIPT_SPACING_PLAN Phase B)', () => {
        // Two boxes 20px wide, cell = half the box (10px), so a letter step is
        // 10px + spacing. The `letterSpacing` prop replaces the config `spacing`
        // with cellWidth × fraction (cellWidth = 20 × 0.5 = 10).
        const CONFIG = { glyphWidth: 20, glyphHeight: 20, cellFraction: 0.5, spacing: 100, padding: 0 };
        const twoGlyphs: RenderableGlyph[] = [
            { id: 1, name: 'A', svg_data: '<svg viewBox="0 0 100 100"><text>A</text></svg>', isVirtual: false, sourceIndex: 0 },
            { id: 2, name: 'B', svg_data: '<svg viewBox="0 0 100 100"><text>B</text></svg>', isVirtual: false, sourceIndex: 1 },
        ];

        /** The x of each positioned inner svg, in order. */
        function xs(letterSpacing?: 'auto' | 'none' | 'normal'): number[] {
            const { container } = renderSync(
                createElement(GlyphSpellingDisplay, {
                    glyphs: twoGlyphs,
                    strategy: 'composed-block',
                    writingSystem: DEFAULT_WRITING_SYSTEM_SETTINGS,
                    config: CONFIG,
                    letterSpacing,
                }),
            );
            return [...container.querySelectorAll('svg svg')].map((s) => Number(s.getAttribute('x')));
        }

        it('auto leaves the config spacing untouched (step = cell + spacing)', () => {
            // stepX = 10 + 100 = 110.
            expect(xs('auto')).toEqual([0, 110]);
        });

        it('none makes letters touch cell-to-cell (spacing 0)', () => {
            // stepX = 10 + 0 = 10.
            expect(xs('none')).toEqual([0, 10]);
        });

        it('a fraction sets spacing to cellWidth × fraction', () => {
            // normal = 0.15 → spacing = 10 × 0.15 = 1.5 → stepX = 11.5.
            expect(xs('normal')).toEqual([0, 11.5]);
        });

        it('undefined behaves exactly like auto (byte-identical default)', () => {
            expect(xs(undefined)).toEqual(xs('auto'));
        });
    });

    describe('word-break glyphs (SCRIPT_SPACING_PLAN Phase B)', () => {
        const CONFIG = { glyphWidth: 20, glyphHeight: 20, cellFraction: 1, spacing: 4, padding: 0 };
        const wordBreak: RenderableGlyph = { id: -9, name: '', svg_data: '', isVirtual: false, sourceIndex: 1, role: 'word-break' };
        const a: RenderableGlyph = { id: 1, name: 'A', svg_data: '<svg viewBox="0 0 100 100"><text>A</text></svg>', isVirtual: false, sourceIndex: 0 };
        const b: RenderableGlyph = { id: 2, name: 'B', svg_data: '<svg viewBox="0 0 100 100"><text>B</text></svg>', isVirtual: false, sourceIndex: 2 };

        it('a non-composed strategy (ltr) neither draws nor reserves room for a word-break', () => {
            const withBreak = renderSync(
                createElement(GlyphSpellingDisplay, { glyphs: [a, wordBreak, b], strategy: 'ltr', config: CONFIG }),
            );
            const withoutBreak = renderSync(
                createElement(GlyphSpellingDisplay, { glyphs: [a, b], strategy: 'ltr', config: CONFIG }),
            );
            const xs = (c: HTMLDivElement) => [...c.querySelectorAll('svg svg')].map((s) => Number(s.getAttribute('x')));
            // The break drew no inner svg and shifted nothing: identical to the
            // plain two-glyph layout.
            expect(xs(withBreak.container)).toEqual([0, 24]);
            expect(xs(withBreak.container)).toEqual(xs(withoutBreak.container));
        });
    });
});
