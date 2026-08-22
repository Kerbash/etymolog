/**
 * WordGeneratorPage — `/lexicon/generate`.
 *
 * ```
 *  ← Lexicon
 *  Word generator                         [ 20 ▾ ] [ Generate ]
 *  ┌ SOUNDS ─┬ SHAPES ─┬ WORDS IN LEXICON ┐
 *  ┌──────────────────────────┐ ┌─────────────────────────────────────┐
 *  │ 01 Flavour               │ │ 20 words · seed 1059236497          │
 *  │ 02 Sounds                │ │ ☐ ta·ki·no  𝔤𝔩𝔶𝔭𝔥𝔰  [Edit & add]      │
 *  │ 03 Shape                 │ │ …                                    │
 *  │ 04 Constraints           │ │ [Add 0 selected] [Regenerate] …      │
 *  └──────────────────────────┘ └─────────────────────────────────────┘
 * ```
 *
 * **The page holds almost no state.** The profile lives in settings (every
 * change persists as it is made — this is the `WritingSystemPage` pattern, not
 * a form, and the SmartForm exemption is deliberate: there is nothing to
 * submit). The words are a `useMemo` over the profile, the inventory, the seed
 * and the batch size. Two things are genuinely page state and nothing else is:
 * the seed and how many words to ask for.
 *
 * Because the batch is DERIVED, changing a switch re-rolls the same seed
 * through the new rules and the effect of the change is visible immediately.
 * The memo is keyed on those five values and NOT on the settings object: the
 * context re-renders when the persistence status ticks, and a batch keyed on
 * `settings` would silently regenerate under the user every few seconds.
 *
 * There is no `useRegisterUnsaved` here, and that is not an oversight — the
 * page has nothing unsaved. The one thing on this path that CAN be lost is the
 * word form the "Edit & add" link opens, and that registers itself.
 *
 * @module tabs/lexicon/generator/WordGeneratorPage
 */

import { useCallback, useId, useMemo, useRef, useState } from 'react';

import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';
import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton.tsx';
import EmptyState from 'cyber-components/display/emptyState';
import NumberedSectionHeader from 'cyber-components/graphics/decor/numbered-section-header';
import type { QuickFact } from 'cyber-components/display/quickFactsRow';

import { useEtymolog } from '../../../../db';
import type { GraphemeComplete } from '../../../../db/types';
import { generateWords, randomSeed } from '../../../../generator';
import { ROUTES } from '../../../../url_mapping';
import { LoadingState, PageHeader } from '../../../shared';
import ConstraintsEditor from './ConstraintsEditor';
import GeneratedWordList from './GeneratedWordList';
import InventoryEditor from './InventoryEditor';
import PresetPicker from './PresetPicker';
import ShapeEditor from './ShapeEditor';
import { BATCH_SIZES, DEFAULT_BATCH_SIZE } from './generatorText';
import { useGeneratorProfile } from './useGeneratorProfile';

import styles from './generator.module.scss';

