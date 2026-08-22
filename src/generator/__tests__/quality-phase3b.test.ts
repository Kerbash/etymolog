/**
 * Phase 3b — the quality pass, pinned.
 *
 * Three engine behaviours arrived together in this pass and they are all
 * invisible to a unit test that only asks "did the batch fill":
 *
 *   1. the Syllable Contact Law — no RISING sonority across a syllable seam,
 *      folded into the existing `clusters.sonority` switch;
 *   2. the maximal-onset split of a consonant run that a single template put
 *      BETWEEN two vowels (`VCCV`), which used to escape every cluster rule by
 *      being filed as "nucleus";
 *   3. the preset retunes that follow from them — word length, cluster budget,
 *      vowel pile-ups, monosyllable share.
 *
 * The word-level checks here re-derive everything from the OUTPUT (the syllable
 * strings a batch comes back with, re-tokenised), never from the engine's own
 * `Syllable` structures, so a rule and its test cannot agree with each other by
 * sharing a bug. Where a band is asserted it is stated as a band, with the
 * measured value in the comment, because these are judgements about flavour and
 * a future retune should have to look at the number rather than at a red test.
 *
 * Node environment.
 */

import { describe, expect, it } from 'vitest';

import { generateWords } from '../engine/generate';
import { buildSyllable, sonorityInClusters, syllableUnits } from '../engine/constraints';
import { deriveInventory } from '../inventory';
import { cloneDefaultProfile } from '../profile/defaults';
import { PRESETS, applyPreset, presetInventory } from '../presets';
import { describePhoneme } from '../phonology/features';
import { splitPhonemeString } from '../phonology/tokenize';
import { isValidContact, sonorityOf, splitMedialCluster } from '../phonology/sonority';
import type { GeneratedBatch } from '../engine/generate';
import type { WordGeneratorProfile } from '../profile/types';

// =============================================================================
// INDEPENDENT HELPERS
// =============================================================================

function profileWith(overrides: Partial<WordGeneratorProfile>): WordGeneratorProfile {
    return { ...cloneDefaultProfile(), ...structuredClone(overrides) } as WordGeneratorProfile;
}

/** My own re-tokenisation of one syllable string. */
function soundsOf(syllable: string): string[] {
    return splitPhonemeString(syllable).map((token) => token.text);
}

function isVowelSound(sound: string): boolean {
    return describePhoneme(sound)?.kind === 'vowel';
}

/** The sonority of a sound, or `null` when it cannot be classified. */
function sonority(sound: string): number | null {
    const features = describePhoneme(sound);
    return features ? sonorityOf(features) : null;
}

/**
 * Every consonant-to-consonant junction of a word, read off the syllable array:
 * the last sound of one syllable and the first sound of the next.
 */
function junctionsOf(syllables: readonly string[]): [string, string][] {
    const pairs: [string, string][] = [];
    for (let index = 1; index < syllables.length; index += 1) {
        const left = soundsOf(syllables[index - 1]).at(-1);
        const right = soundsOf(syllables[index]).at(0);
        if (left === undefined || right === undefined) continue;
        if (isVowelSound(left) || isVowelSound(right)) continue;
        pairs.push([left, right]);
    }
    return pairs;
}

function risingJunctions(batch: GeneratedBatch): [string, string][] {
    const rising: [string, string][] = [];
    for (const word of batch.words) {
        for (const [left, right] of junctionsOf(word.syllables)) {
            const before = sonority(left);
            const after = sonority(right);
            if (before !== null && after !== null && before < after) rising.push([left, right]);
        }
    }
    return rising;
}

function batchFor(preset: (typeof PRESETS)[number], count: number, seed: number, overrides?: Partial<WordGeneratorProfile>) {
    const base = applyPreset(preset, cloneDefaultProfile());
    const profile = overrides ? ({ ...base, ...structuredClone(overrides) } as WordGeneratorProfile) : base;
    const inventory = deriveInventory(presetInventory(preset), profile);
    return { profile, batch: generateWords(profile, inventory, { count, seed }) };
}

