/**
 * The seeded random source.
 *
 * Two things are being pinned here. The obvious one is that a seed determines
 * the stream. The one that actually protects the feature is the RATCHET at the
 * bottom: the whole engine is deterministic only for as long as nobody reaches
 * for the platform generator in the middle of it, and that is a one-line change
 * that reviews perfectly well.
 *
 * Node environment.
 */

/// <reference types="node" />

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { createRng, pickInt, pickWeighted, randomSeed } from '../random';

/** Draw `count` numbers off a fresh generator. */
function stream(seed: number, count = 20): number[] {
    const rng = createRng(seed);
    return Array.from({ length: count }, () => rng());
}

describe('createRng', () => {
    it('gives the same stream for the same seed', () => {
        expect(stream(12345)).toEqual(stream(12345));
    });

    it('gives a different stream for a different seed', () => {
        expect(stream(1)).not.toEqual(stream(2));
    });

    it('decorrelates neighbouring seeds — a "new seed" button hands out clock-adjacent values', () => {
        const a = stream(1_700_000_000, 10);
        const b = stream(1_700_000_001, 10);
        const shared = a.filter((value, index) => value === b[index]);
        expect(shared).toEqual([]);
    });

    it('stays inside [0, 1)', () => {
        for (const seed of [0, 1, 7, 99991, 0xffffffff]) {
            for (const value of stream(seed, 500)) {
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThan(1);
            }
        }
    });

    it('coerces a hostile seed to a 32-bit state instead of poisoning the stream', () => {
        for (const seed of [-1, 2.5, -0.75, 2 ** 40, Number.NaN, Number.POSITIVE_INFINITY]) {
            const values = stream(seed, 5);
            for (const value of values) expect(Number.isFinite(value)).toBe(true);
        }
    });

    it('treats seeds that share a 32-bit truncation as the same seed', () => {
        // `>>> 0` is the documented coercion, so this is behaviour rather than
        // an accident: a caller cannot get a "different" batch out of 1 and 2^32+1.
        expect(stream(1, 5)).toEqual(stream(2 ** 32 + 1, 5));
    });

    it('spreads roughly evenly over the unit interval', () => {
        const buckets = new Array<number>(10).fill(0);
        const rng = createRng(2026);
        for (let i = 0; i < 10_000; i += 1) buckets[Math.floor(rng() * 10)] += 1;
        for (const count of buckets) {
            expect(count).toBeGreaterThan(700);
            expect(count).toBeLessThan(1300);
        }
    });
});

describe('pickWeighted', () => {
    const items = [{ name: 'a', weight: 3 }, { name: 'b', weight: 1 }];

    it('returns null for an empty pool rather than throwing', () => {
        expect(pickWeighted(createRng(1), [], () => 1)).toBeNull();
    });

    it('returns null when every weight is zero or negative', () => {
        expect(pickWeighted(createRng(1), items, () => 0)).toBeNull();
        expect(pickWeighted(createRng(1), items, () => -5)).toBeNull();
    });

    it('ignores a NaN weight instead of swallowing the whole pool', () => {
        const poisoned = [{ name: 'bad', weight: Number.NaN }, { name: 'good', weight: 1 }];
        for (let seed = 0; seed < 20; seed += 1) {
            expect(pickWeighted(createRng(seed), poisoned, (item) => item.weight)?.name).toBe('good');
        }
    });

    it('respects the weights over many draws', () => {
        const rng = createRng(4242);
        let a = 0;
        for (let i = 0; i < 4000; i += 1) {
            if (pickWeighted(rng, items, (item) => item.weight)?.name === 'a') a += 1;
        }
        // 3:1 means 75%; the band is wide enough that only a real bug trips it.
        expect(a / 4000).toBeGreaterThan(0.71);
        expect(a / 4000).toBeLessThan(0.79);
    });

    it('always picks the only positively weighted item', () => {
        const one = [{ name: 'only', weight: 2 }, { name: 'off', weight: 0 }];
        for (let seed = 0; seed < 30; seed += 1) {
            expect(pickWeighted(createRng(seed), one, (item) => item.weight)?.name).toBe('only');
        }
    });

    it('consumes exactly one number whatever the outcome', () => {
        // The stream must not shift depending on whether a pool was usable, or
        // two profiles that differ only in an empty class would diverge.
        const withPool = createRng(9);
        pickWeighted(withPool, items, (item) => item.weight);
        const withoutPool = createRng(9);
        pickWeighted(withoutPool, [], () => 1);
        expect(withPool()).toBe(withoutPool());
    });
});

