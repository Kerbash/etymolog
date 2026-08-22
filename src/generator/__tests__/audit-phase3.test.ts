/**
 * Phase 3 audit — an ADVERSARIAL second opinion on the generation engine.
 *
 * The engine's own suites test it against its own rule functions. That proves
 * the pieces agree with each other, not that either is right, so almost nothing
 * here calls a rule function to judge a word: the constraint checks below
 * re-derive geminates, cluster runs, sonority, harmony and inventory membership
 * from the OUTPUT string with independent code, and only compare the verdicts
 * where a verdict is the thing under test.
 *
 * The rest pins contracts that are easy to break by accident and impossible to
 * notice: the attempt cap, the shortfall reasons for each way an inventory can
 * be unusable, the exact tilt multipliers, the length licence, and the handful
 * of behaviours that are debatable but SHIPPED — a vowel-less word out of an
 * all-optional shape, an intervocalic cluster no sonority rule looks at, an
 * unchecked syllable junction. Those are pinned so that changing them is a
 * decision rather than a regression.
 *
 * Node environment.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { generateWords, ATTEMPTS_PER_WORD } from '../engine/generate';
import { phonemeWeights, tiltFor, COMMONNESS_RANK } from '../engine/weights';
import { normalizePronunciation } from '../engine/normalize';
import { buildSyllable, checkWord, noForbiddenSequences } from '../engine/constraints';
import { createRng } from '../engine/random';
import { deriveInventory, inventoryHas } from '../inventory';
import { cloneDefaultProfile, LIMITS } from '../profile/defaults';
import { PRESETS, applyPreset, presetInventory } from '../presets';
import { describePhoneme, phonemeIdentity } from '../phonology/features';
import { classOf, CLASS_LETTERS } from '../phonology/classes';
import { splitPhonemeString } from '../phonology/tokenize';
import { isValidCoda, isValidOnset, sonorityOf } from '../phonology/sonority';
import type { ClassifiedInventory } from '../inventory';
import type { GeneratedBatch } from '../engine/generate';
import type { WordGeneratorProfile } from '../profile/types';

// =============================================================================
// INDEPENDENT HELPERS — deliberately NOT the engine's own
// =============================================================================

/** A profile with the named fields overridden, cloned so nothing is shared. */
function profileWith(overrides: Partial<WordGeneratorProfile>): WordGeneratorProfile {
    return { ...cloneDefaultProfile(), ...structuredClone(overrides) } as WordGeneratorProfile;
}

/** My own re-tokenisation of a generated word, from the syllable array. */
function soundsOfWord(syllables: readonly string[]): string[] {
    const out: string[] = [];
    for (const syllable of syllables) {
        for (const token of splitPhonemeString(syllable)) out.push(token.text);
    }
    return out;
}

function isConsonantSound(sound: string): boolean {
    return describePhoneme(sound)?.kind !== 'vowel';
}

/** Runs of two or more adjacent consonants, my own counter. */
function clusterRuns(sounds: readonly string[]): string[][] {
    const runs: string[][] = [];
    let current: string[] = [];
    for (const sound of sounds) {
        if (isConsonantSound(sound)) {
            current.push(sound);
            continue;
        }
        if (current.length >= 2) runs.push(current);
        current = [];
    }
    if (current.length >= 2) runs.push(current);
    return runs;
}

/** My own onset / coda split of one syllable string. */
function splitSyllable(syllable: string): { onset: string[]; coda: string[] } {
    const sounds = splitPhonemeString(syllable).map((token) => token.text);
    let first = -1;
    let last = -1;
    sounds.forEach((sound, index) => {
        if (isConsonantSound(sound)) return;
        if (first === -1) first = index;
        last = index;
    });
    if (first === -1) return { onset: sounds, coda: [] };
    return { onset: sounds.slice(0, first), coda: sounds.slice(last + 1) };
}

/** front / back / neutral, my own reading of the vowel chart. */
function bucketOf(sound: string): 'front' | 'back' | null {
    const features = describePhoneme(sound);
    if (features?.kind !== 'vowel') return null;
    if (features.backness === 'front') return 'front';
    if (features.backness === 'back') return 'back';
    return null;
}

const LENGTH = 'ː';

function batchFor(preset: (typeof PRESETS)[number], count: number, seed: number): {
    profile: WordGeneratorProfile;
    inventory: ClassifiedInventory;
    batch: GeneratedBatch;
} {
    const profile = applyPreset(preset, cloneDefaultProfile());
    const inventory = deriveInventory(presetInventory(preset), profile);
    return { profile, inventory, batch: generateWords(profile, inventory, { count, seed }) };
}

function deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value as object)) {
            deepFreeze((value as Record<string, unknown>)[key]);
        }
    }
    return value;
}

// =============================================================================
// 1. DETERMINISM AND PURITY
// =============================================================================

