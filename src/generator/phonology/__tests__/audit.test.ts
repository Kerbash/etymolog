/**
 * Phase 1 audit — adversarial tests written against the phonology core by a
 * second pair of eyes.
 *
 * The four `defect:` blocks below each pin a bug that was live when this file
 * was written; the rest are invariants that Phases 2-5 will lean on without
 * ever restating them (a template slot draws from a class, a constraint asks
 * sonority, a tooltip asks for a label — none of them will re-check that the
 * class letters partition the consonants or that a label is not gibberish).
 *
 * Where a case is a defensible reading of the plan rather than a defect, the
 * test asserts the CURRENT behaviour and says so in a comment, so that changing
 * it later is a deliberate act rather than an accident.
 *
 * Node environment (the suite default): nothing here touches a DOM.
 */

import { describe, expect, it } from 'vitest';

import {
    getAllConsonantSymbols,
    getAllIPASymbols,
    getAllVowelSymbols,
    IPA_AFFRICATES,
} from '../../../data/ipaChartData';
import * as barrel from '../index';
import {
    describePhoneme,
    describePhonemeLabel,
    knownSymbols,
    lookupBase,
    EXTRA_SYMBOLS,
    TABLE_CONFLICTS,
} from '../features';
import { splitPhonemeString, tokenizeIpa } from '../tokenize';
import { isValidCoda, isValidOnset, sonorityOf } from '../sonority';
import { classOf, isInClass, CLASS_LETTERS } from '../classes';
import type { ClassLetter } from '../classes';
import type { PhonemeFeatures } from '../features';

/** The tie bars, as escapes — pasted literally they hide on the neighbouring quote. */
const ABOVE = '͡';
const BELOW = '͜';

/** Features of a phoneme string, failing loudly if the fixture itself is wrong. */
function features(phoneme: string): PhonemeFeatures {
    const found = describePhoneme(phoneme);
    if (!found) throw new Error(`audit fixture ${JSON.stringify(phoneme)} does not resolve`);
    return found;
}

/** Every symbol the audit considers "in the app": the charts plus the extras. */
const ALL_SYMBOLS: string[] = [
    ...getAllIPASymbols(),
    ...EXTRA_SYMBOLS.filter((entry) => entry.role === 'symbol').map((entry) => entry.ipa),
];

// =============================================================================
// DEFECTS
// =============================================================================

describe('defect: the tie bar BELOW (U+035C) was a spelling nothing could read', () => {
    // `isTieBar` accepts U+035C and the tokenizer glues it into a single token,
    // but only the U+0361 and bare spellings were registered — so `d͜ʒ`, which
    // is the form the IPA prescribes for symbols with descenders, came back as
    // one token with `features: null`.

    it('resolves every affricate written with the tie bar below', () => {
        for (const entry of IPA_AFFRICATES) {
            const [first, second] = Array.from(entry.ipa).filter((ch) => ch !== ABOVE && ch !== BELOW);
            const below = `${first}${BELOW}${second}`;
            expect(describePhoneme(below), below).toMatchObject({ manner: 'affricate', base: entry.ipa });
        }
    });

    it('gives all three spellings of one affricate identical features', () => {
        const above = describePhoneme(`d${ABOVE}ʒ`);      // d͡ʒ
        const below = describePhoneme(`d${BELOW}ʒ`);      // d͜ʒ
        const bare = describePhoneme('dʒ');               // dʒ
        expect(below).toEqual(above);
        expect(bare).toEqual(above);
    });

    it('classifies the token the tokenizer built out of a below-bar affricate', () => {
        const tokens = tokenizeIpa(`d${BELOW}ʒa`);
        expect(tokens.map((token) => token.text)).toEqual([`d${BELOW}ʒ`, 'a']);
        // The bug: one token, correctly, and then nothing could say what it was.
        expect(tokens[0].features).toMatchObject({ manner: 'affricate', sibilant: true, voiced: true });
    });

    it('registered the extra spellings without colliding with anything', () => {
        expect(TABLE_CONFLICTS).toEqual([]);
    });
});

