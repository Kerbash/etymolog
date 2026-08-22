/**
 * `generateWords` — determinism, the constraints as properties, and the ways a
 * batch is allowed to come back short.
 *
 * The property section deliberately re-checks the engine's output TWICE: once
 * with the constraint functions (which is a consistency check — the engine and
 * the rules agree) and once with independent code written here from the tokens
 * (which is the check that actually finds bugs, because it shares nothing with
 * the implementation but the tokenizer).
 *
 * Node environment.
 */

import { describe, expect, it } from 'vitest';
import { generateWords, ATTEMPTS_PER_WORD } from '../generate';
import { checkWord, buildSyllable } from '../constraints';
import { phonemeWeights } from '../weights';
import { createRng, pickWeighted } from '../random';
import { normalizePronunciation } from '../normalize';
import { deriveInventory } from '../../inventory';
import { cloneDefaultProfile } from '../../profile/defaults';
import { applyPreset, presetInventory, PRESETS } from '../../presets';
import { describePhoneme } from '../../phonology/features';
import { splitPhonemeString } from '../../phonology/tokenize';
import type { GeneratedBatch } from '../generate';
import type { ClassifiedInventory } from '../../inventory';
import type { WordGeneratorProfile } from '../../profile/types';

// =============================================================================
// Helpers — written from the tokenizer only, sharing nothing with the engine
// =============================================================================

function profileWith(patch: Partial<WordGeneratorProfile>): WordGeneratorProfile {
    const base = cloneDefaultProfile();
    return { ...base, ...patch, clusters: { ...base.clusters, ...(patch.clusters ?? {}) } };
}

function inventoryOf(sounds: string[], profile: WordGeneratorProfile): ClassifiedInventory {
    return deriveInventory(sounds, profile);
}

/** The sounds of a generated word, read back off the string it produced. */
function tokensOf(ipa: string): string[] {
    return splitPhonemeString(ipa).map((token) => token.text);
}

/** `C`/`V` skeleton of a word, for counting clusters with a regex. */
function skeleton(ipa: string): string {
    return tokensOf(ipa)
        .map((token) => (describePhoneme(token)?.kind === 'vowel' ? 'V' : 'C'))
        .join('');
}

/** Clusters, counted independently: runs of two or more consonants. */
function clusterCount(ipa: string): number {
    return skeleton(ipa).split(/V+/).filter((run) => run.length >= 2).length;
}

/** Every preset, as the page would set it up. */
const PRESET_SETUPS = PRESETS.map((preset) => {
    const profile = applyPreset(preset, cloneDefaultProfile());
    return { preset, profile, inventory: deriveInventory(presetInventory(preset), profile) };
});

// =============================================================================
// Determinism
// =============================================================================

describe('determinism', () => {
    const { profile, inventory } = PRESET_SETUPS[0];

    it('gives an identical batch for the same seed', () => {
        const first = generateWords(profile, inventory, { count: 12, seed: 99 });
        const second = generateWords(profile, inventory, { count: 12, seed: 99 });
        expect(second.words).toEqual(first.words);
        expect(second.warnings).toEqual(first.warnings);
    });

    it('gives a different batch for a different seed', () => {
        const first = generateWords(profile, inventory, { count: 12, seed: 1 });
        const second = generateWords(profile, inventory, { count: 12, seed: 2 });
        expect(second.words.map((word) => word.ipa)).not.toEqual(first.words.map((word) => word.ipa));
    });

    it('is a prefix relation in the count — asking for more does not reshuffle', () => {
        const small = generateWords(profile, inventory, { count: 5, seed: 7 });
        const large = generateWords(profile, inventory, { count: 20, seed: 7 });
        expect(large.words.slice(0, 5).map((word) => word.ipa)).toEqual(small.words.map((word) => word.ipa));
    });

    it('reports the seed it was given, coerced to 32 bits', () => {
        expect(generateWords(profile, inventory, { count: 1, seed: 42 }).seed).toBe(42);
        expect(generateWords(profile, inventory, { count: 1, seed: -1 }).seed).toBe(0xffffffff);
    });

    it('survives a non-finite seed and count', () => {
        const batch = generateWords(profile, inventory, { count: Number.NaN, seed: Number.NaN });
        expect(batch.words).toEqual([]);
        expect(batch.seed).toBe(0);
    });
});

// =============================================================================
// The batch itself
// =============================================================================