/** Runs of two or more adjacent consonants in a whole word. */
function clusterRuns(syllables: readonly string[]): string[][] {
    const sounds = syllables.flatMap(soundsOf);
    const runs: string[][] = [];
    let current: string[] = [];
    for (const sound of sounds) {
        if (!isVowelSound(sound)) {
            current.push(sound);
            continue;
        }
        if (current.length >= 2) runs.push(current);
        current = [];
    }
    if (current.length >= 2) runs.push(current);
    return runs;
}

/** The longest run of adjacent vowel SOUNDS in a word (a long vowel is one sound). */
function longestVowelRun(syllables: readonly string[]): number {
    let best = 0;
    let run = 0;
    for (const sound of syllables.flatMap(soundsOf)) {
        run = isVowelSound(sound) ? run + 1 : 0;
        best = Math.max(best, run);
    }
    return best;
}

/** One syllable built out of one sound per slot, for the rule-level checks. */
function wordOf(...syllables: string[][]) {
    return syllables.map((slots) => buildSyllable(slots));
}

const SONORITY_ON = { sonority: true, sibilantOnsetException: false, allowGeminates: false, maxPerWord: 4 };

// =============================================================================
// 1. THE SYLLABLE CONTACT LAW, PAIR BY PAIR
// =============================================================================

describe('isValidContact', () => {
    it.each([
        ['l', 't'], // liquid -> plosive, the textbook `al.ta`
        ['n', 'k'],
        ['r', 'p'],
        ['s', 't'],
        ['m', 'ʃ'],
        ['ʒ', 't'],
    ])('allows a FALLING junction: %s | %s', (left, right) => {
        expect(isValidContact(left, right)).toBe(true);
    });

    it.each([
        ['t', 't'], // a geminate is a flat junction; whether it is allowed at all is `allowGeminates`
        ['k', 'p'],
        ['n', 'm'],
        ['l', 'r'], // lateral 6, trill 6
        ['s', 'ʃ'],
    ])('allows a LEVEL junction: %s | %s', (left, right) => {
        expect(isValidContact(left, right)).toBe(true);
    });

    it.each([
        ['t', 'l'], // the `at.la` that started this
        ['d', 'ʃ'], // 1.5 -> 3, the `ʒog.dmɔd.ʃut` junction
        ['k', 'n'],
        ['p', 'r'],
        ['s', 'j'],
        ['t', 'd'], // voiceless 1 -> voiced 1.5: a rise, even between two plosives
    ])('rejects a RISING junction: %s | %s', (left, right) => {
        expect(isValidContact(left, right)).toBe(false);
    });

    it('is not a rule about vowels: a junction with a vowel on either side always passes', () => {
        expect(isValidContact('a', 't')).toBe(true);
        expect(isValidContact('t', 'a')).toBe(true);
        expect(isValidContact('a', 'i')).toBe(true);
    });

    it('answers "yes" when it cannot tell, so an unknown symbol is rejected by the rule that knows why', () => {
        expect(isValidContact('§', 't')).toBe(true);
        expect(isValidContact('t', '§')).toBe(true);
    });

    it('ignores the sibilant licence: it is word-initial, and a junction never is', () => {
        expect(isValidContact('t', 's', { allowSibilantOnset: true })).toBe(false);
        expect(isValidContact('k', 'ʃ', { allowSibilantOnset: true })).toBe(false);
    });
});

// =============================================================================
// 2. THE MAXIMAL-ONSET SPLIT
// =============================================================================

