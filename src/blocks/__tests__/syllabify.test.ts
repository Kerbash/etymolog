/**
 * syllabify / entrySound — SYLLABLE_BLOCKS_PLAN.md §3.1 (+ DIPHTHONG_BLOCKS §3.3, CONLANG_EDGES_PLAN.md §3.2, §4.1, §4.2).
 */

import { describe, expect, it } from 'vitest';
import { classOf } from '../../generator/phonology/classes';
import { describePhoneme, SYLLABIC_MARK, SYLLABIC_MARKS } from '../../generator/phonology/features';
import { entrySound } from '../classify';
import { glueNuclei, syllabify, unitRoleOf, unitRoles } from '../syllabify';
import type { SyllabifyOptions, SyllableUnit } from '../syllabify';
import type { EntryClass } from '../types';
import { fakeGrapheme, gEntry, indexOf, ipaEntry } from './fixtures';

/** One unit per IPA character, classified the way `classifyEntry` would. */
function units(ipa: string): SyllableUnit[] {
    return Array.from(ipa).map((sound) => {
        const features = describePhoneme(sound);
        if (!features) throw new Error(`test word has an undescribable sound: ${sound}`);
        return { cls: { kind: 'phoneme', letters: classOf(features), category: null }, sound };
    });
}

/** The syllables as strings, for readable assertions. */
function split(ipa: string, options?: SyllabifyOptions): string[] {
    const chars = Array.from(ipa);
    return syllabify(units(ipa), options).map(([start, end]) => chars.slice(start, end).join(''));
}

const OPAQUE: SyllableUnit = { cls: { kind: 'syllable', category: null }, sound: 'ka' };

describe('syllabify — plain words', () => {
    it.each([
        ['tapa', ['ta', 'pa']],
        ['patatapa', ['pa', 'ta', 'ta', 'pa']],
        ['kasa', ['ka', 'sa']],
        ['spɛl', ['spɛl']],
        ['strɛŋθs', ['strɛŋθs']],
        ['ai', ['a', 'i']],
        ['a', ['a']],
        ['st', ['st']],
        ['kapla', ['ka', 'pla']],
        ['kalpa', ['kal', 'pa']],
        ['astra', ['as', 'tra']],
    ])('%s → %j', (word, expected) => {
        expect(split(word)).toEqual(expected);
    });

    it('s + stop between vowels stays split unless sibilantClusters is on', () => {
        expect(split('asta')).toEqual(['as', 'ta']);
        expect(split('asta', { sibilantClusters: false })).toEqual(['as', 'ta']);
        expect(split('asta', { sibilantClusters: true })).toEqual(['a', 'sta']);
        expect(split('astra', { sibilantClusters: true })).toEqual(['a', 'stra']);
    });

    it('empty input → no ranges', () => {
        expect(syllabify([])).toEqual([]);
    });
});

describe('syllabify — opaque units', () => {
    it('an opaque unit is its own range and a wall between vowels', () => {
        // a t [ka] t a — neither `t` may cross the sign.
        const run = [...units('at'), OPAQUE, ...units('ta')];
        expect(syllabify(run)).toEqual([[0, 2], [2, 3], [3, 5]]);
    });

    it('consonants between two walls, or a wall and the edge, form one range', () => {
        // A logogram wall (a SYLLABLE sign would take `pk` as its coda —
        // CONLANG_EDGES_PLAN.md §4.1, pinned below).
        const wall: SyllableUnit = { cls: { kind: 'silent', category: 'logogram' }, sound: null };
        const run = [...units('st'), wall, ...units('pk'), wall];
        expect(syllabify(run)).toEqual([[0, 2], [2, 3], [3, 5], [5, 6]]);
        // The same run with syllable signs: the vowel-less `pk` is the first sign's coda.
        expect(syllabify([...units('st'), OPAQUE, ...units('pk'), OPAQUE])).toEqual([[0, 2], [2, 5], [5, 6]]);
    });

    it('treats silent / unknown / boundary / structural as opaque without throwing', () => {
        const odd: SyllableUnit[] = [
            { cls: { kind: 'silent', category: null }, sound: null },
            { cls: { kind: 'unknown' }, sound: null },
            { cls: { kind: 'boundary' }, sound: '.' },
            { cls: { kind: 'structural' }, sound: null },
        ];
        const run = [...units('ta'), ...odd, ...units('pa')];
        expect(syllabify(run)).toEqual([[0, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 8]]);
    });

    it('opaque at the edges and back to back', () => {
        expect(syllabify([OPAQUE, OPAQUE])).toEqual([[0, 1], [1, 2]]);
        expect(syllabify([OPAQUE, ...units('ta')])).toEqual([[0, 1], [1, 3]]);
    });
});

