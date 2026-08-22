/**
 * @fileoverview IPA symbol to phonological features.
 *
 * The app already draws the IPA chart from `src/data/ipaChartData.ts`, but it
 * has never been able to ANSWER anything about a symbol: is `ʃ` a sibilant, is
 * `w` a glide, do `t͡ʃ` and `tʃ` mean the same sound. Every later phase of the
 * word generator (classes, sonority, templates, constraints, the chart guide)
 * needs those answers, so this module builds one lookup table and everything
 * else reads it.
 *
 * The table is DERIVED from the chart data, never hand-copied: a second table
 * of consonants would drift from the one the chart renders, and the drift would
 * be invisible (the chart would show a sound the generator refuses to use, or
 * vice versa). The only hand-written data here is what the chart genuinely does
 * not encode — sibilance, and the `EXTRA_SYMBOLS` that conlangers use daily but
 * that the pulmonic table has no cell for.
 *
 * @module generator/phonology/features
 */

import {
    IPA_AFFRICATES,
    IPA_CLICKS,
    IPA_CONSONANT_CHART,
    IPA_IMPLOSIVES,
    IPA_VOWEL_CHART,
    MANNERS_OF_ARTICULATION,
    PLACES_OF_ARTICULATION,
} from '../../data/ipaChartData';
import type {
    MannerOfArticulation,
    PlaceOfArticulation,
    VowelBackness,
    VowelHeight,
} from '../../data/ipaChartData';

export type {
    MannerOfArticulation,
    PlaceOfArticulation,
    VowelBackness,
    VowelHeight,
} from '../../data/ipaChartData';

// =============================================================================
// TYPES
// =============================================================================

export type PhonemeKind = 'consonant' | 'vowel';

/**
 * Manner of a consonant, widened past the pulmonic chart's rows with the three
 * groups that live in their own tables (`IPA_AFFRICATES`, `IPA_CLICKS`,
 * `IPA_IMPLOSIVES`).
 */
export type ConsonantManner = MannerOfArticulation | 'affricate' | 'click' | 'implosive';

export interface ConsonantFeatures {
    kind: 'consonant';
    manner: ConsonantManner;
    /**
     * `null` where the chart data does not give one place: the clicks, whose
     * IPA names use categories the chart has no column for (`palatoalveolar`).
     * Affricates DO get a place — the second component's, see `registerAffricates`.
     */
    place: PlaceOfArticulation | null;
    voiced: boolean;
    /** `s z ʃ ʒ ʂ ʐ ɕ ʑ` and every affricate whose second component is one of them. */
    sibilant: boolean;
}

export interface VowelFeatures {
    kind: 'vowel';
    height: VowelHeight;
    backness: VowelBackness;
    rounded: boolean;
}

/**
 * A classified sound. The `base` is the CANONICAL chart symbol, which is not
 * always the string that was looked up: `ɡ` (U+0261) reports base `g`, and both
 * `t͡ʃ` and `tʃ` report base `t͡ʃ`. Downstream code compares sounds by
 * `base` + `modifiers` precisely so those spellings cannot split one phoneme in
 * two.
 */
export type PhonemeFeatures = (ConsonantFeatures | VowelFeatures) & {
    /** The canonical chart symbol this was resolved to. */
    base: string;
    /** Diacritics and modifier letters found after the base, in source order. */
    modifiers: string[];
    /** `ː` (U+02D0) is present. */
    long: boolean;
    /** Combining tilde (U+0303) is present. */
    nasalized: boolean;
};

// =============================================================================
// CHARACTER CLASSES
// =============================================================================
//
// These live here, next to the peeler that consumes them, rather than in
// `tokenize.ts` where they are also used. The tokenizer and the feature lookup
// MUST agree character for character on what "attaches to the preceding base":
// a modifier the tokenizer glues onto a token but the lookup cannot peel off
// would turn a perfectly ordinary `pʰ` into an unclassifiable sound. One
// definition, imported by both, makes that disagreement impossible.

/** Length mark, U+02D0 — the source of the `long` flag. */
export const LENGTH_MARK = 'ː';

/**
 * Combining tilde, U+0303 — the source of the `nasalized` flag.
 *
 * Every combining mark in this file is written as an escape. Pasted literally
 * they render on top of the neighbouring quote, which makes them impossible to
 * review and trivial to lose in an editor that "cleans up" the line.
 */
