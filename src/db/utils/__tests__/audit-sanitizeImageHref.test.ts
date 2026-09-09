// @vitest-environment happy-dom
/**
 * Adversarial audit — Phase 2 sanitizer, the <image href> hole.
 * -------------------------------------------------------------
 * Phase 2 opened a deliberately narrow hole: a base64 RASTER data URI on an
 * `<image>`. The plan's rule was "raster and NOTHING else". The first
 * implementation kept the raster and stripped the `data:` script vectors — but
 * it left EXTERNAL `href`s on `<image>` to DOMPurify's base policy, which
 * KEEPS `http(s)` URLs. An imported SVG file (the new `svgFileToGlyphSvg` path)
 * could therefore carry `<image href="https://tracker/x.png">`, a beacon that
 * fires on every glyph render and in the import preview's `dangerouslySetInnerHTML`.
 *
 * These tests pin the tightened rule: on `<image>`, ONLY a raster data URI
 * survives; external and protocol-relative references are stripped. Legitimate
 * same-document fragment refs on NON-image elements (gradients, `<use>`) are
 * untouched.
 */

import { describe, it, expect } from 'vitest';

import { sanitizeSvg } from '../sanitize';

const svgOpen = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">';
const svgClose = '</svg>';
const wrap = (body: string) => `${svgOpen}${body}${svgClose}`;

const PNG_1x1 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

describe('sanitizeSvg — external references on <image> are stripped', () => {
    it('strips an https:// tracking href on <image>', () => {
        const out = sanitizeSvg(wrap('<image width="10" height="10" href="https://tracker.example.com/pixel.png" />'));
        expect(out).not.toContain('tracker.example.com');
        expect(out).not.toContain('https://');
    });

    it('strips a legacy xlink:href external reference on <image>', () => {
        const out = sanitizeSvg(
            `${svgOpen}<image width="10" height="10" xlink:href="http://tracker.example.com/p.gif" />${svgClose}`,
        );
        expect(out).not.toContain('tracker.example.com');
    });

    it('strips a protocol-relative external reference on <image>', () => {
        const out = sanitizeSvg(wrap('<image width="10" height="10" href="//tracker.example.com/p.png" />'));
        expect(out).not.toContain('tracker.example.com');
    });

    it('strips an external href even nested inside a <mask>', () => {
        const out = sanitizeSvg(
            wrap(
                '<mask id="m"><image width="10" height="10" href="https://tracker.example.com/p.png" /></mask>' +
                    '<rect width="10" height="10" fill="currentColor" mask="url(#m)" />',
            ),
        );
        expect(out).not.toContain('tracker.example.com');
    });

    it('still keeps a legitimate raster data URI on <image>', () => {
        const out = sanitizeSvg(wrap(`<image width="10" height="10" href="${PNG_1x1}" />`));
        expect(out).toContain('data:image/png;base64,');
    });

    it('leaves same-document fragment references on NON-image elements intact', () => {
        const out = sanitizeSvg(
            wrap(
                '<defs>' +
                    '<linearGradient id="base"><stop offset="0" /></linearGradient>' +
                    '<linearGradient id="g" xlink:href="#base" />' +
                    '</defs>' +
                    '<rect width="10" height="10" fill="url(#g)" />',
            ),
        );
        // The tightened <image> rule must not spill onto other elements' legit
        // internal references: the gradient's paint-server reference and its
        // xlink:href inheritance survive.
        expect(out).toContain('fill="url(#g)"');
        expect(out).toContain('#base');
    });
});
