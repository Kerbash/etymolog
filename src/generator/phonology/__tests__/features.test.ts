/**
 * features — the IPA lookup table.
 *
 * The invariant that matters most is the first one: EVERY symbol the chart can
 * render must resolve. A symbol the chart offers but the generator cannot
 * classify is a cell the user can click and then never see in a generated word,
 * with nothing anywhere saying why.
 *
 * Node environment (the suite default): this module touches no DOM.
 */

import { describe, expect, it } from 'vitest';

import {
    getAllConsonantSymbols,
    getAllIPASymbols,
    getAllVowelSymbols,
    IPA_AFFRICATES,
} from '../../../data/ipaChartData';
import {
    describePhoneme,
    describePhonemeLabel,
    isAttachingMark,
    isTieBar,
    lookupBase,
    separatorKindOf,
    EXTRA_SYMBOLS,
    TABLE_CONFLICTS,
} from '../features';

describe('the table itself', () => {
    it('was built without a single collision', () => {
        // A duplicate registration silently gives one symbol another's
        // features. It is recorded rather than thrown so a data typo cannot
        // take the app down at import time — which is only safe if something
        // checks the record.
        expect(TABLE_CONFLICTS).toEqual([]);
    });

    it('resolves every symbol the chart can render', () => {
        const unresolved = getAllIPASymbols().filter((symbol) => lookupBase(symbol) === null);
        expect(unresolved).toEqual([]);
    });

    it('resolves every chart symbol through describePhoneme too', () => {
        const unresolved = getAllIPASymbols().filter((symbol) => describePhoneme(symbol) === null);
        expect(unresolved).toEqual([]);
    });

    it('calls every chart consonant a consonant and every chart vowel a vowel', () => {
        for (const symbol of getAllConsonantSymbols()) {
            expect(lookupBase(symbol)?.kind).toBe('consonant');
        }
        for (const symbol of getAllVowelSymbols()) {
            expect(lookupBase(symbol)?.kind).toBe('vowel');
        }
    });
});

describe('consonant features', () => {
    it('reads voicing off the half-cell the symbol sits in', () => {
        expect(lookupBase('p')).toMatchObject({ kind: 'consonant', manner: 'plosive', place: 'bilabial', voiced: false });
        expect(lookupBase('b')).toMatchObject({ kind: 'consonant', manner: 'plosive', place: 'bilabial', voiced: true });
    });

    it('marks the sibilants and nothing else', () => {
        for (const sibilant of ['s', 'z', 'ʃ', 'ʒ', 'ʂ', 'ʐ', 'ɕ', 'ʑ']) {
            expect(describePhoneme(sibilant)).toMatchObject({ sibilant: true });
        }
        // ç and ʃ are both voiceless fricatives; only one of them is grooved.
        for (const plain of ['ç', 'x', 'f', 'θ', 'ɬ', 'h']) {
            expect(describePhoneme(plain)).toMatchObject({ sibilant: false });
        }
    });

    it('keeps the chart oddities the generator would otherwise lose', () => {
        expect(lookupBase('ⱱ')).toMatchObject({ manner: 'tap', place: 'labiodental' });
        expect(lookupBase('ʙ')).toMatchObject({ manner: 'trill', place: 'bilabial' });
        expect(lookupBase('ʟ')).toMatchObject({ manner: 'lateral_approximant', place: 'velar' });
    });

    it('gives clicks a manner but no place, and implosives both', () => {
        expect(lookupBase('ʘ')).toMatchObject({ manner: 'click', place: null, voiced: false });
        expect(lookupBase('ǂ')).toMatchObject({ manner: 'click', place: null });
        expect(lookupBase('ɓ')).toMatchObject({ manner: 'implosive', place: 'bilabial', voiced: true });
        expect(lookupBase('ʛ')).toMatchObject({ manner: 'implosive', place: 'uvular', voiced: true });
    });
});

describe('vowel features', () => {
    it('reads height, backness and rounding off the trapezoid', () => {
        expect(lookupBase('a')).toMatchObject({ kind: 'vowel', height: 'open', backness: 'front', rounded: false });
        expect(lookupBase('u')).toMatchObject({ kind: 'vowel', height: 'close', backness: 'back', rounded: true });
        expect(lookupBase('ə')).toMatchObject({ kind: 'vowel', height: 'mid', backness: 'central', rounded: false });
    });
});

