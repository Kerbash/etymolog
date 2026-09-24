/**
 * blockSchemeDraft — the pure editing operations behind the Block Designer.
 *
 * The Blocks page edits a DRAFT `BlockScheme` in React state and writes it
 * with one `api.blockScheme.save` call. Every change the page makes to that
 * draft goes through a helper here, so each rule (stable role ids, "a new
 * rectangle never moves the old ones", the role-delete guard, …) is stated
 * once and unit-tested without rendering anything.
 *
 * Nothing here mutates its input: every helper returns a new object and
 * shares the untouched parts.
 *
 * @module writingSystem/blocks/blockSchemeDraft
 */

import { CLASS_LABELS } from '../../../../generator/phonology/classes';
import { composeBlock, segmentEntries } from '../../../../blocks';
import type {
    BlockGraphemeIndex,
    BlockRole,
    BlockScheme,
    BlockSlot,
    BlockSpellingEntry,
    BlockTemplate,
    RoleMatcher,
} from '../../../../blocks';
import type { LayoutRect } from './rectLayoutMath';
import { drawsWithMark, readEntry, readSegments } from './readout';

// =============================================================================
// COLOURS
// =============================================================================

/**
 * The fixed palette a role's tint is chosen from. The utility tokens, stored
 * as the `var(--x)` string itself so the tint follows the theme wherever it is
 * painted (the layout canvas, a chip, the word form's block outline).
 */
export const ROLE_COLOURS: readonly { value: string; label: string }[] = [
    { value: 'var(--red)', label: 'Red' },
    { value: 'var(--orange)', label: 'Orange' },
    { value: 'var(--yellow)', label: 'Yellow' },
    { value: 'var(--green)', label: 'Green' },
    { value: 'var(--teal)', label: 'Teal' },
    { value: 'var(--cyan)', label: 'Cyan' },
    { value: 'var(--blue)', label: 'Blue' },
    { value: 'var(--purple)', label: 'Purple' },
    { value: 'var(--pink)', label: 'Pink' },
];

/** The palette colour for the n-th role created (cycles). */
export function roleColourAt(n: number): string {
    const size = ROLE_COLOURS.length;
    return ROLE_COLOURS[((n % size) + size) % size].value;
}

// =============================================================================
// IDS
// =============================================================================

/**
 * The next free `<prefix><n>` id. Ids are generated ONCE and never derived
 * from a label, so renaming a role (or a template) cannot break the patterns
 * and slots that point at it.
 */
function nextId(prefix: string, taken: Iterable<string>): string {
    const used = new Set(taken);
    let max = 0;
    for (const id of used) {
        if (!id.startsWith(prefix)) continue;
        const n = Number(id.slice(prefix.length));
        if (Number.isInteger(n) && n > max) max = n;
    }
    let candidate = max + 1;
    while (used.has(`${prefix}${candidate}`)) candidate += 1;
    return `${prefix}${candidate}`;
}

export const ROLE_ID_PREFIX = 'role-';
export const TEMPLATE_ID_PREFIX = 'tpl-';

export function nextRoleId(roles: readonly BlockRole[]): string {
    return nextId(ROLE_ID_PREFIX, roles.map((role) => role.id));
}

export function nextTemplateId(templates: readonly BlockTemplate[]): string {
    return nextId(TEMPLATE_ID_PREFIX, templates.map((template) => template.id));
}

// =============================================================================
// MATCHERS
// =============================================================================

/** A stable string for a matcher: `class:C`, `syllable`, `category:logogram`, `any`. */
export function matcherKey(matcher: RoleMatcher): string {
    switch (matcher.kind) {
        case 'class':
            return `class:${matcher.letter}`;
        case 'category':
            return `category:${matcher.category.trim()}`;
        case 'syllable':
        case 'any':
            return matcher.kind;
    }
}

/** What a matcher accepts, in words ("consonants", "syllable signs"…). */
export function describeMatcher(matcher: RoleMatcher): string {
    switch (matcher.kind) {
        case 'class':
            return CLASS_LABELS[matcher.letter];
        case 'syllable':
            return 'syllable signs';
        case 'category':
            return matcher.category.trim() ? `category “${matcher.category.trim()}”` : 'a category';
        case 'any':
            return 'anything';
    }
}

// =============================================================================
// ROLES
// =============================================================================

