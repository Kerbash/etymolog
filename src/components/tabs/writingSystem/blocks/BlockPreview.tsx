/**
 * BlockPreview — the TemplateEditor's live preview.
 *
 * Renders a real spelling with the DRAFT scheme (the edited template applied,
 * forced on — see `previewScheme`), so the user sees their actual glyphs move
 * while they drag rectangles, before anything is saved:
 *
 * ```
 *  [kata ▾]  [or type IPA…]
 *  ┌──────────────────────────┐
 *  │        ▟▙  ▟▙            │   ← GlyphSpellingDisplay, blockScheme={draft}
 *  └──────────────────────────┘
 *  ka · ta · k → 2 blocks: CV, CV · 1 consonant with a vowel-killer mark
 * ```
 *
 * "Outlines" overlays each block's square, template boxes and where each
 * sign's ink landed (`display/spelling/blockOutlines.ts`) — the way to see why
 * a sign is drawn smaller than expected. Remembered per device, shared by every
 * preview.
 *
 * The word choice and the typed IPA are internal state by default
 * (TemplateEditor); the Blocks page's "Try a word" CONTROLS both (`wordId`,
 * `ipa` + their change callbacks), so "Check all my words" can put a word here.
 *
 * Two sources, typed IPA winning while it is non-empty:
 *  - a lexicon word → its stored `spellingDisplay`;
 *  - typed IPA → spelled from the script's graphemes in memory
 *    (`autoSpellMappingsFromGraphemes` + `generateSpellingWithFallback` +
 *    `autoSpellToDisplayEntries`, the translator's funnel), no DB write.
 *
 * The caption comes from `summarizeBlocks`, which runs the SAME segmenter the
 * renderer does, so it cannot name a template the picture did not use. After
 * the readout it lists only the parts that are not zero (blocks, signs on
 * their own, consonants with the mark); "No template matched" appears only
 * when no block was made AND some sign is drawn on its own — a word whose
 * every consonant carries the vowel-killer mark is working as designed, not
 * failing, so it must not read as an error.
 */

import { useId, useMemo, useState } from 'react';

import { useEtymolog } from '../../../../db';
import { autoSpellMappingsFromGraphemes, generateSpellingWithFallback } from '../../../../db/autoSpellService';
import { autoSpellToDisplayEntries } from '../../../../db/phraseService';
import type { SpellingDisplayEntry } from '../../../../db/types';
import type { BlockScheme } from '../../../../blocks';
import { GlyphSpellingDisplay } from '../../../display/spelling';
import { setBlockOutlines, useBlockOutlines } from '../../../display/spelling/blockOutlines';
import { summarizeBlocks } from './blockSchemeDraft';
import type { BlockUsageSummary } from './blockSchemeDraft';

import styles from './blocksPage.module.scss';

export interface BlockPreviewProps {
    /** The scheme to render with (the draft, edited template applied, enabled). */
    scheme: BlockScheme;
    /** Rendered glyph size in px. */
    glyphSize?: number;
    /**
     * CONTROLLED word choice (the Blocks page's "Try a word", so "Check all my
     * words" can put a word here). Given ⇒ it wins over the internal choice;
     * `null` ⇒ the first spelled word. Omitted ⇒ uncontrolled (TemplateEditor).
     */
    wordId?: number | null;
    /** CONTROLLED typed IPA. Given ⇒ it wins over the internal text. */
    ipa?: string;
    /** Called with the picked word id (controlled or not). */
    onWordChange?: (wordId: number) => void;
    /** Called with the typed IPA (controlled or not). */
    onIpaChange?: (ipa: string) => void;
}

const EMPTY_ENTRIES: SpellingDisplayEntry[] = [];

