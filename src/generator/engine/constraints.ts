/**
 * @fileoverview The rules a candidate word has to survive.
 *
 * The engine generates by REJECTION SAMPLING: build a word from the templates
 * and the inventory, then ask this module whether it is allowed. That is why
 * every rule here is a pure function of `(word, profile, inventory)` and returns
 * a {@link Violation} rather than a boolean — the shortfall report tells the user
 * WHICH rule threw most of their words away, and it can only do that if the
 * rules name themselves.
 *
 * It is also why the rules are written so they can be applied to a word nobody
 * generated. A test that only checked the engine against its own rule functions
 * would prove nothing; a test can build `["kat", "ta"]` by hand and ask.
 *
 * @module generator/engine/constraints
 */

import { describePhoneme, phonemeIdentity } from '../phonology/features';
import { splitPhonemeString } from '../phonology/tokenize';
import { isValidCoda, isValidContact, isValidOnset, splitMedialCluster } from '../phonology/sonority';
import { normalizePronunciation } from './normalize';
import { inventoryHas } from '../inventory';
import type { PhonemeFeatures, VowelBackness } from '../phonology/features';
import type { ClassifiedInventory } from '../inventory';
import type { WordGeneratorProfile } from '../profile/types';

// =============================================================================
// SHAPES
// =============================================================================

/**
 * One syllable of a candidate.
 *
 * `slots` is what the template produced — one entry per filled slot, which is
 * NOT the same as one entry per sound: a literal group may name a diphthong
 * (`ai`), so a single nucleus slot can be two vowels. Everything that counts
 * sounds therefore goes through {@link soundsOf} rather than reading `slots`.
 *
 * The onset / nucleus / coda split is DERIVED from the slots rather than
 * recorded by the generator, so a hand-built word splits the same way a
 * generated one does and the rules cannot be tested against a fiction.
 */
export interface Syllable {
    slots: string[];
    /** Slots before the first vowel. */
    onset: string[];
    /** The vowel run, or empty for a syllable a template left vowel-less. */
    nucleus: string[];
    /** Slots after the last vowel. */
    coda: string[];
    /** The syllable as one string — `slots` joined, which is what the UI shows. */
    text: string;
}

/** The rules, by the name the shortfall report uses. */
export type ConstraintRule =
    | 'noForbiddenSequences'
    | 'noIllegalGeminates'
    | 'sonorityInClusters'
    | 'clusterBudget'
    | 'vowelHarmony'
    | 'inventoryOnly';

/** Why a candidate was thrown away. */
export interface Violation {
    rule: ConstraintRule;
    /** The sounds that triggered it — what the debug panel underlines. */
    offenders: string[];
    /** Rule-specific context: a limit, a backness bucket, a forbidden entry. */
    detail?: string;
}

// =============================================================================
// MEMOISED PHONOLOGY
// =============================================================================
//
// The rules ask "what is this sound?" about the same handful of strings tens of
// thousands of times in a batch, and `describePhoneme` normalises and peels on
// every call. These caches turn that into a map lookup. They are safe because
// both functions are pure and their inputs are short strings from a bounded
// inventory; the cap is there for the pathological case (a caller feeding
// unbounded user text) rather than for anything the generator does.

const MAX_CACHE = 4096;
const FEATURE_CACHE = new Map<string, PhonemeFeatures | null>();
const SOUNDS_CACHE = new Map<string, string[]>();

function featuresOf(sound: string): PhonemeFeatures | null {
    const cached = FEATURE_CACHE.get(sound);
    if (cached !== undefined) return cached;
    const features = describePhoneme(sound);
    if (FEATURE_CACHE.size >= MAX_CACHE) FEATURE_CACHE.clear();
    FEATURE_CACHE.set(sound, features);
    return features;
}

/**
 * The individual sounds inside a slot.
 *
 * A slot is usually one sound and comes back as itself. A diphthong literal
 * (`ai`) comes back as two. A sound the tokenizer splits but that IS one
 * phoneme (`tʃ` without a tie bar — see the note in `tokenize.ts`) is kept
 * whole, because `describePhoneme` recognised it and the slot was filled with
 * it deliberately.
 */
export function soundsOf(slot: string): string[] {
    const cached = SOUNDS_CACHE.get(slot);
    if (cached !== undefined) return cached;
    const sounds = featuresOf(slot) !== null
        ? [slot]
        : splitPhonemeString(slot).map((token) => token.text).filter((text) => text.length > 0);
    if (SOUNDS_CACHE.size >= MAX_CACHE) SOUNDS_CACHE.clear();
    SOUNDS_CACHE.set(slot, sounds);
    return sounds;
}

