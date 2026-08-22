/**
 * `deriveInventory` — a list of sounds becomes something the engine can pick from.
 *
 * The interesting behaviour is all about IDENTITY: the same sound spelt two ways
 * must not become two members, and a sound the table cannot read must be set
 * aside rather than dropped on the floor.
 *
 * Node environment.
 */

import { describe, expect, it } from 'vitest';
import { deriveInventory, inventoryHas } from '../inventory';
import { cloneDefaultProfile } from '../profile/defaults';
import { CLASS_LETTERS } from '../phonology/classes';
import { applyPreset, presetInventory, PRESETS } from '../presets';
import type { WordGeneratorProfile } from '../profile/types';

function profileWith(patch: Partial<WordGeneratorProfile>): WordGeneratorProfile {
    return { ...cloneDefaultProfile(), ...patch };
}

describe('deriveInventory — classification', () => {
    it('classifies every sound it is given', () => {
        const inventory = deriveInventory(['k', 'a', 'ʃ'], profileWith({}));
        expect(inventory.members.map((member) => member.phoneme)).toEqual(['k', 'a', 'ʃ']);
        expect(inventory.members[0].features.kind).toBe('consonant');
        expect(inventory.members[1].features.kind).toBe('vowel');
    });

    it('records the classes a sound can fill', () => {
        const inventory = deriveInventory(['ʃ', 'm', 'a'], profileWith({}));
        expect(inventory.members[0].classes).toEqual(['C', 'F', 'S', 'O']);
        expect(inventory.members[1].classes).toEqual(['C', 'N', 'R']);
        expect(inventory.members[2].classes).toEqual(['V']);
    });

    it('indexes by class, with every letter present even when empty', () => {
        const inventory = deriveInventory(['k', 'a'], profileWith({}));
        expect([...inventory.byClass.keys()].sort()).toEqual([...CLASS_LETTERS].sort());
        expect(inventory.byClass.get('C')).toEqual(['k']);
        expect(inventory.byClass.get('V')).toEqual(['a']);
        expect(inventory.byClass.get('N')).toEqual([]);
    });

    it('sets aside what it cannot classify instead of dropping it', () => {
        const inventory = deriveInventory(['k', 'zzz', 'a', 'zzz'], profileWith({}));
        expect(inventory.unknown).toEqual(['zzz']);
        expect(inventory.members).toHaveLength(2);
    });

    it('skips empty entries and non-strings without throwing', () => {
        const inventory = deriveInventory(
            ['k', '', null as unknown as string, 42 as unknown as string, 'a'],
            profileWith({}),
        );
        expect(inventory.members.map((member) => member.phoneme)).toEqual(['k', 'a']);
        expect(inventory.unknown).toEqual([]);
    });

    it('survives an empty source', () => {
        const inventory = deriveInventory([], profileWith({}));
        expect(inventory.members).toEqual([]);
        expect(inventory.unknown).toEqual([]);
        expect(inventory.byClass.get('V')).toEqual([]);
    });
});

describe('deriveInventory — deduplication', () => {
    it('collapses two spellings of the same sound, keeping the first', () => {
        const inventory = deriveInventory(['t͡ʃ', 'tʃ'], profileWith({}));
        expect(inventory.members.map((member) => member.phoneme)).toEqual(['t͡ʃ']);
    });

    it('keeps the first spelling even when the second is the canonical one', () => {
        const inventory = deriveInventory(['ɡ', 'g'], profileWith({}));
        expect(inventory.members.map((member) => member.phoneme)).toEqual(['ɡ']);
    });

    it('does NOT collapse sounds that differ by a modifier', () => {
        const inventory = deriveInventory(['p', 'pʰ'], profileWith({}));
        expect(inventory.members).toHaveLength(2);
    });

    it('collapses an exact repeat', () => {
        expect(deriveInventory(['k', 'k', 'k'], profileWith({})).members).toHaveLength(1);
    });
});