describe('splitMedialCluster', () => {
    it('gives the whole run to the onset when the whole run is a legal onset', () => {
        expect(splitMedialCluster(['t', 'r'])).toEqual({ coda: [], onset: ['t', 'r'] });
        expect(splitMedialCluster(['k', 'l'])).toEqual({ coda: [], onset: ['k', 'l'] });
    });

    it('gives a lone consonant to the onset: `a.ka`, never `ak.a`', () => {
        expect(splitMedialCluster(['k'])).toEqual({ coda: [], onset: ['k'] });
    });

    it('leaves the un-onsettable head behind as a coda', () => {
        // `p` cannot start a cluster with `k` (no rise), so it closes the syllable before it.
        expect(splitMedialCluster(['p', 'k'])).toEqual({ coda: ['p'], onset: ['k'] });
        expect(splitMedialCluster(['r', 'k'])).toEqual({ coda: ['r'], onset: ['k'] });
        expect(splitMedialCluster(['n', 't'])).toEqual({ coda: ['n'], onset: ['t'] });
    });

    it('takes the LONGEST legal onset, not the first one it finds', () => {
        // `str`: `s` cannot lead here, but `tr` can — so `as.tra`, not `ast.ra`.
        expect(splitMedialCluster(['s', 't', 'r'])).toEqual({ coda: ['s'], onset: ['t', 'r'] });
        expect(splitMedialCluster(['n', 'k', 'l'])).toEqual({ coda: ['n'], onset: ['k', 'l'] });
    });

    it('does not accept the word-initial sibilant licence for a MEDIAL run', () => {
        // `st-` is licensed at the start of a word; `a-st-a` still divides as `as.ta`,
        // because the licence is about where the word begins.
        expect(splitMedialCluster(['s', 't'], { allowSibilantOnset: true })).toEqual({ coda: ['s'], onset: ['t'] });
    });

    it('has nothing to say about an empty run', () => {
        expect(splitMedialCluster([])).toEqual({ coda: [], onset: [] });
    });

    it('never leaves the vowel without an onset when there is a consonant to give it', () => {
        for (const run of [['p'], ['p', 'k'], ['s', 't', 'k'], ['ʃ', 'p', 'k', 't']]) {
            expect(splitMedialCluster(run).onset.length).toBeGreaterThan(0);
        }
    });
});

describe('syllableUnits — a template with two vowels in it', () => {
    it('splits `VCCV` into two peaks by maximal onset', () => {
        const units = syllableUnits(buildSyllable(['a', 'r', 'k', 'i']));
        expect(units).toHaveLength(2);
        expect(units[0]).toEqual({ onset: [], nucleus: ['a'], coda: ['r'], sounds: ['a', 'r'] });
        expect(units[1]).toEqual({ onset: ['k'], nucleus: ['i'], coda: [], sounds: ['k', 'i'] });
    });

    it('keeps a one-vowel syllable exactly as `buildSyllable` read it', () => {
        const syllable = buildSyllable(['s', 't', 'r', 'a', 'n']);
        const units = syllableUnits(syllable);
        expect(units).toHaveLength(1);
        expect(units[0].onset).toEqual(syllable.onset);
        expect(units[0].coda).toEqual(syllable.coda);
    });

    it('treats adjacent vowels as ONE peak — a diphthong is not two syllables', () => {
        const units = syllableUnits(buildSyllable(['k', 'ai', 't']));
        expect(units).toHaveLength(1);
        expect(units[0].nucleus).toEqual(['a', 'i']);
    });

    it('files a vowel-less syllable as one all-onset unit, which is what the rule used to do', () => {
        const units = syllableUnits(buildSyllable(['k', 't']));
        expect(units).toEqual([{ onset: ['k', 't'], nucleus: [], coda: [], sounds: ['k', 't'] }]);
    });

    it('leaves `Syllable.text` alone — the split is for the rules, not for the display', () => {
        const syllable = buildSyllable(['a', 'r', 'k', 'i']);
        expect(syllable.text).toBe('arki');
        expect(syllable.slots).toEqual(['a', 'r', 'k', 'i']);
    });
});

