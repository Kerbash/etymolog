/**
 * Reference bodies for the "Writing system" group: writing direction, and
 * letter & word spacing.
 */

import GuideFigure from '../GuideFigure';
import styles from '../GuidePage.module.scss';

import spacing from '../../../../assets/guide/ref-spacing.jpg';

export default function WritingBody({ slug }: { slug: string }) {
    switch (slug) {
        case 'direction':
            return (
                <>
                    <p>
                        <em>Writing System → Direction</em> sets how your script flows. The rules are
                        grouped by scope — a sign within a word, words along a line, and lines down the
                        page — and apply to every word Etymolog draws.
                    </p>
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Glyph direction</strong> — which way the signs of one word run:
                            left-to-right (like Latin), right-to-left (like Arabic), or top-to-bottom.
                        </li>
                        <li>
                            <strong>Word order</strong> — the direction words are placed along a line.
                        </li>
                        <li>
                            <strong>Line progression</strong> — which way new lines stack (downward, or
                            the other options for vertical scripts).
                        </li>
                        <li>
                            <strong>Wrap</strong> — whether a long line breaks onto the next line.
                        </li>
                        <li>
                            <strong>Baseline</strong> — how signs of different heights line up.
                        </li>
                    </ul>
                    <p>
                        Some combinations contradict each other (for example a vertical glyph direction
                        with a conflicting line progression). When that happens Etymolog shows a live
                        warning so you can pick a consistent set. Left-to-right is the default, so a new
                        script needs nothing here until you want something different.
                    </p>
                </>
            );
        case 'spacing':
            return (
                <>
                    <p>
                        The <em>Spacing</em> section (on the Writing System page, and repeated on the
                        Blocks page) controls the gaps in your writing. Both settings apply to the whole
                        script and save immediately.
                    </p>
                    <GuideFigure
                        src={spacing}
                        alt="The Spacing settings: a letter spacing selector and a word separation selector."
                        caption="Letter spacing and word separation, applied across the whole script."
                    />
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Letter spacing</strong> — how far apart consecutive signs (or
                            blocks) sit within a word, from <em>None (touching)</em> up through
                            {' '}<em>Wide</em>. <em>Auto</em> keeps each view&apos;s built-in spacing, so
                            you only override it when you want a specific look.
                        </li>
                        <li>
                            <strong>Word separation</strong> — how one word is divided from the next: a
                            {' '}<em>space</em>, a chosen <em>glyph</em> (an interpunct or divider), or
                            {' '}<em>nothing</em> (words run straight on). With blocks on, &ldquo;nothing&rdquo;
                            still keeps a block from spanning two words.
                        </li>
                    </ul>
                </>
            );
        default:
            return null;
    }
}
