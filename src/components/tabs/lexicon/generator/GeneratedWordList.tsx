/**
 * GeneratedWordList — the right-hand column: a batch, and what to do with it.
 *
 * ```
 *  Batch 3f2a91c · 20 words · seed 1059236497
 *  ⚠ 18 of 20 — 340 candidates were built and rejected, mostly by your forbidden sequences.
 *  ☑ ta·ki·no      𝔤𝔩𝔶𝔭𝔥𝔰            [Edit & add] [Copy]
 *  ☐ so·nu         𝔤𝔩𝔶𝔭𝔥𝔰            [Edit & add] [Copy]
 *  [Add 1 selected] [Regenerate] [Same seed] [Copy all]
 * ```
 *
 * The batch itself is computed by the page (a `useMemo` over the profile, the
 * inventory and the seed); this component owns only what the user does to it —
 * which rows are selected, and which have already been added.
 *
 * THE ADD LOOP is written around two rules that this app has broken before:
 *
 *  - **One refresh for the whole batch**, via `batchMutations`. `api.lexicon.create`
 *    is a synchronous SQLite transaction and the context refreshes the lexicon
 *    after each successful one, so a batch of 100 re-read the entire lexicon
 *    100 times (the N+1 refresh bug class). Wrapping the loop coalesces those
 *    into a single `lexicon.getAllComplete()` when the batch closes — and it is
 *    the CONTEXT that does the coalescing, so nothing here has to know which
 *    slice a create touches or remember to refresh it by hand.
 *  - **One toast for the whole batch**, listing the failures. `useApiAction`
 *    is deliberately NOT used here: it reports per call, which for a batch of
 *    100 means 100 notices in a queue that shows one at a time.
 *
 * Each word is created with `auto_spell: true` AND an explicit `glyph_order`
 * built from the same preview the row is showing — `createLexicon` does not
 * auto-spell, it stores what it is given, so a word added without the
 * `glyph_order` would land in the lexicon with no spelling at all.
 *
 * @module tabs/lexicon/generator/GeneratedWordList
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { Link } from 'react-router-dom';

import NotificationBanner from 'cyber-components/interactable/information/notificationBanner';

import { useEtymolog } from '../../../../db';
import type {
    AutoSpellResultExtended,
    GraphemeComplete,
    SpellingDisplayEntry,
} from '../../../../db/types';
import { autoSpellToGlyphOrder, type SpellingEntry } from '../../../../db/utils/spellingUtils';
import type { GeneratedBatch } from '../../../../generator';
import { ROUTES } from '../../../../url_mapping';
import GlyphSpellingDisplay from '../../../display/spelling/GlyphSpellingDisplay';
import { useNotify } from '../../../shared';
import { SYLLABLE_SEPARATOR, describeShortfall } from './generatorText';

import styles from './generator.module.scss';

/** The spelling preview is a thumbnail, not a canvas: small, fixed, unclipped. */
const PREVIEW_CONFIG = { glyphWidth: 24, glyphHeight: 24, spacing: 1, padding: 0 } as const;

/** Everything the list needs to know about one generated word's spelling. */
interface WordPreview {
    /** For `GlyphSpellingDisplay` — real graphemes and IPA fallbacks in one list. */
    entries: SpellingDisplayEntry[];
    /** For `api.lexicon.create` — the same spelling in storage form. */
    glyphOrder: SpellingEntry[];
}

/**
 * Turn an auto-spell result into the display shape.
 *
 * `SpellingDisplayEntry[]` rather than ids plus a glyph map: it is the shape
 * the lexicon cards already use, the normaliser expands a multi-glyph grapheme
 * from it correctly, and an `ipa` entry becomes a virtual glyph — which is how
 * the IPA-chart cells render a sound the script has no grapheme for.
 */
function toDisplayEntries(
    result: AutoSpellResultExtended,
    graphemeMap: ReadonlyMap<number, GraphemeComplete>,
): SpellingDisplayEntry[] {
    const entries: SpellingDisplayEntry[] = [];
    const ordered = [...result.spelling].sort((a, b) => a.position - b.position);

    for (const entry of ordered) {
        const position = entries.length;
        if (entry.isVirtual) {
            if (entry.ipaCharacter) {
                entries.push({ type: 'ipa', position, ipaCharacter: entry.ipaCharacter });
            }
            continue;
        }
        const grapheme = graphemeMap.get(entry.grapheme_id);
        if (grapheme) entries.push({ type: 'grapheme', position, grapheme });
    }

    return entries;
}

