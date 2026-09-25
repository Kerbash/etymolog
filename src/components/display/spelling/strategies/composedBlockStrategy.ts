/**
 * Composed Block Layout Strategy
 *
 * Writing-system-aware layout composed at three levels:
 *   1. glyphs within a word   (glyphDirection)
 *   2. words within a line    (wordOrder)
 *   3. lines within the block (lineProgression)
 *
 * Word and line boundaries come from the glyphs themselves — `role` on a
 * `RenderableGlyph` is `'word-separator'`, `'line-break'`, `'punctuation'` or
 * the invisible `'word-break'` (a hidden separator: it splits words but is not
 * drawn, and the word after it is placed touching) — not from index arrays
 * supplied by the caller. The translator used to pass
 * indices computed over spelling ENTRIES while this strategy indexed GLYPHS
 * (a grapheme expands to several), so every break after a multi-glyph
 * grapheme landed in the wrong place.
 *
 * @module display/spelling/strategies/composedBlockStrategy
 */

import type {
    LayoutStrategy,
    LayoutStrategyConfig,
    LayoutResult,
    RenderableGlyph,
    PositionedGlyph,
} from '../types';
import type { WritingSystemSettings } from '../../../../db/api/types';
import { emptyBounds, calculateBounds } from '../utils/bounds';
import { cellGeometry, type CellGeometry } from '../utils/cell';

function isHorizontal(dir: string): boolean {
    return dir === 'ltr' || dir === 'rtl';
}

/** rtl and btt run against the positive axis. */
function isReversed(dir: string): boolean {
    return dir === 'rtl' || dir === 'btt';
}

/** A run of glyphs laid out together: a word, a separator, or a line break. */
interface WordGroup {
    glyphs: RenderableGlyph[];
    isLineBreak: boolean;
    /**
     * This word abuts the word before it with only a letter step, no separator
     * gap — a hidden word separator (`word-break`) sat between them. Always
     * false for line breaks and for the separator/punctuation single-glyph
     * groups.
     */
    touchesPrev: boolean;
}

/**
 * Group glyphs into words. Separators and punctuation become their own
 * single-glyph groups so they participate in wrapping; line breaks become
 * markers that flush the current line and are not positioned; an invisible
 * `word-break` flushes the current word, is NOT positioned, and marks the next
 * word as touching (`touchesPrev`).
 */
export function splitIntoWords(glyphs: RenderableGlyph[]): WordGroup[] {
    const groups: WordGroup[] = [];
    let current: RenderableGlyph[] = [];
    // Applies to the word being accumulated; set true by a preceding word-break.
    let touchesPrev = false;
    const flush = () => {
        if (current.length > 0) {
            groups.push({ glyphs: current, isLineBreak: false, touchesPrev });
            current = [];
        }
        touchesPrev = false;
    };

    for (const glyph of glyphs) {
        if (glyph.role === 'line-break') {
            flush();
            groups.push({ glyphs: [glyph], isLineBreak: true, touchesPrev: false });
        } else if (glyph.role === 'word-break') {
            // Close the word before it; the NEXT accumulated word touches. Not
            // positioned — it draws nothing.
            flush();
            touchesPrev = true;
        } else if (glyph.role === 'word-separator' || glyph.role === 'punctuation') {
            flush();
            groups.push({ glyphs: [glyph], isLineBreak: false, touchesPrev: false });
        } else {
            current.push(glyph);
        }
    }
    flush();
    return groups;
}

/**
 * Size of a word laid out along glyphDirection — the BOX extent: letters
 * within the word advance by the cell, the word's outer margins are its own.
 */
function measureWord(
    glyphCount: number,
    glyphDirection: string,
    glyphWidth: number,
    glyphHeight: number,
    cell: CellGeometry
): { width: number; height: number } {
    if (glyphCount === 0) return { width: 0, height: 0 };
    if (isHorizontal(glyphDirection)) {
        return { width: cell.rowExtent(glyphCount), height: glyphHeight };
    }
    return { width: glyphWidth, height: cell.columnExtent(glyphCount) };
}

