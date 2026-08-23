/**
 * Glyph metrics — the ONE place the glyph box is divided into cell and margin.
 *
 * A glyph is drawn on a square canvas with a guide square inset from every
 * edge. The guide square is the glyph's CELL: the space the letter reserves in
 * a word. Everything outside it is MARGIN: room a letter may reach into, but
 * does not own — when letters are laid out, each one advances by its cell
 * only, so its margins overlap its neighbours' margins and a tail or an
 * accent drawn there lands beside the next letter rather than pushing it away.
 *
 * Two consumers must agree on the split or the result is nonsense:
 *
 *  - the drawing canvas (`GlyphFormFields` → `SvgDrawerInput` → cyber
 *    `SvgDrawer`), which paints the guide square the author draws inside;
 *  - the layout engine (`display/spelling/strategies/*`, and through its
 *    adapter the glyph-canvas input), which advances by the cell.
 *
 * Both read these constants. Nothing else should restate the number.
 */

/**
 * The margin on EACH side of the glyph box, as a fraction of the box.
 *
 * 0.25 leaves the central half of the canvas as the cell. It was 0.2 (a 60px
 * margin on the 300px canvas); the margin was widened so letters have real
 * room to influence their neighbours.
 */
export const GLYPH_GUIDE_INSET = 0.25;

/**
 * The cell — the part of the glyph box a letter reserves — as a fraction of
 * the box. Derived, never set by hand.
 */
export const GLYPH_CELL_FRACTION = 1 - 2 * GLYPH_GUIDE_INSET;
