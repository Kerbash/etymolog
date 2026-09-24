/**
 * Block scheme — validation + defaults (plan §2.4).
 *
 * The scheme arrives from untrusted places: the `block_scheme` row (possibly
 * written by an older build), an import envelope (hand-editable JSON) and the
 * Block Designer. All of them pass through `validateBlockScheme()`, which
 * returns a COMPLETE, self-consistent `BlockScheme` plus the list of issues it
 * had to correct — the same lenient contract as `db/api/settingsSchema.ts`.
 * Callers decide strictness (load/import: log and keep the corrected document;
 * save: reject when any issue is present).
 *
 * The validator is PURE. It never asks the database whether a variant group
 * exists — that is checked at compose time, where a missing group falls back
 * to the default variant visibly.
 *
 * Guarantees of the returned scheme (the engine relies on them):
 *  - role ids are unique non-empty strings, labels non-empty, matchers valid;
 *  - template ids are unique; every pattern is non-empty, references only
 *    existing roles, and names no role twice;
 *  - every template has exactly one slot per pattern role and no other slot;
 *  - every slot lies inside the unit square with `w, h ≥ MIN_SLOT_SIZE`;
 *  - slot counts are in range: `min` ∈ {0, 1}, `max` ∈ 1..MAX_SLOT_COUNT,
 *    `arrange` ∈ {row, column};
 *  - no template uses the reserved id `LONE_CONSONANT_TEMPLATE_ID`;
 *  - `split` / `leftovers`, when present, are complete and valid (an invalid
 *    one is dropped whole — absent always has a defined meaning).
 *
 * NORMALISED output (SYLLABLE_BLOCKS_PLAN.md pitfall N1): an optional field is
 * emitted only when it differs from its default — `min` only when 0, `max`
 * only when > 1, `arrange` only when 'column', `split.sibilantClusters` only
 * when true, `split.diphthongs` and `split.syllabicConsonants` only when
 * non-empty (in `normalizeSoundList` form — `normalizeDiphthongs` is its
 * older name). So a document written before those fields existed validates to
 * exactly the object it did then, and the designer's `sameDocument(draft,
 * saved)` never sees a phantom change from an explicit default.
 *
 * @module blocks/validate
 */

import { isClassLetter } from '../generator/phonology/classes';
import { safeNormalize } from '../generator/phonology/features';
import type {
    BlockLeftovers,
    BlockRole,
    BlockScheme,
    BlockSlot,
    BlockSplit,
    BlockTemplate,
    LeftoverPlacement,
    RoleMatcher,
    SchemeIssue,
    SchemeValidation,
} from './types';

/**
 * Template id the engine uses for a lone consonant drawn with its
 * vowel-killer mark. Reserved: a user template with this id is dropped, so a
 * composed block's `templateId` can never be ambiguous.
 */
export const LONE_CONSONANT_TEMPLATE_ID = '@lone';

/**
 * Most signs one slot can take. Runs are short and the matcher backtracks, so
 * the cap keeps the search trivially small (and a rectangle split five ways
 * is already unreadable).
 */
export const MAX_SLOT_COUNT = 4;

/**
 * Most entries a sound list keeps — `split.diphthongs` and
 * `split.syllabicConsonants` alike (DIPHTHONG_BLOCKS_PLAN.md §2,
 * CONLANG_EDGES_PLAN.md §2).
 */
export const MAX_SOUND_LIST = 32;

/** Most code points one sound-list entry may have. */
export const MAX_SOUND_LENGTH = 8;

/** Most entries `split.diphthongs` keeps — the older name of `MAX_SOUND_LIST`. */
export const MAX_DIPHTHONGS = MAX_SOUND_LIST;

/** Most code points one `split.diphthongs` entry may have — the older name of `MAX_SOUND_LENGTH`. */
export const MAX_DIPHTHONG_LENGTH = MAX_SOUND_LENGTH;