describe('syllabify — sounds that cannot be described', () => {
    it('a null-sound consonant is a valid onset only alone', () => {
        const mystery: SyllableUnit = { cls: { kind: 'phoneme', letters: ['C'], category: null }, sound: null };
        // a ? l a — `?l` cannot be judged, so only `l` starts the next syllable.
        const run = [...units('a'), mystery, ...units('la')];
        expect(syllabify(run)).toEqual([[0, 2], [2, 4]]);
        // a p ? a — `?` alone is accepted.
        const run2 = [...units('ap'), mystery, ...units('a')];
        expect(syllabify(run2)).toEqual([[0, 2], [2, 4]]);
    });
});

describe('syllabify — ranges always tile the run', () => {
    const words = ['tapa', 'strɛŋθs', 'aiueo', 'kstpa', 'ampstra', 'nta', 'a', 'mm', 'lalalal', 'aspkla'];
    it.each(words)('%s', (word) => {
        for (const sibilantClusters of [false, true]) {
            const ranges = syllabify(units(word), { sibilantClusters });
            let cursor = 0;
            for (const [start, end] of ranges) {
                expect(start).toBe(cursor);
                expect(end).toBeGreaterThan(start);
                cursor = end;
            }
            expect(cursor).toBe(Array.from(word).length);
        }
    });
});

// =============================================================================
// DIPHTHONG_BLOCKS_PLAN.md §3.3 — vowels said as one
// =============================================================================

describe('glueNuclei', () => {
    const vowel = (sound: string | null): SyllableUnit => ({ cls: { kind: 'phoneme', letters: ['V'], category: null }, sound });

    it('no diphthongs → every unit its own group', () => {
        expect(glueNuclei(units('tai'), [])).toEqual([0, 1, 2]);
        expect(glueNuclei([], ['ai'])).toEqual([]);
    });

    it('a listed pair shares one id; ids stay contiguous', () => {
        expect(glueNuclei(units('ai'), ['ai'])).toEqual([0, 0]);
        expect(glueNuclei(units('tai'), ['ai'])).toEqual([0, 1, 1]);
        expect(glueNuclei(units('taik'), ['ai'])).toEqual([0, 1, 1, 2]);
    });

    it('greedy from the left: a i a → ai · a, a a i → a · ai', () => {
        expect(glueNuclei(units('aia'), ['ai'])).toEqual([0, 0, 1]);
        expect(glueNuclei(units('aai'), ['ai'])).toEqual([0, 1, 1]);
    });

    it('a triple (iəu) glues all three', () => {
        expect(glueNuclei(units('iəu'), ['iəu'])).toEqual([0, 0, 0]);
    });

    it('longest listed match first', () => {
        expect(glueNuclei(units('iəu'), ['iə', 'iəu'])).toEqual([0, 0, 0]);
        // Only pairs listed: the first pair wins, u is left alone.
        expect(glueNuclei(units('iəu'), ['iə', 'əu'])).toEqual([0, 0, 1]);
    });

    it('never glues across a consonant', () => {
        expect(glueNuclei(units('ati'), ['ai', 'ati'])).toEqual([0, 1, 2]);
    });

    it('never glues across an opaque unit, nor an opaque unit itself', () => {
        expect(glueNuclei([...units('a'), OPAQUE, ...units('i')], ['ai', 'aka', 'kai'])).toEqual([0, 1, 2]);
    });

    it('a unit with no sound never glues', () => {
        expect(glueNuclei([vowel(null), ...units('i')], ['ai', 'i'])).toEqual([0, 1]);
        expect(glueNuclei([vowel(''), ...units('i')], ['i'])).toEqual([0, 1]);
    });

    it('compares trimmed, NFC-normalised sounds (a decomposed é matches a composed entry)', () => {
        expect(glueNuclei([vowel('é'), vowel('i')], ['éi'])).toEqual([0, 0]);
        expect(glueNuclei([vowel('é'), vowel(' i ')], [' éi '])).toEqual([0, 0]);
    });

    it('an empty entry in the list glues nothing', () => {
        expect(glueNuclei(units('ai'), ['', '  '])).toEqual([0, 1]);
    });
});

