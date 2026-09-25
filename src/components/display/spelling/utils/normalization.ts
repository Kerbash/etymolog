/**
 * Input Normalization Utilities
 *
 * Functions to convert various input formats to RenderableGlyph[].
 *
 * A grapheme expands to N renderable glyphs, so indices in the OUTPUT are not
 * indices in the INPUT. Two fields keep the relationship explicit:
 *   - `sourceIndex` — the index of the input entry a glyph came from
 *   - `role`        — copied from `SpellingDisplayEntry.role`, so layout
 *                     strategies can find separators and line breaks without
 *                     being handed index arrays computed in the wrong space
 *
 * BLOCK SCRIPT (`BLOCK_SCRIPT_PLAN.md` §4). When the context carries an
 * ENABLED block scheme and a grapheme map, a `SpellingDisplayEntry[]` is first
 * segmented by the pure engine (`src/blocks`): each run of entries matched to
 * a template becomes ONE renderable (the composed block SVG, with a `block`
 * report), unmatched entries render as before (honouring a pinned variant),
 * structural entries pass through, and `.` boundaries render nothing. When
 * the scheme sets `leftovers`, a consonant left in no block is composed with
 * the vowel-killer mark into a block renderable of its own (drawn alone, as
 * before, when the mark grapheme no longer exists). Layout
 * strategies therefore see one glyph per block and need no changes.
 *
 * Without an enabled scheme the pre-block code path runs VERBATIM — the output
 * is byte-identical (pinned by `__tests__/normalizationIdentity.test.ts`).
 * Only `SpellingDisplayEntry[]` input is ever composed: `Glyph[]`,
 * `GraphemeComplete[]`, ids and renderables never go through the engine (the
 * Script Maker's per-variant previews rely on that).
 *
 * @module display/spelling/utils/normalization
 */

import type { Glyph, GraphemeComplete, SpellingDisplayEntry } from '../../../../db/types';
import type { RenderableGlyph, NormalizationContext, InputType } from '../types';
import { generateVirtualGlyphId } from '../../../../db/utils/virtualGlyph';
import { textSvg } from '../../../../db/utils/svgCompose';
import {
    blockKey,
    composeBlock,
    composeLoneConsonant,
    LONE_CONSONANT_TEMPLATE_ID,
    pickVariant,
    segmentEntries,
} from '../../../../blocks';
import type { BlockScheme, ComposedBlock } from '../../../../blocks';

/**
 * An invisible `word-break` renderable: a zero-size word boundary carried
 * through normalization so the composed strategy can split words at a hidden
 * separator. It has NO svg (draws nothing) and is not virtual (no dashed-box
 * styling); every non-composed strategy removes it before layout, so it never
 * reaches a renderer.
 */
function createWordBreakGlyph(sourceIndex: number): RenderableGlyph {
    return {
        id: generateVirtualGlyphId('​'),
        name: '',
        svg_data: '',
        isVirtual: false,
        sourceIndex,
        role: 'word-break',
    };
}

function createVirtualGlyph(ipaChar: string, sourceIndex: number, role?: SpellingDisplayEntry['role']): RenderableGlyph {
    return {
        id: generateVirtualGlyphId(ipaChar),
        name: ipaChar,
        svg_data: textSvg(ipaChar),
        isVirtual: true,
        ipaCharacter: ipaChar,
        sourceIndex,
        ...(role ? { role } : {}),
    };
}

function glyphToRenderable(glyph: Glyph, sourceIndex: number, role?: SpellingDisplayEntry['role']): RenderableGlyph {
    return {
        id: glyph.id,
        name: glyph.name,
        svg_data: glyph.svg_data,
        isVirtual: false,
        sourceIndex,
        ...(role ? { role } : {}),
    };
}

/**
 * Detect the input type from the array.
 */
export function detectInputType(input: unknown[]): InputType | 'renderable' | null {
    if (input.length === 0) {
        return null;
    }

    const first = input[0];

    if (typeof first === 'object' && first !== null && 'type' in first) {
        const entry = first as SpellingDisplayEntry;
        if (entry.type === 'grapheme' || entry.type === 'ipa') {
            return 'spelling-display';
        }
    }

    if (typeof first === 'object' && first !== null && 'glyphs' in first && Array.isArray((first as GraphemeComplete).glyphs)) {
        return 'graphemes';
    }

    if (typeof first === 'object' && first !== null && 'isVirtual' in first && 'sourceIndex' in first) {
        return 'renderable';
    }

    if (typeof first === 'object' && first !== null && 'svg_data' in first) {
        return 'glyphs';
    }

    if (typeof first === 'number') {
        return 'ids';
    }

    return null;
}