/**
 * A normalised sound list (pitfall N1) — `split.diphthongs` and
 * `split.syllabicConsonants` — the ONE implementation the validator and the
 * designer share, so a saved list and the draft it came from can never
 * differ. Each entry is trimmed and NFC-normalised; empty and non-string
 * entries are dropped, duplicates keep their first occurrence, entries longer
 * than `MAX_SOUND_LENGTH` code points are dropped, and at most
 * `MAX_SOUND_LIST` entries are kept (insertion order). Never throws.
 */
export function normalizeSoundList(list: readonly unknown[]): string[] {
    const out: string[] = [];
    for (const raw of list) {
        if (out.length >= MAX_SOUND_LIST) break;
        const entry = soundEntry(raw);
        if (entry !== null && !out.includes(entry)) out.push(entry);
    }
    return out;
}

/** The normalised diphthong list — the older name of `normalizeSoundList` (same function). */
export const normalizeDiphthongs = normalizeSoundList;

/** One entry normalised, or `null` when it cannot be one. */
function soundEntry(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const entry = safeNormalize(raw.trim(), 'NFC');
    if (entry.length === 0 || Array.from(entry).length > MAX_SOUND_LENGTH) return null;
    return entry;
}

const LEFTOVER_PLACEMENTS: readonly LeftoverPlacement[] = ['below', 'above', 'after', 'before'];

/** The scheme a fresh database (no `block_scheme` row) behaves as. Never mutate — use `cloneEmptyBlockScheme()`. */
export const EMPTY_BLOCK_SCHEME: Readonly<BlockScheme> = Object.freeze({
    version: 1,
    enabled: false,
    roles: Object.freeze([]) as unknown as BlockRole[],
    templates: Object.freeze([]) as unknown as BlockTemplate[],
});

/** A fresh, unshared copy of the empty scheme. */
export function cloneEmptyBlockScheme(): BlockScheme {
    return { version: 1, enabled: false, roles: [], templates: [] };
}

/**
 * Smallest width/height a slot is clamped to. `w, h > 0` is the rule; a
 * zero-size rectangle would draw nothing and could not be grabbed in the
 * designer, so a non-positive size is lifted to this instead of being dropped.
 */
export const MIN_SLOT_SIZE = 0.01;

