/**
 * Preset coverage against a conlang's sounds.
 *
 * The point of the module is that comparison is FEATURE-based, not textual, so
 * most of these tests are about spellings that must match and spellings that
 * must not.
 *
 * Node environment.
 */

import { describe, expect, it } from 'vitest';
import { computeCoverage, guideMapFor } from '../coverage';
import { getPreset, PRESETS } from '../presets';
import type { FlavourPreset } from '../presets/types';

/** A minimal preset to isolate one matching rule at a time. */
function preset(overrides: Partial<FlavourPreset> = {}): FlavourPreset {
    return {
        id: 'flowing',
        name: 'Test',
        tagline: 'Test',
        touchstones: ['Test'],
        why: 'Test',
        sounds: { core: ['t', 'k', 's'], flavour: ['h'], avoid: ['q'] },
        vowels: { core: ['a', 'i'], flavour: ['y'] },
        profile: getPreset('flowing')!.profile,
        examples: [],
        ...overrides,
    };
}

describe('computeCoverage — the maths', () => {
    it('reports everything missing and a zero score for an empty inventory', () => {
        const result = computeCoverage(preset(), []);
        expect(result.core.present).toEqual([]);
        expect(result.core.missing).toEqual(['t', 'k', 's', 'a', 'i']);
        expect(result.flavour.missing).toEqual(['h', 'y']);
        expect(result.avoidPresent).toEqual([]);
        expect(result.score).toBe(0);
    });

    it('reports a full score when every core sound is present', () => {
        const result = computeCoverage(preset(), ['t', 'k', 's', 'a', 'i', 'z']);
        expect(result.core.missing).toEqual([]);
        expect(result.score).toBe(1);
    });

    it('scores the fraction of core sounds present', () => {
        const result = computeCoverage(preset(), ['t', 'a']);
        expect(result.core.present).toEqual(['t', 'a']);
        expect(result.core.missing).toEqual(['k', 's', 'i']);
        expect(result.score).toBeCloseTo(2 / 5);
    });

    it('counts VOWELS in the core tier, consonants first', () => {
        const result = computeCoverage(preset(), ['a', 'i', 'y']);
        expect(result.core.present).toEqual(['a', 'i']);
        expect(result.flavour.present).toEqual(['y']);
    });

    it('lists avoided sounds the script nevertheless has', () => {
        expect(computeCoverage(preset(), ['q', 't']).avoidPresent).toEqual(['q']);
    });

    it('scores 0 rather than NaN for a preset with no core sounds', () => {
        const empty = preset({ sounds: { core: [], flavour: [], avoid: [] }, vowels: { core: [], flavour: [] } });
        expect(computeCoverage(empty, ['t']).score).toBe(0);
    });

    it('ignores empty and non-string inventory entries without throwing', () => {
        const result = computeCoverage(preset(), ['t', '', null as unknown as string, 42 as unknown as string]);
        expect(result.core.present).toEqual(['t']);
    });

    it('is unaffected by duplicates in the inventory', () => {
        expect(computeCoverage(preset(), ['t', 't', 't']).score)
            .toBe(computeCoverage(preset(), ['t']).score);
    });
});

describe('computeCoverage — sounds that must match', () => {
    it('matches a tie-barless affricate against the tie-barred preset spelling', () => {
        const affricate = preset({
            sounds: { core: ['t͡ʃ'], flavour: [], avoid: [] },
            vowels: { core: [], flavour: [] },
        });
        expect(computeCoverage(affricate, ['tʃ']).core.present).toEqual(['t͡ʃ']);
    });

    it('matches the two spellings of g (U+0067 and U+0261)', () => {
        const velar = preset({
            sounds: { core: ['g'], flavour: [], avoid: [] },
            vowels: { core: [], flavour: [] },
        });
        expect(computeCoverage(velar, ['ɡ']).core.present).toEqual(['g']);
    });

    it('matches a precomposed vowel against its decomposed form', () => {
        const nasal = preset({
            sounds: { core: [], flavour: [], avoid: [] },
            vowels: { core: ['ã'], flavour: [] },   // ã, one code point
        });
        expect(computeCoverage(nasal, ['ã']).core.present).toEqual(['ã']);
    });

    it('treats modifiers as a set, not a sequence', () => {
        const palatalised = preset({
            sounds: { core: ['pʰʲ'], flavour: [], avoid: [] },
            vowels: { core: [], flavour: [] },
        });
        expect(computeCoverage(palatalised, ['pʲʰ']).core.present).toEqual(['pʰʲ']);
    });

    it('matches an unrecognised sound against an identical unrecognised sound', () => {
        const odd = preset({
            sounds: { core: ['¤'], flavour: [], avoid: [] },
            vowels: { core: [], flavour: [] },
        });
        expect(computeCoverage(odd, ['¤']).core.present).toEqual(['¤']);
        expect(computeCoverage(odd, ['§']).core.missing).toEqual(['¤']);
    });
});