describe('defect: the s+stop onset licence covered sibilant AFFRICATES', () => {
    // Every sibilant affricate carries `sibilant: true` (it inherits it from its
    // fricative half), so the unqualified `first.sibilant` test licensed onsets
    // like `t͡s p-` — a strictly FALLING cluster, and the exact opposite of what
    // the "st- sp- str-" exception exists for.

    it('does not licence an affricate followed by a plosive', () => {
        for (const affricate of [`t${ABOVE}s`, `t${ABOVE}ʃ`, `d${ABOVE}ʒ`, 'tɕ']) {
            expect(isValidOnset([affricate, 'p'], { allowSibilantOnset: true }), affricate).toBe(false);
            expect(isValidOnset([affricate, 't'], { allowSibilantOnset: true }), affricate).toBe(false);
        }
    });

    it('still licences exactly the eight sibilant fricatives', () => {
        for (const sibilant of ['s', 'z', 'ʃ', 'ʒ', 'ʂ', 'ʐ', 'ɕ', 'ʑ']) {
            expect(isValidOnset([sibilant, 't'], { allowSibilantOnset: true }), sibilant).toBe(true);
        }
        // ...and nothing else, sibilant or not.
        expect(isValidOnset(['f', 't'], { allowSibilantOnset: true })).toBe(false);
        expect(isValidOnset(['ɬ', 't'], { allowSibilantOnset: true })).toBe(false);   // ɬ: lateral fricative, not grooved
    });

    it('leaves the licence off entirely when the flag is off', () => {
        for (const sibilant of ['s', 'ʃ']) {
            expect(isValidOnset([sibilant, 'k']), sibilant).toBe(false);
        }
    });
});

describe('defect: a voicing diacritic produced a self-contradicting sound', () => {
    // `l̥` is a voiceless l. The base's `voiced: true` was reported unchanged and
    // the mark was ALSO turned into an adjective, so the tooltip read "devoiced
    // voiced alveolar lateral approximant" and the sonority scale scored a
    // devoiced fricative as a voiced one.

    it('applies the ring below, the ring above and the caron below to `voiced`', () => {
        expect(features('l̥')).toMatchObject({ voiced: false });      // l̥
        expect(features('ŋ̊')).toMatchObject({ voiced: false });  // ŋ̊ (ring moves above under a descender)
        expect(features('t̬')).toMatchObject({ voiced: true });       // t̬
        expect(features('s̬')).toMatchObject({ voiced: true });       // s̬
    });

    it('reads the label back without contradicting itself', () => {
        expect(describePhonemeLabel('l̥')).toBe('voiceless alveolar lateral approximant');
        expect(describePhonemeLabel('t̬')).toBe('voiced alveolar plosive');
        expect(describePhonemeLabel('ŋ̊')).toBe('voiceless velar nasal');
    });

    it('lets the sonority scale follow the diacritic', () => {
        expect(sonorityOf(features('z̥'))).toBe(sonorityOf(features('s')));
        expect(sonorityOf(features('s̬'))).toBe(sonorityOf(features('z')));
    });

    it('keeps the mark visible in `modifiers` all the same', () => {
        expect(features('l̥').modifiers).toEqual(['̥']);
    });

    it('leaves a vowel alone — the marks are consonant voicing, not vowel colour', () => {
        expect(features('ḁ')).toMatchObject({ kind: 'vowel', base: 'a', modifiers: ['̥'] });
    });
});

