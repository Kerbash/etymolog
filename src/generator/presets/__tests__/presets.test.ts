/**
 * Flavour presets.
 *
 * These are DATA files, so the tests are data assertions: every sound resolves,
 * every template parses, the tiers do not contradict each other, and applying a
 * preset produces a profile the validator accepts without a single correction.
 * A typo in a preset would otherwise show up as a chart cell that never lights,
 * which is close to invisible.
 *
 * Node environment.
 */

import { describe, expect, it } from 'vitest';
import { applyPreset, getPreset, presetInventory, PRESETS, PRESET_IDS } from '../index';
import { guideMapFor } from '../../coverage';
import { describePhoneme } from '../../phonology/features';
import { splitPhonemeString } from '../../phonology/tokenize';
import { isValidTemplatePattern, parseTemplate, templateHasVowelSlot } from '../../engine/template';
import { cloneDefaultProfile, LIMITS } from '../../profile/defaults';
import { validateGeneratorSettings } from '../../profile/validate';
import type { FlavourPreset } from '../types';

/** Every sound of a preset, in one list, with the tier it came from. */
function allSounds(preset: FlavourPreset): { tier: string; sound: string }[] {
    return [
        ...preset.sounds.core.map((sound) => ({ tier: 'sounds.core', sound })),
        ...preset.sounds.flavour.map((sound) => ({ tier: 'sounds.flavour', sound })),
        ...preset.sounds.avoid.map((sound) => ({ tier: 'sounds.avoid', sound })),
        ...preset.vowels.core.map((sound) => ({ tier: 'vowels.core', sound })),
        ...preset.vowels.flavour.map((sound) => ({ tier: 'vowels.flavour', sound })),
    ];
}

describe('the registry', () => {
    it('ships the seven planned presets in a stable order', () => {
        expect(PRESET_IDS).toEqual([
            'flowing', 'island', 'japanese', 'sinitic', 'romance', 'guttural', 'slavic',
        ]);
        expect(PRESETS).toHaveLength(7);
    });

    it('has unique ids that match the array order', () => {
        expect(new Set(PRESET_IDS).size).toBe(PRESET_IDS.length);
        expect(PRESETS.map((preset) => preset.id)).toEqual([...PRESET_IDS]);
    });

    it('looks a preset up by id and returns null for anything else', () => {
        expect(getPreset('island')?.name).toBe('Smooth / island');
        expect(getPreset('elvish')).toBeNull();
        expect(getPreset(null)).toBeNull();
        expect(getPreset(undefined)).toBeNull();
        expect(getPreset('')).toBeNull();
    });

    it('gives every preset the prose the UI renders', () => {
        for (const preset of PRESETS) {
            expect(preset.name.length).toBeGreaterThan(0);
            expect(preset.tagline.length).toBeGreaterThan(0);
            expect(preset.touchstones.length).toBeGreaterThan(0);
            expect(preset.why.length).toBeGreaterThan(200);
        }
    });

    it('ships six generated example words per preset', () => {
        // The words themselves are pinned by the ratchet in `examples.test.ts`,
        // which regenerates them from the engine. This only asserts the shape,
        // so a preset added later cannot ship with an empty card.
        for (const preset of PRESETS) {
            expect(preset.examples, preset.id).toHaveLength(6);
            for (const example of preset.examples) expect(example.length).toBeGreaterThan(0);
        }
    });
});

