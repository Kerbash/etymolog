/**
 * Block awareness for the canvas — pure helpers (BLOCK_SCRIPT_PLAN Phase 6).
 *
 * The canvas stays ENTRY-based; these helpers only READ its entries to find
 * where the script's block scheme groups them. The grouping is the engine's
 * (`segmentEntries` from `src/blocks`) run over exactly the entries the canvas
 * holds, so the outlines on the canvas and the composed preview above it can
 * never disagree with each other or with every other renderer.
 *
 * @module glyphCanvasInput/utils/blockUtils
 */

import { segmentEntries } from '../../../../../blocks/segment';
import type { BlockRole, BlockScheme, BlockTemplate } from '../../../../../blocks/types';
import type { GraphemeComplete, SpellingDisplayEntry } from '../../../../../db/types';
import { parseSpellingEntry, type SpellingEntry } from '../../../../../db/utils/spellingUtils';

/**
 * `glyph_order` → display entries, 1:1 by position (entry `i` is canvas tile
 * `i`), resolved against an in-memory grapheme map instead of the database.
 *
 * Mirrors `buildSpellingDisplay` (lexiconService): a pin travels as
 * `variantId`; a grapheme missing from the map becomes the same visible
 * `[?<id>]` placeholder. Unlike it, NOTHING is skipped — the canvas needs the
 * positions to line up with its tiles.
 */
export function glyphOrderToDisplayEntries(
    order: readonly SpellingEntry[],
    graphemeMap: ReadonlyMap<number, GraphemeComplete>,
): SpellingDisplayEntry[] {
    return order.map((raw, position): SpellingDisplayEntry => {
        const parsed = parseSpellingEntry(raw);
        if (parsed.type === 'grapheme' && parsed.graphemeId) {
            const grapheme = graphemeMap.get(parsed.graphemeId);
            if (!grapheme) return { type: 'ipa', position, ipaCharacter: `[?${parsed.graphemeId}]` };
            return parsed.variantId !== undefined
                ? { type: 'grapheme', position, grapheme, variantId: parsed.variantId }
                : { type: 'grapheme', position, grapheme };
        }
        return { type: 'ipa', position, ipaCharacter: parsed.ipaCharacter ?? raw };
    });
}

/** One block on the canvas: which tiles it groups, and how to label it. */
export interface CanvasBlock {
    /** Stable within one render: the first entry's index. */
    key: number;
    template: BlockTemplate;
    /** The template's pattern roles, in pattern order (`undefined` never survives validation). */
    roles: BlockRole[];
    /** Entry indices, in writing order (contiguous). */
    entryIndices: number[];
    /**
     * The role each entry fills, parallel to `entryIndices` — the segment's
     * own `roleIds`. Absent for a count-less template, whose entries fill the
     * pattern one-to-one.
     */
    roleIds?: string[];
    /** Outline colour: the first role's colour, else the interactive token. */
    colour: string;
}

/** Used when the template's first role has no colour. */
export const DEFAULT_BLOCK_COLOUR = 'var(--interactive-base)';

/**
 * The blocks among `entries` under `scheme`. `single` / `passthrough`
 * segments produce nothing (their tiles get no outline). Does not look at
 * `scheme.enabled` — the caller decides whether blocks are on at all.
 */
export function computeCanvasBlocks(
    entries: readonly SpellingDisplayEntry[],
    scheme: BlockScheme,
    graphemeMap: ReadonlyMap<number, GraphemeComplete>,
): CanvasBlock[] {
    const templates = new Map(scheme.templates.map((template) => [template.id, template]));
    const roles = new Map(scheme.roles.map((role) => [role.id, role]));
    const blocks: CanvasBlock[] = [];
    for (const segment of segmentEntries(entries, scheme, graphemeMap)) {
        if (segment.kind !== 'block') continue;
        const template = templates.get(segment.templateId);
        if (!template) continue;
        const patternRoles = template.pattern
            .map((roleId) => roles.get(roleId))
            .filter((role): role is BlockRole => role !== undefined);
        const colour = patternRoles[0]?.colour?.trim();
        blocks.push({
            key: segment.entryIndices[0],
            template,
            roles: patternRoles,
            entryIndices: segment.entryIndices,
            ...(segment.roleIds ? { roleIds: segment.roleIds } : {}),
            colour: colour ? colour : DEFAULT_BLOCK_COLOUR,
        });
    }
    return blocks;
}

