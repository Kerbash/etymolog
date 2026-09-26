/**
 * Every Guide page, as PURE data — slug, title, one-line tagline, and the group
 * it belongs to. The step-by-step body for each lives in a group body component
 * (see `GuideSectionPage`), so this module stays JSX-free and the overview, the
 * side menu and prev/next all derive from this one ordered list.
 *
 * `slug` is the last path segment of the page's route (`/guide/<slug>`) and the
 * key the body component switches on. Keep the array in reading order — the
 * first three are the quick "start here" walk-throughs, the rest are the
 * comprehensive reference.
 */

import { ROUTES, resolveUrl } from '../../../url_mapping';

/** A group heading in the overview and the side menu. */
export interface GuideGroup {
    id: string;
    label: string;
}

export const GUIDE_GROUPS: readonly GuideGroup[] = [
    { id: 'start', label: 'Start here' },
    { id: 'signs', label: 'Designing signs' },
    { id: 'charts', label: 'Charts & keyboard' },
    { id: 'writing', label: 'Writing system' },
    { id: 'blocks', label: 'Blocks in depth' },
    { id: 'words', label: 'Words & meanings' },
    { id: 'tools', label: 'Tools & data' },
];

export interface GuideSectionMeta {
    /** URL slug AND body-component key. */
    slug: string;
    /** Menu label + page heading. */
    title: string;
    /** One-line description under the heading. */
    tagline: string;
    /** Which `GUIDE_GROUPS` id this page belongs to. */
    group: string;
}

export const GUIDE_SECTIONS: readonly GuideSectionMeta[] = [
    // Start here — the quick walk-throughs.
    { slug: 'alphabet', title: 'Alphabet', tagline: 'One sign per sound — like the Latin, Greek or Cyrillic scripts.', group: 'start' },
    { slug: 'abugida', title: 'Abugida & syllable blocks', tagline: 'Signs grouped into one block per syllable — like Hangul or Mayan glyphs.', group: 'start' },
    { slug: 'logogram', title: 'Logogram', tagline: 'One symbol writes a whole word — like Chinese characters.', group: 'start' },

    // Designing signs.
    { slug: 'drawing-glyphs', title: 'Drawing glyphs', tagline: 'The drawing canvas: tools, the guide square, undo and redo.', group: 'signs' },
    { slug: 'importing-signs', title: 'Importing & organizing signs', tagline: 'Bring in an image, and keep glyphs tidy with folders.', group: 'signs' },
    { slug: 'graphemes', title: 'Building graphemes', tagline: 'Turn one or more glyphs into a letter of your script.', group: 'signs' },
    { slug: 'pronunciation', title: 'Pronunciation & auto-spelling', tagline: 'Give a letter its sound so Etymolog can spell words for you.', group: 'signs' },
    { slug: 'variant-forms', title: 'Alternate forms & variant groups', tagline: 'Give one letter several shapes and choose between them.', group: 'signs' },

    // Charts & keyboard.
    { slug: 'charts', title: 'IPA & syllabary charts', tagline: 'Lay your letters out on a sound chart and fill the gaps.', group: 'charts' },
    { slug: 'custom-charts', title: 'Custom charts & punctuation', tagline: 'Your own chart layouts, and how punctuation is written.', group: 'charts' },

    // Writing system.
    { slug: 'direction', title: 'Writing direction', tagline: 'Which way signs, words and lines flow.', group: 'writing' },
    { slug: 'spacing', title: 'Letter & word spacing', tagline: 'How far apart signs sit, and how words are separated.', group: 'writing' },

    // Blocks in depth.
    { slug: 'blocks-intro', title: 'Blocks: how they work', tagline: 'What a block is, and the pieces that build one.', group: 'blocks' },
    { slug: 'blocks-roles', title: 'Blocks: roles', tagline: 'Define the kinds of slot a block can hold.', group: 'blocks' },
    { slug: 'blocks-templates', title: 'Blocks: templates & layout', tagline: 'Lay out where each sign sits inside a block.', group: 'blocks' },
    { slug: 'blocks-splitting', title: 'Blocks: splitting words', tagline: 'Decide how a word is cut into blocks.', group: 'blocks' },
    { slug: 'blocks-lone', title: 'Blocks: lone consonants', tagline: 'What to do with a consonant that has no vowel.', group: 'blocks' },
    { slug: 'blocks-testing', title: 'Blocks: testing & tuning', tagline: 'Try a word, check them all, and read the outlines.', group: 'blocks' },

    // Words & meanings.
    { slug: 'lexicon-add', title: 'Adding a word', tagline: 'Pronunciation, and the shape of the word form.', group: 'words' },
    { slug: 'lexicon-meanings', title: 'Meanings & parts of speech', tagline: 'Give a word one or more senses.', group: 'words' },
    { slug: 'lexicon-spelling', title: 'Spelling & logograms', tagline: 'How a word is written, and giving it a single symbol.', group: 'words' },
    { slug: 'lexicon-organizing', title: 'Organizing the lexicon', tagline: 'Folders, filtering, and the word page.', group: 'words' },
    { slug: 'etymology', title: 'Etymology & word relations', tagline: 'Where words come from, and the family tree.', group: 'words' },

    // Tools & data.
    { slug: 'generator', title: 'The word generator', tagline: 'Invent words that fit the sound of your language.', group: 'tools' },
    { slug: 'translator', title: 'The translator', tagline: 'Type text and see it in your script, then export it.', group: 'tools' },
    { slug: 'backup', title: 'Export, import & backup', tagline: 'Save your conlang to a file and load it back.', group: 'tools' },
];

/** The sections of one group, in order. */
export function guideSectionsInGroup(groupId: string): GuideSectionMeta[] {
    return GUIDE_SECTIONS.filter((section) => section.group === groupId);
}

/** The route for one section page. */
export function guideSectionPath(slug: string): string {
    return resolveUrl(ROUTES.guideSection, { slug });
}

/** Where "Back to editor" goes when there is no page to go back to. */
export const GUIDE_FALLBACK_ROUTE = ROUTES.lexicon;
