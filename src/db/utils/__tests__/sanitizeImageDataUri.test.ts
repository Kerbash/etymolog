// @vitest-environment happy-dom
/**
 * `sanitizeSvg` — the raster `<image>` data-URI allowance, and everything it
 * must NOT let through.
 *
 * This is the security-critical half of Phase 2. DOMPurify's default
 * `ALLOWED_URI_REGEXP` rejects every `data:` URI, so the import codec's
 * `<image href="data:image/png;base64,…">` would be silently stripped and a
 * glyph would save as an empty frame — see `ensureImageDataUriHook`. The hook
 * opens a hole exactly one attribute wide; these tests pin the walls of that
 * hole:
 *
 *  - a raster data URI on `<image>` SURVIVES (png / jpeg / webp / gif);
 *  - `data:text/html`, `data:image/svg+xml`, a bare `javascript:` and a
 *    non-base64 image URI are all STRIPPED;
 *  - `<script>`, event handlers and foreign objects are STRIPPED;
 *  - a plain drawn glyph is returned UNCHANGED;
 *  - the hook is idempotent under repeated sanitisation (hooks are global).
 *
 * `happy-dom` supplies enough DOM for the real DOMPurify to run — the test
 * environment override at the top of this file is what switches it on. The
 * node-only service suites use the `__ETYMOLOG_ALLOW_UNSANITIZED_SVG__` bypass
 * instead; here we want the genuine sanitiser.
 */

import { describe, it, expect } from 'vitest';

import { sanitizeSvg } from '../sanitize';

/** A 1×1 transparent PNG — a real, minimal base64 raster payload. */
const PNG_1x1 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

const svgOpen = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">';
const svgClose = '</svg>';
const wrap = (body: string) => `${svgOpen}${body}${svgClose}`;

describe('sanitizeSvg — raster <image> data URIs are allowed', () => {
    it('keeps a base64 PNG on <image href>', () => {
        const out = sanitizeSvg(wrap(`<image width="10" height="10" href="${PNG_1x1}" />`));
        expect(out).toContain('<image');
        expect(out).toContain('data:image/png;base64,');
    });

    it('keeps a data URI on the legacy xlink:href form', () => {
        const out = sanitizeSvg(
            `${svgOpen}<image width="10" height="10" xlink:href="${PNG_1x1}" />${svgClose}`,
        );
        // DOMPurify may fold xlink:href to href, so assert on the payload, not
        // the attribute name.
        expect(out).toContain('<image');
        expect(out).toContain('data:image/png;base64,');
    });

    it('keeps the mask + rect line-art envelope the codec produces', () => {
        const out = sanitizeSvg(
            wrap(
                `<mask id="m"><image width="10" height="10" href="${PNG_1x1}" /></mask>` +
                    `<rect width="10" height="10" fill="currentColor" mask="url(#m)" />`,
            ),
        );
        expect(out).toContain('<mask');
        expect(out).toContain('<image');
        expect(out).toContain('data:image/png;base64,');
        expect(out).toContain('<rect');
        expect(out).toContain('mask="url(#m)"');
    });

    it('allows jpeg, webp and gif raster subtypes', () => {
        for (const mime of ['jpeg', 'webp', 'gif']) {
            const uri = `data:image/${mime};base64,AAAA`;
            const out = sanitizeSvg(wrap(`<image width="10" height="10" href="${uri}" />`));
            expect(out, mime).toContain(`data:image/${mime};base64,`);
        }
    });
});

