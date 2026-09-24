/**
 * Writing-system sanity checks.
 *
 * The three direction rules are independent settings, but some combinations
 * cannot be laid out meaningfully: if words and lines advance along the same
 * axis, every new line is stacked on top of the previous one. The layout
 * engine renders whatever it is given; this reports WHY the result looks
 * wrong so the settings UI can warn before the user hunts for a bug.
 *
 * The block scheme is checked here too (optional second argument): a scheme
 * that is switched ON with no templates groups nothing, which looks exactly
 * like "blocks are broken". Both the Direction page (saved scheme) and the
 * Blocks page (its draft) report it.
 */

import type { WritingSystemSettings, DirectionValue } from '../db/api/types';
import type { BlockScheme } from '../blocks/types';

/** A settings key, or `'blockScheme'` for a warning about the block scheme. */
export type WritingSystemWarningKey = keyof WritingSystemSettings | 'blockScheme';

export interface WritingSystemWarning {
    /** Settings keys involved (also the warning's stable identity). */
    keys: WritingSystemWarningKey[];
    /** A short heading for the banner. */
    title: string;
    message: string;
}

/** The message of the "enabled with zero templates" block-scheme warning. */
export const BLOCKS_WITHOUT_TEMPLATES_MESSAGE =
    'Blocks are switched on, but the scheme has no templates, so every sign is still drawn on its own. Add a template on the Blocks page, or switch blocks off.';

/** Block-scheme warnings only. */
export function validateBlockSchemeUsage(blockScheme: BlockScheme | null | undefined): WritingSystemWarning[] {
    if (!blockScheme || !blockScheme.enabled || blockScheme.templates.length > 0) return [];
    return [{ keys: ['blockScheme'], title: 'Blocks have no templates', message: BLOCKS_WITHOUT_TEMPLATES_MESSAGE }];
}

function axisOf(direction: DirectionValue): 'horizontal' | 'vertical' {
    return direction === 'ltr' || direction === 'rtl' ? 'horizontal' : 'vertical';
}

export function validateWritingSystem(
    settings: WritingSystemSettings,
    blockScheme?: BlockScheme | null,
): WritingSystemWarning[] {
    const warnings: WritingSystemWarning[] = [];

    if (axisOf(settings.wordOrder) === axisOf(settings.lineProgression)) {
        warnings.push({
            keys: ['wordOrder', 'lineProgression'],
            title: 'These rules contradict each other',
            message: 'Word order and line progression run along the same axis, so wrapped lines will overlap. Pick a horizontal direction for one and a vertical direction for the other.',
        });
    }

    if (settings.wordWrap === 'glyph' && axisOf(settings.glyphDirection) !== axisOf(settings.wordOrder)) {
        warnings.push({
            keys: ['wordWrap', 'glyphDirection'],
            title: 'These rules contradict each other',
            message: 'Glyph-boundary wrapping only applies when glyphs and words flow along the same axis; words will wrap whole instead.',
        });
    }

    warnings.push(...validateBlockSchemeUsage(blockScheme));

    return warnings;
}
