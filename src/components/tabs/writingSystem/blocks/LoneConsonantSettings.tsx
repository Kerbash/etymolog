/**
 * LoneConsonantSettings — the "Consonants with no vowel" section of the Blocks
 * page (SYLLABLE_BLOCKS_PLAN.md §1.3, §4).
 *
 * ```
 *  Consonants with no vowel
 *  Sometimes a consonant has no vowel to join — like the s at the end of …
 *  ( ) Draw it on its own
 *      As now: the consonant stands by itself.
 *  (•) Add a vowel-killer mark
 *      A small mark you draw that says 'no vowel here', placed next to …
 *      [▣] Halant   [Change mark…]                     ← a mark is chosen
 *      Place the mark [Below the consonant ▾]
 *   or ⚠ The mark you chose was deleted — choose another.   [Choose mark…]
 *   or Draw the mark first: create a new grapheme …  (link) [Choose mark…]
 * ```
 *
 * Controlled by the draft's `leftovers`: absent = on its own. Picking "Add a
 * vowel-killer mark" before a mark exists stores NOTHING (there is no valid
 * `leftovers` without a grapheme) — the radio state is local until a mark is
 * chosen, which stores `{ markGraphemeId, placement: 'below' }` (keeping an
 * earlier placement). Back to "on its own" removes `leftovers`.
 *
 * The mark is chosen with the Script Maker's `GraphemePickerModal`, opened on
 * its "Marks" filter when the script has any mark (category `'mark'`), else on
 * "Word symbols" when it has any other no-sound grapheme, else on All; any
 * grapheme may still be chosen (a logogram works as a mark too). The modal is
 * mounted only while open, so its starting filter is decided afresh each time.
 * The "Draw the mark first" hint shows while the script has no no-sound
 * grapheme of either kind.
 *
 * Plain words only: no phonology terms in anything the user sees (P3).
 */

import { useId, useState } from 'react';
import { Link } from 'react-router-dom';

import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';

import { useEtymolog } from '../../../../db';
import type { BlockLeftovers, LeftoverPlacement } from '../../../../blocks';
import { GlyphSpellingDisplay } from '../../../display/spelling';
import { GraphemePickerModal, isLogogramGrapheme, isMarkGrapheme } from '../../../form/graphemeForm';
import { ROUTES, resolveUrl } from '../../../../url_mapping';

import pageStyles from './blocksPage.module.scss';
import styles from './settings.module.scss';

export interface LoneConsonantSettingsProps {
    /** The draft scheme's `leftovers`; absent = drawn on their own. */
    leftovers: BlockLeftovers | undefined;
    /** The new `leftovers`, or `null` to remove it. */
    onChange: (leftovers: BlockLeftovers | null) => void;
}

const PLACEMENTS: readonly { value: LeftoverPlacement; label: string }[] = [
    { value: 'below', label: 'Below the consonant' },
    { value: 'above', label: 'Above the consonant' },
    { value: 'after', label: 'After the consonant' },
    { value: 'before', label: 'Before the consonant' },
];

function isPlacement(value: string): value is LeftoverPlacement {
    return PLACEMENTS.some((p) => p.value === value);
}

