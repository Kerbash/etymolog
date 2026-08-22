/**
 * @fileoverview `generateWords` — a profile and an inventory in, a batch out.
 *
 * The whole engine meets here. The method is rejection sampling: build a
 * candidate out of the templates and the weighted inventory, ask
 * `constraints.ts` whether it is allowed, keep it or count why not. That is the
 * only approach that stays honest as the profile grows — a constructive
 * generator that "knew" about sonority and harmony and geminates would have to
 * be rewritten for every rule the user is given, and would still be wrong at the
 * edges.
 *
 * Rejection sampling has exactly one failure mode, and it is the one this module
 * is written around: a profile whose rules cannot be satisfied. There is a hard
 * attempt cap (`count × 40`), the loop can never run longer than that, and a
 * short batch comes back with the reason and the rule that ate the candidates —
 * so a user who asked for 20 words and got 3 is told that their forbidden list
 * rejected 700 candidates, rather than watching a spinner.
 *
 * BUILD ONCE, PICK MANY. Everything that does not vary between candidates —
 * weights, class pools, parsed templates, literal groups filtered against the
 * inventory, the harmony partitions — is computed before the loop starts. A
 * batch of 100 is comfortably inside a frame; the timing test pins it.
 *
 * @module generator/engine/generate
 */

import { createRng, pickInt, pickWeighted } from './random';
import { phonemeWeights } from './weights';
import { expandTemplate, isValidTemplatePattern, parseTemplate } from './template';
import { buildSyllable, checkWord, isVocalic, slotHarmony, soundsOf } from './constraints';
import { normalizePronunciation } from './normalize';
import { phonemeIdentity, LENGTH_MARK } from '../phonology/features';
import { CLASS_LABELS } from '../phonology/classes';
import type { Rng } from './random';
import type { Syllable } from './constraints';
import type { ClassLetter } from '../phonology/classes';
import type { ClassifiedInventory, InventoryMember } from '../inventory';
import type { WordGeneratorProfile } from '../profile/types';

// =============================================================================
// PUBLIC SHAPES
// =============================================================================

export interface GeneratedWord {
    /** The word as one string — what gets stored on a lexicon entry. */
    ipa: string;
    /** The same word split into syllables, for the `ta·ki·no` display. */
    syllables: string[];
    /**
     * Position in the batch, 0-based.
     *
     * A batch is a function of its seed, so this is the coordinate that names a
     * word: "seed 4213, word 2" identifies it exactly, and a user reporting a
     * bad word can be answered without shipping the word around.
     */
    seedIndex: number;
}

/** Why a batch came back short. */
export interface Shortfall {
    reason: 'exhausted' | 'empty-inventory' | 'no-vowels' | 'no-consonants';
    /** Candidates built before the engine gave up. */
    attempts: number;
    /**
     * How many candidates each rule threw away, keyed by the rule's name. Two
     * keys are not rules and are documented as such: `emptySlot` (a template
     * slot had nothing left to fill it with, after harmony narrowing) and
     * `duplicate` (a word the batch or the lexicon already had).
     */
    rejected: Record<string, number>;
}

export interface GeneratedBatch {
    words: GeneratedWord[];
    seed: number;
    requested: number;
    shortfall?: Shortfall;
    /** Build-time notes: dropped literal members, skipped templates, unusable sounds. */
    warnings: string[];
}

export interface GenerateOptions {
    count: number;
    seed: number;
    /**
     * Pronunciations that already exist — the lexicon. Compared in normalised
     * form, so a stored `ˈka.ta` blocks a generated `kata`.
     */
    existing?: Iterable<string>;
}

/** How many candidates may be built per word asked for before the engine gives up. */
export const ATTEMPTS_PER_WORD = 40;

// =============================================================================
// BUILD-TIME STRUCTURES
// =============================================================================

/** One sound a slot can be filled with, with everything the loop needs about it. */
interface Candidate {
    sound: string;
    weight: number;
    /** The harmony bucket this fill would establish, or `null` for neutral. */
    harmony: 'front' | 'back' | null;
    /** A single vowel that has no length mark yet — the only thing `longVowelChance` may touch. */
    lengthenable: boolean;
}

