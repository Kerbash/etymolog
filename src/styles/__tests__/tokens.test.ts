/**
 * @fileoverview The TOKEN RATCHET — the test that keeps dark mode working.
 *
 * Three invariants, each of which was violated in the pre-Phase-4 codebase and
 * each of which fails silently in a browser (nothing errors; a colour is just
 * wrong, or frozen):
 *
 *  1. EVERY custom property used anywhere under `src/` resolves to a name
 *     defined in `src/index.css`. ~22 names were used but never defined; a
 *     `var()` on an undefined custom property computes to the empty string, so
 *     the declaration is dropped and the element inherits — which is why seven
 *     delete buttons rendered as white text on no background.
 *
 *  2. NO fallback argument inside `var()`. A fallback looks defensive but is the
 *     exact mechanism that defeated dark mode: with the token undefined, the
 *     literal always wins — including under `[data-theme="dark"]`. The whole
 *     Translator tab was pinned to light this way. A missing token must fail
 *     loudly.
 *
 *  3. NO hex / rgb / rgba / hsl / hsla colour literal outside `src/index.css`.
 *     One file owns the palette; anything else is a colour that cannot follow
 *     the theme.
 *
 * Node environment on purpose: this reads the real sources rather than rendering
 * anything, so it costs nothing and cannot be fooled by a component that simply
 * is not mounted in any other test.
 */

/// <reference types="node" />
//
// The node types are pulled in EXPLICITLY here because `tsconfig.app.json` sets
// `"types": ["vite/client"]` — app code has no business touching the filesystem,
// and this ratchet is the one exception. It is a build-time linter that happens
// to be written as a test.
//
// Why not `import.meta.glob(..., { query: '?raw' })`, which would need no node
// types at all: vitest STUBS every `*.module.*` stylesheet to an empty object
// before the raw query is honoured (that is how CSS-module class lookups work in
// a test run). Since the SCSS modules are precisely what has to be scanned, the
// glob would have silently skipped ~45 of the ~50 stylesheets and the ratchet
// would have passed while checking almost nothing.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const SRC = resolve(__dirname, '..', '..');
const SCANNED_EXTENSIONS = ['.css', '.scss', '.ts', '.tsx'];

/** Every scanned file under src/, as POSIX-style paths relative to src/. */
function collectFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry === 'node_modules') continue;
            collectFiles(full, acc);
            continue;
        }
        if (SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
            acc.push(relative(SRC, full).split(sep).join('/'));
        }
    }
    return acc;
}

const INDEX_CSS_KEY = 'index.css';

/**
 * This file quotes the anti-patterns it bans (in test titles, which are not
 * comments) so the failure output reads as documentation. Scanning itself would
 * therefore make the ratchet permanently red — a rule's statement is not a
 * violation of it.
 */
const SELF = 'styles/__tests__/tokens.test.ts';

/**
 * Files exempt from invariant 3 (colour literals). Every entry needs a reason
 * that is about the FILE, never about the effort of fixing it.
 *
 * The two IPA / virtual-glyph SVG generators
 * (`display/spelling/utils/normalization.ts` and
 * `form/customInput/glyphCanvasInput/utils/virtualGlyphUtils.ts`) are
 * deliberately NOT listed: they were audited during Phase 4 and paint with
 * `currentColor`, so they already inherit the theme. If a literal ever lands in
 * one of them, this test should fail rather than wave it through.
 */
const COLOUR_LITERAL_ALLOWLIST: ReadonlyArray<{ file: string; reason: string }> = [
    {
        file: 'db/exportImport/pngFrame.ts',
        reason:
            'Draws the decorative frame of the exported PNG onto a 2D canvas. Those pixels ' +
            'are baked into a file the user downloads and opens outside the app — they are ' +
            'not a DOM surface, cannot read CSS custom properties, and must NOT change with ' +
            'the reader’s theme (an export made in dark mode has to look the same as one ' +
            'made in light).',
    },
    {
        file: 'db/__tests__/glyphService.test.ts',
        reason:
            'SVG fixture strings fed to the sanitiser. The literals are test INPUT — the ' +
            'point is to assert what survives sanitisation — not styling.',
    },
    {
        file: 'components/form/glyphForm/__tests__/normalizeGlyphSvg.test.ts',
        reason:
            'SVG fixture strings fed to the colour normaliser. The literals are exactly what ' +
            'is under test — the assertions are that these hardcoded colours are REPLACED by ' +
            'currentColor on the way into the database — so a file without them could not ' +
            'test the rule this ratchet exists to enforce.',
    },
];

