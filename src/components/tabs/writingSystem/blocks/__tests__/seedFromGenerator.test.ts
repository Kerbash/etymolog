/**
 * seedFromGenerator — word shapes → block templates (plan Phase 5).
 *
 * The rules under test (see the module header): optional items expand into
 * with/without patterns, a literal group skips only the variants that contain
 * it, a repeated class letter becomes numbered roles, existing roles are
 * REUSED by matcher, a pattern that already exists (by matcher sequence) is
 * never added twice, slots start in an even row, longer patterns go first.
 */

import { describe, expect, it } from 'vitest';

import { cloneEmptyBlockScheme, validateBlockScheme } from '../../../../../blocks';
import type { BlockScheme } from '../../../../../blocks';
import { getPreset } from '../../../../../generator/presets';
import type { SyllableTemplate } from '../../../../../generator/profile/types';
import { MAX_SLOT_COUNT } from '../../../../../blocks';
import { MAX_OPTIONAL_ITEMS, describeSeedResult, seedFlexibleTemplate, seedFromGenerator } from '../seedFromGenerator';

const shapes = (...patterns: string[]): SyllableTemplate[] => patterns.map((pattern) => ({ pattern, weight: 1 }));

/** Template patterns as role LABELS, e.g. ['C1 V C2', 'C1 V']. */
function labelled(scheme: BlockScheme): string[] {
    const label = new Map(scheme.roles.map((r) => [r.id, r.label]));
    return scheme.templates.map((t) => t.pattern.map((id) => label.get(id)).join(' '));
}