/**
 * A pool of candidates, pre-partitioned for harmony.
 *
 * The partitions are built once rather than filtered per pick: with harmony on,
 * every vowel slot after the first would otherwise allocate a new array, and
 * the vowel slots are most of the slots.
 */
interface Pool {
    all: Candidate[];
    /** Candidates compatible with an established FRONT word (front + neutral). */
    front: Candidate[];
    /** Candidates compatible with an established BACK word (back + neutral). */
    back: Candidate[];
}

/** One slot of a template, bound to the sounds that can fill it. */
interface BuiltSlot {
    optional: boolean;
    pool: Pool;
}

interface BuiltTemplate {
    pattern: string;
    weight: number;
    slots: BuiltSlot[];
}

function emptyPool(): Pool {
    return { all: [], front: [], back: [] };
}

function poolOf(candidates: Candidate[]): Pool {
    return {
        all: candidates,
        front: candidates.filter((candidate) => candidate.harmony !== 'back'),
        back: candidates.filter((candidate) => candidate.harmony !== 'front'),
    };
}

function poolFor(pool: Pool, established: 'front' | 'back' | null): Candidate[] {
    if (established === 'front') return pool.front;
    if (established === 'back') return pool.back;
    return pool.all;
}

/** Turn one usable inventory member into a candidate. */
function candidateOf(member: InventoryMember, weight: number): Candidate {
    const sound = member.phoneme;
    return {
        sound,
        weight,
        harmony: slotHarmony(sound),
        lengthenable: member.features.kind === 'vowel' && !member.features.long,
    };
}

/** A candidate for a literal-group member, which may be a diphthong rather than one sound. */
function literalCandidate(member: string): Candidate {
    const sounds = soundsOf(member);
    const single = sounds.length === 1 && isVocalic(member);
    return {
        sound: member,
        harmony: slotHarmony(member),
        // Literal members are picked UNIFORMLY. A literal group is the user
        // naming a short, deliberate handful ("codas are n and ŋ"); applying the
        // commonness curve to it would quietly override the choice they just
        // made by hand.
        weight: 1,
        lengthenable: single && !member.includes(LENGTH_MARK),
    };
}

// =============================================================================
// THE ENGINE
// =============================================================================

/**
 * Generate a batch.
 *
 * Deterministic: the same profile, inventory, seed and count produce the same
 * words, in the same order, every time. `existing` participates in that — a
 * different lexicon is a different batch — which is why the seed is shown to
 * the user next to the words rather than hidden.
 */
