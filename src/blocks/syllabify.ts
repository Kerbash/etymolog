/**
 * Block script — split one run of spelling entries into syllables (plan §3.1).
 *
 * Pure: classified units in, contiguous half-open ranges out. The segmenter has
 * already cut the word at explicit boundaries and structural entries, so the
 * input is ONE run; anything that still is not a plain consonant or vowel is
 * treated as opaque rather than rejected, because this runs in the render path
 * and a throw here would blank a word instead of merely spelling it unblocked.
 *
 * The split follows the maximal-onset principle (the same one the generator
 * uses in `splitMedialCluster`): the next syllable takes the longest tail of a
 * medial consonant cluster that is a legal onset. It differs from the generator
 * in one deliberate way — `sibilantClusters` IS applied medially here. The user
 * turns it on in the designer precisely to have `asta` read as `a·sta`, and a
 * script's block shape is a writing convention, not a word-initial phonotactic
 * licence.
 *
 * Marks and joins (CONLANG_EDGES_PLAN.md §3.2):
 *
 *  - A MARK unit (a tone / length / accent sign, `EntryClass` kind `mark`)
 *    has no sound of its own, so it is neither a vowel nor a consonant nor a
 *    wall: it RIDES WITH THE SIGN BEFORE IT. It is never a nucleus, no
 *    boundary is ever placed right before it, and it is left out of every
 *    onset sonority test (by role — an IPA mark's sound is `ː`, which the
 *    phonology cannot describe). An opaque unit's own range extends over the
 *    marks right after it (`LOGO MARK` is one range); a mark at the start of
 *    a stretch simply leads its first syllable.
 *  - `options.joins` lists unit positions no boundary may fall BEFORE (the
 *    segmenter derives them from `‿` entries, which never reach here). A
 *    join between two vowels glues them into one nucleus (`glueNuclei`); a
 *    join inside a consonant cluster forbids that one cut. A join only ever
 *    forbids a cut — it never makes an illegal syllable start legal — so when
 *    every cut between two nuclei is forbidden the two syllables MERGE.
 *    A join next to an opaque unit does nothing here: opaque units stay
 *    walls, and only a template can join them to a neighbour (segment.ts) —
 *    except that a join right after a SYLLABLE SIGN forbids that cut, so the
 *    consonant stays in the sign's coda (see below).
 *
 * Syllabic consonants and syllable-sign codas (CONLANG_EDGES_PLAN.md §4):
 *
 *  - A consonant can be a syllable's CORE (`unitRoles`): always when its
 *    sound carries an IPA syllabic mark (`r̩`, `SYLLABIC_MARKS`), and — for a
 *    consonant listed in `options.syllabicConsonants` — when neither
 *    neighbouring non-mark unit is a vowel, a marked syllabic consonant or a
 *    syllable sign (only the last of several such listed consonants in a
 *    row). So `prst` with `r` listed is one syllable, `krtek` is
 *    `kr · tek`, `mlha` (m, l listed) is `ml · ha`, and `karta` stays
 *    `kar · ta` (the `r` is next to `a`). Its CLASS does not change: it is still a consonant for template
 *    matching (pitfall P-B1), and it never glues into a diphthong.
 *  - A SYLLABLE SIGN (`EntryClass` kind `syllable` — not a logogram, unknown
 *    or mark) takes, as its coda, the consonants after it that cannot start
 *    the next syllable: `KA n t a` → `KAn · ta` (`nt` is no legal start,
 *    `t` is), `KA t a` → `KA · ta`, and with no vowel left in the stretch the
 *    whole consonant run is the sign's (`KA n` → `KAn`). A sign never takes
 *    an onset (`t KA` → `t · KA`).
 *
 * @module blocks/syllabify
 */

import { describePhoneme, safeNormalize, SYLLABIC_MARKS } from '../generator/phonology/features';
import { isValidOnset } from '../generator/phonology/sonority';
import type { EntryClass } from './types';

/** One entry, as syllabification sees it. */
export interface SyllableUnit {
    cls: EntryClass;
    /** The sound the entry is read as (`entrySound`), or `null` when it has none. */
    sound: string | null;
}