describe('defect: a doubled tie bar broke the sound it was meant to join', () => {
    // A tie bar joins the next BASE. Consuming exactly one code point after it
    // meant a second bar stood in for the base, and `t͡͡ʃ` came apart into a `t`
    // carrying two bar-shaped "modifiers" plus a stray `ʃ`.

    it('steps over a run of tie bars and keeps the sound in one token', () => {
        expect(tokenizeIpa(`t${ABOVE}${ABOVE}ʃ`).map((token) => token.text))
            .toEqual([`t${ABOVE}${ABOVE}ʃ`]);
        // A mixed run too. The expectation goes through NFC because canonical
        // ordering sorts the two bars by combining class (U+035C, 233, ends up
        // before U+0361, 234) — the tokenizer's one and only rewrite.
        expect(tokenizeIpa(`t${ABOVE}${BELOW}ʃa`).map((token) => token.text))
            .toEqual([`t${ABOVE}${BELOW}ʃ`.normalize('NFC'), 'a']);
    });

    it('still leaves a dangling run dangling rather than eating the next separator', () => {
        expect(tokenizeIpa(`t${ABOVE}${ABOVE}`).map((token) => token.text)).toEqual([`t${ABOVE}${ABOVE}`]);
        expect(tokenizeIpa(`t${ABOVE}${ABOVE} a`).map((token) => token.text)).toEqual([`t${ABOVE}${ABOVE}`, ' ', 'a']);
    });
});

// =============================================================================
// TOKENIZER: PARTITION AND HOSTILE INPUT
// =============================================================================

describe('the tokenizer partitions anything', () => {
    const CORPUS = [
        '',
        '̃aba',                       // lone combining mark at the very start
        `ka${ABOVE}`,                      // tie bar at the very end
        `${ABOVE}`,                        // nothing but a tie bar
        `${BELOW}${ABOVE}`,                // nothing but tie bars
        'a\r\nb',                          // CRLF
        'a‍b‌c',                 // ZWJ / ZWNJ
        'a\u{1F600}\u{1F1E6}b',            // emoji, including a regional indicator
        '𐀀\uD800',              // a valid astral pair then a lone surrogate
        'ãẽõ',              // precomposed ã ẽ õ
        'ãẽõ',           // the same, decomposed
        'ɡɡɡ',              // three script g
        `ˈkaˌt${ABOVE}ʃa.ba`,
        'pʰtʰkʰ',
        '   ',
        '  ',                    // NBSP and a line separator
        '̧',                          // a lone cedilla: NFC cannot compose it onto nothing
    ];

    it('reproduces the NFC form of every input by joining the tokens', () => {
        for (const input of CORPUS) {
            const tokens = tokenizeIpa(input);
            expect(tokens.map((token) => token.text).join(''), JSON.stringify(input))
                .toBe(input.normalize('NFC'));
        }
    });

    it('gives every token a contiguous, correct offset', () => {
        for (const input of CORPUS) {
            const normalised = input.normalize('NFC');
            let cursor = 0;
            for (const token of tokenizeIpa(input)) {
                expect(token.index, JSON.stringify(input)).toBe(cursor);
                expect(normalised.slice(cursor, cursor + token.text.length)).toBe(token.text);
                cursor += token.text.length;
            }
            expect(cursor).toBe(normalised.length);
        }
    });

    it('never emits an empty token', () => {
        for (const input of CORPUS) {
            for (const token of tokenizeIpa(input)) {
                expect(token.text.length, JSON.stringify(input)).toBeGreaterThan(0);
            }
        }
    });

    it('starts a fresh, unclassified token on a combining mark with nothing to combine with', () => {
        const tokens = tokenizeIpa('̃ab');
        expect(tokens.map((token) => token.text)).toEqual(['̃', 'a', 'b']);
        expect(tokens[0].features).toBeNull();
        expect(tokens[0].separator).toBeUndefined();
    });

    it('treats CR and LF as two separate space separators', () => {
        expect(tokenizeIpa('a\r\nb').map((token) => token.separator))
            .toEqual([undefined, 'space', 'space', undefined]);
    });

    it('does not mistake a zero-width joiner for a separator or a modifier', () => {
        const tokens = tokenizeIpa('a‍b');
        expect(tokens.map((token) => token.text)).toEqual(['a', '‍', 'b']);
        expect(tokens[1].separator).toBeUndefined();
        expect(tokens[1].features).toBeNull();
    });

    it('keeps an astral character whole and reports its two-unit width', () => {
        const tokens = tokenizeIpa('a\u{1F600}b');
        expect(tokens.map((token) => token.text)).toEqual(['a', '\u{1F600}', 'b']);
        expect(tokens.map((token) => token.index)).toEqual([0, 1, 3]);
    });

    it('classifies precomposed and decomposed nasal vowels identically', () => {
        for (const [composed, decomposed] of [['ã', 'ã'], ['ẽ', 'ẽ'], ['õ', 'õ']]) {
            expect(tokenizeIpa(composed)[0].features, composed).toEqual(tokenizeIpa(decomposed)[0].features);
            expect(tokenizeIpa(composed)[0].features?.nasalized).toBe(true);
        }
    });

    it('keeps the user\'s ɡ in the text and the chart\'s g in the features', () => {
        const script = tokenizeIpa('ɡa')[0];
        const ascii = tokenizeIpa('ga')[0];
        expect(script.text).toBe('ɡ');
        expect(ascii.text).toBe('g');
        expect(script.features).toEqual(ascii.features);
    });
});

