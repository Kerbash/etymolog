/**
 * Block script — segment a spelling into blocks (BLOCK_SCRIPT_PLAN.md §3.2,
 * SYLLABLE_BLOCKS_PLAN.md §3.3, CONLANG_EDGES_PLAN.md §3.3).
 *
 * Every entry is classified first. JOIN entries (`‿`) are then stripped out
 * (the COMPACTION): the pipeline below runs over the remaining entries only,
 * remembering at which compact positions a join sat (`joinBefore`), and every
 * segment's `entryIndices` is mapped back to the ORIGINAL indices at the end.
 * A join therefore never becomes a segment and draws nothing, like `.`; a
 * join at the very start or end of the spelling (or right after a boundary /
 * structural entry) means nothing and is dropped. With no join entry the
 * compaction is the identity and the output is exactly what it was before
 * joins existed (pitfall P-A2). Only syllable mode reads `joinBefore`;
 * template order simply never sees the joins.
 *
 * The (compact) spelling is then cut into RUNS: a boundary — `.` or a stress
 * mark `ˈ ˌ` — closes the current run and produces no segment; a structural
 * entry (separator / line break / punctuation) closes it and passes through
 * as its own segment. Neither can ever sit inside a block, because no role
 * accepts them. Each run is then segmented by the scheme's split mode:
 *
 *  - TEMPLATE order (`split` absent or `'templates'` — the original
 *    behaviour, kept byte-identical): greedy, left to right. At each position
 *    the templates are tried IN SCHEME ORDER and the first whose pattern
 *    matches a prefix wins, taking the longest prefix its slot counts allow
 *    (`matchTemplate`). "Put longer patterns first" is the designer's advice,
 *    not the engine's job.
 *  - SYLLABLES (`split.mode === 'syllables'`): the run is cut into syllables
 *    (`syllabify`), and each syllable becomes the ONE template that matches it
 *    whole with the fewest empty optional slots (ties → scheme order). A
 *    syllable no template covers falls back to template order inside it, so
 *    it still gets whatever blocks fit rather than none.
 *
 *    Vowels listed together in `split.diphthongs` are ONE vowel here
 *    (DIPHTHONG_BLOCKS_PLAN.md §3.5): `glueNuclei` groups them, `syllabify`
 *    never cuts between them, and every template match takes the group whole
 *    (it counts as one sign against a slot's count). A group no template
 *    takes falls back to singles like any other entry.
 *
 *    An OPAQUE unit (syllable sign, logogram, unknown) is a syllable of its
 *    own after `syllabify`, which would make a Mayan-style `LOGO C V` template
 *    (logogram + phonetic complement) unreachable. So before choosing
 *    templates, each lone opaque unit may JOIN a neighbour: the following
 *    syllable first, then the previous one (unless that one is already a
 *    join) — but only when some template covers the joined range exactly.
 *    There is no setting for this: a template that puts an opaque sign next
 *    to sounds IS the author's request, and a scheme without one segments
 *    exactly as before. (An opaque unit followed by its marks — `LOGO MARK`
 *    — still counts as lone: the marks ride with it.)
 *
 *    MARK entries (tone / length / accent signs, typed IPA marks) ride with
 *    the sign before them (`syllabify`): `k a MARK n` is ONE syllable, which
 *    a `C V MARK C2` template takes whole. A scheme with no role that accepts
 *    a mark degrades exactly like any other untaken entry: the syllable falls
 *    back to template order inside it (`[ka] MARK n`). A `‿` between two
 *    signs forbids a syllable break there (`a‿i` is one vowel; `at‿a` keeps
 *    `t` with the second syllable), mapped onto the run's own positions
 *    before `syllabify` / `glueNuclei` see it (pitfall P-A6).
 *
 *    A SYLLABLE SIGN takes the consonants after it that cannot start the
 *    next syllable (`syllabify`, CONLANG_EDGES_PLAN.md §4.1): `KA n t a` is
 *    `KAn · ta`, which a `SYL C` template draws. That grown range is no
 *    longer a lone opaque unit, so it never joins a neighbour again. And a
 *    consonant listed in `split.syllabicConsonants` (or written `r̩`) is a
 *    syllable's core when no vowel is beside it — `prst` is ONE syllable —
 *    but it stays class `C` (pitfall P-B1): a `V` box never takes it, so the
 *    syllable needs a template whose core role accepts a consonant (`class
 *    R`, `any`…), or it falls back to template order like any other
 *    uncovered syllable. Such a core left in no block is a plain single —
 *    never flagged `consonant` (it carries its own syllable, so the
 *    vowel-killer mark would be wrong).
 *
 * In both modes an entry left in no block is a `single`; a single that is a
 * plain consonant carries `consonant: true` so the renderer can give it the
 * scheme's vowel-killer mark.
 *
 * Does NOT look at `scheme.enabled` — whether to segment at all is the
 * caller's decision (normalization skips the engine when the scheme is off).
 *
 * @module blocks/segment
 */