describe('the g that is not a g', () => {
    it('resolves ɡ (U+0261) to the chart\'s ASCII g', () => {
        const script = describePhoneme('ɡ');
        expect(script).not.toBeNull();
        expect(script?.base).toBe('g');
        expect(script).toMatchObject({ manner: 'plosive', place: 'velar', voiced: true });
    });

    it('keeps the two spellings comparable through `base`', () => {
        expect(describePhoneme('ɡ')?.base).toBe(describePhoneme('g')?.base);
    });

    it('carries modifiers on the alias as well', () => {
        expect(describePhoneme('ɡʷ')).toMatchObject({ base: 'g', modifiers: ['ʷ'] });
    });
});

describe('affricates', () => {
    it('derives place and sibilance from the second component, voicing from the first', () => {
        expect(describePhoneme('t\u0361ʃ')).toMatchObject({
            kind: 'consonant',
            manner: 'affricate',
            place: 'postalveolar',
            voiced: false,
            sibilant: true,
            base: 't\u0361ʃ',
        });
        expect(describePhoneme('d\u0361ʒ')).toMatchObject({ manner: 'affricate', voiced: true, sibilant: true });
        // The lateral affricate is NOT a sibilant — ɬ is not grooved.
        expect(describePhoneme('t\u0361ɬ')).toMatchObject({ manner: 'affricate', place: 'alveolar', sibilant: false });
    });

    it('accepts the tie-bar-less spelling as one phoneme, with the same base', () => {
        for (const entry of IPA_AFFRICATES) {
            const plain = Array.from(entry.ipa).filter((ch) => ch !== '\u0361' && ch !== '\u035C').join('');
            const features = describePhoneme(plain);
            expect(features, `plain spelling ${plain}`).not.toBeNull();
            expect(features?.kind === 'consonant' && features.manner).toBe('affricate');
            expect(features?.base).toBe(entry.ipa);
        }
    });

    it('covers the ten spellings the plan names', () => {
        for (const plain of ['tʃ', 'ts', 'dʒ', 'dz', 'tɕ', 'dʑ', 'ʈʂ', 'ɖʐ', 'tɬ', 'dɮ']) {
            expect(describePhoneme(plain), plain).toMatchObject({ manner: 'affricate' });
        }
    });

    it('carries a modifier on either spelling', () => {
        expect(describePhoneme('t\u0361ɕʰ')).toMatchObject({ base: 't\u0361ɕ', modifiers: ['ʰ'] });
        expect(describePhoneme('tɕʰ')).toMatchObject({ base: 't\u0361ɕ', modifiers: ['ʰ'] });
    });
});

describe('the extras', () => {
    it('documents every entry', () => {
        expect(EXTRA_SYMBOLS.length).toBeGreaterThan(0);
        for (const entry of EXTRA_SYMBOLS) {
            expect(entry.ipa.length, `${entry.ipa} has an ipa`).toBeGreaterThan(0);
            expect(entry.note.length, `${entry.ipa} has a note`).toBeGreaterThan(20);
        }
    });

    it('resolves every symbol-role entry', () => {
        for (const entry of EXTRA_SYMBOLS) {
            if (entry.role !== 'symbol') continue;
            expect(lookupBase(entry.ipa), entry.ipa).not.toBeNull();
        }
    });

    it('treats every modifier-role entry as a mark, not a sound', () => {
        for (const entry of EXTRA_SYMBOLS) {
            if (entry.role !== 'modifier') continue;
            expect(isAttachingMark(entry.ipa), entry.ipa).toBe(true);
            expect(lookupBase(entry.ipa), entry.ipa).toBeNull();
        }
    });

    it('places w in the glide slot and ʍ in the fricative one', () => {
        expect(describePhoneme('w')).toMatchObject({ manner: 'approximant', place: 'velar', voiced: true });
        expect(describePhoneme('ʍ')).toMatchObject({ manner: 'fricative', place: 'velar', voiced: false });
    });

    it('keeps ɫ a lateral and ɚ ɝ vowels', () => {
        expect(describePhoneme('ɫ')).toMatchObject({ manner: 'lateral_approximant', place: 'alveolar' });
        expect(describePhoneme('ɚ')).toMatchObject({ kind: 'vowel', height: 'mid', backness: 'central' });
        expect(describePhoneme('ɝ')).toMatchObject({ kind: 'vowel', height: 'mid', backness: 'central' });
    });

    it('keeps the retracted ɹ retracted, with or without a further modifier', () => {
        // The longest-symbol-wins peel is what makes this work: a naive
        // "strip every mark, then look up" would report plain alveolar.
        expect(describePhoneme('ɹ\u0320')).toMatchObject({ manner: 'approximant', place: 'postalveolar' });
        expect(describePhoneme('ɹ\u0320ʲ')).toMatchObject({ place: 'postalveolar', modifiers: ['ʲ'] });
        expect(describePhoneme('ɹ')).toMatchObject({ place: 'alveolar' });
    });

    it('keeps the ejective mark on the base rather than replacing it', () => {
        expect(describePhoneme('kʼ')).toMatchObject({ base: 'k', manner: 'plosive', modifiers: ['ʼ'] });
    });
});