describe('pickInt', () => {
    it('includes both ends', () => {
        const seen = new Set<number>();
        const rng = createRng(11);
        for (let i = 0; i < 500; i += 1) seen.add(pickInt(rng, 1, 3));
        expect([...seen].sort()).toEqual([1, 2, 3]);
    });

    it('never leaves the range', () => {
        const rng = createRng(3);
        for (let i = 0; i < 2000; i += 1) {
            const value = pickInt(rng, 2, 5);
            expect(value).toBeGreaterThanOrEqual(2);
            expect(value).toBeLessThanOrEqual(5);
        }
    });

    it('returns the single value when min equals max', () => {
        expect(pickInt(createRng(1), 4, 4)).toBe(4);
    });

    it('clamps a reversed or non-finite range instead of returning NaN', () => {
        expect(pickInt(createRng(1), 5, 2)).toBe(5);
        expect(Number.isFinite(pickInt(createRng(1), Number.NaN, 3))).toBe(true);
    });

    it('clamps a source that hands back 1', () => {
        expect(pickInt(() => 1, 1, 3)).toBe(3);
    });
});

describe('randomSeed', () => {
    it('produces a 32-bit unsigned integer', () => {
        for (let i = 0; i < 50; i += 1) {
            const seed = randomSeed();
            expect(Number.isInteger(seed)).toBe(true);
            expect(seed).toBeGreaterThanOrEqual(0);
            expect(seed).toBeLessThanOrEqual(0xffffffff);
        }
    });

    it('does not hand out the same seed twice in a row', () => {
        const seeds = new Set(Array.from({ length: 40 }, () => randomSeed()));
        expect(seeds.size).toBeGreaterThan(35);
    });
});

// =============================================================================
// The ratchet
// =============================================================================

const ENGINE = resolve(__dirname, '..');

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

/** How many times `needle` appears in `haystack`. */
function occurrences(haystack: string, needle: string): number {
    let count = 0;
    let index = haystack.indexOf(needle);
    while (index !== -1) {
        count += 1;
        index = haystack.indexOf(needle, index + needle.length);
    }
    return count;
}

describe('the engine names the platform random source exactly once', () => {
    const SOURCES = collectSources(ENGINE);

    it('found the engine modules it is supposed to police', () => {
        const names = SOURCES.map((file) => relative(ENGINE, file).split(sep).join('/'));
        expect(names.sort()).toEqual([
            'constraints.ts', 'generate.ts', 'index.ts', 'normalize.ts', 'random.ts', 'template.ts', 'weights.ts',
        ]);
    });

    it('uses the platform generator only inside randomSeed()', () => {
        const hits = SOURCES
            .map((file) => ({
                name: relative(ENGINE, file).split(sep).join('/'),
                // Assembled rather than written out, so that this test file's own
                // mention of the name cannot be what the scan finds when someone
                // later widens the scan to include tests.
                count: occurrences(readFileSync(file, 'utf8'), `Math.${'random'}`),
            }))
            .filter((entry) => entry.count > 0);
        expect(hits).toEqual([{ name: 'random.ts', count: 1 }]);
    });

    it('reads the clock only inside randomSeed()', () => {
        const hits = SOURCES
            .map((file) => ({
                name: relative(ENGINE, file).split(sep).join('/'),
                count: occurrences(readFileSync(file, 'utf8'), `Date.${'now'}`),
            }))
            .filter((entry) => entry.count > 0);
        expect(hits).toEqual([{ name: 'random.ts', count: 1 }]);
    });

    it('keeps the same rule over the rest of the generator tree', () => {
        const tree = collectSources(resolve(ENGINE, '..'));
        const offenders = tree
            .filter((file) => !file.startsWith(ENGINE + sep))
            .filter((file) => {
                const source = readFileSync(file, 'utf8');
                return occurrences(source, `Math.${'random'}`) > 0 || occurrences(source, `Date.${'now'}`) > 0;
            })
            .map((file) => relative(resolve(ENGINE, '..'), file).split(sep).join('/'));
        expect(offenders).toEqual([]);
    });
});
