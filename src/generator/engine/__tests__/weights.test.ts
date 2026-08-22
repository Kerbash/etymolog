/**
 * Frequency weights: the commonness ranking, the curve, and the tilt.
 *
 * The claims worth pinning are relative, not absolute — the exact number a
 * sound gets is an implementation detail, but "the commonest sound in an
 * inventory outweighs the rarest", "`flat` really is flat" and "`off` means off"
 * are the contract the UI describes to the user.
 *
 * Node environment.
 */

import { describe, expect, it } from 'vitest';
import { phonemeWeights, tiltFor, COMMONNESS_RANK } from '../weights';
import { describePhoneme, phonemeIdentity } from '../../phonology/features';
import { cloneDefaultProfile } from '../../profile/defaults';
import type { FrequencyTilt, WordGeneratorProfile } from '../../profile/types';

function profileWith(patch: Partial<WordGeneratorProfile>): WordGeneratorProfile {
    return { ...cloneDefaultProfile(), ...patch };
}

const INVENTORY = ['a', 'i', 'u', 'k', 't', 'p', 's', 'm', 'n', 'l', 'ʈ', 'ɢ'];

describe('COMMONNESS_RANK', () => {
    it('names only sounds the feature table can classify', () => {
        const unknown = COMMONNESS_RANK.filter((sound) => describePhoneme(sound) === null);
        expect(unknown).toEqual([]);
    });

    it('lists no sound twice, by identity', () => {
        const identities = COMMONNESS_RANK.map(phonemeIdentity);
        expect(new Set(identities).size).toBe(identities.length);
    });

    it('starts with the sounds almost every language has', () => {
        expect(COMMONNESS_RANK.slice(0, 5)).toEqual(['a', 'i', 'u', 'e', 'o']);
    });

    it('ranks the everyday consonants above the marginal ones', () => {
        const at = (sound: string): number => COMMONNESS_RANK.indexOf(sound);
        for (const [common, rare] of [['m', 'ʈ'], ['k', 'ɢ'], ['n', 'ɳ'], ['s', 'ʐ'], ['t', 'ɖ͡ʐ']]) {
            expect(at(common), `${common} vs ${rare}`).toBeLessThan(at(rare));
        }
    });

    it('covers every sound the seven presets ship, directly or through a base', () => {
        // Not a hard requirement of the algorithm (an unranked sound simply
        // sorts last) but a quality one: a preset whose whole inventory is
        // unranked would be ordered by nothing but the order it was typed in.
        const ranked = new Set(COMMONNESS_RANK.map((sound) => describePhoneme(sound)?.base));
        for (const sound of ['pʰ', 't͡sʰ', 'ʈ͡ʂ', 'kʼ', 'qʼ', 'ɕ', 'ɴ', 'ɸ', 'ɯ', 'ɤ', 'ɚ']) {
            expect(ranked.has(describePhoneme(sound)?.base), sound).toBe(true);
        }
    });
});

describe('phonemeWeights — the curve', () => {
    it('gives every usable member a positive weight', () => {
        const weights = phonemeWeights(INVENTORY, profileWith({}));
        expect(weights.size).toBe(INVENTORY.length);
        for (const [sound, weight] of weights) {
            expect(weight, sound).toBeGreaterThan(0);
        }
    });

    it('orders by commonness, not by input order', () => {
        const weights = phonemeWeights(['ɢ', 'ʈ', 'a', 'k'], profileWith({}));
        expect(weights.get('a')).toBeGreaterThan(weights.get('k') ?? 0);
        expect(weights.get('k')).toBeGreaterThan(weights.get('ʈ') ?? 0);
        expect(weights.get('ʈ')).toBeGreaterThan(weights.get('ɢ') ?? 0);
    });

    it('is steep under zipf: the top sound outweighs the bottom one many times over', () => {
        const weights = phonemeWeights(INVENTORY, profileWith({ frequencyCurve: 'zipf' }));
        const values = [...weights.values()];
        const top = Math.max(...values);
        const bottom = Math.min(...values);
        expect(top / bottom).toBeGreaterThan(2);
    });

    it('is uniform under flat: every sound within a whisker of every other', () => {
        const weights = phonemeWeights(INVENTORY, profileWith({ frequencyCurve: 'flat' }));
        const values = [...weights.values()];
        const top = Math.max(...values);
        const bottom = Math.min(...values);
        expect(top / bottom).toBeLessThan(1.2);
    });

    it('places a modified sound next to its plain counterpart, not at the bottom', () => {
        // The aspirating-flavour trap: `pʰ tʰ kʰ` are not in the ranking table,
        // and ranking them as unknown would bury a preset's whole stop series.
        const weights = phonemeWeights(['a', 'ʈ', 'pʰ', 'ɢ'], profileWith({}));
        expect(weights.get('pʰ')).toBeGreaterThan(weights.get('ʈ') ?? 0);
        expect(weights.get('pʰ')).toBeLessThan(weights.get('a') ?? 0);
    });

    it('puts an unrecognisable entry last, keeping the caller order between such entries', () => {
        const weights = phonemeWeights(['zzz', 'qqq', 'a'], profileWith({}));
        expect(weights.get('a')).toBeGreaterThan(weights.get('zzz') ?? 0);
        expect(weights.get('zzz')).toBeGreaterThan(weights.get('qqq') ?? 0);
    });

    it('is stable — the same inventory and profile give the same numbers', () => {
        const first = phonemeWeights(INVENTORY, profileWith({}));
        const second = phonemeWeights([...INVENTORY], profileWith({}));
        expect([...second.entries()]).toEqual([...first.entries()]);
    });

    it('handles a one-sound inventory and an empty one', () => {
        expect([...phonemeWeights(['a'], profileWith({})).values()][0]).toBeGreaterThan(0);
        expect(phonemeWeights([], profileWith({})).size).toBe(0);
    });

    it('drops empty strings and collapses repeats', () => {
        const weights = phonemeWeights(['a', 'a', '', 'k'], profileWith({}));
        expect([...weights.keys()]).toEqual(['a', 'k']);
    });
});

