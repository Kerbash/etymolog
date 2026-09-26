/**
 * Reference bodies for the "Words & meanings" group: adding a word, meanings,
 * spelling & logograms, organizing the lexicon, and etymology.
 */

import GuideFigure from '../GuideFigure';
import styles from '../GuidePage.module.scss';

import wordForm from '../../../../assets/guide/ref-word-form.jpg';
import meanings from '../../../../assets/guide/ref-meanings.jpg';
import spelling from '../../../../assets/guide/ref-spelling.jpg';
import logogramTab from '../../../../assets/guide/logogram-1-tab.jpg';
import wordDetail from '../../../../assets/guide/ref-word-detail.jpg';
import ancestry from '../../../../assets/guide/ref-ancestry.jpg';
import etymologyTree from '../../../../assets/guide/ref-etymology-tree.jpg';

export default function WordsBody({ slug }: { slug: string }) {
    switch (slug) {
        case 'lexicon-add':
            return (
                <>
                    <p>
                        The <strong>Lexicon</strong> is your dictionary. Press <em>New word</em> to open
                        the word form, which has four numbered sections: <em>Basic information</em>,
                        {' '}<em>Meanings</em>, <em>Spelling</em> and <em>Etymology</em>.
                    </p>
                    <GuideFigure
                        src={wordForm}
                        alt="The Basic information section of the word form, with the pronunciation field and the Native / Auto-spell choice."
                        caption="Basic information: the pronunciation, and whether the word is spelled automatically or by hand."
                    />
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Pronunciation</strong> is the heart of a word — type it in IPA. It
                            drives auto-spelling and is what the charts and generator speak in.
                        </li>
                        <li>
                            <strong>Auto-spell vs Native</strong> — leave auto-spell on and Etymolog
                            spells the word from its pronunciation using your graphemes. Switch to native
                            if you want to lay the signs out by hand (see <em>Spelling &amp; logograms</em>).
                        </li>
                    </ul>
                    <p>The other three sections are covered on the next pages.</p>
                </>
            );
        case 'lexicon-meanings':
            return (
                <>
                    <p>
                        A word can carry several senses. The <strong>Meanings</strong> table holds one
                        row per sense.
                    </p>
                    <GuideFigure
                        src={meanings}
                        alt="The Meanings table with columns for the meaning, part of speech and usage notes, and a button to add a row."
                        caption="One row per sense: a meaning, its part of speech, and optional usage notes."
                    />
                    <ul className={styles.bullets}>
                        <li><strong>Meaning</strong> — the gloss (what the word means).</li>
                        <li><strong>Part of speech</strong> — noun, verb, and so on.</li>
                        <li><strong>Usage notes</strong> — register, connotation, or when to use it.</li>
                        <li>Add a row for each additional sense; a word with one meaning just needs one.</li>
                    </ul>
                </>
            );
        case 'lexicon-spelling':
            return (
                <>
                    <p>
                        The <strong>Spelling</strong> section is how the word is written in your script.
                        Most of the time auto-spell fills it from the pronunciation and you never touch
                        it; when you want control, you compose it by hand.
                    </p>
                    <GuideFigure
                        src={spelling}
                        alt="The Spelling section showing the word composed from graphemes on the glyph canvas."
                        caption="The word, composed from your graphemes. Auto-spell keeps this in sync with the pronunciation."
                    />
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Compose from graphemes</strong> — the default tab. Auto-spell reads
                            the pronunciation and writes it; you can also insert or reorder signs
                            yourself.
                        </li>
                        <li>
                            <strong>Logogram</strong> — the other tab, for giving the whole word a single
                            symbol instead of spelling it out.
                        </li>
                    </ul>
                    <GuideFigure
                        src={logogramTab}
                        alt="The Logogram tab with Use existing and Draw new options, and buttons to choose a grapheme or a glyph."
                        caption="The Logogram tab: one symbol for the whole word — draw new, or reuse an existing grapheme or glyph."
                    />
                    <p>
                        A logogram is an ordinary grapheme underneath (category <em>logogram</em>, no
                        sound), so it also appears in the Script Maker and the glyph keyboard. See the
                        Logogram walk-through for the full flow.
                    </p>
                </>
            );
        case 'lexicon-organizing':
            return (
                <>
                    <p>
                        As the lexicon grows, a few tools keep it manageable.
                    </p>
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Folders</strong> — the same folder system as glyphs and graphemes.
                            Group words into folders, drag between them, and search across all of them.
                        </li>
                        <li>
                            <strong>Word origin filter</strong> — narrow the list to native words,
                            borrowings, and so on.
                        </li>
                        <li>
                            <strong>Sort &amp; view</strong> — order by pronunciation or lemma, and
                            switch between list and grid.
                        </li>
                    </ul>
                    <p>
                        Click a word to open its <strong>page</strong>, which shows the spelling, every
                        meaning, and the etymology tree, with actions to edit, move to a folder, or
                        delete it.
                    </p>
                    <GuideFigure
                        src={wordDetail}
                        alt="A word's detail page showing its pronunciation and spelling in the script."
                        caption="The word page: the word in your script, its meanings, and where it came from."
                    />
                </>
            );
        case 'etymology':
            return (
                <>
                    <p>
                        Etymolog tracks where words come from. In the word form&apos;s
                        {' '}<strong>Etymology</strong> section you link a word to its ancestors.
                    </p>
                    <GuideFigure
                        src={ancestry}
                        alt="The Etymology section of the word form, adding an ancestor with a relationship type."
                        caption="Link a word to its ancestors, each with a relationship type."
                    />
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Relationship types</strong> — <em>derived</em> (grew from an earlier
                            form), <em>borrowed</em> (taken from another language), <em>compound</em>
                            {' '}and <em>blend</em> (built from two or more words), <em>calque</em> (a
                            loan-translation), or <em>other</em>.
                        </li>
                        <li>
                            <strong>Cycle-safe</strong> — Etymolog stops you making a word its own
                            ancestor.
                        </li>
                    </ul>
                    <p>
                        The word&apos;s page then draws a <strong>family tree</strong> of how it connects
                        to the rest of your vocabulary.
                    </p>
                    <GuideFigure
                        src={etymologyTree}
                        alt="A word's etymology section showing a tree of derived and borrowed ancestors."
                        caption="The family tree, grown from the relationships you record."
                    />
                </>
            );
        default:
            return null;
    }
}
