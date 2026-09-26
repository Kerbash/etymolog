/**
 * Reference bodies for the "Tools & data" group: the word generator, the
 * translator, and export / import / backup.
 */

import GuideFigure from '../GuideFigure';
import styles from '../GuidePage.module.scss';

import genSounds from '../../../../assets/guide/ref-generator-sounds.jpg';
import genShape from '../../../../assets/guide/ref-generator-shape.jpg';
import genWords from '../../../../assets/guide/ref-generator-words.jpg';
import translator from '../../../../assets/guide/ref-translator.jpg';

export default function ToolsBody({ slug }: { slug: string }) {
    switch (slug) {
        case 'generator':
            return (
                <>
                    <p>
                        The <strong>word generator</strong> (<em>Lexicon → Generate</em>) invents words
                        that sound like they belong to your language. You describe the sound; it
                        produces candidates you can add to the lexicon. It works top to bottom through
                        four sections.
                    </p>
                    <h3 className={styles.subhead}>1. Flavour</h3>
                    <p>
                        Start from a <em>flavour</em> preset — a ready-made feel (harsh, flowing, and so
                        on). It seeds the sections below, which you can then adjust. The flavour is
                        shared with the charts&apos; guide overlay.
                    </p>
                    <h3 className={styles.subhead}>2. Sounds</h3>
                    <p>
                        Choose the inventory: use your script&apos;s own sounds, or list sounds
                        explicitly, and mark each as normal, common or rare to weight how often it
                        appears.
                    </p>
                    <GuideFigure
                        src={genSounds}
                        alt="The Sounds section of the generator, choosing the sound inventory and per-sound frequency."
                        caption="Sounds: the inventory to draw from, and how frequent each sound is."
                    />
                    <h3 className={styles.subhead}>3. Shape</h3>
                    <p>
                        Set the shape of a word: the syllable templates it may use (CV, CVC…), how many
                        syllables a word has, and how often long vowels occur.
                    </p>
                    <GuideFigure
                        src={genShape}
                        alt="The Shape section with syllable templates like CV and CVC and a syllables-per-word range."
                        caption="Shape: the syllable patterns and how many syllables a word runs to."
                    />
                    <h3 className={styles.subhead}>4. Constraints</h3>
                    <p>
                        Finally, tighten the rules: sonority, s+stop clusters, geminates, vowel harmony,
                        how many consonants may cluster, and specific forbidden sequences — so the output
                        avoids combinations your language wouldn&apos;t allow.
                    </p>
                    <h3 className={styles.subhead}>Results</h3>
                    <p>
                        Generate a batch, tick the words you like, and add them to the lexicon (or edit
                        one first). Your settings are saved as a profile, so the next batch keeps the
                        same feel.
                    </p>
                    <GuideFigure
                        src={genWords}
                        alt="The generated Words list with checkboxes and an Add selected button."
                        caption="Pick the ones you like and add them straight into your dictionary."
                    />
                </>
            );
        case 'translator':
            return (
                <>
                    <p>
                        The <strong>translator</strong> (<em>Translator</em> tab) turns typed text into
                        your script in real time — the quickest way to see a whole phrase written out, or
                        to produce an image of it.
                    </p>
                    <GuideFigure
                        src={translator}
                        alt="The translator: a text input, the phrase rendered in the invented script, layout controls and an export dropdown."
                        caption="Type on the left; the phrase renders in your script. Choose a layout, then export."
                    />
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Type text or IPA</strong> — it spells each word with your graphemes
                            (and blocks, if they&apos;re on) as you type.
                        </li>
                        <li>
                            <strong>Layout strategy</strong> — choose how the rendered text is arranged.
                        </li>
                        <li>
                            <strong>Export as SVG or PNG</strong> — save the rendered phrase as a vector
                            or image file to use elsewhere.
                        </li>
                    </ul>
                </>
            );
        case 'backup':
            return (
                <>
                    <p>
                        Your conlang is stored in your browser on this device, so it&apos;s worth
                        keeping a copy. The header&apos;s <em>Export</em> and <em>Import</em> menus do
                        that.
                    </p>
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Export as JSON</strong> — the whole conlang (glyphs, graphemes,
                            words, settings) in one file. This is your backup and the way to move a
                            conlang between devices.
                        </li>
                        <li>
                            <strong>Export as Image</strong> — the same data hidden inside a PNG, so a
                            single shareable picture also <em>is</em> the conlang: import that PNG and it
                            loads back.
                        </li>
                        <li>
                            <strong>Import</strong> — load a JSON or image file. Importing
                            {' '}<em>replaces</em> the current conlang, so export first if you want to
                            keep it; you&apos;ll get a short report of what was loaded.
                        </li>
                        <li>
                            <strong>New conlang</strong> — starts over with an empty conlang (after a
                            danger-toned confirmation). Export first — it cannot be undone.
                        </li>
                    </ul>
                    <p>
                        Etymolog is also an installable, offline-capable app (a PWA): a status line shows
                        when your work is saved, and updates apply on the next reload without disturbing
                        anything you&apos;re editing.
                    </p>
                    <h3 className={styles.subhead}>Install it as an app</h3>
                    <p>
                        Installing puts Etymolog in its own window (no browser bar), adds it to your
                        launcher or home screen, and lets it open even when you&apos;re offline. Your
                        conlang lives in that browser&apos;s storage either way — installing doesn&apos;t
                        move it, so keep exporting backups.
                    </p>
                    <ul className={styles.bullets}>
                        <li>
                            <strong>Desktop (Chrome / Edge)</strong> — click the install icon at the right
                            of the address bar (a small screen with a down-arrow), or open the browser menu
                            and choose <em>Install Etymolog…</em> / <em>Apps → Install this site as an app</em>.
                        </li>
                        <li>
                            <strong>Android (Chrome)</strong> — open the <em>⋮</em> menu and tap
                            {' '}<em>Install app</em> (or <em>Add to Home screen</em>).
                        </li>
                        <li>
                            <strong>iPhone / iPad (Safari)</strong> — tap the <em>Share</em> button, then
                            {' '}<em>Add to Home Screen</em>. On iOS this must be done from Safari.
                        </li>
                    </ul>
                    <p>
                        Once installed it launches like any other app and keeps working without a
                        connection.
                    </p>
                </>
            );
        default:
            return null;
    }
}
