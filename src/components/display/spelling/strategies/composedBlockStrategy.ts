/**
 * Composed Block Layout Strategy
 *
 * Writing-system-aware layout that composes layout at 3 levels:
 * 1. Glyphs within words (glyphDirection)
 * 2. Words within lines (wordOrder)
 * 3. Lines/columns wrapping (lineProgression)
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

/**
 * Check if a direction is horizontal.
 */
function isHorizontal(dir: string): boolean {
    return dir === 'ltr' || dir === 'rtl';
}

/**
 * Check if a direction is reversed (rtl or btu).
 */
function isReversed(dir: string): boolean {
    return dir === 'rtl' || dir === 'btu';
}

/**
 * A word group with metadata about what kind of separator it is.
 */
interface WordGroup {
    glyphs: RenderableGlyph[];
    /** True if this group is a line-break separator */
    isLineBreak: boolean;
}

/**
 * Split glyphs into word groups using word boundary and line-break indices.
 */
function splitIntoWords(
    glyphs: RenderableGlyph[],
    wordBoundaries?: number[],
    lineBreaks?: number[]
): WordGroup[] {
    const boundarySet = new Set(wordBoundaries ?? []);
    const lineBreakSet = new Set(lineBreaks ?? []);

    if (boundarySet.size === 0 && lineBreakSet.size === 0) {
        return [{ glyphs, isLineBreak: false }];
    }

    const groups: WordGroup[] = [];
    let currentWord: RenderableGlyph[] = [];

    for (let i = 0; i < glyphs.length; i++) {
        if (lineBreakSet.has(i)) {
            // Push current word, then a line-break marker
            if (currentWord.length > 0) {
                groups.push({ glyphs: currentWord, isLineBreak: false });
                currentWord = [];
            }
            groups.push({ glyphs: [glyphs[i]], isLineBreak: true });
        } else if (boundarySet.has(i)) {
            // Push current word, then the word separator
            if (currentWord.length > 0) {
                groups.push({ glyphs: currentWord, isLineBreak: false });
                currentWord = [];
            }
            groups.push({ glyphs: [glyphs[i]], isLineBreak: false });
        } else {
            currentWord.push(glyphs[i]);
        }
    }

    if (currentWord.length > 0) {
        groups.push({ glyphs: currentWord, isLineBreak: false });
    }

    return groups;
}

/**
 * Measure the size of a word laid out according to glyphDirection.
 */
function measureWord(
    glyphCount: number,
    glyphDirection: string,
    glyphWidth: number,
    glyphHeight: number,
    spacing: number
): { width: number; height: number } {
    if (glyphCount === 0) return { width: 0, height: 0 };

    if (isHorizontal(glyphDirection)) {
        return {
            width: glyphCount * glyphWidth + (glyphCount - 1) * spacing,
            height: glyphHeight,
        };
    } else {
        return {
            width: glyphWidth,
            height: glyphCount * glyphHeight + (glyphCount - 1) * spacing,
        };
    }
}

/**
 * Create a composed block strategy from writing system settings.
 */