describe('syllabify — diphthongs', () => {
    it.each([
        ['ai', ['ai'], ['ai']],
        ['tai', ['ai'], ['tai']],
        ['ŋwiən', ['iə'], ['ŋwiən']],
        ['taia', ['ai'], ['tai', 'a']],
        ['kaia', ['ai'], ['kai', 'a']],
        ['aia', ['ai'], ['ai', 'a']],
        ['aai', ['ai'], ['a', 'ai']],
        ['taipa', ['ai'], ['tai', 'pa']],
        ['taupa', ['ai'], ['ta', 'u', 'pa']],
    ])('%s with %j → %j', (word, diphthongs, expected) => {
        expect(split(word, { diphthongs })).toEqual(expected);
    });

    it('without the option every existing case is unchanged', () => {
        expect(split('tai')).toEqual(['ta', 'i']);
        expect(split('ŋwiən')).toEqual(['ŋwi', 'ən']);
        expect(split('tai', { diphthongs: [] })).toEqual(['ta', 'i']);
    });

    it('the medial consonants start after the whole diphthong', () => {
        // a i · s t a with sibilantClusters: the s t go together after `ai`.
        expect(split('aista', { diphthongs: ['ai'], sibilantClusters: true })).toEqual(['ai', 'sta']);
        expect(split('aista', { diphthongs: ['ai'] })).toEqual(['ais', 'ta']);
    });

    it('ranges still tile the run', () => {
        for (const word of ['taiaiu', 'iəuiə', 'aaaa', 'ŋwiənai']) {
            const ranges = syllabify(units(word), { diphthongs: ['ai', 'iə', 'iəu', 'aa'] });
            let cursor = 0;
            for (const [start, end] of ranges) {
                expect(start).toBe(cursor);
                expect(end).toBeGreaterThan(start);
                cursor = end;
            }
            expect(cursor).toBe(Array.from(word).length);
        }
    });
});

describe('entrySound', () => {
    const index = indexOf(fakeGrapheme(1, 'k'), fakeGrapheme(2, null), fakeGrapheme(3, 'tʃ'));

    it('reads a grapheme as its primary phoneme', () => {
        expect(entrySound(gEntry(1), index)).toBe('k');
        expect(entrySound(gEntry(3), index)).toBe('tʃ');
    });

    it('null for a phoneme-less grapheme or an unresolvable one', () => {
        expect(entrySound(gEntry(2), index)).toBeNull();
        expect(entrySound(gEntry(99), index)).toBeNull();
    });

    it('reads an IPA entry as its character, null when empty', () => {
        expect(entrySound(ipaEntry('a'), index)).toBe('a');
        expect(entrySound(ipaEntry(''), index)).toBeNull();
    });
});

// =============================================================================
// CONLANG_EDGES_PLAN.md §3.2 — marks ride with the sign before them; joins
// =============================================================================