describe('the medial cluster now faces the cluster rules', () => {
    const profile = profileWith({ clusters: SONORITY_ON });

    it('`arki` passes: `ar.ki` is a legal coda, a legal onset and a falling junction', () => {
        expect(sonorityInClusters(wordOf(['a', 'r', 'k', 'i']), profile)).toBeNull();
    });

    it('`apka` passes: `ap.ka` — `pk` is no onset, but `p` closes and `k` opens, and 1 ≥ 1 is level', () => {
        // Worked through deliberately, because it is the case that looks wrong:
        // `pk` is NOT a legal onset and NOT a legal coda, so a naive reading
        // rejects the word. Under maximal onset the run is never asked to be
        // either — it is DIVIDED, `p` becoming a one-sound coda and `k` a
        // one-sound onset, both trivially legal — and the contact law then asks
        // the only remaining question: does the seam rise? Two voiceless
        // plosives are level (1 and 1), so it does not. `ap.ka` is an ordinary
        // syllabification in Latin, Greek and Finnish alike; rejecting it would
        // be the generator inventing a rule no language has.
        expect(sonorityInClusters(wordOf(['a', 'p', 'k', 'a']), profile)).toBeNull();
    });

    it('`astra` passes as `as.tra`, with the whole `tr` going to the onset', () => {
        expect(sonorityInClusters(wordOf(['a', 's', 't', 'r', 'a']), profile)).toBeNull();
    });

    it('`atska` FAILS: whatever the onset takes, the head `ts` cannot close a syllable', () => {
        // `tsk` and `sk` are not legal onsets, so the onset is `k` and the coda
        // is `ts` — which RISES (1 -> 3) where a coda has to fall.
        const violation = sonorityInClusters(wordOf(['a', 't', 's', 'k', 'a']), profile);
        expect(violation?.rule).toBe('sonorityInClusters');
        expect(violation?.detail).toBe('coda');
        expect(violation?.offenders).toEqual(['t', 's']);
    });

    it('a rising seam cannot appear INSIDE one syllable: maximal onset absorbs it first', () => {
        // `dʃ` is a legal onset (1.5 -> 3 rises), so maximal onset takes both and
        // there is no coda at all... which is why this one passes. The junction
        // case needs the run to be un-onsettable: `adkʃa` -> `ad.kʃa`, junction
        // `d` (1.5) | `k` (1) falls, fine. A rising junction inside ONE syllable
        // cannot happen — maximal onset would have taken the rising head into
        // the onset — and that is a property, not an accident.
        expect(sonorityInClusters(wordOf(['a', 'd', 'ʃ', 'a']), profile)).toBeNull();
        expect(sonorityInClusters(wordOf(['a', 'd', 'k', 'ʃ', 'a']), profile)).toBeNull();
    });

    it('is switched off with the rest of the sonority rules', () => {
        const off = profileWith({
            clusters: { sonority: false, sibilantOnsetException: false, allowGeminates: false, maxPerWord: 4 },
        });
        expect(sonorityInClusters(wordOf(['a', 't', 's', 'k', 'a']), off)).toBeNull();
    });

    it('a TWO-consonant medial run is always resolvable, whatever the two sounds are', () => {
        // Worth pinning, because it is why `arki` and `apka` both pass and why
        // the shape that catches a real violation below needs three: either the
        // pair rises, in which case maximal onset takes both, or it does not, in
        // which case the head becomes a one-sound coda and the seam cannot rise.
        for (const left of ['p', 't', 'k', 's', 'ʃ', 'm', 'n', 'l', 'r', 'j']) {
            for (const right of ['p', 't', 'k', 's', 'ʃ', 'm', 'n', 'l', 'r', 'j']) {
                if (left === right) continue; // a geminate is `allowGeminates`' business
                expect(sonorityInClusters(wordOf(['a', left, right, 'a']), profile), `a${left}${right}a`).toBeNull();
            }
        }
    });

    it('stops the engine emitting an unsayable `VCCCV` medial cluster', () => {
        const shape = { syllables: [{ pattern: 'VCCCV', weight: 1 }], syllableCount: { min: 1, max: 1 } };
        const strict = profileWith({ ...shape, clusters: SONORITY_ON });
        const loose = profileWith({
            ...shape,
            clusters: { sonority: false, sibilantOnsetException: false, allowGeminates: false, maxPerWord: 4 },
        });
        const sounds = ['a', 'i', 'l', 'r', 'p', 'k', 's', 't'];

        /** Words whose medial run has no legal division — my own check, from the string. */
        const unsayable = (batch: GeneratedBatch): string[] => batch.words.filter((word) => {
            const run = soundsOf(word.ipa).slice(1, -1);
            const { coda } = splitMedialCluster(run);
            if (coda.length < 2) return false;
            for (let i = 1; i < coda.length; i += 1) {
                const before = sonority(coda[i - 1]);
                const after = sonority(coda[i]);
                if (before !== null && after !== null && before <= after) return true;
            }
            return false;
        }).map((word) => word.ipa);

        expect(unsayable(generateWords(strict, deriveInventory(sounds, strict), { count: 60, seed: 4 }))).toEqual([]);
        // Not vacuous: with the switch off, the same shape and inventory do
        // produce them (`ats-`, `apt-` …).
        expect(unsayable(generateWords(loose, deriveInventory(sounds, loose), { count: 60, seed: 4 })).length)
            .toBeGreaterThan(0);
    });
});