/** Is every sound in this slot a vowel? `a` and `ai` yes, `n` and `an` no. */
export function isVocalic(slot: string): boolean {
    const sounds = soundsOf(slot);
    return sounds.length > 0 && sounds.every((sound) => featuresOf(sound)?.kind === 'vowel');
}

/**
 * Is this sound a consonant?
 *
 * An UNCLASSIFIABLE sound answers `true`. That is the conservative reading for
 * every caller here: an unknown symbol between two consonants should extend the
 * cluster rather than silently break it in two and halve the cluster count.
 * `inventoryOnly` rejects the word anyway, but the two rules must not disagree
 * about what they are looking at.
 */
function isConsonant(sound: string): boolean {
    return featuresOf(sound)?.kind !== 'vowel';
}

/** Build the onset / nucleus / coda view of a syllable from its filled slots. */
export function buildSyllable(slots: readonly string[]): Syllable {
    const list = slots.filter((slot) => typeof slot === 'string' && slot.length > 0);
    let first = -1;
    let last = -1;
    list.forEach((slot, index) => {
        if (!isVocalic(slot)) return;
        if (first === -1) first = index;
        last = index;
    });
    // No vowel: the whole thing is an onset. A template CAN produce this — every
    // slot of `(C)(V)` is optional — and calling it an onset puts it under the
    // rising-sonority rule, which is the right question to ask of a consonant
    // run that has nothing to lean on.
    if (first === -1) {
        return { slots: list, onset: list, nucleus: [], coda: [], text: list.join('') };
    }
    return {
        slots: list,
        onset: list.slice(0, first),
        nucleus: list.slice(first, last + 1),
        coda: list.slice(last + 1),
        text: list.join(''),
    };
}

/** Every sound of a whole word, in order, syllable boundaries flattened away. */
export function wordSounds(word: readonly Syllable[]): string[] {
    const sounds: string[] = [];
    for (const syllable of word) {
        for (const slot of syllable.slots) sounds.push(...soundsOf(slot));
    }
    return sounds;
}

/** Every sound of a run of slots, in order. */
function slotSounds(slots: readonly string[]): string[] {
    const sounds: string[] = [];
    for (const slot of slots) sounds.push(...soundsOf(slot));
    return sounds;
}

// =============================================================================
// SYLLABIFICATION FOR THE SONORITY RULES
// =============================================================================

/**
 * One vowel peak with the consonants that belong to it.
 *
 * This is the unit the sonority rules are actually about, and it is NOT always
 * a {@link Syllable}: a template is free to name two vowels with consonants
 * between them (`VCCV`), which is one template-syllable but two peaks, and the
 * consonant run in the middle belongs half to each. `Syllable` keeps describing
 * what the template produced — `text` is what the UI prints between the dots —
 * while this describes how it is pronounced.
 */
export interface SonorityUnit {
    onset: string[];
    nucleus: string[];
    coda: string[];
    /** Onset + nucleus + coda, which is every sound of the unit in order. */
    sounds: string[];
}

/**
 * Break one syllable into its vowel peaks, splitting any consonant run BETWEEN
 * two peaks by the maximal-onset principle.
 *
 * Why this exists: `buildSyllable` calls everything between the first and the
 * last vowel the "nucleus", so a `VCCV` shape had an empty onset, an empty coda
 * and a two-consonant nucleus — and `arki`, `apka`, `atska` all sailed past
 * `isValidOnset`/`isValidCoda` with `clusters.sonority` switched ON. A user who
 * asked for pronounceable words got a rule that quietly did not look at the one
 * cluster in the word. Splitting the run gives both halves something to be
 * judged as, and hands the junction to the contact law.
 *
 * A syllable with no vowel at all stays one unit whose sounds are all "onset",
 * which is what the rule already did with it and the right question to ask of a
 * consonant run that has nothing to lean on.
 *
 * Adjacent vowels are ONE peak (`kait` is `k-ai-t`, not two syllables): a
 * diphthong literal is a single nucleus by construction, and re-splitting hiatus
 * would invent syllable boundaries the template never asked for.
 */
