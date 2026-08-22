/**
 * Writing-system sanity checks.
 *
 * The three direction rules are independent settings, but some combinations
 * cannot be laid out meaningfully: if words and lines advance along the same
 * axis, every new line is stacked on top of the previous one. The layout
 * engine renders whatever it is given; this reports WHY the result looks
 * wrong so the settings UI can warn before the user hunts for a bug.
 */

import type { WritingSystemSettings, DirectionValue } from '../db/api/types';

export interface WritingSystemWarning {
    /** Settings keys involved. */
    keys: (keyof WritingSystemSettings)[];
    message: string;
}

function axisOf(direction: DirectionValue): 'horizontal' | 'vertical' {
    return direction === 'ltr' || direction === 'rtl' ? 'horizontal' : 'vertical';
}

export function validateWritingSystem(settings: WritingSystemSettings): WritingSystemWarning[] {
    const warnings: WritingSystemWarning[] = [];

    if (axisOf(settings.wordOrder) === axisOf(settings.lineProgression)) {
        warnings.push({
            keys: ['wordOrder', 'lineProgression'],
            message: 'Word order and line progression run along the same axis, so wrapped lines will overlap. Pick a horizontal direction for one and a vertical direction for the other.',
        });
    }

    if (settings.wordWrap === 'glyph' && axisOf(settings.glyphDirection) !== axisOf(settings.wordOrder)) {
        warnings.push({
            keys: ['wordWrap', 'glyphDirection'],
            message: 'Glyph-boundary wrapping only applies when glyphs and words flow along the same axis; words will wrap whole instead.',
        });
    }

    return warnings;
}