describe.each(PRESETS.map((preset) => [preset.id, preset] as const))('preset "%s"', (_id, preset) => {
    it('resolves every sound through describePhoneme', () => {
        const unresolved = allSounds(preset)
            .filter(({ sound }) => describePhoneme(sound) === null)
            .map(({ tier, sound }) => `${tier}: ${sound}`);
        expect(unresolved).toEqual([]);
    });

    it('files consonants under `sounds` and vowels under `vowels`', () => {
        for (const sound of [...preset.sounds.core, ...preset.sounds.flavour, ...preset.sounds.avoid]) {
            expect(describePhoneme(sound)?.kind, sound).toBe('consonant');
        }
        for (const sound of [...preset.vowels.core, ...preset.vowels.flavour]) {
            expect(describePhoneme(sound)?.kind, sound).toBe('vowel');
        }
    });

    it('never lists the same sound twice within a tier', () => {
        for (const list of [
            preset.sounds.core, preset.sounds.flavour, preset.sounds.avoid,
            preset.vowels.core, preset.vowels.flavour,
        ]) {
            expect(new Set(list).size).toBe(list.length);
        }
    });

    it('keeps core and avoid disjoint', () => {
        const avoid = new Set(preset.sounds.avoid);
        expect(preset.sounds.core.filter((sound) => avoid.has(sound))).toEqual([]);
        expect(preset.sounds.flavour.filter((sound) => avoid.has(sound))).toEqual([]);
    });

    it('has a core inventory big enough to build words from', () => {
        expect(preset.sounds.core.length).toBeGreaterThanOrEqual(8);
        expect(preset.vowels.core.length).toBeGreaterThanOrEqual(3);
    });

    it('parses every template and has at least one vowel slot', () => {
        for (const template of preset.profile.syllables) {
            expect(isValidTemplatePattern(template.pattern), template.pattern).toEqual({ ok: true });
            expect(template.weight).toBeGreaterThan(0);
        }
        const withVowel = preset.profile.syllables
            .filter((template) => templateHasVowelSlot(parseTemplate(template.pattern)));
        expect(withVowel.length).toBeGreaterThan(0);
    });

    it('only names sounds in its literal groups that its own inventory has', () => {
        // SOUND by sound, not member by member: a literal member may be a
        // diphthong (`[ai au]`), which is a sequence rather than a phoneme and
        // is therefore never an inventory entry itself. What has to be in the
        // inventory is every sound inside it — otherwise the engine drops the
        // member at build time and the template quietly narrows.
        const inventory = new Set(presetInventory(preset));
        for (const template of preset.profile.syllables) {
            for (const item of parseTemplate(template.pattern)) {
                if (item.kind !== 'literal') continue;
                for (const member of item.members) {
                    for (const token of splitPhonemeString(member)) {
                        expect(inventory.has(token.text), `${template.pattern} -> ${member} / ${token.text}`).toBe(true);
                    }
                }
            }
        }
    });

    it('tilts only sounds it actually ships', () => {
        const inventory = new Set(presetInventory(preset));
        for (const sound of Object.keys(preset.profile.phonemeTilt ?? {})) {
            expect(inventory.has(sound), sound).toBe(true);
        }
    });

    it('writes diphthongs as sequences of vowels, not as phonemes', () => {
        for (const diphthong of preset.diphthongs ?? []) {
            const tokens = splitPhonemeString(diphthong);
            expect(tokens.length, diphthong).toBeGreaterThan(1);
            for (const token of tokens) {
                expect(token.features?.kind, `${diphthong} / ${token.text}`).toBe('vowel');
            }
        }
    });

    it('stays inside the profile limits', () => {
        expect(preset.profile.syllables.length).toBeLessThanOrEqual(LIMITS.MAX_TEMPLATES);
        expect(presetInventory(preset).length).toBeLessThanOrEqual(LIMITS.MAX_INVENTORY);
        expect(preset.profile.longVowelChance).toBeGreaterThanOrEqual(0);
        expect(preset.profile.longVowelChance).toBeLessThanOrEqual(1);
        expect(preset.profile.clusters.maxPerWord).toBeLessThanOrEqual(LIMITS.MAX_CLUSTERS_PER_WORD);
    });

    it('applies to a profile that validates with ZERO issues', () => {
        const profile = applyPreset(preset, cloneDefaultProfile());
        const result = validateGeneratorSettings({ profile, guidePresetId: preset.id });
        expect(result.issues).toEqual([]);
        expect(result.settings.profile).toEqual(profile);
    });

    it('puts no base symbol in two guide tiers', () => {
        // Precedence exists in `guideMapFor` as a safety net; a preset that
        // actually needs it is a data bug, because the losing tier would be
        // silently invisible on the chart.
        const seen = new Map<string, string>();
        const collisions: string[] = [];
        const record = (sounds: readonly string[], tier: string): void => {
            for (const sound of sounds) {
                const base = describePhoneme(sound)?.base ?? sound;
                const previous = seen.get(base);
                if (previous !== undefined && previous !== tier) {
                    collisions.push(`${base} (${sound}): ${previous} and ${tier}`);
                }
                seen.set(base, tier);
            }
        };
        record([...preset.sounds.core, ...preset.vowels.core], 'core');
        record([...preset.sounds.flavour, ...preset.vowels.flavour], 'flavour');
        record(preset.sounds.avoid, 'avoid');
        expect(collisions).toEqual([]);
    });
});