const SCHEME_KEYS = new Set(['version', 'enabled', 'roles', 'templates', 'split', 'leftovers']);
const ROLE_KEYS = new Set(['id', 'label', 'colour', 'matcher']);
const TEMPLATE_KEYS = new Set(['id', 'name', 'pattern', 'slots']);
const SLOT_KEYS = new Set(['roleId', 'groupId', 'x', 'y', 'w', 'h', 'min', 'max', 'arrange']);
const SPLIT_KEYS = new Set(['mode', 'sibilantClusters', 'diphthongs', 'syllabicConsonants']);
const LEFTOVERS_KEYS = new Set(['markGraphemeId', 'placement']);
const MATCHER_KEYS: Record<RoleMatcher['kind'], Set<string>> = {
    class: new Set(['kind', 'letter']),
    syllable: new Set(['kind']),
    category: new Set(['kind', 'category']),
    any: new Set(['kind']),
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function reportUnknownKeys(
    source: Record<string, unknown>,
    known: ReadonlySet<string>,
    path: string,
    issues: SchemeIssue[],
): void {
    for (const key of Object.keys(source)) {
        if (!known.has(key)) {
            issues.push({ path: path ? `${path}.${key}` : key, message: 'unknown key (dropped)' });
        }
    }
}

function validateMatcher(raw: unknown, path: string, issues: SchemeIssue[]): RoleMatcher | null {
    if (!isRecord(raw)) {
        issues.push({ path, message: 'expected an object' });
        return null;
    }
    const kind = raw.kind;
    if (kind !== 'class' && kind !== 'syllable' && kind !== 'category' && kind !== 'any') {
        issues.push({ path: `${path}.kind`, message: 'expected one of class, syllable, category, any' });
        return null;
    }
    reportUnknownKeys(raw, MATCHER_KEYS[kind], path, issues);
    switch (kind) {
        case 'class': {
            const letter = raw.letter;
            if (typeof letter !== 'string' || !isClassLetter(letter)) {
                issues.push({ path: `${path}.letter`, message: 'expected a class letter (C V P F S N L G R O)' });
                return null;
            }
            return { kind, letter };
        }
        case 'category': {
            if (!isNonEmptyString(raw.category)) {
                issues.push({ path: `${path}.category`, message: 'expected a non-empty string' });
                return null;
            }
            return { kind, category: raw.category.trim() };
        }
        case 'syllable':
        case 'any':
            return { kind };
    }
}

function validateRole(
    raw: unknown,
    path: string,
    seen: Set<string>,
    issues: SchemeIssue[],
): BlockRole | null {
    if (!isRecord(raw)) {
        issues.push({ path, message: 'expected an object (role dropped)' });
        return null;
    }
    reportUnknownKeys(raw, ROLE_KEYS, path, issues);
    const { id } = raw;
    if (!isNonEmptyString(id)) {
        issues.push({ path: `${path}.id`, message: 'expected a non-empty string (role dropped)' });
        return null;
    }
    if (seen.has(id)) {
        issues.push({ path: `${path}.id`, message: `duplicate role id "${id}" (role dropped)` });
        return null;
    }
    const matcher = validateMatcher(raw.matcher, `${path}.matcher`, issues);
    if (!matcher) {
        issues.push({ path, message: `role "${id}" has no valid matcher (role dropped)` });
        return null;
    }
    seen.add(id);

    let label: string;
    if (isNonEmptyString(raw.label)) {
        label = raw.label;
    } else {
        issues.push({ path: `${path}.label`, message: 'expected a non-empty string (defaulted to the role id)' });
        label = id;
    }

    const role: BlockRole = { id, label, matcher };
    if (raw.colour !== undefined) {
        if (typeof raw.colour === 'string') {
            role.colour = raw.colour;
        } else {
            issues.push({ path: `${path}.colour`, message: 'expected a string (dropped)' });
        }
    }
    return role;
}

function finiteOr(raw: unknown, fallback: number, path: string, issues: SchemeIssue[]): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    issues.push({ path, message: `expected a finite number (defaulted to ${fallback})` });
    return fallback;
}

function clamp(value: number, min: number, max: number, path: string, issues: SchemeIssue[]): number {
    if (value < min) {
        issues.push({ path, message: `below ${min} (clamped)` });
        return min;
    }
    if (value > max) {
        issues.push({ path, message: `above ${max} (clamped)` });
        return max;
    }
    return value;
}

/** Validate the geometry + group of a slot whose `roleId` is already known good. */
function validateSlotBody(
    raw: Record<string, unknown>,
    roleId: string,
    path: string,
    issues: SchemeIssue[],
): BlockSlot {
    let groupId: number | null = null;
    const rawGroup = raw.groupId;
    if (rawGroup === null || rawGroup === undefined) {
        groupId = null;
    } else if (typeof rawGroup === 'number' && Number.isInteger(rawGroup) && rawGroup > 0) {
        groupId = rawGroup;
    } else {
        issues.push({ path: `${path}.groupId`, message: 'expected a positive integer or null (defaulted to null)' });
    }

    // Origin first (so the size clamp knows the room left), then size.
    const x = clamp(finiteOr(raw.x, 0, `${path}.x`, issues), 0, 1 - MIN_SLOT_SIZE, `${path}.x`, issues);
    const y = clamp(finiteOr(raw.y, 0, `${path}.y`, issues), 0, 1 - MIN_SLOT_SIZE, `${path}.y`, issues);
    const w = clamp(finiteOr(raw.w, 1 - x, `${path}.w`, issues), MIN_SLOT_SIZE, 1 - x, `${path}.w`, issues);
    const h = clamp(finiteOr(raw.h, 1 - y, `${path}.h`, issues), MIN_SLOT_SIZE, 1 - y, `${path}.h`, issues);

    const slot: BlockSlot = { roleId, groupId, x, y, w, h };
    // Normalised (N1): each count field is written only when it is not its default.
    const min = slotCount(raw.min, 0, 1, 1, `${path}.min`, issues);
    const max = slotCount(raw.max, 1, MAX_SLOT_COUNT, 1, `${path}.max`, issues);
    if (min === 0) slot.min = 0;
    if (max > 1) slot.max = max as NonNullable<BlockSlot['max']>;
    if (raw.arrange !== undefined && raw.arrange !== 'row') {
        if (raw.arrange === 'column') {
            slot.arrange = 'column';
        } else {
            issues.push({ path: `${path}.arrange`, message: "expected 'row' or 'column' (defaulted to 'row')" });
        }
    }
    return slot;
}

