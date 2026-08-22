/**
 * The constraint rules, applied to words nobody generated.
 *
 * Every case below is a hand-built word. That is the point: the engine's own
 * property tests ask the rules whether the engine's output is legal, which
 * proves only that the two agree. These ask whether the rules are RIGHT.
 *
 * Node environment.
 */

import { describe, expect, it } from 'vitest';
import {
    buildSyllable,
    checkWord,
    clusterBudget,
    explainViolation,
    inventoryOnly,
    isVocalic,
    noForbiddenSequences,
    noIllegalGeminates,
    slotHarmony,
    sonorityInClusters,
    soundsOf,
    vowelHarmony,
    wordSounds,
    CONSTRAINT_RULES,
} from '../constraints';
import { deriveInventory } from '../../inventory';
import { cloneDefaultProfile } from '../../profile/defaults';
import type { Syllable } from '../constraints';
import type { WordGeneratorProfile } from '../../profile/types';

function profileWith(patch: Partial<WordGeneratorProfile>): WordGeneratorProfile {
    const base = cloneDefaultProfile();
    return { ...base, ...patch, clusters: { ...base.clusters, ...(patch.clusters ?? {}) } };
}

/** A word from syllables written as slot lists: `word([['k','a'],['t','a']])`. */
function word(syllables: string[][]): Syllable[] {
    return syllables.map(buildSyllable);
}

const INVENTORY = deriveInventory(
    ['p', 't', 'k', 'b', 'd', 'g', 's', 'z', 'ʃ', 'm', 'n', 'l', 'r', 'j', 'w', 'a', 'e', 'i', 'o', 'u', 'ə'],
    cloneDefaultProfile(),
);

// =============================================================================
// The shape of a syllable
// =============================================================================

describe('buildSyllable', () => {
    it('splits onset, nucleus and coda around the vowels', () => {
        const syllable = buildSyllable(['k', 'r', 'a', 'n']);
        expect(syllable.onset).toEqual(['k', 'r']);
        expect(syllable.nucleus).toEqual(['a']);
        expect(syllable.coda).toEqual(['n']);
        expect(syllable.text).toBe('kran');
    });

    it('treats a diphthong literal as one nucleus slot', () => {
        const syllable = buildSyllable(['k', 'ai']);
        expect(syllable.nucleus).toEqual(['ai']);
        expect(syllable.coda).toEqual([]);
        expect(wordSounds([syllable])).toEqual(['k', 'a', 'i']);
    });

    it('spans the whole vowel run, so a hiatus is one nucleus', () => {
        const syllable = buildSyllable(['a', 'e', 'n']);
        expect(syllable.nucleus).toEqual(['a', 'e']);
        expect(syllable.coda).toEqual(['n']);
    });

    it('calls a vowel-less syllable all onset', () => {
        const syllable = buildSyllable(['s', 't']);
        expect(syllable.onset).toEqual(['s', 't']);
        expect(syllable.nucleus).toEqual([]);
    });

    it('drops empty slots', () => {
        expect(buildSyllable(['k', '', 'a']).slots).toEqual(['k', 'a']);
    });
});

describe('soundsOf and isVocalic', () => {
    it('keeps a tie-barred affricate whole and splits a diphthong', () => {
        expect(soundsOf('t͡ʃ')).toEqual(['t͡ʃ']);
        expect(soundsOf('ai')).toEqual(['a', 'i']);
        expect(soundsOf('aː')).toEqual(['aː']);
    });

    it('calls a vowel and a diphthong vocalic, and nothing else', () => {
        expect(isVocalic('a')).toBe(true);
        expect(isVocalic('ai')).toBe(true);
        expect(isVocalic('aː')).toBe(true);
        expect(isVocalic('n')).toBe(false);
        expect(isVocalic('an')).toBe(false);
    });
});

// =============================================================================
// Forbidden sequences
// =============================================================================