export interface SyllabifyOptions {
    /** Allow s + stop at the start of a syllable (sp, st, str). */
    sibilantClusters?: boolean;
    /**
     * Vowel sequences said as ONE vowel (`ai`, `iə`): side-by-side vowel
     * units whose sounds spell one of these are one nucleus (`glueNuclei`).
     */
    diphthongs?: readonly string[];
    /**
     * Unit positions `p` such that NO boundary may fall between unit `p - 1`
     * and unit `p` — indices into the `units` array handed to `syllabify`
     * (the segmenter's run-relative, join-stripped positions). Absent = none.
     */
    joins?: ReadonlySet<number>;
    /**
     * Consonants that may be a syllable's core (`r l m n`): a consonant unit
     * whose sound (trimmed, NFC) is listed is a nucleus when neither
     * neighbouring non-mark unit is a vowel (`unitRoles`). Exact match only —
     * `n` listed does not make `ŋ` a core. Absent = none.
     */
    syllabicConsonants?: readonly string[];
}

/** How syllabification treats a unit. */
export type UnitRole = 'nucleus' | 'consonant' | 'mark' | 'opaque';

const NO_JOINS: ReadonlySet<number> = new Set<number>();

/**
 * The role a unit of class `cls` plays in syllabification — THE one
 * definition (the segmenter's "opaque" test calls this too, pitfall P-A3):
 * a vowel phoneme is a nucleus, a consonant phoneme a consonant, a mark a
 * mark (it rides with the sign before it), and everything else — syllable
 * signs, logograms, unknown sounds, and boundaries / joins / structural
 * entries should one slip through — is opaque.
 */
export function unitRoleOf(cls: EntryClass): UnitRole {
    if (cls.kind === 'mark') return 'mark';
    if (cls.kind !== 'phoneme') return 'opaque';
    if (cls.letters.includes('V')) return 'nucleus';
    if (cls.letters.includes('C')) return 'consonant';
    // A phoneme class with neither letter cannot come out of `classOf`, but an
    // unrecognised shape must not be guessed into a syllable position.
    return 'opaque';
}

/**
 * Is this cluster a legal syllable start? A sound nobody could describe (`null`)
 * has no sonority, so it is only licensed alone — exactly how `isValidOnset`
 * already treats an undescribable string, made explicit for the `null` case
 * because there is no string to hand it.
 */
function onsetAccepts(sounds: readonly (string | null)[], options: SyllabifyOptions): boolean {
    if (sounds.length <= 1) return true;
    if (sounds.some((sound) => sound === null)) return false;
    return isValidOnset(sounds as string[], { allowSibilantOnset: !!options.sibilantClusters });
}

/**
 * Where the syllable boundary falls inside the cluster `units[from..to)` that
 * stands between two nuclei: the start of the longest tail that is a legal
 * onset. `to` itself is the last candidate (an empty onset — `a·i`).
 *
 * A candidate is skipped when it sits right before a mark (a mark rides with
 * the sign before it) or is listed in `options.joins`. The onset test sees
 * the tail's NON-mark sounds only (pitfall P-A4). `null` when every candidate
 * is skipped — the caller then merges the two syllables (pitfall P-A5).
 * Without marks or joins this is exactly the old search: the loop reaches
 * `to` only for an empty cluster, because one consonant is always accepted.
 */
function medialBoundary(
    units: readonly SyllableUnit[],
    roles: readonly UnitRole[],
    from: number,
    to: number,
    options: SyllabifyOptions,
): number | null {
    const joins = options.joins ?? NO_JOINS;
    for (let start = from; start <= to; start += 1) {
        if (joins.has(start)) continue;
        if (start < to && roles[start] === 'mark') continue;
        const tail: (string | null)[] = [];
        for (let k = start; k < to; k += 1) {
            if (roles[k] !== 'mark') tail.push(units[k].sound);
        }
        if (onsetAccepts(tail, options)) return start;
    }
    return null;
}

/** Most units one glued nucleus may span (a triphthong: `iəu`). */
const MAX_GLUED_UNITS = 3;

/** A sound as diphthongs are compared (pitfall P9): trimmed, NFC. */
function comparable(sound: string): string {
    return safeNormalize(sound.trim(), 'NFC');
}

/** The listed sounds, each `comparable`; empty and non-string entries ignored. */
function soundSet(list: readonly string[] | undefined): Set<string> {
    const out = new Set<string>();
    for (const entry of list ?? []) {
        if (typeof entry !== 'string') continue;
        const normal = comparable(entry);
        if (normal.length > 0) out.add(normal);
    }
    return out;
}

