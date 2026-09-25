/**
 * Block script — compose one block into one SVG (plan §3.3).
 *
 * Output is a single `<svg viewBox="0 0 100 100">` document. Each template
 * slot becomes one nested `<svg>` at `rect × 100` holding the chosen variant
 * of the grapheme in that slot (its glyphs combined into a row when there are
 * several), or the text stand-in for an IPA (virtual) entry. A slot holding
 * several entries (slot counts) splits its rectangle into one part per entry,
 * side by side or stacked, each part sized by the SHAPE of its sign (a wide
 * sign in a row gets more width than a narrow one — `partWeight`); an empty
 * optional slot draws nothing. Each cell is placed by its slot's `pin` (one of
 * nine positions) and `fill` (`'fit'` shrinks the sign inside the box, `'fill'`
 * grows it to span the box and lets the rest overflow) — see `nestPart`.
 * Cells are drawn in PATTERN order, so a later role paints over an earlier
 * one where rectangles overlap (overlap is allowed — infixes).
 *
 * Rendering never fails: a slot asking for a variant group the grapheme has no
 * variant in draws the default variant and reports `missingGroup: true`; a
 * grapheme with no glyph data draws an empty cell.
 *
 * Deterministic: the same inputs always produce the same string.
 *
 * @module blocks/compose
 */

import { combineSvgRow, textSvg, type SvgAlign, type SvgPlacement } from '../db/utils/svgCompose';
import { GLYPH_GUIDE_INSET } from '../db/utils/glyphMetrics';
import { estimateInkBounds, nestSvgToInk } from '../db/utils/svgInkBounds';
import { resolveEntryGrapheme } from './classify';
import { LONE_CONSONANT_TEMPLATE_ID } from './validate';
import type {
    BlockGraphemeIndex,
    BlockGraphemeInfo,
    BlockLeftovers,
    BlockScheme,
    BlockSegment,
    BlockSpellingEntry,
    ComposedBlock,
    ComposedSlot,
    LeftoverPlacement,
    SlotFill,
    SlotPin,
} from './types';

/**
 * A slot's `pin` mapped to the align half of `preserveAspectRatio`
 * (BLOCK_PLACEMENT_PLAN.md §2). `'center'` → `xMidYMid`, exactly the drawing
 * before pins existed.
 */
const PIN_ALIGN: Record<SlotPin, SvgAlign> = {
    'top-left': 'xMinYMin',
    top: 'xMidYMin',
    'top-right': 'xMaxYMin',
    left: 'xMinYMid',
    center: 'xMidYMid',
    right: 'xMaxYMid',
    'bottom-left': 'xMinYMax',
    bottom: 'xMidYMax',
    'bottom-right': 'xMaxYMax',
};

/** A slot's pin + fill mapped to an `SvgPlacement` (`'fill'` → `slice`, else `meet`). */
function slotPlacement(pin: SlotPin, fill: SlotFill): SvgPlacement {
    return { align: PIN_ALIGN[pin], scale: fill === 'fill' ? 'slice' : 'meet' };
}

/** The coordinate space of a composed block. */
export const BLOCK_VIEWBOX_SIZE = 100;

/** The variant chosen for one grapheme occurrence. */
export interface PickedVariant {
    /** `null` when the grapheme carries no `variants` (default only — P5) or has no default row. */
    variantId: number | null;
    glyphs: { svg_data: string }[];
    /** A group was asked for, the grapheme has no variant in it, and no pin applied. */
    missingGroup: boolean;
}

/**
 * Choose which variant of `grapheme` to draw.
 *
 * Precedence: a PINNED variant (`grapheme-12@34`) that exists on the grapheme
 * → the variant in `groupId` (when not `null`) → the default. A pin that no
 * longer exists (deleted variant not yet stripped) is ignored rather than
 * failing. `grapheme.variants` absent ⇒ the default only, drawn from
 * `grapheme.glyphs` (pitfall P5 / P3).
 */
export function pickVariant(
    grapheme: BlockGraphemeInfo,
    groupId: number | null,
    pinnedVariantId?: number | null,
): PickedVariant {
    const variants = grapheme.variants;
    if (variants && variants.length > 0) {
        if (pinnedVariantId !== undefined && pinnedVariantId !== null) {
            const pinned = variants.find((v) => v.id === pinnedVariantId);
            if (pinned) return { variantId: pinned.id, glyphs: pinned.glyphs, missingGroup: false };
        }
        if (groupId !== null) {
            const grouped = variants.find((v) => v.group_id === groupId);
            if (grouped) return { variantId: grouped.id, glyphs: grouped.glyphs, missingGroup: false };
        }
        const fallback = variants.find((v) => v.is_default);
        if (fallback) return { variantId: fallback.id, glyphs: fallback.glyphs, missingGroup: groupId !== null };
    }
    return { variantId: null, glyphs: grapheme.glyphs, missingGroup: groupId !== null };
}

