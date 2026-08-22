/**
 * Phase 2 — independent adversarial audit.
 *
 * Written against the profile model, the presets, the settings seam and the
 * template parser by someone who did NOT implement them, with three hostile
 * readers in mind:
 *
 *   - a JSON author who hand-edits an export envelope and puts `__proto__`,
 *     `NaN`, `-0` and `version: 2` in it;
 *   - a linguist who reads the presets and asks whether Sinitic can really not
 *     end a syllable in `m`, and whether "island" can produce a cluster;
 *   - a maintainer six months from now who deletes a module and expects the
 *     ratchets to notice.
 *
 * Where the implementation makes a defensible choice this file PINS the current
 * behaviour with a comment saying why it is defensible; where it was wrong the
 * fix is in the source and the test here is the regression pin. Fixes made from
 * this audit:
 *
 *   D1 `engine/template.ts` — a literal group of DIPHTHONGS (`[ai au]`) did not
 *      count as a vowel slot, so a profile whose only vowels came from one was
 *      rejected by the validator and silently reset to the defaults.
 *   D2 `profile/validate.ts` — a `phonemeTilt` key of `__proto__` (own property,
 *      exactly what `JSON.parse` produces) was silently discarded by the plain
 *      assignment that built the map.
 *   D3 `coverage.ts` — the sound-key separator was a RAW NUL byte in the source,
 *      which makes `file`, `grep` and `git diff` treat the module as binary.
 *
 * Node environment: nothing here renders.
 */

/// <reference types="node" />
//
// Two of the tests below are build-time linters written as tests (the control
// byte scan and the import ratchet), in the same spirit as
// `phonology/__tests__/sources.test.ts`.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import {
    expandTemplate,
    isValidTemplatePattern,
    parseTemplate,
    templateHasVowelSlot,
    TemplateSyntaxError,
} from '../engine/template';
import { validateGeneratorSettings } from '../profile/validate';
import { cloneDefaultProfile, DEFAULT_PROFILE, LIMITS } from '../profile/defaults';
import { applyPreset, getPreset, presetInventory, PRESETS } from '../presets';
import { computeCoverage, guideMapFor } from '../coverage';
import { describePhoneme, phonemeIdentity } from '../phonology/features';
import type { WordGeneratorProfile } from '../profile/types';
import type { TemplateItem } from '../engine/template';

const GENERATOR = resolve(__dirname, '..');

/** Every `.ts` file under `src/generator/`, tests included — this scan is about BYTES. */
function collectAll(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            collectAll(full, acc);
            continue;
        }
        if (entry.endsWith('.ts')) acc.push(full);
    }
    return acc;
}

/** The profile a raw value validates to, ignoring the issues. */
function profileOf(raw: unknown): WordGeneratorProfile {
    return validateGeneratorSettings(raw).settings.profile;
}

/** Issue paths only — the message text is pinned by the implementer's own suite. */
function paths(raw: unknown): string[] {
    return validateGeneratorSettings(raw).issues.map((issue) => issue.path);
}

// =============================================================================
// 1. The validator against a hostile JSON author
// =============================================================================