describe('determinism and purity', () => {
    const profile = applyPreset(PRESETS[6], cloneDefaultProfile());
    const inventory = deriveInventory(presetInventory(PRESETS[6]), profile);

    it('is byte-identical for the same seed, down to syllables, warnings and rejection counts', () => {
        const first = generateWords(profile, inventory, { count: 40, seed: 1234, existing: ['ka', 'ˈto.ma'] });
        const second = generateWords(profile, inventory, { count: 40, seed: 1234, existing: ['ka', 'ˈto.ma'] });
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
        expect(second.words.map((word) => word.syllables)).toEqual(first.words.map((word) => word.syllables));
    });

    it('gives a different batch for a different seed', () => {
        const a = generateWords(profile, inventory, { count: 20, seed: 1 });
        const b = generateWords(profile, inventory, { count: 20, seed: 2 });
        expect(b.words.map((word) => word.ipa)).not.toEqual(a.words.map((word) => word.ipa));
    });

    it('does not depend on the iteration order of `existing`', () => {
        const forward = new Map([['ka', 1], ['ti', 2], ['no', 3]]);
        const backward = new Map([['no', 3], ['ti', 2], ['ka', 1]]);
        const a = generateWords(profile, inventory, { count: 25, seed: 8, existing: forward.keys() });
        const b = generateWords(profile, inventory, { count: 25, seed: 8, existing: backward.keys() });
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    });

    it('mutates neither the profile, the inventory nor `existing`', () => {
        const frozenProfile = deepFreeze(structuredClone(profile));
        const frozenInventory = deepFreeze(deriveInventory(presetInventory(PRESETS[6]), profile));
        const frozenExisting = deepFreeze(['ka', 'to']);
        const before = JSON.stringify({ profile: frozenProfile, existing: frozenExisting });
        expect(() => generateWords(frozenProfile, frozenInventory, {
            count: 30, seed: 55, existing: frozenExisting,
        })).not.toThrow();
        expect(JSON.stringify({ profile: frozenProfile, existing: frozenExisting })).toBe(before);
    });

    it('produces the same words frozen as unfrozen', () => {
        const frozen = generateWords(
            deepFreeze(structuredClone(profile)),
            deepFreeze(deriveInventory(presetInventory(PRESETS[6]), profile)),
            { count: 15, seed: 77 },
        );
        const plain = generateWords(profile, inventory, { count: 15, seed: 77 });
        expect(frozen.words.map((word) => word.ipa)).toEqual(plain.words.map((word) => word.ipa));
    });

    it('names the platform random source exactly once in the whole engine', () => {
        const dir = join(__dirname, '..', 'engine');
        const hits: string[] = [];
        for (const file of readdirSync(dir)) {
            if (!file.endsWith('.ts')) continue;
            const source = readFileSync(join(dir, file), 'utf8');
            for (const match of source.matchAll(/Math\.random|Date\.now/g)) hits.push(`${file}:${match[0]}`);
        }
        // One `Date.now()` and one `Math.random()`, both inside `randomSeed`.
        expect(hits.sort()).toEqual(['random.ts:Date.now', 'random.ts:Math.random']);
    });

    it('coerces the seed to a 32-bit integer and reports the coerced value', () => {
        const negative = generateWords(profile, inventory, { count: 5, seed: -1 });
        const wrapped = generateWords(profile, inventory, { count: 5, seed: 0xffffffff });
        expect(negative.seed).toBe(0xffffffff);
        expect(negative.words.map((word) => word.ipa)).toEqual(wrapped.words.map((word) => word.ipa));
        expect(generateWords(profile, inventory, { count: 5, seed: 1.9 }).words)
            .toEqual(generateWords(profile, inventory, { count: 5, seed: 1 }).words);
    });

    it('gives visibly different streams for neighbouring seeds', () => {
        const a = Array.from({ length: 5 }, createRng(1000));
        const b = Array.from({ length: 5 }, createRng(1001));
        expect(a).not.toEqual(b);
        expect(a.every((value) => value >= 0 && value < 1)).toBe(true);
    });
});

// =============================================================================
// 2. TERMINATION AND BOUNDS
// =============================================================================

