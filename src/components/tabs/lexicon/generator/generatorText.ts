/**
 * @fileoverview The generator page's vocabulary — every label, glyph and
 * ordering the five components share.
 *
 * A `.ts` module, not a `.tsx`: `react-refresh/only-export-components` forbids
 * a component module from exporting anything else, and three of these tables
 * are read by two components each (the tilt labels by the inventory chips and
 * by the page's summary, the rejection labels by the shortfall banner and by
 * the batch header). One copy, so the chip and the banner cannot start calling
 * the same thing by two names.
 *
 * @module tabs/lexicon/generator/generatorText
 */

import {
    CLASS_LABELS,
    LIMITS,
    type ClassLetter,
    type FrequencyTilt,
    type Shortfall,
} from '../../../../generator';

// =============================================================================
// FREQUENCY TILT
// =============================================================================

/**
 * The cycle a chip walks when it is clicked.
 *
 * `normal` first because that is where every sound starts, and the cycle has to
 * return to it: a control that can leave a sound `off` with no way back to
 * "just normal" is a trap, and `off` is the state a user reaches by accident.
 */
export const TILT_CYCLE: readonly FrequencyTilt[] = ['normal', 'common', 'rare', 'off'];

/** What each tilt is called out loud — the chip's accessible name ends in one of these. */
export const TILT_LABELS: Record<FrequencyTilt, string> = {
    normal: 'normal',
    common: 'common',
    rare: 'rare',
    off: 'off',
};

/**
 * The chip's visible mark.
 *
 * Text, not an icon font and not colour: the tilt is the one thing on a chip
 * that a user changes on purpose, and it has to survive a screenshot, a
 * high-contrast theme and a missing icon font. The accessible name carries the
 * same information in words, so the glyph is `aria-hidden`.
 */
export const TILT_GLYPHS: Record<FrequencyTilt, string> = {
    normal: '·',
    common: '★',
    rare: '○',
    off: '✕',
};

/** The next tilt in the cycle, wrapping. */
export function nextTilt(tilt: FrequencyTilt): FrequencyTilt {
    const index = TILT_CYCLE.indexOf(tilt);
    return TILT_CYCLE[(index + 1) % TILT_CYCLE.length];
}

// =============================================================================
// GROUPING THE INVENTORY
// =============================================================================

/**
 * The class each sound is FILED under in the chip list, most specific first.
 *
 * `classOf` is deliberately overlapping — a `p` is a `C`, a `P` and an `O` at
 * once, because a template slot asks "can this sound fill me?" — but a list of
 * chips has to put every sound in exactly one place or the user sees the same
 * `p` three times and cannot tell which copy their click changed. The first
 * letter in this order that a sound belongs to wins.
 *
 * `S` precedes `F` so a sibilant fricative is filed as a sibilant rather than
 * disappearing into the general fricatives; `R` is last and in practice never
 * reached (every sonorant is already a nasal, liquid or glide) — it is here so
 * the fallback is a defined class rather than a crash.
 */
export const PRIMARY_CLASS_ORDER: readonly ClassLetter[] = [
    'P',
    'S',
    'F',
    'N',
    'L',
    'G',
    'O',
    'C',
    'V',
    'R',
];

/** The caption over a chip group, sentence-cased from the shared class labels. */
export function classGroupLabel(letter: ClassLetter): string {
    const label = CLASS_LABELS[letter];
    return label.charAt(0).toUpperCase() + label.slice(1);
}

// =============================================================================
// SHAPES
// =============================================================================

/**
 * The one-click syllable shapes.
 *
 * Five, and each earns its place: `CV` (the shape every language has), `CVC`
 * (closed syllables), `CCV` (an onset cluster — the switch that makes a
 * language sound "harder"), `CVN` (a nasal coda, the Japanese/Sinitic shape)
 * and `V` (a bare vowel, which is what makes a word start with one).
 */
export const QUICK_TEMPLATES: readonly string[] = ['CV', 'CVC', 'CCV', 'CVN', 'V'];

/**
 * What "Add shape" adds, in order of preference.
 *
 * A generic "add" button needs a pattern to add, and it cannot be an empty one:
 * an empty pattern does not parse, so it could never be stored and the row
 * would vanish on the next render. It cannot be a fixed `CV` either — the
 * settings validator drops duplicate patterns, so the button would silently do
 * nothing on the (very common) profile that already has a `CV`.
 *
 * So it walks a ladder of DISTINCT, valid starting shapes and takes the first
 * one the profile does not already have. The five quick-add shapes come first
 * — they are the ones a user most likely wanted — and the ladder is as long as
 * `LIMITS.MAX_TEMPLATES`, so the button has something to offer right up to the
 * limit that disables it.
 */
