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
            const foreignObjects = container.querySelectorAll('foreignObject');
            expect(foreignObjects.length).toBe(3);
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
            const foreignObjects = container.querySelectorAll('foreignObject');
            expect(foreignObjects.length).toBe(100);
        });
        it('handles mixed virtual and real glyphs', () => {
            const mixedGlyphs = [...mockGlyphs, mockVirtualGlyph];
            const { container } = renderSync(
                createElement(GlyphSpellingDisplay, { 
                    glyphs: mixedGlyphs,
                    showVirtualGlyphStyling: true
                })
            );
            const foreignObjects = container.querySelectorAll('foreignObject');
            expect(foreignObjects.length).toBe(4);
        });
    });
});
