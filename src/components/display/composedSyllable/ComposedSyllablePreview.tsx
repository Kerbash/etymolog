/**
 * ComposedSyllablePreview — the dimmed stand-in an EMPTY syllabary cell shows
 * when the script's block scheme is enabled: the syllable spelled with the
 * signs that already exist (`k` + `a`), composed into a block by
 * `GlyphSpellingDisplay` exactly as a word would be.
 *
 * Purely presentational. The cell around it keeps its own click-to-create
 * behaviour (the charts delegate clicks on `<td data-ipa>`), and the `title`
 * says both what is shown and what a click does.
 *
 * @module display/composedSyllable/ComposedSyllablePreview
 */

import GlyphSpellingDisplay from '../spelling/GlyphSpellingDisplay';
import type { SpellingDisplayEntry } from '../../../db/types';
import styles from './ComposedSyllablePreview.module.scss';

export interface ComposedSyllablePreviewProps {
    consonant: string;
    vowel: string;
    entries: SpellingDisplayEntry[];
    /** Glyph box in px (the charts' assigned cells use 32). */
    size?: number;
}

export default function ComposedSyllablePreview({ consonant, vowel, entries, size = 32 }: ComposedSyllablePreviewProps) {
    return (
        <div
            className={styles.preview}
            title={`Composed from ${consonant} + ${vowel} — click to create a dedicated sign`}
            data-composed-preview=""
        >
            <GlyphSpellingDisplay
                glyphs={entries}
                strategy="ltr"
                config={{ glyphWidth: size, glyphHeight: size, spacing: 0, padding: 0 }}
                showVirtualGlyphStyling={false}
                fit="shrink"
                className={styles.display}
            />
        </div>
    );
}
