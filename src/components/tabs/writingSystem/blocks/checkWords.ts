/**
 * checkWords — "Check all my words": run the (draft) block scheme over every
 * spelled word of the lexicon and list the words that do not split cleanly
 * (CONLANG_EDGES_PLAN.md §6.1).
 *
 * Each word is segmented ONCE, by the SAME segmenter the renderer runs
 * (`segmentEntries` — never re-derived), and its readout comes from the shared
 * `readSegments` the preview caption uses, so the report can never phrase a
 * word differently from "Try a word" (P-D1: `summarizeBlocks` is NOT called —
 * it would segment a second time). Classes come from `classifyEntry`, which
 * resolves every grapheme through the index (P-D2: `spellingDisplay` rows carry
 * no phonemes of their own).
 *
 * Like `segmentEntries`, this does not look at `scheme.enabled`: the Blocks
 * page passes its draft forced on (`previewScheme`), so a user designing with
 * blocks still off sees how their words WOULD split.
 *
 * Named `checkWords.ts`, not the plan's `wordCheck.ts`: on a case-insensitive
 * file system `./WordCheck` (the component) would resolve to `wordCheck.ts`.
 *
 * @module writingSystem/blocks/checkWords
 */

import { classifyEntry, segmentEntries } from '../../../../blocks';
import type { BlockGraphemeIndex, BlockScheme, BlockSpellingEntry, EntryClass, Segment } from '../../../../blocks';
import type { LexiconComplete } from '../../../../db/types';
import { drawsWithMark, readEntry, readSegments } from './readout';

/** Each list keeps at most this many rows; its `count` stays exact. */
export const MAX_WORD_CHECK_ROWS = 200;

export interface WordCheckRow {
    wordId: number;
    /** `pronunciation || lemma`. */
    label: string;
    /** The word as the segments cut it (`ka · t`), exactly as the preview reads it. */
    readout: string;
    /** Plain language: "t at the end is drawn alone"; several findings joined by `; `. */
    detail: string;
}

export interface WordCheckList {
    /** In lexicon order, capped at `MAX_WORD_CHECK_ROWS`. */
    rows: WordCheckRow[];
    /** Exact number of words in the list (may exceed `rows.length`). */
    count: number;
}

export interface WordCheck {
    /** Words with a non-empty `spellingDisplay` (the rest are skipped, not counted). */
    checked: number;
    /** Words whose every segment is a block or a passthrough. */
    clean: number;
    /** A single that is NOT a consonant and NOT unknown: a vowel, syllable sign, logogram, mark or syllabic core drawn alone. */
    unplaced: WordCheckList;
    /** Singles with `consonant: true` — with the vowel-killer mark, or drawn alone. */
    loneConsonants: WordCheckList;
    /** Words with an entry whose class is `unknown`. */
    unreadable: WordCheckList;
    /** Scheme templates no block of any checked word used (empty when nothing was checked). */
    unusedTemplates: { id: string; name: string }[];
}

/** The fields the check reads — `LexiconComplete` satisfies it. */
export type CheckedWord = Pick<LexiconComplete, 'id' | 'lemma' | 'pronunciation' | 'spellingDisplay'>;

function emptyList(): WordCheckList {
    return { rows: [], count: 0 };
}

function pushRow(list: WordCheckList, row: WordCheckRow): void {
    list.count += 1;
    if (list.rows.length < MAX_WORD_CHECK_ROWS) list.rows.push(row);
}

/** " at the start" / " at the end" / " in the middle" — nothing for a one-segment word. */
function positionOf(k: number, n: number): string {
    if (n <= 1) return '';
    if (k === 0) return ' at the start';
    if (k === n - 1) return ' at the end';
    return ' in the middle';
}

/** What kind of sign a bare single is, when "a sound" would not say it. */
function kindNote(cls: EntryClass | undefined): string {
    switch (cls?.kind) {
        case 'syllable':
            return ' (syllable sign)';
        case 'silent':
            return ' (logogram)';
        case 'mark':
            return ' (mark)';
        default:
            return '';
    }
}

/** Unique findings, in order, as one line. */
function joinDetails(details: readonly string[]): string {
    return [...new Set(details)].join('; ');
}

/**
 * Check every spelled word against `scheme` (module JSDoc). Words are checked
 * in lexicon order; a word can appear in several lists. Pure; never throws on
 * a validated scheme.
 */
export function checkWords(words: readonly CheckedWord[], scheme: BlockScheme, index: BlockGraphemeIndex): WordCheck {
    const result: WordCheck = {
        checked: 0,
        clean: 0,
        unplaced: emptyList(),
        loneConsonants: emptyList(),
        unreadable: emptyList(),
        unusedTemplates: [],
    };
    const usedTemplates = new Set<string>();

    for (const word of words) {
        const entries: readonly BlockSpellingEntry[] = word.spellingDisplay;
        if (entries.length === 0) continue;
        result.checked += 1;

        const classes = entries.map((entry) => classifyEntry(entry, index));
        // THE one segmentation of this word (P-D1).
        const segments: Segment[] = segmentEntries(entries, scheme, index);
        const drawable = segments.filter((segment) => segment.kind !== 'passthrough');

        const unplaced: string[] = [];
        const lone: string[] = [];
        let clean = true;
        drawable.forEach((segment, k) => {
            if (segment.kind === 'block') {
                usedTemplates.add(segment.templateId);
                return;
            }
            if (segment.kind !== 'single') return;
            clean = false;
            const i = segment.entryIndices[0];
            const sound = readEntry(entries, i, index);
            const where = positionOf(k, drawable.length);
            if (segment.consonant) {
                lone.push(drawsWithMark(segment, entries, index, scheme)
                    ? `${sound}${where} has the vowel-killer mark`
                    : `${sound}${where} is drawn alone`);
            } else if (classes[i]?.kind !== 'unknown') {
                unplaced.push(`${sound}${kindNote(classes[i])}${where} is drawn on its own`);
            }
        });
        const unreadable = classes.flatMap((cls, i) => (cls.kind === 'unknown' ? [`${readEntry(entries, i, index)} cannot be read`] : []));

        if (clean) result.clean += 1;
        if (unplaced.length === 0 && lone.length === 0 && unreadable.length === 0) continue;

        const label = word.pronunciation || word.lemma;
        const readout = readSegments(segments, entries, index);
        const row = (details: string[]): WordCheckRow => ({ wordId: word.id, label, readout, detail: joinDetails(details) });
        if (unplaced.length > 0) pushRow(result.unplaced, row(unplaced));
        if (lone.length > 0) pushRow(result.loneConsonants, row(lone));
        if (unreadable.length > 0) pushRow(result.unreadable, row(unreadable));
    }

    if (result.checked > 0) {
        result.unusedTemplates = scheme.templates
            .filter((template) => !usedTemplates.has(template.id))
            .map((template) => ({ id: template.id, name: template.name }));
    }
    return result;
}