/** A mark grapheme (tone / length…): no sound. */
const MARK: SyllableUnit = { cls: { kind: 'mark', category: 'mark' }, sound: null };
/** A typed IPA mark: it HAS a sound (`ː`) the phonology cannot describe (P-A4). */
const IPA_MARK: SyllableUnit = { cls: { kind: 'mark', category: null }, sound: 'ː' };
const LOGO: SyllableUnit = { cls: { kind: 'silent', category: 'logogram' }, sound: null };
const JOIN = '‿';

/**
 * Build a run from a pattern: each character is one unit, except `M` (a mark
 * grapheme), `ː` (an IPA mark), `L` (a logogram), `K` (the syllable sign
 * `ka`) and `‿` — which is not a
 * unit but a join before the next unit, exactly as the segmenter hands it
 * over (join entries stripped, positions compact).
 */
function run(pattern: string): { units: SyllableUnit[]; joins: Set<number>; labels: string[] } {
    const out: SyllableUnit[] = [];
    const labels: string[] = [];
    const joins = new Set<number>();
    for (const char of Array.from(pattern)) {
        if (char === JOIN) {
            joins.add(out.length);
            continue;
        }
        labels.push(char);
        if (char === 'M') out.push(MARK);
        else if (char === 'ː') out.push(IPA_MARK);
        else if (char === 'L') out.push(LOGO);
        else if (char === 'K') out.push(OPAQUE);
        else out.push(...units(char));
    }
    return { units: out, joins, labels };
}

/** Syllables of a pattern (see `run`) as strings. */
function splitRun(pattern: string, options: SyllabifyOptions = {}): string[] {
    const { units: u, joins, labels } = run(pattern);
    return syllabify(u, { ...options, joins }).map(([start, end]) => labels.slice(start, end).join(''));
}

describe('unitRoleOf', () => {
    it('vowel → nucleus, consonant → consonant, mark → mark, everything else → opaque', () => {
        expect(unitRoleOf(units('a')[0].cls)).toBe('nucleus');
        expect(unitRoleOf(units('k')[0].cls)).toBe('consonant');
        expect(unitRoleOf({ kind: 'mark', category: 'mark' })).toBe('mark');
        expect(unitRoleOf({ kind: 'mark', category: null })).toBe('mark');
        const others: EntryClass[] = [OPAQUE.cls, LOGO.cls, { kind: 'unknown' }, { kind: 'boundary' }, { kind: 'join' }, { kind: 'structural' }];
        for (const cls of others) expect(unitRoleOf(cls)).toBe('opaque');
    });
});

describe('syllabify — marks ride with the sign before them', () => {
    it.each([
        ['kaMn', ['kaMn']],
        ['kaMta', ['kaM', 'ta']],
        ['kaMM', ['kaMM']],
        ['LMta', ['LM', 'ta']],
        ['Mka', ['Mka']],
        ['atMa', ['a', 'tMa']],
        ['kaMtMa', ['kaM', 'tMa']],
        ['kaMsta', ['kaMs', 'ta']],
        ['kM', ['kM']],
        ['M', ['M']],
    ])('%s → %j', (pattern, expected) => {
        expect(splitRun(pattern)).toEqual(expected);
    });

    it('k a MARK n is ONE range', () => {
        expect(syllabify(run('kaMn').units)).toEqual([[0, 4]]);
    });

    it('a logogram takes the marks right after it: LOGO MARK t a → [0,2) [2,4)', () => {
        expect(syllabify(run('LMta').units)).toEqual([[0, 2], [2, 4]]);
        expect(syllabify(run('LMM').units)).toEqual([[0, 3]]);
        expect(syllabify(run('LML').units)).toEqual([[0, 2], [2, 3]]);
    });

    it('an IPA mark (sound ː) is filtered out of the onset test by ROLE (P-A4)', () => {
        // a p ː l a: the tail `p ː l` is judged as `pl` (a legal start) — had ː
        // been handed to the sonority check, `p ː l` would be rejected.
        expect(splitRun('apːla')).toEqual(['a', 'pːla']);
        expect(splitRun('kaːta')).toEqual(['kaː', 'ta']);
    });

    it('a mark between two vowels BLOCKS the diphthong glue (documented limit)', () => {
        expect(splitRun('aMi', { diphthongs: ['ai'] })).toEqual(['aM', 'i']);
        expect(glueNuclei(run('aMi').units, ['ai'])).toEqual([0, 1, 2]);
        // The workaround — the mark after the pair — glues.
        expect(splitRun('aiM', { diphthongs: ['ai'] })).toEqual(['aiM']);
    });

    it('ranges still tile the run', () => {
        for (const pattern of ['kaMta', 'MkaMMtLMa', 'LMM', 'aMiMuM', 'ML', `a${JOIN}Mta`, 'kaMnːta']) {
            const { units: u, joins } = run(pattern);
            const ranges = syllabify(u, { joins, diphthongs: ['ai'] });
            let cursor = 0;
            for (const [start, end] of ranges) {
                expect(start).toBe(cursor);
                expect(end).toBeGreaterThan(start);
                cursor = end;
            }
            expect(cursor).toBe(u.length);
        }
    });
});