/**
 * A slot count: absent → `fallback` silently; an integer outside
 * [low, high] → clamped with an issue (the author clearly meant "few" or
 * "many", so the nearest legal count beats forgetting it); anything else →
 * `fallback` with an issue.
 */
function slotCount(
    raw: unknown,
    low: number,
    high: number,
    fallback: number,
    path: string,
    issues: SchemeIssue[],
): number {
    if (raw === undefined) return fallback;
    if (typeof raw !== 'number' || !Number.isInteger(raw)) {
        issues.push({ path, message: `expected an integer ${low}–${high} (defaulted to ${fallback})` });
        return fallback;
    }
    return clamp(raw, low, high, path, issues);
}

/** The scheme's `split` field, or `undefined` (absent / invalid — dropped whole). */
function validateSplit(raw: unknown, issues: SchemeIssue[]): BlockSplit | undefined {
    if (raw === undefined) return undefined;
    if (!isRecord(raw)) {
        issues.push({ path: 'split', message: 'expected an object (dropped)' });
        return undefined;
    }
    reportUnknownKeys(raw, SPLIT_KEYS, 'split', issues);
    if (raw.mode !== 'syllables' && raw.mode !== 'templates') {
        issues.push({ path: 'split.mode', message: "expected 'syllables' or 'templates' (split dropped)" });
        return undefined;
    }
    const split: BlockSplit = { mode: raw.mode };
    if (raw.sibilantClusters !== undefined) {
        if (typeof raw.sibilantClusters !== 'boolean') {
            issues.push({ path: 'split.sibilantClusters', message: 'expected a boolean (dropped)' });
        } else if (raw.sibilantClusters) {
            split.sibilantClusters = true;
        }
    }
    // Normalised (N1): each list is written only when non-empty.
    const diphthongs = validateSoundList(raw.diphthongs, 'split.diphthongs', issues);
    if (diphthongs.length > 0) split.diphthongs = diphthongs;
    const syllabicConsonants = validateSoundList(raw.syllabicConsonants, 'split.syllabicConsonants', issues);
    if (syllabicConsonants.length > 0) split.syllabicConsonants = syllabicConsonants;
    return split;
}

/**
 * A sound list (`split.diphthongs`, `split.syllabicConsonants`) at `path`,
 * entry by entry: a bad entry is dropped with an issue (`<path>[k]`), never
 * the whole `split`. Structural only — whether an entry really is vowels /
 * one consonant is the designer's warning, not a validation error (the
 * engine only ever glues vowels and only promotes consonants, so a stray
 * entry is harmless). The result is exactly `normalizeSoundList(raw)` (N1).
 */