describe('audit — validator, hostile input', () => {
    it('keeps a `__proto__` tilt key instead of silently swallowing it (D2)', () => {
        // An object LITERAL cannot express this — `{ __proto__: 'common' }` is
        // the proto setter, not a property — but `JSON.parse` can, and settings
        // arrive through `JSON.parse` on every boot and every import.
        const raw = JSON.parse('{"profile":{"phonemeTilt":{"__proto__":"common","a":"rare"}}}');
        expect(Object.keys(raw.profile.phonemeTilt)).toContain('__proto__');

        const { settings, issues } = validateGeneratorSettings(raw);
        expect(issues).toEqual([]);
        expect(Object.keys(settings.profile.phonemeTilt).sort()).toEqual(['__proto__', 'a']);
        expect(settings.profile.phonemeTilt.a).toBe('rare');
    });

    it('never reaches Object.prototype, whatever the key or the value', () => {
        const scalar = JSON.parse('{"profile":{"phonemeTilt":{"__proto__":"common"}}}');
        const nested = JSON.parse('{"profile":{"phonemeTilt":{"__proto__":{"polluted":true}}}}');
        validateGeneratorSettings(scalar);
        validateGeneratorSettings(nested);

        const probe = {} as Record<string, unknown>;
        expect(probe.polluted).toBeUndefined();
        expect(probe.common).toBeUndefined();
        expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    });

    it('reports a non-tilt value under a `__proto__` key like any other key', () => {
        // The nested-object form is not a valid tilt, so it is an ISSUE rather
        // than a silent drop — which is the whole point of the fix.
        const nested = JSON.parse('{"profile":{"phonemeTilt":{"__proto__":{"polluted":true}}}}');
        expect(paths(nested)).toEqual(['profile.phonemeTilt.__proto__']);
    });

    it('survives structuredClone and a JSON round-trip with the awkward key intact', () => {
        const raw = JSON.parse('{"profile":{"phonemeTilt":{"__proto__":"common","a":"rare"}}}');
        const { settings } = validateGeneratorSettings(raw);
        const cloned = structuredClone(settings);
        expect(Object.keys(cloned.profile.phonemeTilt).sort()).toEqual(['__proto__', 'a']);
        const stored = JSON.parse(JSON.stringify(settings));
        expect(Object.getPrototypeOf(stored.profile.phonemeTilt)).toBe(Object.prototype);
        expect(validateGeneratorSettings(stored).issues).toEqual([]);
    });

    it('keeps a `constructor` tilt key as an ordinary own property', () => {
        const raw = JSON.parse('{"profile":{"phonemeTilt":{"constructor":"off"}}}');
        const { settings, issues } = validateGeneratorSettings(raw);
        expect(issues).toEqual([]);
        expect(settings.profile.phonemeTilt.constructor).toBe('off');
        // The shadowing is local to the tilt map; nothing else sees it.
        expect(({}).constructor).toBe(Object);
    });

    it('rejects NaN, Infinity and a numeric string as a template weight', () => {
        expect(paths({ profile: { syllables: [{ pattern: 'CV', weight: Number.NaN }] } }))
            .toEqual(['profile.syllables[0].weight']);
        expect(paths({ profile: { syllables: [{ pattern: 'CV', weight: Number.POSITIVE_INFINITY }] } }))
            .toEqual(['profile.syllables[0].weight']);
        expect(paths({ profile: { syllables: [{ pattern: 'CV', weight: '6' }] } }))
            .toEqual(['profile.syllables[0].weight']);
        // …and still produces a usable template rather than dropping the row.
        expect(profileOf({ profile: { syllables: [{ pattern: 'CV', weight: Number.NaN }] } }).syllables)
            .toEqual([{ pattern: 'CV', weight: 1 }]);
    });

    it('treats a negative zero weight as the zero it is', () => {
        const result = validateGeneratorSettings({ profile: { syllables: [{ pattern: 'CV', weight: -0 }] } });
        expect(result.issues.map((issue) => issue.path)).toEqual(['profile.syllables[0].weight']);
        // Clamped to the smallest positive weight — a 0 weight would be a
        // template that can never fire, which is a silent trap in Phase 3's
        // weighted pick.
        expect(result.settings.profile.syllables[0].weight).toBeGreaterThan(0);
    });

    it('rejects a fractional syllable count and falls back rather than rounding', () => {
        const result = validateGeneratorSettings({ profile: { syllableCount: { min: 1.5, max: 3 } } });
        expect(result.issues.map((issue) => issue.path)).toEqual(['profile.syllableCount.min']);
        expect(result.settings.profile.syllableCount).toEqual({ min: 1, max: 3 });
    });

    it('raises max to min when a hand-edited count is inverted, keeping the floor', () => {
        const result = validateGeneratorSettings({ profile: { syllableCount: { min: 4, max: 2 } } });
        expect(result.settings.profile.syllableCount).toEqual({ min: 4, max: 4 });
        expect(result.issues.map((issue) => issue.path)).toEqual(['profile.syllableCount']);
    });

    it('rejects a string syllable count and every non-number shape', () => {
        expect(paths({ profile: { syllableCount: { min: '1', max: '3' } } }))
            .toEqual(['profile.syllableCount.min', 'profile.syllableCount.max']);
        expect(paths({ profile: { syllableCount: [1, 3] } })).toEqual(['profile.syllableCount']);
    });

    it('reports every field of an all-null profile and returns a complete default', () => {
        const raw = {
            profile: {
                version: null, presetId: null, inventory: null, phonemeTilt: null,
                frequencyCurve: null, syllables: null, syllableCount: null, clusters: null,
                vowelHarmony: null, longVowelChance: null, forbidden: null,
            },
        };
        const { settings, issues } = validateGeneratorSettings(raw);
        // `presetId: null` is legal ("no preset"), so it is the ONE null that is
        // silent; everything else is a wrong type.
        expect(issues.map((issue) => issue.path)).not.toContain('profile.presetId');
        expect(issues.length).toBe(10);
        expect(settings.profile).toEqual(DEFAULT_PROFILE);
    });

    it('reports an array where an object is expected, at every level', () => {
        expect(paths([])).toEqual(['']);
        expect(paths({ profile: [] })).toEqual(['profile']);
        expect(paths({ profile: { clusters: [] } })).toEqual(['profile.clusters']);
        expect(paths({ profile: { phonemeTilt: [] } })).toEqual(['profile.phonemeTilt']);
    });

    it('reports a version other than 1 but does NOT downgrade the rest of the data', () => {
        // Forward compatibility, such as it is: a v2 profile from a newer build
        // keeps every field this build understands, and the issue makes the
        // strict `update()` refuse to overwrite storage with the downgrade.
        const result = validateGeneratorSettings({
            profile: { version: 2, syllables: [{ pattern: 'CVC', weight: 3 }], longVowelChance: 0.4 },
        });
        expect(result.issues.map((issue) => issue.path)).toEqual(['profile.version']);
        expect(result.settings.profile.version).toBe(1);
        expect(result.settings.profile.syllables).toEqual([{ pattern: 'CVC', weight: 3 }]);
        expect(result.settings.profile.longVowelChance).toBe(0.4);
    });

    it('drops empty, whitespace and non-string inventory entries by index, keeping the rest', () => {
        const result = validateGeneratorSettings({
            profile: { inventory: ['a', 'a', ' a ', '', '   ', 5, null] },
        });
        expect(result.settings.profile.inventory).toEqual(['a']);
        expect(result.issues.map((issue) => issue.path)).toEqual([
            'profile.inventory[3]', 'profile.inventory[4]', 'profile.inventory[5]', 'profile.inventory[6]',
        ]);
    });

    it('caps an oversized inventory and forbidden list at the LIMITS', () => {
        const inventory = Array.from({ length: LIMITS.MAX_INVENTORY + 5 }, (_, i) => `x${i}`);
        const forbidden = Array.from({ length: LIMITS.MAX_FORBIDDEN + 5 }, (_, i) => `y${i}`);
        const result = validateGeneratorSettings({ profile: { inventory, forbidden } });
        expect(result.settings.profile.inventory).toHaveLength(LIMITS.MAX_INVENTORY);
        expect(result.settings.profile.forbidden).toHaveLength(LIMITS.MAX_FORBIDDEN);
        expect(result.issues.map((issue) => issue.path))
            .toEqual(['profile.inventory', 'profile.forbidden']);
    });

    it('does NOT require an inventory entry to be a sound it can classify', () => {
        // Deliberate: `deriveInventory` (Phase 3) surfaces unclassifiable
        // entries as `unknown` in the UI. Rejecting them here would make the
        // settings write fail for a user who is mid-way through typing.
        const result = validateGeneratorSettings({ profile: { inventory: ['zzz', 'ʔ'] } });
        expect(result.issues).toEqual([]);
        expect(result.settings.profile.inventory).toEqual(['zzz', 'ʔ']);
    });

    it('accepts any non-empty guidePresetId, including one no preset answers to', () => {
        // Open question, pinned rather than fixed: validating against
        // `PRESET_IDS` would make `src/generator/profile` depend on
        // `src/generator/presets` (today the arrow points the other way) and
        // would turn a guide id from a FUTURE build into a boot warning.
        // `getPreset()` already returns null for it, so the chart just paints
        // nothing.
        const result = validateGeneratorSettings({ guidePresetId: 'not-a-preset' });
        expect(result.issues).toEqual([]);
        expect(result.settings.guidePresetId).toBe('not-a-preset');
        expect(getPreset(result.settings.guidePresetId)).toBeNull();
    });

    it('is idempotent: validating its own output changes nothing and raises nothing', () => {
        const nasty = JSON.parse(JSON.stringify({
            profile: {
                version: 2,
                presetId: '  flowing  ',
                inventory: ['a', 'a', ' i '],
                frequencyCurve: 'nope',
                syllables: [{ pattern: 'CVX', weight: 3 }, { pattern: '(C)V(N)', weight: 9 }],
                syllableCount: { min: 9, max: 0 },
                clusters: { sonority: 'yes', maxPerWord: 99, unknownSwitch: 1 },
                vowelHarmony: 'sideways',
                longVowelChance: 4,
                forbidden: ['', 'kk'],
                strayKey: true,
            },
            strayTopKey: 1,
        }));
        const first = validateGeneratorSettings(nasty);
        expect(first.issues.length).toBeGreaterThan(0);

        const second = validateGeneratorSettings(first.settings);
        expect(second.issues).toEqual([]);
        expect(second.settings).toEqual(first.settings);
        // …and a third pass is stable too, so there is no oscillation.
        expect(validateGeneratorSettings(second.settings).settings).toEqual(first.settings);
    });

    it('is idempotent for every preset profile', () => {
        for (const preset of PRESETS) {
            const applied = applyPreset(preset, cloneDefaultProfile());
            const first = validateGeneratorSettings({ profile: applied, guidePresetId: preset.id });
            expect(first.issues, preset.id).toEqual([]);
            const second = validateGeneratorSettings(first.settings);
            expect(second.issues, preset.id).toEqual([]);
            expect(second.settings, preset.id).toEqual(first.settings);
        }
    });

    it('hands out a profile that shares no structure with the module default', () => {
        const a = validateGeneratorSettings(undefined).settings;
        const b = validateGeneratorSettings(undefined).settings;
        a.profile.syllables.push({ pattern: 'CCV', weight: 1 });
        a.profile.clusters.maxPerWord = 4;
        a.profile.inventory.push('zzz');
        expect(b.profile).toEqual(DEFAULT_PROFILE);
        expect(cloneDefaultProfile()).toEqual(DEFAULT_PROFILE);
        expect(DEFAULT_PROFILE.syllables).toHaveLength(3);
    });
});