export default function WordGeneratorPage() {
    const { data, isReady, error } = useEtymolog();
    const sectionId = useId();
    const flavourRef = useRef<HTMLElement>(null);

    const {
        profile,
        preset,
        usesScriptSounds,
        conlangPhonemes,
        inventory,
        existingPronunciations,
        updateProfile,
        updateProfileDebounced,
        flushProfile,
        choosePreset,
    } = useGeneratorProfile();

    /**
     * The seed, and how many times it has been asked for.
     *
     * `run` is not decoration: the batch is a pure function of its inputs, so
     * "Same seed" — show me THESE words under the rules I just changed — has
     * nothing to change and the memo would never re-run. Bumping a counter
     * inside the same state object gives the request a dependency. It rides
     * WITH the seed rather than beside it because the two are always set
     * together, and two `useState`s would be two renders per click.
     */
    const [seedState, setSeedState] = useState(() => ({ value: randomSeed(), run: 0 }));
    const [count, setCount] = useState(DEFAULT_BATCH_SIZE);

    const reseed = useCallback(
        () => setSeedState((current) => ({ value: randomSeed(), run: current.run + 1 })),
        [],
    );
    const rerun = useCallback(
        () => setSeedState((current) => ({ ...current, run: current.run + 1 })),
        [],
    );

    const graphemeMap = useMemo(
        (): Map<number, GraphemeComplete> =>
            new Map((data.graphemesComplete ?? []).map((grapheme) => [grapheme.id, grapheme])),
        [data.graphemesComplete],
    );

    const batch = useMemo(() => {
        const { value: seed } = seedState;
        return generateWords(profile, inventory, {
            count,
            seed,
            existing: existingPronunciations,
        });
    }, [profile, inventory, count, seedState, existingPronunciations]);

    /**
     * A remount key for the results.
     *
     * Selection is about THESE words; when the batch changes underneath (a new
     * seed, a different size, a rule that changed the output) the selection is
     * meaningless and the "already added" set with it. Deriving the key from
     * the batch's own identity is what keeps the two in step without an effect
     * that clears state — the bug class the redesign removed.
     */
    const batchKey = `${batch.seed}:${batch.requested}:${batch.words.length}:${batch.words[0]?.ipa ?? ''}`;

    const facts = useMemo<QuickFact[]>(
        () => [
            { label: 'Sounds', value: inventory.members.length, big: true },
            { label: 'Shapes', value: profile.syllables.length, big: true },
            { label: 'Words in lexicon', value: (data.lexiconComplete ?? []).length },
        ],
        [inventory.members.length, profile.syllables.length, data.lexiconComplete],
    );

    const handleChoosePreset = useCallback(
        (id: string | null) => {
            // "Custom" clears the provenance label and nothing else: the
            // profile in front of the user IS their custom one.
            if (id === null) updateProfile({ presetId: null });
            else choosePreset(id);
        },
        [choosePreset, updateProfile],
    );

    const handlePickFlavour = useCallback(() => {
        // Focus rather than scroll: focusing brings the element into view in
        // every browser, and it leaves the keyboard where the eye went.
        const radio = flavourRef.current?.querySelector<HTMLInputElement>('input[type="radio"]');
        radio?.focus();
    }, []);

    const title = 'Word generator';

    if (!isReady && !error) {
        return (
            <>
                <PageHeader title={title} back={{ to: ROUTES.lexicon, label: 'Lexicon' }} />
                <LoadingState variant="form" label="Loading the word generator" count={4} />
            </>
        );
    }

    if (error) {
        return (
            <EmptyState
                icon="exclamation-triangle"
                title="The database could not be opened"
                description={error.message}
                action={
                    <Button as="a" href={ROUTES.lexicon} className={buttonStyles.secondary}>
                        Back to Lexicon
                    </Button>
                }
            />
        );
    }

    return (
        <>
            <PageHeader
                title={title}
                description="Build candidate words from your sounds, then keep the ones you like."
                back={{ to: ROUTES.lexicon, label: 'Lexicon' }}
                facts={facts}
                actions={
                    <span className={styles.headerActions}>
                        <label className={styles.fieldLabel} htmlFor={`${sectionId}-count`}>
                            Words
                        </label>
                        <select
                            id={`${sectionId}-count`}
                            className={styles.select}
                            value={count}
                            onChange={(event) => setCount(Number(event.target.value))}
                        >
                            {BATCH_SIZES.map((size) => (
                                <option key={size} value={size}>
                                    {size}
                                </option>
                            ))}
                        </select>
                        <IconButton
                            iconName="shuffle"
                            className={buttonStyles.primary}
                            onClick={reseed}
                        >
                            Generate
                        </IconButton>
                    </span>
                }
            />

            <div className={styles.layout}>
                <div className={styles.column}>
                    <section
                        className={styles.section}
                        aria-labelledby={`${sectionId}-flavour`}
                        ref={flavourRef}
                    >
                        <NumberedSectionHeader
                            number="01"
                            title="Flavour"
                            // The component renders an <h2>; this page's
                            // PageHeader owns the h2, so sections are level 3.
                            parts={{ title: { id: `${sectionId}-flavour`, 'aria-level': 3 } }}
                        />
                        <PresetPicker
                            preset={preset}
                            conlangPhonemes={conlangPhonemes}
                            onChoose={handleChoosePreset}
                        />
                    </section>

                    <section className={styles.section} aria-labelledby={`${sectionId}-sounds`}>
                        <NumberedSectionHeader
                            number="02"
                            title="Sounds"
                            parts={{ title: { id: `${sectionId}-sounds`, 'aria-level': 3 } }}
                        />
                        <InventoryEditor
                            profile={profile}
                            inventory={inventory}
                            usesScriptSounds={usesScriptSounds}
                            onUpdate={updateProfile}
                            onPickFlavour={handlePickFlavour}
                        />
                    </section>

                    <section className={styles.section} aria-labelledby={`${sectionId}-shape`}>
                        <NumberedSectionHeader
                            number="03"
                            title="Shape"
                            parts={{ title: { id: `${sectionId}-shape`, 'aria-level': 3 } }}
                        />
                        <ShapeEditor
                            profile={profile}
                            onUpdate={updateProfile}
                            onUpdateDebounced={updateProfileDebounced}
                            onFlush={flushProfile}
                        />
                    </section>

                    <section
                        className={styles.section}
                        aria-labelledby={`${sectionId}-constraints`}
                    >
                        <NumberedSectionHeader
                            number="04"
                            title="Constraints"
                            parts={{ title: { id: `${sectionId}-constraints`, 'aria-level': 3 } }}
                        />
                        <ConstraintsEditor
                            profile={profile}
                            onUpdate={updateProfile}
                            onUpdateDebounced={updateProfileDebounced}
                            onFlush={flushProfile}
                        />
                    </section>
                </div>

                <div className={styles.column}>
                    <section
                        className={`${styles.section} ${styles.results}`}
                        aria-labelledby={`${sectionId}-results`}
                    >
                        <NumberedSectionHeader
                            number="05"
                            title="Words"
                            parts={{ title: { id: `${sectionId}-results`, 'aria-level': 3 } }}
                        />
                        <GeneratedWordList
                            key={batchKey}
                            batch={batch}
                            graphemeMap={graphemeMap}
                            onRegenerate={reseed}
                            onRerun={rerun}
                        />
                    </section>
                </div>
            </div>
        </>
    );
}