function validateSoundList(raw: unknown, path: string, issues: SchemeIssue[]): string[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) {
        issues.push({ path, message: 'expected an array of strings (dropped)' });
        return [];
    }
    const kept: string[] = [];
    raw.forEach((value: unknown, k: number) => {
        const entryPath = `${path}[${k}]`;
        const entry = soundEntry(value);
        if (typeof value !== 'string') {
            issues.push({ path: entryPath, message: 'expected a string (dropped)' });
        } else if (entry === null) {
            issues.push({ path: entryPath, message: `expected 1–${MAX_SOUND_LENGTH} characters (dropped)` });
        } else if (kept.includes(entry)) {
            issues.push({ path: entryPath, message: `"${entry}" is listed twice (dropped)` });
        } else if (kept.length >= MAX_SOUND_LIST) {
            issues.push({ path: entryPath, message: `more than ${MAX_SOUND_LIST} entries (dropped)` });
        } else {
            kept.push(entry);
        }
    });
    return kept;
}

/** The scheme's `leftovers` field, or `undefined` (absent / invalid — dropped whole). */
function validateLeftovers(raw: unknown, issues: SchemeIssue[]): BlockLeftovers | undefined {
    if (raw === undefined) return undefined;
    if (!isRecord(raw)) {
        issues.push({ path: 'leftovers', message: 'expected an object (dropped)' });
        return undefined;
    }
    reportUnknownKeys(raw, LEFTOVERS_KEYS, 'leftovers', issues);
    const { markGraphemeId, placement } = raw;
    let valid = true;
    if (typeof markGraphemeId !== 'number' || !Number.isInteger(markGraphemeId) || markGraphemeId <= 0) {
        issues.push({ path: 'leftovers.markGraphemeId', message: 'expected a positive integer (leftovers dropped)' });
        valid = false;
    }
    if (typeof placement !== 'string' || !(LEFTOVER_PLACEMENTS as readonly string[]).includes(placement)) {
        issues.push({ path: 'leftovers.placement', message: `expected one of ${LEFTOVER_PLACEMENTS.join(', ')} (leftovers dropped)` });
        valid = false;
    }
    return valid ? { markGraphemeId: markGraphemeId as number, placement: placement as LeftoverPlacement } : undefined;
}

function validateTemplate(
    raw: unknown,
    path: string,
    roleIds: ReadonlySet<string>,
    seen: Set<string>,
    issues: SchemeIssue[],
): BlockTemplate | null {
    if (!isRecord(raw)) {
        issues.push({ path, message: 'expected an object (template dropped)' });
        return null;
    }
    reportUnknownKeys(raw, TEMPLATE_KEYS, path, issues);
    const { id } = raw;
    if (!isNonEmptyString(id)) {
        issues.push({ path: `${path}.id`, message: 'expected a non-empty string (template dropped)' });
        return null;
    }
    if (id === LONE_CONSONANT_TEMPLATE_ID) {
        issues.push({ path: `${path}.id`, message: `"${id}" is a reserved id (template dropped)` });
        return null;
    }
    if (seen.has(id)) {
        issues.push({ path: `${path}.id`, message: `duplicate template id "${id}" (template dropped)` });
        return null;
    }

    // --- pattern -------------------------------------------------------------
    const pattern: string[] = [];
    if (!Array.isArray(raw.pattern)) {
        issues.push({ path: `${path}.pattern`, message: 'expected an array of role ids' });
    } else {
        raw.pattern.forEach((entry: unknown, k: number) => {
            const entryPath = `${path}.pattern[${k}]`;
            if (typeof entry !== 'string' || !roleIds.has(entry)) {
                issues.push({ path: entryPath, message: `unknown role id ${JSON.stringify(entry)} (dropped)` });
            } else if (pattern.includes(entry)) {
                issues.push({ path: entryPath, message: `role "${entry}" appears twice in one pattern (dropped) — define a second role instead` });
            } else {
                pattern.push(entry);
            }
        });
    }
    if (pattern.length === 0) {
        issues.push({ path: `${path}.pattern`, message: 'a template needs at least one role (template dropped)' });
        return null;
    }
    seen.add(id);

    let name: string;
    if (isNonEmptyString(raw.name)) {
        name = raw.name;
    } else {
        issues.push({ path: `${path}.name`, message: 'expected a non-empty string (defaulted to the template id)' });
        name = id;
    }

    // --- slots ---------------------------------------------------------------
    const byRole = new Map<string, BlockSlot>();
    if (!Array.isArray(raw.slots)) {
        issues.push({ path: `${path}.slots`, message: 'expected an array' });
    } else {
        raw.slots.forEach((slot: unknown, k: number) => {
            const slotPath = `${path}.slots[${k}]`;
            if (!isRecord(slot)) {
                issues.push({ path: slotPath, message: 'expected an object (slot dropped)' });
                return;
            }
            reportUnknownKeys(slot, SLOT_KEYS, slotPath, issues);
            const roleId = slot.roleId;
            if (typeof roleId !== 'string' || !pattern.includes(roleId)) {
                issues.push({ path: `${slotPath}.roleId`, message: `role ${JSON.stringify(roleId)} is not in the pattern (slot dropped)` });
                return;
            }
            if (byRole.has(roleId)) {
                issues.push({ path: `${slotPath}.roleId`, message: `second slot for role "${roleId}" (slot dropped)` });
                return;
            }
            byRole.set(roleId, validateSlotBody(slot, roleId, slotPath, issues));
        });
    }

    // Keep the author's slot order; synthesize a full-square slot for any
    // pattern role that has none (dropping the whole template would be the
    // more destructive correction).
    const slots: BlockSlot[] = [...byRole.values()];
    for (const roleId of pattern) {
        if (!byRole.has(roleId)) {
            issues.push({ path: `${path}.slots`, message: `no slot for role "${roleId}" (added a full-square slot)` });
            slots.push({ roleId, groupId: null, x: 0, y: 0, w: 1, h: 1 });
        }
    }

    return { id, name, pattern, slots };
}