// =============================================================================
// FEATURE TABLE INVARIANTS
// =============================================================================

describe('the feature table is a fixed point', () => {
    it('resolves the `base` of every symbol back to itself', () => {
        for (const symbol of ALL_SYMBOLS) {
            const found = features(symbol);
            expect(describePhoneme(found.base)?.base, symbol).toBe(found.base);
        }
    });

    it('resolves every symbol `knownSymbols` reports', () => {
        const unresolved = knownSymbols().filter((symbol) => lookupBase(symbol) === null);
        expect(unresolved).toEqual([]);
        expect(knownSymbols().length).toBeGreaterThan(120);
    });

    it('hands back a table of the same size however often it is asked', () => {
        // A table rebuilt per call would be the classic "it works but the page
        // stutters" bug; this at least proves nothing is being appended to it.
        const before = knownSymbols().length;
        for (let i = 0; i < 500; i++) describePhonemeLabel('pʰ');
        expect(knownSymbols().length).toBe(before);
        expect(TABLE_CONFLICTS).toEqual([]);
    });

    it('classifies a phoneme faster than a per-call table build ever could', () => {
        // Deliberately generous: the point is to catch an accidental
        // `new Map(...)` inside the lookup, not to benchmark anything.
        const started = Date.now();
        for (let i = 0; i < 20_000; i++) {
            const found = features('tʃ');
            sonorityOf(found);
            classOf(found);
        }
        expect(Date.now() - started).toBeLessThan(5_000);
    });

    it('never throws, whatever it is handed', () => {
        for (const input of ['', '\uD800', '̃', '.', ' ', '\u{1F600}', 'abcdefg', `${ABOVE}${BELOW}`]) {
            expect(() => describePhoneme(input), JSON.stringify(input)).not.toThrow();
            expect(() => describePhonemeLabel(input), JSON.stringify(input)).not.toThrow();
        }
    });
});

describe('modifiers ride the base without changing it', () => {
    it('keeps a stack of three marks in source order', () => {
        expect(features('kʷʰː').modifiers).toEqual(['ʷ', 'ʰ', 'ː']);
    });

    it('sets `long` and `nasalized` from their own marks and no others', () => {
        expect(features('aː')).toMatchObject({ long: true, nasalized: false });
        expect(features('ã')).toMatchObject({ long: false, nasalized: true });
        expect(features('ãː')).toMatchObject({ long: true, nasalized: true });
        expect(features('aˑ')).toMatchObject({ long: false });        // half-long is not long
        expect(features('a̰')).toMatchObject({ nasalized: false });   // creaky is not nasal
    });

    it('leaves the sonority of a sound alone for a mark that is not about voicing', () => {
        for (const mark of ['ʰ', 'ʷ', 'ʲ', 'ʼ', 'ː']) {
            expect(sonorityOf(features(`k${mark}`)), mark).toBe(sonorityOf(features('k')));
        }
    });

    it('labels an ejective, an aspirate and a long vowel in the order they were written', () => {
        expect(describePhonemeLabel('kʼ')).toBe('ejective voiceless velar plosive');
        expect(describePhonemeLabel('tʰ')).toBe('aspirated voiceless alveolar plosive');
        expect(describePhonemeLabel('uː')).toBe('long close back rounded vowel');
    });

    it('never produces a label containing `undefined` or a double space', () => {
        const stacks = ['', 'ʰ', 'ʷː', '̃', 'ʼ', '̩'];
        for (const symbol of ALL_SYMBOLS) {
            for (const stack of stacks) {
                const label = describePhonemeLabel(symbol + stack);
                expect(label, `${symbol}+${JSON.stringify(stack)}`).not.toContain('undefined');
                expect(label).not.toContain('  ');
                expect(label.trim()).toBe(label);
                expect(label.length).toBeGreaterThan(0);
            }
        }
    });
});

