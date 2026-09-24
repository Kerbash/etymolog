/**
 * seedFromGenerator — "Add templates from my word shapes".
 *
 * Turns the word generator's syllable shapes (`profile.syllables`, patterns in
 * the `engine/template.ts` language: `CV`, `(C)V(N)`, `CV[n ŋ]`) into block
 * templates, so a user who has already described their syllables gets a
 * starting set of blocks to drag into shape instead of an empty list.
 *
 * Two seeds, one choice in the UI:
 *
 *  - `seedFlexibleTemplate` — "One flexible template" (recommended): a single
 *    `C1 V C2` template whose boxes take as many consonants as the shapes
 *    need (rules on the function).
 *  - `seedFromGenerator` — "One template per shape": the rules below.
 *
 * Per-shape rules, in order:
 *
 *  1. **Parse** each pattern with `parseTemplate` (the generator's own parser —
 *     one answer to "is this pattern legal"). A pattern that does not parse is
 *     skipped with the parser's message.
 *  2. **Expand optional items** into with/without variants: `(C)V(N)` → `CVN`,
 *     `CV`, `VN`, `V` (longest first). A shape with more than
 *     `MAX_OPTIONAL_ITEMS` optional items is skipped rather than exploding
 *     into hundreds of templates.
 *  3. **Literal groups** (`[n ŋ]`) cannot be matched by a role (roles match
 *     classes, syllable signs, categories — not exact sounds), so an expanded
 *     variant that contains one is skipped with a reason. The variants without
 *     it (an optional literal left out) are still added.
 *  4. **Class letters → roles.** The k-th occurrence of letter `L` in a
 *     pattern uses the k-th role (scheme order) whose matcher is
 *     `{ kind: 'class', letter: L }`, creating it when missing. A NEW role is
 *     labelled `L`, or `L1`, `L2`… when some shape in this run uses `L` more
 *     than once (a pattern cannot name one role twice — plan §2.4).
 *  5. **Pattern equality.** A variant whose MATCHER sequence equals an
 *     existing template's (or one added earlier in this run) is skipped — so
 *     running the seed twice adds nothing, and a hand-built `C1 V` template
 *     already covers `CV`.
 *  6. **Layout**: slots in an even row (`x = k/n, w = 1/n, y = 0, h = 1`),
 *     every slot on the default form (`groupId: null`).
 *  7. **Order**: new templates are appended after the existing ones, longest
 *     pattern first (first match wins — a `CV` ahead of `CVN` would shadow it).
 *
 * Pure: no React, no DB. The caller writes the returned scheme into its draft.
 *
 * @module writingSystem/blocks/seedFromGenerator
 */

import { parseTemplate, templateHasVowelSlot, TemplateSyntaxError } from '../../../../generator/engine/template';
import type { TemplateItem } from '../../../../generator/engine/template';
import type { ClassLetter } from '../../../../generator/phonology/classes';
import type { SyllableTemplate } from '../../../../generator/profile/types';
import { MAX_SLOT_COUNT } from '../../../../blocks';
import type { BlockRole, BlockScheme, BlockSlot, BlockTemplate, RoleMatcher } from '../../../../blocks';
import { evenRowSlot, matcherKey, nextRoleId, nextTemplateId, roleColourAt } from './blockSchemeDraft';
import { slotCountOf } from './slotCount';

/** More optional items than this and a shape is skipped (2^n variants). */
export const MAX_OPTIONAL_ITEMS = 4;

/** Which seed the "Add templates from your word shapes" choice runs. */
export type SeedKind = 'flexible' | 'perShape';

export interface SeedSkip {
    /** The expanded pattern, or the source pattern when it failed as a whole. */
    pattern: string;
    reason: string;
}

export interface SeedResult {
    scheme: BlockScheme;
    /** Templates added, in the order they were appended. */
    added: { id: string; name: string }[];
    /** Labels of the roles that had to be created. */
    rolesAdded: string[];
    skipped: SeedSkip[];
    /** Only from `seedFlexibleTemplate`: what the one flexible template holds. */
    flexible?: FlexibleSeedSummary;
}

