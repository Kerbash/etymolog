/**
 * The step-by-step walk-through for one Guide section, keyed by the section slug
 * in `guideContent.ts`. Screenshots are bundled local assets shown through
 * `GuideFigure`. Kept in its own component file so the data module stays
 * JSX-free and react-refresh-clean.
 */

import GuideFigure from './GuideFigure';
import styles from './GuidePage.module.scss';

import alphabetGlyphs from '../../../assets/guide/alphabet-1-glyphs.jpg';
import alphabetGraphemeForm from '../../../assets/guide/alphabet-2-grapheme-form.jpg';
import alphabetLexicon from '../../../assets/guide/alphabet-4-lexicon.jpg';
import abugidaBlocksOn from '../../../assets/guide/abugida-1-blocks-on.jpg';
import abugidaRoles from '../../../assets/guide/abugida-2-roles.jpg';
import abugidaTemplates from '../../../assets/guide/abugida-3-templates.jpg';
import abugidaGlyphGuide from '../../../assets/guide/abugida-5-glyph-guide.jpg';
import abugidaTry from '../../../assets/guide/abugida-4-try-outlines.jpg';
import logogramTab from '../../../assets/guide/logogram-1-tab.jpg';

export interface GuideSectionBodyProps {
    /** A `GUIDE_SECTIONS` slug. */
    slug: string;
}

