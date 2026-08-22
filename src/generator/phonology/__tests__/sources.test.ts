/**
 * The generator's isolation ratchet — for the WHOLE of `src/generator/`.
 *
 * It lives under `phonology/__tests__` because phonology was the first module
 * to exist, but its scope has always been the entire tree (`GENERATOR` resolves
 * two levels up) and every phase adds its modules to the inventory check below
 * rather than starting a second ratchet — two files policing the same rule is
 * how one of them ends up scanning nothing.
 *
 * `src/generator/**` is meant to be what `src/rules/` is: plain TypeScript that
 * a node test, a worker or a server-side script could run. The moment one module
 * imports React (a hook "just for memoisation"), the db barrel (to read the
 * user's phonemes "directly"), or a component, the whole tree drags a DOM and a
 * sql.js instance behind it — and the import that did it looks completely
 * ordinary in review.
 *
 * So the rule is enforced on the source text: the only thing this module may
 * reach for outside itself is the IPA chart data it derives its table from.
 *
 * Node environment: it reads files rather than rendering anything.
 */

/// <reference types="node" />
//
// `tsconfig.app.json` sets `"types": ["vite/client"]` — app code has no business
// touching the filesystem. Like the token ratchet in `src/styles/__tests__`,
// this is a build-time linter that happens to be written as a test.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const GENERATOR = resolve(__dirname, '..', '..');

/** Every `.ts` file under `src/generator/`, tests excluded, as posix-ish paths. */
function collectSources(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry === '__tests__') continue;
            collectSources(full, acc);
            continue;
        }
        if (entry.endsWith('.ts')) acc.push(full);
    }
    return acc;
}

const SOURCES = collectSources(GENERATOR);

/** Module specifiers in `import`/`export ... from` position. */
function importsOf(source: string): string[] {
    const found: string[] = [];
    const pattern = /(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
    let match = pattern.exec(source);
    while (match !== null) {
        found.push(match[1]);
        match = pattern.exec(source);
    }
    return found;
}

describe('src/generator stays framework-free', () => {
    it('found the source files it is supposed to police', () => {
        // A ratchet that scans nothing passes forever. Every module of every
        // phase is named here, so a directory that stops being collected (a
        // renamed folder, a changed extension) fails loudly instead of quietly
        // dropping out of the scan.
        expect(SOURCES.length).toBeGreaterThanOrEqual(24);
        const names = SOURCES.map((file) => relative(GENERATOR, file).split(sep).join('/'));
        for (const expected of [
            // Phase 1 — phonology core.
            'phonology/features.ts',
            'phonology/tokenize.ts',
            'phonology/sonority.ts',
            'phonology/classes.ts',
            'phonology/index.ts',
            // Phase 2 — profile, presets, coverage, and the template parser.
            'profile/types.ts',
            'profile/defaults.ts',
            'profile/validate.ts',
            'profile/index.ts',
            'presets/types.ts',
            'presets/index.ts',
            'presets/data/flowing.ts',
            'presets/data/island.ts',
            'presets/data/japanese.ts',
            'presets/data/sinitic.ts',
            'presets/data/romance.ts',
            'presets/data/guttural.ts',
            'presets/data/slavic.ts',
            'engine/template.ts',
            'engine/index.ts',
            'coverage.ts',
            'index.ts',
            // Phase 3 — the engine and the inventory.
            'engine/random.ts',
            'engine/weights.ts',
            'engine/constraints.ts',
            'engine/normalize.ts',
            'engine/generate.ts',
            'inventory.ts',
        ]) {
            expect(names).toContain(expected);
        }
    });

    it('policies every directory of the tree, not just phonology', () => {
        const directories = new Set(
            SOURCES
                .map((file) => relative(GENERATOR, file).split(sep).slice(0, -1).join('/'))
                .map((directory) => directory || '.'),
        );
        expect(directories).toEqual(new Set(['.', 'phonology', 'profile', 'presets', 'presets/data', 'engine']));
    });

    it('imports nothing from react, the db layer or a component', () => {
        const offenders: string[] = [];
        for (const file of SOURCES) {
            const name = relative(GENERATOR, file).split(sep).join('/');
            for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
                const banned = specifier === 'react'
                    || specifier.startsWith('react/')
                    || specifier.startsWith('react-')
                    || /(^|\/)\.\.\/db(\/|$)/.test(specifier)
                    || /(^|\/)\.\.\/components(\/|$)/.test(specifier)
                    || specifier.includes('/db/')
                    || specifier.includes('/components/');
                if (banned) offenders.push(`${name} -> ${specifier}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('reaches outside the generator only for the IPA chart data', () => {
        const outside: string[] = [];
        for (const file of SOURCES) {
            const name = relative(GENERATOR, file).split(sep).join('/');
            for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
                if (!specifier.startsWith('.')) {
                    outside.push(`${name} -> ${specifier}`);
                    continue;
                }
                // Resolve the relative specifier and keep the ones that leave
                // `src/generator/`.
                const target = resolve(join(file, '..'), specifier);
                if (!target.startsWith(GENERATOR + sep)) {
                    outside.push(`${name} -> ${relative(resolve(GENERATOR, '..'), target).split(sep).join('/')}`);
                }
            }
        }
        expect(new Set(outside)).toEqual(new Set([
            'phonology/features.ts -> data/ipaChartData',
        ]));
    });
});
