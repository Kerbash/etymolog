/**
 * blockSchemeDraft — the pure editing operations of the Block Designer.
 *
 * Each rule the page relies on, stated once: stable role ids (never from the
 * label), the role-delete guard, "a new rectangle never moves the old ones",
 * reorder never drops a template, the dirty check ignores key order, and the
 * preview caption names exactly the templates the segmenter used.
 */

import { describe, expect, it } from 'vitest';

import { cloneEmptyBlockScheme, validateBlockScheme } from '../../../../../blocks';
import type { BlockScheme, BlockTemplate } from '../../../../../blocks';
import { A, HEAD_GROUP, K, T, cvcScheme, gEntry, glyph, grapheme, mapOf } from '../../../../display/spelling/__tests__/blockFixtures';
import {
    ROLE_COLOURS,
    addRole,
    addRoleToTemplate,
    applyRects,
    applyTemplate,
    draftProblems,
    duplicateTemplate,
    evenRowSlot,
    moveTemplate,
    newTemplate,
    nextRoleId,
    previewScheme,
    removeRole,
    removeRoleFromTemplate,
    reorderTemplates,
    sameDocument,
    schemeStatusLine,
    summarizeBlocks,
    templateToRects,
    updateRole,
} from '../blockSchemeDraft';

function withRoles(n: number): BlockScheme {
    let scheme = cloneEmptyBlockScheme();
    for (let i = 0; i < n; i++) scheme = addRole(scheme, { kind: 'class', letter: 'C' });
    return scheme;
}

const tpl = (id: string, pattern: string[]): BlockTemplate => ({
    id,
    name: id,
    pattern,
    slots: pattern.map((roleId, k) => evenRowSlot(roleId, k, pattern.length)),
});

describe('roles', () => {
    it('ids are role-<n> slugs, generated once and never derived from the label', () => {
        let scheme = withRoles(2);
        expect(scheme.roles.map((r) => r.id)).toEqual(['role-1', 'role-2']);
        scheme = updateRole(scheme, 'role-1', { label: 'Onset' });
        expect(scheme.roles[0]).toMatchObject({ id: 'role-1', label: 'Onset' });
        // A gap is not reused; the next id continues after the highest.
        expect(nextRoleId([{ id: 'role-7', label: 'x', matcher: { kind: 'any' } }])).toBe('role-8');
    });

    it('new roles take the palette colours in turn, as var() tokens', () => {
        const scheme = withRoles(ROLE_COLOURS.length + 1);
        expect(scheme.roles[0].colour).toBe('var(--red)');
        expect(scheme.roles[ROLE_COLOURS.length].colour).toBe(scheme.roles[0].colour);
        for (const role of scheme.roles) expect(role.colour).toMatch(/^var\(--[a-z]+\)$/);
    });

    it('a role used by a template cannot be removed', () => {
        const scheme = { ...withRoles(2), templates: [tpl('t', ['role-1'])] };
        expect(removeRole(scheme, 'role-1')).toBe(scheme);
        expect(removeRole(scheme, 'role-2').roles.map((r) => r.id)).toEqual(['role-1']);
    });
});