describe('presetInventory', () => {
    it('is core + flavour + both vowel tiers, consonants first, and never avoid', () => {
        const preset = getPreset('flowing')!;
        const inventory = presetInventory(preset);
        expect(inventory).toEqual([
            ...preset.sounds.core,
            ...preset.sounds.flavour,
            ...preset.vowels.core,
            ...preset.vowels.flavour,
        ]);
        for (const sound of preset.sounds.avoid) {
            expect(inventory).not.toContain(sound);
        }
    });

    it('de-duplicates', () => {
        for (const preset of PRESETS) {
            const inventory = presetInventory(preset);
            expect(new Set(inventory).size).toBe(inventory.length);
        }
    });
});

describe('applyPreset', () => {
    const preset = getPreset('sinitic')!;

    it('stamps the preset id and installs its sounds as an EXPLICIT inventory', () => {
        const profile = applyPreset(preset, cloneDefaultProfile());
        expect(profile.presetId).toBe('sinitic');
        expect(profile.inventory).toEqual(presetInventory(preset));
        expect(profile.inventory.length).toBeGreaterThan(0);
    });

    it('overwrites the shape and constraints wholesale', () => {
        const current = cloneDefaultProfile();
        current.syllables = [{ pattern: 'CCVCC', weight: 1 }];
        current.clusters.maxPerWord = 4;
        current.vowelHarmony = 'frontBack';
        const profile = applyPreset(preset, current);
        expect(profile.syllables).toEqual(preset.profile.syllables);
        expect(profile.clusters).toEqual(preset.profile.clusters);
        expect(profile.vowelHarmony).toBe(preset.profile.vowelHarmony);
    });

    it('replaces the tilt rather than merging the previous one', () => {
        const current = cloneDefaultProfile();
        current.phonemeTilt = { 'θ': 'common' };
        expect(applyPreset(preset, current).phonemeTilt).toEqual(preset.profile.phonemeTilt ?? {});
    });

    it('supplies an empty tilt for a preset that has none', () => {
        const profile = applyPreset({ ...preset, profile: { ...preset.profile, phonemeTilt: undefined } }, cloneDefaultProfile());
        expect(profile.phonemeTilt).toEqual({});
    });

    it('shares no structure with the preset module — editing the result cannot corrupt it', () => {
        const before = preset.profile.syllables.map((template) => ({ ...template }));
        const profile = applyPreset(preset, cloneDefaultProfile());
        profile.syllables[0].weight = 999;
        profile.syllables.push({ pattern: 'V', weight: 1 });
        profile.inventory.push('zzz');
        expect(preset.profile.syllables).toEqual(before);
        expect(presetInventory(preset)).not.toContain('zzz');
    });

    it('shares no structure with the profile it was given', () => {
        const current = cloneDefaultProfile();
        const profile = applyPreset(preset, current);
        profile.forbidden.push('kk');
        expect(current.forbidden).toEqual([]);
    });

    it('always reports version 1', () => {
        expect(applyPreset(preset, cloneDefaultProfile()).version).toBe(1);
    });
});

describe('guideMapFor', () => {
    it('tiers every sound of every preset by base symbol', () => {
        for (const preset of PRESETS) {
            const map = guideMapFor(preset);
            for (const sound of preset.sounds.core) {
                expect(map.get(describePhoneme(sound)!.base), `${preset.id}/${sound}`).toBe('core');
            }
            for (const sound of preset.sounds.avoid) {
                expect(map.get(describePhoneme(sound)!.base), `${preset.id}/${sound}`).toBe('avoid');
            }
        }
    });

    it('includes vowels', () => {
        const map = guideMapFor(getPreset('sinitic')!);
        expect(map.get('a')).toBe('core');
        expect(map.get('ɛ')).toBe('flavour');
    });

    it('collapses an aspirated core stop onto its plain base', () => {
        const map = guideMapFor(getPreset('sinitic')!);
        // The chart has one `p` cell; `p` and `pʰ` are both core there.
        expect(map.get('p')).toBe('core');
        expect(map.has('pʰ')).toBe(false);
    });

    it('keys the tie-barred affricate by its canonical spelling', () => {
        const map = guideMapFor(getPreset('romance')!);
        expect(map.get('t͡ʃ')).toBe('core');
    });

    it('gives core precedence over flavour and avoid', () => {
        const invented: FlavourPreset = {
            ...getPreset('island')!,
            sounds: { core: ['k'], flavour: ['kʰ'], avoid: ['k'] },
        };
        expect(guideMapFor(invented).get('k')).toBe('core');
    });
});