export const NASAL_MARK = '\u0303';

/** Tie bars: U+0361 (above) and U+035C (below). Both join two symbols into one. */
export const TIE_BARS: readonly string[] = ['\u0361', '\u035C'];

/**
 * Structural marks: they punctuate a transcription rather than describing a
 * sound. Two of them (`ˈ` U+02C8, `ˌ` U+02CC) sit INSIDE the modifier-letter
 * block, so they have to be excluded there explicitly or a stress mark would be
 * swallowed by the preceding phoneme.
 */
const SEPARATOR_KINDS: ReadonlyMap<string, IpaSeparator> = new Map<string, IpaSeparator>([
    ['ˈ', 'stress'],       // ˈ primary stress
    ['ˌ', 'stress'],       // ˌ secondary stress
    ['.', 'syllable'],          // explicit syllable break
    ['‿', 'syllable'],     // ‿ undertie: the absence of a break — still a boundary marker
]);

/** What a separator token marks. */
export type IpaSeparator = 'stress' | 'syllable' | 'space';

/** The separator role of a character, or `null` if it is not one. */
export function separatorKindOf(ch: string): IpaSeparator | null {
    if (SEPARATOR_KINDS.has(ch)) return SEPARATOR_KINDS.get(ch) ?? null;
    return /^\s$/.test(ch) ? 'space' : null;
}

/** A tie bar (U+0361 / U+035C), which joins the NEXT base into the same token. */
export function isTieBar(ch: string): boolean {
    return TIE_BARS.includes(ch);
}

/**
 * Does this character attach to the preceding base rather than starting a new
 * sound? Combining marks (U+0300–U+036F), spacing modifier letters
 * (U+02B0–U+02FF, which is where `ː ʰ ʲ ʷ ˠ ˤ ʼ` live) and the superscript `ⁿ`
 * (U+207F — commonly used for prenasalisation and NOT in the modifier block,
 * which is why it is named separately). Stress marks are excluded: see
 * `SEPARATOR_KINDS`.
 */
export function isAttachingMark(ch: string): boolean {
    // Exactly one UTF-16 unit: every attaching mark is in the BMP, so a longer
    // string is never one, and testing `codePointAt(0)` on it would answer for
    // its FIRST character instead — an easy way to accidentally call a whole
    // token a diacritic.
    if (ch.length !== 1) return false;
    if (separatorKindOf(ch) !== null) return false;
    const cp = ch.codePointAt(0);
    if (cp === undefined) return false;
    if (cp >= 0x0300 && cp <= 0x036f) return true;   // combining diacritical marks
    if (cp >= 0x02b0 && cp <= 0x02ff) return true;   // spacing modifier letters
    return cp === 0x207f;                            // ⁿ superscript n
}

// =============================================================================
// HAND-WRITTEN DATA (only what the chart does not encode)
// =============================================================================

/**
 * Sibilants — high-frequency grooved fricatives. The chart has no column or row
 * for this, and it is the one feature the class system needs that cannot be
 * derived: `ʃ` and `ç` are both voiceless fricatives, but only one of them can
 * start an `s`+stop cluster.
 */
const SIBILANT_BASES: ReadonlySet<string> = new Set(['s', 'z', 'ʃ', 'ʒ', 'ʂ', 'ʐ', 'ɕ', 'ʑ']);

/** A non-chart symbol, either a sound of its own or a modifier that rides one. */
export type ExtraSymbolEntry =
    | {
          role: 'symbol';
          ipa: string;
          features: ConsonantFeatures | VowelFeatures;
          /** Why this symbol is here and how it was mapped onto chart categories. */
          note: string;
      }
    | {
          role: 'modifier';
          ipa: string;
          note: string;
      };

/**
 * Symbols the pulmonic chart lacks but a conlanger reaches for constantly.
 * Each is mapped onto the CHART's categories (there is no `alveolo-palatal`
 * column, no `labial-velar` column) so that one set of classes covers
 * everything; the note on each entry records the compromise.
 */