export default function GuideSectionBody({ slug }: GuideSectionBodyProps) {
    switch (slug) {
        case 'alphabet':
            return (
                <>
                    <p>
                        An <strong>alphabet</strong> spells a word out one sign at a time, each sign
                        standing for a sound — the way English, Greek or Russian are written. It is
                        what Etymolog does out of the box: you draw signs, tell it what each one
                        sounds like, and it spells your words for you. Nothing needs to be switched on.
                    </p>
                    <p className={styles.pipeline}>
                        The whole app runs on one chain: <strong>glyph</strong> (a drawing) →
                        {' '}<strong>grapheme</strong> (a drawing + the sound it makes = a letter) →
                        {' '}<strong>word</strong> (letters, spelled from its pronunciation).
                    </p>

                    <ol className={styles.steps}>
                        <li>
                            <strong>Draw your letters.</strong> Go to <em>Script Maker → Glyphs</em> and
                            press <em>New glyph</em>. Draw one mark on the canvas and save it. A glyph
                            is only a picture — it has no sound yet. Draw one for every letter you
                            want (and any accents or parts you will combine later).
                            <GuideFigure
                                src={alphabetGlyphs}
                                alt="The Glyphs page in Script Maker showing a grid of hand-drawn glyphs."
                                caption="Script Maker → Glyphs. Every mark you draw lives here; graphemes are built from them."
                            />
                        </li>
                        <li>
                            <strong>Turn glyphs into letters (graphemes).</strong> Go to
                            {' '}<em>Script Maker → Graphemes → New grapheme</em>. Under
                            {' '}<em>Glyphs (default form)</em> press <em>Add new glyph</em> or
                            {' '}<em>Select existing glyph</em> to give the letter its shape. Give it a
                            name under <em>Details</em>. Under <em>Pronunciation</em>, type the sound
                            it spells and leave <em>Use in auto-spelling</em> ticked — that is what
                            lets Etymolog write this letter when it sees that sound. Press
                            {' '}<em>Create grapheme</em>.
                            <GuideFigure
                                src={alphabetGraphemeForm}
                                alt="The New grapheme form with sections for glyphs, other forms, details and pronunciation."
                                caption="A grapheme = a shape + the sound it makes. The Pronunciation rows are what auto-spelling reads."
                            />
                        </li>
                        <li>
                            <strong>Set the writing direction.</strong> In <em>Writing System →
                            Direction</em> choose how the script flows: the order of signs in a word,
                            the order of words in a line, which way lines stack, whether words wrap,
                            and the baseline. Left-to-right is the default, so you can skip this until
                            you want something else.
                        </li>
                        <li>
                            <strong>Write words.</strong> In the <em>Lexicon</em> press
                            {' '}<em>New word</em> and type its pronunciation. Etymolog spells it
                            automatically, one grapheme per sound, and draws it in your script. (The
                            <em> Translator</em> tab does the same for whole sentences.)
                            <GuideFigure
                                src={alphabetLexicon}
                                alt="The lexicon showing words rendered in the invented script with their pronunciations."
                                caption="Every word, spelled in your own letters. This example writes one sign per sound."
                            />
                        </li>
                    </ol>
                    <p>
                        That is a full alphabet. To group a syllable&apos;s signs into one block
                        instead — an abugida — keep everything you just made and read the next page.
                    </p>
                </>
            );
        case 'abugida':
            return (
                <>
                    <p>
                        An <strong>abugida</strong> (or a syllabary, or a block script like Korean
                        Hangul and Mayan glyphs) packs the signs of one syllable into a single
                        <strong> block</strong> — a consonant and its vowel drawn together instead of
                        side by side. In Etymolog you build this on top of an ordinary alphabet with
                        the <strong>Block script</strong>.
                    </p>

                    <ol className={styles.steps}>
                        <li>
                            <strong>Have your consonants and vowels ready.</strong> Blocks arrange the
                            same graphemes an alphabet uses, so make your glyphs and graphemes first
                            (see the <em>Alphabet</em> page). You need a sign for each consonant and
                            each vowel.
                        </li>
                        <li>
                            <strong>Turn blocks on.</strong> Go to <em>Writing System → Blocks</em> and
                            tick <em>Draw words in blocks</em>. Everything below it wakes up.
                            <GuideFigure
                                src={abugidaBlocksOn}
                                alt="The Blocks page toolbar with the Draw words in blocks switch turned on."
                                caption="Writing System → Blocks: the master switch. It also shows how many roles, templates and forms you have."
                            />
                        </li>
                        <li>
                            <strong>Make roles — the kinds of slot.</strong> A <em>role</em> is a kind
                            of sign a block slot accepts: a consonant, a vowel, a mark, and so on.
                            Give each one a short label and say which signs it matches. Want two
                            consonants in a block? Make two roles (e.g. C1 and C2).
                            <GuideFigure
                                src={abugidaRoles}
                                alt="The Roles editor with rows for C1 (consonants), V (vowels) and C2 (consonants)."
                                caption="Roles are the slots a block can hold. Here: two consonant roles and a vowel role."
                            />
                        </li>
                        <li>
                            <strong>Design templates — the block shapes.</strong> A <em>template</em>
                            is one block shape: which roles it holds, in what order, and where each
                            box sits. Press <em>New template</em>, then drag each role&apos;s box in
                            the layout editor to place and size it. A role can be marked optional (so
                            one shape covers, say, both CV and CVC). Templates are tried top-down and
                            the first that fits wins, so put longer patterns first.
                            <GuideFigure
                                src={abugidaTemplates}
                                alt="The Templates list showing a Syllable template (C1 optional, V) and Template 2 (C1, V, C2)."
                                caption="Each template is a block shape. The little picture shows where each role's box sits."
                            />
                        </li>
                        <li>
                            <strong>Draw signs that fit their boxes.</strong> A box is often tall or
                            narrow, and a square drawing will float inside it. When you draw a glyph,
                            open the <em>Block guide</em> above the canvas and pick the box you are
                            drawing for — the canvas highlights that box so you can draw to its shape.
                            Use a grapheme&apos;s <em>Other forms</em> to give it a block-specific
                            shape without changing its sound.
                            <GuideFigure
                                src={abugidaGlyphGuide}
                                alt="The glyph drawing canvas with a Block guide highlighting the tall C1 box in red."
                                caption="Block guide on the glyph canvas: the red box is the slot this sign will fill — draw to fill it."
                            />
                        </li>
                        <li>
                            <strong>Check and fine-tune.</strong> Set a <em>vowel-killer mark</em>
                            under <em>Lone consonants</em> for a consonant written with no vowel. Then
                            use <em>Try a word</em>: pick one of your words and turn on
                            {' '}<em>Outlines</em>. Red is the block square, dashed red is each
                            template box, and cyan is where the sign actually landed. If a sign hangs
                            outside its box, that box is set to <em>Fill</em> (or is too small) — open
                            the template and switch it to <em>Fit</em> or resize it.
                            <GuideFigure
                                src={abugidaTry}
                                alt="Try a word preview with outlines on, showing two blocks with red block squares and cyan ink boxes."
                                caption="Try a word with Outlines on. The colour key shows the block square, each box, and where each sign landed."
                            />
                        </li>
                    </ol>
                </>
            );
        case 'logogram':
            return (
                <>
                    <p>
                        A <strong>logogram</strong> is a single symbol that stands for a whole word
                        rather than its sounds — like a Chinese character or an ampersand. In Etymolog
                        a logogram is just an ordinary grapheme underneath (category
                        {' '}<em>logogram</em>, no sound), so it also turns up in the Script Maker and
                        the glyph keyboard like any other sign, and you can mix logograms with spelled
                        words freely.
                    </p>

                    <ol className={styles.steps}>
                        <li>
                            <strong>Open the word&apos;s Logogram tab.</strong> In the <em>Lexicon</em>,
                            open a word (or press <em>New word</em>). In its spelling section switch
                            from <em>Compose from graphemes</em> to the <em>Logogram</em> tab.
                            <GuideFigure
                                src={logogramTab}
                                alt="A word's spelling section with the Logogram tab selected, showing Use existing and Draw new options."
                                caption="The Logogram tab on a word. One symbol will write the whole word."
                            />
                        </li>
                        <li>
                            <strong>Give it a symbol.</strong> Press <em>Draw new</em> to draw the
                            symbol on the spot, or <em>Use existing</em> and then
                            {' '}<em>Choose a grapheme…</em> / <em>Choose a glyph…</em> to reuse a sign
                            you already made.
                        </li>
                        <li>
                            <strong>Save.</strong> The word is now written with that one symbol. If
                            several words share a logogram, editing it in the Script Maker updates all
                            of them at once.
                        </li>
                    </ol>
                    <p>
                        Most real scripts mix systems — spell the everyday words with your alphabet or
                        blocks, and give a handful of common words their own logograms.
                    </p>
                </>
            );
        default:
            return null;
    }
}