const ALLOWED_LITERAL_FILES = new Set(COLOUR_LITERAL_ALLOWLIST.map((e) => e.file));

/**
 * The ONE `var()` fallback invariant 2 permits, pinned to a file AND a token so
 * nothing else can ride on it. It exists for the opposite reason to the
 * fallbacks the ratchet bans: those masked a token that was NEVER defined, this
 * one sits on a token that IS defined (invariant 1 still checks it) and only
 * takes effect when the element LEAVES the document.
 */
const VAR_FALLBACK_ALLOWLIST: ReadonlyArray<{ file: string; token: string; reason: string }> = [
    {
        file: 'components/display/spelling/GlyphSpellingCore.tsx',
        token: '--page-background-primary',
        reason:
            'The simulated-paper rect. In the app the token makes the paper follow the theme ' +
            '(a literal `white` paper put the currentColor ink white-on-white in dark mode). ' +
            'The SVG/PNG exporters serialise this element VERBATIM into a file that is opened ' +
            'outside the app, where no custom property exists — the `white` fallback is what ' +
            'the export resolves to, and an export must not change with the theme it was made in.',
    },
    {
        file: 'components/display/spelling/__tests__/GlyphSpellingDisplay.test.tsx',
        token: '--page-background-primary',
        reason: 'Asserts the exact string the entry above produces.',
    },
];

const allowedFallback = (file: string, token: string) =>
    VAR_FALLBACK_ALLOWLIST.some((e) => e.file === file && e.token === token);

const FILES = collectFiles(SRC)
    .filter((f) => f !== SELF)
    .sort();

const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/**
 * Strip comments before scanning. A prose comment that documents a banned
 * pattern must not itself trip the ratchet.
 */
function stripComments(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments — CSS, SCSS and TS
        .replace(/(^|[^:])\/\/.*/gm, '$1 '); // line comments — SCSS and TS (not URLs)
}

/** Custom-property NAMES declared anywhere in a source. */
function declaredIn(source: string): Set<string> {
    const names = new Set<string>();
    for (const m of stripComments(source).matchAll(/(^|[;{])\s*(--[a-zA-Z0-9_-]+)\s*:/g)) {
        names.add(m[2]);
    }
    return names;
}

/** The app's token vocabulary: everything index.css declares. */
function definedTokens(): Set<string> {
    return declaredIn(read(INDEX_CSS_KEY));
}

/** Every custom-property reference in a source, with its raw trailing text. */
function varReferences(source: string): { name: string; raw: string }[] {
    const refs: { name: string; raw: string }[] = [];
    for (const m of stripComments(source).matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)([^)]*)/g)) {
        refs.push({ name: m[1], raw: m[2] });
    }
    return refs;
}

describe('token ratchet — definitions', () => {
    const defined = definedTokens();

    it('the scan actually found the sources (a silent empty scan would pass everything)', () => {
        expect(FILES.length).toBeGreaterThan(50);
        expect(FILES).toContain(INDEX_CSS_KEY);
    });

    it('index.css defines the complete CLAUDE.md semantic set', () => {
        // Spot-check the names most likely to be dropped in a future edit —
        // the ones with no consumer TODAY are exactly the ones that quietly
        // disappear and then break the first component that reaches for them.
        const required = [
            '--page-background-primary', '--page-background-secondary',
            '--bg-primary', '--bg-secondary', '--bg-tertiary',
            '--text-primary', '--text-secondary', '--text-primary-muted', '--text-secondary-muted',
            '--surface-base', '--surface-raised', '--surface-overlay',
            '--border-primary', '--border-secondary',
            '--interactive-base', '--interactive-hover', '--interactive-active', '--interactive-text',
            '--status-success', '--status-warning', '--status-error', '--status-info',
            '--status-success-bg', '--status-warning-bg', '--status-error-bg', '--status-info-bg',
            '--status-good', '--status-bad', '--status-disabled',
            '--status-good-bg', '--status-bad-bg', '--status-disabled-bg',
            '--red', '--green', '--blue', '--yellow', '--purple', '--orange',
            '--pink', '--teal', '--cyan', '--white', '--black',
            '--max-content-width', '--content-padding', '--font-body', '--font-mono',
        ];
        expect(required.filter((t) => !defined.has(t))).toEqual([]);
    });

    it('index.css defines all 16 shape tokens', () => {
        // Mirrors SHAPE_TOKEN_NAMES in apps/nochi/src/styles/themeTokens.ts.
        const shape = [
            '--radius-surface', '--radius-control', '--radius-pill', '--radius-chip', '--radius-media',
            '--shadow-surface', '--shadow-raised', '--shadow-overlay',
            '--border-width', '--border-width-strong', '--divider-style',
            '--surface-padding', '--section-gap',
            '--heading-transform', '--heading-letter-spacing', '--heading-prefix',
        ];
        expect(shape.filter((t) => !defined.has(t))).toEqual([]);
    });

    it('no source uses an undefined custom property', () => {
        const offences: string[] = [];
        for (const file of FILES) {
            const source = read(file);
            // A file may declare its OWN component-scoped custom property (e.g.
            // DialogPanel's `--dialog-panel-width`, set by a size modifier class
            // and consumed by the base rule). That is a legitimate local
            // variable, not a missing token — the rule this test enforces is
            // "no reference to a name NOTHING defines".
            const local = declaredIn(source);
            for (const { name } of varReferences(source)) {
                if (!defined.has(name) && !local.has(name)) offences.push(`${file}: ${name}`);
            }
        }
        expect(offences).toEqual([]);
    });
});

