/**
 * Reference bodies for the "Charts & keyboard" group: the IPA & syllabary
 * charts, and custom charts + punctuation.
 */

import GuideFigure from '../GuideFigure';
import styles from '../GuidePage.module.scss';

import ipaChart from '../../../../assets/guide/ref-ipa-chart.jpg';
import punctuation from '../../../../assets/guide/ref-punctuation.jpg';

export default function ChartsBody({ slug }: { slug: string }) {
    switch (slug) {
        case 'charts':
            return (
                <>
                    <p>
                        The charts lay your letters out on a grid of sounds so you can see what your
                        script covers and fill the gaps. Find them under <em>Script Maker → View
                        chart</em>.
                    </p>
                    <h3 className={styles.subhead}>IPA chart</h3>
                    <p>
                        The <em>IPA chart</em> is the standard consonant and vowel grid. Each cell is a
                        sound; a cell that a grapheme already spells is tinted.
                    </p>
                    <GuideFigure
                        src={ipaChart}
                        alt="The IPA pulmonic consonant chart, a grid of places and manners of articulation, with some cells tinted where a grapheme is assigned."
                        caption="The IPA consonant chart. Tinted cells already have a letter; a legend marks voiceless, voiced and impossible sounds."
                    />
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Click an assigned cell</strong> to jump straight to editing that
                            grapheme.
                        </li>
                        <li>
                            <strong>Click an empty cell</strong> to start a new grapheme with that sound
                            already filled in — the fastest way to build a script sound by sound.
                        </li>
                        <li>
                            The <strong>Flavour guide</strong> can shade the chart to show which sounds
                            fit a chosen style of language (shared with the word generator).
                        </li>
                    </ul>
                    <h3 className={styles.subhead}>Syllabary chart</h3>
                    <p>
                        The <em>Syllabary chart</em> is the same idea for a CV syllabary: a grid of
                        consonant rows by vowel columns, one cell per syllable. Click a cell to create
                        or edit the sign for that syllable. It pans and zooms, since a full syllabary
                        grid is large.
                    </p>
                </>
            );
        case 'custom-charts':
            return (
                <>
                    <h3 className={styles.subhead}>Custom charts</h3>
                    <p>
                        Not every script fits the IPA or CV grid. <em>Custom charts</em> (Script Maker →
                        View chart → Custom charts) let you define your own chart layout — your own
                        rows and columns — and assign graphemes to its cells, so you can lay a script
                        out however it makes sense to you. Create a chart, name its axes, and fill the
                        cells the same click-to-edit way as the built-in charts.
                    </p>
                    <h3 className={styles.subhead}>Punctuation</h3>
                    <p>
                        The <em>Punctuation</em> page decides how the in-between bits of writing are
                        drawn: sentence marks and the separators between words and lines.
                    </p>
                    <GuideFigure
                        src={punctuation}
                        alt="The punctuation page listing marks and word/sentence separators, each set to a grapheme, a virtual glyph, or nothing."
                        caption="For each mark or separator, choose its own sign, a placeholder, or nothing at all."
                    />
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Its own grapheme</strong> — draw or pick a sign for that mark (a
                            full stop, a word divider).
                        </li>
                        <li>
                            <strong>A virtual glyph</strong> — a dashed placeholder box, so you can see
                            where the mark goes before you design it.
                        </li>
                        <li>
                            <strong>Nothing</strong> — the mark leaves no sign (for example a script
                            that runs words together with no space).
                        </li>
                    </ul>
                    <p>
                        Changes here save immediately, and the word-separator choice ties into how
                        blocks split words (see the Blocks pages).
                    </p>
                </>
            );
        default:
            return null;
    }
}