/**
 * Validate a block scheme document. Never throws; always returns a complete
 * scheme (the empty scheme at worst) plus every correction made.
 *
 * `undefined` validates silently to the empty scheme (a missing document is
 * not an error); anything else that is not an object is reported.
 */
export function validateBlockScheme(raw: unknown): SchemeValidation {
    const issues: SchemeIssue[] = [];
    const scheme = cloneEmptyBlockScheme();

    if (!isRecord(raw)) {
        if (raw !== undefined) issues.push({ path: '', message: 'expected an object (defaulted to the empty scheme)' });
        return { scheme, issues };
    }
    reportUnknownKeys(raw, SCHEME_KEYS, '', issues);

    if (raw.version !== undefined && raw.version !== 1) {
        issues.push({ path: 'version', message: `unsupported version ${JSON.stringify(raw.version)} (read as 1)` });
    }

    if (raw.enabled === undefined) {
        scheme.enabled = false;
    } else if (typeof raw.enabled === 'boolean') {
        scheme.enabled = raw.enabled;
    } else {
        issues.push({ path: 'enabled', message: 'expected a boolean (defaulted to false)' });
    }

    const roleIds = new Set<string>();
    if (raw.roles !== undefined && !Array.isArray(raw.roles)) {
        issues.push({ path: 'roles', message: 'expected an array' });
    } else if (Array.isArray(raw.roles)) {
        raw.roles.forEach((role: unknown, i: number) => {
            const validated = validateRole(role, `roles[${i}]`, roleIds, issues);
            if (validated) scheme.roles.push(validated);
        });
    }

    const templateIds = new Set<string>();
    if (raw.templates !== undefined && !Array.isArray(raw.templates)) {
        issues.push({ path: 'templates', message: 'expected an array' });
    } else if (Array.isArray(raw.templates)) {
        raw.templates.forEach((template: unknown, i: number) => {
            const validated = validateTemplate(template, `templates[${i}]`, roleIds, templateIds, issues);
            if (validated) scheme.templates.push(validated);
        });
    }

    // Written only when present and valid (N1): an old document gains no keys.
    const split = validateSplit(raw.split, issues);
    if (split) scheme.split = split;
    const leftovers = validateLeftovers(raw.leftovers, issues);
    if (leftovers) scheme.leftovers = leftovers;

    return { scheme, issues };
}