/** Is `sound` a phoneme written with an IPA syllabic mark (U+0329 below or U+030D above, `SYLLABIC_MARKS`)? */
function carriesSyllabicMark(sound: string | null): boolean {
    if (sound === null) return false;
    const normal = comparable(sound);
    // Cheap pre-check: only a string containing a mark can describe with it.
    if (!SYLLABIC_MARKS.some((mark) => normal.includes(mark))) return false;
    const modifiers = describePhoneme(normal)?.modifiers ?? [];
    return SYLLABIC_MARKS.some((mark) => modifiers.includes(mark));
}

/** The nearest non-mark unit from `i` in direction `step` (±1), or -1 at the run's end. */
function nonMarkBeside(roles: readonly UnitRole[], i: number, step: 1 | -1): number {
    let k = i + step;
    while (k >= 0 && k < roles.length && roles[k] === 'mark') k += step;
    return k >= 0 && k < roles.length ? k : -1;
}

/**
 * Does the nearest non-mark unit from `i` in direction `step` hold a vowel?
 * A pass-1 nucleus does, and so does a SYLLABLE SIGN (`ka` has its vowel
 * inside). A logogram, unknown sign or the run's end does not (pitfall P-B2).
 */
function vowelBeside(units: readonly SyllableUnit[], roles: readonly UnitRole[], i: number, step: 1 | -1): boolean {
    const k = nonMarkBeside(roles, i, step);
    return k >= 0 && (roles[k] === 'nucleus' || units[k].cls.kind === 'syllable');
}

/**
 * The role of every unit, with syllabic consonants promoted to `nucleus`
 * (CONLANG_EDGES_PLAN.md §4.2). Two passes:
 *
 *  1. `unitRoleOf` per unit, then every consonant whose sound carries an
 *     IPA syllabic mark (`SYLLABIC_MARKS`: r + U+0329, ŋ + U+030D) becomes a
 *     nucleus;
 *  2. a CANDIDATE is a consonant whose sound is listed in
 *     `options.syllabicConsonants` with no vowel beside it — neither
 *     neighbouring non-mark unit is a pass-1 nucleus or a syllable sign
 *     (marks are skipped; a logogram / unknown sign or the run's end is not a
 *     vowel — pitfall P-B2). Of each maximal run of CONSECUTIVE candidates
 *     (only marks between them), only the LAST is promoted: `mlha` with
 *     `m l` listed makes `l` the core (`ml · ha`), while `vlkr` with `l r`
 *     listed promotes both (`k` sits between them: `vl · kr`).
 *
 * Without a list and without a marked sound this is exactly `unitRoleOf`.
 * Exported so the segmenter can tell which consonant singles are cores.
 */
export function unitRoles(units: readonly SyllableUnit[], options: SyllabifyOptions = {}): UnitRole[] {
    const pass1 = units.map((unit) => {
        const role = unitRoleOf(unit.cls);
        return role === 'consonant' && carriesSyllabicMark(unit.sound) ? 'nucleus' : role;
    });
    const listed = soundSet(options.syllabicConsonants);
    if (listed.size === 0) return pass1;
    const candidate = pass1.map((role, i) => {
        if (role !== 'consonant') return false;
        const sound = units[i].sound;
        if (sound === null || !listed.has(comparable(sound))) return false;
        return !vowelBeside(units, pass1, i, -1) && !vowelBeside(units, pass1, i, 1);
    });
    return pass1.map((role, i) => {
        if (!candidate[i]) return role;
        // Only the last of a run of consecutive candidates carries the syllable.
        const next = nonMarkBeside(pass1, i, 1);
        return next >= 0 && candidate[next] ? role : 'nucleus';
    });
}