describe('sanitizeSvg — script-smuggling data URIs are stripped', () => {
    it('strips data:text/html on <image>', () => {
        const out = sanitizeSvg(
            wrap(`<image width="10" height="10" href="data:text/html,<script>alert(1)</script>" />`),
        );
        expect(out).not.toContain('data:text/html');
        expect(out).not.toContain('<script');
    });

    it('strips data:image/svg+xml — an SVG payload can carry script', () => {
        const uri = 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+';
        const out = sanitizeSvg(wrap(`<image width="10" height="10" href="${uri}" />`));
        expect(out).not.toContain('svg+xml');
    });

    it('strips a non-base64 image data URI (can hide markup in the payload)', () => {
        const out = sanitizeSvg(
            wrap(`<image width="10" height="10" href="data:image/png,<script>alert(1)</script>" />`),
        );
        expect(out).not.toContain('data:image/png,');
        expect(out).not.toContain('<script');
    });

    it('strips a javascript: URI on <image>', () => {
        const out = sanitizeSvg(wrap(`<image width="10" height="10" href="javascript:alert(1)" />`));
        expect(out).not.toContain('javascript:');
    });

    it('does NOT extend the allowance to a raster data URI on a non-<image> element', () => {
        // A <use href> or an <a href> must not become a data-URI carrier just
        // because the value looks like a PNG — the hook is scoped to <image>.
        const out = sanitizeSvg(wrap(`<a href="${PNG_1x1}"><rect width="4" height="4" /></a>`));
        expect(out).not.toContain('data:image/png;base64,');
    });
});

describe('sanitizeSvg — scripts and handlers are stripped', () => {
    it('strips a <script> element while keeping the drawn geometry beside it', () => {
        const out = sanitizeSvg(wrap('<rect width="4" height="4" fill="currentColor" /><script>alert(1)</script>'));
        expect(out).not.toContain('<script');
        expect(out).toContain('<rect');
    });

    it('strips an onerror handler on <image>', () => {
        const out = sanitizeSvg(
            wrap(`<image width="10" height="10" href="${PNG_1x1}" onerror="alert(1)" />`),
        );
        expect(out).not.toContain('onerror');
        // the legitimate raster payload still survives
        expect(out).toContain('data:image/png;base64,');
    });

    it('strips an onload handler on the root <svg>', () => {
        const out = sanitizeSvg(
            `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" viewBox="0 0 10 10"><rect width="4" height="4" /></svg>`,
        );
        expect(out).not.toContain('onload');
    });

    it('strips a <foreignObject> HTML escape hatch', () => {
        const out = sanitizeSvg(
            wrap('<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject>'),
        );
        expect(out).not.toContain('<script');
    });
});

describe('sanitizeSvg — legitimate glyphs are preserved and the hook is idempotent', () => {
    const drawnGlyph = wrap(
        '<path d="M2 2 L8 8" fill="currentColor" /><circle cx="5" cy="5" r="2" fill="none" stroke="currentColor" />',
    );

    it('leaves a plain drawn glyph content intact (the raster hook does not touch it)', () => {
        // DOMPurify reserialises self-closing tags (`<path/>` → `<path></path>`)
        // — that is its normal, pre-existing behaviour and is what the drawer's
        // output already stores. What matters here is that the raster-data-URI
        // hook adds NO change of its own: every element, its geometry and its
        // `currentColor` paint survive, and a second pass is a fixed point.
        const out = sanitizeSvg(drawnGlyph);
        expect(out).toContain('d="M2 2 L8 8"');
        expect(out).toContain('fill="currentColor"');
        expect(out).toContain('<circle');
        expect(out).toContain('r="2"');
        expect(out).toContain('stroke="currentColor"');
        expect(out).toContain('fill="none"');
        expect(sanitizeSvg(out)).toBe(out);
    });

    it('is stable across repeated sanitisation of a raster glyph (global hook, registered once)', () => {
        const raster = wrap(
            `<mask id="m"><image width="10" height="10" href="${PNG_1x1}" /></mask>` +
                `<rect width="10" height="10" fill="currentColor" mask="url(#m)" />`,
        );
        const once = sanitizeSvg(raster);
        const twice = sanitizeSvg(once);
        const thrice = sanitizeSvg(twice);
        expect(twice).toBe(once);
        expect(thrice).toBe(once);
        expect(once).toContain('data:image/png;base64,');
    });

    it('still strips script after many sanitise calls (hook did not disable the base policy)', () => {
        sanitizeSvg(drawnGlyph);
        sanitizeSvg(drawnGlyph);
        const out = sanitizeSvg(wrap('<script>alert(1)</script><rect width="4" height="4" />'));
        expect(out).not.toContain('<script');
    });
});