/**
 * Normalize SpellingDisplayEntry[] to RenderableGlyph[].
 * `sourceIndex` is the index of the ENTRY each glyph came from.
 */
function normalizeSpellingDisplay(
    entries: SpellingDisplayEntry[],
    context: NormalizationContext
): RenderableGlyph[] {
    const scheme = context.blockScheme;
    const graphemeMap = context.graphemeMap;
    if (scheme && scheme.enabled && graphemeMap) {
        return normalizeSpellingWithBlocks(entries, scheme, graphemeMap);
    }

    // ---- The pre-block path, verbatim (byte-identical output; see the module comment).
    const result: RenderableGlyph[] = [];

    entries.forEach((entry, entryIndex) => {
        if (entry.role === 'word-break') {
            // Zero-size boundary: carried through even with no ipaCharacter.
            result.push(createWordBreakGlyph(entryIndex));
        } else if (entry.type === 'grapheme' && entry.grapheme) {
            const fullGrapheme = context.graphemeMap?.get(entry.grapheme.id);
            const glyphs = fullGrapheme?.glyphs ?? (entry.grapheme as GraphemeComplete).glyphs;
            if (glyphs && glyphs.length > 0) {
                for (const glyph of glyphs) {
                    result.push(glyphToRenderable(glyph, entryIndex, entry.role));
                }
            }
        } else if (entry.type === 'ipa' && entry.ipaCharacter) {
            result.push(createVirtualGlyph(entry.ipaCharacter, entryIndex, entry.role));
        }
    });

    return result;
}

/**
 * The renderables of ONE entry outside any block: a grapheme expands to its
 * glyphs — the PINNED variant's when the entry pins one (`grapheme-12@34`),
 * else the default's — and an IPA entry becomes a virtual text glyph. Same
 * resolution order as the pre-block path: the map first, then the entry's own
 * complete grapheme data.
 */
function pushEntry(
    result: RenderableGlyph[],
    entry: SpellingDisplayEntry,
    entryIndex: number,
    graphemeMap: Map<number, GraphemeComplete>,
): void {
    if (entry.role === 'word-break') {
        result.push(createWordBreakGlyph(entryIndex));
        return;
    }
    if (entry.type === 'grapheme' && entry.grapheme) {
        const fullGrapheme = graphemeMap.get(entry.grapheme.id) ?? (entry.grapheme as GraphemeComplete);
        if (!Array.isArray(fullGrapheme.glyphs)) return;
        // Variant glyph lists are `Glyph[]` (GraphemeVariantWithGlyphs); with no
        // `variants`, pickVariant hands back `fullGrapheme.glyphs` itself (P5).
        const glyphs = pickVariant(fullGrapheme, null, entry.variantId).glyphs as Glyph[];
        for (const glyph of glyphs) {
            result.push(glyphToRenderable(glyph, entryIndex, entry.role));
        }
    } else if (entry.type === 'ipa' && entry.ipaCharacter) {
        result.push(createVirtualGlyph(entry.ipaCharacter, entryIndex, entry.role));
    }
}

/**
 * The readable name of a composed block: its template's name, or — for a lone
 * consonant with its mark, which no template describes — the consonant's own
 * grapheme name / IPA character.
 */
function blockName(composed: ComposedBlock, scheme: BlockScheme, entries: readonly SpellingDisplayEntry[]): string {
    if (composed.templateId === LONE_CONSONANT_TEMPLATE_ID) {
        const entry = entries[composed.entryIndices[0]];
        return entry?.grapheme?.name ?? entry?.ipaCharacter ?? composed.templateId;
    }
    return scheme.templates.find((t) => t.id === composed.templateId)?.name ?? composed.templateId;
}

