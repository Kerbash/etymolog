/**
 * variantDrafts — the page-state model of a grapheme's visual forms.
 * ------------------------------------------------------------------
 * A grapheme's glyphs are no longer one list: every grapheme has a DEFAULT
 * form (what every renderer shows — `GraphemeComplete.glyphs`) and may have
 * other forms, each an ordered glyph list with a name and an optional variant
 * group (a block layout picks the form by group).
 *
 * The form holds them as plain page state, exactly like the default glyph
 * list (`selectedGlyphs`) always was — NOT as SmartForm fields (pitfall P9):
 *
 *  - `selectedGlyphs`      → the DEFAULT form's glyphs (unchanged meaning);
 *  - `DefaultFormDraft`    → the DEFAULT form's identity (variant id, name,
 *                            group). It only ever changes through "Make
 *                            default", which swaps identities with a card;
 *  - `VariantDraft[]`      → the other forms, one card each.
 *
 * "Make default" is an IDENTITY swap, not a glyph swap: the variant row keeps
 * its own glyphs, name and group and simply becomes the default. The UI shows
 * that as "the two glyph lists trade places" — and because each variant keeps
 * its glyphs, saving the swap is ONE `variant.setDefault` call with no glyph
 * writes at all (no glyph is ever transiently orphaned, which matters with
 * `autoManageGlyphs` on).
 *
 * Pure module — no React — so the helpers are unit-testable and a component
 * file does not export non-components (react-refresh).
 */

import type { Glyph, GraphemeComplete, GraphemeVariantWithGlyphs } from '../../../db';

/** Name the service gives a grapheme's first (default) variant. */
export const DEFAULT_FORM_NAME = 'Default';

/** One non-default form of the grapheme being edited. */
export interface VariantDraft {
    /** Stable client key (React key, focus survival). Never sent to the API. */
    key: string;
    /** The stored variant's id, or null for a form not saved yet. */
    id: number | null;
    name: string;
    groupId: number | null;
    /** Ordered glyphs — the form's writing order. */
    glyphs: Glyph[];
}

/** Identity of the DEFAULT form (its glyphs are `selectedGlyphs`). */
export interface DefaultFormDraft {
    /** The stored default variant's id; null on create, or for a new form made default. */
    id: number | null;
    name: string;
    groupId: number | null;
}

/** Deterministic key of a stored variant's draft, so re-derived drafts keep their keys. */
export function persistedDraftKey(variantId: number): string {
    return `variant-${variantId}`;
}

function defaultVariantOf(initialData?: GraphemeComplete | null): GraphemeVariantWithGlyphs | undefined {
    const variants = initialData?.variants;
    return variants?.find((v) => v.is_default) ?? variants?.[0];
}

/**
 * The drafts a form starts with: on edit, every NON-default variant of the
 * stored grapheme in stored order; on create — or when `variants` is absent
 * (P5: a hand-built literal) — none.
 */
export function initialVariantDrafts(
    mode: 'create' | 'edit',
    initialData?: GraphemeComplete | null,
): VariantDraft[] {
    if (mode !== 'edit' || !initialData?.variants) return [];
    const defaultId = defaultVariantOf(initialData)?.id;
    return initialData.variants
        .filter((variant) => variant.id !== defaultId)
        .map((variant) => ({
            key: persistedDraftKey(variant.id),
            id: variant.id,
            name: variant.name,
            groupId: variant.group_id,
            glyphs: variant.glyphs,
        }));
}

/** The default form's identity at load time. */
export function initialDefaultForm(
    mode: 'create' | 'edit',
    initialData?: GraphemeComplete | null,
): DefaultFormDraft {
    const stored = mode === 'edit' ? defaultVariantOf(initialData) : undefined;
    return stored
        ? { id: stored.id, name: stored.name, groupId: stored.group_id }
        : { id: null, name: DEFAULT_FORM_NAME, groupId: null };
}

export interface FormsState {
    defaultGlyphs: Glyph[];
    defaultForm: DefaultFormDraft;
    variants: VariantDraft[];
}

/**
 * "Make default" on the draft `key`: that draft's form becomes the default and
 * the old default takes its card (same key, so the card stays in place).
 * Returns the input unchanged when `key` is unknown.
 */
export function makeDraftDefault(state: FormsState, key: string): FormsState {
    const target = state.variants.find((draft) => draft.key === key);
    if (!target) return state;
    return {
        defaultGlyphs: target.glyphs,
        defaultForm: { id: target.id, name: target.name, groupId: target.groupId },
        variants: state.variants.map((draft) =>
            draft.key === key
                ? {
                      key,
                      id: state.defaultForm.id,
                      name: state.defaultForm.name,
                      groupId: state.defaultForm.groupId,
                      glyphs: state.defaultGlyphs,
                  }
                : draft,
        ),
    };
}

/** Same glyph ids in the same order. */
export function sameGlyphSequence(a: readonly Glyph[], b: readonly Glyph[]): boolean {
    return a.length === b.length && a.every((glyph, index) => glyph.id === b[index].id);
}

/** Did the forms change from what `initialData` stores? (dirty tracking) */
export function formsChanged(
    initialData: GraphemeComplete | null | undefined,
    defaultForm: DefaultFormDraft,
    variants: readonly VariantDraft[],
): boolean {
    const initialDefault = initialDefaultForm('edit', initialData);
    if (initialDefault.id !== defaultForm.id) return true;
    const initial = initialVariantDrafts('edit', initialData);
    if (initial.length !== variants.length) return true;
    return variants.some((draft, index) => {
        const before = initial[index];
        return (
            draft.id !== before.id ||
            draft.name !== before.name ||
            draft.groupId !== before.groupId ||
            !sameGlyphSequence(draft.glyphs, before.glyphs)
        );
    });
}

/** A user-facing label for a form in messages. */
export function formLabel(name: string): string {
    const trimmed = name.trim();
    return trimmed ? `"${trimmed}"` : 'an unnamed form';
}

/**
 * The first reason the forms cannot be saved, or null. Checked before ANY
 * write, so a refused save changes nothing.
 */
export function validateForms(
    defaultForm: DefaultFormDraft,
    variants: readonly VariantDraft[],
    groupName: (groupId: number) => string,
): string | null {
    for (const draft of variants) {
        if (draft.name.trim() === '') return 'Every form needs a name.';
        if (draft.glyphs.length === 0) {
            return `The form ${formLabel(draft.name)} has no glyphs. Add one, or remove the form.`;
        }
    }
    const seen = new Set<number>();
    for (const groupId of [defaultForm.groupId, ...variants.map((draft) => draft.groupId)]) {
        if (groupId === null) continue;
        if (seen.has(groupId)) {
            return `Only one form can be in the group "${groupName(groupId)}".`;
        }
        seen.add(groupId);
    }
    return null;
}

/** "a", "a and b", "a, b and c". */
export function joinList(items: readonly string[]): string {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
