/**
 * @fileoverview The sounds a batch may be built from, classified.
 *
 * The generator never asks where the sounds came from. The PAGE decides that —
 * `profile.inventory` when the user has set an explicit list, otherwise the
 * phonemes their own script spells with — and hands the result here as a plain
 * array of strings. That is what keeps `src/generator/` free of the db: the
 * engine's world is a list of sounds and a profile, and both are arguments.
 *
 * What this module adds to the list is the three things every later step needs
 * and none of them should work out for itself: what each sound IS (features),
 * which template letters it can fill (classes), and how the user has tilted it.
 * Anything the feature table cannot classify is set aside in `unknown` rather
 * than dropped silently — a typo in an inventory is invisible otherwise, and
 * the UI can show it back.
 *
 * @module generator/inventory
 */

import { describePhoneme, phonemeIdentity, LENGTH_MARK } from './phonology/features';
import { classOf, CLASS_LETTERS } from './phonology/classes';
import { tiltFor } from './engine/weights';
import type { PhonemeFeatures } from './phonology/features';
import type { ClassLetter } from './phonology/classes';
import type { FrequencyTilt, WordGeneratorProfile } from './profile/types';

/** One usable sound, with everything the engine and the UI ask about it. */
export interface InventoryMember {
    /** The sound exactly as the source spelt it — what the UI shows and what tilts are keyed by. */
    phoneme: string;
    features: PhonemeFeatures;
    /** Every template letter this sound can fill, in `CLASS_LETTERS` order. */
    classes: ClassLetter[];
    /** `off` members stay in the list: the UI shows them muted, the engine skips them. */
    tilt: FrequencyTilt;
    /**
     * Whether the user's own script has this sound. Only set when the caller
     * passes `conlangPhonemes` — a preset's inventory shown to a user with no
     * graphemes has nothing to compare against, and `false` there would read as
     * "your script is missing this" rather than "there is no script yet".
     */
    inConlang?: boolean;
}

export interface ClassifiedInventory {
    members: InventoryMember[];
    /**
     * Class letter to the sounds that can fill it, in inventory order. Every
     * letter is a key, with an empty array when nothing fills it, so a caller
     * can iterate the classes without checking for `undefined`.
     *
     * `off` members ARE listed here: this is the picture of the inventory, not
     * the engine's pool. The engine filters by tilt when it builds its pools.
     */
    byClass: Map<ClassLetter, string[]>;
    /** Entries `describePhoneme` could not classify, in source order, deduplicated. */
    unknown: string[];
}

/** Options for {@link deriveInventory}. */
export interface DeriveInventoryOptions {
    /**
     * The phonemes the user's script actually uses, for the `inConlang` flag.
     * Compared by identity, so a script that spells `tʃ` matches a preset's
     * `t͡ʃ`.
     */
    conlangPhonemes?: readonly string[];
}

/**
 * Classify a list of sounds.
 *
 * Deduplication is BY IDENTITY (base + modifiers), not by string: `t͡ʃ` and `tʃ`
 * are one sound and must not become two members that split their weight and
 * both show on the chart. The FIRST spelling wins, because the source order is
 * the user's — a preset lists its sounds in a considered order and an explicit
 * inventory is whatever the user typed.
 */
export function deriveInventory(
    source: readonly string[],
    profile: WordGeneratorProfile,
    options: DeriveInventoryOptions = {},
): ClassifiedInventory {
    const members: InventoryMember[] = [];
    const unknown: string[] = [];
    const seen = new Set<string>();
    const seenUnknown = new Set<string>();

    const conlang = options.conlangPhonemes;
    const conlangIdentities = conlang === undefined
        ? null
        : new Set(
            conlang
                .filter((phoneme): phoneme is string => typeof phoneme === 'string' && phoneme.length > 0)
                .map(phonemeIdentity),
        );

    for (const entry of source ?? []) {
        if (typeof entry !== 'string' || entry.length === 0) continue;
        const features = describePhoneme(entry);
        if (!features) {
            if (!seenUnknown.has(entry)) {
                seenUnknown.add(entry);
                unknown.push(entry);
            }
            continue;
        }
        const identity = phonemeIdentity(entry);
        if (seen.has(identity)) continue;
        seen.add(identity);

        const member: InventoryMember = {
            phoneme: entry,
            features,
            classes: classOf(features),
            tilt: tiltFor(entry, profile),
        };
        if (conlangIdentities !== null) member.inConlang = conlangIdentities.has(identity);
        members.push(member);
    }

    const byClass = new Map<ClassLetter, string[]>();
    for (const letter of CLASS_LETTERS) byClass.set(letter, []);
    for (const member of members) {
        for (const letter of member.classes) byClass.get(letter)?.push(member.phoneme);
    }

    return { members, byClass, unknown };
}

/**
 * The identity set of an inventory, computed once and remembered.
 *
 * `inventoryOnly` is the hottest constraint in the engine — it looks at every
 * sound of every candidate — and rebuilding a `Set` per call turned a batch of
 * 100 into quadratic work. A `WeakMap` keyed on the inventory keeps the cache
 * exactly as long as the inventory itself lives, so a page that rebuilds its
 * inventory (the user edited a sound) gets a fresh one without anyone having to
 * remember to invalidate it.
 */
const IDENTITY_CACHE = new WeakMap<ClassifiedInventory, Set<string>>();

function identitiesOf(inventory: ClassifiedInventory): Set<string> {
    const cached = IDENTITY_CACHE.get(inventory);
    if (cached) return cached;
    const identities = new Set(inventory.members.map((member) => phonemeIdentity(member.phoneme)));
    IDENTITY_CACHE.set(inventory, identities);
    return identities;
}

/**
 * Is this sound in the inventory?
 *
 * Identity comparison, plus one deliberate licence: a LONG sound matches its
 * short counterpart. Length is something the engine ADDS (`longVowelChance`),
 * not something an inventory lists — the island preset ships `a` and generates
 * `aː` — so treating `aː` as foreign would make every long vowel the engine
 * produced fail its own membership check. The licence is one-way: a short `a`
 * does not match an inventory that only has `aː`.
 */
export function inventoryHas(inventory: ClassifiedInventory, phoneme: string): boolean {
    const identities = identitiesOf(inventory);
    if (identities.has(phonemeIdentity(phoneme))) return true;
    if (!phoneme.includes(LENGTH_MARK)) return false;
    return identities.has(phonemeIdentity(phoneme.split(LENGTH_MARK).join('')));
}