// =============================================================================
// 2. The "must be able to produce a vowel" rule
// =============================================================================

describe('audit — the vowel-slot rule', () => {
    it('counts a DIPHTHONG literal group as a vowel slot (D1)', () => {
        // `describePhoneme('ai')` is null — it is a sequence, not a phoneme — so
        // the member has to be tokenised. Before the fix `[ai au]` was not a
        // vowel slot and a profile built on it was thrown away.
        expect(templateHasVowelSlot(parseTemplate('C[ai au]'))).toBe(true);
        expect(templateHasVowelSlot(parseTemplate('[ai]'))).toBe(true);
        expect(templateHasVowelSlot(parseTemplate('C[aː eː]'))).toBe(true);
    });

    it('accepts a profile whose only vowels come from a diphthong group (D1)', () => {
        const result = validateGeneratorSettings({
            profile: { syllables: [{ pattern: 'C[ai au]', weight: 1 }] },
        });
        expect(result.issues).toEqual([]);
        expect(result.settings.profile.syllables).toEqual([{ pattern: 'C[ai au]', weight: 1 }]);
    });

    it('still refuses a group that can come out a consonant', () => {
        expect(templateHasVowelSlot(parseTemplate('C[a n]'))).toBe(false);
        expect(templateHasVowelSlot(parseTemplate('C[ai ka]'))).toBe(false);
        expect(templateHasVowelSlot(parseTemplate('C[t͡ʃ]'))).toBe(false);
    });

    it('still refuses a group of symbols it cannot classify', () => {
        expect(templateHasVowelSlot(parseTemplate('C[¤ §]'))).toBe(false);
        expect(templateHasVowelSlot(parseTemplate('C[a ¤]'))).toBe(false);
    });

    it('keeps a consonant-only template as long as SOME template has a vowel', () => {
        // The spec's rule is about the WORD, not about every syllable: `C` on
        // its own is a legal shape next to a `CV`.
        const result = validateGeneratorSettings({
            profile: { syllables: [{ pattern: 'C', weight: 1 }, { pattern: 'CV', weight: 4 }] },
        });
        expect(result.issues).toEqual([]);
        expect(result.settings.profile.syllables.map((s) => s.pattern)).toEqual(['C', 'CV']);
    });

    it('discards the WHOLE template set when nothing in it can make a vowel', () => {
        // Pinned, not changed: a half-kept set would generate consonant runs,
        // and the issue makes the strict `update()` reject the write anyway.
        const result = validateGeneratorSettings({
            profile: { syllables: [{ pattern: 'C', weight: 1 }, { pattern: 'CNL', weight: 1 }] },
        });
        expect(result.issues.map((issue) => issue.path)).toEqual(['profile.syllables']);
        expect(result.settings.profile.syllables).toEqual(DEFAULT_PROFILE.syllables);
    });

    it('counts an OPTIONAL vowel slot — the question is what the template CAN do', () => {
        expect(templateHasVowelSlot(parseTemplate('C(V)'))).toBe(true);
        expect(templateHasVowelSlot(parseTemplate('C([ai])'))).toBe(true);
        expect(validateGeneratorSettings({ profile: { syllables: [{ pattern: 'C(V)', weight: 1 }] } }).issues)
            .toEqual([]);
    });
});