describe('syllabify — joins (‿)', () => {
    it('a‿i (joins {1}) is one range with one glued group', () => {
        const { units: u, joins } = run(`a${JOIN}i`);
        expect([...joins]).toEqual([1]);
        expect(syllabify(u, { joins })).toEqual([[0, 2]]);
        expect(glueNuclei(u, [], joins)).toEqual([0, 0]);
    });

    it.each([
        [`at${JOIN}a`, ['a', 'ta']],
        [`a${JOIN}ta`, ['at', 'a']],
        [`a${JOIN}t${JOIN}a`, ['ata']],
        [`ta${JOIN}i${JOIN}u`, ['taiu']],
        [`a${JOIN}i${JOIN}u${JOIN}e`, ['aiue']],
        [`aM${JOIN}i`, ['aMi']],
        [`k${JOIN}a`, ['ka']],
    ])('%s → %j', (pattern, expected) => {
        expect(splitRun(pattern)).toEqual(expected);
    });

    it('a join glues at most three vowels; a fourth joined one still cannot be cut away', () => {
        const { units: u, joins } = run(`a${JOIN}i${JOIN}u${JOIN}e`);
        expect(glueNuclei(u, [], joins)).toEqual([0, 0, 0, 1]);
        expect(syllabify(u, { joins })).toEqual([[0, 4]]);
    });

    it('join + diphthong list: the listed pair is chosen first, then the join extends it', () => {
        const withJoin = run(`ai${JOIN}u`);
        expect(glueNuclei(withJoin.units, ['ai'], withJoin.joins)).toEqual([0, 0, 0]);
        expect(splitRun(`ai${JOIN}ua`, { diphthongs: ['ai'] })).toEqual(['aiu', 'a']);
        // Without the join, the listed pair alone: ai · u.
        expect(splitRun('aiu', { diphthongs: ['ai'] })).toEqual(['ai', 'u']);
        // a‿i u with `iu` listed: greedy from the left takes a‿i, u stays alone.
        const leftFirst = run(`a${JOIN}iu`);
        expect(glueNuclei(leftFirst.units, ['iu'], leftFirst.joins)).toEqual([0, 0, 1]);
    });

    it('a join never glues a vowel to a consonant (that is a forbidden cut, not a group)', () => {
        const vc = run(`a${JOIN}t`);
        expect(glueNuclei(vc.units, [], vc.joins)).toEqual([0, 1]);
        const cv = run(`t${JOIN}a`);
        expect(glueNuclei(cv.units, [], cv.joins)).toEqual([0, 1]);
    });

    it('as‿ta with sibilant clusters OFF → ast · a: a join only forbids a cut, it never licenses an onset', () => {
        // Candidates in the cluster s t: start=s (`st` is not a legal start
        // with sibilant clusters off), start=t (joined → skipped), start=to
        // (empty onset, allowed).
        expect(splitRun(`as${JOIN}ta`)).toEqual(['ast', 'a']);
        // With sibilant clusters on, `st` is a legal start and the cut before s stands.
        expect(splitRun(`as${JOIN}ta`, { sibilantClusters: true })).toEqual(['a', 'sta']);
    });

    it('a join next to an opaque unit changes nothing (opaque units stay walls)', () => {
        const { units: u, joins } = run(`ta${JOIN}L${JOIN}ta`);
        expect(syllabify(u, { joins })).toEqual(syllabify(u));
    });

    it('no joins → identical to the option being absent', () => {
        for (const word of ['tapa', 'astra', 'aiueo', 'kstpa']) {
            expect(syllabify(units(word), { joins: new Set() })).toEqual(syllabify(units(word)));
        }
    });
});