export default function LoneConsonantSettings({ leftovers, onChange }: LoneConsonantSettingsProps) {
    const idPrefix = useId();
    const titleId = `${idPrefix}-title`;
    const radioName = `${idPrefix}-mode`;
    const placementId = `${idPrefix}-placement`;

    const { data } = useEtymolog();
    // Whole value read out first (P8).
    const graphemes = data.graphemesComplete ?? [];

    // "Add a mark" chosen while no mark exists yet: nothing valid to store, so
    // the choice lives here until a mark is picked.
    const [pendingMark, setPendingMark] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);

    // The stored mark went away (Discard, another tab): forget the local
    // choice too, so the radios show what the draft says. State-from-props
    // during render, as BlocksPage does for its base scheme.
    const [seenLeftovers, setSeenLeftovers] = useState(leftovers);
    if (seenLeftovers !== leftovers) {
        setSeenLeftovers(leftovers);
        if (!leftovers) setPendingMark(false);
    }

    const markOn = leftovers !== undefined || pendingMark;
    const mark = leftovers ? (graphemes.find((g) => g.id === leftovers.markGraphemeId) ?? null) : null;
    const markDeleted = leftovers !== undefined && mark === null;
    const hasMark = graphemes.some(isMarkGrapheme);
    const hasLogogram = graphemes.some(isLogogramGrapheme);
    const hasNoSoundGrapheme = hasMark || hasLogogram;

    const chooseMark = (graphemeId: number) => {
        onChange({ markGraphemeId: graphemeId, placement: leftovers?.placement ?? 'below' });
        setPendingMark(false);
    };

    return (
        <section className={pageStyles.section} aria-labelledby={titleId} data-lone-consonant-settings="">
            <div className={pageStyles.sectionHeader}>
                <h3 id={titleId} className={pageStyles.sectionTitle}>
                    Consonants with no vowel
                </h3>
            </div>
            <p className={pageStyles.hint}>
                Sometimes a consonant has no vowel to join — like the <em>s</em> at the end of <em>strengths</em>{' '}
                when no template fits it.
            </p>

            <div className={styles.options} role="radiogroup" aria-labelledby={titleId}>
                <label className={styles.option}>
                    <input
                        type="radio"
                        name={radioName}
                        value="alone"
                        checked={!markOn}
                        onChange={() => {
                            setPendingMark(false);
                            if (leftovers) onChange(null);
                        }}
                    />
                    <span className={styles.optionText}>
                        <span className={styles.optionName}>Draw it on its own</span>
                        <span className={styles.optionDescription}>As now: the consonant stands by itself.</span>
                    </span>
                </label>

                <label className={styles.option}>
                    <input
                        type="radio"
                        name={radioName}
                        value="mark"
                        checked={markOn}
                        onChange={() => setPendingMark(true)}
                    />
                    <span className={styles.optionText}>
                        <span className={styles.optionName}>Add a vowel-killer mark</span>
                        <span className={styles.optionDescription}>
                            A small mark you draw that says &lsquo;no vowel here&rsquo;, placed next to the consonant.
                        </span>
                    </span>
                </label>

                {markOn && (
                    <div className={styles.subOptions} data-mark-options="">
                        {mark && leftovers ? (
                            <>
                                <div className={styles.markRow}>
                                    <div className={styles.markPicture} role="img" aria-label={`Mark: ${mark.name}`}>
                                        <GlyphSpellingDisplay
                                            glyphs={mark.glyphs}
                                            strategy="ltr"
                                            config={{ glyphWidth: 40, glyphHeight: 40, spacing: 0, padding: 2 }}
                                            emptyContent={<span>—</span>}
                                        />
                                    </div>
                                    <span className={styles.markName} data-mark-name="">
                                        {mark.name}
                                    </span>
                                    <Button
                                        type="button"
                                        className={buttonStyles.secondary}
                                        onClick={() => setPickerOpen(true)}
                                    >
                                        Change mark…
                                    </Button>
                                </div>
                                <div className={`${pageStyles.field} ${styles.placementField}`}>
                                    <label htmlFor={placementId} className={pageStyles.fieldLabel}>
                                        Place the mark
                                    </label>
                                    <select
                                        id={placementId}
                                        className={pageStyles.select}
                                        value={leftovers.placement}
                                        onChange={(event) => {
                                            const placement = event.target.value;
                                            if (isPlacement(placement)) onChange({ ...leftovers, placement });
                                        }}
                                    >
                                        {PLACEMENTS.map((p) => (
                                            <option key={p.value} value={p.value}>
                                                {p.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        ) : (
                            <>
                                {markDeleted && (
                                    <p className={styles.warning} role="status" data-mark-deleted="">
                                        The mark you chose was deleted — choose another.
                                    </p>
                                )}
                                {!hasNoSoundGrapheme && (
                                    <p className={pageStyles.hint} data-no-mark-hint="">
                                        <Link className={styles.link} to={resolveUrl(ROUTES.scriptMakerCreate)}>
                                            Draw the mark first: create a new grapheme, tick &ldquo;No sound&rdquo; and
                                            choose &ldquo;A mark&rdquo;.
                                        </Link>
                                    </p>
                                )}
                                <div className={pageStyles.actions}>
                                    <Button
                                        type="button"
                                        className={buttonStyles.secondary}
                                        onClick={() => setPickerOpen(true)}
                                        disabled={graphemes.length === 0}
                                    >
                                        Choose mark…
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {pickerOpen && (
                <GraphemePickerModal
                    isOpen
                    setIsOpen={setPickerOpen}
                    title="Choose the vowel-killer mark"
                    defaultFilter={hasMark ? 'marks' : hasLogogram ? 'logograms' : 'all'}
                    onSelect={(grapheme) => chooseMark(grapheme.id)}
                />
            )}
        </section>
    );
}