export function createComposedBlockStrategy(
    writingSystem: WritingSystemSettings,
    wordBoundaries?: number[],
    lineBreaks?: number[]
): LayoutStrategy {
    return {
        name: 'composed-block',

        calculate(glyphs: RenderableGlyph[], config: LayoutStrategyConfig): LayoutResult {
            if (glyphs.length === 0) {
                return { positions: [], bounds: emptyBounds(config) };
            }

            const { glyphWidth, glyphHeight, spacing, padding, maxWidth, maxHeight } = config;
            const { glyphDirection, wordOrder, lineProgression, baselineAlignment } = writingSystem;

            // Split into word groups (with line-break metadata)
            const wordGroups = splitIntoWords(glyphs, wordBoundaries, lineBreaks);

            // Determine primary axis for word flow and secondary axis for wrapping
            const wordFlowHorizontal = isHorizontal(wordOrder);
            const lineFlowHorizontal = isHorizontal(lineProgression);

            // Maximum extent for wrapping
            const maxPrimaryExtent = wordFlowHorizontal
                ? (maxWidth ? maxWidth - padding * 2 : Infinity)
                : (maxHeight ? maxHeight - padding * 2 : Infinity);

            // === DEBUG ===
            console.group('[composedBlockStrategy DEBUG]');
            console.log('config:', { glyphWidth, glyphHeight, spacing, padding, maxWidth, maxHeight });
            console.log('writingSystem:', { glyphDirection, wordOrder, lineProgression, baselineAlignment });
            console.log('wordBoundaries:', wordBoundaries);
            console.log('lineBreaks:', lineBreaks);
            console.log('total glyphs:', glyphs.length);
            console.log('wordGroups:', wordGroups.length,
                'groups:', wordGroups.map(g => ({ len: g.glyphs.length, isLineBreak: g.isLineBreak })));
            console.log('wordFlowHorizontal:', wordFlowHorizontal, 'lineFlowHorizontal:', lineFlowHorizontal);
            console.log('maxPrimaryExtent:', maxPrimaryExtent);
            console.groupEnd();
            // === END DEBUG ===

            // Group words into lines, breaking on explicit line breaks and overflow
            type Line = { words: RenderableGlyph[][]; sizes: { width: number; height: number }[] };
            const lines: Line[] = [];
            let currentLine: Line = { words: [], sizes: [] };
            let currentLineExtent = 0;

            for (const group of wordGroups) {
                // Explicit line break — flush current line and skip the '\n' glyph
                if (group.isLineBreak) {
                    if (currentLine.words.length > 0) {
                        lines.push(currentLine);
                    }
                    currentLine = { words: [], sizes: [] };
                    currentLineExtent = 0;
                    continue;
                }

                const wordSize = measureWord(group.glyphs.length, glyphDirection, glyphWidth, glyphHeight, spacing);
                const wordExtent = wordFlowHorizontal ? wordSize.width : wordSize.height;
                const wordSpacing = currentLine.words.length > 0 ? spacing : 0;

                // Check if adding this word exceeds the line
                const wouldOverflow = currentLineExtent + wordSpacing + wordExtent > maxPrimaryExtent;

                if (writingSystem.wordWrap !== 'none' && wouldOverflow && currentLine.words.length > 0) {
                    lines.push(currentLine);
                    currentLine = { words: [], sizes: [] };
                    currentLineExtent = 0;
                }

                currentLine.words.push(group.glyphs);
                currentLine.sizes.push(wordSize);
                currentLineExtent += (currentLine.words.length > 1 ? spacing : 0) + wordExtent;
            }

            if (currentLine.words.length > 0) {
                lines.push(currentLine);
            }

            // === DEBUG ===
            console.log('[composedBlockStrategy] lines created:', lines.length,
                'words per line:', lines.map(l => l.words.length));
            // === END DEBUG ===

            // Position all glyphs
            //
            // Each glyph position is built from three additive components:
            //   1. lineOffset   → along the lineProgression axis
            //   2. wordOffset   → along the wordOrder axis
            //   3. glyphOffset  → along the glyphDirection axis
            //
            // Each component contributes to X or Y depending on whether
            // its controlling direction is horizontal or vertical.
            // Reversed line progression uses a negative sign so that
            // BTU lines go upward and RTL lines go leftward.

            const positions: PositionedGlyph[] = [];
            let globalIndex = 0;

            const lineProgressionSign = isReversed(lineProgression) ? -1 : 1;

            let lineOffset = 0;

            for (const line of lines) {
                // Calculate line cross-axis size (for alignment)
                let lineCrossSize = 0;
                for (const size of line.sizes) {
                    const cross = wordFlowHorizontal ? size.height : size.width;
                    lineCrossSize = Math.max(lineCrossSize, cross);
                }

                let wordOffset = 0;

                // If word order is reversed, iterate words in reverse display order
                const wordIndices = isReversed(wordOrder)
                    ? line.words.map((_, i) => line.words.length - 1 - i)
                    : line.words.map((_, i) => i);

                for (const wi of wordIndices) {
                    const word = line.words[wi];
                    const wordSize = line.sizes[wi];

                    const glyphIndices = isReversed(glyphDirection)
                        ? word.map((_, i) => word.length - 1 - i)
                        : word.map((_, i) => i);

                    let glyphOffset = 0;

                    for (const gi of glyphIndices) {
                        const glyph = word[gi];

                        // Start with padding on both axes
                        let x = padding;
                        let y = padding;

                        // 1. Line offset → goes along lineProgression axis
                        const lineContribution = lineOffset * lineProgressionSign;
                        if (lineFlowHorizontal) {
                            x += lineContribution;
                        } else {
                            y += lineContribution;
                        }

                        // 2. Word offset → goes along wordOrder axis
                        if (wordFlowHorizontal) {
                            x += wordOffset;
                        } else {
                            y += wordOffset;
                        }

                        // 3. Glyph offset → goes along glyphDirection axis
                        if (isHorizontal(glyphDirection)) {
                            x += glyphOffset;
                        } else {
                            y += glyphOffset;
                        }

                        // Apply baseline alignment along the word flow cross-axis
                        if (wordFlowHorizontal) {
                            const cross = wordSize.height;
                            if (baselineAlignment === 'center') {
                                y += (lineCrossSize - cross) / 2;
                            } else if (baselineAlignment === 'bottom') {
                                y += lineCrossSize - cross;
                            }
                        } else {
                            const cross = wordSize.width;
                            if (baselineAlignment === 'center') {
                                x += (lineCrossSize - cross) / 2;
                            } else if (baselineAlignment === 'bottom') {
                                x += lineCrossSize - cross;
                            }
                        }

                        positions.push({
                            glyph,
                            index: globalIndex++,
                            x,
                            y,
                            width: glyphWidth,
                            height: glyphHeight,
                        });

                        if (isHorizontal(glyphDirection)) {
                            glyphOffset += glyphWidth + spacing;
                        } else {
                            glyphOffset += glyphHeight + spacing;
                        }
                    }

                    const wordExtent = wordFlowHorizontal ? wordSize.width : wordSize.height;
                    wordOffset += wordExtent + spacing;
                }

                lineOffset += lineCrossSize + spacing;
            }

            return {
                positions,
                bounds: calculateBounds(positions, config),
            };
        },
    };
}