export const EXTRA_SYMBOLS: readonly ExtraSymbolEntry[] = [
    {
        role: 'symbol',
        ipa: 'ɕ',
        features: { kind: 'consonant', manner: 'fricative', place: 'postalveolar', voiced: false, sibilant: true },
        note: 'Voiceless alveolo-palatal sibilant fricative. The chart has no alveolo-palatal column; postalveolar is the neighbouring place and gives it the same cluster behaviour as ʃ.',
    },
    {
        role: 'symbol',
        ipa: 'ʑ',
        features: { kind: 'consonant', manner: 'fricative', place: 'postalveolar', voiced: true, sibilant: true },
        note: 'Voiced counterpart of ɕ, mapped the same way.',
    },
    {
        role: 'symbol',
        ipa: 'w',
        features: { kind: 'consonant', manner: 'approximant', place: 'velar', voiced: true, sibilant: false },
        note: 'Voiced labial-velar approximant. Doubly articulated, so it is in no pulmonic cell; recorded as a velar approximant, which puts it in the glide class (G) where every phonotactic rule expects it.',
    },
    {
        role: 'symbol',
        ipa: 'ʍ',
        features: { kind: 'consonant', manner: 'fricative', place: 'velar', voiced: false, sibilant: false },
        note: 'Voiceless labial-velar fricative — its official IPA name, so manner `fricative`. It patterns as a voiceless w in most languages; the naming is kept faithful and the difference only shows up in sonority (3 rather than 7).',
    },
    {
        role: 'symbol',
        ipa: 'ɫ',
        features: { kind: 'consonant', manner: 'lateral_approximant', place: 'alveolar', voiced: true, sibilant: false },
        note: 'Velarised (dark) l. A precomposed symbol, not l plus a diacritic, so it needs its own entry to be a liquid rather than an unknown.',
    },
    {
        role: 'symbol',
        ipa: 'ɚ',
        features: { kind: 'vowel', height: 'mid', backness: 'central', rounded: false },
        note: 'R-coloured schwa. Rhoticity is not a chart axis, so it is recorded as its underlying mid central vowel.',
    },
    {
        role: 'symbol',
        ipa: 'ɝ',
        features: { kind: 'vowel', height: 'mid', backness: 'central', rounded: false },
        note: 'Stressed r-coloured schwa. Phonetically open-mid, but it contrasts with nothing else in the central column here, so it shares ɚ\'s mid central description.',
    },
    {
        role: 'symbol',
        ipa: 'ɹ\u0320',
        features: { kind: 'consonant', manner: 'approximant', place: 'postalveolar', voiced: true, sibilant: false },
        note: 'Retracted ɹ (the usual English r). Registered whole so the retraction survives as a PLACE; without it the mark would simply be peeled off and the sound would read as plain alveolar.',
    },
    {
        role: 'modifier',
        ipa: 'ʼ',
        note: 'Ejective mark ʼ. A modifier, not a sound: kʼ is a k with a glottalic airstream, so it keeps the base\'s features and only appears in `modifiers`. It already falls inside the modifier-letter block; the entry exists so the decision is written down somewhere.',
    },
];

// =============================================================================
// TABLE CONSTRUCTION
// =============================================================================

/** Symbol (NFD-normalised) to features. Built once, at module load. */
const BASE_TABLE = new Map<string, PhonemeFeatures>();

/** Canonical base symbol to a ready-made human label, where the data supplies one. */
const LABEL_OVERRIDES = new Map<string, string>();

/**
 * Registrations that collided. A duplicate key means two chart entries claim the
 * same symbol, which would silently give one of them the other's features — but
 * throwing here would take the whole app down at import time over a data typo,
 * so the conflict is recorded and a test asserts the list is empty.
 */
export const TABLE_CONFLICTS: string[] = [];

/**
 * Unicode normalisation that cannot throw. `normalize()` is safe for lone
 * surrogates in every current engine, but this module's contract is that NO
 * input string can produce an exception, and a `try` costs nothing.
 */
export function safeNormalize(input: string, form: 'NFC' | 'NFD'): string {
    try {
        return input.normalize(form);
    } catch {
        return input;
    }
}

function register(symbol: string, features: ConsonantFeatures | VowelFeatures, base = symbol): void {
    const key = safeNormalize(symbol, 'NFD');
    if (BASE_TABLE.has(key)) {
        TABLE_CONFLICTS.push(symbol);
        return;
    }
    BASE_TABLE.set(key, { ...features, base, modifiers: [], long: false, nasalized: false });
}