export function syllableUnits(syllable: Syllable): SonorityUnit[] {
    const sounds = slotSounds(syllable.slots);
    const vowelAt = sounds.map((sound) => !isConsonant(sound));

    // Where each vowel run starts and ends, in sound indices.
    const peaks: { start: number; end: number }[] = [];
    for (let i = 0; i < sounds.length; i += 1) {
        if (!vowelAt[i]) continue;
        const last = peaks[peaks.length - 1];
        if (last && last.end === i - 1) last.end = i;
        else peaks.push({ start: i, end: i });
    }

    if (peaks.length === 0) {
        return [{ onset: sounds, nucleus: [], coda: [], sounds }];
    }

    // Divide every medial run first, so each peak can simply take the coda the
    // split on its right produced and the onset the split on its left produced.
    const splits = peaks.slice(0, -1).map((peak, index) =>
        splitMedialCluster(sounds.slice(peak.end + 1, peaks[index + 1].start)));

    return peaks.map((peak, index) => {
        const onset = index === 0 ? sounds.slice(0, peak.start) : splits[index - 1].onset;
        const nucleus = sounds.slice(peak.start, peak.end + 1);
        const coda = index === peaks.length - 1 ? sounds.slice(peak.end + 1) : splits[index].coda;
        return { onset, nucleus, coda, sounds: [...onset, ...nucleus, ...coda] };
    });
}

/** The whole word as sonority units, syllable by syllable, in order. */
function wordUnits(word: readonly Syllable[]): SonorityUnit[] {
    const units: SonorityUnit[] = [];
    for (const syllable of word) units.push(...syllableUnits(syllable));
    return units;
}

// =============================================================================
// THE RULES
// =============================================================================

/**
 * Nothing in `profile.forbidden` may appear in the word.
 *
 * Two passes, because a user writes a forbidden sequence in two different
 * spirits. A run of WHOLE sounds is tried first (`["k", "t"]` for `kt`), which
 * gives an offender list of real sounds for the debug panel; a plain substring
 * of the joined transcription is the fallback, which catches an entry that cuts
 * across a sound (`aː` inside `aːː`, a bare diacritic). Both sides are
 * normalised, so a user who typed `ˈkt` or `k.t` gets what they meant.
 */
export function noForbiddenSequences(
    word: readonly Syllable[],
    profile: WordGeneratorProfile,
): Violation | null {
    const forbidden = profile.forbidden;
    if (!Array.isArray(forbidden) || forbidden.length === 0) return null;

    const sounds = wordSounds(word);
    const normalisedSounds = sounds.map(normalizePronunciation);
    const joined = normalisedSounds.join('');

    for (const entry of forbidden) {
        if (typeof entry !== 'string') continue;
        const needle = normalizePronunciation(entry);
        if (needle.length === 0) continue;

        for (let start = 0; start < sounds.length; start += 1) {
            let run = '';
            for (let end = start; end < sounds.length; end += 1) {
                run += normalisedSounds[end];
                if (run.length > needle.length) break;
                if (run === needle) {
                    return { rule: 'noForbiddenSequences', offenders: sounds.slice(start, end + 1), detail: entry };
                }
            }
        }
        if (joined.includes(needle)) {
            return { rule: 'noForbiddenSequences', offenders: [entry], detail: entry };
        }
    }
    return null;
}

/**
 * No two identical consonants side by side, unless the profile allows them.
 *
 * Identity, not raw text: `ɡ` and `g` are the same consonant twice, and `t` +
 * `tʰ` are NOT — a doubled consonant is a length contrast, and an aspirated
 * release makes it a cluster of two different sounds instead.
 *
 * Every adjacent pair is checked, not only the pairs that straddle a syllable
 * boundary. A `tt` inside one onset is the same doubled consonant, and with
 * `clusters.sonority` switched off nothing else would catch it.
 */
export function noIllegalGeminates(
    word: readonly Syllable[],
    profile: WordGeneratorProfile,
): Violation | null {
    if (profile.clusters?.allowGeminates) return null;
    const sounds = wordSounds(word);
    for (let i = 1; i < sounds.length; i += 1) {
        const previous = sounds[i - 1];
        const current = sounds[i];
        if (!isConsonant(previous) || !isConsonant(current)) continue;
        if (phonemeIdentity(previous) !== phonemeIdentity(current)) continue;
        return { rule: 'noIllegalGeminates', offenders: [previous, current] };
    }
    return null;
}

