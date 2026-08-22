/**
 * normalizeGlyphSvg — every painted colour becomes `currentColor`.
 *
 * The rule is deliberately blunt: a script glyph is one colour, so there is no
 * "keep this red" case to preserve. What the tests pin is that the blunt rule
 * does not eat the things that only LOOK like colours — `fill="none"` (an
 * outlined shape), a gradient reference — and that geometry survives byte for
 * byte, because this runs on the way into the database.
 */

import { describe, it, expect } from 'vitest';

import { normalizeGlyphSvg } from '../normalizeGlyphSvg';

const wrap = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">\n  ${body}\n</svg>`;

describe('normalizeGlyphSvg', () => {
    it('rewrites an explicit black fill', () => {
        const out = normalizeGlyphSvg(wrap('<path d="M0 0 L10 10" fill="#000000" />'));
        expect(out).toContain('fill="currentColor"');
        expect(out).not.toContain('#000000');
    });

    it('rewrites an explicit white stroke', () => {
        const out = normalizeGlyphSvg(
            wrap('<rect x="1" y="2" width="3" height="4" fill="none" stroke="#FFFFFF" stroke-width="2" />'),
        );
        expect(out).toContain('stroke="currentColor"');
        expect(out).not.toContain('#FFFFFF');
    });

    it('rewrites NON-black colours too — a script glyph is a single colour', () => {
        const out = normalizeGlyphSvg(
            wrap('<circle cx="5" cy="5" r="3" fill="var(--red)" /><ellipse cx="1" cy="1" rx="2" ry="2" fill="none" stroke="rgb(12, 34, 56)" />'),
        );
        expect(out).toContain('fill="currentColor"');
        expect(out).toContain('stroke="currentColor"');
        expect(out).not.toContain('var(--red)');
        expect(out).not.toContain('rgb(12, 34, 56)');
    });

    it('rewrites the drawer\'s own `var(--black)` output', () => {
        const out = normalizeGlyphSvg(wrap('<path d="M1 1" fill="var(--black)" />'));
        expect(out).toContain('fill="currentColor"');
        expect(out).not.toContain('var(--black)');
    });

    it('leaves `fill="none"` alone — it is the absence of paint, not a colour', () => {
        const out = normalizeGlyphSvg(wrap('<rect x="0" y="0" width="9" height="9" fill="none" stroke="#123456" />'));
        expect(out).toContain('fill="none"');
        expect(out).toContain('stroke="currentColor"');
    });

    it('leaves `transparent` and a gradient reference alone', () => {
        const out = normalizeGlyphSvg(
            wrap('<rect x="0" y="0" width="9" height="9" fill="transparent" stroke="url(#grad)" />'),
        );
        expect(out).toContain('fill="transparent"');
        expect(out).toContain('stroke="url(#grad)"');
    });

    it('preserves the viewBox, dimensions and path geometry', () => {
        const out = normalizeGlyphSvg(
            wrap('<path d="M10.5 20.25 C30 40, 50 60, 70 80" fill="#222" stroke-width="3.5" />'),
        );
        expect(out).toContain('viewBox="0 0 300 300"');
        expect(out).toContain('width="300"');
        expect(out).toContain('height="300"');
        expect(out).toContain('d="M10.5 20.25 C30 40, 50 60, 70 80"');
        expect(out).toContain('stroke-width="3.5"');
    });

    it('normalises colours inside a style attribute', () => {
        const out = normalizeGlyphSvg(wrap('<path d="M0 0" style="fill:#000; stroke: red" />'));
        expect(out).toContain('fill:currentColor');
        expect(out).toContain('stroke:currentColor');
    });

    it('is a no-op on markup that is already normalised', () => {
        const already = wrap('<path d="M0 0" fill="currentColor" />');
        expect(normalizeGlyphSvg(already)).toBe(already);
    });

    it('handles empty and nullish input without throwing', () => {
        expect(normalizeGlyphSvg('')).toBe('');
        expect(normalizeGlyphSvg(null)).toBe('');
        expect(normalizeGlyphSvg(undefined)).toBe('');
    });
});
