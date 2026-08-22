/**
 * @fileoverview The generator's source of randomness — all of it.
 *
 * Every batch is reproducible: the user is shown the seed, the "same seed"
 * button re-runs it, and a test asserts that a seed and a profile determine the
 * words exactly. That contract holds only if there is ONE place non-determinism
 * can enter, so this module is it: {@link randomSeed} is the single function in
 * `src/generator/` allowed to read the clock or the platform generator, and a
 * ratchet test greps the engine to keep it that way.
 *
 * Everything else takes an `rng` — a zero-argument function returning a number
 * in [0, 1) — as an argument. That is deliberately the same shape the platform
 * generator has, so a caller CAN pass an unseeded one and a test cannot tell the
 * difference by accident; the ratchet is what makes it a rule rather than a
 * convention.
 *
 * @module generator/engine/random
 */

/** A seeded random source: a function returning a number in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32 — a 32-bit seeded generator.
 *
 * Chosen because it is eleven lines, has no dependency, passes gjrand's smoke
 * tests, and — the property that actually matters here — gives visibly
 * different streams for neighbouring seeds. A user pressing "new seed" gets
 * consecutive-ish clock values; a generator that decorrelates poorly would hand
 * them the same batch twice and look broken.
 *
 * The seed is coerced with `>>> 0`: a negative, fractional or out-of-range
 * number is a legal thing for a hand-edited URL or a settings file to contain,
 * and every one of them has to land on a defined 32-bit state rather than on
 * `NaN` (which would poison the stream into returning `NaN` forever).
 */
export function createRng(seed: number): Rng {
    let state = (Number.isFinite(seed) ? seed : 0) >>> 0;
    return function next(): number {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Pick one item in proportion to its weight, or `null` when nothing can be
 * picked.
 *
 * `null` rather than a throw: an empty pool is a NORMAL state in this engine (a
 * class with no members in the user's inventory, a vowel pool emptied by
 * harmony), and the caller's answer to it is "abandon this attempt", not "crash
 * the page". A weight that is not a finite positive number is treated as zero —
 * a `NaN` from a hand-edited profile must not silently swallow the whole pool by
 * poisoning the running total.
 *
 * The rng is consumed EXACTLY ONCE per call, whatever the outcome, so that a
 * caller can reason about the stream: two runs that make the same sequence of
 * picks over the same pools see the same numbers.
 */
export function pickWeighted<T>(
    rng: Rng,
    items: readonly T[],
    weightOf: (item: T) => number,
): T | null {
    let total = 0;
    for (const item of items) {
        const weight = weightOf(item);
        if (Number.isFinite(weight) && weight > 0) total += weight;
    }
    // The draw happens even when the pool is unusable, so that an empty pool
    // does not shift the stream for every later pick.
    const roll = rng();
    if (total <= 0) return null;

    let target = roll * total;
    for (const item of items) {
        const weight = weightOf(item);
        if (!Number.isFinite(weight) || weight <= 0) continue;
        target -= weight;
        if (target < 0) return item;
    }
    // Floating-point drift can leave `target` at exactly 0 after the last
    // subtraction; the last positive-weight item is the honest answer.
    for (let i = items.length - 1; i >= 0; i -= 1) {
        const weight = weightOf(items[i]);
        if (Number.isFinite(weight) && weight > 0) return items[i];
    }
    return null;
}

/**
 * A whole number in `[min, max]`, both ends included.
 *
 * Inclusive because every caller here is picking a COUNT or an index into a
 * range the user typed ("2 to 4 syllables"), and an exclusive upper bound would
 * mean every one of them writing `max + 1`. A reversed or non-finite range is
 * clamped rather than rejected: the profile validator has already bounded these,
 * and a second failure mode here would only be a second thing to get wrong.
 */
export function pickInt(rng: Rng, min: number, max: number): number {
    const low = Math.ceil(Number.isFinite(min) ? min : 0);
    const high = Math.floor(Number.isFinite(max) ? max : low);
    if (high <= low) return low;
    const span = high - low + 1;
    const value = low + Math.floor(rng() * span);
    // `rng()` is specified as < 1, but a caller may pass their own; clamping
    // costs nothing and keeps an out-of-range source from returning `high + 1`.
    return value > high ? high : value;
}

/**
 * A fresh 32-bit seed.
 *
 * THE ONLY non-deterministic function in `src/generator/`. The clock alone
 * would give near-identical seeds to two batches a second apart (and mulberry32
 * decorrelates them, but the SEED is shown to the user and two that differ in
 * the last digit look like a bug); the platform generator alone would be
 * untraceable in a bug report. Mixing both gives a number that is both spread
 * out and roughly ordered in time.
 */
export function randomSeed(): number {
    return (Date.now() ^ (Math.random() * 0x100000000)) >>> 0;
}