/** How many consonants one end of the flexible template takes. */
export interface ConsonantRange {
    min: 0 | 1;
    /** 1..MAX_SLOT_COUNT. */
    max: number;
    /** Some shape had more consonants here than one box can hold (`MAX_SLOT_COUNT`). */
    capped: boolean;
}

export interface FlexibleSeedSummary {
    /** `added`: a new template; `alreadyThere`: an equivalent one exists; `none`: no shape was usable. */
    outcome: 'added' | 'alreadyThere' | 'none';
    /** The template added, or the existing equivalent one (absent for `none`). */
    templateName?: string;
    /** Consonants before the vowel; `null` = the template has no box for them. */
    start: ConsonantRange | null;
    /** Consonants after the vowel; `null` = the template has no box for them. */
    end: ConsonantRange | null;
}

/** The concrete (no-optional) item lists of one parsed pattern, longest first. */
function expandOptional(items: TemplateItem[]): TemplateItem[][] {
    const optionalIndices = items.flatMap((item, i) => (item.optional ? [i] : []));
    const variants: TemplateItem[][] = [];
    const combos = 1 << optionalIndices.length;
    for (let mask = combos - 1; mask >= 0; mask -= 1) {
        // The FIRST optional item is the highest bit, so among equal lengths
        // the variant keeping earlier items comes first (`CV` before `VN`).
        const top = optionalIndices.length - 1;
        const dropped = new Set(optionalIndices.filter((_, k) => (mask & (1 << (top - k))) === 0));
        variants.push(items.filter((_, i) => !dropped.has(i)));
    }
    // Longest first; the mask walk already favours keeping items, the sort
    // makes it a guarantee (stable, so equal lengths keep mask order).
    return variants.sort((a, b) => b.length - a.length);
}

/** Why a parse failed, as one phrase (shared by both seeds). */
function parseSkip(pattern: string, error: unknown): SeedSkip {
    const message = error instanceof TemplateSyntaxError || error instanceof Error ? error.message : String(error);
    return { pattern, reason: `cannot be read: ${message}` };
}

function itemText(item: TemplateItem): string {
    return item.kind === 'class' ? item.letter : `[${item.members.join(' ')}]`;
}

function patternText(items: TemplateItem[]): string {
    return items.map(itemText).join('');
}

/**
 * Seed templates from generator syllable shapes. Returns a NEW scheme (the
 * input is not mutated) plus what was added and why anything was skipped.
 */
