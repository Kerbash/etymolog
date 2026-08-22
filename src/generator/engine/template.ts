/**
 * @fileoverview Syllable templates — the little language the shape editor is written in.
 *
 * A template is what a user types to say "my syllables look like this":
 *
 *   CV          a consonant and a vowel
 *   (C)V(N)     an optional consonant, a vowel, an optional nasal
 *   CV[n ŋ]     a consonant, a vowel, and a coda drawn from exactly n and ŋ
 *
 * Three kinds of thing appear in one:
 *
 *   - a CLASS LETTER (`C V P F S N L G R O`) — a slot filled from a class
 *     (`src/generator/phonology/classes.ts` owns the membership);
 *   - a LITERAL GROUP `[…]` — a slot filled from a named handful of sounds,
 *     which is how a profile says "codas are n and ŋ, not every nasal" without
 *     the app needing a per-profile class editor;
 *   - either of those wrapped in `( … )`, which makes the slot optional.
 *
 * Whitespace between items is ignored, so `C V (N)` and `CV(N)` are the same
 * template.
 *
 * This module lives under `engine/` because the generator is its main consumer,
 * but the PROFILE VALIDATOR imports it too: a template that cannot be parsed is
 * a settings error, and there must be exactly one answer to "is this pattern
 * legal?" for the validator and the generator alike.
 *
 * @module generator/engine/template
 */

import { splitPhonemeString } from '../phonology/tokenize';
import { isClassLetter, CLASS_LETTERS } from '../phonology/classes';
import type { ClassLetter } from '../phonology/classes';

/**
 * The chance an optional item is kept.
 *
 * v1 supports the bare `( )` only. A weighted form (`(C)70`) was considered and
 * left out: it doubles the grammar for a knob that the template WEIGHT already
 * approximates (write `CV 7` and `CCV 3` instead of `(C)CV`), and a syntax that
 * ships cannot be taken back.
 */
export const OPTIONAL_CHANCE = 0.5;

/** One slot of a template. `optional` is set by a `( … )` wrapper. */
export type TemplateItem =
    | { kind: 'class'; letter: ClassLetter; optional: boolean }
    | { kind: 'literal'; members: string[]; optional: boolean };

/**
 * A pattern the parser refused, with the offset it gave up at.
 *
 * `position` is a code-unit index into the pattern EXACTLY as it was passed in,
 * so an editor can put a caret there without re-deriving anything. It is the
 * index of the offending character, except for the two "unclosed" errors, where
 * it points at the opening bracket — that is the character the user has to fix.
 */
export class TemplateSyntaxError extends Error {
    readonly position: number;

    constructor(message: string, position: number) {
        super(message);
        this.name = 'TemplateSyntaxError';
        this.position = position;
        // `Error` subclassing under a downlevel target loses the prototype;
        // without this an `instanceof TemplateSyntaxError` in a caller is false.
        Object.setPrototypeOf(this, TemplateSyntaxError.prototype);
    }
}

/** Human list of the class letters, for error messages. */
const CLASS_LIST = CLASS_LETTERS.join(' ');

/**
 * The members of a literal group.
 *
 * Two spellings, and the rule picking between them is mechanical rather than
 * clever: **if the group contains whitespace, it is split on whitespace;
 * otherwise it is split into phonemes.**
 *
 * That matters because phoneme splitting is conservative — `tʃ` is two sounds
 * to the tokenizer, not the affricate (see the note in `tokenize.ts`) — so
 * `[tʃk]` is `t`, `ʃ`, `k` while `[tʃ k]` is `tʃ`, `k`. A tie bar binds without
 * help, so `[t͡ʃk]` is `t͡ʃ`, `k` either way. The escape hatch is always the
 * same one: put spaces in when a member is more than one symbol.
 */
function splitLiteralMembers(raw: string): string[] {
    const parts = /\s/.test(raw)
        ? raw.split(/\s+/)
        : splitPhonemeString(raw).map((token) => token.text);

    const members: string[] = [];
    for (const part of parts) {
        if (part.length === 0) continue;
        // `[nn]` is a typo, not a weighting device — the engine picks uniformly
        // from the members, so a duplicate would silently double a sound.
        if (!members.includes(part)) members.push(part);
    }
    return members;
}

/**
 * Parse a pattern into slots.
 *
 * @throws {TemplateSyntaxError} on any malformed pattern — including an empty
 * one, which is a mistake rather than a template that matches nothing.
 */