/**
 * Which units form one nucleus: a GROUP ID per unit (0-based, increasing,
 * contiguous — equal ids are adjacent). Every unit is its own group, except
 * a run of 2–3 consecutive VOWEL units whose sounds (each trimmed + NFC)
 * concatenate to a listed diphthong, or that are joined by `joins` (a `‿`
 * between them), which share one id.
 *
 * Greedy, left to right, longest first: at each unit a 3-unit match is tried
 * before a 2-unit one, and a unit joins at most one group. So `a a i` with
 * `ai` listed is `a · ai` (the first `a` finds no partner and stays alone),
 * and `a i a` is `ai · a`. After the listed match (or none) is chosen, the
 * group is extended while the NEXT unit is joined to it and is a nucleus,
 * up to 3 units: `a‿i` (joins `{1}`) is one group with nothing listed, and
 * `a i‿u` with `ai` listed is one group of three. Only vowels glue — never a
 * consonant (not even a syllabic one, `r̩` or a listed `r`), never a mark,
 * never an opaque unit, never a unit with no sound
 * — so a group can never reach across anything that is not a vowel (a mark
 * between two vowels BLOCKS the glue: `a MARK i` stays two groups). A join
 * between a nucleus and a consonant is `syllabify`'s business, not this
 * function's. Empty `diphthongs` and no joins → all singletons. Never throws.
 */
export function glueNuclei(
    units: readonly SyllableUnit[],
    diphthongs: readonly string[],
    joins: ReadonlySet<number> = NO_JOINS,
): number[] {
    const listed = soundSet(diphthongs);
    // The sound of each unit that may glue; `null` for everything else. The
    // BASE role (`unitRoleOf`) is used, never `unitRoles`: only a VOWEL glues
    // — a syllabic consonant is a nucleus for syllabification but never part
    // of a diphthong (CONLANG_EDGES_PLAN.md §4.2).
    const sounds = units.map((unit) => {
        if (unitRoleOf(unit.cls) !== 'nucleus' || unit.sound === null) return null;
        const normal = comparable(unit.sound);
        return normal.length > 0 ? normal : null;
    });

    const groups: number[] = [];
    let id = 0;
    let i = 0;
    while (i < units.length) {
        let size = 1;
        if (listed.size > 0 && sounds[i] !== null) {
            for (let n = MAX_GLUED_UNITS; n >= 2; n -= 1) {
                const part = sounds.slice(i, i + n);
                if (part.length === n && part.every((sound) => sound !== null) && listed.has(part.join(''))) {
                    size = n;
                    break;
                }
            }
        }
        if (sounds[i] !== null) {
            while (size < MAX_GLUED_UNITS && joins.has(i + size) && i + size < units.length && sounds[i + size] !== null) {
                size += 1;
            }
        }
        for (let k = 0; k < size; k += 1) groups.push(id);
        id += 1;
        i += size;
    }
    return groups;
}

/**
 * Syllabify one stretch `[start, end)` that contains no opaque unit, appending
 * its ranges to `out`. A glued group (`groups`) is ONE nucleus: the medial
 * cluster starts after its last unit, so no boundary falls inside it. Marks
 * are never nuclei; a mark between two nuclei belongs to the cluster, where
 * `medialBoundary` never cuts right before it. When `medialBoundary` finds no
 * allowed cut, the two syllables merge (no range is pushed and the current
 * syllable simply goes on).
 */
function syllabifyStretch(
    units: readonly SyllableUnit[],
    roles: readonly UnitRole[],
    groups: readonly number[],
    start: number,
    end: number,
    options: SyllabifyOptions,
    out: Array<[number, number]>,
): void {
    if (start >= end) return;
    /** Each nucleus as `[first unit, one past its last unit)`. */
    const nuclei: Array<[number, number]> = [];
    for (let i = start; i < end; i += 1) {
        if (roles[i] !== 'nucleus') continue;
        let last = i;
        while (last + 1 < end && groups[last + 1] === groups[i]) last += 1;
        nuclei.push([i, last + 1]);
        i = last;
    }
    // Consonants with no vowel to lean on stay together: splitting `st` into
    // two "syllables" would invent blocks with nothing at their core.
    if (nuclei.length === 0) {
        out.push([start, end]);
        return;
    }

    // Leading consonants are the first syllable's onset (the range simply
    // starts at `start`); trailing ones are the last syllable's coda.
    let syllableStart = start;
    for (let n = 0; n < nuclei.length - 1; n += 1) {
        const boundary = medialBoundary(units, roles, nuclei[n][1], nuclei[n + 1][0], options);
        // Every cut here is forbidden (joined, or before a mark): merge.
        if (boundary === null) continue;
        out.push([syllableStart, boundary]);
        syllableStart = boundary;
    }
    out.push([syllableStart, end]);
}