/** A new role appended to the scheme, with a fresh id and the next palette colour. */
export function addRole(scheme: BlockScheme, matcher: RoleMatcher, label?: string): BlockScheme {
    const id = nextRoleId(scheme.roles);
    const role: BlockRole = {
        id,
        label: label ?? `Role ${scheme.roles.length + 1}`,
        colour: roleColourAt(scheme.roles.length),
        matcher,
    };
    return { ...scheme, roles: [...scheme.roles, role] };
}

export function updateRole(scheme: BlockScheme, roleId: string, patch: Partial<Omit<BlockRole, 'id'>>): BlockScheme {
    return {
        ...scheme,
        roles: scheme.roles.map((role) => (role.id === roleId ? { ...role, ...patch } : role)),
    };
}

/** The templates whose pattern names `roleId` (the role-delete guard). */
export function templatesUsingRole(templates: readonly BlockTemplate[], roleId: string): BlockTemplate[] {
    return templates.filter((template) => template.pattern.includes(roleId));
}

/**
 * Remove a role — only when no template uses it. Returns the scheme unchanged
 * when it is still in use; the UI disables the button, this is the backstop.
 */
export function removeRole(scheme: BlockScheme, roleId: string): BlockScheme {
    if (templatesUsingRole(scheme.templates, roleId).length > 0) return scheme;
    return { ...scheme, roles: scheme.roles.filter((role) => role.id !== roleId) };
}

// =============================================================================
// TEMPLATES
// =============================================================================

/** An empty template with a fresh id, for "New template". */
export function newTemplate(scheme: BlockScheme): BlockTemplate {
    return {
        id: nextTemplateId(scheme.templates),
        name: `Template ${scheme.templates.length + 1}`,
        pattern: [],
        slots: [],
    };
}

/** The default slot for the k-th of n pattern roles: an even row, `x = k/n, w = 1/n`. */
export function evenRowSlot(roleId: string, k: number, n: number): BlockSlot {
    const x = tidy(k / n);
    // Rounding both terms could push `x + w` a hair past 1, which the scheme
    // validator would "correct" with an issue. `1 - x` is the exact room left.
    const w = Math.min(tidy(1 / n), 1 - x);
    return { roleId, groupId: null, x, y: 0, w, h: 1 };
}

function tidy(value: number): number {
    return Math.round(value * 1e6) / 1e6;
}

/**
 * Append a role to a template's pattern. The NEW rectangle takes the even-row
 * position of the last of `n` slots; the existing rectangles are never moved
 * (a user who has already arranged them must not lose that to a click).
 * A role already in the pattern is ignored (no role appears twice).
 */
export function addRoleToTemplate(template: BlockTemplate, roleId: string): BlockTemplate {
    if (template.pattern.includes(roleId)) return template;
    const n = template.pattern.length + 1;
    return {
        ...template,
        pattern: [...template.pattern, roleId],
        slots: [...template.slots, evenRowSlot(roleId, n - 1, n)],
    };
}

export function removeRoleFromTemplate(template: BlockTemplate, roleId: string): BlockTemplate {
    return {
        ...template,
        pattern: template.pattern.filter((id) => id !== roleId),
        slots: template.slots.filter((slot) => slot.roleId !== roleId),
    };
}

export function setSlotGroup(template: BlockTemplate, roleId: string, groupId: number | null): BlockTemplate {
    return {
        ...template,
        slots: template.slots.map((slot) => (slot.roleId === roleId ? { ...slot, groupId } : slot)),
    };
}

/** Replace the template with the same id, or append it when it is new. */
export function applyTemplate(scheme: BlockScheme, template: BlockTemplate): BlockScheme {
    const exists = scheme.templates.some((t) => t.id === template.id);
    return {
        ...scheme,
        templates: exists
            ? scheme.templates.map((t) => (t.id === template.id ? template : t))
            : [...scheme.templates, template],
    };
}

/** A copy placed right after the original ("CV (copy)"), with a fresh id. */
export function duplicateTemplate(scheme: BlockScheme, templateId: string): BlockScheme {
    const index = scheme.templates.findIndex((t) => t.id === templateId);
    if (index < 0) return scheme;
    const original = scheme.templates[index];
    const copy: BlockTemplate = {
        id: nextTemplateId(scheme.templates),
        name: `${original.name} (copy)`,
        pattern: [...original.pattern],
        slots: original.slots.map((slot) => ({ ...slot })),
    };
    const templates = [...scheme.templates];
    templates.splice(index + 1, 0, copy);
    return { ...scheme, templates };
}