export interface GeneratedWordListProps {
    batch: GeneratedBatch;
    /** Grapheme lookup for the spelling previews. */
    graphemeMap: Map<number, GraphemeComplete>;
    /** Throw the batch away and roll a new seed. */
    onRegenerate: () => void;
    /** Run the SAME seed again — the way to see a profile change on the same words. */
    onRerun: () => void;
}

export default function GeneratedWordList({
    batch,
    graphemeMap,
    onRegenerate,
    onRerun,
}: GeneratedWordListProps) {
    const { api, batchMutations } = useEtymolog();
    const notify = useNotify();

    const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
    /**
     * Words this page has already put in the lexicon.
     *
     * Kept locally as well as being deduplicated by the engine on the next
     * batch, because the row has to leave the list the moment it is added —
     * waiting for the context to come back round would leave a word the user
     * can add twice.
     */
    const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set());
    /**
     * The same set, kept SYNCHRONOUSLY — the double-click guard.
     *
     * A double-click (or a click plus Enter on the still-focused button) can
     * reach the handler twice before React has re-rendered with the state the
     * first call set: both calls then read the same `added` and the same
     * `selected` from their closure, and the whole selection is created a
     * second time — duplicate words in the lexicon from one gesture. A ref is
     * what a render cannot be late for. A `useState` "is adding" flag cannot
     * close this: the whole loop is synchronous, so it would be set and cleared
     * inside one call and no render would ever observe it as true.
     */
    const addedRef = useRef<Set<string>>(new Set());

    /**
     * One auto-spell per word, per batch.
     *
     * Memoised on the words (and the grapheme map, which is what the display
     * entries resolve against): auto-spelling is a DP walk over the whole
     * pronunciation, and doing it per render would run it on every keystroke
     * anywhere on the page.
     */
    const previews = useMemo(() => {
        const map = new Map<string, WordPreview>();
        for (const word of batch.words) {
            if (map.has(word.ipa)) continue;
            const response = api.lexicon.previewAutoSpelling(word.ipa);
            const result = response.success ? response.data : undefined;
            map.set(word.ipa, {
                entries: result ? toDisplayEntries(result, graphemeMap) : [],
                glyphOrder: result ? autoSpellToGlyphOrder(result.spelling) : [],
            });
        }
        return map;
    }, [batch.words, api, graphemeMap]);

    const visible = useMemo(
        () => batch.words.filter((word) => !added.has(word.ipa)),
        [batch.words, added],
    );

    const selectedCount = useMemo(
        () => visible.filter((word) => selected.has(word.ipa)).length,
        [visible, selected],
    );

    const toggle = useCallback((ipa: string) => {
        setSelected((current) => {
            const next = new Set(current);
            if (!next.delete(ipa)) next.add(ipa);
            return next;
        });
    }, []);

    const toggleAll = useCallback(() => {
        setSelected((current) => {
            const allSelected = visible.length > 0 && visible.every((word) => current.has(word.ipa));
            return allSelected ? new Set<string>() : new Set(visible.map((word) => word.ipa));
        });
    }, [visible]);

    /**
     * Copy, when there is a clipboard.
     *
     * `navigator.clipboard` is absent over plain http, in some embedded
     * browsers and in the test environment — a bare call there throws inside a
     * click handler and takes the page down with it.
     */
    const copy = useCallback(
        (text: string, what: string) => {
            const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
            if (!clipboard?.writeText) {
                notify.warning('This browser will not let the page use the clipboard.', {
                    title: 'Could not copy',
                });
                return;
            }
            void clipboard
                .writeText(text)
                .then(() => notify.success(`Copied ${what}.`))
                .catch(() => notify.warning('Could not copy to the clipboard.'));
        },
        [notify],
    );

    const addSelected = useCallback(() => {
        const chosen = visible.filter(
            (word) => selected.has(word.ipa) && !addedRef.current.has(word.ipa),
        );
        if (chosen.length === 0) return;

        const succeeded: string[] = [];
        const failed: string[] = [];

        // ONE refresh for the whole loop. The context records the slice each
        // successful create touches and re-reads it once, when this returns.
        batchMutations(() => {
            for (const word of chosen) {
                const preview = previews.get(word.ipa);
                // Claimed BEFORE the call, so a second pass through this
                // handler in the same tick finds nothing left to do. Released
                // again below if the create did not actually land, so a failure
                // stays retryable.
                addedRef.current.add(word.ipa);
                try {
                    const response = api.lexicon.create({
                        pronunciation: word.ipa,
                        is_native: true,
                        auto_spell: true,
                        // `createLexicon` stores what it is given and does not
                        // auto-spell; without this the word arrives unspelt.
                        glyph_order: preview?.glyphOrder ?? [],
                    });
                    if (response.success) {
                        succeeded.push(word.ipa);
                    } else {
                        addedRef.current.delete(word.ipa);
                        failed.push(word.ipa);
                    }
                } catch {
                    addedRef.current.delete(word.ipa);
                    failed.push(word.ipa);
                }
            }
        });

        if (succeeded.length > 0) {
            const done = new Set(succeeded);
            setAdded((current) => new Set([...current, ...done]));
            setSelected((current) => new Set([...current].filter((ipa) => !done.has(ipa))));
            notify.success(
                `Added ${succeeded.length} word${succeeded.length === 1 ? '' : 's'} to the lexicon.`,
            );
        }
        if (failed.length > 0) {
            notify.warning(failed.join(', '), {
                title: `${failed.length} word${failed.length === 1 ? '' : 's'} could not be added`,
            });
        }
    }, [visible, selected, previews, api, batchMutations, notify]);

    const allSelected = visible.length > 0 && selectedCount === visible.length;

    return (
        <>
            <p className={styles.batchMeta}>
                <span>{`${visible.length} word${visible.length === 1 ? '' : 's'}`}</span>
                <span aria-hidden="true">·</span>
                {/* The seed names the batch: "seed 1059236497, word 3" is
                    enough to reproduce a word exactly, on any machine. */}
                <span className={styles.seed}>{`seed ${batch.seed}`}</span>
            </p>

            {batch.shortfall && (
                <NotificationBanner
                    visible
                    severity="warning"
                    title="Fewer words than asked for"
                    message={describeShortfall(batch.shortfall, batch.words.length, batch.requested)}
                    // The banner is `position: fixed` by default (it is normally
                    // a toast). An inline explanation has to sit with the list
                    // it is about, and an inline style is the only override
                    // that reliably beats the component's own stylesheet.
                    parts={{
                        root: {
                            style: {
                                position: 'static',
                                maxWidth: '100%',
                                marginInline: 0,
                                width: '100%',
                            },
                        },
                    }}
                />
            )}

            {batch.warnings.length > 0 && (
                <ul className={styles.warnings}>
                    {batch.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                    ))}
                </ul>
            )}

            {visible.length === 0 ? (
                <p className={styles.sectionHint}>
                    No words in this batch. Loosen a constraint, add sounds, or generate again.
                </p>
            ) : (
                <ul className={styles.wordList}>
                    {visible.map((word) => {
                        const isSelected = selected.has(word.ipa);
                        const preview = previews.get(word.ipa);
                        return (
                            <li
                                key={word.ipa}
                                className={classNames(styles.wordRow, {
                                    [styles.wordRowSelected]: isSelected,
                                })}
                            >
                                <input
                                    type="checkbox"
                                    className={styles.wordCheckbox}
                                    checked={isSelected}
                                    onChange={() => toggle(word.ipa)}
                                    aria-label={`Select ${word.ipa}`}
                                />
                                <span className={styles.wordIpa}>
                                    {word.syllables.join(SYLLABLE_SEPARATOR)}
                                </span>
                                {preview && preview.entries.length > 0 && (
                                    <span className={styles.wordSpelling} aria-hidden="true">
                                        <GlyphSpellingDisplay
                                            glyphs={preview.entries}
                                            graphemeMap={graphemeMap}
                                            strategy="ltr"
                                            config={PREVIEW_CONFIG}
                                        />
                                    </span>
                                )}
                                <span className={styles.wordActions}>
                                    <Link
                                        className={styles.ghostButton}
                                        to={`${ROUTES.lexiconCreate}?pronunciation=${encodeURIComponent(word.ipa)}`}
                                    >
                                        Edit &amp; add
                                    </Link>
                                    <button
                                        type="button"
                                        className={styles.ghostButton}
                                        onClick={() => copy(word.ipa, word.ipa)}
                                        aria-label={`Copy ${word.ipa}`}
                                    >
                                        Copy
                                    </button>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className={styles.footer}>
                <button
                    type="button"
                    className={styles.inlineButton}
                    disabled={selectedCount === 0}
                    onClick={addSelected}
                >
                    {`Add ${selectedCount} selected`}
                </button>
                <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={toggleAll}
                    disabled={visible.length === 0}
                >
                    {allSelected ? 'Clear selection' : 'Select all'}
                </button>
                <button type="button" className={styles.ghostButton} onClick={onRegenerate}>
                    Regenerate
                </button>
                <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={onRerun}
                    title="Run this seed again — useful after changing the profile"
                >
                    Same seed
                </button>
                <button
                    type="button"
                    className={styles.ghostButton}
                    disabled={visible.length === 0}
                    onClick={() => copy(visible.map((word) => word.ipa).join('\n'), 'every word')}
                >
                    Copy all
                </button>
            </div>
        </>
    );
}