describe('phonemeWeights — the tilt', () => {
    it('multiplies a common sound and divides a rare one', () => {
        const plain = phonemeWeights(INVENTORY, profileWith({}));
        const tilted = phonemeWeights(INVENTORY, profileWith({ phonemeTilt: { k: 'common', s: 'rare' } }));
        expect(tilted.get('k')).toBeCloseTo((plain.get('k') ?? 0) * 3, 12);
        expect(tilted.get('s')).toBeCloseTo((plain.get('s') ?? 0) * 0.25, 12);
        expect(tilted.get('m')).toBeCloseTo(plain.get('m') ?? 0, 12);
    });

    it('leaves an off sound OUT of the map rather than weighting it zero', () => {
        const weights = phonemeWeights(INVENTORY, profileWith({ phonemeTilt: { s: 'off' } }));
        expect(weights.has('s')).toBe(false);
        expect(weights.size).toBe(INVENTORY.length - 1);
    });

    it('does not renumber the ranking when a sound is switched off', () => {
        // `off` removes a sound from the RESULT, not from the ordering: turning
        // one sound off must not reshuffle every other sound's weight.
        const plain = phonemeWeights(INVENTORY, profileWith({}));
        const withOff = phonemeWeights(INVENTORY, profileWith({ phonemeTilt: { s: 'off' } }));
        for (const [sound, weight] of withOff) {
            expect(weight, sound).toBeCloseTo(plain.get(sound) ?? 0, 12);
        }
    });

    it('applies a tilt written in a different but equivalent spelling', () => {
        const weights = phonemeWeights(['t͡ʃ', 'a'], profileWith({ phonemeTilt: { 'tʃ': 'off' } }));
        expect(weights.has('t͡ʃ')).toBe(false);
    });

    it('prefers an exact-string tilt over an identity match', () => {
        const weights = phonemeWeights(['t͡ʃ', 'a'], profileWith({
            phonemeTilt: { 't͡ʃ': 'common', 'tʃ': 'off' } as Record<string, FrequencyTilt>,
        }));
        expect(weights.has('t͡ʃ')).toBe(true);
    });

    it('ignores a junk tilt value and an inherited key', () => {
        const tilt = JSON.parse('{"k":"louder","__proto__":{"a":"off"}}') as Record<string, FrequencyTilt>;
        const weights = phonemeWeights(['a', 'k'], profileWith({ phonemeTilt: tilt }));
        expect(weights.has('a')).toBe(true);
        expect(weights.has('k')).toBe(true);
    });
});

describe('tiltFor', () => {
    it('answers normal for a sound nobody tilted', () => {
        expect(tiltFor('k', profileWith({}))).toBe('normal');
    });

    it('answers with the stored tilt, by spelling or by identity', () => {
        const profile = profileWith({ phonemeTilt: { k: 'common', 'tʃ': 'rare' } });
        expect(tiltFor('k', profile)).toBe('common');
        expect(tiltFor('t͡ʃ', profile)).toBe('rare');
    });

    it('agrees with what phonemeWeights did', () => {
        const profile = profileWith({ phonemeTilt: { s: 'off' } });
        expect(tiltFor('s', profile)).toBe('off');
        expect(phonemeWeights(['s'], profile).has('s')).toBe(false);
    });
});