export function removeTemplate(scheme: BlockScheme, templateId: string): BlockScheme {
    return { ...scheme, templates: scheme.templates.filter((t) => t.id !== templateId) };
}

/**
 * Put the templates in `orderedIds` order (the priority order). Ids not in the
 * list keep their relative order at the end; unknown ids are ignored — so a
 * stale reorder event can never drop a template.
 */
export function reorderTemplates(scheme: BlockScheme, orderedIds: readonly string[]): BlockScheme {
    const byId = new Map(scheme.templates.map((t) => [t.id, t]));
    const seen = new Set<string>();
    const templates: BlockTemplate[] = [];
    for (const id of orderedIds) {
        const template = byId.get(id);
        if (template && !seen.has(id)) {
            templates.push(template);
            seen.add(id);
        }
    }
    for (const template of scheme.templates) {
        if (!seen.has(template.id)) templates.push(template);
    }
    return { ...scheme, templates };
}

/** Move one template up (`-1`) or down (`+1`) — the button alternative to dragging. */
export function moveTemplate(scheme: BlockScheme, templateId: string, delta: -1 | 1): BlockScheme {
    const index = scheme.templates.findIndex((t) => t.id === templateId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= scheme.templates.length) return scheme;
    const ids = scheme.templates.map((t) => t.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    return reorderTemplates(scheme, ids);
}

// =============================================================================
// LAYOUT CANVAS ⇄ SLOTS
// =============================================================================

/** One `LayoutRect` per pattern role (id = role id), in pattern order. */
export function templateToRects(template: BlockTemplate, roles: readonly BlockRole[]): LayoutRect[] {
    const roleById = new Map(roles.map((role) => [role.id, role]));
    const slotByRole = new Map(template.slots.map((slot) => [slot.roleId, slot]));
    return template.pattern.map((roleId, k) => {
        const role = roleById.get(roleId);
        const slot = slotByRole.get(roleId) ?? evenRowSlot(roleId, k, template.pattern.length);
        const rect: LayoutRect = { id: roleId, label: role?.label ?? roleId, x: slot.x, y: slot.y, w: slot.w, h: slot.h };
        if (role?.colour) rect.colour = role.colour;
        return rect;
    });
}

/** Write the canvas geometry back into the template's slots (groups kept). */
export function applyRects(template: BlockTemplate, rects: readonly LayoutRect[]): BlockTemplate {
    const rectById = new Map(rects.map((rect) => [rect.id, rect]));
    return {
        ...template,
        slots: template.slots.map((slot) => {
            const rect = rectById.get(slot.roleId);
            return rect ? { ...slot, x: rect.x, y: rect.y, w: rect.w, h: rect.h } : slot;
        }),
    };
}

// =============================================================================
// COMPARISON + STATUS
// =============================================================================

/** JSON with sorted object keys, so two equal documents built in different key orders compare equal. */
function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record)
            .filter((key) => record[key] !== undefined)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

/** Deep equality for schemes / templates (the page's dirty check). */
export function sameDocument(a: unknown, b: unknown): boolean {
    return stableStringify(a) === stableStringify(b);
}

/** A structurally independent copy (the draft must never alias the context's scheme). */
export function cloneScheme(scheme: BlockScheme): BlockScheme {
    return structuredClone(scheme);
}

function plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
}

/** "3 roles · 4 templates · 2 variant groups". */
export function schemeStatusLine(scheme: BlockScheme, groupCount: number): string {
    return [
        plural(scheme.roles.length, 'role', 'roles'),
        plural(scheme.templates.length, 'template', 'templates'),
        plural(groupCount, 'variant group', 'variant groups'),
    ].join(' · ');
}

/** A scheme the preview renders with: the draft plus the edited template, forced on. */
export function previewScheme(scheme: BlockScheme, template: BlockTemplate | null): BlockScheme {
    const applied = template && template.pattern.length > 0 ? applyTemplate(scheme, template) : scheme;
    return { ...applied, enabled: true };
}