export function generateWords(
    profile: WordGeneratorProfile,
    inventory: ClassifiedInventory,
    options: GenerateOptions,
): GeneratedBatch {
    const seed = Number.isFinite(options.seed) ? options.seed >>> 0 : 0;
    const requested = Number.isFinite(options.count) ? Math.max(0, Math.floor(options.count)) : 0;
    const warnings: string[] = [];
    const rejected = new Map<string, number>();
    const rng = createRng(seed);

    const reject = (key: string): void => {
        rejected.set(key, (rejected.get(key) ?? 0) + 1);
    };
    const finish = (
        words: GeneratedWord[],
        attempts: number,
        reason: Shortfall['reason'] | null,
    ): GeneratedBatch => {
        const batch: GeneratedBatch = { words, seed, requested, warnings };
        if (reason !== null && words.length < requested) {
            batch.shortfall = { reason, attempts, rejected: Object.fromEntries(rejected) };
        }
        return batch;
    };

    if (inventory.unknown.length > 0) {
        warnings.push(
            `${inventory.unknown.length} inventory ${inventory.unknown.length === 1 ? 'entry is' : 'entries are'} `
            + `not a sound this app recognises and cannot be used: ${inventory.unknown.join(' ')}`,
        );
    }

    // ---- weights and pools ---------------------------------------------------

    const weights = phonemeWeights(inventory.members.map((member) => member.phoneme), profile);
    const usable = inventory.members.filter((member) => weights.has(member.phoneme));
    const silenced = inventory.members.length - usable.length;
    if (silenced > 0) {
        warnings.push(`${silenced} ${silenced === 1 ? 'sound is' : 'sounds are'} switched off and will not appear.`);
    }

    if (usable.length === 0) {
        return finish([], 0, 'empty-inventory');
    }

    const classPools = new Map<ClassLetter, Pool>();
    const byClass = new Map<ClassLetter, Candidate[]>();
    for (const member of usable) {
        const candidate = candidateOf(member, weights.get(member.phoneme) ?? 0);
        for (const letter of member.classes) {
            const list = byClass.get(letter);
            if (list) list.push(candidate);
            else byClass.set(letter, [candidate]);
        }
    }
    for (const [letter, candidates] of byClass) classPools.set(letter, poolOf(candidates));
    const usableIdentities = new Set(usable.map((member) => phonemeIdentity(member.phoneme)));

    const hasVowels = (byClass.get('V')?.length ?? 0) > 0;
    const hasConsonants = (byClass.get('C')?.length ?? 0) > 0;
    if (!hasVowels) return finish([], 0, 'no-vowels');

    // ---- templates -----------------------------------------------------------

    const templates: BuiltTemplate[] = [];
    for (const template of profile.syllables ?? []) {
        const check = isValidTemplatePattern(template.pattern);
        if (!check.ok) {
            warnings.push(`the shape "${template.pattern}" could not be read (${check.message}) and was skipped.`);
            continue;
        }
        if (!Number.isFinite(template.weight) || template.weight <= 0) {
            warnings.push(`the shape "${template.pattern}" has no weight and was skipped.`);
            continue;
        }

        const slots: BuiltSlot[] = [];
        let usableTemplate = true;
        for (const item of parseTemplate(template.pattern)) {
            let pool: Pool;
            let what: string;
            if (item.kind === 'class') {
                pool = classPools.get(item.letter) ?? emptyPool();
                what = `${item.letter} (${CLASS_LABELS[item.letter]})`;
            } else {
                const kept: Candidate[] = [];
                for (const member of item.members) {
                    if (!memberIsAvailable(member, usableIdentities)) {
                        // "not usable", not "not in the inventory": `usableIdentities` is
                        // the inventory MINUS everything tilted `off`, so a sound the user
                        // deliberately switched off lands here too, and a warning telling
                        // them it is missing sends them looking for a typo that is not there.
                        warnings.push(
                            `"${template.pattern}" names ${member}, which is not available `
                            + `(not in the inventory, or switched off) — dropped from that group.`,
                        );
                        continue;
                    }
                    kept.push(literalCandidate(member));
                }
                pool = poolOf(kept);
                what = `the group [${item.members.join(' ')}]`;
            }

            if (pool.all.length === 0) {
                if (item.optional) {
                    warnings.push(`"${template.pattern}" has nothing to fill ${what} — that slot is left out.`);
                    continue;
                }
                warnings.push(`"${template.pattern}" needs ${what} and no usable sound fills it — the shape was skipped.`);
                usableTemplate = false;
                break;
            }
            slots.push({ optional: item.optional, pool });
        }

        if (!usableTemplate || slots.length === 0) continue;
        templates.push({ pattern: template.pattern, weight: template.weight, slots });
    }

    if (templates.length === 0) {
        // Which of the two things went wrong matters to the user: an inventory
        // with no consonants at all is a different fix from a set of shapes that
        // happen not to fit.
        return finish([], 0, hasConsonants ? 'exhausted' : 'no-consonants');
    }

    // ---- the loop ------------------------------------------------------------

    const minCount = clampSyllableCount(profile.syllableCount?.min, 1);
    const maxCount = Math.max(minCount, clampSyllableCount(profile.syllableCount?.max, minCount));
    const harmonyOn = profile.vowelHarmony === 'frontBack';
    const longChance = Number.isFinite(profile.longVowelChance)
        ? Math.min(1, Math.max(0, profile.longVowelChance))
        : 0;

    const taken = new Set<string>();
    for (const entry of options.existing ?? []) {
        if (typeof entry !== 'string') continue;
        const key = normalizePronunciation(entry);
        if (key.length > 0) taken.add(key);
    }

    const words: GeneratedWord[] = [];
    const cap = requested * ATTEMPTS_PER_WORD;
    let attempts = 0;

    while (words.length < requested && attempts < cap) {
        attempts += 1;
        const candidate = buildCandidate(rng, templates, minCount, maxCount, harmonyOn, longChance);
        if (candidate === null) {
            reject('emptySlot');
            continue;
        }

        const violation = checkWord(candidate, profile, inventory);
        if (violation) {
            reject(violation.rule);
            continue;
        }

        const syllables = candidate.map((syllable) => syllable.text);
        const ipa = syllables.join('');
        const key = normalizePronunciation(ipa);
        if (key.length === 0 || taken.has(key)) {
            reject('duplicate');
            continue;
        }
        taken.add(key);
        words.push({ ipa, syllables, seedIndex: words.length });
    }

    return finish(words, attempts, 'exhausted');
}