export function seedFromGenerator(scheme: BlockScheme, syllables: readonly SyllableTemplate[]): SeedResult {
    const roles: BlockRole[] = [...scheme.roles];
    const templates: BlockTemplate[] = [...scheme.templates];
    const skipped: SeedSkip[] = [];
    const rolesAdded: string[] = [];

    // --- 1–3: parse, expand, reject literals ---------------------------------
    const candidates: { text: string; letters: ClassLetter[] }[] = [];
    for (const syllable of syllables) {
        let items: TemplateItem[];
        try {
            items = parseTemplate(syllable.pattern);
        } catch (error) {
            skipped.push(parseSkip(syllable.pattern, error));
            continue;
        }
        const optionalCount = items.filter((item) => item.optional).length;
        if (optionalCount > MAX_OPTIONAL_ITEMS) {
            skipped.push({
                pattern: syllable.pattern,
                reason: `has ${optionalCount} optional parts (more than ${MAX_OPTIONAL_ITEMS}) — add its templates by hand`,
            });
            continue;
        }
        for (const variant of expandOptional(items)) {
            if (variant.length === 0) continue;
            const text = patternText(variant);
            const literal = variant.find((item) => item.kind === 'literal');
            if (literal) {
                skipped.push({
                    pattern: text,
                    reason: `uses the exact sounds ${itemText(literal)} — a role matches a class, not a sound list; build this one by hand`,
                });
                continue;
            }
            candidates.push({ text, letters: variant.map((item) => (item as Extract<TemplateItem, { kind: 'class' }>).letter) });
        }
    }

    // --- 4: roles ------------------------------------------------------------
    // A letter used twice in any one shape of this run gets numbered labels.
    const repeated = new Set<ClassLetter>();
    for (const candidate of candidates) {
        const seen = new Set<ClassLetter>();
        for (const letter of candidate.letters) {
            if (seen.has(letter)) repeated.add(letter);
            seen.add(letter);
        }
    }

    function roleFor(letter: ClassLetter, occurrence: number): BlockRole {
        const key = matcherKey({ kind: 'class', letter });
        const matching = roles.filter((role) => matcherKey(role.matcher) === key);
        if (matching[occurrence]) return matching[occurrence];
        // Create every missing occurrence up to this one, in order.
        let created: BlockRole | null = null;
        for (let k = matching.length; k <= occurrence; k += 1) {
            created = {
                id: nextRoleId(roles),
                label: repeated.has(letter) ? `${letter}${k + 1}` : letter,
                colour: roleColourAt(roles.length),
                matcher: { kind: 'class', letter },
            };
            roles.push(created);
            rolesAdded.push(created.label);
        }
        return created!;
    }

    // --- 5: pattern equality -------------------------------------------------
    const roleKey = (roleId: string) => {
        const role = roles.find((r) => r.id === roleId);
        return role ? matcherKey(role.matcher) : `?${roleId}`;
    };
    const signatures = new Set(templates.map((t) => t.pattern.map(roleKey).join(' ')));

    const fresh: BlockTemplate[] = [];
    const seenText = new Set<string>();
    for (const candidate of candidates) {
        if (seenText.has(candidate.text)) continue;
        seenText.add(candidate.text);

        const signature = candidate.letters.map((letter) => matcherKey({ kind: 'class', letter })).join(' ');
        if (signatures.has(signature)) {
            skipped.push({ pattern: candidate.text, reason: 'a template with this pattern already exists' });
            continue;
        }
        signatures.add(signature);

        const counts = new Map<ClassLetter, number>();
        const pattern = candidate.letters.map((letter) => {
            const occurrence = counts.get(letter) ?? 0;
            counts.set(letter, occurrence + 1);
            return roleFor(letter, occurrence).id;
        });
        // --- 6: even row -----------------------------------------------------
        const n = pattern.length;
        fresh.push({
            id: '', // assigned below, once the final order is known
            name: candidate.text,
            pattern,
            slots: pattern.map((roleId, k) => evenRowSlot(roleId, k, n)),
        });
    }

    // --- 7: order + ids ------------------------------------------------------
    fresh.sort((a, b) => b.pattern.length - a.pattern.length);
    const added: SeedResult['added'] = [];
    for (const template of fresh) {
        template.id = nextTemplateId(templates);
        templates.push(template);
        added.push({ id: template.id, name: template.name });
    }

    return { scheme: { ...scheme, roles, templates }, added, rolesAdded, skipped };
}

// =============================================================================
// ONE FLEXIBLE TEMPLATE
// =============================================================================

/** The name the flexible template gets ("Syllable 2"… when taken). */
export const FLEXIBLE_TEMPLATE_NAME = 'Syllable';

/**
 * A vowel item: the class letter `V`, or a literal group whose members are
 * ALL vowels (`[ai au]` — the generator's own rule, `templateHasVowelSlot`).
 * Every other item — any other class letter, and a literal group that can
 * come out a consonant (`[n ŋ]`, `[a n]`) — counts as a consonant: it is a
 * sound the block has to find a box for.
 */
function isVowelItem(item: TemplateItem): boolean {
    return templateHasVowelSlot([item]);
}

const C_MATCHER: RoleMatcher = { kind: 'class', letter: 'C' };
const V_MATCHER: RoleMatcher = { kind: 'class', letter: 'V' };

