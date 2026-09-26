/**
 * The three writing-system families the Guide covers, as PURE data — the URL
 * slug, the menu/heading title and the one-line tagline for each. The
 * step-by-step body lives in `GuideSectionBody` (a component file), so this
 * stays JSX-free and the layout, index and each section page all derive from
 * this one list.
 *
 * `slug` is the last path segment of the section's route (`/guide/<slug>`) and
 * the key `GuideSectionBody` switches on; keep the array in reading order.
 */

import { ROUTES, resolveUrl } from '../../../url_mapping';

export interface GuideSectionMeta {
    /** URL slug AND `GuideSectionBody` key. */
    slug: string;
    /** Menu label + page heading. */
    title: string;
    /** One-line description under the heading. */
    tagline: string;
}

export const GUIDE_SECTIONS: readonly GuideSectionMeta[] = [
    {
        slug: 'alphabet',
        title: 'Alphabet',
        tagline: 'One sign per sound — like the Latin, Greek or Cyrillic scripts.',
    },
    {
        slug: 'abugida',
        title: 'Abugida & syllable blocks',
        tagline: 'Signs grouped into one block per syllable — like Hangul or Mayan glyphs.',
    },
    {
        slug: 'logogram',
        title: 'Logogram',
        tagline: 'One symbol writes a whole word — like Chinese characters.',
    },
];

/** The route for one section page. */
export function guideSectionPath(slug: string): string {
    return resolveUrl(ROUTES.guideSection, { slug });
}

/** Where "Back to editor" goes when there is no page to go back to. */
export const GUIDE_FALLBACK_ROUTE = ROUTES.lexicon;
