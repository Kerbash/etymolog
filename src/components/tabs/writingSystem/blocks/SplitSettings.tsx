/**
 * SplitSettings — the "Splitting words into blocks" section of the Blocks page
 * (SYLLABLE_BLOCKS_PLAN.md §4, DIPHTHONG_BLOCKS_PLAN.md §4.2).
 *
 * ```
 *  Splitting words into blocks
 *  ⓘ Your words are currently split by template order …   ← only while unset
 *  (•) By syllable  [Recommended]
 *      Each word is cut into syllables, and each syllable becomes one block.
 *      tapa → ta · pa
 *      [ ] Let a syllable start with s + another consonant (sp, st, str)
 *          Off: asta → as · ta. On: asta → a · sta.
 *      Vowels next to each other
 *        Two vowel signs in a row are usually two syllables (a · i). …
 *        [ai ×] [au ×]   [ type a vowel pair… ] [Add]
 *        Suggested from your word shapes: [+ ei]          ← only when any
 *        With ai: tai → tai. Without: tai → ta · i.
 *      Consonants that can carry a syllable
 *        A syllable usually needs a vowel. …
 *        [r ×]   [ type a consonant… ] [Add]
 *        Suggested from your signs: [+ l] [+ n]           ← only when any
 *        With r: krtek → kr · tek. Without: krtek → krtek.
 *      In a pronunciation, . forces a cut and ‿ forbids one …
 *  ( ) By template order
 *      Reads left to right and uses the first template that fits …
 *      tapa → tap · a
 * ```
 *
 * Controlled: the page passes the draft's `split` and receives the NEW split
 * (always in the normalised form, see `normalSplit`). No `split` stored means
 * template order — that is what the engine does, so that radio shows as
 * checked, and the note says so VISIBLY instead of silently switching an
 * existing scheme (pitfall P4). Picking either radio stores the mode —
 * including clicking the already-checked template-order radio while unset.
 *
 * "Vowels next to each other" lists the vowel pairs the language says as one
 * vowel (`split.diphthongs`); "Consonants that can carry a syllable" lists the
 * consonants that stand in for a vowel when none is beside them
 * (`split.syllabicConsonants`, CONLANG_EDGES_PLAN.md §5.1). Both are
 * `SoundList`s. Every change — the radios and the checkbox included — passes
 * BOTH current lists through `normalSplit`, so toggling another option never
 * drops either (P-C1). Suggestions are buttons; nothing is added by itself
 * (P4).
 *
 * Plain words only: no phonology terms in anything the user sees (P3).
 */

import { useId } from 'react';

import type { BlockSplit } from '../../../../blocks';
import { diphthongExample, isSingleConsonant, isVowelSequence, syllabicExample } from './diphthongSuggestions';
import { normalSplit, splitModeOf } from './schemeOptions';
import SoundList from './SoundList';

import pageStyles from './blocksPage.module.scss';
import styles from './settings.module.scss';

export interface SplitSettingsProps {
    /** The draft scheme's `split`; absent = not chosen yet (template order). */
    split: BlockSplit | undefined;
    /** Vowel pairs found in the word shapes (`suggestDiphthongs`); offered as buttons. */
    suggestions: readonly string[];
    /** Consonants among the signs' sounds that could carry a syllable (`suggestSyllabicConsonants`). */
    syllabicSuggestions: readonly string[];
    /** The new, normalised split. */
    onChange: (split: BlockSplit) => void;
}

/** The example shown while no vowel pair is listed. */
const FALLBACK_EXAMPLE = 'ai';
/** The example shown while no consonant is listed. */
const FALLBACK_SYLLABIC_EXAMPLE = 'r';

