/**
 * @fileoverview The guide overlay's SOURCE ratchet.
 *
 * `src/styles/__tests__/tokens.test.ts` already proves that every token the app
 * references exists and that no stylesheet hardcodes a colour. What it cannot
 * see is whether the guide is painted with the RIGHT tokens — three specific
 * pairs, chosen because a tier is a state that stays on the screen (the
 * persistent `good` / `info` / `disabled` family), not feedback about an action.
 * A future edit that reaches for `--status-success` because it is greener would
 * pass every other test in the repo.
 *
 * Two structural decisions are pinned here as well, both of which fail INVISIBLY
 * in a browser:
 *
 *  - the vowel variant must use `outline` with a negative offset. Its cells live
 *    inside a 48×48 SVG `<foreignObject>`, which clips anything painted outside
 *    the box — a `box-shadow` ring is simply not drawn, and nothing errors.
 *  - `--status-good` must never become a `color:`. It measures 2.74:1 on the
 *    light page, which is why the contrast ratchet's TEXT_TOKENS deliberately
 *    excludes it; as a ring it is a non-text indicator and legal.
 *
 * Node environment: this reads the real stylesheets. Vitest replaces
 * `*.module.scss` imports with a class-name proxy, so the only way to see what
 * a stylesheet actually DECLARES is to read the file.
 */

/// <reference types="node" />

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = resolve(__dirname, '..');
const read = (file: string) => readFileSync(join(DIR, file), 'utf8');

const CELL = 'IPAChartCell.module.scss';
const SYLLABARY = 'IPASyllabaryChart.module.scss';
const LEGEND = 'guideLegend.module.scss';

/** The only colour tokens the guide is allowed to paint with. */
const ALLOWED_GUIDE_TOKENS = [
    '--status-good',
    '--status-good-bg',
    '--status-info',
    '--status-info-bg',
    '--status-disabled',
    '--status-disabled-bg',
];

/** The declarations that can carry a colour. */
const COLOUR_PROPERTY = /\b(background|background-color|box-shadow|outline|outline-color|border|border-color|color|fill|stroke)\s*:/;

/** Strip comments — this file's own prose about a banned pattern is not a use of it. */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*/gm, '$1 ');
}

/**
 * The declarations of every rule whose selector mentions `guide` or `swatch`,
 * flattened. (`swatch` because the legend's key uses the same three tokens
 * under its own names — a swatch that did not match its cell would be a key
 * that lies.)
 *
 * A brace-counting slice rather than a real parser: these are nested SCSS
 * blocks a few levels deep, and everything the ratchet asks about is a
 * declaration inside one of them.
 */
function guideBlocks(source: string): string {
    const clean = stripComments(source);
    const out: string[] = [];
    const selector = /[.&][A-Za-z0-9_.&:\-\s,]*(?:guide|swatch)[A-Za-z]*[^{}]*\{/g;
    for (const match of clean.matchAll(selector)) {
        let depth = 1;
        let i = match.index! + match[0].length;
        const start = i;
        while (i < clean.length && depth > 0) {
            if (clean[i] === '{') depth += 1;
            else if (clean[i] === '}') depth -= 1;
            i += 1;
        }
        out.push(`${match[0]}${clean.slice(start, i)}`);
    }
    return out.join('\n');
}

describe('guide overlay — the tokens it paints with', () => {
    it('finds the guide rules at all (an empty scan would pass everything)', () => {
        for (const file of [CELL, SYLLABARY, LEGEND]) {
            const blocks = guideBlocks(read(file));
            expect(blocks.length, `${file} has no guide rules`).toBeGreaterThan(40);
        }
    });

    it.each([CELL, SYLLABARY, LEGEND])(
        '%s paints the tiers with the three persistent status pairs only',
        (file) => {
            // Only the COLOUR-bearing declarations are checked: a guide rule is
            // free to reach for `--radius-chip` for its corners, and pinning
            // shape tokens here would be a rule about the wrong thing.
            const offences: string[] = [];
            for (const line of guideBlocks(read(file)).split('\n')) {
                if (!COLOUR_PROPERTY.test(line)) continue;
                for (const match of line.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
                    if (!ALLOWED_GUIDE_TOKENS.includes(match[1])) {
                        offences.push(`${file}: ${match[1]}`);
                    }
                }
            }
            expect(offences).toEqual([]);
        },
    );

    it.each([CELL, SYLLABARY, LEGEND])('%s hardcodes no colour in a guide rule', (file) => {
        // Duplicated from the app-wide ratchet on purpose: this is the rule the
        // overlay is most likely to break, and a local failure names the file.
        expect(guideBlocks(read(file))).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/);
    });

    it.each([CELL, SYLLABARY, LEGEND])('%s passes no fallback to var()', (file) => {
        for (const match of guideBlocks(read(file)).matchAll(/var\(\s*--[a-zA-Z0-9-]+([^)]*)/g)) {
            expect(match[1]).not.toContain(',');
        }
    });

    it.each([CELL, SYLLABARY, LEGEND])('%s never makes --status-good a text colour', (file) => {
        // 2.74:1 on the light page. It is a fill and a ring, never a letter.
        expect(stripComments(read(file))).not.toMatch(/(^|[^-])color\s*:\s*var\(\s*--status-good/);
    });
});

describe('guide overlay — the structural decisions', () => {
    it('rings the vowel variant with an inset outline, not a clipped box-shadow', () => {
        const cell = stripComments(read(CELL));
        const vowelGuide = cell.slice(cell.indexOf('&.vowel {', cell.indexOf('guideAvoid')));

        expect(vowelGuide).toContain('outline-offset: -2px');
        expect(vowelGuide).toMatch(/box-shadow:\s*none/);
        expect(vowelGuide).toContain('var(--status-good)');
        expect(vowelGuide).toContain('var(--status-info)');
    });

    it('keeps the focus ring after the guide so it still wins', () => {
        // Both are `outline` on the vowel variant and both weigh the same, so
        // the LATER rule wins. If the focus ring moves back up the file it
        // disappears behind the overlay and keyboard navigation goes dark.
        const cell = stripComments(read(CELL));
        expect(cell.lastIndexOf('&.clickable:focus')).toBeGreaterThan(cell.indexOf('&.guideCore'));
    });

    it('never lets the guide hide work the user has already done', () => {
        const cell = stripComments(read(CELL));
        const assignedAvoid = cell.slice(cell.indexOf('&.assigned.guideAvoid'));
        const opacity = Number(assignedAvoid.match(/opacity:\s*([\d.]+)/)?.[1]);

        expect(opacity).toBeGreaterThanOrEqual(0.7);
    });

    it('lifts the unassigned dimming for both lit tiers', () => {
        // A core sound the script has NOT got is the most useful thing on the
        // chart; leaving it at the unassigned 0.6 would bury exactly that.
        const cell = stripComments(read(CELL));
        expect(cell).toMatch(/&\.unassigned\.guideCore,\s*&\.unassigned\.guideFlavour\s*\{[^}]*opacity:\s*1/);
    });
});