// =============================================================================
// 3. THE WORD-LEVEL PROPERTY — 7 PRESETS x 300 WORDS
// =============================================================================

describe('no junction rises, across every preset', () => {
    it.each(PRESETS.map((preset) => [preset.id, preset] as const))(
        '%s: 300 words, zero rising coda-to-onset junctions',
        (_id, preset) => {
            const { batch } = batchFor(preset, 300, 12345);
            expect(batch.words.length).toBeGreaterThan(0);
            expect(risingJunctions(batch)).toEqual([]);
        },
    );

    it('every preset that HAS junctions is actually exercised by the rule', () => {
        // Guards the whole block against becoming vacuous if a retune ever
        // closed the last syllable of every shape.
        const counts = PRESETS.map((preset) => {
            const { batch } = batchFor(preset, 300, 12345);
            return batch.words.reduce((total, word) => total + junctionsOf(word.syllables).length, 0);
        });
        expect(counts.filter((count) => count > 0).length).toBeGreaterThanOrEqual(4);
        expect(Math.max(...counts)).toBeGreaterThan(100);
    });

    it.each(PRESETS.map((preset) => [preset.id, preset] as const))(
        '%s: junctions are unconstrained when `clusters.sonority` is off',
        (_id, preset) => {
            const base = applyPreset(preset, cloneDefaultProfile());
            const { batch } = batchFor(preset, 300, 12345, {
                clusters: { ...base.clusters, sonority: false },
            });
            // A preset with no consonant junctions at all (island, japanese,
            // sinitic — every syllable is open or closes on a nasal) has nothing
            // to rise, and that is the preset's shape, not the rule's doing.
            const junctions = batch.words.reduce((total, word) => total + junctionsOf(word.syllables).length, 0);
            if (junctions === 0) return;
            expect(risingJunctions(batch).length).toBeGreaterThan(0);
        },
    );
});

// =============================================================================
// 4. THE FLAVOUR BANDS
// =============================================================================
//
// Each band is what the pass was FOR, stated as a range with the measured value
// beside it. They are deliberately loose: a future retune should have room to
// move the number without a red test, and no room at all to undo the fix.