// =============================================================================
// 3. The template parser
// =============================================================================

describe('audit — template parser', () => {
    it('reports the position of every syntax error it can raise', () => {
        const cases: [string, number][] = [
            ['cv', 0],            // lower case is an error, never a silent upcase
            ['C1', 1],            // digits: there is no weighted-optional syntax in v1
            ['CV.', 2],           // a separator outside a literal group
            ['CV]', 2],
            ['C)', 1],
            ['((C))', 1],         // the INNER parenthesis
            ['(CC)', 2],          // the second item
            ['[C', 0],            // unclosed: the caret goes on the bracket
            ['(C', 0],
            ['[]', 0],
            ['', 0],
            ['   ', 0],
        ];
        for (const [pattern, position] of cases) {
            const check = isValidTemplatePattern(pattern);
            expect(check.ok, pattern).toBe(false);
            if (!check.ok) expect(check.position, pattern).toBe(position);
        }
    });

    it('treats a group of only spaces as empty rather than as a one-space member', () => {
        const check = isValidTemplatePattern('[ ]');
        expect(check.ok).toBe(false);
        if (!check.ok) expect(check.message).toMatch(/cannot be empty/);
    });

    it('ignores whitespace OUTSIDE a group but splits on it INSIDE one', () => {
        expect(parseTemplate('  C  V  ')).toEqual(parseTemplate('CV'));
        expect(parseTemplate('[t͡ʃ k]')).toEqual([
            { kind: 'literal', members: ['t͡ʃ', 'k'], optional: false },
        ]);
    });

    it('splits an unspaced group into PHONEMES, which splits a tie-barless affricate', () => {
        // Documented rule, pinned because it is the one surprising thing in the
        // grammar: `[tʃ]` is t + ʃ, `[tʃ k]` is tʃ + k, `[t͡ʃk]` is t͡ʃ + k.
        expect(parseTemplate('[tʃ]')).toEqual([
            { kind: 'literal', members: ['t', 'ʃ'], optional: false },
        ]);
        expect(parseTemplate('[tʃ k]')).toEqual([
            { kind: 'literal', members: ['tʃ', 'k'], optional: false },
        ]);
        expect(parseTemplate('[t͡ʃk]')).toEqual([
            { kind: 'literal', members: ['t͡ʃ', 'k'], optional: false },
        ]);
    });

    it('silently drops a separator inside an unspaced literal group', () => {
        // Open question, pinned: `[a.k]` gives a + k because `splitPhonemeString`
        // strips separators. Erroring instead would be defensible; silently
        // producing a DIFFERENT group is the mild sharp edge, and it only bites
        // a user who typed a syllable dot inside a bracket.
        expect(parseTemplate('[a.k]')).toEqual([
            { kind: 'literal', members: ['a', 'k'], optional: false },
        ]);
        const check = isValidTemplatePattern('[.]');
        expect(check.ok).toBe(false);
    });

    it('accepts a pattern at the length limit and the validator rejects one past it', () => {
        const atLimit = 'CV'.repeat(LIMITS.MAX_PATTERN_LENGTH / 2);
        expect(atLimit).toHaveLength(LIMITS.MAX_PATTERN_LENGTH);
        expect(isValidTemplatePattern(atLimit).ok).toBe(true);
        expect(validateGeneratorSettings({ profile: { syllables: [{ pattern: atLimit, weight: 1 }] } }).issues)
            .toEqual([]);

        const past = `${atLimit}V`;
        expect(paths({ profile: { syllables: [{ pattern: past, weight: 1 }] } }))
            .toEqual(['profile.syllables[0].pattern', 'profile.syllables']);
    });

    it('does not blow the stack on a long but legal pattern', () => {
        const long = 'C'.repeat(500) + 'V';
        expect(() => parseTemplate(long)).not.toThrow();
        expect(parseTemplate(long)).toHaveLength(501);
    });

    it('throws a real TemplateSyntaxError with a usable prototype chain', () => {
        try {
            parseTemplate('CVq');
            expect.unreachable('should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(TemplateSyntaxError);
            expect(error).toBeInstanceOf(Error);
            expect((error as TemplateSyntaxError).position).toBe(2);
            expect((error as TemplateSyntaxError).name).toBe('TemplateSyntaxError');
        }
    });

    it('resolves optionals deterministically at the two ends of the rng range', () => {
        const items = parseTemplate('(C)V(N)');
        expect(expandTemplate(items, () => 0).map((i) => (i as { letter: string }).letter))
            .toEqual(['C', 'V', 'N']);
        expect(expandTemplate(items, () => 0.999).map((i) => (i as { letter: string }).letter))
            .toEqual(['V']);
        // The threshold is HALF-OPEN: exactly 0.5 drops. mulberry32 returns
        // [0,1), so a value of exactly 0.5 is reachable and must not be a
        // coin-flip that depends on rounding.
        expect(expandTemplate(items, () => 0.5).map((i) => (i as { letter: string }).letter))
            .toEqual(['V']);
    });

    it('returns items with no optionality left, and does not mutate its input', () => {
        const items = parseTemplate('(C)V');
        const before = JSON.stringify(items);
        const expanded = expandTemplate(items, () => 0);
        expect(expanded.every((item: TemplateItem) => item.optional === false)).toBe(true);
        expect(JSON.stringify(items)).toBe(before);
    });
});

// =============================================================================
// 4. The presets, read as data and as language
// =============================================================================

describe('audit — presets as data', () => {
    it('resolves every sound of every tier, and files vowels as vowels', () => {
        for (const preset of PRESETS) {
            const all = [
                ...preset.sounds.core, ...preset.sounds.flavour, ...preset.sounds.avoid,
                ...preset.vowels.core, ...preset.vowels.flavour,
            ];
            for (const sound of all) {
                expect(describePhoneme(sound), `${preset.id}: ${sound}`).not.toBeNull();
            }
            for (const vowel of [...preset.vowels.core, ...preset.vowels.flavour]) {
                expect(describePhoneme(vowel)?.kind, `${preset.id}: ${vowel}`).toBe('vowel');
            }
            for (const consonant of [...preset.sounds.core, ...preset.sounds.flavour]) {
                expect(describePhoneme(consonant)?.kind, `${preset.id}: ${consonant}`).toBe('consonant');
            }
        }
    });

    it('keys the cross-tier collision check by BASE, not by spelling', () => {
        // The implementer's suite asserts "no base in two tiers"; this asserts
        // the check has teeth, by showing that two DIFFERENT spellings of one
        // base really do collapse together.
        for (const preset of PRESETS) {
            const tierOf = new Map<string, string>();
            const record = (sounds: readonly string[], tier: string) => {
                for (const sound of sounds) {
                    const base = describePhoneme(sound)?.base ?? sound;
                    expect(tierOf.get(base) ?? tier, `${preset.id}: ${sound} -> ${base}`).toBe(tier);
                    tierOf.set(base, tier);
                }
            };
            record([...preset.sounds.core, ...preset.vowels.core], 'core');
            record([...preset.sounds.flavour, ...preset.vowels.flavour], 'flavour');
            record(preset.sounds.avoid, 'avoid');
        }
        // Sinitic is the preset that proves the collapse happens: `p` and `pʰ`
        // are two core entries sharing one base, and the guide has one key.
        const sinitic = getPreset('sinitic')!;
        expect(sinitic.sounds.core).toContain('p');
        expect(sinitic.sounds.core).toContain('pʰ');
        expect(guideMapFor(sinitic).get('p')).toBe('core');
    });

    it('parses every template of every preset and gives each a vowel slot', () => {
        for (const preset of PRESETS) {
            expect(preset.profile.syllables.length, preset.id).toBeGreaterThan(0);
            for (const template of preset.profile.syllables) {
                expect(isValidTemplatePattern(template.pattern).ok, `${preset.id}: ${template.pattern}`).toBe(true);
                expect(template.weight).toBeGreaterThan(0);
                expect(template.weight).toBeLessThanOrEqual(LIMITS.MAX_TEMPLATE_WEIGHT);
            }
            expect(
                preset.profile.syllables.some((t) => templateHasVowelSlot(parseTemplate(t.pattern))),
                preset.id,
            ).toBe(true);
        }
    });

    it('applies to a profile that validates with ZERO issues, for every preset', () => {
        for (const preset of PRESETS) {
            const profile = applyPreset(preset, cloneDefaultProfile());
            expect(validateGeneratorSettings({ profile }).issues, preset.id).toEqual([]);
            expect(profile.presetId).toBe(preset.id);
            expect(profile.version).toBe(1);
        }
    });

    it('cannot be aliased: editing an applied profile leaves the preset module untouched', () => {
        for (const preset of PRESETS) {
            const before = JSON.stringify(preset);
            const profile = applyPreset(preset, cloneDefaultProfile());
            profile.inventory.push('ZZZ');
            profile.syllables.push({ pattern: 'CV', weight: 1 });
            profile.syllables[0].weight = 999;
            profile.clusters.maxPerWord = 4;
            profile.phonemeTilt.ZZZ = 'off';
            profile.forbidden.push('zz');
            expect(JSON.stringify(preset), preset.id).toBe(before);
        }
    });

    it('produces an inventory with no duplicates and no avoided sound', () => {
        for (const preset of PRESETS) {
            const inventory = presetInventory(preset);
            expect(new Set(inventory).size, preset.id).toBe(inventory.length);
            expect(inventory.length).toBeLessThanOrEqual(LIMITS.MAX_INVENTORY);
            for (const avoided of preset.sounds.avoid) {
                expect(inventory, `${preset.id}: ${avoided}`).not.toContain(avoided);
            }
        }
    });

    it('tilts nothing it does not ship', () => {
        for (const preset of PRESETS) {
            const inventory = new Set(presetInventory(preset));
            for (const sound of Object.keys(preset.profile.phonemeTilt ?? {})) {
                expect(inventory.has(sound), `${preset.id}: ${sound}`).toBe(true);
            }
        }
    });
});

describe('audit — presets as language', () => {
    it('gives Japanese ɯ and not u', () => {
        const japanese = getPreset('japanese')!;
        expect(japanese.vowels.core).toContain('ɯ');
        expect([...japanese.vowels.core, ...japanese.vowels.flavour]).not.toContain('u');
        // …and avoids the sounds that break the illusion fastest.
        expect(japanese.sounds.avoid).toEqual(expect.arrayContaining(['l', 'v', 'θ', 'ð', 'f', 'ʃ']));
    });

    it('cannot end a Sinitic syllable in m', () => {
        // The coda is a LITERAL group of n and ŋ, not the `N` class — which is
        // the whole reason literal groups are in the grammar.
        const sinitic = getPreset('sinitic')!;
        // Only the CONSONANTAL literal groups are codas. Phase 3 gave the preset
        // a second kind of literal — the diphthong nucleus `[ai ɛi au ou]` — and
        // a naive "last item of every template" would sweep those up too.
        const codas = sinitic.profile.syllables.flatMap((template) => {
            const items = parseTemplate(template.pattern);
            const last = items[items.length - 1];
            if (last.kind !== 'literal') return [];
            const consonantal = last.members.every((member) => describePhoneme(member)?.kind === 'consonant');
            return consonantal ? last.members : [];
        });
        expect(codas).toEqual(['n', 'ŋ']);
        for (const template of sinitic.profile.syllables) {
            const items = parseTemplate(template.pattern);
            expect(items.some((item) => item.kind === 'class' && item.letter === 'N')).toBe(false);
        }
        expect(sinitic.sounds.core).toContain('m');   // m exists — it just cannot be a coda
    });

    it('makes a cluster impossible for island: no template has two adjacent consonant slots', () => {
        const island = getPreset('island')!;
        expect(island.profile.clusters.maxPerWord).toBe(0);
        for (const template of island.profile.syllables) {
            const items = parseTemplate(template.pattern);
            for (let i = 0; i < items.length - 1; i += 1) {
                const pair = [items[i], items[i + 1]];
                const bothConsonantal = pair.every((item) => (item.kind === 'class'
                    ? item.letter !== 'V'
                    : item.members.every((m) => describePhoneme(m)?.kind === 'consonant')));
                expect(bothConsonantal, `${template.pattern} at ${i}`).toBe(false);
            }
        }
    });

    it('switches the sibilant-onset exception on for exactly the two cluster flavours', () => {
        const withException = PRESETS
            .filter((preset) => preset.profile.clusters.sibilantOnsetException)
            .map((preset) => preset.id);
        expect(withException.sort()).toEqual(['guttural', 'slavic']);
        // …and both of them actually ship a sibilant to use it with.
        for (const id of withException) {
            const preset = getPreset(id)!;
            const sibilants = presetInventory(preset).filter((sound) => {
                const features = describePhoneme(sound);
                return features !== null && features.kind === 'consonant' && features.sibilant;
            });
            expect(sibilants.length, id).toBeGreaterThan(0);
        }
    });

    it('keeps every guttural sound out of the flowing flavour', () => {
        const flowing = getPreset('flowing')!;
        const gutturals = ['q', 'χ', 'ʁ', 'x', 'ɣ', 'ʕ', 'ħ', 'ʔ'];
        for (const sound of gutturals) {
            expect(flowing.sounds.core, sound).not.toContain(sound);
            expect(flowing.sounds.flavour, sound).not.toContain(sound);
        }
        expect(flowing.sounds.avoid).toEqual(expect.arrayContaining(['q', 'χ', 'ʁ', 'ʔ', 'x', 'ʕ', 'ħ']));
    });

    it('gives the two cluster-heavy flavours a real cluster budget and the open ones none', () => {
        const budget = Object.fromEntries(PRESETS.map((p) => [p.id, p.profile.clusters.maxPerWord]));
        expect(budget.island).toBe(0);
        expect(budget.japanese).toBe(0);
        expect(budget.sinitic).toBe(0);
        expect(budget.guttural).toBeGreaterThanOrEqual(2);
        expect(budget.slavic).toBeGreaterThanOrEqual(2);
        for (const preset of PRESETS) {
            expect(preset.profile.clusters.maxPerWord, preset.id)
                .toBeLessThanOrEqual(LIMITS.MAX_CLUSTERS_PER_WORD);
        }
    });

    it('stays inside every LIMIT and keeps counts sane', () => {
        for (const preset of PRESETS) {
            const { syllableCount, syllables, longVowelChance } = preset.profile;
            expect(syllables.length, preset.id).toBeLessThanOrEqual(LIMITS.MAX_TEMPLATES);
            expect(syllableCount.min).toBeGreaterThanOrEqual(LIMITS.MIN_SYLLABLE_COUNT);
            expect(syllableCount.max).toBeLessThanOrEqual(LIMITS.MAX_SYLLABLE_COUNT);
            expect(syllableCount.max).toBeGreaterThanOrEqual(syllableCount.min);
            expect(longVowelChance).toBeGreaterThanOrEqual(0);
            expect(longVowelChance).toBeLessThanOrEqual(1);
        }
    });
});

// =============================================================================
// 5. Coverage and the guide map
// =============================================================================

describe('audit — coverage', () => {
    const affricates = {
        ...getPreset('flowing')!,
        sounds: { core: ['t͡ʃ', 'pʰ'], flavour: [], avoid: [] },
        vowels: { core: [], flavour: [] },
    };

    it('scores 0 and lists everything missing for an empty conlang', () => {
        for (const preset of PRESETS) {
            const coverage = computeCoverage(preset, []);
            expect(coverage.score, preset.id).toBe(0);
            expect(coverage.core.present, preset.id).toEqual([]);
            expect(coverage.core.missing.length, preset.id).toBeGreaterThan(0);
            expect(coverage.avoidPresent, preset.id).toEqual([]);
        }
    });

    it('scores exactly 1 against a preset\'s own inventory', () => {
        for (const preset of PRESETS) {
            const coverage = computeCoverage(preset, presetInventory(preset));
            expect(coverage.score, preset.id).toBe(1);
            expect(coverage.core.missing, preset.id).toEqual([]);
        }
    });

    it('keeps the score inside [0,1] for every preset and every partial inventory', () => {
        for (const preset of PRESETS) {
            const full = presetInventory(preset);
            for (const size of [0, 1, Math.floor(full.length / 2), full.length]) {
                const coverage = computeCoverage(preset, full.slice(0, size));
                expect(coverage.score, `${preset.id}/${size}`).toBeGreaterThanOrEqual(0);
                expect(coverage.score, `${preset.id}/${size}`).toBeLessThanOrEqual(1);
            }
        }
    });

    it('matches a tie-barless affricate but not a plain stop against an aspirated one', () => {
        expect(computeCoverage(affricates, ['tʃ']).core.present).toEqual(['t͡ʃ']);
        expect(computeCoverage(affricates, ['t͡ʃ']).core.present).toEqual(['t͡ʃ']);
        expect(computeCoverage(affricates, ['p']).core.present).toEqual([]);
        expect(computeCoverage(affricates, ['pʰ']).core.present).toEqual(['pʰ']);
        expect(computeCoverage(affricates, ['pʰ', 'tʃ']).score).toBe(1);
    });

    it('DOES match the legacy ʧ ligature (U+02A7) against t͡ʃ', () => {
        // FIXED in Phase 6 (this test was the Phase 2 pin, inverted). The six
        // withdrawn ligatures are registered in `phonology/features.ts` as
        // aliases of the tie-bar affricates — same `base`, exactly like the
        // `ɡ`→`g` alias — so a user pasting from a pre-1976 grammar gets the
        // sound classified, charted and counted instead of falling back to the
        // raw text.
        expect(describePhoneme('ʧ')?.base).toBe('t͡ʃ');
        expect(computeCoverage(affricates, ['ʧ']).core.present).toEqual(['t͡ʃ']);

        const LIGATURES = [
            ['ʧ', 't͡ʃ'],
            ['ʤ', 'd͡ʒ'],
            ['ʦ', 't͡s'],
            ['ʣ', 'd͡z'],
            ['ʨ', 't͡ɕ'],
            ['ʥ', 'd͡ʑ'],
        ] as const;
        for (const [ligature, canonical] of LIGATURES) {
            expect(describePhoneme(ligature)?.base, ligature).toBe(canonical);
            // The whole point of the alias: one identity for both spellings.
            expect(phonemeIdentity(ligature), ligature).toBe(phonemeIdentity(canonical));
        }
    });

    it('survives a phoneme it cannot classify without throwing, and matches it to itself', () => {
        const junk = { ...affricates, sounds: { core: ['zzz'], flavour: [], avoid: [] } };
        expect(() => computeCoverage(junk, ['zzz', '', 'ʧ'])).not.toThrow();
        expect(computeCoverage(junk, ['zzz']).core.present).toEqual(['zzz']);
        expect(computeCoverage(junk, ['qqq']).core.present).toEqual([]);
    });

    it('ignores non-string and empty conlang entries', () => {
        const dirty = [null, undefined, 42, {}, '', 'l'] as unknown as string[];
        const coverage = computeCoverage(getPreset('flowing')!, dirty);
        expect(coverage.core.present).toEqual(['l']);
    });

    it('puts vowels in the guide map alongside consonants', () => {
        for (const preset of PRESETS) {
            const guide = guideMapFor(preset);
            for (const vowel of preset.vowels.core) {
                const base = describePhoneme(vowel)!.base;
                expect(guide.get(base), `${preset.id}: ${vowel}`).toBe('core');
            }
            for (const vowel of preset.vowels.flavour) {
                const base = describePhoneme(vowel)!.base;
                expect(guide.get(base), `${preset.id}: ${vowel}`).toBe('flavour');
            }
        }
    });

    it('paints avoided sounds and gives core precedence over everything', () => {
        const preset = {
            ...getPreset('flowing')!,
            sounds: { core: ['p'], flavour: ['pʰ'], avoid: ['p'] },
            vowels: { core: ['a'], flavour: [] },
        };
        const guide = guideMapFor(preset);
        // `p`, `pʰ` and the avoided `p` share ONE base; core wins.
        expect(guide.get('p')).toBe('core');
        expect(guide.get('a')).toBe('core');
    });

    it('never puts an unresolved key in a real preset\'s guide map', () => {
        for (const preset of PRESETS) {
            for (const base of guideMapFor(preset).keys()) {
                expect(describePhoneme(base), `${preset.id}: ${base}`).not.toBeNull();
            }
        }
    });
});

// =============================================================================
// 6. Ratchets — bytes, imports, and the one-way dependency on the db
// =============================================================================

describe('audit — source ratchets', () => {
    const FILES = collectAll(GENERATOR);

    it('collected the tree it is supposed to police', () => {
        expect(FILES.length).toBeGreaterThanOrEqual(24);
    });

    it('contains no control byte other than tab, CR and LF (D3)', () => {
        // A raw NUL inside a template literal made `coverage.ts` register as
        // BINARY to `file`, `grep -r` and `git diff` — the module was invisible
        // to every text tool in the repo.
        const offenders: string[] = [];
        for (const file of FILES) {
            const bytes = readFileSync(file);
            for (let i = 0; i < bytes.length; i += 1) {
                const byte = bytes[i];
                if (byte < 0x09 || (byte > 0x0d && byte < 0x20) || byte === 0x7f) {
                    offenders.push(`${relative(GENERATOR, file).split(sep).join('/')} @${i} = 0x${byte.toString(16)}`);
                    break;
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it('has no side-effect or dynamic import that the `from`-based ratchet would miss', () => {
        // `sources.test.ts` matches `import … from '…'`; a bare `import 'react'`
        // or an `await import('../db')` would slip past it. Nothing in the tree
        // uses either form, and this pins that.
        const offenders: string[] = [];
        for (const file of FILES) {
            const name = relative(GENERATOR, file).split(sep).join('/');
            // Tests are exempt for the same reason `sources.test.ts` exempts
            // them: a test may reach for the db deliberately (this file does,
            // to show the seam has no cycle). The rule is about SOURCE.
            if (name.includes('__tests__')) continue;
            const source = readFileSync(file, 'utf8');
            const bare = /(^|\n)\s*import\s+['"]([^'"]+)['"]/g;
            let match = bare.exec(source);
            while (match !== null) {
                offenders.push(`${name} -> bare ${match[2]}`);
                match = bare.exec(source);
            }
            const dynamic = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;
            match = dynamic.exec(source);
            while (match !== null) {
                offenders.push(`${name} -> dynamic ${match[1]}`);
                match = dynamic.exec(source);
            }
            if (/\brequire\s*\(/.test(source)) offenders.push(`${name} -> require()`);
        }
        expect(offenders).toEqual([]);
    });

    it('never names the db, React or a component anywhere in the non-test tree', () => {
        // Belt to the other file's braces: a substring check rather than an
        // import-position one, so a `vi.mock`-style string or a type-only
        // reference could not sneak the dependency in either.
        const offenders: string[] = [];
        for (const file of FILES) {
            const name = relative(GENERATOR, file).split(sep).join('/');
            if (name.includes('__tests__')) continue;
            const source = readFileSync(file, 'utf8');
            for (const banned of ["'react", '"react', "../db", "../../db", 'components/']) {
                if (source.includes(banned)) offenders.push(`${name} -> ${banned}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('keeps the profile module free of any dependency on the presets', () => {
        // The arrow runs presets -> profile. Reversing it (to validate
        // `guidePresetId` against `PRESET_IDS`, say) would make a cycle.
        for (const file of collectAll(join(GENERATOR, 'profile'))) {
            const source = readFileSync(file, 'utf8');
            expect(source.includes('../presets'), file).toBe(false);
        }
    });
});

// =============================================================================
// 7. The seam with the db layer, from the generator's side
// =============================================================================

describe('audit — the db seam does not create a cycle', () => {
    it('gives a complete generator default when the DB BARREL is imported first', async () => {
        // The cycle risk is real: `src/db/api/types.ts` VALUE-imports
        // `DEFAULT_WORD_GENERATOR_SETTINGS`. If anything under
        // `generator/profile/`'s import graph reached back into `src/db`, one
        // load order would evaluate the default as `undefined` and every
        // settings consumer would see an empty profile.
        const [{ DEFAULT_SETTINGS }, { DEFAULT_WORD_GENERATOR_SETTINGS }] = await Promise.all([
            import('../../db/api/types'),
            import('../profile/defaults'),
        ]);
        expect(DEFAULT_SETTINGS.wordGenerator).toBeDefined();
        expect(DEFAULT_SETTINGS.wordGenerator.profile.syllables.length).toBeGreaterThan(0);
        expect(DEFAULT_SETTINGS.wordGenerator).toEqual(DEFAULT_WORD_GENERATOR_SETTINGS);
    });

    it('does not let two settings snapshots share the generator default', async () => {
        const { cloneDefaultSettings } = await import('../../db/api/settingsSchema');
        const { DEFAULT_SETTINGS } = await import('../../db/api/types');
        const first = cloneDefaultSettings();
        const second = cloneDefaultSettings();

        first.wordGenerator.profile.syllables.push({ pattern: 'CCV', weight: 1 });
        first.wordGenerator.profile.inventory.push('zzz');
        first.wordGenerator.guidePresetId = 'flowing';

        expect(second.wordGenerator.profile.syllables).toHaveLength(DEFAULT_PROFILE.syllables.length);
        expect(second.wordGenerator.guidePresetId).toBeNull();
        expect(DEFAULT_SETTINGS.wordGenerator.profile.inventory).toEqual([]);
        expect(DEFAULT_PROFILE.inventory).toEqual([]);
    });

    it('accepts a partial wordGenerator with no guidePresetId — and SILENTLY drops the guide', async () => {
        // Pinned as a hazard, not as a bug: "absent is a default, not an issue"
        // is load-bearing (an older stored object must boot without a warning),
        // so a page that spreads only `{ profile }` cannot be caught by the
        // validator. The plan's own pitfall says the page must spread the whole
        // key; this is the test that shows what happens when it does not.
        const { validateSettings } = await import('../../db/api/settingsSchema');
        const withGuide = validateSettings({ wordGenerator: { profile: cloneDefaultProfile(), guidePresetId: 'flowing' } });
        expect(withGuide.issues).toEqual([]);
        expect(withGuide.settings.wordGenerator.guidePresetId).toBe('flowing');

        const partial = validateSettings({ wordGenerator: { profile: cloneDefaultProfile() } });
        expect(partial.issues).toEqual([]);
        expect(partial.settings.wordGenerator.guidePresetId).toBeNull();
    });

    it('prefixes the generator\'s issue paths and reports the key itself at the root', async () => {
        const { validateSettings } = await import('../../db/api/settingsSchema');
        expect(validateSettings({ wordGenerator: 7 }).issues.map((i) => i.path)).toContain('wordGenerator');
        expect(validateSettings({ wordGenerator: { profile: { longVowelChance: 9 } } }).issues.map((i) => i.path))
            .toContain('wordGenerator.profile.longVowelChance');
        expect(validateSettings({ wordGenerator: { stray: 1 } }).issues.map((i) => i.path))
            .toContain('wordGenerator.stray');
    });

    it('says nothing at all about a settings object written before the generator existed', async () => {
        const { validateSettings, cloneDefaultSettings } = await import('../../db/api/settingsSchema');
        const { wordGenerator: _dropped, ...legacy } = cloneDefaultSettings();
        const result = validateSettings(legacy);
        expect(result.issues).toEqual([]);
        expect(result.settings.wordGenerator).toEqual(validateGeneratorSettings(undefined).settings);
    });
});
