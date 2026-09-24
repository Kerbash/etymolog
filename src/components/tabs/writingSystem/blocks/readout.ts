/**
 * readout — how a spelling READS once the segmenter has cut it.
 *
 * One definition shared by the preview caption (`summarizeBlocks`) and the
 * word check (`checkWords`), so the two can never phrase the same word
 * differently. Both callers segment the spelling ONCE themselves and hand the
 * segments in — nothing here runs the segmenter (CONLANG_EDGES_PLAN P-D1).
 *
 * `drawsWithMark` is the one verdict on whether a lone consonant carries the
 * vowel-killer mark.
 *
 * @module writingSystem/blocks/readout
 */

import { composeLoneConsonant, entrySound } from '../../../../blocks';
import type { BlockGraphemeIndex, BlockScheme, BlockSpellingEntry, Segment, SingleSegment } from '../../../../blocks';

/**
 * How one entry reads: its sound, else the sign's name, else its IPA
 * character, else `?` (an index past the end reads `?` too).
 */
export function readEntry(entries: readonly BlockSpellingEntry[], i: number, index: BlockGraphemeIndex): string {
    const entry = entries[i];
    return entry ? (entrySound(entry, index) ?? entry.grapheme?.name ?? entry.ipaCharacter ?? '?') : '?';
}

/**
 * The word as `segments` cut it: each segment's sounds run together,
 * segments separated by ` · `, words (passthrough segments) by one space —
 * `ta · pa`, `ka LOGO`. Empty words (two separators in a row) are dropped.
 */
export function readSegments(
    segments: readonly Segment[],
    entries: readonly BlockSpellingEntry[],
    index: BlockGraphemeIndex,
): string {
    const words: string[][] = [[]];
    for (const segment of segments) {
        if (segment.kind === 'passthrough') {
            words.push([]);
            continue;
        }
        words[words.length - 1].push(segment.entryIndices.map((i) => readEntry(entries, i, index)).join(''));
    }
    return words.filter((word) => word.length > 0).map((word) => word.join(' · ')).join(' ');
}

/**
 * Is this single drawn WITH the scheme's vowel-killer mark? Only a lone
 * consonant (`consonant: true`) of a scheme with `leftovers`, and only when the
 * renderer's own composer says the mark draws (`composeLoneConsonant` is `null`
 * for a deleted mark, or a consonant that draws nothing) — so neither the
 * caption nor the word check can disagree with the picture.
 */
export function drawsWithMark(
    segment: SingleSegment,
    entries: readonly BlockSpellingEntry[],
    index: BlockGraphemeIndex,
    scheme: BlockScheme,
): boolean {
    return segment.consonant === true
        && scheme.leftovers !== undefined
        && composeLoneConsonant(segment.entryIndices[0], entries, index, scheme.leftovers) !== null;
}