/**
 * Break an over-long word into pieces that each fit the line
 * (`wordWrap: 'glyph'`). Returns the word unchanged when it fits.
 */
function chunkWord(word: RenderableGlyph[], maxGlyphsPerLine: number): RenderableGlyph[][] {
    if (!Number.isFinite(maxGlyphsPerLine) || word.length <= maxGlyphsPerLine) return [word];
    const size = Math.max(1, Math.floor(maxGlyphsPerLine));
    const pieces: RenderableGlyph[][] = [];
    for (let i = 0; i < word.length; i += size) {
        pieces.push(word.slice(i, i + size));
    }
    return pieces;
}

/**
 * Create a composed block strategy from writing system settings.
 */
export function createComposedBlockStrategy(writingSystem: WritingSystemSettings): LayoutStrategy {
    return {
        name: 'composed-block',

        calculate(glyphs: RenderableGlyph[], config: LayoutStrategyConfig): LayoutResult {
            if (glyphs.length === 0) {
                return { positions: [], bounds: emptyBounds(config) };
            }

            const { glyphWidth, glyphHeight, spacing, padding, maxWidth, maxHeight } = config;
            const cell = cellGeometry(config);
            const { glyphDirection, wordOrder, lineProgression, baselineAlignment, wordWrap } = writingSystem;

            const wordFlowHorizontal = isHorizontal(wordOrder);
            const lineFlowHorizontal = isHorizontal(lineProgression);
            const glyphFlowHorizontal = isHorizontal(glyphDirection);

            // Extent available along the word-flow axis before wrapping.
            const maxPrimaryExtent = wordWrap === 'none'
                ? Infinity
                : wordFlowHorizontal
                    ? (maxWidth ? maxWidth - padding * 2 : Infinity)
                    : (maxHeight ? maxHeight - padding * 2 : Infinity);

            // For glyph-level wrapping: how many glyphs of a word fit on one line.
            // Only meaningful when glyphs run along the same axis as words.
            const maxGlyphsPerLine = wordWrap === 'glyph' && glyphFlowHorizontal === wordFlowHorizontal
                ? (glyphFlowHorizontal ? cell.fitInRow(maxPrimaryExtent) : cell.fitInColumn(maxPrimaryExtent))
                : Infinity;

            // A `word-break` word abuts its predecessor with only a letter step
            // instead of the separator `spacing`: the next word's first box
            // starts one step after the previous word's last box. Along the
            // word-flow axis that advance past the word's own extent is
            // `step - box` (negative when boxes overlap by their margins) rather
            // than `spacing`.
            const stepAlongFlow = wordFlowHorizontal ? cell.stepX : cell.stepY;
            const boxAlongFlow = wordFlowHorizontal ? glyphWidth : glyphHeight;
            const touchGap = stepAlongFlow - boxAlongFlow;

            // Group into lines, breaking on explicit line breaks and overflow.
            // `gaps[i]` is the gap that precedes word `i` on its line (0 for the
            // first word), so positioning and wrapping share one source of truth.
            type Line = { words: RenderableGlyph[][]; sizes: { width: number; height: number }[]; gaps: number[] };
            const lines: Line[] = [];
            let currentLine: Line = { words: [], sizes: [], gaps: [] };
            let currentLineExtent = 0;

            const startNewLine = () => {
                if (currentLine.words.length > 0) lines.push(currentLine);
                currentLine = { words: [], sizes: [], gaps: [] };
                currentLineExtent = 0;
            };

            for (const group of splitIntoWords(glyphs)) {
                if (group.isLineBreak) {
                    startNewLine();
                    continue;
                }

                chunkWord(group.glyphs, maxGlyphsPerLine).forEach((piece, pieceIndex) => {
                    const wordSize = measureWord(piece.length, glyphDirection, glyphWidth, glyphHeight, cell);
                    const wordExtent = wordFlowHorizontal ? wordSize.width : wordSize.height;
                    // Only the FIRST piece of a wrapped word inherits `touchesPrev`;
                    // later pieces start a fresh line anyway.
                    const wordGap = group.touchesPrev && pieceIndex === 0 ? touchGap : spacing;
                    const gap = currentLine.words.length > 0 ? wordGap : 0;

                    if (currentLine.words.length > 0 && currentLineExtent + gap + wordExtent > maxPrimaryExtent) {
                        startNewLine();
                    }

                    // Recomputed: after a wrap this piece is now first on its line.
                    const gapBefore = currentLine.words.length > 0 ? wordGap : 0;
                    currentLine.words.push(piece);
                    currentLine.sizes.push(wordSize);
                    currentLine.gaps.push(gapBefore);
                    currentLineExtent += gapBefore + wordExtent;
                });
            }
            startNewLine();

            // Position every glyph: line offset along lineProgression, word offset
            // along wordOrder, glyph offset along glyphDirection. Reversed
            // directions accumulate negatively so rtl/btt grow the other way.
            const positions: PositionedGlyph[] = [];
            let globalIndex = 0;
            const lineSign = isReversed(lineProgression) ? -1 : 1;
            let lineOffset = 0;

            for (const line of lines) {
                let lineCrossSize = 0;
                for (const size of line.sizes) {
                    lineCrossSize = Math.max(lineCrossSize, wordFlowHorizontal ? size.height : size.width);
                }

                let wordOffset = 0;
                const wordIndices = isReversed(wordOrder)
                    ? line.words.map((_, i) => line.words.length - 1 - i)
                    : line.words.map((_, i) => i);

                for (let j = 0; j < wordIndices.length; j += 1) {
                    const wi = wordIndices[j];
                    // The gap before this word visually. Two words visually
                    // adjacent are reading-order adjacent (indices differ by 1);
                    // the gap between them is stored on the higher index — which
                    // holds in both flow directions.
                    if (j > 0) wordOffset += line.gaps[Math.max(wordIndices[j - 1], wi)];
                    const word = line.words[wi];
                    const wordSize = line.sizes[wi];
                    const glyphIndices = isReversed(glyphDirection)
                        ? word.map((_, i) => word.length - 1 - i)
                        : word.map((_, i) => i);

                    let glyphOffset = 0;
                    for (const gi of glyphIndices) {
                        let x = padding;
                        let y = padding;

                        const lineContribution = lineOffset * lineSign;
                        if (lineFlowHorizontal) x += lineContribution; else y += lineContribution;
                        if (wordFlowHorizontal) x += wordOffset; else y += wordOffset;
                        if (glyphFlowHorizontal) x += glyphOffset; else y += glyphOffset;

                        // Baseline alignment along the word-flow cross-axis.
                        if (wordFlowHorizontal) {
                            const cross = wordSize.height;
                            if (baselineAlignment === 'center') y += (lineCrossSize - cross) / 2;
                            else if (baselineAlignment === 'bottom') y += lineCrossSize - cross;
                        } else {
                            const cross = wordSize.width;
                            if (baselineAlignment === 'center') x += (lineCrossSize - cross) / 2;
                            else if (baselineAlignment === 'bottom') x += lineCrossSize - cross;
                        }

                        positions.push({ glyph: word[gi], index: globalIndex++, x, y, width: glyphWidth, height: glyphHeight });
                        // Letters within a word advance by the cell.
                        glyphOffset += glyphFlowHorizontal ? cell.stepX : cell.stepY;
                    }

                    // Advance past this word only; the gap before the NEXT word
                    // is added at the top of the loop from `line.gaps`.
                    wordOffset += wordFlowHorizontal ? wordSize.width : wordSize.height;
                }

                lineOffset += lineCrossSize + spacing;
            }

            return { positions, bounds: calculateBounds(positions, config) };
        },
    };
}