// =============================================================================
// PREVIEW CAPTION
// =============================================================================

export interface BlockUsageSummary {
    /** Each composed block, in writing order: the template it used. */
    blocks: { templateId: string; name: string; entryIndices: number[] }[];
    /**
     * Entries drawn on their own (no template matched them) — NOT counting the
     * consonants drawn with the vowel-killer mark (`lone`).
     */
    singles: number;
    /** Consonants left in no block that are drawn with the scheme's vowel-killer mark. */
    lone: number;
    /**
     * The word as the segments cut it: each segment's sounds run together,
     * segments separated by ` · `, words (separators) by a space — `ta · pa`.
     * A sign with no sound reads as its name.
     */
    readout: string;
    /**
     * Signs a slot asked for a form group they have no form in, so they drew
     * their default form — one line per (sign, group), in writing order.
     * `group` is `null` for a group that no longer exists.
     */
    missingForms: { sign: string; group: string | null }[];
}

/**
 * Which template each block of a spelling used — the same segmentation the
 * renderer runs, so the caption cannot disagree with the picture.
 */
export function summarizeBlocks(
    entries: readonly BlockSpellingEntry[],
    scheme: BlockScheme,
    index: BlockGraphemeIndex,
    groupNames: ReadonlyMap<number, string> = new Map(),
): BlockUsageSummary {
    const names = new Map(scheme.templates.map((t) => [t.id, t.name]));
    const summary: BlockUsageSummary = { blocks: [], singles: 0, lone: 0, readout: '', missingForms: [] };
    const seenMissing = new Set<string>();
    if (!scheme.enabled) {
        // Nothing is cut: the word reads as one run.
        summary.singles = entries.length;
        summary.readout = entries.map((_, i) => readEntry(entries, i, index)).join('');
        return summary;
    }
    // Segmented ONCE; the readout is the shared helper's (so the word check
    // phrases the same word the same way).
    const segments = segmentEntries(entries, scheme, index);
    summary.readout = readSegments(segments, entries, index);
    for (const segment of segments) {
        if (segment.kind === 'passthrough') continue;
        if (segment.kind === 'block') {
            summary.blocks.push({
                templateId: segment.templateId,
                name: names.get(segment.templateId) ?? segment.templateId,
                entryIndices: segment.entryIndices,
            });
            // The composer's own verdict, so the caption cannot disagree
            // with the picture.
            const template = scheme.templates.find((t) => t.id === segment.templateId);
            const composed = composeBlock(segment, entries, scheme, index);
            composed.slots.forEach((slot) => {
                if (!slot.missingGroup) return;
                const groupId = template?.slots.find((s) => s.roleId === slot.roleId)?.groupId ?? null;
                const group = groupId === null ? null : (groupNames.get(groupId) ?? null);
                const entry = entries[slot.entryIndex];
                const sign = entry?.grapheme?.name ?? entry?.ipaCharacter ?? '?';
                const key = `${sign}|${group ?? ''}`;
                if (seenMissing.has(key)) return;
                seenMissing.add(key);
                summary.missingForms.push({ sign, group });
            });
        } else if (drawsWithMark(segment, entries, index, scheme)) {
            // The renderer's own verdict (a deleted mark draws the consonant alone).
            summary.lone += 1;
        } else {
            summary.singles += 1;
        }
    }
    return summary;
}

// =============================================================================
// BLOCKING PROBLEMS
// =============================================================================

/**
 * What must be fixed before the draft can be saved. The scheme validator is
 * lenient — it would silently DROP a role whose category is empty, and with it
 * every template using that role — so the page refuses to save instead and
 * says why. Everything the validator merely tidies (clamped slots, defaulted
 * labels) is left to it and reported after the save.
 */
export function draftProblems(scheme: BlockScheme): string[] {
    const problems: string[] = [];
    scheme.roles.forEach((role, i) => {
        const name = role.label.trim() || `Role ${i + 1}`;
        if (!role.label.trim()) problems.push(`Role ${i + 1} needs a label.`);
        if (role.matcher.kind === 'category' && !role.matcher.category.trim()) {
            problems.push(`${name} matches a category but names none.`);
        }
    });
    scheme.templates.forEach((template, i) => {
        if (!template.name.trim()) problems.push(`Template ${i + 1} needs a name.`);
    });
    return problems;
}