// =============================================================================
// CONLANG_EDGES_PLAN.md §4.1 — a syllable sign takes the consonants that
// cannot start the next syllable
// =============================================================================

describe('syllabify — syllable-sign codas (K = the sign ka)', () => {
    it.each([
        ['Knta', ['Kn', 'ta']],
        ['Kta', ['K', 'ta']],
        ['Kn', ['Kn']],
        ['Kst', ['Kst']],
        ['KnMta', ['KnM', 'ta']],
        ['Knːta', ['Knː', 'ta']],
        ['KMnta', ['KMn', 'ta']],
        ['Kntra', ['Kn', 'tra']],
        ['KLna', ['K', 'L', 'na']],
        ['tK', ['t', 'K']],
        ['Ka', ['K', 'a']],
        ['KK', ['K', 'K']],
        ['KnKta', ['Kn', 'K', 'ta']],
        ['KnLta', ['Kn', 'L', 'ta']],
        ['taKnta', ['ta', 'Kn', 'ta']],
    ])('%s → %j', (pattern, expected) => {
        expect(splitRun(pattern)).toEqual(expected);
    });

    it('s + consonant: KA s t a → KAs · ta off, KA · sta on', () => {
        expect(splitRun('Ksta')).toEqual(['Ks', 'ta']);
        expect(splitRun('Ksta', { sibilantClusters: true })).toEqual(['K', 'sta']);
    });

    it('only a SYLLABLE sign grows — a logogram, unknown sign or mark before n t a behaves as before (P-B3)', () => {
        expect(splitRun('Lnta')).toEqual(['L', 'nta']);
        const unknown: SyllableUnit = { cls: { kind: 'unknown' }, sound: null };
        expect(syllabify([unknown, ...units('nta')])).toEqual([[0, 1], [1, 4]]);
        expect(splitRun('Mnta')).toEqual(['Mnta']);
    });

    it('joins forbid a cut, never license an onset: KA‿t a → KAt · a; KA n‿t a → KAnt · a', () => {
        expect(splitRun(`K${JOIN}ta`)).toEqual(['Kt', 'a']);
        // n|t is forbidden and `nt` is no legal start, so the cut falls before the vowel.
        expect(splitRun(`Kn${JOIN}ta`)).toEqual(['Knt', 'a']);
        // Every position forbidden (s‿t‿a with sibilant clusters off): nothing grows.
        expect(splitRun(`Ks${JOIN}t${JOIN}a`)).toEqual(['K', 'sta']);
    });

    it('ranges still tile the run', () => {
        for (const pattern of ['Knta', 'KnMːtKsKa', 'tKnLKK', `K${JOIN}n${JOIN}ta`, 'KstrKn']) {
            const { units: u, joins } = run(pattern);
            for (const sibilantClusters of [false, true]) {
                let cursor = 0;
                for (const [start, end] of syllabify(u, { joins, sibilantClusters })) {
                    expect(start).toBe(cursor);
                    expect(end).toBeGreaterThan(start);
                    cursor = end;
                }
                expect(cursor).toBe(u.length);
            }
        }
    });
});

