/**
 * Block script — types.
 *
 * Two families live here:
 *
 *  1. The BLOCK SCHEME document (plan §2.4): the one-per-script JSON document
 *     that declares roles (slot types with a matcher) and templates (a role
 *     pattern plus one rectangle per role). It is stored as JSON and always
 *     passes through `validateBlockScheme` before the engine sees it.
 *  2. The ENGINE's own types: how a spelling entry is classified, how a
 *     spelling is segmented, and what a composed block looks like.
 *
 * The engine's grapheme input is declared STRUCTURALLY (`BlockGraphemeInfo`)
 * rather than as `GraphemeComplete`, so the engine does not depend on the
 * variant data layer landing first. `GraphemeComplete` (with its optional
 * `variants`) satisfies it as-is.
 *
 * @module blocks/types
 */

import type { ClassLetter } from '../generator/phonology/classes';
import type { SpellingDisplayEntry } from '../db/types';

// =============================================================================
// BLOCK SCHEME DOCUMENT (plan §2.4)
// =============================================================================

/** Decides which spelling entries may fill a role. */
export type RoleMatcher =
    /** Generator class letter via `classOf(describePhoneme(...))`. */
    | { kind: 'class'; letter: ClassLetter }
    /**
     * A sign for a whole syllable: its phoneme is several IPA sounds INCLUDING
     * a vowel ("ka"). Several vowels are a vowel (`V`); several consonants
     * ("ng", "ts") are a consonant — neither is a syllable sign.
     */
    | { kind: 'syllable' }
    /** A grapheme category, e.g. `'logogram'` (`WORD_SYMBOL_CATEGORY`). */
    | { kind: 'category'; category: string }
    /** Anything that is not a boundary, join or structural entry. */
    | { kind: 'any' };

export interface BlockRole {
    id: string;
    label: string;
    colour?: string;
    matcher: RoleMatcher;
}

/**
 * Where the sign sits in its box — one of nine positions. Maps to the align
 * half of `preserveAspectRatio` (BLOCK_PLACEMENT_PLAN.md §2). Absent = 'center'.
 */
export type SlotPin =
    | 'top-left' | 'top' | 'top-right'
    | 'left' | 'center' | 'right'
    | 'bottom-left' | 'bottom' | 'bottom-right';

/**
 * How the sign fits its box. `'fit'` (absent) shrinks the sign inside the box
 * (`meet`); `'fill'` grows it to span the box and lets the rest overflow past
 * the box edges rather than crop or stretch (`slice` + `overflow="visible"`).
 */
export type SlotFill = 'fit' | 'fill';

/** One rectangle of a template's layout, on the unit square (0..1). */
export interface BlockSlot {
    roleId: string;
    /** Variant group drawn in this rectangle; `null` = the default variant. */
    groupId: number | null;
    x: number;
    y: number;
    w: number;
    h: number;
    /** Where the sign sits in the box. Absent = 'center' (N1: written only when not 'center'). */
    pin?: SlotPin;
    /** How the sign fits the box. Absent = 'fit' (N1: written only when 'fill'). */
    fill?: SlotFill;
    /**
     * Fewest signs this slot takes: `0` makes it optional. Absent = 1
     * (pitfall P2 — every reader uses `slot.min ?? 1`).
     */
    min?: 0 | 1;
    /** Most signs this slot takes. Absent = 1 (`slot.max ?? 1`). */
    max?: 1 | 2 | 3 | 4;
    /**
     * How several signs share the slot's rectangle: side by side (`'row'`)
     * or stacked (`'column'`), each part sized by its sign's ink shape (see
     * `composeBlock`). Absent = `'row'`; only matters when `max > 1`.
     */
    arrange?: 'row' | 'column';
}

export interface BlockTemplate {
    id: string;
    name: string;
    /** Ordered role ids; no role appears twice. */
    pattern: string[];
    /** Exactly one slot per pattern role (order irrelevant). */
    slots: BlockSlot[];
}

export interface BlockScheme {
    version: 1;
    enabled: boolean;
    roles: BlockRole[];
    /** Tried in order — first match wins. */
    templates: BlockTemplate[];
    /**
     * How a word is cut into blocks. Absent ⇒ template order (read left to
     * right, first template that fits — the behaviour before syllable
     * splitting existed), so an existing language renders unchanged until its
     * owner switches.
     */
    split?: BlockSplit;
    /**
     * How a consonant left in no block is drawn. Absent ⇒ on its own, exactly
     * as without a scheme.
     */
    leftovers?: BlockLeftovers;
}

/** Word-splitting strategy (SYLLABLE_BLOCKS_PLAN.md §3.3). */
export interface BlockSplit {
    /** `'syllables'`: cut into syllables, one block each. `'templates'`: first template that fits, left to right. */
    mode: 'syllables' | 'templates';
    /** Let a syllable start with s + stop (`sp st str`). Absent = false. */
    sibilantClusters?: boolean;
    /**
     * Vowel pairs (or triples) the language says as ONE vowel (`ai`, `iə`):
     * two vowel signs side by side whose sounds together spell a listed entry
     * stay in one syllable and share its vowel slot. Only used by syllable.
     * Absent = none; when present it is non-empty, each entry NFC, trimmed,
     * unique, at most 8 code points, at most `MAX_SOUND_LIST` entries
     * (DIPHTHONG_BLOCKS_PLAN.md §2).
     */
    diphthongs?: string[];
    /**
     * Consonants that may be a syllable's core (`r l m n` — Czech `prst`,
     * `krtek`): a listed consonant with no vowel next to it counts as the
     * syllable's nucleus, so a vowel-less run is still cut into syllables.
     * It stays class `C` for template matching (it fills C / R / N / L / any
     * boxes, never V). A consonant written with the IPA syllabic mark (`r̩`)
     * is a core without being listed. Only used by syllable mode. Absent =
     * none; when present it is non-empty, each entry NFC, trimmed, unique, at
     * most 8 code points, at most `MAX_SOUND_LIST` entries
     * (CONLANG_EDGES_PLAN.md §2).
     */
    syllabicConsonants?: string[];
}