describe('token ratchet — no var() fallbacks', () => {
    it('no source passes a fallback argument to var()', () => {
        const offences: string[] = [];
        for (const file of FILES) {
            for (const { name, raw } of varReferences(read(file))) {
                if (raw.includes(',') && !allowedFallback(file, name)) {
                    offences.push(`${file}: ${name} + fallback`);
                }
            }
        }
        expect(offences).toEqual([]);
    });

    it('every fallback exemption is still in use (a stale entry is a hole in the ratchet)', () => {
        for (const { file, token } of VAR_FALLBACK_ALLOWLIST) {
            expect(FILES, `${file} no longer exists`).toContain(file);
            const used = varReferences(read(file)).some((r) => r.name === token && r.raw.includes(','));
            expect(used, `${file} no longer passes a fallback to ${token}`).toBe(true);
        }
    });
});

describe('token ratchet — no colour literals outside index.css', () => {
    // `#abc` / `#aabbcc` / `#aabbccdd`, and the functional colour notations.
    // Bare `0 0 0` triplets inside a shadow are fine — it is the COLOUR that
    // has to come from a token.
    const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;

    it('every allowlist entry names a file that exists and carries a reason', () => {
        for (const { file, reason } of COLOUR_LITERAL_ALLOWLIST) {
            expect(FILES, `allowlisted file is missing: ${file}`).toContain(file);
            expect(reason.length, `allowlist entry ${file} needs a reason`).toBeGreaterThan(40);
        }
    });

    it('no component source hardcodes a colour', () => {
        const offences: string[] = [];
        for (const file of FILES) {
            if (file === INDEX_CSS_KEY) continue;
            if (ALLOWED_LITERAL_FILES.has(file)) continue;
            stripComments(read(file))
                .split('\n')
                .forEach((line, i) => {
                    // color-mix() takes tokens as arguments and is the
                    // sanctioned way to derive a tint — not a literal.
                    if (line.includes('color-mix')) return;
                    if (LITERAL.test(line)) offences.push(`${file}:${i + 1}: ${line.trim()}`);
                });
        }
        expect(offences).toEqual([]);
    });
});

/* =============================================================================
   INVARIANT 4 — text tokens meet WCAG 2.1 AA (4.5:1) in BOTH themes
   =========================================================================== */

/**
 * The colour half of the theme is only "correct" if it is READABLE, and that is
 * not something a browser, a linter or a screenshot will tell you. Phase 8
 * measured every text token against every background token and found
 * `--text-secondary-muted` at 4.41:1 (light) / 4.35:1 (dark) and the whole
 * light-theme transient status family between 2.08:1 and 3.46:1 — all of them
 * carrying small text. This ratchet recomputes those ratios from `index.css`
 * itself, so a future palette tweak cannot quietly drop back below AA.
 *
 * The translucent `--surface-*` tokens are composited over
 * `--page-background-primary` first, which is what the browser actually paints.
 */

type Rgb = readonly [number, number, number];

/** Parse `rgb(r, g, b)` / `rgba(r, g, b, a)` / `#rgb` / `#rrggbb`. */
function parseColour(value: string): { rgb: Rgb; alpha: number } | null {
    const fn = value.match(/\brgba?\s*\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)/);
    if (fn) {
        return {
            rgb: [Number(fn[1]), Number(fn[2]), Number(fn[3])],
            alpha: fn[4] === undefined ? 1 : Number(fn[4]),
        };
    }
    const hex = value.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/);
    if (hex) {
        const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
        return {
            rgb: [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)],
            alpha: 1,
        };
    }
    return null;
}