// =============================================================================
// CONLANG_EDGES_PLAN.md §4.2 — consonants that carry a syllable
// =============================================================================

/** One unit per sound TOKEN (so r + U+0329 is one unit). */
function seq(...sounds: string[]): SyllableUnit[] {
    return sounds.map((sound) => {
        const features = describePhoneme(sound);
        if (!features) throw new Error(`test word has an undescribable sound: ${sound}`);
        return { cls: { kind: 'phoneme', letters: classOf(features), category: null }, sound };
    });
}

/** Syllables of a token list as strings. */
function splitSeq(sounds: string[], options: SyllabifyOptions = {}): string[] {
    return syllabify(seq(...sounds), options).map(([start, end]) => sounds.slice(start, end).join(''));
}

/** r + the IPA syllabic mark. */
const SYLLABIC_R = `r${SYLLABIC_MARK}`;

describe('syllabify — syllabic consonants', () => {
    it.each([
        ['prst', ['r'], ['prst']],
        ['krtek', ['r'], ['kr', 'tek']],
        ['vlk', ['l'], ['vlk']],
        ['karta', ['r'], ['kar', 'ta']],
        ['bratr', ['r'], ['bra', 'tr']],
        ['mlha', ['l'], ['ml', 'ha']],
        ['vlkr', ['l', 'r'], ['vl', 'kr']],
        ['krtek', ['r', 'l', 'm', 'n'], ['kr', 'tek']],
    ])('%s with %j listed → %j', (word, syllabicConsonants, expected) => {
        expect(split(word, { syllabicConsonants })).toEqual(expected);
    });

    it('without the list every word splits as before', () => {
        expect(split('krtek')).toEqual(['krtek']);
        expect(split('bratr')).toEqual(['bratr']);
        expect(split('krtek', { syllabicConsonants: [] })).toEqual(['krtek']);
    });

    it('of consecutive listed candidates only the LAST is a core: mlha with m AND l listed → ml · ha', () => {
        expect(syllabify(units('mlha'), { syllabicConsonants: ['m', 'l'] })).toEqual([[0, 2], [2, 4]]);
        expect(split('mlha', { syllabicConsonants: ['l', 'm'] })).toEqual(['ml', 'ha']);
        // Not consecutive (k between them): both are cores.
        expect(split('vlkr', { syllabicConsonants: ['l', 'r'] })).toEqual(['vl', 'kr']);
        expect(split('prst', { syllabicConsonants: ['r', 's'] })).toEqual(['prst']);
        // A mark between two candidates keeps them consecutive.
        expect(splitRun('mMlha', { syllabicConsonants: ['m', 'l'] })).toEqual(['mMl', 'ha']);
    });

    it('sedm with m listed → se · dm (m has d and the end beside it)', () => {
        expect(split('sedm', { syllabicConsonants: ['m'] })).toEqual(['se', 'dm']);
        expect(split('sedm')).toEqual(['sedm']);
    });

    it('a consonant written with the IPA syllabic mark is a core with nothing listed', () => {
        expect(SYLLABIC_MARK).toBe('̩');
        expect(splitSeq(['k', SYLLABIC_R, 't', 'e', 'k'])).toEqual([`k${SYLLABIC_R}`, 'tek']);
        expect(splitSeq([SYLLABIC_R])).toEqual([SYLLABIC_R]);
    });

    it('U+030D (vertical line above) is a syllabic mark too', () => {
        const syllabicNg = `ŋ${SYLLABIC_MARKS[1]}`;
        expect(SYLLABIC_MARKS).toEqual(['\u0329', '\u030D']);
        expect(SYLLABIC_MARKS[0]).toBe(SYLLABIC_MARK);
        expect(splitSeq(['k', syllabicNg, 't', 'e'])).toEqual([`k${syllabicNg}`, 'te']);
        expect(unitRoles(seq(syllabicNg))).toEqual(['nucleus']);
    });

    it('syllabic r + a → two syllables: two nuclei with an empty cluster between them', () => {
        expect(splitSeq([SYLLABIC_R, 'a'])).toEqual([SYLLABIC_R, 'a']);
    });

    it('a listed consonant next to a MARKED syllabic one stays a consonant (the neighbour is a pass-1 nucleus)', () => {
        expect(splitSeq(['p', SYLLABIC_R, 'l'], { syllabicConsonants: ['l'] })).toEqual([`p${SYLLABIC_R}l`]);
    });

    it('with ai and r listed, a i r → air (the r is next to i, so it is a consonant)', () => {
        expect(split('air', { diphthongs: ['ai'], syllabicConsonants: ['r'] })).toEqual(['air']);
    });

    it('a list entry that is not a consonant is harmless', () => {
        for (const word of ['tapa', 'krtek', 'aiueo']) {
            expect(split(word, { syllabicConsonants: ['a', 'ai', 'xyz', ''] })).toEqual(split(word));
        }
    });

    it('exact comparable match only: n listed does not make ŋ a core; entries are trimmed + NFC', () => {
        expect(split('knte', { syllabicConsonants: ['n'] })).toEqual(['kn', 'te']);
        expect(split('kŋte', { syllabicConsonants: ['n'] })).toEqual(['kŋte']);
        expect(split('krtek', { syllabicConsonants: [' r '] })).toEqual(['kr', 'tek']);
    });

    it('the neighbour test skips marks and stops at walls (P-B2)', () => {
        // k a MARK r t a: the r's left non-mark neighbour is `a` → an ordinary consonant.
        expect(splitRun('kaMrta', { syllabicConsonants: ['r'] })).toEqual(['kaMr', 'ta']);
        // LOGO r t: a logogram holds no vowel, so r is a core.
        expect(splitRun('Lrt', { syllabicConsonants: ['r'] })).toEqual(['L', 'rt']);
        expect(splitRun('Lrta', { syllabicConsonants: ['r'] })).toEqual(['L', 'r', 'ta']);
        const unknown: SyllableUnit = { cls: { kind: 'unknown' }, sound: null };
        expect(syllabify([unknown, ...units('rta')], { syllabicConsonants: ['r'] })).toEqual([[0, 1], [1, 2], [2, 4]]);
        // A syllable SIGN holds a vowel: the r beside it is an ordinary consonant — the sign's coda.
        expect(splitRun('Krta', { syllabicConsonants: ['r'] })).toEqual(['Kr', 'ta']);
        expect(splitRun('Krta')).toEqual(['Kr', 'ta']);
        expect(splitRun('trK', { syllabicConsonants: ['r'] })).toEqual(['tr', 'K']);
        // …also across a mark riding with the sign.
        expect(splitRun('KMrta', { syllabicConsonants: ['r'] })).toEqual(['KMr', 'ta']);
    });

    it('a syllabic consonant never glues into a diphthong', () => {
        expect(glueNuclei(seq('a', SYLLABIC_R), [`a${SYLLABIC_R}`])).toEqual([0, 1]);
        expect(glueNuclei(seq('a', 'r'), ['ar'], new Set([1]))).toEqual([0, 1]);
        expect(splitSeq(['a', SYLLABIC_R], { diphthongs: [`a${SYLLABIC_R}`] })).toEqual(['a', SYLLABIC_R]);
    });

    it('ranges still tile the run', () => {
        for (const word of ['prst', 'krtek', 'vlkr', 'mlha', 'rrr', 'bratr', 'nmnmn']) {
            const ranges = syllabify(units(word), { syllabicConsonants: ['r', 'l', 'm', 'n'] });
            let cursor = 0;
            for (const [start, end] of ranges) {
                expect(start).toBe(cursor);
                expect(end).toBeGreaterThan(start);
                cursor = end;
            }
            expect(cursor).toBe(Array.from(word).length);
        }
    });
});