/** The pulmonic table: manner is the row, place the column, voicing the half-cell. */
function registerChartConsonants(): void {
    for (const manner of Object.keys(IPA_CONSONANT_CHART) as MannerOfArticulation[]) {
        const row = IPA_CONSONANT_CHART[manner];
        for (const place of Object.keys(row) as PlaceOfArticulation[]) {
            const cell = row[place];
            if (cell.voiceless) {
                register(cell.voiceless, {
                    kind: 'consonant',
                    manner,
                    place,
                    voiced: false,
                    sibilant: SIBILANT_BASES.has(cell.voiceless),
                });
            }
            if (cell.voiced) {
                register(cell.voiced, {
                    kind: 'consonant',
                    manner,
                    place,
                    voiced: true,
                    sibilant: SIBILANT_BASES.has(cell.voiced),
                });
            }
        }
    }
}

function registerChartVowels(): void {
    for (const vowel of IPA_VOWEL_CHART) {
        register(vowel.ipa, {
            kind: 'vowel',
            height: vowel.height,
            backness: vowel.backness,
            rounded: vowel.rounded,
        });
    }
}

function registerExtras(): void {
    for (const entry of EXTRA_SYMBOLS) {
        if (entry.role === 'symbol') register(entry.ipa, entry.features);
    }
}

/** The two code points of an affricate, tie bar removed, or `null` if it is not a pair. */
function affricateComponents(ipa: string): [string, string] | null {
    const parts = Array.from(ipa).filter((ch) => !isTieBar(ch));
    return parts.length === 2 ? [parts[0], parts[1]] : null;
}

/**
 * Affricates are a stop released into a fricative, so their features come from
 * their two components: voicing from the first (the stop), place and sibilance
 * from the second (the fricative). Deriving rather than transcribing keeps
 * `t͡ɬ` non-sibilant and `t͡ɕ` sibilant without anyone having to remember.
 *
 * Every affricate is registered under all THREE spellings in circulation: with
 * the tie bar above (U+0361 — the chart spelling), with the tie bar below
 * (U+035C — the form the IPA prescribes when the symbols have descenders, so
 * `d͜ʒ` is what a careful transcription of that affricate looks like), and with
 * no tie bar at all (`tʃ`), because that is what users type. All three report
 * the U+0361 form as `base`, so the spellings are one phoneme downstream.
 *
 * The below-bar spelling is not optional: `isTieBar` accepts U+035C and the
 * tokenizer glues it into a single token, so leaving it out of the table
 * produced a token that was correctly ONE sound and yet `features: null`.
 */
function registerAffricates(): void {
    for (const entry of IPA_AFFRICATES) {
        const components = affricateComponents(entry.ipa);
        if (!components) {
            TABLE_CONFLICTS.push(`affricate ${entry.ipa} is not a two-symbol sequence`);
            continue;
        }
        const [firstSymbol, secondSymbol] = components;
        const first = BASE_TABLE.get(safeNormalize(firstSymbol, 'NFD'));
        const second = BASE_TABLE.get(safeNormalize(secondSymbol, 'NFD'));
        if (!first || first.kind !== 'consonant' || !second || second.kind !== 'consonant') {
            TABLE_CONFLICTS.push(`affricate ${entry.ipa} has an unknown component`);
            continue;
        }
        if (first.voiced === entry.voiceless) {
            // The table's own `voiceless` flag disagrees with the stop it is
            // built from; one of the two is a typo and the class system would
            // inherit it.
            TABLE_CONFLICTS.push(`affricate ${entry.ipa} disagrees with its first component on voicing`);
        }
        const features: ConsonantFeatures = {
            kind: 'consonant',
            manner: 'affricate',
            place: second.place,
            voiced: first.voiced,
            sibilant: second.sibilant,
        };
        register(entry.ipa, features);
        LABEL_OVERRIDES.set(entry.ipa, entry.description.toLowerCase());

        const plain = components.join('');
        if (plain !== entry.ipa) register(plain, features, entry.ipa);
        for (const bar of TIE_BARS) {
            const tied = components.join(bar);
            if (tied !== entry.ipa) register(tied, features, entry.ipa);
        }

        // …and the withdrawn single-character ligature, where one exists. No
        // label override is needed: `coreLabel` looks one up by `base`, which
        // for the alias is the canonical form registered just above.
        const ligature = LIGATURE_ALIASES.get(entry.ipa);
        if (ligature) register(ligature, features, entry.ipa);
    }
}

