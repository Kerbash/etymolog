/**
 * Canvas selection model — the entry list the canvas edits, with PINS.
 *
 * The canvas is ENTRY-based: `ids` is the spelling in order, one number per
 * `glyph_order` entry (a grapheme id, or a negative virtual-glyph id for an
 * IPA character / space / boundary). A pinned variant (`grapheme-12@34`,
 * BLOCK_SCRIPT_PLAN §2.3) is a property of ONE entry, so it is kept in a
 * PARALLEL array aligned by position:
 *
 *     ids:  [ 12,   5,  -9 ]      → glyph_order ["grapheme-12@34", "grapheme-5", "a"]
 *     pins: [ 34, null, null ]
 *
 * Why a parallel array rather than `{ id, variantId }` items: the insertion
 * strategies (`strategies/insertionStrategies.ts`, and any custom strategy a
 * caller passes) are typed over `number[]` and stay UNTOUCHED. The price is
 * keeping `pins` aligned when a strategy inserts or removes — done here by
 * running the strategy a second time over position TOKENS (see `carryPins`),
 * which tracks every entry's identity exactly for any strategy that treats
 * ids as opaque (all the built-in ones).
 *
 * Invariant: `pins.length === ids.length`. Pure module, no React.
 *
 * @module glyphCanvasInput/utils/selectionModel
 */

import type { InsertionResult, InsertionStrategy } from '../types';

export interface CanvasSelection {
    /** Entry ids in spelling order (grapheme id, or negative virtual-glyph id). */
    readonly ids: number[];
    /** Pinned variant per entry, aligned with `ids`; `null` = choose automatically. */
    readonly pins: readonly (number | null)[];
}

export interface SelectionOpResult {
    selection: CanvasSelection;
    cursor: number | null;
}

/** A selection with no pins. */
export function selectionFromIds(ids: number[]): CanvasSelection {
    return { ids, pins: ids.map(() => null) };
}

/** True when any entry carries a pin. */
export function hasPins(selection: CanvasSelection): boolean {
    return selection.pins.some((pin) => pin !== null);
}

/**
 * Re-align pins after a strategy produced `real` from `prev`.
 *
 * `runOnTokens` re-runs the SAME operation over position tokens (`0..n-1`,
 * with `n` standing for the newly inserted entry). For a strategy that treats
 * ids as opaque the token result is the exact provenance of every output
 * position, so each pin follows its own entry — including between identical
 * graphemes (`[k@7, k]` with a front-removing strategy keeps the SECOND k's
 * "no pin", which a naive prefix diff would get wrong).
 *
 * If a custom strategy looks at the ids (a rule-based one could), the token
 * run may disagree with the real one; then pins survive only on the common
 * prefix and suffix of old and new — never on an entry whose identity is
 * uncertain.
 */
function carryPins(
    prev: CanvasSelection,
    real: InsertionResult,
    runOnTokens: (tokens: number[], newToken: number) => InsertionResult,
    insertedId: number | null,
): SelectionOpResult {
    const next = real.selection;
    if (!hasPins(prev)) {
        return { selection: selectionFromIds(next), cursor: real.cursor };
    }

    const n = prev.ids.length;
    const tokens = prev.ids.map((_, index) => index);
    const traced = runOnTokens(tokens, n).selection;
    const tracedIds = traced.map((token) => (token === n ? insertedId : prev.ids[token]));
    const exact = tracedIds.length === next.length && tracedIds.every((id, index) => id === next[index]);
    if (exact) {
        return {
            selection: { ids: next, pins: traced.map((token) => (token === n ? null : prev.pins[token] ?? null)) },
            cursor: real.cursor,
        };
    }

    // Fallback: keep pins only where old and new provably agree.
    const pins: (number | null)[] = next.map(() => null);
    let prefix = 0;
    while (prefix < n && prefix < next.length && prev.ids[prefix] === next[prefix]) {
        pins[prefix] = prev.pins[prefix] ?? null;
        prefix += 1;
    }
    let suffix = 0;
    while (
        suffix < n - prefix &&
        suffix < next.length - prefix &&
        prev.ids[n - 1 - suffix] === next[next.length - 1 - suffix]
    ) {
        pins[next.length - 1 - suffix] = prev.pins[n - 1 - suffix] ?? null;
        suffix += 1;
    }
    return { selection: { ids: next, pins }, cursor: real.cursor };
}

/** `strategy.insert`, with pins carried. The new entry is unpinned. */
export function insertWithStrategy(
    strategy: InsertionStrategy,
    prev: CanvasSelection,
    glyphId: number,
    cursor: number | null,
): SelectionOpResult {
    const real = strategy.insert(prev.ids, glyphId, cursor);
    return carryPins(prev, real, (tokens, newToken) => strategy.insert(tokens, newToken, cursor), glyphId);
}

/** `strategy.remove`, with pins carried. */
export function removeWithStrategy(
    strategy: InsertionStrategy,
    prev: CanvasSelection,
    cursor: number | null,
): SelectionOpResult {
    const real = strategy.remove(prev.ids, cursor);
    return carryPins(prev, real, (tokens) => strategy.remove(tokens, cursor), null);
}

/**
 * Set (or with `null`, strip) the pin of the entry at `index`. Always returns
 * a NEW selection with a NEW `ids` array, so identity-keyed effects (the
 * change effect, `useEditedSinceMount`) see the edit even though the entry
 * list itself did not change.
 */
export function setPinAt(prev: CanvasSelection, index: number, variantId: number | null): CanvasSelection {
    if (index < 0 || index >= prev.ids.length) return prev;
    const pins = prev.pins.slice();
    pins[index] = variantId;
    return { ids: prev.ids.slice(), pins };
}

/** Insert an unpinned entry at a POSITION (0 = before the first entry). */
export function insertAt(prev: CanvasSelection, index: number, id: number): CanvasSelection {
    const at = Math.max(0, Math.min(index, prev.ids.length));
    return {
        ids: [...prev.ids.slice(0, at), id, ...prev.ids.slice(at)],
        pins: [...prev.pins.slice(0, at), null, ...prev.pins.slice(at)],
    };
}

/** Remove the entry at `index` (no-op when out of range). */
export function removeAt(prev: CanvasSelection, index: number): CanvasSelection {
    if (index < 0 || index >= prev.ids.length) return prev;
    return {
        ids: [...prev.ids.slice(0, index), ...prev.ids.slice(index + 1)],
        pins: [...prev.pins.slice(0, index), ...prev.pins.slice(index + 1)],
    };
}