describe('templates', () => {
    it('adding a role appends ONE rect at the even-row position; existing rects never move', () => {
        let template = newTemplate(withRoles(3));
        template = addRoleToTemplate(template, 'role-1');
        expect(template.slots).toEqual([{ roleId: 'role-1', groupId: null, x: 0, y: 0, w: 1, h: 1 }]);
        // The user drags the first rect somewhere.
        template = { ...template, slots: [{ ...template.slots[0], x: 0.25, y: 0.5, w: 0.5, h: 0.5 }] };
        template = addRoleToTemplate(template, 'role-2');
        expect(template.pattern).toEqual(['role-1', 'role-2']);
        expect(template.slots[0]).toMatchObject({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 });
        expect(template.slots[1]).toMatchObject({ x: 0.5, y: 0, w: 0.5, h: 1 });
        // A role cannot be added twice.
        expect(addRoleToTemplate(template, 'role-2')).toBe(template);
        // Removing drops the pattern entry AND its slot.
        const removed = removeRoleFromTemplate(template, 'role-1');
        expect(removed.pattern).toEqual(['role-2']);
        expect(removed.slots.map((s) => s.roleId)).toEqual(['role-2']);
    });

    it('even-row slots always fit the unit square exactly (the validator raises no issue)', () => {
        for (let n = 1; n <= 12; n++) {
            for (let k = 0; k < n; k++) {
                const slot = evenRowSlot('r', k, n);
                expect(slot.x + slot.w).toBeLessThanOrEqual(1);
            }
        }
        const scheme: BlockScheme = {
            ...withRoles(7),
            templates: [tpl('t', ['role-1', 'role-2', 'role-3', 'role-4', 'role-5', 'role-6', 'role-7'])],
        };
        expect(validateBlockScheme(scheme).issues).toEqual([]);
    });

    it('rects map to slots and back, keeping each slot\'s group', () => {
        const scheme = withRoles(2);
        let template = tpl('t', ['role-1', 'role-2']);
        template = { ...template, slots: template.slots.map((s) => (s.roleId === 'role-2' ? { ...s, groupId: 4 } : s)) };
        const rects = templateToRects(template, scheme.roles);
        expect(rects.map((r) => [r.id, r.label, r.colour])).toEqual([
            ['role-1', 'Role 1', 'var(--red)'],
            ['role-2', 'Role 2', 'var(--orange)'],
        ]);
        const moved = applyRects(template, rects.map((r) => (r.id === 'role-2' ? { ...r, y: 0.5, h: 0.5 } : r)));
        expect(moved.slots[1]).toEqual({ roleId: 'role-2', groupId: 4, x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    });

    it('apply replaces by id or appends; duplicate lands right after the original with a fresh id', () => {
        let scheme: BlockScheme = { ...withRoles(1), templates: [tpl('tpl-1', ['role-1']), tpl('tpl-2', ['role-1'])] };
        scheme = applyTemplate(scheme, { ...scheme.templates[0], name: 'Renamed' });
        expect(scheme.templates.map((t) => t.name)).toEqual(['Renamed', 'tpl-2']);
        scheme = applyTemplate(scheme, tpl('tpl-9', ['role-1']));
        expect(scheme.templates.map((t) => t.id)).toEqual(['tpl-1', 'tpl-2', 'tpl-9']);
        scheme = duplicateTemplate(scheme, 'tpl-1');
        expect(scheme.templates.map((t) => t.id)).toEqual(['tpl-1', 'tpl-10', 'tpl-2', 'tpl-9']);
        expect(scheme.templates[1].name).toBe('Renamed (copy)');
        expect(scheme.templates[1].slots).not.toBe(scheme.templates[0].slots);
    });

    it('reorder never drops or duplicates a template; move swaps neighbours and stops at the ends', () => {
        const scheme: BlockScheme = { ...withRoles(1), templates: ['a', 'b', 'c'].map((id) => tpl(id, ['role-1'])) };
        expect(reorderTemplates(scheme, ['c', 'a', 'a', 'ghost']).templates.map((t) => t.id)).toEqual(['c', 'a', 'b']);
        expect(moveTemplate(scheme, 'b', -1).templates.map((t) => t.id)).toEqual(['b', 'a', 'c']);
        expect(moveTemplate(scheme, 'a', -1)).toBe(scheme);
        expect(moveTemplate(scheme, 'c', 1)).toBe(scheme);
    });
});

describe('comparison, status, problems', () => {
    it('sameDocument ignores key order and undefined keys', () => {
        expect(sameDocument({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1, e: undefined })).toBe(true);
        expect(sameDocument({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    });

    it('the status line counts roles, templates and groups', () => {
        const scheme = { ...withRoles(3), templates: [tpl('a', ['role-1'])] };
        expect(schemeStatusLine(scheme, 2)).toBe('3 roles · 1 template · 2 variant groups');
        expect(schemeStatusLine(cloneEmptyBlockScheme(), 1)).toBe('0 roles · 0 templates · 1 variant group');
    });

    it('draftProblems lists what the lenient validator would fix by dropping data', () => {
        let scheme = withRoles(2);
        scheme = updateRole(scheme, 'role-1', { label: '  ' });
        scheme = updateRole(scheme, 'role-2', { matcher: { kind: 'category', category: '' } });
        scheme = { ...scheme, templates: [{ ...tpl('t', ['role-2']), name: '' }] };
        expect(draftProblems(scheme)).toEqual([
            'Role 1 needs a label.',
            'Role 2 matches a category but names none.',
            'Template 1 needs a name.',
        ]);
        expect(draftProblems(withRoles(2))).toEqual([]);
    });
});

describe('preview', () => {
    it('previewScheme applies the edited template and forces blocks on', () => {
        const scheme = { ...cvcScheme(false), templates: [] };
        const preview = previewScheme(scheme, cvcScheme().templates[1]);
        expect(preview.enabled).toBe(true);
        expect(preview.templates.map((t) => t.id)).toEqual(['cv']);
        // An empty pattern is not applied (it could never match anyway).
        expect(previewScheme(scheme, { id: 'x', name: 'x', pattern: [], slots: [] }).templates).toEqual([]);
    });

    it('summarizeBlocks names the template each block used, in writing order', () => {
        const map = mapOf(K, A, T);
        const entries = [gEntry(K, 0), gEntry(A, 1), gEntry(T, 2), gEntry(A, 3), gEntry(A, 4)];
        // k a t | a | a  → CVC + two singles (no lone-vowel template)
        const summary = summarizeBlocks(entries, cvcScheme(), map);
        expect(summary.blocks.map((b) => [b.name, b.entryIndices])).toEqual([['CVC', [0, 1, 2]]]);
        expect(summary.singles).toBe(2);
        // Disabled: nothing is a block.
        expect(summarizeBlocks(entries, cvcScheme(false), map)).toEqual({ blocks: [], singles: 5, lone: 0, readout: 'kataa', missingForms: [] });
        // k has a head form: nothing fell back.
        expect(summary.missingForms).toEqual([]);
    });

    it("summarizeBlocks names each sign that had no form in its slot's group (once per sign)", () => {
        // p has no "head" form; the CVC onset slot draws the head group.
        const P = grapheme({ id: 4, phoneme: 'p', glyphs: [glyph(41, 'p-default')] });
        const map = mapOf(P, A, T);
        const groups = new Map([[HEAD_GROUP, 'head']]);
        const entries = [gEntry(P, 0), gEntry(A, 1), gEntry(T, 2), gEntry(P, 3), gEntry(A, 4), gEntry(T, 5)];
        const summary = summarizeBlocks(entries, cvcScheme(), map, groups);
        expect(summary.blocks).toHaveLength(2);
        expect(summary.missingForms).toEqual([{ sign: P.name, group: 'head' }]);
        // A group the map does not know (deleted) → group: null.
        expect(summarizeBlocks(entries, cvcScheme(), map).missingForms).toEqual([{ sign: P.name, group: null }]);
    });

    it('summarizeBlocks reads the word as the segments cut it', () => {
        const P = grapheme({ id: 4, phoneme: 'p', glyphs: [glyph(41, 'p-default')] });
        const map = mapOf(K, A, T, P);
        // Template order: t a p a → [tap] a (first template wins).
        const tapa = [gEntry(T, 0), gEntry(A, 1), gEntry(P, 2), gEntry(A, 3)];
        expect(summarizeBlocks(tapa, cvcScheme(), map).readout).toBe('tap · a');
        // By syllable: ta · pa.
        const bySyllable: BlockScheme = { ...cvcScheme(), split: { mode: 'syllables' } };
        expect(summarizeBlocks(tapa, bySyllable, map)).toMatchObject({ readout: 'ta · pa', singles: 0, lone: 0 });
        // A word separator starts a new word; a sound-less sign reads as its name.
        const LOGO = grapheme({ id: 9, phoneme: null, glyphs: [glyph(91, 'logo')] });
        const two = [gEntry(K, 0), gEntry(A, 1), { type: 'ipa' as const, position: 2, ipaCharacter: ' ', role: 'word-separator' as const }, gEntry(LOGO, 3)];
        expect(summarizeBlocks(two, cvcScheme(), mapOf(K, A, LOGO)).readout).toBe(`ka ${LOGO.name}`);
    });

    it('summarizeBlocks counts consonants drawn with the vowel-killer mark apart from singles', () => {
        const MARK = grapheme({ id: 9, phoneme: null, glyphs: [glyph(91, 'mark')] });
        // k a t . k . a → CVC, k (lone), a (single)
        const entries = [gEntry(K, 0), gEntry(A, 1), gEntry(T, 2), { type: 'ipa' as const, position: 3, ipaCharacter: '.' }, gEntry(K, 4), { type: 'ipa' as const, position: 5, ipaCharacter: '.' }, gEntry(A, 6)];
        const marked: BlockScheme = { ...cvcScheme(), leftovers: { markGraphemeId: MARK.id, placement: 'below' } };
        expect(summarizeBlocks(entries, marked, mapOf(K, A, T, MARK))).toMatchObject({ readout: 'kat · k · a', singles: 1, lone: 1 });
        // No leftovers, or the mark grapheme is gone → k is an ordinary single.
        expect(summarizeBlocks(entries, cvcScheme(), mapOf(K, A, T, MARK))).toMatchObject({ singles: 2, lone: 0 });
        expect(summarizeBlocks(entries, marked, mapOf(K, A, T))).toMatchObject({ singles: 2, lone: 0 });
    });
});