/** One variant a slot's grapheme can be pinned to. */
export interface SlotVariantOption {
    id: number;
    name: string;
    isDefault: boolean;
}

/** What the block popover shows for one ENTRY of a block (one row). */
export interface BlockSlotDetails {
    roleId: string;
    roleLabel: string;
    /**
     * The row's label: the role label, numbered ("Onset", "Onset (2)", …) only
     * when the role holds several entries in this block.
     */
    label: string;
    /** Entry position (in the canvas selection) this row describes. */
    entryIndex: number;
    /** `grapheme` entries can be pinned; IPA (virtual) entries cannot. */
    kind: 'grapheme' | 'ipa';
    /** Grapheme name, or the IPA character. */
    name: string;
    /** Current pin, `null` = automatic. */
    pin: number | null;
    /** Every variant of the grapheme (default first), empty for IPA entries. */
    variants: SlotVariantOption[];
    /** "Auto (head)" / "Auto (default form)" — what automatic means for this slot. */
    autoLabel: string;
    /**
     * Set when the slot asks for a form group this sign has no form in (or a
     * group that no longer exists), so "Auto" actually draws the DEFAULT form.
     * The group's name, or `null` for a deleted group. Undefined otherwise.
     */
    missingGroup?: { name: string | null };
}

/**
 * The popover's model for one block: one row per ENTRY (writing order) with
 * the role it fills, its current pin and the variants it can be pinned to. A
 * slot that holds several signs yields several rows, numbered by `label`; an
 * empty optional slot yields none. `groupNames` names the slot's variant group
 * for the "Auto (…)" option; a slot with no group — or a group that no longer
 * exists — is the default form.
 */
export function describeBlockSlots(
    block: CanvasBlock,
    entries: readonly SpellingDisplayEntry[],
    pins: readonly (number | null)[],
    graphemeMap: ReadonlyMap<number, GraphemeComplete>,
    groupNames: ReadonlyMap<number, string>,
): BlockSlotDetails[] {
    const roles = new Map(block.roles.map((role) => [role.id, role]));
    // The segment's role per entry. Reading the pattern positionally would
    // pair entry k with role k — wrong as soon as a slot takes 0 or 2+ signs.
    const roleIds = block.roleIds ?? block.template.pattern;
    const seen = new Map<string, number>();
    return block.entryIndices.map((entryIndex, k) => {
        const roleId = roleIds[k] ?? '';
        const entry = entries[entryIndex];
        const slot = block.template.slots.find((s) => s.roleId === roleId);
        const groupId = slot?.groupId ?? null;
        const groupName = groupId !== null ? groupNames.get(groupId) : undefined;
        const roleLabel = roles.get(roleId)?.label ?? roleId;
        const nth = (seen.get(roleId) ?? 0) + 1;
        seen.set(roleId, nth);
        // The first sign of a role keeps the plain label; only repeats are numbered.
        const label = nth > 1 ? `${roleLabel} (${nth})` : roleLabel;

        const grapheme = entry?.type === 'grapheme' && entry.grapheme ? graphemeMap.get(entry.grapheme.id) : undefined;
        if (!grapheme) {
            return {
                roleId,
                roleLabel,
                label,
                entryIndex,
                kind: 'ipa' as const,
                name: entry?.ipaCharacter ?? '?',
                pin: null,
                variants: [],
                autoLabel: `Auto (${groupName ?? 'default form'})`,
            };
        }
        // Mirrors `pickVariant`: a slot group the sign has no form in — or a
        // deleted group — falls back to the default form, so say so rather
        // than promising the group's form.
        const missing = groupId !== null
            && (groupName === undefined || !(grapheme.variants ?? []).some((v) => v.group_id === groupId));
        const autoLabel = missing
            ? `Auto (default form — no ${groupName ?? 'group'} form)`
            : `Auto (${groupName ?? 'default form'})`;
        const variants = [...(grapheme.variants ?? [])]
            .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.sort_order - b.sort_order || a.id - b.id)
            .map((v) => ({ id: v.id, name: v.name, isDefault: v.is_default }));
        return {
            roleId,
            roleLabel,
            label,
            entryIndex,
            kind: 'grapheme' as const,
            name: grapheme.name,
            pin: pins[entryIndex] ?? null,
            variants,
            autoLabel,
            ...(missing ? { missingGroup: { name: groupName ?? null } } : {}),
        };
    });
}
