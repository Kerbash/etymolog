/**
 * Reference bodies for the "Designing signs" group: drawing glyphs, importing &
 * organizing them, building graphemes, pronunciation & auto-spelling, and
 * alternate forms / variant groups. One component, switching on the slug.
 */

import GuideFigure from '../GuideFigure';
import styles from '../GuidePage.module.scss';

import drawingCanvas from '../../../../assets/guide/ref-drawing-canvas.jpg';
import imageImport from '../../../../assets/guide/ref-image-import.jpg';
import folders from '../../../../assets/guide/ref-folders.jpg';
import graphemeForm from '../../../../assets/guide/alphabet-2-grapheme-form.jpg';

export default function SignsBody({ slug }: { slug: string }) {
    switch (slug) {
        case 'drawing-glyphs':
            return (
                <>
                    <p>
                        A <strong>glyph</strong> is one drawn mark — the smallest unit in Etymolog. It
                        has no sound on its own; you combine glyphs into graphemes (letters) later.
                        Draw them in <em>Script Maker → Glyphs → New glyph</em>.
                    </p>
                    <GuideFigure
                        src={drawingCanvas}
                        alt="The glyph drawing canvas with pen, square, circle, select and eraser tools, a size slider, a faint guide square, and undo/redo/clear."
                        caption="The drawing canvas: tools along the top, the guide square in the middle, undo / redo / clear below."
                    />
                    <p className={styles.pipeline}>
                        <strong>The tools:</strong> <em>Pen</em> for freehand strokes, <em>Square</em>
                        {' '}and <em>Circle</em> for shapes, <em>Select</em> to move or resize a mark,
                        {' '}and <em>Eraser</em> to remove one. The <em>Size</em> slider sets the pen
                        width. <em>Undo</em>, <em>Redo</em> and <em>Clear</em> are along the bottom.
                    </p>
                    <ul className={styles.bullets}>
                        <li>
                            <strong>The guide square</strong> is the box in the middle. It is the space
                            your glyph <em>reserves</em> in a word — draw the body of the sign inside
                            it. The margin around it is shared space a tail or accent may reach into; a
                            neighbouring letter can overlap there.
                        </li>
                        <li>
                            <strong>One colour only.</strong> Glyphs are drawn in a single ink that
                            follows the theme (so they stay visible in light and dark mode); there is
                            no colour picker by design.
                        </li>
                        <li>
                            <strong>Touch-friendly.</strong> The canvas works with a mouse, a finger or
                            a stylus.
                        </li>
                    </ul>
                </>
            );
        case 'importing-signs':
            return (
                <>
                    <p>
                        You don&apos;t have to draw everything by hand — you can bring a sign in from
                        an image, and keep a growing script tidy with folders.
                    </p>
                    <h3 className={styles.subhead}>Import from an image</h3>
                    <p>
                        On the glyph editor, use <em>Import image…</em> (or drop a file). PNG, JPEG,
                        WebP, GIF and SVG are accepted.
                    </p>
                    <GuideFigure
                        src={imageImport}
                        alt="The image import control: an Import image button, a drop zone, and a Keep original colors toggle."
                        caption="Import a sign from a picture. By default it becomes theme-following line art."
                    />
                    <ul className={styles.bullets}>
                        <li>
                            By default the image is traced into <strong>line art</strong> in the one
                            theme ink, so it adapts to light and dark mode like a drawn glyph.
                        </li>
                        <li>
                            Turn on <strong>Keep original colours</strong> to embed the picture as-is —
                            useful for a logo or emblem, but it will not adapt to dark mode.
                        </li>
                    </ul>
                    <h3 className={styles.subhead}>Folders</h3>
                    <p>
                        Glyphs, graphemes and lexicon words all share the same folder system. Use
                        {' '}<em>New folder</em>, drag items in, or <em>move to folder</em> from an
                        item&apos;s menu. Search looks across every folder.
                    </p>
                    <GuideFigure
                        src={folders}
                        alt="A gallery with an All folders bar, a New folder button, a search box and a grid of signs."
                        caption="Every gallery has folders, a breadcrumb and a search box. Search escapes folders and looks everywhere."
                    />
                </>
            );
        case 'graphemes':
            return (
                <>
                    <p>
                        A <strong>grapheme</strong> is a letter of your script: one or more glyphs,
                        plus the sound(s) it spells. This is the unit words are actually written with.
                        Create one in <em>Script Maker → Graphemes → New grapheme</em>.
                    </p>
                    <GuideFigure
                        src={graphemeForm}
                        alt="The grapheme form: Glyphs (default form), Other forms, Details (name, category, notes) and Pronunciation."
                        caption="The grapheme form. The default form is the glyph list; details name and categorize it; pronunciation gives it sound."
                    />
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Glyphs (default form)</strong> — press <em>Add new glyph</em> to
                            draw one, or <em>Select existing glyph</em> to reuse one. Add several and
                            reorder them to build a letter out of parts (a base plus an accent, say);
                            they are drawn as a row.
                        </li>
                        <li>
                            <strong>Details</strong> — a <em>name</em> (required), an optional
                            {' '}<em>category</em> to group letters (Vowels, Consonants, Numbers…), and
                            free <em>notes</em>.
                        </li>
                        <li>
                            <strong>Pronunciation</strong> gives the letter its sound — covered on the
                            next page.
                        </li>
                    </ul>
                    <p>
                        Editing a grapheme later updates every word that uses it, everywhere it is
                        drawn.
                    </p>
                </>
            );
        case 'pronunciation':
            return (
                <>
                    <p>
                        A grapheme&apos;s <strong>Pronunciation</strong> rows are what let Etymolog
                        spell words for you. Each row is a sound this letter can write.
                    </p>
                    <GuideFigure
                        src={graphemeForm}
                        alt="The grapheme form, highlighting the Pronunciation section with a row and a Use in auto-spelling toggle."
                        caption="Pronunciation rows sit at the bottom of the grapheme form."
                    />
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Use in auto-spelling</strong> — leave this on for a normal letter.
                            When you type a word&apos;s pronunciation, Etymolog matches these sounds and
                            writes the letter automatically. Turn it off for a sound the letter
                            <em> can</em> represent but that you don&apos;t want auto-spelling to pick.
                        </li>
                        <li>
                            <strong>Add a row</strong> (the <em>+</em>) when one letter spells more than
                            one sound.
                        </li>
                        <li>
                            <strong>No sound / marks</strong> — tick <em>No sound</em> for a sign that
                            isn&apos;t pronounced, such as a diacritic or a block <em>mark</em>. Such a
                            sign never appears in auto-spelling; you place it deliberately.
                        </li>
                        <li>
                            <strong>Logogram</strong> is a category for a sign that stands for a whole
                            word rather than a sound — see the Logogram walk-through, or the Spelling
                            page under Words.
                        </li>
                    </ul>
                </>
            );
        case 'variant-forms':
            return (
                <>
                    <p>
                        One letter can have several shapes. The <strong>default form</strong> is the
                        glyph list at the top of the grapheme form; <strong>Other forms</strong> are
                        alternates — a narrow shape for the side of a block, an initial vs. final form,
                        a stylistic swash.
                    </p>
                    <GuideFigure
                        src={graphemeForm}
                        alt="The grapheme form showing the Other forms section with Add a form and Manage groups buttons."
                        caption="Other forms live just under the default form. Each alternate has a name and a variant group."
                    />
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Add a form</strong> to draw an alternate shape for the same letter —
                            it keeps the same sound, so nothing about spelling changes.
                        </li>
                        <li>
                            <strong>Variant groups</strong> name the <em>kinds</em> of alternate (for
                            example &ldquo;Tall&rdquo; and &ldquo;Flat&rdquo;). Manage them with
                            {' '}<em>Manage groups…</em>, then tag each alternate form with a group.
                        </li>
                        <li>
                            <strong>How blocks use them:</strong> a block template slot can ask for a
                            particular group, and every letter drawn in that slot uses its form from
                            that group (or its default when it has none). That is how one block shape
                            can pull the &ldquo;Tall&rdquo; form of whatever consonant lands in it.
                        </li>
                        <li>
                            <strong>Make default</strong> swaps an alternate into the default slot if
                            you change your mind about the main shape.
                        </li>
                    </ul>
                </>
            );
        default:
            return null;
    }
}