/**
 * Onsets rise in sonority, codas fall, and junctions do not rise.
 *
 * Three checks under one switch, because they are one idea — "the word has to be
 * sayable" — split three ways only by where in the word the difficulty sits:
 *
 * - INSIDE a syllable, sonority sequencing: an onset climbs towards the vowel,
 *   a coda falls away from it.
 * - BETWEEN two syllables, the Syllable Contact Law: the sonority may fall or
 *   stay level across the seam, never rise. Without it every syllable can be
 *   perfect and the word still unsayable (`ʒog.dmɔd.ʃut` — a fifth of the
 *   presets' junctions rose before this was added). See `isValidContact` for the
 *   decision to fold it into `clusters.sonority` rather than give it a field.
 * - The word EDGES are exempt from contact by construction: a word-initial onset
 *   has no coda in front of it and a word-final coda has nothing after it.
 *
 * The `s`+stop licence is asked for ONLY at the very start of the word: it is a
 * word-initial exception (`street`, `sport`), and letting it fire mid-word would
 * quietly legalise `-tstr-` across a boundary. `isValidOnset` anchors it to the
 * first position within the onset as well, so both halves of "at the start of a
 * word-initial onset" are enforced.
 *
 * The word is re-read as {@link SonorityUnit}s rather than as syllables so that
 * a template with two vowels in it (`VCCV`) is judged on its real onsets and
 * codas instead of hiding its cluster in a "nucleus".
 */
export function sonorityInClusters(
    word: readonly Syllable[],
    profile: WordGeneratorProfile,
): Violation | null {
    if (!profile.clusters?.sonority) return null;
    const exception = Boolean(profile.clusters?.sibilantOnsetException);
    const units = wordUnits(word);

    for (let index = 0; index < units.length; index += 1) {
        const unit = units[index];
        if (!isValidOnset(unit.onset, { allowSibilantOnset: exception && index === 0 })) {
            return { rule: 'sonorityInClusters', offenders: unit.onset, detail: 'onset' };
        }
        if (!isValidCoda(unit.coda)) {
            return { rule: 'sonorityInClusters', offenders: unit.coda, detail: 'coda' };
        }

        const next = units[index + 1];
        if (!next) continue;
        // The two sounds that MEET, which is not always coda-final and
        // onset-initial: a vowel-less unit has no coda but its last consonant
        // still collides with what follows.
        const left = unit.sounds[unit.sounds.length - 1];
        const right = next.sounds[0];
        if (left === undefined || right === undefined) continue;
        if (!isValidContact(left, right)) {
            return { rule: 'sonorityInClusters', offenders: [left, right], detail: 'contact' };
        }
    }
    return null;
}

/**
 * Count the consonant clusters in a word and hold them to the profile's budget.
 *
 * A CLUSTER is one run of two or more adjacent consonants, counted across the
 * whole word with syllable boundaries flattened — `kat.ta` has one (the `tt`),
 * `stra.pil` has one (the `str`, a run of three is still one cluster). Counting
 * runs rather than pairs is what makes "at most one cluster" mean what a user
 * expects: one difficult place in the word, however long it is.
 */
export function clusterBudget(
    word: readonly Syllable[],
    profile: WordGeneratorProfile,
): Violation | null {
    // Floored at zero as well as guarded for finiteness. The validator holds
    // `maxPerWord` to 0..4, but a profile can reach the engine without passing
    // through it (a hand-edited export, a test, a future caller), and a negative
    // limit is the one value that makes `clusters <= limit` false for a word with
    // NO clusters at all — every candidate rejected, blamed on a budget the user
    // cannot see being exceeded. Zero and "less than zero" mean the same thing here.
    const raw = profile.clusters?.maxPerWord;
    const limit = Number.isFinite(raw) ? Math.max(0, Math.floor(raw as number)) : 0;
    const sounds = wordSounds(word);

    let clusters = 0;
    let run = 0;
    const offenders: string[] = [];
    let current: string[] = [];
    for (const sound of sounds) {
        if (isConsonant(sound)) {
            run += 1;
            current.push(sound);
            if (run === 2) {
                clusters += 1;
                if (offenders.length === 0) offenders.push(...current);
            }
            continue;
        }
        run = 0;
        current = [];
    }

    if (clusters <= limit) return null;
    return {
        rule: 'clusterBudget',
        offenders,
        detail: `${clusters} of at most ${limit}`,
    };
}

/** Which side of the harmony line a vowel sits on. `central` is neutral: it goes with either. */
function harmonyBucket(backness: VowelBackness): 'front' | 'back' | null {
    if (backness === 'front') return 'front';
    if (backness === 'back') return 'back';
    return null;
}