export const SHAPE_LADDER: readonly string[] = [
    'CV',
    'CVC',
    'CCV',
    'CVN',
    'V',
    'VC',
    'CVV',
    'CCVC',
    'CVL',
    'CVG',
    'VN',
    'CVCC',
];

/** The first ladder shape this profile does not already have, or `null` at the end of it. */
export function nextShape(existing: readonly string[]): string | null {
    return SHAPE_LADDER.find((pattern) => !existing.includes(pattern)) ?? null;
}

/** Batch sizes offered in the header. 20 is the default: a screenful, generated instantly. */
export const BATCH_SIZES: readonly number[] = [10, 20, 50, 100];

/** The default batch size — must be one of {@link BATCH_SIZES}. */
export const DEFAULT_BATCH_SIZE = 20;

/** The character between syllables in the display form (`ta·ki·no`). */
export const SYLLABLE_SEPARATOR = '·';

/**
 * Split the "never generate" box into sequences.
 *
 * Commas AND whitespace, because both are what people type and an IPA sequence
 * contains neither. Deduplicated, each truncated to the stored limit, and the
 * list itself capped — the settings validator enforces the same two limits, and
 * a value it would clamp should never be written in the first place (the user
 * would see their text silently shortened one render later).
 */
export function parseForbidden(text: string): string[] {
    const out: string[] = [];
    for (const raw of text.split(/[\s,]+/)) {
        const entry = raw.trim().slice(0, LIMITS.MAX_FORBIDDEN_LENGTH);
        if (!entry || out.includes(entry)) continue;
        out.push(entry);
        if (out.length >= LIMITS.MAX_FORBIDDEN) break;
    }
    return out;
}

// =============================================================================
// WHY A BATCH CAME BACK SHORT
// =============================================================================

/**
 * The engine's rejection keys, in the user's words.
 *
 * Two of the keys are not constraint rules and are labelled as what they are:
 * `emptySlot` is a template slot that had no sound left to fill it (usually
 * harmony narrowing the pool to nothing), and `duplicate` is a word the batch
 * or the lexicon already had — the second is not a problem at all, which is why
 * it does not read like one.
 */
export const REJECTION_LABELS: Record<string, string> = {
    noForbiddenSequences: 'your forbidden sequences',
    noIllegalGeminates: 'the no-doubled-consonants rule',
    sonorityInClusters: 'the cluster sonority rule',
    clusterBudget: 'the cluster budget',
    vowelHarmony: 'vowel harmony',
    inventoryOnly: 'sounds that are not in the inventory',
    emptySlot: 'a syllable slot with no sound left to fill it',
    duplicate: 'words you already have',
};

/** A rejection key in the user's words, falling back to the key itself. */
export function rejectionLabel(key: string): string {
    return REJECTION_LABELS[key] ?? key;
}

/** Why the engine stopped, in one clause that follows "the generator". */
export const SHORTFALL_REASONS: Record<Shortfall['reason'], string> = {
    exhausted: 'ran out of attempts',
    'empty-inventory': 'has no sounds to build from',
    'no-vowels': 'has no vowels in the inventory',
    'no-consonants': 'has no consonants in the inventory',
};

/**
 * The rule that ate the most candidates, or `null` when nothing was rejected.
 *
 * The TOP one only: a list of six counts is a debugging dump, and the user's
 * next action is to loosen whichever rule is doing the damage.
 */
export function topRejection(rejected: Record<string, number>): { key: string; count: number } | null {
    let top: { key: string; count: number } | null = null;
    for (const [key, count] of Object.entries(rejected)) {
        if (count <= 0) continue;
        if (!top || count > top.count) top = { key, count };
    }
    return top;
}

/**
 * The shortfall banner's message: how far it got, how hard it tried, and the
 * one rule to loosen.
 *
 * @example
 * "18 of 20 — 340 candidates were built and rejected, mostly by your forbidden sequences."
 */
export function describeShortfall(
    shortfall: Shortfall,
    produced: number,
    requested: number,
): string {
    const head = `${produced} of ${requested} —`;

    if (shortfall.reason !== 'exhausted') {
        return `${head} the generator ${SHORTFALL_REASONS[shortfall.reason]}.`;
    }
    if (shortfall.attempts <= 0) {
        return `${head} the generator ran out of attempts.`;
    }

    const built =
        `${shortfall.attempts} candidate${shortfall.attempts === 1 ? ' was' : 's were'}`
        + ' built and rejected';
    const top = topRejection(shortfall.rejected);
    return top
        ? `${head} ${built}, mostly by ${rejectionLabel(top.key)}.`
        : `${head} ${built}.`;
}