type Rect = Pick<BlockSlot, 'x' | 'y' | 'w' | 'h'>;

/** A slot in normalised (N1) form: `min` only when 0, `max` only when > 1, `arrange` absent (side by side). */
function flexibleSlot(roleId: string, rect: Rect, range: ConsonantRange | null): BlockSlot {
    const slot: BlockSlot = { roleId, groupId: null, ...rect };
    if (range) {
        if (range.min === 0) slot.min = 0;
        if (range.max > 1) slot.max = range.max as NonNullable<BlockSlot['max']>;
    }
    return slot;
}

/** `Syllable`, or `Syllable 2`, `Syllable 3`… — the first name no template has. */
function uniqueTemplateName(templates: readonly BlockTemplate[]): string {
    const taken = new Set(templates.map((t) => t.name.trim()));
    if (!taken.has(FLEXIBLE_TEMPLATE_NAME)) return FLEXIBLE_TEMPLATE_NAME;
    let n = 2;
    while (taken.has(`${FLEXIBLE_TEMPLATE_NAME} ${n}`)) n += 1;
    return `${FLEXIBLE_TEMPLATE_NAME} ${n}`;
}

/** `class:C/0-2` — one pattern position with its count, for the "already there" check. */
function countedKey(matcher: string, count: { min: number; max: number }): string {
    return `${matcher}/${count.min}-${count.max}`;
}

/**
 * Seed ONE flexible template from the word shapes: a `C1 V C2` block whose
 * consonant boxes take as many signs as the shapes need.
 *
 * Rules:
 *
 *  1. **Parse** every shape (`parseTemplate`); one that does not parse is
 *     skipped with the parser's message. A shape with no vowel item (see
 *     `isVowelItem`) is skipped too — there is nothing to build a block round.
 *  2. **Count** the consonant items BEFORE the first vowel item (the start)
 *     and AFTER the last one (the end), optional items included. Literal
 *     groups that can be consonants count, since they are sounds too.
 *     Consonants between two vowels (a two-syllable shape) belong to neither
 *     end and are not counted — splitting by syllable cuts such words before
 *     a template is looked for.
 *  3. **Ranges.** `max` = the most any shape has, capped at `MAX_SLOT_COUNT`
 *     (flagged `capped`); `min` = 0 when some shape CAN have none there (no
 *     items there, or all of them optional), else 1. A `max` of 0 means the
 *     template has no box at that end at all.
 *  4. **Roles.** The start box uses the scheme's FIRST `class C` role, the end
 *     box its SECOND (its first when there is no start box), the vowel its
 *     first `class V` role. A missing one is created — `C1`, `V`, `C2` — in
 *     pattern order, so the roles table reads in reading order.
 *  5. **Layout** (unit square, every slot on the default form, several signs
 *     in one box side by side):
 *     - start + end: start across the top `(0, 0, 1, .5)`, vowel bottom-left
 *       `(0, .5, .5, .5)`, end bottom-right `(.5, .5, .5, .5)` — the hangul
 *       reading order (top, then left to right);
 *     - start only: start across the top, vowel across the bottom
 *       `(0, .5, 1, .5)`;
 *     - end only: the mirror — vowel across the top `(0, 0, 1, .5)`, end
 *       across the bottom `(0, .5, 1, .5)` (every box keeps the full width, so
 *       nothing is left as a hole);
 *     - neither: the vowel fills the square.
 *  6. **Already there.** When a template with the same pattern (by role
 *     matcher) AND the same counts exists, nothing is added
 *     (`outcome: 'alreadyThere'`) — running it twice is harmless.
 *  7. **Order: FIRST.** Unlike the per-shape seed (which appends), the
 *     flexible template goes to the TOP of the list. By template order the
 *     first template that fits wins, so a per-shape `CV` above it would claim
 *     the start of every `CVC` / `CCVC` word before the flexible template got
 *     a chance; tried first, the one template that covers every shape draws
 *     them all in one consistent layout and any per-shape templates stay as
 *     fallbacks. By syllable, order only breaks ties.
 *
 * Pure; the input scheme is not mutated.
 */
