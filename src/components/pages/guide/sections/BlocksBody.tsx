/**
 * Reference bodies for the "Blocks in depth" group: how blocks work, roles,
 * templates & layout, splitting, lone consonants, and testing & tuning.
 */

import GuideFigure from '../GuideFigure';
import styles from '../GuidePage.module.scss';

import blocksOn from '../../../../assets/guide/abugida-1-blocks-on.jpg';
import roles from '../../../../assets/guide/abugida-2-roles.jpg';
import templates from '../../../../assets/guide/abugida-3-templates.jpg';
import layoutEditor from '../../../../assets/guide/ref-layout-editor.jpg';
import split from '../../../../assets/guide/ref-split.jpg';
import lone from '../../../../assets/guide/ref-lone.jpg';
import tryOutlines from '../../../../assets/guide/abugida-4-try-outlines.jpg';
import glyphGuide from '../../../../assets/guide/abugida-5-glyph-guide.jpg';

export default function BlocksBody({ slug }: { slug: string }) {
    switch (slug) {
        case 'blocks-intro':
            return (
                <>
                    <p>
                        <strong>Blocks</strong> pack the signs of a syllable into one composed shape,
                        the way Korean Hangul or Mayan glyphs are written. They sit on top of an
                        ordinary alphabet — you still make glyphs and graphemes first, then blocks
                        arrange them. Everything lives under <em>Writing System → Blocks</em>.
                    </p>
                    <GuideFigure
                        src={blocksOn}
                        alt="The Blocks page toolbar with the Draw words in blocks switch on and a summary of roles, templates and variant groups."
                        caption="The master switch. Off, every sign is drawn on its own; on, words are packed into blocks."
                    />
                    <p className={styles.pipeline}>
                        A block is built from three ideas, each on its own page next:
                        {' '}<strong>roles</strong> (the kinds of slot), <strong>templates</strong> (the
                        block shapes that arrange those slots), and <strong>splitting</strong> (how a
                        word is cut into blocks in the first place).
                    </p>
                    <p>
                        You can design roles and templates with blocks switched off and only turn
                        {' '}<em>Draw words in blocks</em> on once they look right. The page keeps a
                        draft — your edits aren&apos;t applied until you press <em>Save</em>.
                    </p>
                </>
            );
        case 'blocks-roles':
            return (
                <>
                    <p>
                        A <strong>role</strong> is a kind of slot a block can hold — a consonant, a
                        vowel, a tone mark, and so on. Roles are the vocabulary your templates are built
                        from.
                    </p>
                    <GuideFigure
                        src={roles}
                        alt="The Roles editor with rows for C1, V and C2, each with a label, a matcher, a colour and a usage note."
                        caption="Each role has a label, a matcher that says which signs fit it, and a colour used throughout the editor."
                    />
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Label</strong> — a short name you choose (C1, V, Tone…).
                        </li>
                        <li>
                            <strong>Matcher</strong> — which signs may fill the slot: a whole class
                            (consonants, vowels), a category you made, or a specific set. This is how a
                            template knows a slot takes &ldquo;any consonant&rdquo;.
                        </li>
                        <li>
                            <strong>Two consonants in one block?</strong> Make two roles (say C1 and
                            C2) — a slot holds one role, so distinct positions need distinct roles.
                        </li>
                        <li>
                            <strong>Colour</strong> is a visual aid: the same colour marks that role in
                            the template list, the layout editor and the block guide.
                        </li>
                    </ul>
                </>
            );
        case 'blocks-templates':
            return (
                <>
                    <p>
                        A <strong>template</strong> is one block shape: which roles it holds, in what
                        order, and where each one sits. When a word is written, Etymolog tries the
                        templates from the top down and uses the first whose pattern fits — so put
                        longer, more specific patterns first.
                    </p>
                    <GuideFigure
                        src={templates}
                        alt="The Templates list showing a Syllable template (C1 optional, V) and Template 2 (C1, V, C2) each with a small block-shape preview."
                        caption="Each template is a block shape. The small picture shows where each role's box sits; drag to reorder."
                    />
                    <p>
                        Press <em>Edit</em> on a template to open the <strong>layout editor</strong>.
                        The pattern chips define the slots (in click order); drag and resize each box on
                        the unit square to place it, and tune the selected slot on the right.
                    </p>
                    <GuideFigure
                        src={layoutEditor}
                        alt="The template layout editor: a square canvas with draggable role boxes on the left, and per-slot settings (pin, fill/fit, optional) on the right."
                        caption="The layout editor. Drag each role's box; the panel sets how the sign sits inside it."
                    />
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Position &amp; size</strong> — drag a box and pull its handles. Boxes
                            may overlap (for an infix or a stacked mark); the grid snaps as you drag.
                        </li>
                        <li>
                            <strong>Pin</strong> — a 3×3 picker for where the sign sits inside its box
                            (centre, top-left, and so on).
                        </li>
                        <li>
                            <strong>Fill vs Fit</strong> — <em>Fit</em> keeps the whole sign inside the
                            box (it may leave slack on the narrow side); <em>Fill</em> grows the sign to
                            cover the box and lets the rest spill past the edges. A sign hanging outside
                            its block is almost always a Fill box.
                        </li>
                        <li>
                            <strong>Optional slots</strong> — mark a slot optional so one template covers
                            both, say, CV and CVC.
                        </li>
                        <li>
                            <strong>Arrange &amp; count</strong> — a slot can hold more than one sign,
                            side by side or stacked.
                        </li>
                        <li>
                            <strong>Variant group</strong> — point a slot at a variant group so the sign
                            in it uses its form from that group (a tall or narrow shape). See
                            {' '}<em>Alternate forms &amp; variant groups</em>.
                        </li>
                    </ul>
                    <p>Press <em>Apply</em> to fold the template back into the draft, then <em>Save</em>.</p>
                </>
            );
        case 'blocks-splitting':
            return (
                <>
                    <p>
                        Before signs can be packed into blocks, the word has to be cut into pieces.
                        {' '}<em>Splitting</em> decides how.
                    </p>
                    <GuideFigure
                        src={split}
                        alt="The Splitting settings: choose By syllable or By template order, plus options for diphthongs, sibilant clusters and syllabic consonants."
                        caption="How a word is cut into blocks, with suggestions drawn from your own words."
                    />
                    <ul className={styles.bullets}>
                        <li>
                            <strong>By syllable</strong> — cut the word into syllables, one block each.
                            The natural choice for an abugida.
                        </li>
                        <li>
                            <strong>By template order</strong> — walk the word left to right and grab the
                            first template that fits, repeatedly. More mechanical, useful for scripts
                            that aren&apos;t strictly syllabic.
                        </li>
                        <li>
                            <strong>Diphthongs</strong> — vowel pairs your language says as one vowel
                            (<em>ai</em>, <em>iə</em>) stay in one syllable and share its vowel slot.
                        </li>
                        <li>
                            <strong>Sibilant clusters</strong> — let a syllable start with s + stop
                            (<em>sp</em>, <em>st</em>, <em>str</em>).
                        </li>
                        <li>
                            <strong>Syllabic consonants</strong> — consonants that can be a syllable&apos;s
                            core with no vowel (Czech <em>r</em>, <em>l</em>). Etymolog suggests likely
                            candidates from your inventory.
                        </li>
                    </ul>
                </>
            );
        case 'blocks-lone':
            return (
                <>
                    <p>
                        Sometimes a consonant is left with no vowel to share a block with — the end of
                        a word, a cluster. <em>Lone consonants</em> decides what happens to it.
                    </p>
                    <GuideFigure
                        src={lone}
                        alt="The Lone consonants setting: draw the consonant on its own, or add a vowel-killer mark."
                        caption="A consonant with no vowel: drawn on its own, or carrying a vowel-killer mark."
                    />
                    <ul className={styles.bullets}>
                        <li>
                            <strong>On its own</strong> — the consonant is simply drawn by itself, as it
                            would be without blocks.
                        </li>
                        <li>
                            <strong>Vowel-killer mark</strong> — attach a chosen mark (like the Devanagari
                            virama) that says &ldquo;no vowel here&rdquo;. Pick which grapheme is the
                            mark and where it sits relative to the consonant.
                        </li>
                    </ul>
                </>
            );
        case 'blocks-testing':
            return (
                <>
                    <p>
                        Blocks have a lot of moving parts, so Etymolog gives you three ways to see what
                        they actually do before you commit.
                    </p>
                    <h3 className={styles.subhead}>Try a word &amp; outlines</h3>
                    <p>
                        Pick one of your words (or type IPA) in <em>Try a word</em>. Turn on
                        {' '}<em>Outlines</em> to see exactly how each block was built.
                    </p>
                    <GuideFigure
                        src={tryOutlines}
                        alt="Try a word with outlines on: two blocks with red block squares, dashed template boxes and cyan boxes showing where each sign landed."
                        caption="Outlines: red = the block square, dashed red = each template box, cyan = where the sign landed, blue = a sign drawn on its own."
                    />
                    <p>
                        If a sign floats small inside its box, the box is a different shape than the
                        sign; if a sign hangs outside the block, its box is set to Fill. The caption
                        under the preview also names any sign that fell back to its default form.
                    </p>
                    <h3 className={styles.subhead}>The block guide on the canvas</h3>
                    <p>
                        To draw a sign that fits a specific box, open the glyph editor and pick that box
                        from the <em>Block guide</em>. The canvas highlights the box so you draw to its
                        shape.
                    </p>
                    <GuideFigure
                        src={glyphGuide}
                        alt="The glyph canvas with a Block guide highlighting a tall narrow box in red so the sign is drawn to fit it."
                        caption="The block guide paints the target box on the canvas. Draw to fill the highlighted box."
                    />
                    <h3 className={styles.subhead}>Check all my words</h3>
                    <p>
                        <em>Check all my words</em> runs your current blocks over the whole lexicon and
                        lists anything that didn&apos;t come out cleanly — signs drawn on their own,
                        consonants with no vowel, or signs that couldn&apos;t be read — with a
                        {' '}<em>Try it</em> link to jump each one into the preview. It flags itself as
                        stale when you change a setting, so re-run it after edits.
                    </p>
                </>
            );
        default:
            return null;
    }
}