describe('word length by preset', () => {
    /** Share of the batch that is a single syllable, 0..1. */
    function monosyllableShare(preset: (typeof PRESETS)[number]): number {
        const { batch } = batchFor(preset, 500, 12345);
        expect(batch.words.length).toBe(500);
        return batch.words.filter((word) => word.syllables.length === 1).length / batch.words.length;
    }

    it('slavic is not half monosyllables any more (was 44 %, now 0 %)', () => {
        expect(monosyllableShare(PRESETS.find((preset) => preset.id === 'slavic')!)).toBeLessThan(0.15);
    });

    it('guttural is not half monosyllables any more (was 40 %, now 0 %)', () => {
        expect(monosyllableShare(PRESETS.find((preset) => preset.id === 'guttural')!)).toBeLessThan(0.15);
    });

    it('sinitic is EXEMPT and stays short: the monosyllable is the flavour', () => {
        const share = monosyllableShare(PRESETS.find((preset) => preset.id === 'sinitic')!);
        expect(share).toBeGreaterThan(0.2);
        expect(share).toBeLessThan(0.7);
    });

    it('no preset ever exceeds its own syllable ceiling', () => {
        for (const preset of PRESETS) {
            const { profile, batch } = batchFor(preset, 300, 7);
            for (const word of batch.words) {
                expect(word.syllables.length, `${preset.id}: ${word.ipa}`)
                    .toBeGreaterThanOrEqual(profile.syllableCount.min);
                expect(word.syllables.length, `${preset.id}: ${word.ipa}`)
                    .toBeLessThanOrEqual(profile.syllableCount.max);
            }
        }
    });
});

describe('flowing stays flowing', () => {
    const preset = PRESETS.find((entry) => entry.id === 'flowing')!;

    it('never stacks more than one cluster in a word', () => {
        const { batch } = batchFor(preset, 500, 12345);
        for (const word of batch.words) {
            expect(clusterRuns(word.syllables).length, word.ipa).toBeLessThanOrEqual(1);
        }
    });

    it('closes a syllable only on n, l or r — never on a glide or a palatal nasal', () => {
        const { batch } = batchFor(preset, 500, 12345);
        for (const word of batch.words) {
            for (const syllable of word.syllables) {
                const last = soundsOf(syllable).at(-1);
                if (last === undefined || isVowelSound(last)) continue;
                expect(['n', 'l', 'r'], `${word.ipa} / ${syllable}`).toContain(last);
            }
        }
    });

    it('stays at three syllables or fewer', () => {
        const { batch } = batchFor(preset, 500, 12345);
        expect(Math.max(...batch.words.map((word) => word.syllables.length))).toBeLessThanOrEqual(3);
    });
});

describe('island stops stacking vowels', () => {
    const preset = PRESETS.find((entry) => entry.id === 'island')!;
    const { batch } = batchFor(preset, 500, 12345);

    it('never repeats a vowel immediately, whatever the lengths (`hakaa`, `mopimouu`, `naːainaː`)', () => {
        for (const word of batch.words) {
            const sounds = soundsOf(word.ipa);
            for (let index = 1; index < sounds.length; index += 1) {
                if (!isVowelSound(sounds[index])) continue;
                const previous = sounds[index - 1].replace(/ː/g, '');
                const current = sounds[index].replace(/ː/g, '');
                expect(previous === current, `${word.ipa} at ${index}`).toBe(false);
            }
        }
    });

    it('rarely runs three vowels together, and never four (was 9.4 % of words, now 4.0 %)', () => {
        // A BAND, not a guarantee, and deliberately so. Three vowels in a row
        // needs a bare-`V` syllable after a diphthong nucleus, and this preset
        // keeps the bare `V` on purpose — a vowel-alone syllable is what its own
        // description promises and what the touchstone languages do. The
        // pile-ups were cut by weight (`V` 2 -> 1), by length (0.15 -> 0.08) and
        // by forbidding a repeated vowel outright; four in a row is reachable in
        // principle and does not happen in 500 words at this seed.
        const runs = batch.words.map((word) => longestVowelRun(word.syllables));
        const three = runs.filter((run) => run >= 3).length / runs.length;
        expect(three).toBeLessThan(0.06);
        expect(Math.max(...runs)).toBeLessThanOrEqual(3);
    });

    it('lengthens roughly one vowel in twelve, not one in seven', () => {
        const vowels = batch.words.flatMap((word) => soundsOf(word.ipa)).filter(isVowelSound);
        const long = vowels.filter((sound) => sound.includes('ː')).length / vowels.length;
        expect(long).toBeGreaterThan(0.02);
        expect(long).toBeLessThan(0.13);
    });

    it('still has no consonant clusters at all', () => {
        for (const word of batch.words) expect(clusterRuns(word.syllables), word.ipa).toEqual([]);
    });
});