/**
 * The place named in a description, matched WORD BY WORD so that `dental` never
 * matches inside `labiodental`. Returns `null` when the description uses a
 * category the chart has no column for.
 */
function placeFromDescription(description: string): PlaceOfArticulation | null {
    const words = new Set(description.toLowerCase().split(/[^a-z]+/));
    const match = PLACES_OF_ARTICULATION.find((place) => words.has(place.key));
    return match ? (match.key as PlaceOfArticulation) : null;
}

/**
 * Clicks get `place: null` deliberately: their IPA names use categories the
 * chart cannot express (`palatoalveolar`), and a wrong place would be worse
 * than none — the class system only asks for the manner.
 */
function registerClicks(): void {
    for (const entry of IPA_CLICKS) {
        register(entry.ipa, {
            kind: 'consonant',
            manner: 'click',
            place: null,
            voiced: false,
            sibilant: false,
        });
        LABEL_OVERRIDES.set(entry.ipa, entry.description.toLowerCase());
    }
}

/** Implosives read their place and voicing out of the description they ship with. */
function registerImplosives(): void {
    for (const entry of IPA_IMPLOSIVES) {
        const description = entry.description.toLowerCase();
        register(entry.ipa, {
            kind: 'consonant',
            manner: 'implosive',
            place: placeFromDescription(entry.description),
            voiced: !description.includes('voiceless'),
            sibilant: false,
        });
        LABEL_OVERRIDES.set(entry.ipa, description);
    }
}

/**
 * The six deprecated affricate LIGATURES, keyed by the canonical tie-bar form
 * they abbreviate.
 *
 * `ʧ` (U+02A7) and friends were withdrawn from the IPA in 1976, which is
 * exactly why they still turn up: they are one keystroke on most phonetic
 * keyboards, they are what forty years of dictionaries and grammars print, and
 * a user pasting from one of those had their sound classified as `null` — no
 * class, no chart cell, no coverage match against a preset's `t͡ʃ`.
 *
 * They are registered the way `ɡ` is: as ALIASES whose `base` is the canonical
 * form, so the user's own text is never rewritten and everything downstream
 * (identity, coverage, the guide overlay) sees one phoneme.
 */
const LIGATURE_ALIASES: ReadonlyMap<string, string> = new Map([
    ['t͡s', 'ʦ'],   // U+02A6
    ['d͡z', 'ʣ'],   // U+02A3
    ['t͡ʃ', 'ʧ'],   // U+02A7
    ['d͡ʒ', 'ʤ'],   // U+02A4
    ['t͡ɕ', 'ʨ'],   // U+02A8
    ['d͡ʑ', 'ʥ'],   // U+02A5
]);

/**
 * `ɡ` (U+0261, the single-storey g) and `g` (U+0067) are the same sound; the
 * chart uses the ASCII one and users paste both. Registering the alias — rather
 * than rewriting the input string — means the caller's text is never altered
 * while `base` still comes back as the canonical `g`.
 */
function registerAliases(): void {
    const g = BASE_TABLE.get('g');
    if (g && g.kind === 'consonant') {
        register('ɡ', { kind: 'consonant', manner: g.manner, place: g.place, voiced: g.voiced, sibilant: g.sibilant }, 'g');
    } else {
        TABLE_CONFLICTS.push('the chart no longer contains ASCII g');
    }
}

registerChartConsonants();
registerChartVowels();
registerExtras();
registerAffricates();
registerClicks();
registerImplosives();
registerAliases();

// =============================================================================
// LOOKUP
// =============================================================================

/**
 * Diacritics that CHANGE a consonant's voicing rather than describing something
 * else about it. `l̥` is a voiceless l and `s̬` is a voiced s — reporting either
 * with the base's own voicing produced a feature set that disagreed with the
 * symbol (and a tooltip that read "devoiced voiced alveolar lateral
 * approximant"). Applying them here means the sonority scale and the label both
 * see the sound the transcription actually names.
 *
 * The voiceless mark has two forms because the ring sits below by default and
 * moves above for symbols with a descender (`ŋ̊`, `ɡ̊`).
 */