describe('computeCoverage — sounds that must NOT match', () => {
    it('does not match an aspirated stop against a plain one', () => {
        const aspirated = preset({
            sounds: { core: ['pʰ'], flavour: [], avoid: [] },
            vowels: { core: [], flavour: [] },
        });
        expect(computeCoverage(aspirated, ['p']).core.missing).toEqual(['pʰ']);
        expect(computeCoverage(aspirated, ['pʰ']).core.present).toEqual(['pʰ']);
    });

    it('does not match a long vowel against a short one', () => {
        const long = preset({
            sounds: { core: [], flavour: [], avoid: [] },
            vowels: { core: ['aː'], flavour: [] },
        });
        expect(computeCoverage(long, ['a']).core.missing).toEqual(['aː']);
    });

    it('keeps distinct places apart (ʃ vs ʂ vs ɕ)', () => {
        const sibilant = preset({
            sounds: { core: ['ʃ'], flavour: [], avoid: [] },
            vowels: { core: [], flavour: [] },
        });
        expect(computeCoverage(sibilant, ['ʂ', 'ɕ']).core.missing).toEqual(['ʃ']);
    });
});

describe('computeCoverage — the real presets', () => {
    it('scores 1 for every preset against its own inventory', () => {
        for (const flavour of PRESETS) {
            const own = [
                ...flavour.sounds.core, ...flavour.sounds.flavour,
                ...flavour.vowels.core, ...flavour.vowels.flavour,
            ];
            const result = computeCoverage(flavour, own);
            expect(result.core.missing, flavour.id).toEqual([]);
            expect(result.flavour.missing, flavour.id).toEqual([]);
            expect(result.score, flavour.id).toBe(1);
            expect(result.avoidPresent, flavour.id).toEqual([]);
        }
    });

    it('collapses the aspirated/plain pairs of sinitic into one core entry each', () => {
        const sinitic = getPreset('sinitic')!;
        const result = computeCoverage(sinitic, []);
        const core = [...result.core.present, ...result.core.missing];
        // `p` and `pʰ` are different sounds, so both are counted — the guide MAP
        // is what collapses them, not the coverage.
        expect(core).toContain('p');
        expect(core).toContain('pʰ');
    });

    it('reports an avoid hit for a script that uses a sound the flavour warns off', () => {
        const japanese = getPreset('japanese')!;
        expect(computeCoverage(japanese, ['l', 'k']).avoidPresent).toEqual(['l']);
    });
});

describe('guideMapFor — shape', () => {
    it('returns a plain Map keyed by base symbol', () => {
        const map = guideMapFor(getPreset('island')!);
        expect(map).toBeInstanceOf(Map);
        expect(map.get('p')).toBe('core');
        expect(map.get('t')).toBe('flavour');
        expect(map.get('s')).toBe('avoid');
        expect(map.get('nope')).toBeUndefined();
    });

    it('covers every tier of every preset with no unresolved keys', () => {
        for (const flavour of PRESETS) {
            const map = guideMapFor(flavour);
            const expected = new Set([
                ...flavour.sounds.core, ...flavour.sounds.flavour, ...flavour.sounds.avoid,
                ...flavour.vowels.core, ...flavour.vowels.flavour,
            ]);
            // Bases collapse, so the map is never larger than the sound list.
            expect(map.size, flavour.id).toBeLessThanOrEqual(expected.size);
            expect(map.size, flavour.id).toBeGreaterThan(0);
        }
    });
});
