/**
 * Scroll-model ratchet for the shell.
 *
 * The shell scrolls the DOCUMENT: <html> owns the only scrollbar, the header
 * is `position: sticky` against the viewport, and pages just grow. Two shared
 * cyber-components the shell is built from ship their own `overflow: auto`,
 * which silently turns them into nested scroll containers:
 *
 *  - `BackgroundComponent` — `overflow-y: auto` + `overscroll-behavior: none`.
 *    As the outermost box its height equals its content, so it can never
 *    scroll, yet a mouse wheel over the page latched onto it and the
 *    `overscroll-behavior` forbade chaining to the document. Symptom: the
 *    wheel only worked with the pointer directly over the scrollbar (which is
 *    <html>'s, outside the box). It also hijacked the sticky header's anchor.
 *  - `BasicBody` — `overflow: auto`, which would add a second scrollbar on
 *    tall pages and clip dropdowns drawn past the content edge.
 *
 * Both are neutralised by app-side overrides (doubled class for deterministic
 * specificity). This test pins those overrides at the source level so a
 * well-meant cleanup cannot quietly bring the dead scroll container back.
 * happy-dom does not compute CSS-module styles, hence a source check.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const shellDir = resolve(__dirname, '..');
const read = (file: string) => readFileSync(resolve(shellDir, file), 'utf8');
// The same file with line and block comments stripped — the comments quote the
// very declarations the negative checks forbid.
const readCode = (file: string) =>
    read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Body of the first `{ ... }` block whose selector matches `selector`. */
function ruleBody(css: string, selector: string): string {
    const start = css.indexOf(selector);
    expect(start, `selector "${selector}" not found`).toBeGreaterThanOrEqual(0);
    const open = css.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < css.length; i += 1) {
        if (css[i] === '{') depth += 1;
        if (css[i] === '}') {
            depth -= 1;
            if (depth === 0) return css.slice(open + 1, i);
        }
    }
    throw new Error(`unterminated rule for "${selector}"`);
}

describe('shell scroll model — the document is the only scroll container', () => {
    it('AppBackground overrides BackgroundComponent with a doubled-class rule', () => {
        const css = read('AppBackground.module.scss');
        const body = ruleBody(css, '.background.background');
        expect(body).toMatch(/overflow:\s*visible/);
        expect(body).toMatch(/overscroll-behavior:\s*auto/);
        expect(body).toMatch(/height:\s*auto/);
        expect(body).toMatch(/min-height:\s*100dvh/);
    });

    it('AppBackground never re-introduces a scroll container', () => {
        const css = readCode('AppBackground.module.scss');
        expect(css).not.toMatch(/overflow(-y)?:\s*(auto|scroll|hidden)/);
        expect(css).not.toMatch(/overscroll-behavior(-y)?:\s*(none|contain)/);
        // A fixed height would make the background the scroller again.
        expect(css).not.toMatch(/(?<!min-)height:\s*100(dvh|vh|%)/);
    });

    it('AppNav keeps BasicBody from becoming a nested scroller', () => {
        const css = read('AppNav.module.scss');
        expect(ruleBody(css, '.body.body')).toMatch(/overflow:\s*visible/);
    });
});