import { classifyEntry, entrySound } from './classify';
import { matchTemplate, templateHasCounts } from './match';
import type { TemplateMatch } from './match';
import { glueNuclei, syllabify, unitRoleOf, unitRoles } from './syllabify';
import type { SyllabifyOptions, SyllableUnit } from './syllabify';
import type {
    BlockGraphemeIndex,
    BlockRole,
    BlockScheme,
    BlockSegment,
    BlockSpellingEntry,
    BlockTemplate,
    EntryClass,
    Segment,
    SingleSegment,
} from './types';

/** Everything one segmentation pass reads, computed once per spelling. */
interface SegmentContext {
    scheme: BlockScheme;
    classes: readonly EntryClass[];
    roles: ReadonlyMap<string, BlockRole>;
    /**
     * Syllable mode only: a group id per entry of the WHOLE spelling
     * (`glueNuclei` per run, offset so ids never repeat across runs; every
     * other entry its own group) — passed to every `matchTemplate` call so a
     * diphthong is taken whole. Absent in template mode (P1).
     */
    groups?: number[];
    /**
     * Compact positions `k` with at least one `‿` entry stripped between
     * entries `k - 1` and `k` (see the module JSDoc). Empty without joins.
     */
    joinBefore: ReadonlySet<number>;
    /**
     * Syllable mode only: indices of consonant-class entries that are a
     * syllable's CORE (`unitRoles` — a listed syllabic consonant with no vowel
     * beside it, or one written `r̩`). A core left in no block is drawn as a
     * plain single, never with the vowel-killer mark. Empty in template mode.
     */
    cores: Set<number>;
}

/** A plain consonant: the only kind of entry the vowel-killer mark applies to. */
function isConsonant(cls: EntryClass): boolean {
    return cls.kind === 'phoneme' && cls.letters.includes('C') && !cls.letters.includes('V');
}

function singleSegment(i: number, cls: EntryClass, cores: ReadonlySet<number>): SingleSegment {
    // The key is set ONLY on consonants so every other single keeps the exact
    // shape it had before lone-consonant marks existed — and never on a
    // syllabic consonant, which carries its own syllable (it is not "dead").
    return isConsonant(cls) && !cores.has(i) ? { kind: 'single', entryIndices: [i], consonant: true } : { kind: 'single', entryIndices: [i] };
}

function blockSegment(template: BlockTemplate, match: TemplateMatch, start: number): BlockSegment {
    const segment: BlockSegment = {
        kind: 'block',
        templateId: template.id,
        entryIndices: Array.from({ length: match.length }, (_, k) => start + k),
    };
    // A template with counts reports which role each entry filled; so does
    // any match that took a glued group (a diphthong — more entries than
    // pattern roles, which `composeBlock` cannot place without them). A
    // count-less match of one entry per role keeps the original segment
    // shape (no `roleIds` — P1), since its entries fill the pattern
    // one-to-one anyway.
    if (templateHasCounts(template) || match.length !== template.pattern.length) segment.roleIds = match.roleIds;
    return segment;
}

/**
 * Template order over `[start, end)`: first template in scheme order with a
 * prefix match wins, else a single. A pattern naming a role that does not
 * exist (only possible with an unvalidated scheme) never matches, so it is
 * skipped rather than half-matched.
 */
function segmentGreedy(ctx: SegmentContext, start: number, end: number, out: Segment[]): void {
    let i = start;
    while (i < end) {
        let found: { template: BlockTemplate; match: TemplateMatch } | null = null;
        for (const template of ctx.scheme.templates) {
            const match = matchTemplate(template, ctx.roles, ctx.classes, i, end, 'prefix', ctx.groups);
            if (match) {
                found = { template, match };
                break;
            }
        }
        if (found) {
            out.push(blockSegment(found.template, found.match, i));
            i += found.match.length;
        } else {
            out.push(singleSegment(i, ctx.classes[i], ctx.cores));
            i += 1;
        }
    }
}

