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
import { execScalar } from './utils/sql';
import { validateStringLength, LIMITS } from './utils/sanitize';
import { extractGraphemeId, type SpellingEntry } from './utils/spellingUtils';
import { createGlyph, getGlyphById, updateGlyph } from './glyphService';
import { createGrapheme, getGlyphsByGraphemeId, getGraphemeById } from './graphemeService';

/**
 * The category stamped on both the glyph and the grapheme of a word symbol.
 * It is what marks the pair as a whole-word logograph (and what phoneme-less,
 * chart-absent means in practice) and what the edit-mode inference keys on.
 */
export const WORD_SYMBOL_CATEGORY = 'logogram';

/**
 * The category of a MARK: a no-sound sign that is added to other signs — a
 * vowel-killer, an accent, any diacritic — and never stands on its own. It is
 * the OTHER kind of no-sound grapheme (the grapheme form's "No sound" →
 * "A mark"), kept apart from {@link WORD_SYMBOL_CATEGORY} so a mark is never
 * offered as a word's whole spelling. Only the category tells the two kinds
 * apart; both carry no phonemes. See `isMarkGrapheme` /
 * `isLogogramGrapheme` in `components/form/graphemeForm/logogramOption.ts`.
 */
export const MARK_CATEGORY = 'mark';

/**
 * Input for creating a word symbol. EXACTLY ONE source: a new drawing
 * (`svgData`) or a glyph that already exists in the script (`glyphId`).
 */
export interface CreateWordSymbolInput {
    /** Symbol name — defaults, at the caller, to the word's display name. */
    name: string;
    /** The symbol SVG (a drawing or an imported image) — becomes a NEW glyph. */
    svgData?: string;
    /**
     * An existing glyph to use as the logogram. No glyph is created: the glyph
     * is wrapped in a logogram grapheme, or the logogram grapheme that already
     * wraps it on its own is reused (so picking the same glyph for two words
     * yields ONE shared logogram, not two copies).
     */
    glyphId?: number;
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
    const hasGlyph = input.glyphId !== undefined && input.glyphId !== null;
    if (svg && hasGlyph) {
        throw new Error('A word symbol takes a drawing or an existing glyph, not both');
    }
    if (hasGlyph) {
        return logogramForGlyph(input.glyphId!, name);
    }
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
 * The logogram grapheme standing for an EXISTING glyph: the one that already
 * wraps exactly this glyph (a phoneme-less, single-glyph `'logogram'`
 * grapheme), or a new one made now. Reuse is what keeps "pick this glyph as
 * the word's logogram" from minting a duplicate grapheme every time.
 *
 * @throws if the glyph does not exist.
 */
export function logogramForGlyph(glyphId: number, name: string): WordSymbolRefs {
    const db = getDatabase();
    return withTransaction(db, () => {
        if (!getGlyphById(glyphId)) {
            throw new Error(`Glyph ${glyphId} not found`);
        }
        const existing = execScalar<number>(
            db,
            `SELECT g.id FROM graphemes g
               JOIN grapheme_glyphs gg ON gg.grapheme_id = g.id
              WHERE g.category = ? AND gg.glyph_id = ?
                AND (SELECT COUNT(*) FROM grapheme_glyphs x WHERE x.grapheme_id = g.id) = 1
                AND NOT EXISTS (SELECT 1 FROM phonemes p WHERE p.grapheme_id = g.id)
              ORDER BY g.id
              LIMIT 1`,
            [WORD_SYMBOL_CATEGORY, glyphId],
        );
        if (typeof existing === 'number') {
            return { glyphId, graphemeId: existing };
        }
        // Created at ROOT, like every auto-created backing grapheme (see above).
        const grapheme = createGrapheme({
            name,
            category: WORD_SYMBOL_CATEGORY,
            glyphs: [{ glyph_id: glyphId, position: 0 }],
        });
        return { glyphId, graphemeId: grapheme.id };
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