describe('seedFromGenerator', () => {
    it('the island preset yields at least two templates, and a second run adds none', () => {
        const island = getPreset('island')!;
        const first = seedFromGenerator(cloneEmptyBlockScheme(), island.profile.syllables);
        expect(first.scheme.templates.length).toBeGreaterThanOrEqual(2);
        expect(first.scheme.templates.map((t) => t.name)).toEqual(['CV', 'V']);
        // The diphthong literal shape is reported, not silently dropped.
        expect(first.skipped.map((s) => s.pattern)).toEqual(['C[ai au ei ou]']);
        expect(first.skipped[0].reason).toMatch(/exact sounds/);
        // The result is a scheme the validator accepts as-is.
        expect(validateBlockScheme(first.scheme).issues).toEqual([]);

        const second = seedFromGenerator(first.scheme, island.profile.syllables);
        expect(second.added).toEqual([]);
        expect(second.rolesAdded).toEqual([]);
        expect(second.scheme.templates).toHaveLength(first.scheme.templates.length);
        expect(second.skipped.filter((s) => s.reason.includes('already exists')).map((s) => s.pattern)).toEqual(['CV', 'V']);
        expect(describeSeedResult(second)).toMatch(/No new templates/);
    });

    it('expands optional items into every with/without variant, longest first', () => {
        const result = seedFromGenerator(cloneEmptyBlockScheme(), shapes('(C)V(N)'));
        expect(result.scheme.templates.map((t) => t.name)).toEqual(['CVN', 'CV', 'VN', 'V']);
        expect(result.rolesAdded).toEqual(['C', 'V', 'N']);
        expect(result.scheme.roles.map((r) => r.matcher)).toEqual([
            { kind: 'class', letter: 'C' },
            { kind: 'class', letter: 'V' },
            { kind: 'class', letter: 'N' },
        ]);
    });

    it('a repeated letter becomes numbered roles; one role per occurrence, reused across patterns', () => {
        const result = seedFromGenerator(cloneEmptyBlockScheme(), shapes('CVC', 'CV'));
        expect(result.rolesAdded).toEqual(['C1', 'V', 'C2']);
        expect(labelled(result.scheme)).toEqual(['C1 V C2', 'C1 V']);
        for (const template of result.scheme.templates) {
            expect(new Set(template.pattern).size).toBe(template.pattern.length);
        }
        expect(validateBlockScheme(result.scheme).issues).toEqual([]);
    });

    it('lays slots out in an even row on the default form', () => {
        const [cvc] = seedFromGenerator(cloneEmptyBlockScheme(), shapes('CVC')).scheme.templates;
        expect(cvc.slots.map(({ x, y, w, h, groupId }) => ({ x, y, w, h, groupId }))).toEqual([
            { x: 0, y: 0, w: 0.333333, h: 1, groupId: null },
            { x: 0.333333, y: 0, w: 0.333333, h: 1, groupId: null },
            { x: 0.666667, y: 0, w: 0.333333, h: 1, groupId: null },
        ]);
        expect(cvc.slots.map((s) => s.roleId)).toEqual(cvc.pattern);
    });

    it('reuses existing roles by matcher and skips a hand-built template with the same pattern', () => {
        const existing: BlockScheme = {
            version: 1,
            enabled: true,
            roles: [
                { id: 'onset', label: 'Onset', matcher: { kind: 'class', letter: 'C' } },
                { id: 'nucleus', label: 'Nucleus', matcher: { kind: 'class', letter: 'V' } },
            ],
            templates: [{ id: 'mine', name: 'Mine', pattern: ['onset', 'nucleus'], slots: [
                { roleId: 'onset', groupId: null, x: 0, y: 0, w: 1, h: 0.5 },
                { roleId: 'nucleus', groupId: null, x: 0, y: 0.5, w: 1, h: 0.5 },
            ] }],
        };
        const result = seedFromGenerator(existing, shapes('CV', 'CVC'));
        expect(result.added.map((t) => t.name)).toEqual(['CVC']);
        expect(result.rolesAdded).toEqual(['C2']);
        expect(labelled(result.scheme)).toEqual(['Onset Nucleus', 'Onset Nucleus C2']);
        // Existing templates keep their position and geometry.
        expect(result.scheme.templates[0]).toBe(existing.templates[0]);
        // The input is not mutated.
        expect(existing.templates).toHaveLength(1);
        expect(existing.roles).toHaveLength(2);
    });

    it('an optional literal still yields the variant without it', () => {
        const result = seedFromGenerator(cloneEmptyBlockScheme(), shapes('CV([n ŋ])'));
        expect(result.scheme.templates.map((t) => t.name)).toEqual(['CV']);
        expect(result.skipped).toEqual([expect.objectContaining({ pattern: 'CV[n ŋ]' })]);
    });

    it('reports a pattern that does not parse, and one with too many optional parts', () => {
        const many = '(C)'.repeat(MAX_OPTIONAL_ITEMS + 1) + 'V';
        const result = seedFromGenerator(cloneEmptyBlockScheme(), shapes('C(V', many));
        expect(result.added).toEqual([]);
        expect(result.skipped.map((s) => s.pattern)).toEqual(['C(V', many]);
        expect(result.skipped[0].reason).toMatch(/cannot be read/);
        expect(result.skipped[1].reason).toMatch(/optional parts/);
    });

    it('never adds the same pattern twice from overlapping shapes', () => {
        const result = seedFromGenerator(cloneEmptyBlockScheme(), shapes('(C)V', 'CV', 'V'));
        expect(result.scheme.templates.map((t) => t.name)).toEqual(['CV', 'V']);
    });

    it('template ids are fresh tpl-<n> slugs and role ids role-<n> slugs', () => {
        const result = seedFromGenerator(cloneEmptyBlockScheme(), shapes('CV'));
        expect(result.scheme.templates.map((t) => t.id)).toEqual(['tpl-1']);
        expect(result.scheme.roles.map((r) => r.id)).toEqual(['role-1', 'role-2']);
        expect(describeSeedResult(result)).toBe('Added 1 template (CV) and 2 roles (C, V). Save to keep them.');
    });
});