/** One renderable for a composed block. */
function blockToRenderable(
    composed: ComposedBlock,
    scheme: BlockScheme,
    entries: readonly SpellingDisplayEntry[],
): RenderableGlyph {
    const firstEntryIndex = composed.entryIndices[0];
    return {
        // The entry position is part of the key so two IDENTICAL blocks in one
        // word (same template, entries and variants) still get distinct ids —
        // renderers key on it.
        id: generateVirtualGlyphId(`${blockKey(composed)}:${firstEntryIndex}`),
        name: blockName(composed, scheme, entries),
        svg_data: composed.svg,
        // A block is a real picture even when a slot holds an IPA stand-in;
        // `block.containsVirtual` says so for whoever needs to know.
        isVirtual: false,
        sourceIndex: firstEntryIndex,
        block: {
            templateId: composed.templateId,
            entryIndices: composed.entryIndices,
            slots: composed.slots,
            containsVirtual: composed.containsVirtual,
        },
    };
}

/**
 * The block path: segment, then compose each block into one renderable.
 * `single` and `passthrough` segments render exactly one entry each, as the
 * pre-block path would (plus pin support) — except a lone consonant under a
 * scheme with `leftovers`, which becomes one block with the vowel-killer mark;
 * boundaries (`.`) are consumed by the segmenter and render nothing.
 */
function normalizeSpellingWithBlocks(
    entries: SpellingDisplayEntry[],
    scheme: BlockScheme,
    graphemeMap: Map<number, GraphemeComplete>,
): RenderableGlyph[] {
    const result: RenderableGlyph[] = [];
    for (const segment of segmentEntries(entries, scheme, graphemeMap)) {
        if (segment.kind === 'block') {
            result.push(blockToRenderable(composeBlock(segment, entries, scheme, graphemeMap), scheme, entries));
            continue;
        }
        const entryIndex = segment.entryIndices[0];
        if (segment.kind === 'single' && segment.consonant && scheme.leftovers) {
            const lone = composeLoneConsonant(entryIndex, entries, graphemeMap, scheme.leftovers);
            if (lone) {
                result.push(blockToRenderable(lone, scheme, entries));
                continue;
            }
        }
        pushEntry(result, entries[entryIndex], entryIndex, graphemeMap);
    }
    return result;
}

function normalizeGlyphs(glyphs: Glyph[]): RenderableGlyph[] {
    return glyphs.map((glyph, index) => glyphToRenderable(glyph, index));
}

function normalizeGraphemes(graphemes: GraphemeComplete[]): RenderableGlyph[] {
    const result: RenderableGlyph[] = [];
    graphemes.forEach((grapheme, graphemeIndex) => {
        for (const glyph of grapheme.glyphs ?? []) {
            result.push(glyphToRenderable(glyph, graphemeIndex));
        }
    });
    return result;
}

function normalizeIds(
    ids: number[],
    context: NormalizationContext
): RenderableGlyph[] {
    if (!context.glyphMap) {
        console.warn('normalizeIds: glyphMap is required but not provided');
        return [];
    }

    return ids
        .map((id, index) => {
            const glyph = context.glyphMap?.get(id);
            if (!glyph) {
                console.warn(`normalizeIds: Glyph with id ${id} not found in glyphMap`);
                return null;
            }
            if ('isVirtual' in glyph) {
                return { ...glyph, sourceIndex: index } as RenderableGlyph;
            }
            return glyphToRenderable(glyph as Glyph, index);
        })
        .filter((g): g is RenderableGlyph => g !== null);
}

/**
 * Normalize any supported input format to RenderableGlyph[].
 */
export function normalizeGlyphInput(
    input: SpellingDisplayEntry[] | Glyph[] | RenderableGlyph[] | GraphemeComplete[] | number[],
    context: NormalizationContext = {}
): RenderableGlyph[] {
    if (!input || input.length === 0) {
        return [];
    }

    switch (detectInputType(input)) {
        case 'spelling-display':
            return normalizeSpellingDisplay(input as SpellingDisplayEntry[], context);
        case 'renderable':
            return input as RenderableGlyph[];
        case 'glyphs':
            return normalizeGlyphs(input as Glyph[]);
        case 'graphemes':
            return normalizeGraphemes(input as GraphemeComplete[]);
        case 'ids':
            return normalizeIds(input as number[], context);
        default:
            console.warn('normalizeGlyphInput: Unknown input type');
            return [];
    }
}