const VOICING_MARKS: ReadonlyMap<string, boolean> = new Map([
    ['\u0325', false],   // combining ring below — voiceless
    ['\u030A', false],   // combining ring above — voiceless (descender variant)
    ['\u032C', true],    // combining caron below — voiced
]);

/**
 * Compose a stored entry with the modifiers found on a token.
 *
 * Written out field by field rather than spread so the result is a FRESH object
 * every time: `lookupBase('p')!.modifiers.push('ʰ')` must not corrupt the shared
 * table for every later caller, and freezing the table would trade that bug for
 * a `TypeError` in strict mode.
 */
function withModifiers(entry: PhonemeFeatures, modifiers: string[]): PhonemeFeatures {
    const shared = {
        base: entry.base,
        modifiers,
        long: modifiers.includes(LENGTH_MARK),
        nasalized: modifiers.includes(NASAL_MARK),
    };
    if (entry.kind !== 'consonant') {
        return { kind: 'vowel', height: entry.height, backness: entry.backness, rounded: entry.rounded, ...shared };
    }
    // Last mark wins, so a string carrying both marks reads left to right like
    // any other stack of diacritics.
    let voiced = entry.voiced;
    for (const modifier of modifiers) {
        const override = VOICING_MARKS.get(modifier);
        if (override !== undefined) voiced = override;
    }
    return { kind: 'consonant', manner: entry.manner, place: entry.place, voiced, sibilant: entry.sibilant, ...shared };
}

/**
 * Look a symbol up EXACTLY: chart symbols, the extras, both affricate spellings
 * and the `ɡ` alias. No diacritic is stripped, so `lookupBase('aː')` is `null`
 * — use {@link describePhoneme} for anything a user typed.
 */
export function lookupBase(symbol: string): PhonemeFeatures | null {
    const entry = BASE_TABLE.get(safeNormalize(symbol, 'NFD'));
    return entry ? withModifiers(entry, []) : null;
}

/**
 * Classify ONE phoneme — a base symbol plus whatever rides on it.
 *
 * Peels attaching marks off the end one at a time, trying the table after each
 * peel, so the LONGEST registered symbol always wins: `ɹ̠ʲ` keeps its retracted
 * place instead of collapsing to a plain `ɹ` with two marks. Comparison happens
 * in NFD because a precomposed `ã` (U+00E3) has to be seen as `a` + tilde.
 *
 * This — not the tokenizer — is the single-phoneme API. An inventory entry, a
 * preset sound and a grapheme's `phoneme` string are all single phonemes, which
 * is why `describePhoneme('tʃ')` is the affricate while `tokenizeIpa('tʃ')` is
 * two sounds: only here is it known that the whole string is meant as one.
 */
export function describePhoneme(token: string): PhonemeFeatures | null {
    if (!token) return null;
    const codePoints = Array.from(safeNormalize(token, 'NFD'));
    const modifiers: string[] = [];
    for (let end = codePoints.length; end > 0; end--) {
        const entry = BASE_TABLE.get(codePoints.slice(0, end).join(''));
        if (entry) return withModifiers(entry, modifiers);
        const last = codePoints[end - 1];
        if (!isAttachingMark(last)) return null;
        modifiers.unshift(last);
    }
    return null;
}

// =============================================================================
// LABELS
// =============================================================================

/** Chart row labels, lowercased. `Tap or Flap` becomes `tap` — the phrase reads as a name, not a list. */
const MANNER_LABELS: ReadonlyMap<string, string> = new Map(
    MANNERS_OF_ARTICULATION.map((row) => [row.key, row.label.split(' or ')[0].toLowerCase()]),
);

/** Chart column labels, lowercased (`Post-alveolar` stays hyphenated — that is how the chart spells it). */
const PLACE_LABELS: ReadonlyMap<string, string> = new Map(
    PLACES_OF_ARTICULATION.map((column) => [column.key, column.label.toLowerCase()]),
);

