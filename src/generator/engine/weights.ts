/**
 * @fileoverview How often each sound is picked.
 *
 * Picking uniformly from an inventory produces words that no language could
 * have. Real inventories are steeply skewed — a language with `m n ŋ ɳ ɲ` uses
 * `n` an order of magnitude more than `ɳ` — and the skew is most of what makes a
 * generated set read as ONE language rather than as a bag of sounds. So the
 * engine weights every pick, and this module is where the weight comes from:
 *
 *   1. order the inventory by a fixed cross-linguistic commonness ranking;
 *   2. give rank `r` of `n` its share of a Gusein-Zade curve;
 *   3. multiply by the user's per-sound tilt.
 *
 * The ranking is a CONSTANT, not a measurement of the user's script: the point
 * is that `k` beats `ɢ` in the abstract, and a user who disagrees has the tilt
 * control to say so.
 *
 * @module generator/engine/weights
 */

import { describePhoneme, phonemeIdentity } from '../phonology/features';
import type { FrequencyTilt, WordGeneratorProfile } from '../profile/types';

/**
 * Sounds in rough order of cross-linguistic commonness — vowels first, then
 * consonants, each group most-common first.
 *
 * The order is drawn from the usual segment-frequency surveys (UPSID / PHOIBLE
 * shapes rather than their exact percentages): `a i u` are in almost every
 * language, `m k j p w n s t l h` are the consonants that come next, and the
 * tail is the retroflex, uvular and pharyngeal series that only a minority of
 * languages have.
 *
 * WHY VOWELS AND CONSONANTS SHARE ONE LIST. The weight of a sound only ever
 * matters against the OTHER MEMBERS OF ITS OWN SLOT — a `V` slot draws from
 * vowels, a `C` slot from consonants — and the curve below is monotone in rank,
 * so the relative order inside each group is all that survives. One list keeps
 * the data (and the "is this sound ranked?" question) in one place.
 *
 * Exactness is not the point and cannot be: the honest claim is that the first
 * twenty entries are more common than the last twenty, which is the only claim
 * the curve makes.
 */
export const COMMONNESS_RANK: readonly string[] = [
    // Vowels.
    'a', 'i', 'u', 'e', 'o', 'ə', 'ɛ', 'ɔ', 'ɪ', 'ʊ',
    'y', 'ɨ', 'ɯ', 'ø', 'ɤ', 'ɑ', 'æ', 'ʌ', 'œ', 'ɒ',
    'ɐ', 'ʉ', 'ʏ', 'ɘ', 'ɵ', 'ɜ', 'ɞ', 'ɶ', 'ɚ', 'ɝ',
    // Consonants.
    'm', 'k', 'j', 'p', 'w', 'n', 's', 't', 'l', 'h',
    'ŋ', 'b', 'd', 'g', 'r', 'ɾ', 'f', 'ɲ', 'ʃ', 'v',
    'z', 'ʔ', 't͡ʃ', 'x', 'd͡ʒ', 'ɸ', 'β', 'θ', 'ð', 't͡s',
    'ʒ', 'ɣ', 'ʎ', 'ç', 'ʝ', 'q', 'χ', 'ʁ', 'c', 'ɟ',
    'ɽ', 'ʈ', 'ɖ', 'ɳ', 'ɭ', 'ɻ', 'ʂ', 'ʐ', 'ɕ', 'ʑ',
    'ɬ', 'ɮ', 'ħ', 'ʕ', 'ɦ', 'ʋ', 'ɰ', 'ɱ', 'ʙ', 'ʀ',
    'ɢ', 'ʍ', 'ɫ', 'd͡z', 'ʈ͡ʂ', 'ɖ͡ʐ', 't͡ɕ', 'd͡ʑ',
    't͡ɬ', 'd͡ɮ', 'ɴ',
];

/** Rank of an exactly-matching sound, keyed by its full identity (base + modifiers). */
const RANK_BY_IDENTITY: ReadonlyMap<string, number> = new Map(
    COMMONNESS_RANK.map((sound, index) => [phonemeIdentity(sound), index]),
);

/** Rank of a base symbol, so a modified sound can inherit its plain counterpart's place. */
const RANK_BY_BASE: ReadonlyMap<string, number> = (() => {
    const map = new Map<string, number>();
    COMMONNESS_RANK.forEach((sound, index) => {
        const base = describePhoneme(sound)?.base;
        if (base !== undefined && !map.has(base)) map.set(base, index);
    });
    return map;
})();

/**
 * Where an unranked sound goes: after everything the list names, in input order.
 *
 * A finite number rather than `Infinity` — two unranked sounds have to compare
 * EQUAL so that the sort falls through to their input order, and
 * `Infinity - Infinity` is `NaN`, which makes a comparator non-transitive and
 * the sort implementation-defined.
 */
const UNRANKED = Number.MAX_SAFE_INTEGER;

