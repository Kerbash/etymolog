/**
 * The preset example words, and the diphthong convention.
 *
 * `FlavourPreset.examples` is DATA — six words pasted into each preset module,
 * because a preset file must not run the engine at import time. Data that is
 * really a cached computation goes stale silently, so this file recomputes it:
 * the ratchet regenerates every preset's examples with the documented inputs
 * (seed 1, count 6, the preset's own inventory, no lexicon) and asserts they
 * still match. Any change to the ranking, the curve, the constraints or a
 * preset's profile fails here, and the fix is to look at the new words, decide
 * they are good, and paste them in.
 *
 * The second half pins a convention the type system cannot: a preset that
 * DECLARES diphthongs has to use them. `flowing` shipped `['ai','au','ei']` with
 * no template that could ever produce one — a declaration that did nothing, and
 * that a reader would reasonably take as a promise about the output.
 *
 * Node environment.
 */

import { describe, expect, it } from 'vitest';
import { applyPreset, presetInventory, PRESETS } from '../index';
import { cloneDefaultProfile } from '../../profile/defaults';
import { deriveInventory } from '../../inventory';
import { generateWords } from '../../engine/generate';
import { parseTemplate } from '../../engine/template';
import { describePhoneme, phonemeIdentity } from '../../phonology/features';
import { splitPhonemeString } from '../../phonology/tokenize';
import type { FlavourPreset } from '../types';

/** How `examples` is generated. Change this and the pasted data must change with it. */
const EXAMPLE_SEED = 1;
const EXAMPLE_COUNT = 6;

function regenerate(preset: FlavourPreset): ReturnType<typeof generateWords> {
    const profile = applyPreset(preset, cloneDefaultProfile());
    const inventory = deriveInventory(presetInventory(preset), profile);
    return generateWords(profile, inventory, { count: EXAMPLE_COUNT, seed: EXAMPLE_SEED });
}

describe.each(PRESETS.map((preset) => [preset.id, preset] as const))('%s examples', (_id, preset) => {
    const batch = regenerate(preset);

    it('regenerates exactly the words that are pasted into the preset module', () => {
        expect(batch.words.map((word) => word.ipa)).toEqual(preset.examples);
    });

    it('ships six of them', () => {
        expect(preset.examples).toHaveLength(EXAMPLE_COUNT);
        expect(new Set(preset.examples).size).toBe(EXAMPLE_COUNT);
        for (const example of preset.examples) expect(example.length).toBeGreaterThan(0);
    });

    it('generates them with no shortfall and no warning', () => {
        // A warning here means the preset's own inventory cannot satisfy its own
        // templates — the exact bug the sinitic `ei` diphthong had.
        expect(batch.shortfall).toBeUndefined();
        expect(batch.warnings).toEqual([]);
    });

    it('builds them only out of the preset inventory', () => {
        const allowed = new Set(presetInventory(preset).map(phonemeIdentity));
        for (const example of preset.examples) {
            for (const token of splitPhonemeString(example)) {
                const short = token.text.replace(/ː/g, '');
                expect(
                    allowed.has(phonemeIdentity(token.text)) || allowed.has(phonemeIdentity(short)),
                    `${preset.id}: ${example} / ${token.text}`,
                ).toBe(true);
            }
        }
    });
});

describe('the diphthong convention', () => {
    /** Every literal-group member named by any of a preset's templates. */
    function literalMembers(preset: FlavourPreset): string[] {
        const members: string[] = [];
        for (const template of preset.profile.syllables) {
            for (const item of parseTemplate(template.pattern)) {
                if (item.kind === 'literal') members.push(...item.members);
            }
        }
        return members;
    }

    it.each(PRESETS.map((preset) => [preset.id, preset] as const))(
        '%s uses every diphthong it declares in at least one template',
        (_id, preset) => {
            // Presets with no `diphthongs` are exempt: slavic spreads its vowel
            // sequences across syllables and says so.
            if (!preset.diphthongs || preset.diphthongs.length === 0) {
                expect(preset.diphthongs ?? []).toEqual([]);
                return;
            }
            const members = new Set(literalMembers(preset).map(phonemeIdentity));
            for (const diphthong of preset.diphthongs) {
                expect(members.has(phonemeIdentity(diphthong)), `${preset.id}: ${diphthong}`).toBe(true);
            }
        },
    );

    it.each(PRESETS.map((preset) => [preset.id, preset] as const))(
        '%s declares only diphthongs its own vowels can spell',
        (_id, preset) => {
            const inventory = new Set(presetInventory(preset).map(phonemeIdentity));
            for (const diphthong of preset.diphthongs ?? []) {
                const tokens = splitPhonemeString(diphthong);
                expect(tokens.length, diphthong).toBeGreaterThan(1);
                for (const token of tokens) {
                    expect(describePhoneme(token.text)?.kind, `${preset.id}: ${diphthong}`).toBe('vowel');
                    expect(inventory.has(phonemeIdentity(token.text)), `${preset.id}: ${diphthong} / ${token.text}`).toBe(true);
                }
            }
        },
    );

    it('at least one preset actually declares diphthongs, so the rule is not vacuous', () => {
        const declaring = PRESETS.filter((preset) => (preset.diphthongs?.length ?? 0) > 0);
        expect(declaring.length).toBeGreaterThanOrEqual(6);
    });

    it('reaches the output: the diphthong templates really fire', () => {
        for (const preset of PRESETS) {
            if (!preset.diphthongs?.length) continue;
            const profile = applyPreset(preset, cloneDefaultProfile());
            const inventory = deriveInventory(presetInventory(preset), profile);
            const batch = generateWords(profile, inventory, { count: 200, seed: 5 });
            const found = batch.words.some((word) => preset.diphthongs!.some((diphthong) => word.ipa.includes(diphthong)));
            expect(found, preset.id).toBe(true);
        }
    });
});