describe('noForbiddenSequences', () => {
    it('passes a word when the list is empty', () => {
        expect(noForbiddenSequences(word([['k', 'a']]), profileWith({}))).toBeNull();
    });

    it('rejects a run of whole sounds and names them', () => {
        const violation = noForbiddenSequences(word([['a', 'k'], ['t', 'a']]), profileWith({ forbidden: ['kt'] }));
        expect(violation?.rule).toBe('noForbiddenSequences');
        expect(violation?.offenders).toEqual(['k', 't']);
    });

    it('matches across a syllable boundary', () => {
        expect(noForbiddenSequences(word([['a', 'n'], ['k', 'a']]), profileWith({ forbidden: ['nk'] }))).not.toBeNull();
    });

    it('does not fire when the sequence is not there', () => {
        expect(noForbiddenSequences(word([['k', 'a'], ['t', 'a']]), profileWith({ forbidden: ['kt'] }))).toBeNull();
    });

    it('ignores stress and dots in the forbidden entry itself', () => {
        expect(noForbiddenSequences(word([['a', 'k'], ['t', 'a']]), profileWith({ forbidden: ['k.t'] }))).not.toBeNull();
    });

    it('matches a single sound', () => {
        expect(noForbiddenSequences(word([['k', 'a']]), profileWith({ forbidden: ['k'] }))).not.toBeNull();
    });

    it('skips empty and non-string entries instead of rejecting everything', () => {
        const profile = profileWith({ forbidden: ['', null as unknown as string, '   '] });
        expect(noForbiddenSequences(word([['k', 'a']]), profile)).toBeNull();
    });
});

// =============================================================================
// Geminates
// =============================================================================

describe('noIllegalGeminates', () => {
    it('rejects a doubled consonant across a syllable boundary', () => {
        const violation = noIllegalGeminates(word([['k', 'a', 't'], ['t', 'a']]), profileWith({}));
        expect(violation?.offenders).toEqual(['t', 't']);
    });

    it('allows it when the profile says so', () => {
        const profile = profileWith({ clusters: { allowGeminates: true } as never });
        expect(noIllegalGeminates(word([['k', 'a', 't'], ['t', 'a']]), profile)).toBeNull();
    });

    it('compares canonical bases, so g and the single-storey g are one consonant', () => {
        expect(noIllegalGeminates(word([['a', 'g'], ['ɡ', 'a']]), profileWith({}))).not.toBeNull();
    });

    it('does NOT call t + tʰ a geminate — the aspiration makes them two sounds', () => {
        expect(noIllegalGeminates(word([['a', 't'], ['tʰ', 'a']]), profileWith({}))).toBeNull();
    });

    it('leaves a doubled vowel alone — that is length, not gemination', () => {
        expect(noIllegalGeminates(word([['a'], ['a']]), profileWith({}))).toBeNull();
    });

    it('catches a doubled consonant inside one syllable too', () => {
        expect(noIllegalGeminates(word([['t', 't', 'a']]), profileWith({}))).not.toBeNull();
    });
});

// =============================================================================
// Sonority
// =============================================================================

describe('sonorityInClusters', () => {
    const on = profileWith({ clusters: { sonority: true, sibilantOnsetException: false } as never });

    it('accepts a rising onset and a falling coda', () => {
        expect(sonorityInClusters(word([['p', 'l', 'a', 'n', 't']]), on)).toBeNull();
    });

    it('rejects a falling onset', () => {
        const violation = sonorityInClusters(word([['l', 'p', 'a']]), on);
        expect(violation?.detail).toBe('onset');
    });

    it('rejects a rising coda', () => {
        const violation = sonorityInClusters(word([['a', 't', 'l']]), on);
        expect(violation?.detail).toBe('coda');
    });

    it('does nothing at all when the switch is off', () => {
        const off = profileWith({ clusters: { sonority: false } as never });
        expect(sonorityInClusters(word([['l', 'p', 'a']]), off)).toBeNull();
    });

    it('licenses st- only with the exception switched on', () => {
        expect(sonorityInClusters(word([['s', 't', 'a']]), on)).not.toBeNull();
        const exception = profileWith({ clusters: { sonority: true, sibilantOnsetException: true } as never });
        expect(sonorityInClusters(word([['s', 't', 'a']]), exception)).toBeNull();
    });

    it('licenses st- only WORD-INITIALLY, never on a later syllable', () => {
        const exception = profileWith({ clusters: { sonority: true, sibilantOnsetException: true } as never });
        expect(sonorityInClusters(word([['k', 'a'], ['s', 't', 'a']]), exception)).not.toBeNull();
    });

    it('never licenses a sibilant in a coda', () => {
        const exception = profileWith({ clusters: { sonority: true, sibilantOnsetException: true } as never });
        expect(sonorityInClusters(word([['a', 't', 's']]), exception)).not.toBeNull();
    });
});

