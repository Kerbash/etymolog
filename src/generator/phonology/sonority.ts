/**
 * @fileoverview The sonority scale, and what it says about clusters.
 *
 * Sonority is roughly "how open the vocal tract is": a vowel is the peak of a
 * syllable and consonants slope away from it. The Sonority Sequencing Principle
 * — onsets rise towards the vowel, codas fall away from it — is the single rule
 * that separates a pronounceable invented word (`pla`, `tra`, `kri`) from a
 * jawbreaker (`lpa`, `rta`), which is why the generator can offer "make my words
 * pronounceable" as one switch.
 *
 * The scale below is the plan's, deliberately coarse: it is a preference, not
 * physics, and a finer scale would only invent distinctions the user cannot see.
 *
 * @module generator/phonology/sonority
 */

import { describePhoneme } from './features';
import type { PhonemeFeatures, VowelHeight } from './features';

/**
 * Options shared by both cluster checks so a caller can pass one profile-derived
 * bag to either without knowing which exceptions apply where.
 */
export interface SonorityOptions {
    /**
     * Permit a sibilant before a plosive at the START of an onset (`st-`, `sp-`,
     * `str-`). This is the one cross-linguistically common violation of rising
     * sonority, and without it half of the Slavic- and Germanic-flavoured words
     * a user expects are unbuildable.
     */
    allowSibilantOnset?: boolean;
}

/**
 * Vowel sonority by height group: open vowels are the most sonorous thing a
 * syllable can contain, close vowels the least (they are one step from being
 * glides). Three groups, because the seven chart heights would imply a precision
 * the rest of the scale does not have.
 */
const VOWEL_SONORITY: Record<VowelHeight, number> = {
    'open': 10,
    'near-open': 10,
    'open-mid': 9,
    'mid': 9,
    'close-mid': 9,
    'near-close': 8,
    'close': 8,
};

/**
 * Where a sound sits on the scale. Higher is more sonorous.
 *
 * Lateral fricatives (`ɬ ɮ`) score as fricatives, not as laterals: the friction
 * is what the tongue is doing, and `ɬ` behaves like `s` in a cluster, not like
 * `l`. Clicks and implosives share the floor with voiceless plosives — no
 * language in the reference set clusters them, so the exact value never decides
 * anything.
 */
export function sonorityOf(features: PhonemeFeatures): number {
    if (features.kind === 'vowel') return VOWEL_SONORITY[features.height];

    switch (features.manner) {
        case 'approximant':
            return 7;
        case 'lateral_approximant':
            return 6;
        case 'trill':
        case 'tap':
            return 6;
        case 'nasal':
            return 5;
        case 'fricative':
        case 'lateral_fricative':
            return features.voiced ? 4 : 3;
        case 'affricate':
            return 2;
        case 'plosive':
            return features.voiced ? 1.5 : 1;
        case 'click':
        case 'implosive':
            return 1;
    }
}

/**
 * Resolve a phoneme list to features, or `null` as soon as one of them cannot be
 * classified. An unknown sound has no sonority, so the honest answer to "is this
 * cluster legal" is "cannot tell" — and the callers below turn that into a
 * rejection rather than letting an unrecognised symbol walk through a rule it
 * was never checked against.
 */
function featuresOf(phonemes: readonly string[]): PhonemeFeatures[] | null {
    const resolved: PhonemeFeatures[] = [];
    for (const phoneme of phonemes) {
        const features = describePhoneme(phoneme);
        if (!features) return null;
        resolved.push(features);
    }
    return resolved;
}

/** Strictly rising sonority across the whole list. */
function risesStrictly(features: readonly PhonemeFeatures[]): boolean {
    for (let i = 1; i < features.length; i++) {
        if (sonorityOf(features[i - 1]) >= sonorityOf(features[i])) return false;
    }
    return true;
}

/** Strictly falling sonority across the whole list. */
function fallsStrictly(features: readonly PhonemeFeatures[]): boolean {
    for (let i = 1; i < features.length; i++) {
        if (sonorityOf(features[i - 1]) <= sonorityOf(features[i])) return false;
    }
    return true;
}

/**
 * May these phonemes stand together before a vowel?
 *
 * Zero or one phoneme is always a legal onset — there is no sequence to
 * sequence, and rejecting a lone consonant would make every template unusable.
 * Beyond that the run must rise strictly; with `allowSibilantOnset`, a leading
 * sibilant + plosive is exempt and the REST of the onset is then checked on its
 * own, so `str` passes (`t` < `r`) while `stl`-style oddities still have to earn
 * it.
 *
 * The exception is deliberately anchored to the first position. `pst` must not
 * pass by finding a sibilant somewhere in the middle — that is the bug the
 * anchoring exists to prevent.
 *
 * This judges the sonority PROFILE and nothing else: it does not check that the
 * members are consonants, because the caller builds an onset out of consonant
 * classes and a second opinion here would only be a second place to disagree.
 */
export function isValidOnset(phonemes: readonly string[], options: SonorityOptions = {}): boolean {
    if (phonemes.length <= 1) return true;
    const features = featuresOf(phonemes);
    if (!features) return false;

    if (options.allowSibilantOnset && features.length >= 2) {
        const [first, second] = features;
        // A sibilant FRICATIVE, not merely anything flagged sibilant: every
        // sibilant affricate (t͡s, t͡ʃ, d͡ʒ …) carries `sibilant: true` too, and
        // without the manner check the licence quietly legalised onsets like
        // `t͡sp-` — a falling cluster that the `s`+stop exception was never
        // about. The eight sibilant bases are all fricatives, so this narrows
        // the exception to exactly `s z ʃ ʒ ʂ ʐ ɕ ʑ`.
        const sibilantStop = first.kind === 'consonant' && first.sibilant && first.manner === 'fricative'
            && second.kind === 'consonant' && second.manner === 'plosive';
        if (sibilantStop) return risesStrictly(features.slice(1));
    }

    return risesStrictly(features);
}