/**
 * A unit `syllabify` treats as a wall — its own `unitRoleOf`, never a second
 * copy of the test (pitfall P-A3). A mark is NOT opaque.
 */
function isOpaque(cls: EntryClass): boolean {
    return unitRoleOf(cls) === 'opaque';
}

/** A syllable range that is one opaque unit plus only the marks riding with it. */
function isLoneOpaque(classes: readonly EntryClass[], start: number, end: number): boolean {
    if (!isOpaque(classes[start])) return false;
    for (let k = start + 1; k < end; k += 1) {
        if (unitRoleOf(classes[k]) !== 'mark') return false;
    }
    return true;
}

/** Does any template cover `[start, end)` exactly? */
function anyTemplateCovers(ctx: SegmentContext, start: number, end: number): boolean {
    return ctx.scheme.templates.some((template) => matchTemplate(template, ctx.roles, ctx.classes, start, end, 'exact', ctx.groups) !== null);
}

/** A syllable range in absolute entry indices; `joined` = an opaque unit was merged into it. */
interface SyllableRange {
    start: number;
    end: number;
    joined: boolean;
}

/**
 * Let each lone opaque unit join a neighbouring syllable when a template is
 * drawn for the joined shape (module JSDoc). Following first, because a
 * logogram's phonetic complement conventionally comes after it; previous only
 * when that syllable has not already absorbed a sign, so one join never
 * chains into a block spanning three syllables' worth of signs.
 */
function joinOpaqueUnits(ctx: SegmentContext, ranges: readonly SyllableRange[]): SyllableRange[] {
    const out: SyllableRange[] = [];
    for (let r = 0; r < ranges.length; r += 1) {
        const range = ranges[r];
        const lone = isLoneOpaque(ctx.classes, range.start, range.end);
        if (lone) {
            const next = ranges[r + 1];
            if (next && anyTemplateCovers(ctx, range.start, next.end)) {
                out.push({ start: range.start, end: next.end, joined: true });
                r += 1; // `next` is consumed by the join.
                continue;
            }
            const prev = out[out.length - 1];
            if (prev && !prev.joined && anyTemplateCovers(ctx, prev.start, range.end)) {
                out[out.length - 1] = { start: prev.start, end: range.end, joined: true };
                continue;
            }
        }
        out.push(range);
    }
    return out;
}

/**
 * Syllable mode over one run `[start, end)`: one block per syllable where a
 * template covers the syllable exactly — the one leaving the fewest optional
 * slots empty, because that is the template the author drew for this shape
 * (`CV` over `C1 V C2?` for `ta`); the strict `<` keeps the earliest template
 * on a tie. Lone opaque units have already joined a neighbour where a
 * template asks for it (`joinOpaqueUnits`), so a joined range is chosen for
 * like any other syllable. A syllable no template covers is segmented in template order
 * inside its own range, never across into its neighbours.
 */
function segmentSyllables(
    ctx: SegmentContext,
    entries: readonly BlockSpellingEntry[],
    index: BlockGraphemeIndex,
    start: number,
    end: number,
    out: Segment[],
): void {
    const units: SyllableUnit[] = [];
    for (let i = start; i < end; i += 1) {
        units.push({ cls: ctx.classes[i], sound: entrySound(entries[i], index) });
    }
    const diphthongs = ctx.scheme.split?.diphthongs ?? [];
    // This run's joins, relative to the run (P-A6). A join at exactly `start`
    // (right after a boundary or structural entry) separates nothing and is
    // dropped.
    const joins = new Set<number>();
    for (let k = start + 1; k < end; k += 1) {
        if (ctx.joinBefore.has(k)) joins.add(k - start);
    }
    // This run's nucleus groups (diphthongs and joined vowels), in absolute
    // ids: `glueNuclei` ids are 0-based and never exceed their unit's offset,
    // so `start + id` stays inside `[start, end)` — unique to this run, never
    // equal to a neighbour's.
    const groups = ctx.groups;
    if (groups) {
        glueNuclei(units, diphthongs, joins).forEach((id, k) => {
            groups[start + k] = start + id;
        });
    }
    const options: SyllabifyOptions = {
        sibilantClusters: ctx.scheme.split?.sibilantClusters,
        diphthongs,
        joins,
        syllabicConsonants: ctx.scheme.split?.syllabicConsonants ?? [],
    };
    // Syllabic consonants of this run (absolute indices), so a core that
    // ends up a single is not given the vowel-killer mark.
    unitRoles(units, options).forEach((role, k) => {
        if (role === 'nucleus' && isConsonant(units[k].cls)) ctx.cores.add(start + k);
    });
    const syllables = syllabify(units, options)
        .map(([from, to]): SyllableRange => ({ start: start + from, end: start + to, joined: false }));
    for (const { start: s, end: e } of joinOpaqueUnits(ctx, syllables)) {
        let best: { template: BlockTemplate; match: TemplateMatch } | null = null;
        for (const template of ctx.scheme.templates) {
            const match = matchTemplate(template, ctx.roles, ctx.classes, s, e, 'exact', ctx.groups);
            if (match && (best === null || match.emptyOptional < best.match.emptyOptional)) {
                best = { template, match };
            }
        }
        if (best) out.push(blockSegment(best.template, best.match, s));
        else segmentGreedy(ctx, s, e, out);
    }
}

