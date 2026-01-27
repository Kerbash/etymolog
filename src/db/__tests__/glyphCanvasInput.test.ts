/**
 * GlyphCanvasInput Tests
 *
 * Unit tests for the glyph canvas input component and its submodules.
 */

import { describe, it, expect } from 'vitest';
import {
    createAppendStrategy,
    createPrependStrategy,
    createCursorStrategy,
} from '../../components/form/customInput/glyphCanvasInput/strategies';
import { calculateGlyphLayout, calculateBounds } from '../../components/form/customInput/glyphCanvasInput/utils';
import type { Glyph } from '../types';

// =============================================================================
// INSERTION STRATEGIES TESTS
// =============================================================================

describe('Insertion Strategies', () => {
    describe('Append Strategy', () => {
        const strategy = createAppendStrategy();

        it('should append glyph to end', () => {
            const result = strategy.insert([1, 2], 3, null);
            expect(result.selection).toEqual([1, 2, 3]);
            expect(result.cursor).toBeNull();
        });

        it('should handle empty selection', () => {
            const result = strategy.insert([], 1, null);
            expect(result.selection).toEqual([1]);
        });

        it('should remove from end', () => {
            const result = strategy.remove([1, 2, 3], null);
            expect(result.selection).toEqual([1, 2]);
        });

        it('should handle remove from single item', () => {
            const result = strategy.remove([1], null);
            expect(result.selection).toEqual([]);
        });

        it('should handle remove from empty selection', () => {
            const result = strategy.remove([], null);
            expect(result.selection).toEqual([]);
        });

        it('should clear all', () => {
            const result = strategy.clear();
            expect(result.selection).toEqual([]);
            expect(result.cursor).toBeNull();
        });
    });

    describe('Prepend Strategy', () => {
        const strategy = createPrependStrategy();

        it('should prepend glyph to beginning', () => {
            const result = strategy.insert([1, 2], 3, null);
            expect(result.selection).toEqual([3, 1, 2]);
        });

        it('should remove from beginning', () => {
            const result = strategy.remove([1, 2, 3], null);
            expect(result.selection).toEqual([2, 3]);
        });
    });

    describe('Cursor Strategy', () => {
        const strategy = createCursorStrategy();

        it('should insert at cursor position', () => {
            const result = strategy.insert([1, 2, 3], 4, 1);
            expect(result.selection).toEqual([1, 4, 2, 3]);
            expect(result.cursor).toBe(2);
        });

        it('should append when cursor is null', () => {
            const result = strategy.insert([1, 2], 3, null);
            expect(result.selection).toEqual([1, 2, 3]);
        });

        it('should remove before cursor', () => {
            const result = strategy.remove([1, 2, 3], 2);
            expect(result.selection).toEqual([1, 3]);
            expect(result.cursor).toBe(1);
        });

        it('should not remove when cursor is at start', () => {
            const result = strategy.remove([1, 2], 0);
            expect(result.selection).toEqual([1, 2]);
            expect(result.cursor).toBe(0);
        });

        it('should remove from end when cursor is null', () => {
            const result = strategy.remove([1, 2, 3], null);
            expect(result.selection).toEqual([1, 2]);
            expect(result.cursor).toBeNull();
        });
    });
});

// =============================================================================
// LAYOUT UTILS TESTS
// =============================================================================

describe('Layout Utils', () => {
    const mockGlyphs: Glyph[] = [
        { id: 1, name: 'A', svg_data: '<svg></svg>', category: null, notes: null, created_at: '', updated_at: '' },
        { id: 2, name: 'B', svg_data: '<svg></svg>', category: null, notes: null, created_at: '', updated_at: '' },
        { id: 3, name: 'C', svg_data: '<svg></svg>', category: null, notes: null, created_at: '', updated_at: '' },
    ];

    describe('calculateGlyphLayout - LTR', () => {
        it('should position glyphs left-to-right', () => {
            const result = calculateGlyphLayout(mockGlyphs, { direction: 'ltr' });

            expect(result.length).toBe(3);
            expect(result[0].x).toBeLessThan(result[1].x);
            expect(result[1].x).toBeLessThan(result[2].x);
            // Y should be the same for all (horizontal layout)
            expect(result[0].y).toBe(result[1].y);
        });

        it('should handle empty array', () => {
            const result = calculateGlyphLayout([], { direction: 'ltr' });
            expect(result).toEqual([]);
        });
    });

    describe('calculateGlyphLayout - RTL', () => {
        it('should position glyphs right-to-left', () => {
            const result = calculateGlyphLayout(mockGlyphs, { direction: 'rtl' });

            expect(result.length).toBe(3);
            // First glyph should be at rightmost position
            expect(result[0].x).toBeGreaterThan(result[1].x);
            expect(result[1].x).toBeGreaterThan(result[2].x);
        });
    });

    describe('calculateGlyphLayout - TTB', () => {
        it('should position glyphs top-to-bottom', () => {
            const result = calculateGlyphLayout(mockGlyphs, { direction: 'ttb' });

            expect(result.length).toBe(3);
            expect(result[0].y).toBeLessThan(result[1].y);
            expect(result[1].y).toBeLessThan(result[2].y);
            // X should be the same for all (vertical layout)
            expect(result[0].x).toBe(result[1].x);
        });
    });

    describe('calculateGlyphLayout - BTT', () => {
        it('should position glyphs bottom-to-top', () => {
            const result = calculateGlyphLayout(mockGlyphs, { direction: 'btt' });

            expect(result.length).toBe(3);
            // First glyph should be at bottommost position
            expect(result[0].y).toBeGreaterThan(result[1].y);
            expect(result[1].y).toBeGreaterThan(result[2].y);
        });
    });

    describe('calculateBounds', () => {
        it('should calculate correct bounds for positioned glyphs', () => {
            const positionedGlyphs = calculateGlyphLayout(mockGlyphs, { direction: 'ltr' });
            const bounds = calculateBounds(positionedGlyphs);

            expect(bounds.width).toBeGreaterThan(0);
            expect(bounds.height).toBeGreaterThan(0);
        });

        it('should return minimum size for empty array', () => {
            const bounds = calculateBounds([]);

            expect(bounds.width).toBeGreaterThan(0);
            expect(bounds.height).toBeGreaterThan(0);
        });
    });
});