/**
 * A sound's place in the commonness order.
 *
 * A modified sound that the list does not name (`pʰ`, `kʼ`, `t̪`) inherits its
 * BASE's rank plus a half step, so it sits immediately after the plain sound
 * rather than at the very bottom. That matters: an aspirating flavour's whole
 * inventory is modified sounds, and ranking them all as unknown would put every
 * consonant it cares about in the flat tail of the curve.
 */
function rankOf(sound: string): number {
    const exact = RANK_BY_IDENTITY.get(phonemeIdentity(sound));
    if (exact !== undefined) return exact;
    const base = describePhoneme(sound)?.base;
    if (base !== undefined) {
        const byBase = RANK_BY_BASE.get(base);
        if (byBase !== undefined) return byBase + 0.5;
    }
    return UNRANKED;
}

/** What each tilt does to a weight. `off` is absent: an `off` sound is not weighted, it is skipped. */
const TILT_MULTIPLIER: Record<Exclude<FrequencyTilt, 'off'>, number> = {
    common: 3,
    normal: 1,
    rare: 0.25,
};

/**
 * The tilt that applies to a sound.
 *
 * Looked up by exact string first (that is how the UI writes it — the key IS the
 * inventory entry) and then by identity, so a profile that stored `t͡ʃ` still
 * tilts a user's `tʃ`. `Object.prototype` keys cannot leak in: the record is
 * read with `hasOwn`, so a `phonemeTilt` carrying `constructor` from a
 * hand-edited export cannot return a function.
 */
function tiltOf(sound: string, profile: WordGeneratorProfile, byIdentity: ReadonlyMap<string, FrequencyTilt>): FrequencyTilt {
    const tilts = profile.phonemeTilt;
    if (tilts && Object.hasOwn(tilts, sound)) {
        const direct = tilts[sound];
        if (direct === 'common' || direct === 'rare' || direct === 'off' || direct === 'normal') return direct;
    }
    return byIdentity.get(phonemeIdentity(sound)) ?? 'normal';
}

/**
 * The tilt a profile puts on one sound.
 *
 * Exported because the inventory records a tilt per member (the UI shows it as
 * a chip state) and the weights apply it — one answer, one place. Building the
 * identity index per call is deliberate: this is called once per inventory
 * entry, never inside the generation loop.
 */
export function tiltFor(sound: string, profile: WordGeneratorProfile): FrequencyTilt {
    return tiltOf(sound, profile, tiltsByIdentity(profile));
}

/** The tilt record re-keyed by sound identity, built once per {@link phonemeWeights} call. */
function tiltsByIdentity(profile: WordGeneratorProfile): Map<string, FrequencyTilt> {
    const map = new Map<string, FrequencyTilt>();
    const tilts = profile.phonemeTilt;
    if (!tilts) return map;
    for (const key of Object.keys(tilts)) {
        if (!Object.hasOwn(tilts, key)) continue;
        const value = tilts[key];
        if (value !== 'common' && value !== 'rare' && value !== 'off' && value !== 'normal') continue;
        const identity = phonemeIdentity(key);
        if (!map.has(identity)) map.set(identity, value);
    }
    return map;
}

/**
 * The weight of every usable sound in an inventory.
 *
 * Sounds tilted `off` are ABSENT from the result rather than present with a
 * weight of zero — the difference matters to the caller, which builds its pools
 * from these keys and would otherwise carry a sound it can never pick through
 * every filter and every harmony narrowing.
 *
 * The curve is Gusein-Zade, `(ln(n + 1) − ln r) / n`, which is the shape
 * segment inventories actually have: a few sounds carrying most of the mass and
 * a long thin tail. `flat` replaces it with a constant, which is what a user
 * auditioning an inventory wants — every sound gets a fair hearing.
 *
 * Duplicates in `members` collapse (the result is keyed by the sound) and empty
 * strings are dropped.
 */
export function phonemeWeights(
    members: readonly string[],
    profile: WordGeneratorProfile,
): Map<string, number> {
    const byIdentity = tiltsByIdentity(profile);

    // Deduplicate BY STRING, not by identity: the inventory has already been
    // deduplicated by identity upstream, and collapsing `tʃ` into `t͡ʃ` here
    // would return a map missing the key the caller asked about.
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const member of members) {
        if (typeof member !== 'string' || member.length === 0) continue;
        if (seen.has(member)) continue;
        seen.add(member);
        unique.push(member);
    }

    const ordered = unique
        .map((sound, index) => ({ sound, index, rank: rankOf(sound) }))
        .sort((left, right) => (left.rank - right.rank) || (left.index - right.index));

    const n = ordered.length;
    const weights = new Map<string, number>();
    if (n === 0) return weights;

    const logTotal = Math.log(n + 1);
    ordered.forEach((entry, position) => {
        const tilt = tiltOf(entry.sound, profile, byIdentity);
        if (tilt === 'off') return;
        // Rank is 1-based in the formula; `position` is 0-based.
        const base = profile.frequencyCurve === 'flat'
            ? 1 / n
            : (logTotal - Math.log(position + 1)) / n;
        weights.set(entry.sound, base * TILT_MULTIPLIER[tilt]);
    });
    return weights;
}
