/**
 * Shared fixtures for the block engine tests: fake grapheme indexes and
 * spelling entries. No DB — the engine only ever sees these shapes.
 */

import type { Grapheme, SpellingDisplayEntry, SpellingRole } from '../../db/types';
import { classifyEntry } from '../classify';
import type {
    BlockGraphemeIndex,
    BlockGraphemeInfo,
    BlockRole,
    BlockScheme,
    BlockSlot,
    BlockSpellingEntry,
    BlockTemplate,
    EntryClass,
} from '../types';

export function svg(tag: string, viewBox = '0 0 100 100'): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path d="${tag}"/></svg>`;
}

export interface FakeGraphemeOptions {
    category?: string | null;
    /** Extra phonemes; the first arg is always phonemes[0]. */
    autoSpelling?: boolean;
    glyphs?: string[];
    variants?: BlockGraphemeInfo['variants'];
}

export function fakeGrapheme(id: number, phoneme: string | null, options: FakeGraphemeOptions = {}): BlockGraphemeInfo {
    return {
        id,
        category: options.category ?? null,
        phonemes: phoneme === null ? [] : [{ phoneme, use_in_auto_spelling: options.autoSpelling ?? true }],
        glyphs: (options.glyphs ?? [svg(`g${id}`)]).map((svg_data) => ({ svg_data })),
        ...(options.variants ? { variants: options.variants } : {}),
    };
}

/**
 * A MARK grapheme (tone / length / accent sign): no phonemes, category
 * `mark` (`MARK_CATEGORY_NAME` — `MARK_CATEGORY` in db/wordSymbolService).
 */
export function markGrapheme(id: number, options: Omit<FakeGraphemeOptions, 'category'> = {}): BlockGraphemeInfo {
    return fakeGrapheme(id, null, { ...options, category: 'mark' });
}

export function indexOf(...graphemes: BlockGraphemeInfo[]): BlockGraphemeIndex {
    return new Map(graphemes.map((g) => [g.id, g]));
}

function graphemeRow(id: number): Grapheme {
    return { id, name: `g${id}`, category: null, notes: null, created_at: '', updated_at: '' };
}

export function gEntry(id: number, position = 0, variantId?: number): BlockSpellingEntry {
    const entry: SpellingDisplayEntry = { type: 'grapheme', position, grapheme: graphemeRow(id) };
    return variantId === undefined ? entry : { ...entry, variantId };
}

export function ipaEntry(char: string, position = 0): BlockSpellingEntry {
    return { type: 'ipa', position, ipaCharacter: char };
}

export function roleEntry(role: SpellingRole, char = ' ', position = 0): BlockSpellingEntry {
    return { type: 'ipa', position, ipaCharacter: char, role };
}

export const roles = {
    C1: { id: 'C1', label: 'Onset', matcher: { kind: 'class', letter: 'C' } } satisfies BlockRole,
    V: { id: 'V', label: 'Nucleus', matcher: { kind: 'class', letter: 'V' } } satisfies BlockRole,
    C2: { id: 'C2', label: 'Coda', matcher: { kind: 'class', letter: 'C' } } satisfies BlockRole,
    LOGO: { id: 'LOGO', label: 'Logogram', matcher: { kind: 'category', category: 'logogram' } } satisfies BlockRole,
    SYL: { id: 'SYL', label: 'Syllable', matcher: { kind: 'syllable' } } satisfies BlockRole,
    ANY: { id: 'ANY', label: 'Anything', matcher: { kind: 'any' } } satisfies BlockRole,
    MARK: { id: 'MARK', label: 'Mark', matcher: { kind: 'category', category: 'mark' } } satisfies BlockRole,
};

/** A template whose slots are stacked full-width strips, one per role. */
export function template(id: string, pattern: string[], groupIds: (number | null)[] = []): BlockTemplate {
    const h = 1 / pattern.length;
    return {
        id,
        name: id,
        pattern,
        slots: pattern.map((roleId, k) => ({ roleId, groupId: groupIds[k] ?? null, x: 0, y: k * h, w: 1, h })),
    };
}

export function scheme(roleList: BlockRole[], templates: BlockTemplate[]): BlockScheme {
    return { version: 1, enabled: true, roles: roleList, templates };
}

/** Slot count fields, as a template author would set them in the designer. */
export type SlotCounts = Partial<Pick<BlockSlot, 'min' | 'max' | 'arrange'>>;

/** `base` with count fields merged into the slots of the named roles. */
export function withCounts(base: BlockTemplate, counts: Record<string, SlotCounts>): BlockTemplate {
    return { ...base, slots: base.slots.map((slot) => ({ ...slot, ...(counts[slot.roleId] ?? {}) })) };
}

/** Entry classes of IPA characters, one per character, as the segmenter sees them. */
export function classesOf(...chars: string[]): EntryClass[] {
    const empty: BlockGraphemeIndex = new Map();
    return chars.map((char) => classifyEntry(ipaEntry(char), empty));
}