// =============================================================================
// CLASSES
// =============================================================================

describe('the class letters partition the sounds', () => {
    const CONSONANT_FAMILIES: ClassLetter[] = ['P', 'F', 'N', 'L', 'G'];

    it('puts every consonant in C and in exactly one manner family', () => {
        for (const symbol of ALL_SYMBOLS) {
            const found = features(symbol);
            if (found.kind !== 'consonant') continue;
            const classes = classOf(found);
            expect(classes, symbol).toContain('C');
            expect(classes, symbol).not.toContain('V');
            const family = CONSONANT_FAMILIES.filter((letter) => classes.includes(letter));
            expect(family, `${symbol} -> ${classes.join('')}`).toHaveLength(1);
        }
    });

    it('puts every vowel in V and in nothing else', () => {
        for (const symbol of [...getAllVowelSymbols(), 'ɚ', 'ɝ']) {
            expect(classOf(features(symbol)), symbol).toEqual(['V']);
        }
    });

    it('splits the consonants cleanly between the sonorants and the obstruents', () => {
        for (const symbol of getAllConsonantSymbols()) {
            const classes = classOf(features(symbol));
            const sonorant = classes.includes('R');
            const obstruent = classes.includes('O');
            expect(sonorant !== obstruent, `${symbol} -> ${classes.join('')}`).toBe(true);
        }
    });

    it('only ever calls a fricative or a stop a sibilant', () => {
        for (const symbol of ALL_SYMBOLS) {
            const found = features(symbol);
            if (found.kind !== 'consonant' || !found.sibilant) continue;
            const classes = classOf(found);
            expect(classes.includes('F') || classes.includes('P'), symbol).toBe(true);
        }
    });

    it('returns a duplicate-free subset of the reserved letters, freshly allocated', () => {
        for (const symbol of ALL_SYMBOLS) {
            const classes = classOf(features(symbol));
            expect(new Set(classes).size, symbol).toBe(classes.length);
            for (const letter of classes) expect(CLASS_LETTERS, symbol).toContain(letter);
        }
        // Mutating the answer must not poison the next caller.
        const first = classOf(features('m'));
        first.push('V');
        expect(classOf(features('m'))).toEqual(['C', 'N', 'R']);
    });

    it('agrees with isInClass for every letter and every symbol', () => {
        for (const symbol of ALL_SYMBOLS) {
            const found = features(symbol);
            const classes = classOf(found);
            for (const letter of CLASS_LETTERS) {
                expect(isInClass(found, letter), `${symbol} in ${letter}`).toBe(classes.includes(letter));
            }
        }
    });
});

// =============================================================================
// SONORITY AND CLUSTERS
// =============================================================================