/** All `--name: value` declarations inside one CSS block, by selector. */
function blockDeclarations(css: string, selector: string): Map<string, string> {
    const start = css.indexOf(selector);
    expect(start, `selector not found in index.css: ${selector}`).toBeGreaterThanOrEqual(0);
    const open = css.indexOf('{', start);
    const close = css.indexOf('}', open);
    const body = css.slice(open + 1, close);
    const out = new Map<string, string>();
    for (const m of stripComments(body).matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g)) {
        out.set(m[1], m[2].trim());
    }
    return out;
}

function relativeLuminance([r, g, b]: Rgb): number {
    const channel = (c: number) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
    const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

function composite(fg: { rgb: Rgb; alpha: number }, bg: Rgb): Rgb {
    return fg.rgb.map((c, i) => Math.round(fg.alpha * c + (1 - fg.alpha) * bg[i])) as unknown as Rgb;
}

/**
 * Text tokens that are actually used as `color:` somewhere in the app, and the
 * backgrounds they can land on. `--status-good` / `--status-disabled` are
 * deliberately absent: the first is only ever a badge FILL or a tree connector
 * (never text), and disabled text is exempt from WCAG 1.4.3.
 */
const TEXT_TOKENS = [
    '--text-primary',
    '--text-secondary',
    '--text-primary-muted',
    '--text-secondary-muted',
    '--interactive-base',
    '--status-success',
    '--status-warning',
    '--status-error',
    '--status-info',
    '--status-bad',
] as const;

const BACKGROUND_TOKENS = [
    '--page-background-primary',
    '--page-background-secondary',
    '--bg-secondary',
    '--bg-tertiary',
    '--surface-base',
    '--surface-raised',
    '--surface-overlay',
] as const;

const AA_NORMAL_TEXT = 4.5;

describe.each([
    ['light', ':root {'],
    ['dark', '[data-theme="dark"] {'],
])('token ratchet — %s theme meets WCAG AA for text', (themeName, selector) => {
    const css = read(INDEX_CSS_KEY);
    const decls = blockDeclarations(css, selector);
    const page = parseColour(decls.get('--page-background-primary')!)!;

    /** Resolve a background token to the opaque colour the browser paints. */
    const opaqueBackground = (token: string): Rgb => {
        const parsed = parseColour(decls.get(token)!);
        expect(parsed, `${themeName}: ${token} is not a parseable colour`).not.toBeNull();
        return parsed!.alpha === 1 ? parsed!.rgb : composite(parsed!, page.rgb);
    };

    it('declares every token this ratchet measures', () => {
        for (const token of [...TEXT_TOKENS, ...BACKGROUND_TOKENS]) {
            expect(decls.has(token), `${themeName}: ${token} is not declared`).toBe(true);
        }
    });

    it(`keeps every text token at >= ${AA_NORMAL_TEXT}:1 on every background`, () => {
        const failures: string[] = [];
        for (const textToken of TEXT_TOKENS) {
            const text = parseColour(decls.get(textToken)!)!;
            for (const bgToken of BACKGROUND_TOKENS) {
                const bg = opaqueBackground(bgToken);
                const ratio = contrast(text.rgb, bg);
                if (ratio < AA_NORMAL_TEXT) {
                    failures.push(`${textToken} on ${bgToken}: ${ratio.toFixed(2)}:1`);
                }
            }
        }
        expect(failures).toEqual([]);
    });

    it('the .primary button label contrasts its --interactive-* fill (AA)', () => {
        // cyber-components' `.primary` variant paints `color: var(--interactive-text)`
        // on `background: var(--interactive-base)` (and `--interactive-hover` on
        // :hover). Both sit on the SAME fill, so the text×background matrix above
        // cannot see this pairing — measure it directly. This is the regression
        // guard for the dark-on-dark CTA (1.11:1) that appeared when
        // `--interactive-text` was undefined and `color` fell back to the
        // inherited `--text-primary` (also a dark brown in the light theme).
        const text = parseColour(decls.get('--interactive-text')!);
        expect(text, `${themeName}: --interactive-text is not a parseable colour`).not.toBeNull();
        const failures: string[] = [];
        for (const fill of ['--interactive-base', '--interactive-hover'] as const) {
            const ratio = contrast(text!.rgb, opaqueBackground(fill));
            if (ratio < AA_NORMAL_TEXT) {
                failures.push(`--interactive-text on ${fill}: ${ratio.toFixed(2)}:1`);
            }
        }
        expect(failures).toEqual([]);
    });
});
