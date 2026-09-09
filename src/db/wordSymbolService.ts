/**
 * Word Symbol Service (Phase 3, UC-B1)
 * ------------------------------------
 * A "word symbol" is a whole-word logograph: ONE drawn-or-imported symbol that
 * IS the word, rather than a spelling composed from graphemes. Under the hood
 * it is still an ordinary glyph → grapheme pair — a logogram grapheme with a
 * single glyph — so every downstream surface (spelling render, delete flow,
 * export/import) treats it exactly like any other grapheme with no special
 * case. What makes it a "symbol" is only that the word's `glyph_order` is
 * exactly that one grapheme and its category is `'logogram'`; that pair is what
 * {@link wordSymbolGraphemeId} recognises so the word form can reopen the word
 * in Symbol mode.
 *
 * Both writers run in ONE `withTransaction` (savepoint-nested, since the glyph
 * and grapheme service creators open their own): a failure anywhere — including
 * a failure in the composite lexicon create that calls {@link createWordSymbol}
 * from inside its own transaction — rolls the whole thing back, so a half-made
 * symbol never leaves an orphan glyph or grapheme behind.
 *
 * The SVG is sanitised by the glyph service on the way in (`createGlyph` /
 * `updateGlyph` both call `sanitizeSvg`), the same path a drawn glyph takes.
 */

import { getDatabase } from './database';
import { withTransaction } from './utils/transaction';
import { validateStringLength, LIMITS } from './utils/sanitize';
import { extractGraphemeId, type SpellingEntry } from './utils/spellingUtils';
import { createGlyph, updateGlyph } from './glyphService';
import { createGrapheme, getGlyphsByGraphemeId, getGraphemeById } from './graphemeService';

/**
 * The category stamped on both the glyph and the grapheme of a word symbol.
 * It is what marks the pair as a whole-word logograph (and what phoneme-less,
 * chart-absent means in practice) and what the edit-mode inference keys on.
 */
export const WORD_SYMBOL_CATEGORY = 'logogram';

/** Input for creating a word symbol. */
export interface CreateWordSymbolInput {
    /** Symbol name — defaults, at the caller, to the word's display name. */
    name: string;
    /** The symbol SVG (a drawing or an imported image). */
    svgData: string;
}

/** The backing glyph + grapheme ids a word symbol resolves to. */
export interface WordSymbolRefs {
    glyphId: number;
    graphemeId: number;
}

/**
 * Create the backing glyph + grapheme for a whole-word symbol in ONE
 * transaction and return their ids. Both rows are stamped
 * {@link WORD_SYMBOL_CATEGORY}; the grapheme carries no phonemes (a logograph
 * has no sound of its own), so it is invisible to the IPA/syllabary charts by
 * construction.
 *
 * @throws if the name is blank/over-length or the SVG is empty.
 */
export function createWordSymbol(input: CreateWordSymbolInput): WordSymbolRefs {
    const name = input.name.trim();
    if (!name) {
        throw new Error('A word symbol needs a name');
    }
    validateStringLength(name, LIMITS.GRAPHEME_NAME, 'Symbol name');

    const svg = input.svgData?.trim() ?? '';
    if (!svg) {
        throw new Error('A word symbol needs a drawing or an image');
    }

    const db = getDatabase();
    return withTransaction(db, () => {
        // `createGlyph` sanitises + length-validates the SVG; `createGrapheme`
        // links the single glyph at position 0. Both nest as savepoints under
        // this transaction, so either failing (or the caller's outer create
        // failing) unwinds the pair together.
        //
        // The backing glyph + grapheme are ALWAYS created at ROOT (no
        // `folder_id`): folder ids never translate across domains, so a word's
        // lexicon folder has no meaning for its auto-created glyph/grapheme.
        // Decided in the tree-explorer epic — do not thread a folder through here.
        const glyph = createGlyph({ name, svg_data: svg, category: WORD_SYMBOL_CATEGORY });
        const grapheme = createGrapheme({
            name,
            category: WORD_SYMBOL_CATEGORY,
            glyphs: [{ glyph_id: glyph.id, position: 0 }],
        });
        return { glyphId: glyph.id, graphemeId: grapheme.id };
    });
}

/**
 * Replace the drawing of an existing word symbol: find the grapheme's single
 * glyph and update its `svg_data` (sanitised). Used when a symbol word is
 * edited and its drawing changed.
 *
 * @throws if the grapheme is missing or has no glyph.
 */
export function updateWordSymbolDrawing(graphemeId: number, svgData: string): WordSymbolRefs {
    const svg = svgData?.trim() ?? '';
    if (!svg) {
        throw new Error('A word symbol needs a drawing or an image');
    }

    const db = getDatabase();
    return withTransaction(db, () => {
        if (!getGraphemeById(graphemeId)) {
            throw new Error(`Grapheme ${graphemeId} not found`);
        }
        const glyphs = getGlyphsByGraphemeId(graphemeId);
        if (glyphs.length === 0) {
            throw new Error(`Grapheme ${graphemeId} has no glyph to update`);
        }
        // A word symbol has exactly one glyph; if a grapheme somehow has more,
        // the first (position 0) is the one that carries the symbol drawing.
        const glyph = glyphs[0];
        updateGlyph(glyph.id, { svg_data: svg });
        return { glyphId: glyph.id, graphemeId };
    });
}

/**
 * Edit-mode inference: if `glyphOrder` is EXACTLY one grapheme reference whose
 * grapheme is a `'logogram'`, return that grapheme id — the word is a symbol
 * word and the form should open in Symbol mode. Otherwise null (Compose mode).
 *
 * Pure and lookup-driven so it is trivially testable and free of a DB read at
 * the call site (the word form already holds every grapheme's category in
 * `graphemesComplete`).
 *
 * @param glyphOrder the word's spelling entries (`deserializeGlyphOrder` output)
 * @param categoryOf  grapheme id → its category (or null/undefined if unknown)
 */
export function wordSymbolGraphemeId(
    glyphOrder: readonly SpellingEntry[],
    categoryOf: (graphemeId: number) => string | null | undefined,
): number | null {
    if (glyphOrder.length !== 1) return null;
    const graphemeId = extractGraphemeId(glyphOrder[0]);
    if (graphemeId === null) return null;
    return categoryOf(graphemeId) === WORD_SYMBOL_CATEGORY ? graphemeId : null;
}