/**
 * May these phonemes stand together after a vowel?
 *
 * Strictly falling, with no exception: `allowSibilantOnset` is an ONSET licence
 * (that is what its name says), and letting it through here is precisely how
 * `-ts` and `-ps` codas start appearing in a language that was configured to
 * have none. The option bag is still accepted so both checks take the same
 * argument and a caller cannot pass the profile to the wrong one.
 */
export function isValidCoda(phonemes: readonly string[], _options: SonorityOptions = {}): boolean {
    if (phonemes.length <= 1) return true;
    const features = featuresOf(phonemes);
    if (!features) return false;
    return fallsStrictly(features);
}

/**
 * May these two sounds meet across a syllable boundary? — the Syllable Contact
 * Law.
 *
 * Sonority sequencing describes the INSIDE of a syllable; it says nothing about
 * the seam between one syllable and the next, and a generator that only checks
 * the inside happily emits `ʒog.dmɔd.ʃut`, where every syllable is impeccable
 * and every junction is a stumble. The cross-linguistic preference is the
 * mirror image of the onset rule: at a boundary the sonority should FALL or stay
 * level (`al.ta`, `an.ka`, `at.ta`), never rise (`at.la`, `ad.ʃa`) — a rise puts
 * two sonority peaks back to back and the ear re-syllabifies to escape it.
 *
 * DECISION (Phase 3b): this rides the EXISTING `clusters.sonority` switch rather
 * than becoming a profile field of its own. "Make my words pronounceable" is one
 * idea to a user, not two, and the junction is where the unpronounceable ones
 * were actually coming from; a second toggle would be a second thing to explain
 * for a distinction only a phonologist draws. The feature is unreleased, so no
 * stored profile is silently retuned by folding it in.
 *
 * Equal sonority is allowed — `at.ta`, `ak.pa` and `an.ma` are all ordinary —
 * because the law is about not RISING, and a flat junction is what a geminate or
 * a stop+stop cluster is. Whether a doubled consonant is allowed at all is
 * `allowGeminates`' business, not this rule's.
 *
 * Two escape hatches, both deliberate: a junction with a VOWEL on either side is
 * not a consonant junction and is always fine (`ka.ta`, `ta.at`), and a sound
 * neither side can classify answers `true` — an unknown symbol has no sonority,
 * so "cannot tell" must not masquerade as "illegal" here (`inventoryOnly`
 * rejects the word for the real reason).
 *
 * Takes the two sounds that MEET rather than the two runs they come from: a
 * syllable a template left vowel-less has no coda to speak of, but its last
 * consonant still collides with whatever follows, and the caller — which knows
 * how it split the word — is the right place to decide which two sounds those
 * are. The option bag is accepted and ignored so that all three cluster checks
 * take the same argument: `allowSibilantOnset` is a WORD-INITIAL licence and a
 * junction is by definition not word-initial.
 */
export function isValidContact(left: string, right: string, _options: SonorityOptions = {}): boolean {
    const before = describePhoneme(left);
    const after = describePhoneme(right);
    if (!before || !after) return true;
    if (before.kind === 'vowel' || after.kind === 'vowel') return true;
    return sonorityOf(before) >= sonorityOf(after);
}

/**
 * Split a run of consonants that stands BETWEEN two vowels into the coda of the
 * first and the onset of the second — the maximal-onset principle.
 *
 * The next syllable takes the longest tail of the run that is a legal onset;
 * whatever is left over is the previous syllable's coda. `a-str-a` splits as
 * `a.stra` when `str` is a licensed onset and as `as.tra` when it is not, which
 * is exactly how a speaker of the language would divide it — onsets are greedy
 * in every language that has been asked.
 *
 * Returns the split; the caller still has to validate both halves, because
 * "longest legal onset" says nothing about whether the remainder is a legal
 * coda (`ats.ka` has a fine onset and an impossible coda).
 *
 * A run with no legal split beyond the trivial one still returns a one-sound
 * onset: a single consonant is always a legal onset, so the tail is never empty
 * for a non-empty run, and a vowel is never left without something to lean on.
 */
export function splitMedialCluster(
    run: readonly string[],
    options: SonorityOptions = {},
): { coda: string[]; onset: string[] } {
    if (run.length === 0) return { coda: [], onset: [] };
    for (let start = 0; start < run.length; start += 1) {
        const tail = run.slice(start);
        // `allowSibilantOnset` is deliberately NOT forwarded: it licenses `st-`
        // at the START OF A WORD, and a medial run is not that. Forwarding it
        // would move the split (`as.ta` -> `a.sta`) on the strength of a licence
        // the word-initial rule would refuse to grant here.
        if (isValidOnset(tail, { ...options, allowSibilantOnset: false })) {
            return { coda: run.slice(0, start), onset: tail };
        }
    }
    // Unreachable: the last candidate tail is a single sound and a single sound
    // is always a legal onset, classifiable or not. Written out anyway because
    // the compiler needs a return and a thrown error here would be a crash in
    // the render path for a case that cannot happen.
    return { coda: run.slice(0, run.length - 1), onset: run.slice(run.length - 1) };
}