describe('deriveInventory — tilt and the conlang flag', () => {
    it('carries the profile tilt onto the member', () => {
        const inventory = deriveInventory(['k', 's', 'a'], profileWith({ phonemeTilt: { k: 'common', s: 'off' } }));
        expect(inventory.members.map((member) => member.tilt)).toEqual(['common', 'off', 'normal']);
    });

    it('keeps an off sound in the list — the UI shows it muted, it is not deleted', () => {
        const inventory = deriveInventory(['k', 'a'], profileWith({ phonemeTilt: { k: 'off' } }));
        expect(inventory.members).toHaveLength(2);
        expect(inventory.byClass.get('C')).toEqual(['k']);
    });

    it('leaves inConlang undefined when no script was supplied', () => {
        const inventory = deriveInventory(['k'], profileWith({}));
        expect(inventory.members[0].inConlang).toBeUndefined();
    });

    it('flags which sounds the script has, matching by identity', () => {
        const inventory = deriveInventory(['t͡ʃ', 'k'], profileWith({}), { conlangPhonemes: ['tʃ'] });
        expect(inventory.members[0].inConlang).toBe(true);
        expect(inventory.members[1].inConlang).toBe(false);
    });

    it('ignores junk in the script list', () => {
        const inventory = deriveInventory(['k'], profileWith({}), {
            conlangPhonemes: ['', null as unknown as string, 'k'],
        });
        expect(inventory.members[0].inConlang).toBe(true);
    });
});

describe('inventoryHas', () => {
    const inventory = deriveInventory(['k', 'a', 't͡ʃ'], profileWith({}));

    it('matches by identity, not by string', () => {
        expect(inventoryHas(inventory, 'k')).toBe(true);
        expect(inventoryHas(inventory, 'tʃ')).toBe(true);
        expect(inventoryHas(inventory, 'q')).toBe(false);
    });

    it('lets a long vowel match its short counterpart', () => {
        expect(inventoryHas(inventory, 'aː')).toBe(true);
    });

    it('does not let a short vowel match a long-only inventory', () => {
        const longOnly = deriveInventory(['aː'], profileWith({}));
        expect(inventoryHas(longOnly, 'a')).toBe(false);
        expect(inventoryHas(longOnly, 'aː')).toBe(true);
    });

    it('rejects a sound it cannot classify unless the inventory has the same junk', () => {
        expect(inventoryHas(inventory, 'zzz')).toBe(false);
        const withJunk = deriveInventory(['k'], profileWith({}));
        expect(inventoryHas(withJunk, 'zzz')).toBe(false);
    });

    it('gives the same answer twice — the identity cache does not go stale within one inventory', () => {
        expect(inventoryHas(inventory, 'k')).toBe(inventoryHas(inventory, 'k'));
        const rebuilt = deriveInventory(['q'], profileWith({}));
        expect(inventoryHas(rebuilt, 'k')).toBe(false);
        expect(inventoryHas(rebuilt, 'q')).toBe(true);
    });
});

describe('deriveInventory over the real presets', () => {
    it('classifies every sound of every preset with nothing unknown', () => {
        for (const preset of PRESETS) {
            const profile = applyPreset(preset, cloneDefaultProfile());
            const inventory = deriveInventory(presetInventory(preset), profile);
            expect(inventory.unknown, preset.id).toEqual([]);
            expect(inventory.members.length, preset.id).toBe(presetInventory(preset).length);
            expect(inventory.byClass.get('V')?.length, preset.id).toBeGreaterThan(2);
            expect(inventory.byClass.get('C')?.length, preset.id).toBeGreaterThan(7);
        }
    });

    it('applies each preset tilt to the right member', () => {
        for (const preset of PRESETS) {
            const profile = applyPreset(preset, cloneDefaultProfile());
            const inventory = deriveInventory(presetInventory(preset), profile);
            for (const [sound, tilt] of Object.entries(preset.profile.phonemeTilt ?? {})) {
                const member = inventory.members.find((entry) => entry.phoneme === sound);
                expect(member?.tilt, `${preset.id} ${sound}`).toBe(tilt);
            }
        }
    });
});