/**
 * One SVG for a variant's glyph list: `''` for none, the glyph itself for one,
 * a combined row (`combineSvgRow`, the same picture `combineSvgStrings` draws)
 * for several. Glyphs with empty `svg_data` are skipped.
 */
export function variantSvg(variantGlyphs: readonly { svg_data: string }[]): string {
    return combineSvgRow(variantGlyphs.map((glyph) => glyph.svg_data).filter((svg) => svg.length > 0));
}

/** A rectangle on the unit square (0..1). */
interface UnitRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Round to 4 decimals and drop float noise (`0.07 * 100` → `7`, not `7.000000000000001`). */
function coord(value: number): number {
    return Math.round(value * BLOCK_VIEWBOX_SIZE * 10_000) / 10_000;
}

/**
 * A slot rect (unit square) mapped into the block's glyph cell: the middle
 * `1 - 2 × GLYPH_GUIDE_INSET` of the 100-unit box. Word layouts advance glyph
 * boxes by the cell, so ink kept inside it never runs into the neighbours.
 */
function cellRect(slot: UnitRect): UnitRect {
    const cell = 1 - 2 * GLYPH_GUIDE_INSET;
    const at = (v: number) => coord(GLYPH_GUIDE_INSET + v * cell);
    return { x: at(slot.x), y: at(slot.y), w: coord(slot.w * cell), h: coord(slot.h * cell) };
}

/** A part rect (unit square) in full-box coordinates. */
function fullBoxRect(part: UnitRect): UnitRect {
    return { x: coord(part.x), y: coord(part.y), w: coord(part.w), h: coord(part.h) };
}

/**
 * One drawn cell: bare ink placed in the part's glyph-cell rect per the slot's
 * `pin` (align) and `fill` (`'fit'` = `meet`, shrinks inside; `'fill'` = `slice`
 * + `overflow="visible"`, grows to span the box and spills past its edges). A
 * source whose ink cannot be measured keeps its whole canvas (margins included)
 * and so the part's full-box rect, placed the same way. Omitting `pin`/`fill`
 * (the mark and lone-consonant paths) draws `center`/`fit` — byte-identical to
 * the `xMidYMid meet` cell drawn before placement existed (pitfall P1).
 */
function nestPart(svg: string, part: UnitRect, pin: SlotPin = 'center', fill: SlotFill = 'fit'): string {
    return nestSvgToInk(svg, cellRect(part), fullBoxRect(part), slotPlacement(pin, fill));
}

/** The stable identity of one spelling entry, as its raw `glyph_order` value would read. */
function entryKeyOf(entry: BlockSpellingEntry): string {
    if (entry.type === 'grapheme' && entry.grapheme) {
        const pin = entry.variantId;
        return pin !== undefined && pin !== null ? `grapheme-${entry.grapheme.id}@${pin}` : `grapheme-${entry.grapheme.id}`;
    }
    return `ipa:${entry.ipaCharacter ?? ''}`;
}

/**
 * Bounds on a part's share weight. Without them one very wide sign (a long
 * horizontal stroke) would squeeze its neighbours to slivers, and a very
 * narrow one would vanish; a shape can win at most 2.5× the room of an
 * average one and never less than 0.4×.
 */
const MIN_PART_WEIGHT = 0.4;
const MAX_PART_WEIGHT = 2.5;

/**
 * How much of a shared slot one sign should get, from its ink's shape: along a
 * `'row'` its aspect (width / height), down a `'column'` the inverse — so
 * every sign ends up drawn at a similar size once `meet` fits it into its
 * part, instead of a wide sign shrinking to fit an equal square-ish share.
 * A sign whose ink cannot be measured (IPA text stand-ins, `transform`s, an
 * empty cell) weighs 1: it keeps the average share rather than a guess.
 */
function partWeight(svg: string, arrange: 'row' | 'column'): number {
    const ink = svg ? estimateInkBounds(svg) : null;
    if (!ink || !(ink.width > 0) || !(ink.height > 0)) return 1;
    const ratio = arrange === 'column' ? ink.height / ink.width : ink.width / ink.height;
    return Math.min(MAX_PART_WEIGHT, Math.max(MIN_PART_WEIGHT, ratio));
}

/**
 * Cut a slot rect into one part per weight, in order: `'row'` across (left to
 * right, widths ∝ weights), `'column'` down (top to bottom, heights ∝
 * weights). For ONE part it is the rect itself, exactly — so a one-sign slot
 * draws the same bytes it did before slots could hold several (P1).
 */