export default function SplitSettings({ split, suggestions, syllabicSuggestions, onChange }: SplitSettingsProps) {
    const idPrefix = useId();
    const titleId = `${idPrefix}-title`;
    const radioName = `${idPrefix}-mode`;

    const chosen = splitModeOf({ split });
    const bySyllable = chosen === 'syllables';
    const sibilantClusters = split?.sibilantClusters === true;
    const diphthongs = split?.diphthongs ?? [];
    const syllabicConsonants = split?.syllabicConsonants ?? [];

    const pairExampleEntry = diphthongs[0] ?? FALLBACK_EXAMPLE;
    const pairExample = diphthongExample(pairExampleEntry);
    const consonantExampleEntry = syllabicConsonants[0] ?? FALLBACK_SYLLABIC_EXAMPLE;
    const consonantExample = syllabicExample(consonantExampleEntry);

    return (
        <section className={pageStyles.section} aria-labelledby={titleId} data-split-settings="">
            <div className={pageStyles.sectionHeader}>
                <h3 id={titleId} className={pageStyles.sectionTitle}>
                    Splitting words into blocks
                </h3>
            </div>

            {chosen === 'unset' && (
                <p className={styles.note} data-split-unset-note="">
                    Your words are currently split by template order, the way earlier versions did. Most scripts
                    read better split by syllable.
                </p>
            )}

            <div className={styles.options} role="radiogroup" aria-labelledby={titleId}>
                <label className={styles.option}>
                    <input
                        type="radio"
                        name={radioName}
                        value="syllables"
                        checked={bySyllable}
                        onChange={() => onChange(normalSplit('syllables', sibilantClusters, diphthongs, syllabicConsonants))}
                    />
                    <span className={styles.optionText}>
                        <span className={styles.optionName}>
                            By syllable
                            <span className={styles.recommended}>Recommended</span>
                        </span>
                        <span className={styles.optionDescription}>
                            Each word is cut into syllables, and each syllable becomes one block.
                        </span>
                        <span className={styles.example}>
                            <em>tapa</em> → ta · pa
                        </span>
                    </span>
                </label>

                {bySyllable && (
                    <div className={styles.subOptions}>
                        <label className={styles.checkbox}>
                            <input
                                type="checkbox"
                                checked={sibilantClusters}
                                onChange={(event) =>
                                    onChange(
                                        normalSplit('syllables', event.target.checked, diphthongs, syllabicConsonants),
                                    )
                                }
                            />
                            <span className={styles.optionText}>
                                <span className={styles.optionDescription}>
                                    Let a syllable start with s + another consonant (sp, st, str)
                                </span>
                                <span className={styles.example}>
                                    Off: <em>asta</em> → as · ta. On: <em>asta</em> → a · sta.
                                </span>
                            </span>
                        </label>

                        <SoundList
                            dataPrefix="diphthong"
                            title="Vowels next to each other"
                            description={
                                <>
                                    Two vowel signs in a row are usually two syllables (a · i). List the vowel pairs
                                    your language says as one vowel, and they stay in one block.
                                </>
                            }
                            list={diphthongs}
                            suggestions={suggestions}
                            suggestionsLabel="Suggested from your word shapes:"
                            inputLabel="Vowel pair"
                            placeholder="type a vowel pair…"
                            listLabel="Vowel pairs kept together"
                            noun="A vowel pair"
                            warn={(entry) =>
                                isVowelSequence(entry) ? null : (
                                    <>
                                        <em>{entry}</em> is not two vowels, so it will not join anything.
                                    </>
                                )
                            }
                            example={
                                <>
                                    With {pairExampleEntry}: <em>{pairExample.word}</em> → {pairExample.word}. Without:{' '}
                                    <em>{pairExample.word}</em> → {pairExample.apart}.
                                </>
                            }
                            onChange={(list) =>
                                onChange(normalSplit('syllables', sibilantClusters, list, syllabicConsonants))
                            }
                        />

                        <SoundList
                            dataPrefix="syllabic"
                            title="Consonants that can carry a syllable"
                            description={
                                <>
                                    A syllable usually needs a vowel. List the consonants that can stand in for one,
                                    and a word with no vowel between them (prst, vlk) is still cut into syllables. A
                                    listed consonant only counts when no vowel is next to it. A template needs a box
                                    that takes a consonant in the middle (a Core role of class R, or Anything) to draw
                                    such a syllable.
                                </>
                            }
                            list={syllabicConsonants}
                            suggestions={syllabicSuggestions}
                            suggestionsLabel="Suggested from your signs:"
                            inputLabel="Consonant"
                            placeholder="type a consonant…"
                            listLabel="Consonants that can carry a syllable"
                            noun="A consonant"
                            warn={(entry) =>
                                isSingleConsonant(entry) ? null : (
                                    <>
                                        <em>{entry}</em> is not one consonant, so it will not carry anything.
                                    </>
                                )
                            }
                            example={
                                <>
                                    With {consonantExampleEntry}: <em>{consonantExample.word}</em> →{' '}
                                    {consonantExample.apart}. Without: <em>{consonantExample.word}</em> →{' '}
                                    {consonantExample.word}.
                                </>
                            }
                            onChange={(list) => onChange(normalSplit('syllables', sibilantClusters, diphthongs, list))}
                        />

                        <span className={styles.example} data-split-marks-note="">
                            In a pronunciation, <code>.</code> forces a cut and <code>‿</code> forbids one:{' '}
                            <em>a‿i</em> stays in one block. Stress marks (ˈ ˌ) cut like <code>.</code> does.
                        </span>
                    </div>
                )}

                <label className={styles.option}>
                    <input
                        type="radio"
                        name={radioName}
                        value="templates"
                        checked={!bySyllable}
                        onChange={() => onChange(normalSplit('templates', false))}
                        // While unset this radio is already shown checked, so
                        // clicking it fires no change: store the choice anyway.
                        onClick={() => {
                            if (chosen === 'unset') onChange(normalSplit('templates', false));
                        }}
                    />
                    <span className={styles.optionText}>
                        <span className={styles.optionName}>By template order</span>
                        <span className={styles.optionDescription}>
                            Reads left to right and uses the first template that fits, as earlier versions did.
                        </span>
                        <span className={styles.example}>
                            <em>tapa</em> → tap · a
                        </span>
                    </span>
                </label>
            </div>
        </section>
    );
}