/**
 * Adjectives for the marks a phoneme can carry. Anything unlisted is simply not
 * described — which is deliberate for the voicing marks in `VOICING_MARKS`: they
 * already changed the `voiced` feature, so `coreLabel` names the result. Listing
 * them here as well produced "devoiced voiced alveolar lateral approximant".
 */
const MODIFIER_LABELS: ReadonlyMap<string, string> = new Map([
    [LENGTH_MARK, 'long'],
    ['ˑ', 'half-long'],
    [NASAL_MARK, 'nasalized'],
    ['ʰ', 'aspirated'],
    ['ʲ', 'palatalized'],
    ['ʷ', 'labialized'],
    ['ˠ', 'velarized'],
    ['ˤ', 'pharyngealized'],
    ['ʼ', 'ejective'],
    ['ⁿ', 'nasally released'],
    ['\u0329', 'syllabic'],
    ['\u0320', 'retracted'],
    ['\u031F', 'advanced'],
    ['\u0334', 'velarized'],
]);

function coreLabel(features: PhonemeFeatures): string {
    const override = LABEL_OVERRIDES.get(features.base);
    if (override) return override;
    if (features.kind === 'vowel') {
        return `${features.height} ${features.backness} ${features.rounded ? 'rounded' : 'unrounded'} vowel`;
    }
    const manner = MANNER_LABELS.get(features.manner) ?? features.manner;
    const place = features.place ? PLACE_LABELS.get(features.place) ?? features.place : null;
    return [features.voiced ? 'voiced' : 'voiceless', place, manner]
        .filter((part): part is string => Boolean(part))
        .join(' ');
}

/**
 * A human description of one phoneme, for tooltips and `aria-label`s:
 * `describePhonemeLabel('pʰ')` is `"aspirated voiceless bilabial plosive"`.
 *
 * Modifier adjectives lead, in the order they appear in the string, so the
 * label always reads back in the same order as the symbol. Anything the table
 * cannot classify gets a fixed phrase rather than an empty string — a blank
 * tooltip looks like a rendering bug.
 */
export function describePhonemeLabel(token: string): string {
    const features = describePhoneme(token);
    if (!features) return 'unrecognised sound';
    const adjectives = features.modifiers
        .map((modifier) => MODIFIER_LABELS.get(modifier))
        .filter((label): label is string => Boolean(label));
    return [...adjectives, coreLabel(features)].join(' ');
}

/** Every symbol the table can resolve, canonical spellings and aliases alike. Test/debug aid. */
export function knownSymbols(): string[] {
    return Array.from(BASE_TABLE.keys());
}

// =============================================================================
// IDENTITY
// =============================================================================

/**
 * The separator inside a sound key.
 *
 * It has to be a character that can never appear in a base symbol or in a
 * modifier, so that a base ending in a modifier-like character cannot collide
 * with a shorter base plus that modifier. NUL is the only such character, and it
 * is written here as an ESCAPE rather than as a literal: a raw control byte in
 * the source makes `file`, `grep` and `git diff` treat this module as binary.
 */
const IDENTITY_SEPARATOR = '\u0000';

/**
 * The string two sounds are compared BY: canonical base + modifiers as a set.
 *
 * STRING EQUALITY IS THE WRONG TEST for a phoneme. A user who typed `tʃ` and a
 * preset that says `t͡ʃ` mean the same sound; a user who typed `pʰ` and a preset
 * that says `p` do not; `ɡ` and `g` are the same letter twice. Every place in
 * the generator that asks "is this sound that sound?" — the coverage split, the
 * inventory dedupe, the membership test the constraints run, the commonness
 * ranking — asks it here, so that they cannot answer it differently.
 *
 * Modifiers are sorted because `ãː` and `aːã`-style orderings describe the same
 * sound. Anything the table cannot classify falls back to its normalised text
 * under a `?` prefix, so an unrecognised sound still matches an identical
 * unrecognised sound rather than matching nothing (and can never collide with a
 * classified one, because `?` is not a base symbol).
 */
export function phonemeIdentity(sound: string): string {
    const features = describePhoneme(sound);
    if (!features) return `?${IDENTITY_SEPARATOR}${safeNormalize(sound, 'NFD')}`;
    return `${features.base}${IDENTITY_SEPARATOR}${[...features.modifiers].sort().join('')}`;
}