function partRects(slot: UnitRect, weights: readonly number[], arrange: 'row' | 'column'): UnitRect[] {
    if (weights.length <= 1) return [{ x: slot.x, y: slot.y, w: slot.w, h: slot.h }];
    const total = weights.reduce((sum, w) => sum + w, 0);
    let before = 0;
    return weights.map((weight) => {
        const from = before / total;
        before += weight;
        const share = weight / total;
        return arrange === 'column'
            ? { x: slot.x, y: slot.y + from * slot.h, w: slot.w, h: share * slot.h }
            : { x: slot.x + from * slot.w, y: slot.y, w: share * slot.w, h: slot.h };
    });
}

/** What one entry draws in one rectangle. */
interface DrawnEntry {
    svg: string;
    variantId: number | null;
    missingGroup: boolean;
    virtual: boolean;
}

function drawEntry(entry: BlockSpellingEntry | undefined, groupId: number | null, index: BlockGraphemeIndex): DrawnEntry {
    if (entry?.type === 'ipa') {
        return { svg: textSvg(entry.ipaCharacter ?? ''), variantId: null, missingGroup: false, virtual: true };
    }
    if (entry) {
        const grapheme = resolveEntryGrapheme(entry, index);
        if (grapheme) {
            const picked = pickVariant(grapheme, groupId, entry.variantId);
            return { svg: variantSvg(picked.glyphs), variantId: picked.variantId, missingGroup: picked.missingGroup, virtual: false };
        }
    }
    return { svg: '', variantId: null, missingGroup: false, virtual: false };
}

/** The outer block document around its cells. */
function blockSvg(cells: readonly string[]): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BLOCK_VIEWBOX_SIZE} ${BLOCK_VIEWBOX_SIZE}">${cells.join('')}</svg>`;
}

/**
 * Compose a `block` segment produced by `segmentEntries` with the SAME scheme.
 *
 * Entries are grouped by the role they fill (`segment.roleIds`, or the
 * pattern one-to-one when absent). A role's slot rectangle is shared by its
 * entries — split along the slot's `arrange`, each part sized by its sign's
 * ink shape (`partWeight`) — and a role
 * with no entries (an empty optional slot) draws nothing.
 *
 * @throws if the segment's template is not in `scheme`, its role ids do not
 *   fit the template's pattern, or (without `roleIds`) its entry count does
 *   not match the pattern — all mean the segment came from a different
 *   scheme, a caller bug rather than bad data.
 */
export function composeBlock(
    segment: BlockSegment,
    entries: readonly BlockSpellingEntry[],
    scheme: BlockScheme,
    index: BlockGraphemeIndex,
): ComposedBlock {
    const template = scheme.templates.find((t) => t.id === segment.templateId);
    if (!template) {
        throw new Error(`composeBlock: template "${segment.templateId}" is not in the scheme`);
    }
    const count = segment.entryIndices.length;
    if (segment.roleIds === undefined && template.pattern.length !== count) {
        throw new Error(
            `composeBlock: template "${template.id}" has ${template.pattern.length} roles but the segment has ${count} entries`,
        );
    }
    const roleIds = segment.roleIds ?? template.pattern;
    if (roleIds.length !== count) {
        throw new Error(`composeBlock: the segment has ${roleIds.length} role ids for ${count} entries`);
    }
    const positionsByRole = new Map<string, number[]>();
    roleIds.forEach((roleId, k) => {
        if (!template.pattern.includes(roleId)) {
            throw new Error(`composeBlock: role "${roleId}" is not in template "${template.id}"'s pattern`);
        }
        const positions = positionsByRole.get(roleId);
        if (positions) positions.push(k);
        else positionsByRole.set(roleId, [k]);
    });

    // Filled per ENTRY position so the report reads in entry order, while
    // cells are drawn in PATTERN order (a later role paints over an earlier one).
    const slots: ComposedSlot[] = new Array<ComposedSlot>(count);
    const cells: string[] = [];
    let containsVirtual = false;

    for (const roleId of template.pattern) {
        const positions = positionsByRole.get(roleId);
        if (!positions) continue;
        // A validated scheme always has the slot; a full-square cell is the
        // same default the validator would have synthesized.
        const slot = template.slots.find((s) => s.roleId === roleId) ?? { roleId, groupId: null, x: 0, y: 0, w: 1, h: 1 };
        const arrange = slot.arrange ?? 'row';
        // Draw every entry first: the parts are sized by what they draw.
        const drawnParts = positions.map((k) => drawEntry(entries[segment.entryIndices[k]], slot.groupId, index));
        // One entry skips the ink measurement entirely — its part is the slot.
        const rects = partRects(
            slot,
            drawnParts.length > 1 ? drawnParts.map((drawn) => partWeight(drawn.svg, arrange)) : [1],
            arrange,
        );

        positions.forEach((k, part) => {
            const entryIndex = segment.entryIndices[k];
            const entry = entries[entryIndex];
            const drawn = drawnParts[part];
            if (drawn.virtual) containsVirtual = true;

            if (drawn.svg) {
                // The template's unit square is the glyph CELL — the guide square
                // in the middle of the box, the part neighbours do not overlap.
                // Bare ink is fitted there; a source whose ink cannot be measured
                // keeps its whole canvas (margins included) and so the whole box.
                cells.push(nestPart(drawn.svg, rects[part], slot.pin ?? 'center', slot.fill ?? 'fit'));
            }
            slots[k] = {
                roleId,
                entryIndex,
                variantId: drawn.variantId,
                missingGroup: drawn.missingGroup,
                entryKey: entry ? entryKeyOf(entry) : 'missing',
            };
        });
    }

    return {
        svg: blockSvg(cells),
        templateId: template.id,
        entryIndices: [...segment.entryIndices],
        slots,
        containsVirtual,
    };
}

