/**
 * Block rendering context — the block scheme and the grapheme index, for
 * renderers that must work both inside and outside `EtymologProvider`.
 *
 * `GlyphSpellingDisplay` composes block-script blocks from the script's
 * scheme, which lives in the provider. But the display is also rendered with
 * no provider at all (its own unit tests, isolated previews), where the strict
 * `useEtymolog()` would throw. These hooks read a SEPARATE, narrow context
 * with a `null` default instead:
 *
 *   - inside the provider → the live scheme / grapheme map;
 *   - outside            → `null`, and the display renders exactly as it
 *                          always has (no blocks).
 *
 * Why a separate context rather than a slice read off `EtymologContext`: the
 * main context value changes on EVERY refresh (a new word, a folder rename…),
 * and every mounted spelling display — a gallery holds hundreds — would
 * re-render with it. This value is memoised on the two things block rendering
 * reads, so it only changes when the scheme or the graphemes do.
 *
 * Its own module (not `etymologContext.ts`) so tests that `vi.mock` the
 * context barrel do not have to know about it.
 *
 * @module db/context/useOptionalBlockScheme
 */

import { createContext, useContext } from 'react';

import type { BlockScheme } from '../../blocks/types';
import type { GraphemeComplete } from '../types';
import type { LetterSpacingValue } from '../api/types';

export interface BlockRenderingValue {
    /** The script's block scheme (validated; `enabled: false` when none is saved). */
    blockScheme: BlockScheme;
    /** Every grapheme by id, variants included — the same data as `graphemesComplete`. */
    graphemeMap: Map<number, GraphemeComplete>;
    /** The script's letter spacing (`writingSystem.letterSpacing`); `'auto'` keeps each view's preset. */
    letterSpacing: LetterSpacingValue;
}

/** Filled by `EtymologProvider`; `null` outside it. */
export const BlockRenderingContext = createContext<BlockRenderingValue | null>(null);

/**
 * The script's block scheme inside an `EtymologProvider`, `null` outside one.
 * Never throws.
 */
export function useOptionalBlockScheme(): BlockScheme | null {
    return useContext(BlockRenderingContext)?.blockScheme ?? null;
}

/**
 * The provider's grapheme index (`graphemesComplete` by id, variants
 * included), `null` outside a provider. Never throws.
 */
export function useOptionalGraphemeMap(): Map<number, GraphemeComplete> | null {
    return useContext(BlockRenderingContext)?.graphemeMap ?? null;
}

/**
 * The script's letter spacing inside an `EtymologProvider`, `null` outside one.
 * `null` means "no override" — the display keeps its view preset, exactly as
 * `'auto'` does. Never throws.
 */
export function useOptionalLetterSpacing(): LetterSpacingValue | null {
    return useContext(BlockRenderingContext)?.letterSpacing ?? null;
}