export function parseTemplate(pattern: string): TemplateItem[] {
    if (typeof pattern !== 'string') {
        throw new TemplateSyntaxError('a template must be text', 0);
    }

    // Walk code points, but report code-unit offsets: `t͡ʃ` is three code points
    // and `𝔞` is one code point of two units, and a caret has to land in the
    // string the caller holds.
    const points = Array.from(pattern);
    const offsets: number[] = [];
    let cursor = 0;
    for (const point of points) {
        offsets.push(cursor);
        cursor += point.length;
    }

    const items: TemplateItem[] = [];
    /** Offset of the `(` currently open, or `null` outside a group. */
    let openGroupAt: number | null = null;
    /** How many items the open group has taken so far. */
    let groupItems = 0;

    const push = (item: TemplateItem, at: number): void => {
        if (openGroupAt !== null) {
            if (groupItems >= 1) {
                throw new TemplateSyntaxError(
                    'an optional group wraps one item — write "(C)(C)" rather than "(CC)"',
                    at,
                );
            }
            groupItems += 1;
        }
        items.push(item);
    };

    let i = 0;
    while (i < points.length) {
        const ch = points[i];
        const at = offsets[i];

        if (/\s/.test(ch)) {
            i += 1;
            continue;
        }

        if (ch === '(') {
            if (openGroupAt !== null) {
                throw new TemplateSyntaxError('optional groups cannot be nested', at);
            }
            openGroupAt = at;
            groupItems = 0;
            i += 1;
            continue;
        }

        if (ch === ')') {
            if (openGroupAt === null) {
                throw new TemplateSyntaxError('unexpected ")" — no optional group is open', at);
            }
            if (groupItems === 0) {
                throw new TemplateSyntaxError('an optional group cannot be empty', openGroupAt);
            }
            openGroupAt = null;
            i += 1;
            continue;
        }

        if (ch === ']') {
            throw new TemplateSyntaxError('unexpected "]" — no literal group is open', at);
        }

        if (ch === '[') {
            let scan = i + 1;
            let raw = '';
            while (scan < points.length && points[scan] !== ']') {
                if (points[scan] === '[') {
                    // Almost always a missing `]` on the previous group; saying
                    // so where the second `[` is beats a confusing member list.
                    throw new TemplateSyntaxError('unexpected "[" inside a literal group', offsets[scan]);
                }
                raw += points[scan];
                scan += 1;
            }
            if (scan >= points.length) {
                throw new TemplateSyntaxError('unclosed literal group — add a closing "]"', at);
            }
            const members = splitLiteralMembers(raw);
            if (members.length === 0) {
                throw new TemplateSyntaxError('a literal group cannot be empty', at);
            }
            push({ kind: 'literal', members, optional: openGroupAt !== null }, at);
            i = scan + 1;
            continue;
        }

        if (isClassLetter(ch)) {
            push({ kind: 'class', letter: ch, optional: openGroupAt !== null }, at);
            i += 1;
            continue;
        }

        throw new TemplateSyntaxError(
            `unexpected "${ch}" — use a class letter (${CLASS_LIST}), a literal group like [n ŋ], or ( ) around an optional item`,
            at,
        );
    }

    if (openGroupAt !== null) {
        throw new TemplateSyntaxError('unclosed optional group — add a closing ")"', openGroupAt);
    }
    if (items.length === 0) {
        throw new TemplateSyntaxError('a template cannot be empty', 0);
    }

    return items;
}

/** The result of checking a pattern without wanting the parse. */
export type TemplateCheck = { ok: true } | { ok: false; message: string; position: number };

/**
 * Is this pattern legal? The non-throwing face of {@link parseTemplate}, for the
 * settings validator and for inline validation in the shape editor.
 *
 * An unexpected error is not swallowed: only `TemplateSyntaxError` is turned
 * into a `false`, so a bug in the parser surfaces as a bug rather than as
 * "invalid template".
 */
export function isValidTemplatePattern(pattern: string): TemplateCheck {
    try {
        parseTemplate(pattern);
        return { ok: true };
    } catch (error) {
        if (error instanceof TemplateSyntaxError) {
            return { ok: false, message: error.message, position: error.position };
        }
        throw error;
    }
}

/**
 * Is every sound in this literal-group member a vowel?
 *
 * A member is not necessarily one phoneme: a diphthong (`ai`, `au`) is a legal
 * member and is a vowel slot every bit as much as `a` is — the plan's harmony
 * rule even names them ("a diphthong literal like `ai` counts by its first
 * vowel"). `describePhoneme` alone cannot say so, because it classifies ONE
 * sound and returns null for a sequence, so the member is tokenised first and
 * every token has to come out a vowel.
 *
 * An unclassifiable token makes the member fall through to `false`: `[¤ §]`
 * cannot be relied on to produce a vowel.
 */
function memberIsAllVowels(member: string): boolean {
    const tokens = splitPhonemeString(member);
    return tokens.length > 0 && tokens.every((token) => token.features?.kind === 'vowel');
}

/**
 * Can this template put a vowel in a word?
 *
 * True for a `V` slot, and for a literal group whose members are ALL vowels
 * (`[a e i]` and `[ai au]` are vowel slots; `[a n]` is not — it can come out a
 * consonant, so a profile whose only "vowel" is that group could generate
 * `knk`).
 *
 * Optional slots count: the question is what the template CAN produce, and the
 * validator uses it to catch a profile that could never produce a vowel at all.
 */
export function templateHasVowelSlot(items: readonly TemplateItem[]): boolean {
    return items.some((item) => {
        if (item.kind === 'class') return item.letter === 'V';
        return item.members.length > 0 && item.members.every(memberIsAllVowels);
    });
}

/**
 * Resolve the optional slots of a parsed template.
 *
 * Every optional item is kept with probability {@link OPTIONAL_CHANCE},
 * independently. The returned items are all `optional: false` — "expanded"
 * means there is no optionality left to resolve, so a caller cannot roll the
 * dice twice on the same slot.
 *
 * The rng is passed in rather than reached for: determinism for a seed is the
 * whole contract of the generator, and this is the one place a template's shape
 * varies between two words of the same batch.
 *
 * Generic over anything that HAS an `optional` flag, not just `TemplateItem`.
 * The engine binds each slot to the pool of sounds that can fill it before a
 * batch starts (a class's members, a literal group's surviving members) and
 * carries that pool on the slot; expansion has to preserve it, and a signature
 * fixed to `TemplateItem` would have forced either a second copy of these eight
 * lines or a cast at every call. Callers that pass `TemplateItem[]` still get
 * `TemplateItem[]` back.
 */
export function expandTemplate<T extends { optional: boolean }>(
    items: readonly T[],
    rng: () => number,
): T[] {
    const out: T[] = [];
    for (const item of items) {
        if (item.optional) {
            if (!(rng() < OPTIONAL_CHANCE)) continue;
            out.push({ ...item, optional: false });
            continue;
        }
        out.push(item);
    }
    return out;
}