/** `1 block` / `2 blocks`. */
function counted(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`;
}

/** The caption for a non-empty spelling: the readout, then every non-zero part. */
function summaryCaption(summary: BlockUsageSummary): string {
    const parts: string[] = [];
    if (summary.blocks.length > 0) {
        parts.push(`${counted(summary.blocks.length, 'block', 'blocks')}: ${summary.blocks.map((b) => b.name).join(', ')}`);
    } else if (summary.singles > 0) {
        // Only a sign left bare means the templates did not fit.
        parts.push('No template matched');
    }
    if (summary.singles > 0) {
        parts.push(`${counted(summary.singles, 'sign', 'signs')} on ${summary.singles === 1 ? 'its' : 'their'} own`);
    }
    if (summary.lone > 0) {
        parts.push(`${counted(summary.lone, 'consonant', 'consonants')} with a vowel-killer mark`);
    }
    // Nothing drawable at all (only separators, say): there is no split to show.
    if (parts.length === 0) return 'Nothing to show.';
    // The split itself first, so the user sees WHERE the word was cut.
    return `${summary.readout} → ${parts.join(' · ')}`;
}

export default function BlockPreview({
    scheme,
    glyphSize = 72,
    wordId,
    ipa: ipaProp,
    onWordChange,
    onIpaChange,
}: BlockPreviewProps) {
    const { data } = useEtymolog();
    const idPrefix = useId();
    const outlines = useBlockOutlines();
    // Whole values read out first (P8).
    const lexicon = data.lexiconComplete;
    const graphemeMap = data.graphemeMap;
    const variantGroups = data.variantGroups;
    const groupNames = useMemo(() => new Map(variantGroups.map((g) => [g.id, g.name])), [variantGroups]);

    const words = useMemo(() => lexicon.filter((word) => word.spellingDisplay.length > 0), [lexicon]);
    const [ownWordId, setOwnWordId] = useState<number | null>(null);
    const [ownIpa, setOwnIpa] = useState('');
    // Controlled props win over the internal state when given.
    const chosenWordId = wordId !== undefined ? wordId : ownWordId;
    const ipa = ipaProp !== undefined ? ipaProp : ownIpa;
    const chooseWord = (id: number) => {
        setOwnWordId(id);
        onWordChange?.(id);
    };
    const typeIpa = (value: string) => {
        setOwnIpa(value);
        onIpaChange?.(value);
    };

    // The chosen word, or the first spelled word when nothing (or a word that
    // has since been deleted) is chosen.
    const word = words.find((w) => w.id === chosenWordId) ?? words[0] ?? null;

    const mappings = useMemo(() => autoSpellMappingsFromGraphemes(graphemeMap.values()), [graphemeMap]);

    const typed = ipa.trim();
    const entries = useMemo<SpellingDisplayEntry[]>(() => {
        if (typed) {
            const result = generateSpellingWithFallback(typed, mappings);
            return result.success || result.spelling.length > 0
                ? autoSpellToDisplayEntries(result, graphemeMap).entries
                : EMPTY_ENTRIES;
        }
        return word ? word.spellingDisplay : EMPTY_ENTRIES;
    }, [typed, mappings, graphemeMap, word]);

    const summary = useMemo(
        () => summarizeBlocks(entries, scheme, graphemeMap, groupNames),
        [entries, scheme, graphemeMap, groupNames],
    );

    let caption: string;
    if (entries.length === 0) {
        caption = words.length === 0 && !typed ? 'Add a word to the lexicon, or type some IPA, to see a preview.' : 'Nothing to show.';
    } else {
        caption = summaryCaption(summary);
    }
    // A sign that fell back to its default form in a slot drawn for a group.
    const missingNotes = summary.missingForms.map(({ sign, group }) => (group === null
        ? `${sign}: this slot's form group was deleted, so it draws its default form`
        : `${sign} has no “${group}” form, so it draws its default`));

    return (
        <div className={styles.preview}>
            <span className={styles.fieldLabel} id={`${idPrefix}-title`}>
                Live preview
            </span>
            <div className={styles.previewControls}>
                <select
                    className={styles.select}
                    aria-label="Word to preview"
                    value={word ? String(word.id) : ''}
                    disabled={words.length === 0 || typed.length > 0}
                    onChange={(event) => chooseWord(Number(event.target.value))}
                >
                    {words.length === 0 && <option value="">No spelled words yet</option>}
                    {words.map((w) => (
                        <option key={w.id} value={String(w.id)}>
                            {w.pronunciation || w.lemma}
                        </option>
                    ))}
                </select>
                <input
                    className={styles.input}
                    value={ipa}
                    placeholder="or type IPA…"
                    aria-label="IPA to preview"
                    onChange={(event) => typeIpa(event.target.value)}
                />
                <label className={styles.toggle} data-block-outlines-toggle="">
                    <input
                        type="checkbox"
                        role="switch"
                        checked={outlines}
                        onChange={(event) => setBlockOutlines(event.target.checked)}
                    />
                    Outlines
                </label>
            </div>
            <div className={styles.previewStage} aria-labelledby={`${idPrefix}-title`} data-block-preview="">
                <GlyphSpellingDisplay
                    glyphs={entries}
                    blockScheme={scheme}
                    graphemeMap={graphemeMap}
                    glyphEmPx={glyphSize}
                    fit="shrink"
                    showBlockOutlines={outlines}
                    emptyContent={<span className={styles.muted}>—</span>}
                />
            </div>
            {outlines && (
                <ul className={styles.outlineLegend} aria-label="Outline key" data-outline-legend="">
                    <li><span className={styles.keyBlock} aria-hidden="true" />Block square</li>
                    <li><span className={styles.keyBox} aria-hidden="true" />Template box</li>
                    <li><span className={styles.keyInk} aria-hidden="true" />Where the sign landed</li>
                    <li><span className={styles.keySingle} aria-hidden="true" />Sign on its own (no block)</li>
                </ul>
            )}
            <p className={styles.caption} aria-live="polite">
                {caption}
            </p>
            {missingNotes.length > 0 && (
                <ul className={styles.caption} data-testid="preview-missing-forms">
                    {missingNotes.map((note) => (
                        <li key={note}>{note}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}