describe('the sonority scale covers every manner', () => {
    it('scores every sound in the app between the plosive floor and the vowel ceiling', () => {
        for (const symbol of ALL_SYMBOLS) {
            const value = sonorityOf(features(symbol));
            expect(Number.isFinite(value), symbol).toBe(true);
            expect(value, symbol).toBeGreaterThanOrEqual(1);
            expect(value, symbol).toBeLessThanOrEqual(10);
        }
    });

    it('scores the manners the pulmonic chart does not have', () => {
        expect(sonorityOf(features('ɬ'))).toBe(sonorityOf(features('s')));      // ɬ lateral fricative
        expect(sonorityOf(features('ɮ'))).toBe(sonorityOf(features('z')));      // ɮ voiced lateral fricative
        expect(sonorityOf(features('ǀ'))).toBe(sonorityOf(features('t')));      // ǀ click
        expect(sonorityOf(features('ɓ'))).toBe(sonorityOf(features('t')));      // ɓ implosive
        expect(sonorityOf(features('kʼ'))).toBe(sonorityOf(features('k')));     // kʼ ejective: a k with an airstream
        expect(sonorityOf(features(`t${ABOVE}ʃ`))).toBeLessThan(sonorityOf(features('s')));
        expect(sonorityOf(features(`t${ABOVE}ʃ`))).toBeGreaterThan(sonorityOf(features('d')));
    });
});

describe('onsets and codas beyond two consonants', () => {
    it('accepts a three-consonant onset only if it rises all the way', () => {
        expect(isValidOnset(['p', 'l', 'j'])).toBe(true);             // 1 < 6 < 7
        expect(isValidOnset(['t', 'r', 'j'])).toBe(true);             // 1 < 6 < 7
        expect(isValidOnset(['p', 'j', 'l'])).toBe(false);            // 1 < 7 > 6
        expect(isValidOnset(['k', 'n', 'j'])).toBe(true);             // 1 < 5 < 7
        expect(isValidOnset(['p', 'z', 'n'])).toBe(true);             // 1 < 4 < 5
        expect(isValidOnset(['p', 'n', 'z'])).toBe(false);            // 1 < 5 > 4
    });

    it('accepts a four-consonant coda only if it falls all the way', () => {
        expect(isValidCoda(['j', 'n', 'z', 'p'])).toBe(true);         // 7 > 5 > 4 > 1
        expect(isValidCoda(['j', 'n', 'p', 'z'])).toBe(false);
        expect(isValidCoda(['r', 'n', 't'])).toBe(true);              // 6 > 5 > 1
        expect(isValidCoda(['n', 't', 's'])).toBe(false);             // 5 > 1 < 3 — strict means strict
    });

    it('mirrors: a legal two-consonant onset reversed is a legal coda, and vice versa', () => {
        const consonants = ['p', 'b', 't', 'd', 'k', 's', 'z', 'm', 'n', 'l', 'r', 'j', 'w'];
        for (const first of consonants) {
            for (const second of consonants) {
                expect(isValidOnset([first, second]), `${first}${second}`)
                    .toBe(isValidCoda([second, first]));
            }
        }
    });

    it('never fires the licence anywhere but the first position, at any length', () => {
        for (const cluster of [['p', 's', 't'], ['t', 's', 't'], ['k', 's', 'p'], ['p', 'l', 's', 't']]) {
            expect(isValidOnset(cluster, { allowSibilantOnset: true }), cluster.join('')).toBe(false);
        }
    });

    it('never lets the licence reach a coda, whatever the pair', () => {
        for (const sibilant of ['s', 'z', 'ʃ', 'ʒ']) {
            for (const stop of ['p', 't', 'k', 'b', 'd']) {
                expect(isValidCoda([sibilant, stop], { allowSibilantOnset: true }), `${sibilant}${stop}`)
                    .toBe(sonorityOf(features(sibilant)) > sonorityOf(features(stop)));
            }
        }
    });

    it('treats a single consonant, known or not, as a legal onset and coda', () => {
        for (const symbol of [...getAllConsonantSymbols(), '☃']) {
            expect(isValidOnset([symbol]), symbol).toBe(true);
            expect(isValidCoda([symbol]), symbol).toBe(true);
        }
    });

    it('refuses to judge any cluster containing something it cannot classify', () => {
        expect(isValidOnset(['p', ''])).toBe(false);
        expect(isValidOnset(['', 'l'])).toBe(false);
        expect(isValidCoda(['l', '☃'])).toBe(false);
        // ...but a dangling tie bar is NOT unclassifiable: it resolves to its
        // base, so the cluster is judged on that base's sonority alone.
        expect(isValidOnset([`t${ABOVE}`, 'r'])).toBe(true);
        expect(isValidOnset(['p', `t${ABOVE}`])).toBe(false);   // p and t are both 1: flat, not rising
    });
});