export function seedFlexibleTemplate(scheme: BlockScheme, syllables: readonly SyllableTemplate[]): SeedResult {
    const skipped: SeedSkip[] = [];

    // --- 1–2: parse and count ------------------------------------------------
    let startMost = 0;
    let endMost = 0;
    let startCanBeEmpty = false;
    let endCanBeEmpty = false;
    let usable = 0;
    for (const syllable of syllables) {
        let items: TemplateItem[];
        try {
            items = parseTemplate(syllable.pattern);
        } catch (error) {
            skipped.push(parseSkip(syllable.pattern, error));
            continue;
        }
        const first = items.findIndex(isVowelItem);
        if (first === -1) {
            skipped.push({ pattern: syllable.pattern, reason: 'has no vowel, so there is nothing to build a block around' });
            continue;
        }
        let last = first;
        for (let i = items.length - 1; i > first; i -= 1) {
            if (isVowelItem(items[i])) {
                last = i;
                break;
            }
        }
        usable += 1;
        const startItems = items.slice(0, first);
        const endItems = items.slice(last + 1);
        startMost = Math.max(startMost, startItems.length);
        endMost = Math.max(endMost, endItems.length);
        if (startItems.every((item) => item.optional)) startCanBeEmpty = true;
        if (endItems.every((item) => item.optional)) endCanBeEmpty = true;
    }

    if (usable === 0) {
        return { scheme, added: [], rolesAdded: [], skipped, flexible: { outcome: 'none', start: null, end: null } };
    }

    // --- 3: ranges -------------------------------------------------------------
    const range = (most: number, canBeEmpty: boolean): ConsonantRange | null =>
        most === 0
            ? null
            : { min: canBeEmpty ? 0 : 1, max: Math.min(most, MAX_SLOT_COUNT), capped: most > MAX_SLOT_COUNT };
    const start = range(startMost, startCanBeEmpty);
    const end = range(endMost, endCanBeEmpty);

    // --- 6: an equivalent template already there? ------------------------------
    const matcherOf = new Map(scheme.roles.map((role) => [role.id, matcherKey(role.matcher)]));
    const wanted = [
        ...(start ? [countedKey(matcherKey(C_MATCHER), start)] : []),
        countedKey(matcherKey(V_MATCHER), { min: 1, max: 1 }),
        ...(end ? [countedKey(matcherKey(C_MATCHER), end)] : []),
    ].join(' ');
    const existing = scheme.templates.find((template) => {
        const slotOf = new Map(template.slots.map((slot) => [slot.roleId, slot]));
        const signature = template.pattern
            .map((roleId) => countedKey(matcherOf.get(roleId) ?? `?${roleId}`, slotCountOf(slotOf.get(roleId))))
            .join(' ');
        return signature === wanted;
    });
    if (existing) {
        return {
            scheme,
            added: [],
            rolesAdded: [],
            skipped,
            flexible: { outcome: 'alreadyThere', templateName: existing.name, start, end },
        };
    }

    // --- 4: roles ----------------------------------------------------------------
    const roles: BlockRole[] = [...scheme.roles];
    const rolesAdded: string[] = [];
    /** The `index`-th role with `matcher` (scheme order), created with `label` when missing. */
    function nthRole(matcher: RoleMatcher, index: number, label: string): BlockRole {
        const key = matcherKey(matcher);
        const found = roles.filter((role) => matcherKey(role.matcher) === key)[index];
        if (found) return found;
        const created: BlockRole = { id: nextRoleId(roles), label, colour: roleColourAt(roles.length), matcher };
        roles.push(created);
        rolesAdded.push(label);
        return created;
    }
    // In pattern order. With a start box, index 0 exists by the time the end
    // box asks for index 1, so `nthRole` never has to create a gap.
    const startRole = start ? nthRole(C_MATCHER, 0, 'C1') : null;
    const vowelRole = nthRole(V_MATCHER, 0, 'V');
    const endRole = end ? nthRole(C_MATCHER, start ? 1 : 0, start ? 'C2' : 'C1') : null;

    // --- 5: layout -----------------------------------------------------------------
    const TOP: Rect = { x: 0, y: 0, w: 1, h: 0.5 };
    const BOTTOM: Rect = { x: 0, y: 0.5, w: 1, h: 0.5 };
    let slots: BlockSlot[];
    if (startRole && endRole) {
        slots = [
            flexibleSlot(startRole.id, TOP, start),
            flexibleSlot(vowelRole.id, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, null),
            flexibleSlot(endRole.id, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, end),
        ];
    } else if (startRole) {
        slots = [flexibleSlot(startRole.id, TOP, start), flexibleSlot(vowelRole.id, BOTTOM, null)];
    } else if (endRole) {
        slots = [flexibleSlot(vowelRole.id, TOP, null), flexibleSlot(endRole.id, BOTTOM, end)];
    } else {
        slots = [flexibleSlot(vowelRole.id, { x: 0, y: 0, w: 1, h: 1 }, null)];
    }

    // --- 7: first in the list --------------------------------------------------------
    const template: BlockTemplate = {
        id: nextTemplateId(scheme.templates),
        name: uniqueTemplateName(scheme.templates),
        pattern: slots.map((slot) => slot.roleId),
        slots,
    };
    return {
        scheme: { ...scheme, roles, templates: [template, ...scheme.templates] },
        added: [{ id: template.id, name: template.name }],
        rolesAdded,
        skipped,
        flexible: { outcome: 'added', templateName: template.name, start, end },
    };
}