/** Syllables per word, held to the profile's documented 1–5 even if the value was hand-edited. */
function clampSyllableCount(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(5, Math.max(1, Math.floor(value)));
}

/**
 * Is every sound of a literal-group member in the usable inventory?
 *
 * Sound by sound, so a diphthong member (`ai`) is legal in a preset whose
 * inventory lists `a` and `i` separately — which is the only way a diphthong can
 * be declared, since it is not a phoneme. A member with an `off` sound in it
 * fails here, which is what makes switching a sound off remove it from literal
 * groups too rather than only from the classes.
 */
function memberIsAvailable(member: string, usable: ReadonlySet<string>): boolean {
    const sounds = soundsOf(member);
    if (sounds.length === 0) return false;
    return sounds.every((sound) => {
        if (usable.has(phonemeIdentity(sound))) return true;
        // The same one-way length licence `inventoryHas` grants, so that a
        // literal written `[aː]` against an inventory of plain vowels is kept
        // here and then accepted by the rule, rather than dropped by one and
        // allowed by the other.
        if (!sound.includes(LENGTH_MARK)) return false;
        return usable.has(phonemeIdentity(sound.split(LENGTH_MARK).join('')));
    });
}

/**
 * Build ONE candidate word, or `null` when a required slot had nothing to fill
 * it with (which harmony can cause even when the pool was non-empty at build
 * time).
 */
function buildCandidate(
    rng: Rng,
    templates: readonly BuiltTemplate[],
    minCount: number,
    maxCount: number,
    harmonyOn: boolean,
    longChance: number,
): Syllable[] | null {
    const syllableCount = pickInt(rng, minCount, maxCount);
    const word: Syllable[] = [];
    let established: 'front' | 'back' | null = null;

    for (let index = 0; index < syllableCount; index += 1) {
        const template = pickWeighted(rng, templates, (item) => item.weight);
        if (template === null) return null;

        const slots: BuiltSlot[] = expandTemplate(template.slots, rng);
        const filled: string[] = [];
        for (const slot of slots) {
            const pool: Candidate[] = harmonyOn ? poolFor(slot.pool, established) : slot.pool.all;
            const picked = pickWeighted(rng, pool, (candidate) => candidate.weight);
            if (picked === null) return null;

            let sound = picked.sound;
            // The length roll happens only where length can land, so a profile
            // with no vowels in a slot does not silently consume the stream.
            if (picked.lengthenable && longChance > 0 && rng() < longChance) {
                sound += LENGTH_MARK;
            }
            if (harmonyOn && established === null && picked.harmony !== null) established = picked.harmony;
            filled.push(sound);
        }

        if (filled.length === 0) {
            // Every slot of the shape was optional and every one was dropped.
            // An empty syllable is not a word; abandon the candidate rather than
            // emitting a word with a hole in it.
            return null;
        }
        word.push(buildSyllable(filled));
    }

    return word.length === 0 ? null : word;
}