describe('only obstruent + liquid may start a syllable', () => {
    /** The onset of one syllable string — every sound before its first vowel. */
    function onsetOf(syllable: string): string[] {
        const sounds = soundsOf(syllable);
        const first = sounds.findIndex(isVowelSound);
        return first === -1 ? sounds : sounds.slice(0, first);
    }

    function isLiquid(sound: string): boolean {
        const features = describePhoneme(sound);
        return features?.kind === 'consonant'
            && (features.manner === 'lateral_approximant' || features.manner === 'trill' || features.manner === 'tap');
    }

    function isObstruent(sound: string): boolean {
        const features = describePhoneme(sound);
        return features?.kind === 'consonant'
            && ['plosive', 'affricate', 'fricative', 'lateral_fricative', 'click', 'implosive'].includes(features.manner);
    }

    it.each(['romance', 'flowing'])(
        '%s: every cluster onset is an obstruent followed by a liquid — no `ml-`, `nl-`, `ʃl-`, `sɾ-`',
        (id) => {
            const { batch } = batchFor(PRESETS.find((preset) => preset.id === id)!, 500, 12345);
            const clusters: string[] = [];
            for (const word of batch.words) {
                for (const syllable of word.syllables) {
                    const onset = onsetOf(syllable);
                    if (onset.length < 2) continue;
                    clusters.push(onset.join(''));
                    expect(onset, `${word.ipa} / ${syllable}`).toHaveLength(2);
                    expect(isObstruent(onset[0]), `${word.ipa}: ${onset.join('')} starts with a sonorant`).toBe(true);
                    expect(isLiquid(onset[1]), `${word.ipa}: ${onset.join('')} does not end in a liquid`).toBe(true);
                }
            }
            // Not vacuous, and not collapsed either: these presets are supposed
            // to cluster. Measured 8.3 % of flowing syllables and 12.9 % of
            // romance syllables, which is the share the templates they replaced
            // had — the two new shapes' weights add up to the old single weight.
            expect(clusters.length).toBeGreaterThan(100);
        },
    );

    it('romance builds exactly the Spanish/Italian cluster set, and nothing else', () => {
        const { batch } = batchFor(PRESETS.find((preset) => preset.id === 'romance')!, 500, 12345);
        const seen = new Set<string>();
        for (const word of batch.words) {
            for (const syllable of word.syllables) {
                const onset = onsetOf(syllable);
                if (onset.length >= 2) seen.add(onset.join(''));
            }
        }
        // `tl-` and `dl-` are absent BY CONSTRUCTION (the l-group has no dentals),
        // and so is every trill cluster: `r` is not in either group.
        expect([...seen].sort()).toEqual(['bl', 'bɾ', 'dɾ', 'fl', 'fɾ', 'gl', 'gɾ', 'kl', 'kɾ', 'pl', 'pɾ', 'tɾ']);
    });

    it('flowing builds only clusters Sindarin and Welsh have', () => {
        const { batch } = batchFor(PRESETS.find((preset) => preset.id === 'flowing')!, 500, 12345);
        const seen = new Set<string>();
        for (const word of batch.words) {
            for (const syllable of word.syllables) {
                const onset = onsetOf(syllable);
                if (onset.length >= 2) seen.add(onset.join(''));
            }
        }
        for (const onset of seen) {
            expect(['tr', 'kr', 'dr', 'gr', 'fr', 'θr', 'kl', 'gl', 'fl'], onset).toContain(onset);
        }
        expect(seen.size).toBeGreaterThanOrEqual(6);
    });
});