/** Where the vowel-killer mark sits relative to its lone consonant. */
export type LeftoverPlacement = 'below' | 'above' | 'after' | 'before';

/** A lone consonant is drawn with a no-sound mark (like a virama). */
export interface BlockLeftovers {
    /** The grapheme drawn as the mark. */
    markGraphemeId: number;
    placement: LeftoverPlacement;
}

/** One correction `validateBlockScheme` had to make. */
export interface SchemeIssue {
    path: string;
    message: string;
}

export interface SchemeValidation {
    scheme: BlockScheme;
    issues: SchemeIssue[];
}

// =============================================================================
// ENGINE INPUT
// =============================================================================

/**
 * What the engine needs to know about a grapheme. Structural on purpose —
 * `GraphemeComplete` satisfies it.
 *
 * `glyphs` is the DEFAULT variant's glyphs (pitfall P3). `variants` absent ⇒
 * the grapheme has only its default variant (pitfall P5).
 */
export interface BlockGraphemeInfo {
    id: number;
    category: string | null;
    phonemes: { phoneme: string; use_in_auto_spelling: boolean }[];
    glyphs: { svg_data: string }[];
    variants?: {
        id: number;
        group_id: number | null;
        is_default: boolean;
        glyphs: { svg_data: string }[];
    }[];
}

/** Grapheme id → grapheme data. */
export type BlockGraphemeIndex = ReadonlyMap<number, BlockGraphemeInfo>;

/**
 * A spelling entry as the engine reads it. `variantId` is the PINNED variant
 * (`grapheme-12@34`) the variant data layer adds to `SpellingDisplayEntry`;
 * declared here too so the engine compiles before and after that lands.
 */
export type BlockSpellingEntry = SpellingDisplayEntry & { variantId?: number };

// =============================================================================
// ENGINE OUTPUT
// =============================================================================

/** What kind of thing a spelling entry is, for role matching (plan §3.1). */
export type EntryClass =
    | { kind: 'phoneme'; letters: ClassLetter[]; category: string | null }
    /** The phoneme string is several IPA sounds, at least one of them a vowel. */
    | { kind: 'syllable'; category: string | null }
    /** A grapheme with no phonemes (a logogram). */
    | { kind: 'silent'; category: string | null }
    /**
     * A no-sound sign added to the sign before it — a tone, length or accent
     * mark: a grapheme with no phonemes whose category is `mark`
     * (`category` = that category), or a typed IPA mark (`ː`, `˥`, a lone
     * combining tilde; `category: null`). It never splits a syllable; it
     * rides with the sign before it (CONLANG_EDGES_PLAN.md §3).
     */
    | { kind: 'mark'; category: string | null }
    /**
     * The IPA undertie `‿`: the mirror of `.` — no break may fall where it
     * sits. The segmenter strips it before anything else looks at the
     * spelling, so it is never part of a segment and draws nothing.
     */
    | { kind: 'join' }
    /** The explicit block break `.`, or a stress mark (`ˈ ˌ`), which cuts the same way. */
    | { kind: 'boundary' }
    /** A word-separator / line-break / punctuation entry. */
    | { kind: 'structural' }
    /** Anything the phonology cannot classify. */
    | { kind: 'unknown' };

/** Entries matched to one template, composed into ONE picture. */
export interface BlockSegment {
    kind: 'block';
    templateId: string;
    entryIndices: number[];
    /**
     * Parallel to `entryIndices`: the role each entry fills. Absent ⇒ the
     * entries fill the template's pattern one-to-one in order (and their count
     * must equal the pattern's) — how count-less templates and hand-built
     * segments read.
     */
    roleIds?: string[];
}

/** An entry no template matched; rendered exactly as without a scheme. */
export interface SingleSegment {
    kind: 'single';
    entryIndices: [number];
    /** A lone consonant — a candidate for the scheme's vowel-killer mark. */
    consonant?: true;
}

/** A structural entry (separator / line break / punctuation), passed through. */
export interface PassthroughSegment {
    kind: 'passthrough';
    entryIndices: [number];
}

export type Segment = BlockSegment | SingleSegment | PassthroughSegment;

/** How one template slot was filled. */
export interface ComposedSlot {
    roleId: string;
    entryIndex: number;
    /** The variant drawn; `null` for virtual entries and variant-less graphemes. */
    variantId: number | null;
    /** The slot asked for a group this grapheme has no variant in (default drawn). */
    missingGroup: boolean;
    /**
     * Stable identity of the entry itself: `grapheme-12`, `grapheme-12@34`
     * (pinned) or `ipa:<char>`. Feeds `blockKey`; not part of the plan's
     * minimum shape, carried so `blockKey(composed)` needs nothing else.
     */
    entryKey: string;
}

export interface ComposedBlock {
    /** One `<svg viewBox="0 0 100 100">` document. */
    svg: string;
    templateId: string;
    entryIndices: number[];
    /** One per entry, in entry (`entryIndices`) order. */
    slots: ComposedSlot[];
    /** At least one slot holds an IPA (virtual) entry. */
    containsVirtual: boolean;
    /**
     * Only on a lone-consonant block (`templateId === LONE_CONSONANT_TEMPLATE_ID`):
     * the vowel-killer mark drawn with it. Part of `blockKey`, so changing the
     * mark or its placement changes the block's identity.
     */
    mark?: { graphemeId: number; variantId: number | null; placement: LeftoverPlacement };
}
