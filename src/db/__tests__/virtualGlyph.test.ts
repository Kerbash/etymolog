/**
 * Rendering primitives — one virtual-glyph id everywhere, viewBox-aware SVG
 * combining, role propagation through normalisation.
 */

import { describe, it, expect } from 'vitest';
import { generateVirtualGlyphId, isVirtualGlyphId } from '../utils/virtualGlyph';
import { generateVirtualGlyphId as canvasId, createVirtualGlyph } from '../../components/form/customInput/glyphCanvasInput/utils/virtualGlyphUtils';
import { normalizeGlyphInput } from '../../components/display/spelling/utils/normalization';
import { combineSvgStrings, parseSvgViewBox, extractSvgInner } from '../../components/form/customInput/glyphCanvasInput/utils/graphemeUtils';
import type { SpellingDisplayEntry, GraphemeComplete } from '../types';

describe('virtual glyph ids', () => {
    it('are negative, deterministic and identical across modules', () => {
        for (const ch of ['ə', 'ʃ', 'a', ' ', '\n', 'tʃ']) {
            const id = generateVirtualGlyphId(ch);
            expect(id).toBeLessThan(0);
            expect(Number.isInteger(id)).toBe(true);
            expect(canvasId(ch)).toBe(id);
            expect(createVirtualGlyph(ch).id).toBe(id);
            const [renderable] = normalizeGlyphInput([{ type: 'ipa', position: 0, ipaCharacter: ch }]);
            expect(renderable.id).toBe(id);
        }
        expect(generateVirtualGlyphId('ə')).not.toBe(generateVirtualGlyphId('ʃ'));
        expect(isVirtualGlyphId(generateVirtualGlyphId('x'))).toBe(true);
        expect(isVirtualGlyphId(42)).toBe(false);
    });

    it('give a multi-code-point SOUND its own renderable glyph', () => {
        // The auto-spell fallback invents one virtual glyph per IPA TOKEN, so
        // the character it is asked for can be an affricate, a long vowel or an
        // aspirated stop — several code points standing for one sound.
        for (const sound of ['t͡s', 'aː', 'pʰ', 't͡ʃ']) {
            const glyph = createVirtualGlyph(sound);
            expect(glyph.id).toBe(generateVirtualGlyphId(sound));
            expect(glyph.id).toBeLessThan(0);
            expect(Number.isInteger(glyph.id)).toBe(true);
            expect(glyph.ipaCharacter).toBe(sound);
            expect(glyph.name).toBe(sound);
            expect(glyph.svg_data).toContain('<svg');
            expect(glyph.svg_data).toContain('>' + sound + '<');
            // Stable: the same sound always yields the same glyph id.
            expect(createVirtualGlyph(sound).id).toBe(glyph.id);
        }
    });

    it('does not give the affricate the same id as its first component', () => {
        // 't͡s' rendering as the glyph for 't' would be the same bug wearing a
        // different hat — the placeholder has to stand for the whole sound.
        const parts = ['t', 's', '\u0361', 't\u0361', 't͡s', 'ts'];
        const ids = parts.map(generateVirtualGlyphId);
        expect(new Set(ids).size).toBe(parts.length);
        expect(createVirtualGlyph('t͡s').id).not.toBe(createVirtualGlyph('t').id);
    });

    it('do not collide across the IPA range', () => {
        const seen = new Map<number, string>();
        for (let code = 0x0250; code <= 0x02ff; code++) {
            const ch = String.fromCharCode(code);
            const id = generateVirtualGlyphId(ch);
            expect(seen.get(id) ?? ch).toBe(ch);
            seen.set(id, ch);
        }
    });
});

describe('normalizeGlyphInput', () => {
    const grapheme: GraphemeComplete = {
        id: 7, name: 'ka', category: null, notes: null, created_at: '', updated_at: '',
        glyphs: [
            { id: 1, name: 'k', svg_data: '<svg/>', category: null, notes: null, created_at: '', updated_at: '' },
            { id: 2, name: 'a', svg_data: '<svg/>', category: null, notes: null, created_at: '', updated_at: '' },
        ],
        phonemes: [],
    };

    it('expands graphemes to glyphs, keeps the entry index and copies roles', () => {
        const entries: SpellingDisplayEntry[] = [
            { type: 'grapheme', position: 0, grapheme },
            { type: 'ipa', position: 1, ipaCharacter: ' ', role: 'word-separator' },
            { type: 'grapheme', position: 2, grapheme, role: 'punctuation' },
        ];
        const out = normalizeGlyphInput(entries, { graphemeMap: new Map([[7, grapheme]]) });
        expect(out.map(g => [g.name, g.sourceIndex, g.role ?? null])).toEqual([
            ['k', 0, null], ['a', 0, null], [' ', 1, 'word-separator'], ['k', 2, 'punctuation'], ['a', 2, 'punctuation'],
        ]);
    });
});

describe('combineSvgStrings', () => {
    const small = '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="20"/></svg>';
    const large = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100"/></svg>';

    it('parses viewBoxes and tolerates missing ones', () => {
        expect(parseSvgViewBox(small)).toEqual({ x: 0, y: 0, width: 48, height: 48 });
        expect(parseSvgViewBox('<svg><path/></svg>')).toEqual({ x: 0, y: 0, width: 100, height: 100 });
        expect(parseSvgViewBox('<svg viewBox="-5 -5 0 10"/>')).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    });

    it('extracts inner markup even with nested svg elements', () => {
        const nested = '<svg viewBox="0 0 10 10"><svg x="1"><path d="M0 0"/></svg></svg>';
        expect(extractSvgInner(nested)).toBe('<svg x="1"><path d="M0 0"/></svg>');
    });

    it('nests each source with its own viewBox in equal cells', () => {
        const out = combineSvgStrings([small, large], 2, 24);
        expect(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 24"')).toBe(true);
        const cells = out.match(/<svg x="(\d+)" y="0" width="24" height="24" viewBox="([^"]+)"/g) ?? [];
        expect(cells).toHaveLength(2);
        expect(cells[0]).toContain('x="0"');
        expect(cells[0]).toContain('viewBox="0 0 48 48"');
        expect(cells[1]).toContain('x="26"');
        expect(cells[1]).toContain('viewBox="0 0 100 100"');
        expect(out).toContain('<circle');
        expect(out).toContain('<rect');
    });

    it('returns single inputs untouched and empty for none', () => {
        expect(combineSvgStrings([small])).toBe(small);
        expect(combineSvgStrings([])).toBe('');
    });
});