/**
 * The harmony bucket a SLOT contributes, or `null` for a consonant or a neutral
 * vowel.
 *
 * A diphthong literal counts by its FIRST vowel: `ai` is a back-to-front glide
 * and it is the starting point that the following syllables are expected to
 * agree with, which is also how the harmonic languages that have such
 * diphthongs behave.
 */
export function slotHarmony(slot: string): 'front' | 'back' | null {
    if (!isVocalic(slot)) return null;
    for (const sound of soundsOf(slot)) {
        const features = featuresOf(sound);
        if (features?.kind !== 'vowel') continue;
        return harmonyBucket(features.backness);
    }
    return null;
}

/**
 * Front-back vowel harmony: every vowel of a word on the same side, with
 * central vowels neutral.
 *
 * Turkish and Finnish style, and the reason a generated set sounds like one
 * language rather than like a pile of syllables: harmony is the loudest
 * word-level pattern a listener picks up on.
 */
export function vowelHarmony(
    word: readonly Syllable[],
    profile: WordGeneratorProfile,
): Violation | null {
    if (profile.vowelHarmony !== 'frontBack') return null;

    let established: 'front' | 'back' | null = null;
    let establishedBy = '';
    for (const syllable of word) {
        for (const slot of syllable.slots) {
            const bucket = slotHarmony(slot);
            if (bucket === null) continue;
            if (established === null) {
                established = bucket;
                establishedBy = slot;
                continue;
            }
            if (bucket !== established) {
                return {
                    rule: 'vowelHarmony',
                    offenders: [establishedBy, slot],
                    detail: `${established} then ${bucket}`,
                };
            }
        }
    }
    return null;
}

/**
 * Every sound of the word has to be in the inventory.
 *
 * The rule that catches a literal group naming a sound the user does not have.
 * The engine also drops such members when it builds its templates (with a
 * warning, which is the useful signal), but a rule that only ran at build time
 * could not be applied to a word a test — or a future paste-a-word feature —
 * hands it.
 *
 * SOUNDS, not slots: a diphthong slot `ai` is checked as `a` and `i`, which is
 * what makes a diphthong literal legal in a preset whose inventory has only
 * plain vowels.
 */
export function inventoryOnly(
    word: readonly Syllable[],
    _profile: WordGeneratorProfile,
    inventory: ClassifiedInventory,
): Violation | null {
    for (const sound of wordSounds(word)) {
        if (inventoryHas(inventory, sound)) continue;
        return { rule: 'inventoryOnly', offenders: [sound] };
    }
    return null;
}

/**
 * The rules, in the order the engine runs them.
 *
 * Order is a decision, not an accident: the cheap, most-often-triggered rules
 * come first so the common rejection costs the least, and the shortfall report
 * attributes a word to the FIRST rule it broke — which is the one a user should
 * loosen first.
 */
export const CONSTRAINT_RULES: readonly ((
    word: readonly Syllable[],
    profile: WordGeneratorProfile,
    inventory: ClassifiedInventory,
) => Violation | null)[] = [
    noForbiddenSequences,
    noIllegalGeminates,
    sonorityInClusters,
    clusterBudget,
    vowelHarmony,
    inventoryOnly,
];

/** Run every rule; the first violation wins, `null` means the word is allowed. */
export function checkWord(
    word: readonly Syllable[],
    profile: WordGeneratorProfile,
    inventory: ClassifiedInventory,
): Violation | null {
    for (const rule of CONSTRAINT_RULES) {
        const violation = rule(word, profile, inventory);
        if (violation) return violation;
    }
    return null;
}

/** One sentence a user can act on, for the debug panel and the shortfall banner. */
export function explainViolation(violation: Violation): string {
    const sounds = violation.offenders.join('');
    switch (violation.rule) {
        case 'noForbiddenSequences':
            return `"${violation.detail ?? sounds}" is on the forbidden list`;
        case 'noIllegalGeminates':
            return `"${sounds}" doubles a consonant, which this profile does not allow`;
        case 'sonorityInClusters':
            if (violation.detail === 'coda') return `the coda "${sounds}" does not fall in sonority`;
            if (violation.detail === 'contact') {
                return `"${sounds}" rises in sonority across a syllable boundary, which is hard to say`;
            }
            return `the onset "${sounds}" does not rise in sonority`;
        case 'clusterBudget':
            return `too many consonant clusters (${violation.detail ?? ''})`.trim();
        case 'vowelHarmony':
            return `the vowels do not harmonise (${violation.detail ?? sounds})`;
        case 'inventoryOnly':
            return `"${sounds}" is not in the inventory`;
    }
}