/** "up to 2 consonants at the start", "1 to 3 consonants at the end", "no consonants at the end". */
function describeRange(range: ConsonantRange | null, where: 'start' | 'end'): string {
    if (!range) return `no consonants at the ${where}`;
    const noun = range.max === 1 ? 'consonant' : 'consonants';
    if (range.min === 0) return `up to ${range.max} ${noun} at the ${where}`;
    if (range.max === 1) return `1 consonant at the ${where}`;
    return `1 to ${range.max} ${noun} at the ${where}`;
}

function describeFlexible(result: SeedResult, flexible: FlexibleSeedSummary): string {
    if (flexible.outcome === 'none') {
        return result.skipped.length > 0
            ? 'No template added — none of your word shapes could be turned into a block.'
            : 'Your word generator has no syllable shapes to add.';
    }
    const counts = `${describeRange(flexible.start, 'start')}, ${describeRange(flexible.end, 'end')}`;
    if (flexible.outcome === 'alreadyThere') {
        return `Nothing added — “${flexible.templateName}” already does this: ${counts}.`;
    }
    const roles = result.rolesAdded.length > 0 ? ` New roles: ${result.rolesAdded.join(', ')}.` : '';
    const capped =
        flexible.start?.capped || flexible.end?.capped
            ? ` A box holds at most ${MAX_SLOT_COUNT} signs, so a word with more consonants in a row than that is not drawn as one block.`
            : '';
    return `Added “${flexible.templateName}”: ${counts}.${roles}${capped} Save to keep it.`;
}

/** One sentence for the page: what the seed did (either seed). */
export function describeSeedResult(result: SeedResult): string {
    if (result.flexible) return describeFlexible(result, result.flexible);
    if (result.added.length === 0) {
        return result.skipped.length > 0
            ? 'No new templates — every word shape is already covered or cannot be turned into a block.'
            : 'Your word generator has no syllable shapes to add.';
    }
    const templates = `${result.added.length} template${result.added.length === 1 ? '' : 's'} (${result.added.map((t) => t.name).join(', ')})`;
    const roles = result.rolesAdded.length > 0 ? ` and ${result.rolesAdded.length} role${result.rolesAdded.length === 1 ? '' : 's'} (${result.rolesAdded.join(', ')})` : '';
    return `Added ${templates}${roles}. Save to keep them.`;
}