/**
 * Where a syllable sign's range ends when the stretch after it starts at
 * `from` (CONLANG_EDGES_PLAN.md §4.1): the sign takes as its coda the
 * consonants (and marks) of that stretch's LEAD — the units before its first
 * nucleus — that cannot start the next syllable.
 *
 *  - No nucleus in the stretch: the whole stretch is the sign's coda
 *    (`KA n` → `KAn`, `KA s t` → `KAst`) — there is no syllable to start.
 *  - Otherwise the first position `b` of the lead (from its start to one past
 *    its end) whose tail `[b, leadEnd)` is a legal onset — judged on the
 *    tail's non-mark sounds (P-A4), skipping a position right before a mark
 *    or listed in `options.joins`, exactly as `medialBoundary` does. A
 *    stretch that starts with a nucleus has an empty lead: nothing grows.
 *    When every position is skipped (joins everywhere), nothing grows.
 *
 * Returns the new range end (`from` when nothing grows). Only units of
 * `[from, next opaque unit)` are ever taken, so the growth never reaches
 * across another sign (a sign followed by a sign gets nothing).
 */
function syllableSignCodaEnd(
    units: readonly SyllableUnit[],
    roles: readonly UnitRole[],
    from: number,
    options: SyllabifyOptions,
): number {
    let stretchEnd = from;
    while (stretchEnd < units.length && roles[stretchEnd] !== 'opaque') stretchEnd += 1;
    let leadEnd = from;
    while (leadEnd < stretchEnd && roles[leadEnd] !== 'nucleus') leadEnd += 1;
    if (leadEnd === stretchEnd) return stretchEnd;

    const joins = options.joins ?? NO_JOINS;
    for (let b = from; b <= leadEnd; b += 1) {
        if (joins.has(b)) continue;
        if (b < leadEnd && roles[b] === 'mark') continue;
        const tail: (string | null)[] = [];
        for (let k = b; k < leadEnd; k += 1) {
            if (roles[k] !== 'mark') tail.push(units[k].sound);
        }
        if (onsetAccepts(tail, options)) return b;
    }
    return from;
}

/**
 * Split one run into syllables.
 *
 * Returns half-open `[start, end)` ranges covering `0..units.length`,
 * contiguous and in order (empty input → `[]`). Opaque units (syllable signs,
 * logograms, unknown sounds — and boundaries/structural entries, should one
 * slip through) each get a range of their own — extended over the marks right
 * after them — and act as walls: no consonant attaches across them, except
 * that a SYLLABLE SIGN's range also takes the consonants after it that cannot
 * start the next syllable (`KA n t a` → `KAn · ta`, `KA n` → `KAn`;
 * `syllableSignCodaEnd`). Marks ride with the sign before them, so
 * `k a MARK n` is one syllable and `k a MARK t a` is `ka MARK · ta`. Two
 * vowels side by side are two syllables (`a·i`) unless `options.diphthongs`
 * lists their sounds together or `options.joins` joins them (`glueNuclei`),
 * which makes them one; a join inside a consonant cluster forbids that cut
 * (`a t‿a` → `a · ta`, `a‿t a` → `at · a`, `a‿t‿a` → one syllable). A
 * syllabic consonant (`r̩`, or one listed in `options.syllabicConsonants`
 * with no vowel beside it — `unitRoles`) is a syllable's core like a vowel:
 * `prst` → one syllable, `krtek` → `kr · tek`. Never throws.
 */
export function syllabify(
    units: readonly SyllableUnit[],
    options: SyllabifyOptions = {},
): Array<[number, number]> {
    const roles = unitRoles(units, options);
    const groups = glueNuclei(units, options.diphthongs ?? [], options.joins ?? NO_JOINS);
    const out: Array<[number, number]> = [];
    let stretchStart = 0;
    for (let i = 0; i < units.length; i += 1) {
        if (roles[i] !== 'opaque') continue;
        syllabifyStretch(units, roles, groups, stretchStart, i, options, out);
        // The opaque unit's range takes the marks riding with it…
        let rangeEnd = i + 1;
        while (rangeEnd < units.length && roles[rangeEnd] === 'mark') rangeEnd += 1;
        // …and a syllable sign also its coda (P-B3: syllable signs only).
        if (units[i].cls.kind === 'syllable') rangeEnd = syllableSignCodaEnd(units, roles, rangeEnd, options);
        out.push([i, rangeEnd]);
        stretchStart = rangeEnd;
        i = rangeEnd - 1;
    }
    syllabifyStretch(units, roles, groups, stretchStart, units.length, options, out);
    return out;
}