describe('modifiers', () => {
    it('collects them in source order and leaves the base alone', () => {
        expect(describePhoneme('pʰ')).toMatchObject({ base: 'p', modifiers: ['ʰ'], long: false, nasalized: false });
        expect(describePhoneme('kʷ')).toMatchObject({ base: 'k', modifiers: ['ʷ'] });
        expect(describePhoneme('tʲʰ')).toMatchObject({ base: 't', modifiers: ['ʲ', 'ʰ'] });
    });

    it('sets `long` from ː and nothing else', () => {
        expect(describePhoneme('aː')).toMatchObject({ base: 'a', long: true, modifiers: ['ː'] });
        expect(describePhoneme('a')).toMatchObject({ long: false });
        expect(describePhoneme('aˑ')).toMatchObject({ long: false, modifiers: ['ˑ'] });
    });

    it('sets `nasalized` whether the tilde arrives composed or decomposed', () => {
        expect(describePhoneme('\u00E3')).toMatchObject({ base: 'a', nasalized: true });   // precomposed ã
        expect(describePhoneme('a\u0303')).toMatchObject({ base: 'a', nasalized: true });  // a + combining tilde
        expect(describePhoneme('a\u0303ː')).toMatchObject({ base: 'a', nasalized: true, long: true });
    });

    it('resolves a precomposed chart symbol that decomposes (ç)', () => {
        // NFD turns ç into c + cedilla; the table is keyed in NFD too, so the
        // palatal fricative must not be mistaken for a palatal plosive.
        expect(describePhoneme('\u00E7')).toMatchObject({ manner: 'fricative', place: 'palatal' });   // precomposed ç
        expect(describePhoneme('c\u0327')).toMatchObject({ manner: 'fricative', place: 'palatal' }); // c + cedilla
        expect(describePhoneme('c')).toMatchObject({ manner: 'plosive', place: 'palatal' });
    });
});

describe('what does not resolve', () => {
    it('returns null rather than guessing', () => {
        expect(describePhoneme('')).toBeNull();
        expect(describePhoneme('☃')).toBeNull();
        expect(describePhoneme('ka')).toBeNull();       // two sounds, not one phoneme
        expect(describePhoneme('ˈ')).toBeNull();        // a separator is not a sound
        expect(describePhoneme('ʰ')).toBeNull();        // a modifier with nothing to modify
    });

    it('will not strip a diacritic for lookupBase', () => {
        expect(lookupBase('aː')).toBeNull();
        expect(lookupBase('pʰ')).toBeNull();
        expect(lookupBase('')).toBeNull();
    });
});

describe('result ownership', () => {
    it('hands back a fresh object each time', () => {
        const first = describePhoneme('p');
        const second = describePhoneme('p');
        expect(first).not.toBe(second);
        expect(first).toEqual(second);
    });

    it('cannot be corrupted through the array it returns', () => {
        lookupBase('p')?.modifiers.push('ʰ');
        expect(lookupBase('p')?.modifiers).toEqual([]);
    });
});