/**
 * Segment a spelling into blocks, singles and passthroughs (module JSDoc).
 * `entryIndices` are always indices into `entries` as given — join entries
 * appear in no segment. Never throws on a validated scheme.
 */
export function segmentEntries(
    entries: readonly BlockSpellingEntry[],
    scheme: BlockScheme,
    index: BlockGraphemeIndex,
): Segment[] {
    const classes = entries.map((entry) => classifyEntry(entry, index));
    if (!classes.some((cls) => cls.kind === 'join')) {
        // No join: the compaction is the identity (P-A2).
        return segmentCompact(entries, classes, scheme, index, new Set<number>());
    }

    const kept: number[] = [];
    const joinBefore = new Set<number>();
    classes.forEach((cls, i) => {
        if (cls.kind === 'join') return;
        // Only joins are removed, so a gap in the kept indices IS a join.
        if (kept.length > 0 && i - kept[kept.length - 1] > 1) joinBefore.add(kept.length);
        kept.push(i);
    });
    const segments = segmentCompact(
        kept.map((i) => entries[i]),
        kept.map((i) => classes[i]),
        scheme,
        index,
        joinBefore,
    );
    return segments.map((segment) => remapSegment(segment, kept));
}

/** `segment` with its compact `entryIndices` mapped back through `kept`. */
function remapSegment(segment: Segment, kept: readonly number[]): Segment {
    switch (segment.kind) {
        case 'block':
            return { ...segment, entryIndices: segment.entryIndices.map((k) => kept[k]) };
        case 'single':
            return { ...segment, entryIndices: [kept[segment.entryIndices[0]]] };
        case 'passthrough':
            return { ...segment, entryIndices: [kept[segment.entryIndices[0]]] };
    }
}

/** The segmentation pipeline over a join-free (compact) spelling. */
function segmentCompact(
    entries: readonly BlockSpellingEntry[],
    classes: readonly EntryClass[],
    scheme: BlockScheme,
    index: BlockGraphemeIndex,
    joinBefore: ReadonlySet<number>,
): Segment[] {
    const ctx: SegmentContext = {
        scheme,
        classes,
        roles: new Map<string, BlockRole>(scheme.roles.map((role) => [role.id, role])),
        joinBefore,
        cores: new Set<number>(),
    };
    const bySyllable = scheme.split?.mode === 'syllables';
    // Every entry its own group until its run is syllabified (segmentSyllables).
    if (bySyllable) ctx.groups = entries.map((_, i) => i);

    const segments: Segment[] = [];
    const flush = (runStart: number, runEnd: number) => {
        if (runStart >= runEnd) return;
        if (bySyllable) segmentSyllables(ctx, entries, index, runStart, runEnd, segments);
        else segmentGreedy(ctx, runStart, runEnd, segments);
    };

    let runStart = 0;
    for (let i = 0; i < entries.length; i += 1) {
        const cls = ctx.classes[i];
        if (cls.kind !== 'boundary' && cls.kind !== 'structural') continue;
        flush(runStart, i);
        if (cls.kind === 'structural') segments.push({ kind: 'passthrough', entryIndices: [i] });
        runStart = i + 1;
    }
    flush(runStart, entries.length);
    return segments;
}
