/**
 * @fileoverview Phoneme classes — the letters a syllable template is written in.
 *
 * `CV`, `(C)V(N)`, `CCVC`: the letters are the whole user-facing vocabulary of
 * the shape editor, so the set is CLOSED and reserved. Ten letters, chosen to be
 * the ones conlangers already use, and every one of them is derived from
 * features rather than from a hand-kept membership list — a new symbol in the
 * chart joins its classes the day it is added.
 *
 * A sound is never in both a consonant class and `V`. That is not an accident of
 * the data: a template author writing `CV` is entitled to assume the two slots
 * cannot draw the same sound.
 *
 * @module generator/phonology/classes
 */

import type { PhonemeFeatures } from './features';

/**
 * The reserved class letters.
 *
 * `P` is stops-in-the-wide-sense (plosives, affricates, clicks, implosives) — it
 * is the class a template means by "a stop", and splitting affricates out would
 * leave `P` unable to express the commonest onset in most languages.
 */
export type ClassLetter = 'C' | 'V' | 'P' | 'F' | 'S' | 'N' | 'L' | 'G' | 'R' | 'O';

/**
 * Every class letter, in the canonical order `classOf` returns them in. Kept as
 * an array (not derived from the labels object) so the order is a decision
 * rather than an object-key accident.
 */
export const CLASS_LETTERS: readonly ClassLetter[] = ['C', 'V', 'P', 'F', 'S', 'N', 'L', 'G', 'R', 'O'];

/** Plural, lower-case names for the UI: a section caption, a chip's `aria-label`. */
export const CLASS_LABELS: Record<ClassLetter, string> = {
    C: 'consonants',
    V: 'vowels',
    P: 'stops',
    F: 'fricatives',
    S: 'sibilants',
    N: 'nasals',
    L: 'liquids',
    G: 'glides',
    R: 'sonorant consonants',
    O: 'obstruents',
};

/**
 * Is this a reserved class letter? Used by the template parser to tell a class
 * from a stray character, so it must reject multi-character strings outright
 * rather than looking at the first one.
 */
export function isClassLetter(ch: string): ch is ClassLetter {
    return ch.length === 1 && (CLASS_LETTERS as readonly string[]).includes(ch);
}

/** Stops in the wide sense: the `P` class. */
function isStop(features: PhonemeFeatures): boolean {
    if (features.kind !== 'consonant') return false;
    return features.manner === 'plosive'
        || features.manner === 'affricate'
        || features.manner === 'click'
        || features.manner === 'implosive';
}

/** Fricatives, lateral fricatives included: the `F` class. */
function isFricative(features: PhonemeFeatures): boolean {
    if (features.kind !== 'consonant') return false;
    return features.manner === 'fricative' || features.manner === 'lateral_fricative';
}

/**
 * Liquids: the `L` class. Lateral approximants plus trills and taps — the
 * rhotics and laterals that behave alike in clusters (`pl-`, `pr-`) and that a
 * template author reaches for as one group.
 */
function isLiquid(features: PhonemeFeatures): boolean {
    if (features.kind !== 'consonant') return false;
    return features.manner === 'lateral_approximant'
        || features.manner === 'trill'
        || features.manner === 'tap';
}

/**
 * Glides: the `G` class — non-lateral approximants (`j w ɰ ʋ ɹ ɻ`). The lateral
 * approximants are excluded on purpose; they are liquids, and a language that
 * allows `Cj` onsets very often does not allow `Cl`.
 */
function isGlide(features: PhonemeFeatures): boolean {
    return features.kind === 'consonant' && features.manner === 'approximant';
}

/** Nasals: the `N` class. */
function isNasal(features: PhonemeFeatures): boolean {
    return features.kind === 'consonant' && features.manner === 'nasal';
}

/**
 * Every class a sound belongs to, in `CLASS_LETTERS` order.
 *
 * The order is fixed so the result can be compared, snapshotted and rendered
 * without a caller having to sort it. Membership is computed from the SAME
 * features the sonority scale reads, which is what keeps "the `L` slot" and
 * "the thing sonority calls a liquid" from drifting apart.
 */
export function classOf(features: PhonemeFeatures): ClassLetter[] {
    if (features.kind === 'vowel') return ['V'];

    const classes: ClassLetter[] = ['C'];
    const stop = isStop(features);
    const fricative = isFricative(features);
    const nasal = isNasal(features);
    const liquid = isLiquid(features);
    const glide = isGlide(features);

    if (stop) classes.push('P');
    if (fricative) classes.push('F');
    if (features.sibilant) classes.push('S');
    if (nasal) classes.push('N');
    if (liquid) classes.push('L');
    if (glide) classes.push('G');
    if (nasal || liquid || glide) classes.push('R');
    if (stop || fricative) classes.push('O');

    return classes.sort(
        (a, b) => CLASS_LETTERS.indexOf(a) - CLASS_LETTERS.indexOf(b),
    );
}

/** Does a sound belong to a class? The membership test the engine actually calls. */
export function isInClass(features: PhonemeFeatures, letter: ClassLetter): boolean {
    return classOf(features).includes(letter);
}
