/**
 * Block script — match one template against a stretch of classified entries
 * (SYLLABLE_BLOCKS_PLAN.md §3.2).
 *
 * A template's pattern is a list of roles; each role's slot says how many
 * entries it takes (`[slot.min ?? 1, slot.max ?? 1]` — pitfall P2). Matching is
 * a small backtracking search: pattern items in order, each taking as many
 * consecutive entries its role accepts as it may, backing off one at a time
 * when a later item cannot be satisfied. Runs are short and counts are capped
 * (`MAX_SLOT_COUNT`), so the search is tiny.
 *
 * A template with no counts has exactly one candidate path — one entry per
 * role — so it behaves exactly like the original `pattern.every(roleAccepts)`
 * prefix check (pitfall P1: count-less schemes segment byte-identically).
 *
 * Pure; never throws.
 *
 * @module blocks/match
 */

import { roleAccepts } from './classify';
import type { BlockRole, BlockTemplate, EntryClass } from './types';

/** A successful match of one template. */
export interface TemplateMatch {
    /** Entries consumed, starting at `start`. Always ≥ 1. */
    length: number;
    /** The role each consumed entry fills, in entry order (`length` items). */
    roleIds: string[];
    /** Pattern items that took no entry (optional slots left empty). */
    emptyOptional: number;
}

interface PatternItem {
    roleId: string;
    role: BlockRole;
    min: number;
    max: number;
}

/**
 * Does any slot of `template` declare a count? Count-less templates are the
 * pre-count shape, whose block segments carry no `roleIds` (P1).
 */
export function templateHasCounts(template: BlockTemplate): boolean {
    return template.slots.some((slot) => slot.min !== undefined || slot.max !== undefined);
}

/**
 * Match `template` against `classes[start, end)`.
 *
 *  - `'prefix'`: the LONGEST match starting at `start` (template mode — the
 *    rest of the run is segmented afterwards);
 *  - `'exact'`: a match consuming exactly `start..end` (syllable mode — the
 *    syllable is already cut).
 *
 * Ties go to the match found first, and each item tries its LARGEST count
 * first — so earlier items take more entries (`C1(0–3) C2(0–3)` on `s t` puts
 * both in C1).
 *
 * `groups` (DIPHTHONG_BLOCKS_PLAN.md §3.4), parallel to `classes`, glues
 * entries that must stay together — a diphthong spelled with two signs. A
 * role then takes WHOLE groups: the group starting at `pos` runs to the first
 * entry with a different id, and is taken only when the role accepts EVERY
 * entry in it. Slot counts (`min`/`max`) count GROUPS, so a vowel slot that
 * holds exactly one takes the glued pair; `length` and `roleIds` stay per
 * ENTRY. A range that starts or ends inside a group simply cuts it there
 * (the segmenter never asks for that). Absent `groups` = every entry its own
 * group — the search is exactly the one without groups (P1).
 *
 * `null` when nothing matches, when a pattern role is missing from
 * `rolesById` (only possible with an unvalidated scheme — never half-match),
 * or when the only match would take zero entries (a block needs at least one).
 */
export function matchTemplate(
    template: BlockTemplate,
    rolesById: ReadonlyMap<string, BlockRole>,
    classes: readonly EntryClass[],
    start: number,
    end: number,
    mode: 'prefix' | 'exact',
    groups?: readonly number[],
): TemplateMatch | null {
    const items: PatternItem[] = [];
    for (const roleId of template.pattern) {
        const role = rolesById.get(roleId);
        if (!role) return null;
        const slot = template.slots.find((s) => s.roleId === roleId);
        const min = slot?.min ?? 1;
        // `max < min` is impossible in a validated scheme; never let it make a
        // role unsatisfiable by accident.
        const max = Math.max(min, slot?.max ?? 1);
        items.push({ roleId, role, min, max });
    }
    if (items.length === 0) return null;

    const limit = Math.min(end, classes.length);
    if (start >= limit) return null;

    /**
     * Entries in the group starting at `pos` (1 without `groups`). Bounded
     * by `limit`, so a range ending mid-group cuts the group there.
     */
    const groupSize = (pos: number): number => {
        if (groups === undefined) return 1;
        let q = pos + 1;
        while (q < limit && groups[q] === groups[pos]) q += 1;
        return q - pos;
    };

    /** Entries each item took (per ENTRY, so `roleIds` has `length` items). */
    const counts: number[] = new Array<number>(items.length).fill(0);
    let best: TemplateMatch | null = null;

    const snapshot = (length: number): TemplateMatch => ({
        length,
        roleIds: items.flatMap((item, k) => new Array<string>(counts[k]).fill(item.roleId)),
        emptyOptional: counts.filter((n) => n === 0).length,
    });

    /** Returns true when the search can stop (no later candidate could win). */
    const search = (k: number, pos: number): boolean => {
        if (k === items.length) {
            const length = pos - start;
            if (length === 0) return false;
            if (mode === 'exact') {
                if (pos !== limit) return false;
                best = snapshot(length);
                return true;
            }
            if (best === null || length > best.length) best = snapshot(length);
            // Nothing can be longer than reaching the limit; a tie loses to this one.
            return pos === limit;
        }
        const { role, min, max } = items[k];
        // The longest run of whole groups this role accepts here — shorter
        // counts are its prefixes. `ends[n]` = where `n` groups end.
        const ends: number[] = [pos];
        let run = 0;
        while (run < max && ends[run] < limit) {
            const from = ends[run];
            const to = from + groupSize(from);
            let accepted = true;
            for (let e = from; e < to && accepted; e += 1) accepted = roleAccepts(role, classes[e]);
            if (!accepted) break;
            run += 1;
            ends.push(to);
        }
        for (let n = run; n >= min; n -= 1) {
            counts[k] = ends[n] - pos;
            if (search(k + 1, ends[n])) return true;
        }
        return false;
    };

    search(0, start);
    return best;
}