// =============================================================================
// CONTRACT AND OPEN QUESTIONS
// =============================================================================

describe('the barrel exports the contract Phases 2-5 import', () => {
    it('re-exports every name the plan names', () => {
        for (const name of [
            'describePhoneme', 'describePhonemeLabel', 'lookupBase',
            'tokenizeIpa', 'splitPhonemeString',
            'sonorityOf', 'isValidOnset', 'isValidCoda',
            'classOf', 'isClassLetter', 'CLASS_LETTERS', 'CLASS_LABELS',
        ]) {
            expect(barrel, name).toHaveProperty(name);
        }
    });
});

describe('behaviour recorded as-is (open questions, not defects)', () => {
    it('splits an untied `tʃ` in the tokenizer while describePhoneme calls it one affricate', () => {
        // Two APIs, two readings, both documented in `tokenize.ts`. It is the
        // one place where "the sounds of this string" and "this string is one
        // sound" disagree, and Phase 2 has to pick the right one per call site.
        expect(splitPhonemeString('tʃ')).toHaveLength(2);
        expect(describePhoneme('tʃ')).toMatchObject({ manner: 'affricate' });
    });

    it('keeps a dangling tie bar as a modifier on the base before it', () => {
        // `t͡` resolves to a plain `t` carrying U+0361 in `modifiers`. Arguably
        // the bar should be dropped; as long as nothing reads it as a feature,
        // preserving it keeps the token's text and its features in step.
        expect(describePhoneme(`t${ABOVE}`)).toMatchObject({ base: 't', modifiers: [ABOVE] });
    });

    it('reports w and ʍ by their chart-mapped places, not their real ones', () => {
        // Both are labial-velar; the chart has no such column, so `w` is filed
        // as velar (which puts it in G, where phonotactics wants it) and `ʍ` as
        // a velar fricative (which keeps it OUT of G). A conlanger writing
        // "CGV" will not get ʍ.
        expect(describePhonemeLabel('w')).toBe('voiced velar approximant');
        expect(classOf(features('w'))).toEqual(['C', 'G', 'R']);
        expect(classOf(features('ʍ'))).toEqual(['C', 'F', 'O']);
    });

    it('licences a voiced sibilant before a voiced stop as readily as `st-`', () => {
        // `zd-` is far rarer than `st-`, but the plan writes the exception as
        // "sibilant + plosive" without a voicing condition.
        expect(isValidOnset(['z', 'd'], { allowSibilantOnset: true })).toBe(true);
    });

    it('reports knownSymbols in NFD, so a precomposed chart symbol looks decomposed', () => {
        // The table is keyed in NFD by design. `base` is still the composed
        // chart spelling, so a UI should read `base`, never this list.
        expect(knownSymbols()).toContain('ç');
        expect(knownSymbols()).not.toContain('ç');
        expect(describePhoneme('ç')?.base).toBe('ç');
    });

    it('loses a precomposed symbol\'s identity under a low-combining-class mark', () => {
        // NFD canonical ordering moves U+0334 (ccc 1) in FRONT of the cedilla
        // (ccc 202), so the longest-prefix peel can no longer see `c`+cedilla
        // and falls back to the palatal PLOSIVE. Real, but it needs a
        // velarised ç to show up; fixing it means peeling marks out of the
        // middle of a token, which is a bigger change than Phase 1 warrants.
        expect(describePhoneme('ç̴')).toMatchObject({ manner: 'plosive', base: 'c' });
        expect(describePhoneme('ç')).toMatchObject({ manner: 'fricative' });
    });
});