// =============================================================================
// Cluster budget
// =============================================================================

describe('clusterBudget', () => {
    const budget = (max: number): WordGeneratorProfile => profileWith({ clusters: { maxPerWord: max } as never });

    it('counts a run of two adjacent consonants as one cluster', () => {
        expect(clusterBudget(word([['k', 'a', 'n'], ['t', 'a']]), budget(1))).toBeNull();
        expect(clusterBudget(word([['k', 'a', 'n'], ['t', 'a']]), budget(0))).not.toBeNull();
    });

    it('counts a run of three as ONE cluster, not two', () => {
        expect(clusterBudget(word([['s', 't', 'r', 'a']]), budget(1))).toBeNull();
    });

    it('counts two separated runs as two', () => {
        expect(clusterBudget(word([['k', 'a', 'n'], ['t', 'a', 'r'], ['t', 'a']]), budget(1))).not.toBeNull();
        expect(clusterBudget(word([['k', 'a', 'n'], ['t', 'a', 'r'], ['t', 'a']]), budget(2))).toBeNull();
    });

    it('is not fooled by a vowel-initial syllable — boundaries are flattened', () => {
        expect(clusterBudget(word([['a', 'n'], ['a']]), budget(0))).toBeNull();
    });

    it('reports how many it found', () => {
        const violation = clusterBudget(word([['s', 't', 'r', 'a']]), budget(0));
        expect(violation?.detail).toBe('1 of at most 0');
    });

    it('agrees with an independent count over the sound list', () => {
        const built = word([['s', 't', 'r', 'a', 'n'], ['k', 'l', 'o']]);
        const sounds = wordSounds(built);
        const runs = sounds
            .map((sound) => (isVocalic(sound) ? 'V' : 'C'))
            .join('')
            .split(/V+/)
            .filter((run) => run.length >= 2).length;
        expect(runs).toBe(2);
        expect(clusterBudget(built, budget(2))).toBeNull();
        expect(clusterBudget(built, budget(1))).not.toBeNull();
    });
});

// =============================================================================
// Harmony
// =============================================================================

describe('vowelHarmony', () => {
    const harmony = profileWith({ vowelHarmony: 'frontBack' });

    it('does nothing when harmony is off', () => {
        expect(vowelHarmony(word([['k', 'i'], ['t', 'o']]), profileWith({}))).toBeNull();
    });

    it('accepts a word whose vowels are all front', () => {
        expect(vowelHarmony(word([['k', 'i'], ['t', 'e']]), harmony)).toBeNull();
    });

    it('accepts a word whose vowels are all back', () => {
        expect(vowelHarmony(word([['k', 'u'], ['t', 'o']]), harmony)).toBeNull();
    });

    it('rejects a word that mixes front and back', () => {
        const violation = vowelHarmony(word([['k', 'i'], ['t', 'o']]), harmony);
        expect(violation?.rule).toBe('vowelHarmony');
        expect(violation?.detail).toBe('front then back');
    });

    it('lets a central vowel through on either side', () => {
        expect(vowelHarmony(word([['k', 'i'], ['t', 'ə']]), harmony)).toBeNull();
        expect(vowelHarmony(word([['k', 'u'], ['t', 'ə']]), harmony)).toBeNull();
        expect(vowelHarmony(word([['k', 'ə'], ['t', 'ə']]), harmony)).toBeNull();
    });

    it('counts a diphthong by its FIRST vowel', () => {
        expect(slotHarmony('ai')).toBe('front');
        expect(slotHarmony('ua')).toBe('back');
        // `ai` starts front, so a back vowel after it clashes...
        expect(vowelHarmony(word([['k', 'ai'], ['t', 'o']]), harmony)).not.toBeNull();
        // ...and a front one does not, even though `ai` ends on `i` either way.
        expect(vowelHarmony(word([['k', 'ai'], ['t', 'e']]), harmony)).toBeNull();
    });

    it('gives a consonant no harmony bucket at all', () => {
        expect(slotHarmony('k')).toBeNull();
        expect(slotHarmony('ə')).toBeNull();
    });

    it('is unaffected by length', () => {
        expect(vowelHarmony(word([['k', 'iː'], ['t', 'e']]), harmony)).toBeNull();
    });
});