describe('describePhonemeLabel', () => {
    it('names a plain consonant the way the chart does', () => {
        expect(describePhonemeLabel('s')).toBe('voiceless alveolar fricative');
        expect(describePhonemeLabel('b')).toBe('voiced bilabial plosive');
        expect(describePhonemeLabel('ʃ')).toBe('voiceless post-alveolar fricative');
        expect(describePhonemeLabel('ɾ')).toBe('voiced alveolar tap');
    });

    it('names a vowel from its coordinates', () => {
        expect(describePhonemeLabel('i')).toBe('close front unrounded vowel');
        expect(describePhonemeLabel('ɔ')).toBe('open-mid back rounded vowel');
    });

    it('leads with the modifiers, in the order they were written', () => {
        expect(describePhonemeLabel('pʰ')).toBe('aspirated voiceless bilabial plosive');
        expect(describePhonemeLabel('aː')).toBe('long open front unrounded vowel');
        expect(describePhonemeLabel('kʷʼ')).toBe('labialized ejective voiceless velar plosive');
    });

    it('uses the description the data ships for affricates, clicks and implosives', () => {
        expect(describePhonemeLabel('t\u0361ʃ')).toBe('voiceless postalveolar affricate');
        expect(describePhonemeLabel('tʃ')).toBe('voiceless postalveolar affricate');
        expect(describePhonemeLabel('ʘ')).toBe('bilabial click');
        expect(describePhonemeLabel('ɗ')).toBe('voiced alveolar implosive');
    });

    it('says so, rather than returning an empty string, when it cannot tell', () => {
        // A blank tooltip reads as a broken component; a phrase reads as data.
        expect(describePhonemeLabel('☃')).toBe('unrecognised sound');
        expect(describePhonemeLabel('')).toBe('unrecognised sound');
    });

    it('never returns an empty label for any chart symbol', () => {
        for (const symbol of getAllIPASymbols()) {
            expect(describePhonemeLabel(symbol).length, symbol).toBeGreaterThan(0);
            expect(describePhonemeLabel(symbol), symbol).not.toBe('unrecognised sound');
        }
    });
});

describe('character classes', () => {
    it('recognises the marks that ride on a base', () => {
        for (const mark of ['ʰ', 'ʲ', 'ʷ', 'ˠ', 'ˤ', 'ʼ', 'ː', 'ˑ', 'ⁿ', '\u0303', '\u0325', '\u0361']) {
            expect(isAttachingMark(mark), JSON.stringify(mark)).toBe(true);
        }
    });

    it('does not call a base, a separator or a whole token a mark', () => {
        for (const notAMark of ['a', 'p', 'ʃ', 'ˈ', 'ˌ', '.', '‿', ' ', '', '☃']) {
            expect(isAttachingMark(notAMark), JSON.stringify(notAMark)).toBe(false);
        }
        // A STRING is never a mark, even when it starts with one: judging by
        // the first character would quietly reclassify a whole token.
        expect(isAttachingMark('ʰx')).toBe(false);
        expect(isAttachingMark('ːː')).toBe(false);
    });

    it('names each separator', () => {
        expect(separatorKindOf('ˈ')).toBe('stress');
        expect(separatorKindOf('ˌ')).toBe('stress');
        expect(separatorKindOf('.')).toBe('syllable');
        expect(separatorKindOf('‿')).toBe('syllable');
        expect(separatorKindOf(' ')).toBe('space');
        expect(separatorKindOf('\t')).toBe('space');
        expect(separatorKindOf('\n')).toBe('space');
        expect(separatorKindOf('a')).toBeNull();
        expect(separatorKindOf('  ')).toBeNull();
        expect(separatorKindOf('')).toBeNull();
    });

    it('knows both tie bars and nothing else', () => {
        expect(isTieBar('\u0361')).toBe(true);
        expect(isTieBar('\u035C')).toBe(true);
        expect(isTieBar('\u0303')).toBe(false);
        expect(isTieBar('t')).toBe(false);
        expect(isTieBar('t\u0361')).toBe(false);
    });
});