describe('the batch', () => {
    const { profile, inventory } = PRESET_SETUPS[1];

    it('honours the count', () => {
        for (const count of [1, 6, 20, 50]) {
            expect(generateWords(profile, inventory, { count, seed: 3 }).words).toHaveLength(count);
        }
    });

    it('returns nothing, and no shortfall, for a count of zero', () => {
        const batch = generateWords(profile, inventory, { count: 0, seed: 3 });
        expect(batch.words).toEqual([]);
        expect(batch.shortfall).toBeUndefined();
        expect(batch.requested).toBe(0);
    });

    it('numbers the words by their place in the batch', () => {
        const batch = generateWords(profile, inventory, { count: 8, seed: 3 });
        expect(batch.words.map((word) => word.seedIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('joins the syllables into the ipa string exactly', () => {
        const batch = generateWords(profile, inventory, { count: 30, seed: 3 });
        for (const word of batch.words) {
            expect(word.syllables.join('')).toBe(word.ipa);
            expect(word.syllables.length).toBeGreaterThan(0);
            for (const syllable of word.syllables) expect(syllable.length).toBeGreaterThan(0);
        }
    });

    it('never repeats a word inside one batch', () => {
        const batch = generateWords(profile, inventory, { count: 60, seed: 5 });
        const keys = batch.words.map((word) => normalizePronunciation(word.ipa));
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('never produces a word the lexicon already has', () => {
        const first = generateWords(profile, inventory, { count: 20, seed: 11 });
        const second = generateWords(profile, inventory, {
            count: 20,
            seed: 11,
            existing: first.words.map((word) => word.ipa),
        });
        const taken = new Set(first.words.map((word) => normalizePronunciation(word.ipa)));
        for (const word of second.words) expect(taken.has(normalizePronunciation(word.ipa))).toBe(false);
    });

    it('compares `existing` in normalised form, so stress marks do not let a word through', () => {
        const first = generateWords(profile, inventory, { count: 5, seed: 21 });
        const decorated = first.words.map((word) => `ˈ${word.syllables.join('.')}`);
        const second = generateWords(profile, inventory, { count: 5, seed: 21, existing: decorated });
        const taken = new Set(first.words.map((word) => normalizePronunciation(word.ipa)));
        for (const word of second.words) expect(taken.has(normalizePronunciation(word.ipa))).toBe(false);
    });

    it('ignores junk in `existing`', () => {
        const batch = generateWords(profile, inventory, {
            count: 5,
            seed: 3,
            existing: ['', null as unknown as string, 42 as unknown as string],
        });
        expect(batch.words).toHaveLength(5);
    });
});

// =============================================================================
// Properties — 500 words for each of the seven presets
// =============================================================================

describe('every generated word obeys every constraint', () => {
    for (const { preset, profile, inventory } of PRESET_SETUPS) {
        describe(preset.id, () => {
            const batch = generateWords(profile, inventory, { count: 500, seed: 2026 });

            it('fills the batch without a shortfall', () => {
                expect(batch.words).toHaveLength(500);
                expect(batch.shortfall).toBeUndefined();
                expect(batch.warnings).toEqual([]);
            });

            it('passes its own constraint check', () => {
                for (const word of batch.words) {
                    const built = word.syllables.map((syllable) => buildSyllable(
                        splitPhonemeString(syllable).map((token) => token.text),
                    ));
                    expect(checkWord(built, profile, inventory), word.ipa).toBeNull();
                }
            });

            it('uses only sounds the inventory has (independent check)', () => {
                const allowed = new Set(inventory.members.map((member) => member.phoneme));
                for (const word of batch.words) {
                    for (const token of tokensOf(word.ipa)) {
                        const short = token.replace(/ː/g, '');
                        expect(allowed.has(token) || allowed.has(short), `${word.ipa} / ${token}`).toBe(true);
                    }
                }
            });

            it('stays inside the cluster budget (independent count)', () => {
                for (const word of batch.words) {
                    expect(clusterCount(word.ipa), word.ipa).toBeLessThanOrEqual(profile.clusters.maxPerWord);
                }
            });

            it('doubles no consonant unless the preset allows it (independent check)', () => {
                if (profile.clusters.allowGeminates) return;
                for (const word of batch.words) {
                    const tokens = tokensOf(word.ipa);
                    for (let i = 1; i < tokens.length; i += 1) {
                        const same = tokens[i] === tokens[i - 1];
                        const consonant = describePhoneme(tokens[i])?.kind === 'consonant';
                        expect(same && consonant, `${word.ipa} @${i}`).toBe(false);
                    }
                }
            });

            it('has a vowel in every syllable and stays inside the syllable count', () => {
                for (const word of batch.words) {
                    expect(word.syllables.length).toBeGreaterThanOrEqual(profile.syllableCount.min);
                    expect(word.syllables.length).toBeLessThanOrEqual(profile.syllableCount.max);
                    for (const syllable of word.syllables) {
                        expect(skeleton(syllable), `${word.ipa} / ${syllable}`).toContain('V');
                    }
                }
            });

            it('produces only sounds the feature table can read back', () => {
                for (const word of batch.words) {
                    for (const token of tokensOf(word.ipa)) {
                        expect(describePhoneme(token), `${word.ipa} / ${token}`).not.toBeNull();
                    }
                }
            });

            it('puts a length mark only on a vowel', () => {
                for (const word of batch.words) {
                    for (const token of tokensOf(word.ipa)) {
                        if (!token.includes('ː')) continue;
                        expect(describePhoneme(token)?.kind, `${word.ipa} / ${token}`).toBe('vowel');
                    }
                }
            });
        });
    }
});

// =============================================================================
// Tilt
// =============================================================================

describe('the frequency tilt', () => {
    const { preset, profile } = PRESET_SETUPS[4];

    it('never lets an off sound appear', () => {
        const silenced = ['s', 'n', 'a'];
        const muted = { ...profile, phonemeTilt: { ...profile.phonemeTilt, s: 'off', n: 'off', a: 'off' } } as WordGeneratorProfile;
        const mutedInventory = deriveInventory(presetInventory(preset), muted);
        const batch = generateWords(muted, mutedInventory, { count: 500, seed: 77 });
        expect(batch.words.length).toBeGreaterThan(400);
        for (const word of batch.words) {
            for (const token of tokensOf(word.ipa)) {
                expect(silenced.includes(token.replace(/ː/g, '')), `${word.ipa} / ${token}`).toBe(false);
            }
        }
    });

    it('warns when sounds are switched off', () => {
        const muted = { ...profile, phonemeTilt: { s: 'off' } } as WordGeneratorProfile;
        const batch = generateWords(muted, deriveInventory(presetInventory(preset), muted), { count: 3, seed: 1 });
        expect(batch.warnings.join(' ')).toContain('switched off');
    });

    it('makes a common sound noticeably more frequent than an untilted one', () => {
        const sounds = ['k', 't', 'p', 's', 'm', 'n', 'a', 'i'];
        const plain = profileWith({ syllables: [{ pattern: 'CV', weight: 1 }], syllableCount: { min: 3, max: 3 } });
        const tilted = { ...plain, phonemeTilt: { t: 'common' } } as WordGeneratorProfile;
        const count = (batch: GeneratedBatch, sound: string): number => batch.words
            .flatMap((word) => tokensOf(word.ipa))
            .filter((token) => token === sound).length;

        const before = generateWords(plain, inventoryOf(sounds, plain), { count: 300, seed: 4 });
        const after = generateWords(tilted, inventoryOf(sounds, tilted), { count: 300, seed: 4 });
        expect(count(after, 't')).toBeGreaterThan(count(before, 't'));
    });
});

// =============================================================================
// The frequency curve, sampled
// =============================================================================

describe('zipf against flat, over 5000 picks', () => {
    const sounds = ['a', 'm', 'k', 'p', 'n', 's', 't'];

    function sample(curve: 'zipf' | 'flat'): Map<string, number> {
        const profile = profileWith({ frequencyCurve: curve });
        const weights = phonemeWeights(sounds, profile);
        const pool = [...weights.entries()].map(([sound, weight]) => ({ sound, weight }));
        const rng = createRng(31337);
        const counts = new Map(sounds.map((sound) => [sound, 0]));
        for (let i = 0; i < 5000; i += 1) {
            const picked = pickWeighted(rng, pool, (item) => item.weight);
            if (picked) counts.set(picked.sound, (counts.get(picked.sound) ?? 0) + 1);
        }
        return counts;
    }

    it('zipf gives the top-ranked sound at least twice the last-ranked one', () => {
        const counts = sample('zipf');
        expect(counts.get('a') ?? 0).toBeGreaterThan(2 * (counts.get('t') ?? 0));
    });

    it('flat keeps every sound within 20 per cent of every other', () => {
        const counts = sample('flat');
        const values = [...counts.values()];
        const top = Math.max(...values);
        const bottom = Math.min(...values);
        expect(top / bottom).toBeLessThan(1.2);
    });

    it('the curve reaches the words: a common sound beats a rare one in a real batch', () => {
        const profile = profileWith({
            frequencyCurve: 'zipf',
            syllables: [{ pattern: 'CV', weight: 1 }],
            syllableCount: { min: 3, max: 3 },
        });
        const batch = generateWords(profile, inventoryOf(sounds, profile), { count: 400, seed: 8 });
        const tokens = batch.words.flatMap((word) => tokensOf(word.ipa));
        const m = tokens.filter((token) => token === 'm').length;
        const t = tokens.filter((token) => token === 't').length;
        expect(m).toBeGreaterThan(t);
    });
});

// =============================================================================
// Harmony, length and the other profile switches, end to end
// =============================================================================

describe('vowel harmony, end to end', () => {
    const sounds = ['k', 't', 'm', 'n', 'i', 'e', 'u', 'o', 'ə'];

    it('keeps front and back apart across a whole word', () => {
        const profile = profileWith({
            vowelHarmony: 'frontBack',
            syllables: [{ pattern: 'CV', weight: 1 }],
            syllableCount: { min: 3, max: 4 },
        });
        const batch = generateWords(profile, inventoryOf(sounds, profile), { count: 300, seed: 13 });
        expect(batch.words.length).toBeGreaterThan(200);
        for (const word of batch.words) {
            const buckets = new Set(
                tokensOf(word.ipa)
                    .map((token) => describePhoneme(token))
                    .filter((features) => features?.kind === 'vowel')
                    .map((features) => (features?.kind === 'vowel' ? features.backness : 'central'))
                    .filter((backness) => backness !== 'central'),
            );
            expect(buckets.size, word.ipa).toBeLessThanOrEqual(1);
        }
    });

    it('lets a neutral vowel through on either side', () => {
        const profile = profileWith({
            vowelHarmony: 'frontBack',
            syllables: [{ pattern: 'CV', weight: 1 }],
            syllableCount: { min: 3, max: 4 },
        });
        const batch = generateWords(profile, inventoryOf(sounds, profile), { count: 300, seed: 13 });
        const withSchwa = batch.words.filter((word) => word.ipa.includes('ə'));
        expect(withSchwa.length).toBeGreaterThan(0);
        const frontWithSchwa = withSchwa.filter((word) => /[ie]/.test(word.ipa));
        const backWithSchwa = withSchwa.filter((word) => /[uo]/.test(word.ipa));
        expect(frontWithSchwa.length).toBeGreaterThan(0);
        expect(backWithSchwa.length).toBeGreaterThan(0);
    });

    it('does not narrow anything when harmony is off', () => {
        const profile = profileWith({ syllables: [{ pattern: 'CV', weight: 1 }], syllableCount: { min: 3, max: 3 } });
        const batch = generateWords(profile, inventoryOf(sounds, profile), { count: 200, seed: 13 });
        const mixed = batch.words.filter((word) => /[ie]/.test(word.ipa) && /[uo]/.test(word.ipa));
        expect(mixed.length).toBeGreaterThan(0);
    });
});

describe('long vowels', () => {
    const sounds = ['k', 't', 'm', 'n', 'a', 'i', 'u'];

    function longRate(chance: number): number {
        const profile = profileWith({
            longVowelChance: chance,
            syllables: [{ pattern: 'CV', weight: 1 }],
            syllableCount: { min: 3, max: 3 },
        });
        const batch = generateWords(profile, inventoryOf(sounds, profile), { count: 400, seed: 17 });
        const vowels = batch.words.flatMap((word) => tokensOf(word.ipa))
            .filter((token) => describePhoneme(token)?.kind === 'vowel');
        const long = vowels.filter((token) => token.includes('ː'));
        return long.length / vowels.length;
    }

    it('adds no length at all when the chance is zero', () => {
        expect(longRate(0)).toBe(0);
    });

    it('hits roughly the configured rate', () => {
        expect(longRate(0.5)).toBeGreaterThan(0.4);
        expect(longRate(0.5)).toBeLessThan(0.6);
        expect(longRate(0.2)).toBeGreaterThan(0.12);
        expect(longRate(0.2)).toBeLessThan(0.28);
    });

    it('never lengthens a consonant', () => {
        const profile = profileWith({
            longVowelChance: 1,
            syllables: [{ pattern: 'CVC', weight: 1 }],
            syllableCount: { min: 2, max: 2 },
            clusters: { sonority: true, sibilantOnsetException: false, allowGeminates: true, maxPerWord: 4 },
        });
        const batch = generateWords(profile, inventoryOf(sounds, profile), { count: 100, seed: 19 });
        expect(batch.words.length).toBeGreaterThan(0);
        for (const word of batch.words) {
            for (const token of tokensOf(word.ipa)) {
                if (token.includes('ː')) expect(describePhoneme(token)?.kind).toBe('vowel');
            }
        }
    });
});

describe('forbidden sequences, end to end', () => {
    it('keeps the sequence out of every word', () => {
        const sounds = ['k', 't', 'n', 's', 'a', 'i', 'o'];
        const profile = profileWith({
            forbidden: ['ka', 'ti'],
            syllables: [{ pattern: 'CV', weight: 1 }],
            syllableCount: { min: 2, max: 3 },
        });
        const batch = generateWords(profile, inventoryOf(sounds, profile), { count: 200, seed: 23 });
        expect(batch.words.length).toBeGreaterThan(100);
        for (const word of batch.words) {
            expect(word.ipa).not.toContain('ka');
            expect(word.ipa).not.toContain('ti');
        }
    });
});

// =============================================================================
// Shortfalls — the batch is allowed to come back short, never to hang
// =============================================================================

describe('shortfalls', () => {
    it('reports an empty inventory without throwing', () => {
        const profile = profileWith({});
        const batch = generateWords(profile, inventoryOf([], profile), { count: 10, seed: 1 });
        expect(batch.words).toEqual([]);
        expect(batch.shortfall?.reason).toBe('empty-inventory');
        expect(batch.shortfall?.attempts).toBe(0);
    });

    it('treats an inventory that is entirely switched off as empty', () => {
        const profile = profileWith({ phonemeTilt: { k: 'off', a: 'off' } });
        const batch = generateWords(profile, inventoryOf(['k', 'a'], profile), { count: 10, seed: 1 });
        expect(batch.shortfall?.reason).toBe('empty-inventory');
    });

    it('reports an inventory with no vowels', () => {
        const profile = profileWith({});
        const batch = generateWords(profile, inventoryOf(['k', 't', 's'], profile), { count: 10, seed: 1 });
        expect(batch.shortfall?.reason).toBe('no-vowels');
    });

    it('reports an inventory with no consonants when every shape needs one', () => {
        const profile = profileWith({ syllables: [{ pattern: 'CV', weight: 1 }] });
        const batch = generateWords(profile, inventoryOf(['a', 'i'], profile), { count: 10, seed: 1 });
        expect(batch.shortfall?.reason).toBe('no-consonants');
    });

    it('does NOT report no-consonants when a vowel-only shape can still fire', () => {
        const profile = profileWith({
            syllables: [{ pattern: 'CV', weight: 1 }, { pattern: 'V', weight: 1 }],
            syllableCount: { min: 1, max: 3 },
        });
        const batch = generateWords(profile, inventoryOf(['a', 'i', 'u'], profile), { count: 5, seed: 1 });
        expect(batch.words.length).toBeGreaterThan(0);
        expect(batch.shortfall?.reason).not.toBe('no-consonants');
    });

    it('gives up with `exhausted` rather than hanging when only one word is possible', () => {
        const profile = profileWith({
            syllables: [{ pattern: 'V', weight: 1 }],
            syllableCount: { min: 1, max: 1 },
        });
        const batch = generateWords(profile, inventoryOf(['a'], profile), { count: 5, seed: 1 });
        expect(batch.words.map((word) => word.ipa)).toEqual(['a']);
        expect(batch.shortfall?.reason).toBe('exhausted');
        expect(batch.shortfall?.rejected.duplicate).toBeGreaterThan(0);
    });

    it('never builds more than count x 40 candidates', () => {
        const profile = profileWith({
            syllables: [{ pattern: 'V', weight: 1 }],
            syllableCount: { min: 1, max: 1 },
        });
        const batch = generateWords(profile, inventoryOf(['a'], profile), { count: 7, seed: 1 });
        expect(batch.shortfall?.attempts).toBeLessThanOrEqual(7 * ATTEMPTS_PER_WORD);
        expect(ATTEMPTS_PER_WORD).toBe(40);
    });

    it('counts rejections by the rule that caused them', () => {
        const profile = profileWith({
            forbidden: ['a'],
            syllables: [{ pattern: 'CV', weight: 1 }],
            syllableCount: { min: 1, max: 1 },
        });
        const batch = generateWords(profile, inventoryOf(['k', 'a'], profile), { count: 4, seed: 1 });
        expect(batch.words).toEqual([]);
        expect(batch.shortfall?.rejected.noForbiddenSequences).toBeGreaterThan(0);
    });

    it('reports no shortfall when the batch is full', () => {
        const { profile, inventory } = PRESET_SETUPS[0];
        expect(generateWords(profile, inventory, { count: 10, seed: 1 }).shortfall).toBeUndefined();
    });
});

// =============================================================================
// Build-time warnings
// =============================================================================

describe('warnings', () => {
    it('drops a literal member the inventory does not have, and says so', () => {
        const profile = profileWith({ syllables: [{ pattern: 'CV[n ŋ]', weight: 1 }] });
        const batch = generateWords(profile, inventoryOf(['k', 'a', 'n'], profile), { count: 20, seed: 1 });
        expect(batch.warnings.join(' ')).toContain('ŋ');
        expect(batch.words.length).toBeGreaterThan(0);
        for (const word of batch.words) expect(word.ipa).not.toContain('ŋ');
    });

    it('skips a shape whose literal group empties, and counts the loss', () => {
        const profile = profileWith({
            syllables: [{ pattern: 'CV[ŋ]', weight: 1 }, { pattern: 'CV', weight: 1 }],
        });
        const batch = generateWords(profile, inventoryOf(['k', 't', 'a', 'i'], profile), { count: 20, seed: 1 });
        expect(batch.warnings.join(' ')).toContain('skipped');
        expect(batch.words.length).toBeGreaterThan(0);
    });

    it('skips a shape that needs a class the inventory cannot fill', () => {
        const profile = profileWith({
            syllables: [{ pattern: 'CVN', weight: 1 }, { pattern: 'CV', weight: 1 }],
        });
        const batch = generateWords(profile, inventoryOf(['k', 't', 'a', 'i'], profile), { count: 20, seed: 1 });
        expect(batch.warnings.join(' ')).toContain('nasals');
        expect(batch.words.length).toBeGreaterThan(0);
    });

    it('leaves out an OPTIONAL slot it cannot fill, instead of losing the shape', () => {
        const profile = profileWith({ syllables: [{ pattern: 'CV(N)', weight: 1 }] });
        const batch = generateWords(profile, inventoryOf(['k', 't', 'a', 'i'], profile), { count: 20, seed: 1 });
        expect(batch.warnings.join(' ')).toContain('left out');
        expect(batch.words).toHaveLength(20);
    });

    it('skips an unparseable shape and names the parser error', () => {
        const profile = profileWith({
            syllables: [{ pattern: 'CVX', weight: 1 }, { pattern: 'CV', weight: 1 }],
        });
        const batch = generateWords(profile, inventoryOf(['k', 'a', 'i'], profile), { count: 10, seed: 1 });
        expect(batch.warnings.join(' ')).toContain('could not be read');
        expect(batch.words).toHaveLength(10);
    });

    it('skips a shape with no weight', () => {
        const profile = profileWith({
            syllables: [{ pattern: 'CVC', weight: 0 }, { pattern: 'CV', weight: 1 }],
        });
        const batch = generateWords(profile, inventoryOf(['k', 'a', 'i'], profile), { count: 10, seed: 1 });
        expect(batch.warnings.join(' ')).toContain('no weight');
        for (const word of batch.words) {
            for (const syllable of word.syllables) expect(skeleton(syllable)).toBe('CV');
        }
    });

    it('names the sounds it cannot classify', () => {
        const profile = profileWith({});
        const batch = generateWords(profile, inventoryOf(['k', 'a', 'zzz'], profile), { count: 5, seed: 1 });
        expect(batch.warnings.join(' ')).toContain('zzz');
        expect(batch.words).toHaveLength(5);
    });

    it('says nothing at all when nothing is wrong', () => {
        const { profile, inventory } = PRESET_SETUPS[2];
        expect(generateWords(profile, inventory, { count: 10, seed: 1 }).warnings).toEqual([]);
    });
});

// =============================================================================
// Speed
// =============================================================================

describe('speed', () => {
    it('generates 100 words for each of the seven presets in well under half a second', () => {
        const started = Date.now();
        for (const { profile, inventory } of PRESET_SETUPS) {
            const batch = generateWords(profile, inventory, { count: 100, seed: 5 });
            expect(batch.words).toHaveLength(100);
        }
        expect(Date.now() - started).toBeLessThan(500);
    });
});
