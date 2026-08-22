/**
 * @fileoverview The guide overlay's vocabulary — labels and the tooltip line.
 *
 * A `.ts` module rather than part of `GuidePicker.tsx` / `GuideLegend.tsx`
 * because of `react-refresh/only-export-components`: a `.tsx` that exports a
 * component may not also export constants, and both of those components plus
 * the chart cell and the two pages need these strings.
 *
 * The overlay is a SUGGESTION. Nothing here enforces anything — the wording is
 * chosen so that a user reading a tooltip understands they are looking at
 * advice about a flavour, not at a rule the app will hold them to.
 *
 * @module display/ipaChart/guideTiers
 */

import type { GuideTier } from '../../../generator';

/** The three tiers, in the order the legend lists them (strongest claim first). */
export const GUIDE_TIERS: readonly GuideTier[] = ['core', 'flavour', 'avoid'];

/** Legend swatch captions. */
export const GUIDE_TIER_LABELS: Record<GuideTier, string> = {
    core: 'Core',
    flavour: 'Flavour',
    avoid: 'Avoid',
};

/** One line each, under the swatch caption — what the tier MEANS for a word. */
export const GUIDE_TIER_DESCRIPTIONS: Record<GuideTier, string> = {
    core: 'The sounds the flavour is built from.',
    flavour: 'Optional colour — a few of these sharpen the impression.',
    avoid: 'These break the illusion. Nothing stops you using them.',
};

/** The tail of a cell's tooltip line: "Elvish / flowing: core sound". */
export const GUIDE_TIER_TOOLTIPS: Record<GuideTier, string> = {
    core: 'core sound',
    flavour: 'flavour sound',
    avoid: 'sound to avoid',
};

/** The `<option>` value that means "paint nothing". `null` cannot be a select value. */
export const NO_GUIDE_VALUE = '';

/** The "off" option's visible text. */
export const NO_GUIDE_LABEL = 'No guide';

/** The picker's accessible name, and its visible label — they are deliberately the same string. */
export const GUIDE_PICKER_LABEL = 'Flavour guide';

/** The legend's link into the (not yet existing) generator page. */
export const GUIDE_GENERATE_LINK_LABEL = 'Generate words with this flavour';

/** The legend's control that opens the page explainer at the preset's `why`. */
export const GUIDE_WHY_LABEL = 'Why it sounds like this';

/**
 * The guide's line in a chart cell's tooltip and accessible name.
 *
 * A plain string on purpose: `HoverToolTip` content is joined with `\n`, and a
 * node would render as `[object Object]` in the `aria-label` that carries the
 * same information to a screen reader.
 */
export function guideTooltipLine(presetName: string | undefined, tier: GuideTier): string {
    const prefix = presetName ? `${presetName}: ` : '';
    return `${prefix}${GUIDE_TIER_TOOLTIPS[tier]}`;
}