// =============================================================================
// LONE CONSONANT + VOWEL-KILLER MARK (SYLLABLE_BLOCKS_PLAN.md §3.4)
// =============================================================================

/**
 * Where the consonant and the mark sit in the unit square for each placement:
 * the mark always takes 30 % of the box along the placement's axis, so it
 * reads as a diacritic rather than a second letter.
 */
const LONE_LAYOUT: Record<LeftoverPlacement, { consonant: UnitRect; mark: UnitRect }> = {
    below: { consonant: { x: 0, y: 0, w: 1, h: 0.7 }, mark: { x: 0, y: 0.7, w: 1, h: 0.3 } },
    above: { consonant: { x: 0, y: 0.3, w: 1, h: 0.7 }, mark: { x: 0, y: 0, w: 1, h: 0.3 } },
    after: { consonant: { x: 0, y: 0, w: 0.7, h: 1 }, mark: { x: 0.7, y: 0, w: 0.3, h: 1 } },
    before: { consonant: { x: 0.3, y: 0, w: 0.7, h: 1 }, mark: { x: 0, y: 0, w: 0.3, h: 1 } },
};

/**
 * Compose a lone consonant (a `single` segment with `consonant: true`) with the
 * scheme's vowel-killer mark into ONE block picture.
 *
 * The consonant draws its default form (or its pinned variant; an IPA
 * consonant its text stand-in); the mark its default form. `null` — the
 * caller then draws the consonant on its own, as without a mark — when the
 * mark grapheme is not in `index` (deleted since the scheme was saved) or the
 * consonant draws nothing. Never throws: this runs in the render path, and a
 * missing mark must degrade, not blank the word.
 */
export function composeLoneConsonant(
    entryIndex: number,
    entries: readonly BlockSpellingEntry[],
    index: BlockGraphemeIndex,
    leftovers: BlockLeftovers,
): ComposedBlock | null {
    const mark = index.get(leftovers.markGraphemeId);
    if (!mark) return null;
    const entry = entries[entryIndex];
    if (!entry) return null;
    const consonant = drawEntry(entry, null, index);
    if (!consonant.svg) return null;
    const markPicked = pickVariant(mark, null, null);
    const markSvg = variantSvg(markPicked.glyphs);

    // An unvalidated placement reads as the default one rather than throwing.
    const layout = LONE_LAYOUT[leftovers.placement] ?? LONE_LAYOUT.below;
    const cells = [nestPart(consonant.svg, layout.consonant)];
    if (markSvg) cells.push(nestPart(markSvg, layout.mark));

    return {
        svg: blockSvg(cells),
        templateId: LONE_CONSONANT_TEMPLATE_ID,
        entryIndices: [entryIndex],
        slots: [{
            roleId: LONE_CONSONANT_TEMPLATE_ID,
            entryIndex,
            variantId: consonant.variantId,
            missingGroup: false,
            entryKey: entryKeyOf(entry),
        }],
        containsVirtual: consonant.virtual,
        mark: { graphemeId: mark.id, variantId: markPicked.variantId, placement: leftovers.placement },
    };
}

/**
 * A stable string identifying a composed block — template id, each slot's
 * role, entry and chosen variant (plus the vowel-killer mark, when there is
 * one) — for `generateVirtualGlyphId(blockKey(b))`.
 * JSON-encoded so no id or IPA character can collide by containing a
 * delimiter.
 */
export function blockKey(composed: ComposedBlock): string {
    const parts: unknown[] = [
        composed.templateId,
        composed.slots.map((slot) => [slot.roleId, slot.entryKey, slot.variantId]),
    ];
    // Only a lone-consonant block has a mark; appending it (rather than always
    // encoding a placeholder) keeps every template block's key byte-identical.
    if (composed.mark) parts.push([composed.mark.graphemeId, composed.mark.variantId, composed.mark.placement]);
    return `block:${JSON.stringify(parts)}`;
}