describe('termination and bounds', () => {
    const base = cloneDefaultProfile();
    const inventory = deriveInventory(['k', 't', 'n', 'a', 'i', 'o'], base);

    it('treats a count of zero as an empty batch with no shortfall', () => {
        const batch = generateWords(base, inventory, { count: 0, seed: 1 });
        expect(batch.words).toEqual([]);
        expect(batch.requested).toBe(0);
        expect(batch.shortfall).toBeUndefined();
    });

    it('clamps a negative or non-finite count to zero rather than looping', () => {
        for (const count of [-5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
            const batch = generateWords(base, inventory, { count, seed: 1 });
            expect(batch.words, String(count)).toEqual([]);
            expect(batch.requested, String(count)).toBe(0);
        }
    });

    it('floors a fractional count', () => {
        expect(generateWords(base, inventory, { count: 3.9, seed: 1 }).words).toHaveLength(3);
    });

    it('honours a count above MAX_BATCH — the cap is the page\'s job, not the engine\'s', () => {
        const batch = generateWords(base, inventory, { count: LIMITS.MAX_BATCH + 250, seed: 1 });
        expect(batch.words.length).toBe(LIMITS.MAX_BATCH + 250);
    });

    it('never builds more than count x ATTEMPTS_PER_WORD candidates', () => {
        // One vowel, one syllable, and the only word it can make already exists:
        // every attempt is a duplicate, so the cap is what stops the loop.
        const profile = profileWith({
            syllables: [{ pattern: 'V', weight: 1 }],
            syllableCount: { min: 1, max: 1 },
        });
        const oneVowel = deriveInventory(['a'], profile);
        const batch = generateWords(profile, oneVowel, { count: 3, seed: 1, existing: ['a'] });
        expect(batch.words).toEqual([]);
        expect(batch.shortfall?.reason).toBe('exhausted');
        expect(batch.shortfall?.attempts).toBe(3 * ATTEMPTS_PER_WORD);
        expect(batch.shortfall?.rejected).toEqual({ duplicate: 3 * ATTEMPTS_PER_WORD });
    });

    it('reports `empty-inventory` for an empty list', () => {
        const batch = generateWords(base, deriveInventory([], base), { count: 5, seed: 1 });
        expect(batch.shortfall?.reason).toBe('empty-inventory');
        expect(batch.shortfall?.attempts).toBe(0);
    });

    it('reports `empty-inventory` — not `no-vowels` — when every sound is switched off', () => {
        const profile = profileWith({ phonemeTilt: { a: 'off', k: 'off' } });
        const inv = deriveInventory(['a', 'k'], profile);
        const batch = generateWords(profile, inv, { count: 5, seed: 1 });
        expect(batch.shortfall?.reason).toBe('empty-inventory');
        expect(batch.warnings.join(' ')).toContain('switched off');
        // The members survive for the UI even though the engine cannot use them.
        expect(inv.members).toHaveLength(2);
    });

    it('reports `no-vowels` for a consonant-only inventory', () => {
        expect(generateWords(base, deriveInventory(['k', 't'], base), { count: 5, seed: 1 }).shortfall?.reason)
            .toBe('no-vowels');
    });

    it('reports `no-consonants` when a vowel-only inventory prunes every shape', () => {
        const profile = profileWith({ syllables: [{ pattern: 'CV', weight: 1 }] });
        const batch = generateWords(profile, deriveInventory(['a', 'i'], profile), { count: 5, seed: 1 });
        expect(batch.shortfall?.reason).toBe('no-consonants');
        expect(batch.warnings.join(' ')).toContain('skipped');
    });

    it('PINNED: every shape pruned while consonants exist still reports `exhausted`, with zero attempts', () => {
        // Debatable and reported: nothing was attempted, so "exhausted" is not
        // literally true — but the reason enum has no `no-shapes` member and the
        // warning carries the actual explanation. Pinned so a change is deliberate.
        const profile = profileWith({ syllables: [{ pattern: 'SV', weight: 1 }] });
        const batch = generateWords(profile, deriveInventory(['k', 'a'], profile), { count: 4, seed: 1 });
        expect(batch.shortfall).toEqual({ reason: 'exhausted', attempts: 0, rejected: {} });
        expect(batch.warnings.join(' ')).toContain('sibilants');
    });

    it('explains a shape that cannot fit the cluster budget through the rejection counts', () => {
        const profile = profileWith({
            syllables: [{ pattern: 'CCV', weight: 1 }],
            clusters: { sonority: true, sibilantOnsetException: false, allowGeminates: false, maxPerWord: 0 },
        });
        const batch = generateWords(profile, deriveInventory(['p', 'l', 'k', 'r', 'a'], profile), { count: 5, seed: 3 });
        expect(batch.words).toEqual([]);
        expect(batch.shortfall?.reason).toBe('exhausted');
        expect(Object.keys(batch.shortfall?.rejected ?? {})).toContain('clusterBudget');
    });

    it('counts an unfillable slot under the non-rule key `emptySlot`', () => {
        // Harmony empties a pool that was NOT empty at build time: the literal
        // group is a single back vowel, so every attempt whose first vowel came
        // out front has nothing left to fill it with.
        const profile = profileWith({
            vowelHarmony: 'frontBack',
            syllables: [{ pattern: 'V[u]', weight: 1 }],
            syllableCount: { min: 1, max: 1 },
        });
        const batch = generateWords(profile, deriveInventory(['a', 'u'], profile), { count: 40, seed: 1 });
        expect(Object.keys(batch.shortfall?.rejected ?? {})).toContain('emptySlot');
        // `emptySlot` and `duplicate` are documented as NOT being rule names.
        for (const word of batch.words) expect(word.ipa).toBe('uu');
    });

    it('terminates on a very large batch instead of running away', () => {
        const { profile, inventory } = batchFor(PRESETS[0], 1, 1);
        const started = Date.now();
        const batch = generateWords(profile, inventory, { count: 5000, seed: 9 });
        expect(batch.words).toHaveLength(5000);
        expect(Date.now() - started).toBeLessThan(3000);
    });
});

// =============================================================================
// 3. CONSTRAINT CORRECTNESS — independent re-checks over every preset
// =============================================================================

describe('seven presets x 300 words, re-checked independently', () => {
    /** One 300-word batch per preset, built once and shared by the checks below. */
    const runs = PRESETS.map((preset) => ({ preset, ...batchFor(preset, 300, 4242) }));

    it('fills every batch and builds every word out of the inventory, long vowels licensed', () => {
        for (const { preset, profile, inventory, batch } of runs) {
            const allowed = new Set(inventory.members.map((member) => phonemeIdentity(member.phoneme)));
            expect(batch.words, preset.id).toHaveLength(300);
            expect(batch.warnings, preset.id).toEqual([]);
            for (const word of batch.words) {
                expect(word.syllables.join('')).toBe(word.ipa);
                for (const sound of soundsOfWord(word.syllables)) {
                    const short = sound.split(LENGTH).join('');
                    const known = allowed.has(phonemeIdentity(sound)) || allowed.has(phonemeIdentity(short));
                    expect(known, `${preset.id}: ${word.ipa} / ${sound}`).toBe(true);
                    if (sound.includes(LENGTH)) {
                        expect(describePhoneme(sound)?.kind, `${preset.id}: ${word.ipa}`).toBe('vowel');
                        expect(profile.longVowelChance, `${preset.id} lengthened with chance 0`).toBeGreaterThan(0);
                    }
                }
            }
        }
    });

    it('respects geminates and the cluster budget', () => {
        for (const { preset, profile, batch } of runs) {
            for (const word of batch.words) {
                const sounds = soundsOfWord(word.syllables);
                if (!profile.clusters.allowGeminates) {
                    for (let i = 1; i < sounds.length; i += 1) {
                        if (!isConsonantSound(sounds[i]) || !isConsonantSound(sounds[i - 1])) continue;
                        expect(
                            phonemeIdentity(sounds[i]) === phonemeIdentity(sounds[i - 1]),
                            `${preset.id}: geminate in ${word.ipa}`,
                        ).toBe(false);
                    }
                }
                expect(clusterRuns(sounds).length, `${preset.id}: ${word.ipa}`)
                    .toBeLessThanOrEqual(profile.clusters.maxPerWord);
            }
        }
    });

    it('keeps sonority inside every onset and coda, with the sibilant licence anchored word-initially', () => {
        for (const { preset, profile, batch } of runs) {
            if (!profile.clusters.sonority) continue;
            for (const word of batch.words) {
                word.syllables.forEach((syllable, index) => {
                    const { onset, coda } = splitSyllable(syllable);
                    const sibilant = profile.clusters.sibilantOnsetException && index === 0;
                    expect(isValidOnset(onset, { allowSibilantOnset: sibilant }), `${preset.id}: onset of ${word.ipa}`).toBe(true);
                    expect(isValidCoda(coda), `${preset.id}: coda of ${word.ipa}`).toBe(true);
                });
            }
        }
    });

    it('never emits a sound tilted `off`, and every sound it emits classifies', () => {
        for (const { preset, inventory, batch } of runs) {
            const off = new Set(
                inventory.members.filter((member) => member.tilt === 'off').map((member) => phonemeIdentity(member.phoneme)),
            );
            for (const word of batch.words) {
                for (const sound of soundsOfWord(word.syllables)) {
                    expect(describePhoneme(sound), `${preset.id}: ${word.ipa} / ${sound}`).not.toBeNull();
                    expect(off.has(phonemeIdentity(sound)), `${preset.id}: ${word.ipa}`).toBe(false);
                }
            }
        }
    });

    it('emits no duplicate inside a batch', () => {
        for (const { preset, batch } of runs) {
            const keys = batch.words.map((word) => normalizePronunciation(word.ipa));
            expect(new Set(keys).size, preset.id).toBe(keys.length);
            expect(batch.words.map((word) => word.seedIndex)).toEqual(batch.words.map((_word, index) => index));
        }
    });
});

describe('constraints the presets do not exercise', () => {
    it('keeps front and back vowels apart while letting a central vowel through', () => {
        const profile = profileWith({
            vowelHarmony: 'frontBack',
            syllables: [{ pattern: 'CV', weight: 1 }],
            syllableCount: { min: 3, max: 3 },
        });
        const inventory = deriveInventory(['k', 't', 'n', 'm', 'i', 'e', 'y', 'a', 'o', 'u', 'ə'], profile);
        const batch = generateWords(profile, inventory, { count: 120, seed: 42 });
        expect(batch.words.length).toBeGreaterThan(50);

        let sawNeutral = false;
        for (const word of batch.words) {
            const buckets = soundsOfWord(word.syllables).map(bucketOf).filter((bucket) => bucket !== null);
            expect(new Set(buckets).size, `${word.ipa}`).toBeLessThanOrEqual(1);
            if (soundsOfWord(word.syllables).some((sound) => sound === 'ə')) sawNeutral = true;
        }
        expect(sawNeutral, 'the neutral vowel never appeared, so the test proves nothing').toBe(true);
    });

    it('applies the sibilant onset licence only to the first syllable', () => {
        const profile = profileWith({
            syllables: [{ pattern: 'SPV', weight: 1 }],
            syllableCount: { min: 2, max: 2 },
            clusters: { sonority: true, sibilantOnsetException: true, allowGeminates: false, maxPerWord: 4 },
        });
        const batch = generateWords(profile, deriveInventory(['s', 'p', 't', 'k', 'a'], profile), { count: 5, seed: 2 });
        // The second syllable's onset is also `s`+stop, and the licence does not
        // reach it — so nothing can be generated at all.
        expect(batch.words).toEqual([]);
        expect(Object.keys(batch.shortfall?.rejected ?? {})).toContain('sonorityInClusters');
    });

    it('respects a forbidden sequence that straddles a syllable boundary', () => {
        const profile = profileWith({
            syllables: [{ pattern: 'CV', weight: 1 }],
            syllableCount: { min: 2, max: 3 },
            forbidden: ['at'],
        });
        const batch = generateWords(profile, deriveInventory(['k', 't', 'a', 'i'], profile), { count: 30, seed: 6 });
        expect(batch.words.length).toBeGreaterThan(5);
        for (const word of batch.words) expect(word.ipa).not.toContain('at');
    });

    it('PINNED: a long vowel does not match a forbidden sequence written short', () => {
        const word = [buildSyllable(['k', 'aː']), buildSyllable(['i'])];
        // `aː` is a different vowel from `a`, so `ai` does not describe `aːi`.
        expect(noForbiddenSequences(word, profileWith({ forbidden: ['ai'] }))).toBeNull();
        expect(noForbiddenSequences(word, profileWith({ forbidden: ['aːi'] }))?.rule).toBe('noForbiddenSequences');
    });

    it('normalises both sides of a forbidden comparison', () => {
        const word = [buildSyllable(['g', 'a'])];
        // The single-storey `ɡ` a user pastes, and stress/dot punctuation they type.
        expect(noForbiddenSequences(word, profileWith({ forbidden: ['ɡa'] }))?.detail).toBe('ɡa');
        expect(noForbiddenSequences(word, profileWith({ forbidden: ['ˈg.a'] }))?.rule).toBe('noForbiddenSequences');
        expect(noForbiddenSequences(word, profileWith({ forbidden: ['.'] }))).toBeNull();
        expect(noForbiddenSequences(word, profileWith({ forbidden: [''] }))).toBeNull();
    });

    it('treats a negative cluster budget as zero rather than rejecting every word', () => {
        // The validator holds `maxPerWord` to 0..4; a profile that skipped it must
        // still generate open syllables instead of failing on a budget of -1.
        const profile = profileWith({
            syllables: [{ pattern: 'CV', weight: 1 }],
            clusters: { sonority: true, sibilantOnsetException: false, allowGeminates: false, maxPerWord: -1 },
        });
        const batch = generateWords(profile, deriveInventory(['k', 't', 'a'], profile), { count: 6, seed: 1 });
        expect(batch.words.length).toBe(6);
    });
});

// =============================================================================
// 4. WEIGHTS
// =============================================================================

describe('weights', () => {
    const base = cloneDefaultProfile();

    it('ranks the commonness list without duplicate identities', () => {
        expect(new Set(COMMONNESS_RANK.map(phonemeIdentity)).size).toBe(COMMONNESS_RANK.length);
    });

    it('falls monotonically with commonness rank under zipf', () => {
        const weights = phonemeWeights(['ʁ', 'a', 'k', 'i', 'ɳ'], base);
        const ordered = ['a', 'i', 'k', 'ʁ', 'ɳ'].map((sound) => weights.get(sound) ?? 0);
        for (let i = 1; i < ordered.length; i += 1) expect(ordered[i]).toBeLessThan(ordered[i - 1]);
        expect(ordered[ordered.length - 1]).toBeGreaterThan(0);
    });

    it('gives a lone member a positive weight under both curves', () => {
        expect(phonemeWeights(['a'], base).get('a')).toBeCloseTo(Math.log(2), 12);
        expect(phonemeWeights(['a'], { ...base, frequencyCurve: 'flat' }).get('a')).toBe(1);
    });

    it('is exactly uniform under `flat`', () => {
        const weights = [...phonemeWeights(['ʁ', 'a', 'k', 'i'], { ...base, frequencyCurve: 'flat' }).values()];
        expect(weights).toEqual([0.25, 0.25, 0.25, 0.25]);
    });

    it('multiplies by exactly 3 / 1 / 0.25 and drops `off` entirely', () => {
        const plain = phonemeWeights(['a', 'i', 'u', 'e'], base);
        const tilted = phonemeWeights(['a', 'i', 'u', 'e'], {
            ...base, phonemeTilt: { a: 'common', i: 'rare', u: 'off', e: 'normal' },
        } as WordGeneratorProfile);
        expect(tilted.get('a')).toBeCloseTo((plain.get('a') ?? 0) * 3, 12);
        expect(tilted.get('i')).toBeCloseTo((plain.get('i') ?? 0) * 0.25, 12);
        expect(tilted.get('e')).toBeCloseTo(plain.get('e') ?? 0, 12);
        expect(tilted.has('u')).toBe(false);
        // The curve is computed over the full list, so switching one sound off
        // does not renumber the ranks of the others.
        expect(tilted.get('e')).toBe(plain.get('e'));
    });

    it('slots a modified sound immediately after its base, not into the tail', () => {
        const weights = [...phonemeWeights(['pʰ', 'p', 'm'], base).keys()];
        expect(weights).toEqual(['m', 'p', 'pʰ']);
    });

    it('keeps unranked sounds in input order behind everything ranked', () => {
        const order = [...phonemeWeights(['ʘ', 'ǀ', 'k'], base).keys()];
        expect(order[0]).toBe('k');
        expect(order.slice(1)).toEqual(['ʘ', 'ǀ']);
    });

    it('matches a tilt written with the other spelling of the same sound', () => {
        const profile = { ...base, phonemeTilt: { 't͡ʃ': 'rare' } } as WordGeneratorProfile;
        expect(tiltFor('tʃ', profile)).toBe('rare');
        expect(tiltFor('t', profile)).toBe('normal');
    });

    it('cannot be fooled by an inherited `phonemeTilt` key', () => {
        const profile = { ...base, phonemeTilt: {} } as WordGeneratorProfile;
        expect(tiltFor('constructor', profile)).toBe('normal');
        expect(tiltFor('toString', profile)).toBe('normal');
    });
});

// =============================================================================
// 5. INVENTORY
// =============================================================================

describe('inventory', () => {
    const base = cloneDefaultProfile();

    it('deduplicates by identity and keeps the FIRST spelling', () => {
        const first = deriveInventory(['ɡ', 'g', 'tʃ', 't͡ʃ', 'a'], base);
        expect(first.members.map((member) => member.phoneme)).toEqual(['ɡ', 'tʃ', 'a']);
        const other = deriveInventory(['g', 'ɡ'], base);
        expect(other.members.map((member) => member.phoneme)).toEqual(['g']);
    });

    it('classifies a tie-bar-less affricate as ONE affricate member', () => {
        const inventory = deriveInventory(['tʃ'], base);
        expect(inventory.members).toHaveLength(1);
        expect(inventory.members[0].features.kind).toBe('consonant');
        expect(inventory.members[0].classes).toEqual(['C', 'P', 'S', 'O']);
    });

    it('sets unrecognised entries aside, deduplicated, and never in `members`', () => {
        const inventory = deriveInventory(['a', 'zzz', '£', 'zzz', ''], base);
        expect(inventory.unknown).toEqual(['zzz', '£']);
        expect(inventory.members.map((member) => member.phoneme)).toEqual(['a']);
    });

    it('surfaces unknown entries as a batch warning without failing the batch', () => {
        const profile = profileWith({ syllables: [{ pattern: 'CV', weight: 1 }] });
        const inventory = deriveInventory(['k', 't', 'n', 'a', 'i', 'zzz'], profile);
        const batch = generateWords(profile, inventory, { count: 5, seed: 1 });
        expect(batch.warnings.join(' ')).toContain('zzz');
        expect(batch.words).toHaveLength(5);
        expect(batch.words.every((word) => !word.ipa.includes('zzz'))).toBe(true);
    });

    it('keys every class letter and agrees with `classOf` for every member', () => {
        const inventory = deriveInventory(['k', 'a', 's', 'n', 'l', 'j', 'ɸ', 't͡ʃ', 'ʔ'], base);
        expect([...inventory.byClass.keys()]).toEqual([...CLASS_LETTERS]);
        for (const letter of CLASS_LETTERS) {
            const listed = inventory.byClass.get(letter) ?? [];
            const expected = inventory.members
                .filter((member) => classOf(member.features).includes(letter))
                .map((member) => member.phoneme);
            expect(listed, letter).toEqual(expected);
        }
    });

    it('lists `off` members in `byClass` too — that map is the picture, not the pool', () => {
        const profile = profileWith({ phonemeTilt: { k: 'off' } });
        const inventory = deriveInventory(['k', 't', 'a'], profile);
        expect(inventory.byClass.get('C')).toEqual(['k', 't']);
        expect(inventory.members.map((member) => member.tilt)).toEqual(['off', 'normal', 'normal']);
    });

    it('distinguishes "no script to compare against" from "your script lacks it"', () => {
        expect(deriveInventory(['k'], base).members[0].inConlang).toBeUndefined();
        expect(deriveInventory(['k'], base, { conlangPhonemes: [] }).members[0].inConlang).toBe(false);
        expect(deriveInventory(['k'], base, { conlangPhonemes: ['k'] }).members[0].inConlang).toBe(true);
        // Compared by identity, not by string.
        expect(deriveInventory(['t͡ʃ'], base, { conlangPhonemes: ['tʃ'] }).members[0].inConlang).toBe(true);
    });

    it('grants the length licence one way only', () => {
        const short = deriveInventory(['a', 'k'], base);
        expect(inventoryHas(short, 'aː')).toBe(true);
        expect(inventoryHas(short, 'a')).toBe(true);
        expect(inventoryHas(short, 'i')).toBe(false);
        expect(inventoryHas(deriveInventory(['aː'], base), 'a')).toBe(false);
    });

    it('PINNED: an inventory is immutable once used — the identity cache is not invalidated', () => {
        const inventory = deriveInventory(['a'], base);
        expect(inventoryHas(inventory, 'i')).toBe(false);
        inventory.members.push(...deriveInventory(['i'], base).members);
        // Documented contract: rebuild the inventory rather than editing it.
        expect(inventoryHas(inventory, 'i')).toBe(false);
    });
});

// =============================================================================
// 6. PRESET EXAMPLES
// =============================================================================

describe('preset examples', () => {
    it('regenerates every preset\'s pasted examples, and each one obeys its own profile', () => {
        for (const preset of PRESETS) {
            const profile = applyPreset(preset, cloneDefaultProfile());
            const inventory = deriveInventory(presetInventory(preset), profile);
            const batch = generateWords(profile, inventory, { count: 6, seed: 1 });
            expect(batch.words.map((word) => word.ipa), preset.id).toEqual(preset.examples);
            expect(batch.warnings, preset.id).toEqual([]);
            for (const word of batch.words) {
                // Re-syllabified from the STRING, so the check runs on the word a
                // user would paste back in rather than on the engine's own object.
                const syllables = word.syllables.map((syllable) => buildSyllable(
                    splitPhonemeString(syllable).map((token) => token.text),
                ));
                expect(checkWord(syllables, profile, inventory), `${preset.id}: ${word.ipa}`).toBeNull();
            }
        }
    });

    it('every example survives an independent onset/coda sonority read', () => {
        for (const preset of PRESETS) {
            const profile = applyPreset(preset, cloneDefaultProfile());
            if (!profile.clusters.sonority) continue;
            const { batch } = batchFor(preset, 6, 1);
            batch.words.forEach((word) => {
                word.syllables.forEach((syllable, index) => {
                    const { onset, coda } = splitSyllable(syllable);
                    const sibilant = profile.clusters.sibilantOnsetException && index === 0;
                    expect(isValidOnset(onset, { allowSibilantOnset: sibilant }), `${preset.id}: ${word.ipa}`).toBe(true);
                    expect(isValidCoda(coda), `${preset.id}: ${word.ipa}`).toBe(true);
                });
            });
        }
    });
});

// =============================================================================
// 7. PERFORMANCE
// =============================================================================

describe('performance', () => {
    it('generates 100 words for each of the seven presets well inside half a second', () => {
        const started = Date.now();
        for (const preset of PRESETS) {
            const profile = applyPreset(preset, cloneDefaultProfile());
            const inventory = deriveInventory(presetInventory(preset), profile);
            generateWords(profile, inventory, { count: 100, seed: 99 });
        }
        expect(Date.now() - started).toBeLessThan(500);
    });

    it('generates a thousand words in about a second', () => {
        const { profile, inventory } = batchFor(PRESETS[6], 1, 1);
        const started = Date.now();
        expect(generateWords(profile, inventory, { count: 1000, seed: 4 }).words).toHaveLength(1000);
        expect(Date.now() - started).toBeLessThan(1000);
    });
});

// =============================================================================
// 8. NORMALISATION
// =============================================================================

describe('normalizePronunciation', () => {
    const undertie = String.fromCharCode(0x203f);
    const nbsp = String.fromCharCode(0x00a0);

    it('is idempotent', () => {
        for (const input of ['ˈkaː.ta', 'k' + nbsp + 'a', 't͡ʃa', '']) {
            expect(normalizePronunciation(normalizePronunciation(input))).toBe(normalizePronunciation(input));
        }
    });

    it('strips stress, the syllable dot, the undertie and every kind of whitespace', () => {
        expect(normalizePronunciation('ˈkaˌta')).toBe('kata');
        expect(normalizePronunciation('ka.ta')).toBe('kata');
        expect(normalizePronunciation('ka' + undertie + 'ta')).toBe('kata');
        expect(normalizePronunciation('ka' + nbsp + '\tta\n')).toBe('kata');
    });

    it('folds the single-storey g and normalises to NFC', () => {
        expect(normalizePronunciation('ɡa')).toBe('ga');
        expect(normalizePronunciation('ã')).toBe('ã');
        expect(normalizePronunciation('ã')).toBe(normalizePronunciation('ã'));
    });

    it('changes NOTHING that changes a sound', () => {
        expect(normalizePronunciation('kaːta')).toBe('kaːta');
        expect(normalizePronunciation('t͡ʃa')).toBe('t͡ʃa');
        expect(normalizePronunciation('ʙA')).toBe('ʙA');
        expect(normalizePronunciation('pʰ')).toBe('pʰ');
    });

    it('answers an empty string for a non-string or empty input', () => {
        expect(normalizePronunciation('')).toBe('');
        expect(normalizePronunciation(undefined as unknown as string)).toBe('');
    });

    it('is what the batch dedupes by', () => {
        const profile = profileWith({ syllables: [{ pattern: 'CV', weight: 1 }], syllableCount: { min: 2, max: 2 } });
        const inventory = deriveInventory(['k', 't', 'a', 'i'], profile);
        const free = generateWords(profile, inventory, { count: 8, seed: 21 });
        const blocked = generateWords(profile, inventory, {
            count: 8, seed: 21, existing: free.words.map((word) => 'ˈ' + word.syllables.join('.')),
        });
        for (const word of blocked.words) expect(free.words.map((other) => other.ipa)).not.toContain(word.ipa);
    });
});

// =============================================================================
// 9. SHIPPED BEHAVIOURS THAT ARE DEBATABLE — pinned, and reported
// =============================================================================

describe('pinned judgement calls', () => {
    it('PINNED: a shape whose slots are all optional can emit a vowel-less word', () => {
        const profile = profileWith({
            syllables: [{ pattern: '(C)(V)', weight: 1 }],
            syllableCount: { min: 1, max: 1 },
        });
        const batch = generateWords(profile, deriveInventory(['k', 'a'], profile), { count: 4, seed: 11 });
        expect(batch.words.map((word) => word.ipa)).toContain('k');
    });

    it('SUPERSEDED in Phase 3b: an intervocalic cluster is split, and a FALLING one still passes', () => {
        // Was: "an intervocalic cluster is checked by NO sonority rule".
        // `buildSyllable` called everything between the first and last vowel the
        // nucleus, so `VCCV` had an empty onset, an empty coda, and the `rk`
        // never faced `isValidOnset` / `isValidCoda`. Phase 3b divides the run by
        // the maximal-onset principle (`ar.ki`) and checks both halves plus the
        // junction, so the cluster IS checked now.
        //
        // The assertion below is unchanged and still the right one: what this
        // test measures is that a FALLING intervocalic cluster survives, which
        // it must — `-r.k-` is legal in most languages, and a two-consonant run
        // always divides into a legal coda and a legal onset. What no longer
        // survives is the unsayable case (`-tsk-`); that is pinned in
        // `quality-phase3b.test.ts`.
        const profile = profileWith({
            syllables: [{ pattern: 'VCCV', weight: 1 }],
            syllableCount: { min: 1, max: 1 },
            clusters: { sonority: true, sibilantOnsetException: false, allowGeminates: false, maxPerWord: 4 },
        });
        const batch = generateWords(profile, deriveInventory(['a', 'i', 'l', 'r', 'p', 'k'], profile), { count: 30, seed: 4 });
        const falling = batch.words.filter((word) => {
            const sounds = soundsOfWord(word.syllables);
            const left = describePhoneme(sounds[1]);
            const right = describePhoneme(sounds[2]);
            return left && right && sonorityOf(left) > sonorityOf(right);
        });
        expect(falling.length).toBeGreaterThan(0);
    });

    it('SUPERSEDED in Phase 3b: the coda-to-next-onset junction IS checked', () => {
        // Was: "the coda-to-next-onset junction is not checked", asserting that
        // rising junctions exist. Phase 3b implemented the Syllable Contact Law
        // behind the existing `clusters.sonority` flag, exactly as this test
        // reported it should be, so the expectation flips from "> 0" to "0".
        // Slavic was the worst offender at 37 % of junctions rising.
        const { batch } = batchFor(PRESETS[6], 300, 2026);
        let rising = 0;
        let junctions = 0;
        for (const word of batch.words) {
            for (let i = 1; i < word.syllables.length; i += 1) {
                const left = splitPhonemeString(word.syllables[i - 1]).map((token) => token.text).at(-1);
                const right = splitPhonemeString(word.syllables[i]).map((token) => token.text).at(0);
                if (!left || !right || !isConsonantSound(left) || !isConsonantSound(right)) continue;
                const a = describePhoneme(left);
                const b = describePhoneme(right);
                if (a && b && sonorityOf(a) < sonorityOf(b)) rising += 1;
                junctions += 1;
            }
        }
        // Not vacuous: slavic still has plenty of junctions, none of them rising.
        expect(junctions).toBeGreaterThan(100);
        expect(rising).toBe(0);
    });

    it('PINNED: adjacent identical VOWELS are not geminates', () => {
        const profile = profileWith({
            syllables: [{ pattern: 'V', weight: 1 }],
            syllableCount: { min: 2, max: 2 },
        });
        const batch = generateWords(profile, deriveInventory(['a'], profile), { count: 1, seed: 1 });
        expect(batch.words.map((word) => word.ipa)).toEqual(['aa']);
    });

    it('reports a dropped literal member without claiming it is missing from the inventory', () => {
        const profile = profileWith({
            syllables: [{ pattern: 'CV[n ŋ]', weight: 1 }],
            phonemeTilt: { 'ŋ': 'off' },
        });
        const batch = generateWords(profile, deriveInventory(['k', 'n', 'ŋ', 'a'], profile), { count: 6, seed: 5 });
        const dropped = batch.warnings.find((warning) => warning.includes('dropped from that group'));
        expect(dropped).toContain('switched off');
        expect(batch.words.every((word) => !word.ipa.includes('ŋ'))).toBe(true);
    });
});
