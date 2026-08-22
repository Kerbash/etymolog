/**
 * Virtual glyph identity — THE one hash.
 *
 * A virtual glyph stands in for an IPA character that has no real grapheme.
 * Its id must be (a) negative, so it can never collide with a database id,
 * and (b) identical everywhere the same character is seen — the auto-speller,
 * the canvas input and the display normaliser all build maps keyed by it, and
 * two different hashes used to live in two of those modules, so lookups missed.
 *
 * djb2 over UTF-16 code units, folded to 31 bits. No modulo bucketing: the
 * old `% 1_000_000` made collisions between distinct characters plausible.
 */

const DJB2_SEED = 5381;

export function generateVirtualGlyphId(ipaCharacter: string): number {
    let hash = DJB2_SEED;
    for (let i = 0; i < ipaCharacter.length; i++) {
        hash = ((hash << 5) + hash) ^ ipaCharacter.charCodeAt(i);
    }
    // Fold to a positive 31-bit integer, then negate (and shift past -0 / -1 ambiguity).
    const folded = (hash >>> 0) & 0x7fffffff;
    return -(folded + 1);
}

/** Virtual glyphs always have negative ids; database rows always have positive ones. */
export function isVirtualGlyphId(id: number): boolean {
    return id < 0;
}