// =============================================================================
// Inventory
// =============================================================================

describe('inventoryOnly', () => {
    it('accepts a word made of inventory sounds', () => {
        expect(inventoryOnly(word([['k', 'a'], ['t', 'a']]), profileWith({}), INVENTORY)).toBeNull();
    });

    it('rejects a sound the inventory does not have, and names it', () => {
        const violation = inventoryOnly(word([['q', 'a']]), profileWith({}), INVENTORY);
        expect(violation?.offenders).toEqual(['q']);
    });

    it('checks a diphthong slot sound by sound', () => {
        expect(inventoryOnly(word([['k', 'ai']]), profileWith({}), INVENTORY)).toBeNull();
        expect(inventoryOnly(word([['k', 'ay']]), profileWith({}), INVENTORY)).not.toBeNull();
    });

    it('accepts a long vowel whose short form is in the inventory', () => {
        expect(inventoryOnly(word([['k', 'aː']]), profileWith({}), INVENTORY)).toBeNull();
    });

    it('does not accept a short vowel that only exists long', () => {
        const onlyLong = deriveInventory(['k', 'aː'], cloneDefaultProfile());
        expect(inventoryOnly(word([['k', 'a']]), profileWith({}), onlyLong)).not.toBeNull();
    });
});

// =============================================================================
// The runner
// =============================================================================

describe('checkWord', () => {
    it('runs the six rules in the documented order', () => {
        expect(CONSTRAINT_RULES).toHaveLength(6);
        const names = CONSTRAINT_RULES.map((rule) => rule.name);
        expect(names).toEqual([
            'noForbiddenSequences', 'noIllegalGeminates', 'sonorityInClusters',
            'clusterBudget', 'vowelHarmony', 'inventoryOnly',
        ]);
    });

    it('returns null for a word that breaks nothing', () => {
        expect(checkWord(word([['k', 'a'], ['t', 'a']]), profileWith({}), INVENTORY)).toBeNull();
    });

    it('attributes a word to the FIRST rule it breaks', () => {
        // The word breaks the forbidden list AND doubles a consonant; the
        // shortfall report should send the user to the forbidden list, which
        // runs first.
        const profile = profileWith({ forbidden: ['tt'] });
        const violation = checkWord(word([['k', 'a', 't'], ['t', 'a']]), profile, INVENTORY);
        expect(violation?.rule).toBe('noForbiddenSequences');
    });
});

describe('explainViolation', () => {
    it('gives a sentence for every rule', () => {
        const cases = [
            checkWord(word([['k', 'a']]), profileWith({ forbidden: ['ka'] }), INVENTORY),
            checkWord(word([['a', 't'], ['t', 'a']]), profileWith({}), INVENTORY),
            checkWord(word([['l', 'p', 'a']]), profileWith({}), INVENTORY),
            checkWord(word([['a', 't', 'l']]), profileWith({}), INVENTORY),
            checkWord(word([['s', 't', 'r', 'a', 'n'], ['k', 'l', 'o']]), profileWith({ clusters: { sonority: false, maxPerWord: 0 } as never }), INVENTORY),
            checkWord(word([['k', 'i'], ['t', 'o']]), profileWith({ vowelHarmony: 'frontBack' }), INVENTORY),
            checkWord(word([['q', 'a']]), profileWith({}), INVENTORY),
        ];
        for (const violation of cases) {
            expect(violation).not.toBeNull();
            const message = explainViolation(violation!);
            expect(message.length).toBeGreaterThan(10);
            expect(message).not.toContain('undefined');
        }
    });

    it('names the offending sounds', () => {
        const violation = checkWord(word([['q', 'a']]), profileWith({}), INVENTORY);
        expect(explainViolation(violation!)).toContain('q');
    });
});