describe('japanese does not repeat a vowel', () => {
    const preset = PRESETS.find((entry) => entry.id === 'japanese')!;
    const { batch } = batchFor(preset, 500, 12345);

    it('never writes the same vowel twice in a row (`makaake`, `saseːepɯ`, `mii`)', () => {
        for (const word of batch.words) {
            const sounds = soundsOf(word.ipa);
            for (let index = 1; index < sounds.length; index += 1) {
                if (!isVowelSound(sounds[index])) continue;
                const previous = sounds[index - 1].replace(/ː/g, '');
                const current = sounds[index].replace(/ː/g, '');
                expect(previous === current, `${word.ipa} at ${index}`).toBe(false);
            }
        }
    });

    it('keeps its long vowels — the ban is on the doubled spelling, not on length', () => {
        const vowels = batch.words.flatMap((word) => soundsOf(word.ipa)).filter(isVowelSound);
        const long = vowels.filter((sound) => sound.includes('ː')).length / vowels.length;
        expect(long).toBeGreaterThan(0.04);
    });

    it('keeps the vowel sequences it declares: ai, oi, ɯi, ei still appear', () => {
        const found = (preset.diphthongs ?? []).filter((diphthong) =>
            batch.words.some((word) => word.ipa.includes(diphthong)));
        expect(found.length).toBeGreaterThanOrEqual(3);
    });
});

describe('romance stops stacking rhotics', () => {
    const preset = PRESETS.find((entry) => entry.id === 'romance')!;

    it('keeps the trill rarer than the tap', () => {
        const { batch } = batchFor(preset, 500, 12345);
        const sounds = batch.words.flatMap((word) => soundsOf(word.ipa));
        const taps = sounds.filter((sound) => sound === 'ɾ').length;
        const trills = sounds.filter((sound) => sound === 'r').length;
        expect(trills).toBeGreaterThan(0);
        expect(trills).toBeLessThan(taps);
    });

    it('rarely puts three rhotics in one word (`ɾarɾɔɾa`)', () => {
        const { batch } = batchFor(preset, 500, 12345);
        const heavy = batch.words.filter((word) =>
            soundsOf(word.ipa).filter((sound) => sound === 'r' || sound === 'ɾ').length >= 3);
        expect(heavy.length / batch.words.length).toBeLessThan(0.01);
    });
});

// =============================================================================
// 5. NOTHING ELSE MOVED
// =============================================================================

describe('the pass did not cost anything', () => {
    it('every preset still fills a batch of 100 without a shortfall or a warning', () => {
        for (const preset of PRESETS) {
            const { batch } = batchFor(preset, 100, 99);
            expect(batch.words.length, preset.id).toBe(100);
            expect(batch.shortfall, preset.id).toBeUndefined();
            expect(batch.warnings, preset.id).toEqual([]);
        }
    });

    it('is still deterministic, contact law and all', () => {
        for (const preset of PRESETS) {
            const first = batchFor(preset, 30, 2026).batch;
            const second = batchFor(preset, 30, 2026).batch;
            expect(JSON.stringify(second), preset.id).toBe(JSON.stringify(first));
        }
    });

    it('leaves the word EDGES alone: a word-initial onset and a word-final coda answer to sonority only', () => {
        const profile = profileWith({
            syllables: [{ pattern: 'CCVCC', weight: 1 }],
            syllableCount: { min: 1, max: 1 },
            clusters: { sonority: true, sibilantOnsetException: true, allowGeminates: false, maxPerWord: 4 },
        });
        const batch = generateWords(profile, deriveInventory(['s', 't', 'r', 'a', 'n', 'k'], profile), { count: 40, seed: 3 });
        expect(batch.words.length).toBeGreaterThan(0);
        // `str-` is still licensed at the start of a word; a falling coda still closes it.
        expect(batch.words.some((word) => word.ipa.startsWith('st'))).toBe(true);
    });

    it('still generates 100 words for each preset well inside a frame', () => {
        const started = Date.now();
        for (const preset of PRESETS) batchFor(preset, 100, 8);
        expect(Date.now() - started).toBeLessThan(500);
    });
});