describe('seedFlexibleTemplate', () => {
    /** The template's pattern as `label(min-max)` in order, e.g. ['C1(1-2)', 'V(1-1)', 'C2(0-1)']. */
    function counted(scheme: BlockScheme, templateIndex = 0): string[] {
        const label = new Map(scheme.roles.map((r) => [r.id, r.label]));
        const template = scheme.templates[templateIndex];
        return template.pattern.map((id) => {
            const slot = template.slots.find((s) => s.roleId === id)!;
            return `${label.get(id)}(${slot.min ?? 1}-${slot.max ?? 1})`;
        });
    }

    /** The result validates with NO issues and comes back byte-equal (normalised form, N1). */
    function expectNormalised(scheme: BlockScheme) {
        const validated = validateBlockScheme(scheme);
        expect(validated.issues).toEqual([]);
        expect(validated.scheme).toEqual(scheme);
    }

    it('CV + CVC + CCVC → 1 to 2 consonants at the start, up to 1 at the end, in the documented layout', () => {
        const result = seedFlexibleTemplate(cloneEmptyBlockScheme(), shapes('CV', 'CVC', 'CCVC'));
        expect(counted(result.scheme)).toEqual(['C1(1-2)', 'V(1-1)', 'C2(0-1)']);
        expect(result.added).toEqual([{ id: 'tpl-1', name: 'Syllable' }]);
        expect(result.rolesAdded).toEqual(['C1', 'V', 'C2']);
        expect(result.skipped).toEqual([]);
        const [template] = result.scheme.templates;
        const [c1, v, c2] = template.pattern;
        // Normalised slots: only the non-default count fields, no arrange.
        expect(template.slots).toEqual([
            { roleId: c1, groupId: null, x: 0, y: 0, w: 1, h: 0.5, max: 2 },
            { roleId: v, groupId: null, x: 0, y: 0.5, w: 0.5, h: 0.5 },
            { roleId: c2, groupId: null, x: 0.5, y: 0.5, w: 0.5, h: 0.5, min: 0 },
        ]);
        expectNormalised(result.scheme);
        expect(describeSeedResult(result)).toBe(
            'Added “Syllable”: 1 to 2 consonants at the start, up to 1 consonant at the end. New roles: C1, V, C2. Save to keep it.',
        );
    });

    it('(C)V → up to 1 at the start and no end box; the vowel takes the bottom', () => {
        const result = seedFlexibleTemplate(cloneEmptyBlockScheme(), shapes('(C)V'));
        expect(counted(result.scheme)).toEqual(['C1(0-1)', 'V(1-1)']);
        expect(result.rolesAdded).toEqual(['C1', 'V']);
        const [template] = result.scheme.templates;
        expect(template.slots.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual([
            { x: 0, y: 0, w: 1, h: 0.5 },
            { x: 0, y: 0.5, w: 1, h: 0.5 },
        ]);
        expect(result.flexible).toMatchObject({ outcome: 'added', end: null, start: { min: 0, max: 1 } });
        expectNormalised(result.scheme);
        expect(describeSeedResult(result)).toContain('up to 1 consonant at the start, no consonants at the end');
    });

    it('end-only and vowel-only shapes get the mirrored and whole-square layouts', () => {
        const endOnly = seedFlexibleTemplate(cloneEmptyBlockScheme(), shapes('VC', 'V'));
        expect(counted(endOnly.scheme)).toEqual(['V(1-1)', 'C1(0-1)']);
        expect(endOnly.scheme.templates[0].slots.map(({ x, y, w, h }) => ({ x, y, w, h }))).toEqual([
            { x: 0, y: 0, w: 1, h: 0.5 },
            { x: 0, y: 0.5, w: 1, h: 0.5 },
        ]);
        expectNormalised(endOnly.scheme);

        const vowelOnly = seedFlexibleTemplate(cloneEmptyBlockScheme(), shapes('V'));
        expect(counted(vowelOnly.scheme)).toEqual(['V(1-1)']);
        expect(vowelOnly.scheme.templates[0].slots[0]).toMatchObject({ x: 0, y: 0, w: 1, h: 1 });
        expectNormalised(vowelOnly.scheme);
    });

    it('any consonant letter and consonant literal groups count; an all-vowel literal counts as the vowel', () => {
        // N, S, a [n ŋ] literal, and the island preset's diphthong literal.
        const result = seedFlexibleTemplate(cloneEmptyBlockScheme(), shapes('SCV[n ŋ]', 'NV', 'C[ai au]'));
        expect(counted(result.scheme)).toEqual(['C1(1-2)', 'V(1-1)', 'C2(0-1)']);
        expect(result.skipped).toEqual([]);
        // Optional items count towards the most; an all-optional end makes it optional.
        const optional = seedFlexibleTemplate(cloneEmptyBlockScheme(), shapes('(S)(C)V(N)(C)'));
        expect(counted(optional.scheme)).toEqual(['C1(0-2)', 'V(1-1)', 'C2(0-2)']);
        expectNormalised(optional.scheme);
    });

    it('counts only before the first vowel and after the last one', () => {
        const result = seedFlexibleTemplate(cloneEmptyBlockScheme(), shapes('CVCCVC'));
        expect(counted(result.scheme)).toEqual(['C1(1-1)', 'V(1-1)', 'C2(1-1)']);
    });

    it('skips a shape with no vowel and one that cannot be read, with a reason', () => {
        const result = seedFlexibleTemplate(cloneEmptyBlockScheme(), shapes('CC', 'C(V', 'CV'));
        expect(result.skipped.map((s) => s.pattern)).toEqual(['CC', 'C(V']);
        expect(result.skipped[0].reason).toMatch(/has no vowel/);
        expect(result.skipped[1].reason).toMatch(/cannot be read/);
        expect(counted(result.scheme)).toEqual(['C1(1-1)', 'V(1-1)']);

        const none = seedFlexibleTemplate(cloneEmptyBlockScheme(), shapes('CC'));
        expect(none.added).toEqual([]);
        expect(none.scheme.templates).toEqual([]);
        expect(none.flexible?.outcome).toBe('none');
        expect(describeSeedResult(none)).toBe('No template added — none of your word shapes could be turned into a block.');

        const empty = seedFlexibleTemplate(cloneEmptyBlockScheme(), []);
        expect(describeSeedResult(empty)).toBe('Your word generator has no syllable shapes to add.');
    });

    it(`caps a box at MAX_SLOT_COUNT (${MAX_SLOT_COUNT}) and says so`, () => {
        const long = 'C'.repeat(MAX_SLOT_COUNT + 2);
        const result = seedFlexibleTemplate(cloneEmptyBlockScheme(), shapes(`${long}V${long}`));
        expect(counted(result.scheme)).toEqual([`C1(1-${MAX_SLOT_COUNT})`, 'V(1-1)', `C2(1-${MAX_SLOT_COUNT})`]);
        expect(result.flexible?.start?.capped).toBe(true);
        expectNormalised(result.scheme);
        expect(describeSeedResult(result)).toContain(`A box holds at most ${MAX_SLOT_COUNT} signs`);
    });

    it('is idempotent: a second run adds nothing and names the template already there', () => {
        const first = seedFlexibleTemplate(cloneEmptyBlockScheme(), shapes('CV', 'CCVC'));
        const second = seedFlexibleTemplate(first.scheme, shapes('CV', 'CCVC'));
        expect(second.added).toEqual([]);
        expect(second.rolesAdded).toEqual([]);
        expect(second.scheme).toBe(first.scheme);
        expect(second.flexible?.outcome).toBe('alreadyThere');
        expect(describeSeedResult(second)).toBe(
            'Nothing added — “Syllable” already does this: 1 to 2 consonants at the start, up to 1 consonant at the end.',
        );
        // Different counts are a different template: a new, uniquely named one, first in the list.
        const third = seedFlexibleTemplate(first.scheme, shapes('CCCV'));
        expect(third.scheme.templates.map((t) => t.name)).toEqual(['Syllable 2', 'Syllable']);
        expect(third.rolesAdded).toEqual([]);
    });

    it('reuses existing roles (first C = start, second C = end, first V) and goes FIRST in the list', () => {
        const existing: BlockScheme = {
            version: 1,
            enabled: true,
            roles: [
                { id: 'onset', label: 'Onset', matcher: { kind: 'class', letter: 'C' } },
                { id: 'nucleus', label: 'Nucleus', matcher: { kind: 'class', letter: 'V' } },
            ],
            templates: [
                {
                    id: 'mine',
                    name: 'Syllable',
                    pattern: ['onset', 'nucleus'],
                    slots: [
                        { roleId: 'onset', groupId: null, x: 0, y: 0, w: 1, h: 0.5 },
                        { roleId: 'nucleus', groupId: null, x: 0, y: 0.5, w: 1, h: 0.5 },
                    ],
                },
            ],
        };
        const result = seedFlexibleTemplate(existing, shapes('CV', 'CVC'));
        expect(result.rolesAdded).toEqual(['C2']);
        expect(result.scheme.templates.map((t) => t.id)).toEqual(['tpl-1', 'mine']);
        expect(result.scheme.templates[0].name).toBe('Syllable 2');
        expect(counted(result.scheme)).toEqual(['Onset(1-1)', 'Nucleus(1-1)', 'C2(0-1)']);
        expect(result.scheme.templates[1]).toBe(existing.templates[0]);
        // The input is not mutated.
        expect(existing.templates).toHaveLength(1);
        expect(existing.roles).toHaveLength(2);
        expectNormalised(result.scheme);

        // A hand-built template with the same roles and counts counts as "already there".
        const again = seedFlexibleTemplate(existing, shapes('CV'));
        expect(again.flexible).toMatchObject({ outcome: 'alreadyThere', templateName: 'Syllable' });
        expect(again.scheme).toBe(existing);
    });

    it('works on top of a per-shape seed, reusing its roles', () => {
        const perShape = seedFromGenerator(cloneEmptyBlockScheme(), shapes('CVC', 'CV'));
        const result = seedFlexibleTemplate(perShape.scheme, shapes('CVC', 'CV'));
        expect(result.rolesAdded).toEqual([]);
        expect(result.scheme.templates.map((t) => t.name)).toEqual(['Syllable', 'CVC', 'CV']);
        expectNormalised(result.scheme);
    });
});
