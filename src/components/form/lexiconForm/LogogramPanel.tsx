/**
 * LogogramPanel
 * -------------
 * The word form's "Logogram" spelling tab: ONE symbol that writes the whole
 * word. It is a dedicated front end, not a separate system — underneath, a
 * logogram is an ordinary grapheme (category `'logogram'`, one glyph, no
 * sound), so it shows up in the Script Maker, in the glyph keyboard, in
 * export/import and in every spelling render exactly like any other grapheme.
 *
 * Three ways to get one, all ending in `glyph_order = ["grapheme-<id>"]`:
 *
 *  - **Use an existing grapheme** — the word points straight at it. Nothing
 *    is created; editing that grapheme later (in the Script Maker) updates
 *    every word that uses it, which is the point of a shared logogram.
 *  - **Use an existing glyph** — on save the glyph is wrapped in a logogram
 *    grapheme, or the one that already wraps it on its own is reused.
 *  - **Draw new** — on save the drawing becomes a new glyph + logogram
 *    grapheme named after the word.
 *
 * The panel only edits LOCAL state (the tab, the chosen grapheme/glyph, the
 * drawing); the word editor turns it into the right create/update on submit.
 */

import { useMemo, useState } from 'react';
import classNames from 'classnames';
import DOMPurify from 'dompurify';
import { Link } from 'react-router-dom';

import Button, { buttonStyles } from 'cyber-components/interactable/buttons/button';
import HoverToolTip from 'cyber-components/interactable/information/hoverToolTip/hoverToolTip.tsx';
import SvgDrawerInput from 'smart-form/input/basic/svgDrawerInput/svgDrawerInput.tsx';
import type { registerFieldReturnType } from 'smart-form/types';

import { useEtymolog, type Glyph, type LexiconComplete } from '../../../db';
import { WORD_SYMBOL_CATEGORY } from '../../../db/wordSymbolService';
import { existingLogogramForGlyph, isImageImportSvg } from './logogramUtils';
import { createGraphemeEntry, deserializeGlyphOrder } from '../../../db/utils/spellingUtils';
import { GLYPH_GUIDE_INSET } from '../../../db/utils/glyphMetrics';
import { ROUTES, resolveUrl } from '../../../url_mapping';
import { normalizeToRenderable } from '../customInput/glyphCanvasInput/utils';
import { GlyphPickerModal, GraphemePickerModal } from '../graphemeForm';
import { GLYPH_INK } from '../glyphForm/glyphInk';
import { GlyphImageImport, GlyphImagePreview, type GlyphImportMode } from '../glyphImport';

import formStyles from './LexiconFormFields.module.scss';
import styles from './LogogramPanel.module.scss';

/** Where the logogram comes from when it already exists in the script. */
export type LogogramChoice =
    | { kind: 'grapheme'; graphemeId: number }
    | { kind: 'glyph'; glyphId: number };

/** The two sub-tabs of the Logogram panel. */
export type LogogramTab = 'existing' | 'draw';

export interface LogogramPanelProps {
    tab: LogogramTab;
    onTabChange: (tab: LogogramTab) => void;
    /** The chosen existing grapheme/glyph (Use existing). */
    choice: LogogramChoice | null;
    onChoiceChange: (choice: LogogramChoice | null) => void;
    /** The drawing or imported image (Draw new); null when blank. */
    drawSvg: string | null;
    onDraw: (svg: string | null) => void;
    onImport: (svg: string, mode: GlyphImportMode) => void;
    onClearImport: () => void;
    /** The SmartForm field the drawing canvas binds to. */
    drawField: registerFieldReturnType;
    /** The name a new logogram would get (the word's display name). */
    wordName: string;
    /** The word being edited, so its own use is not counted as "another word". */
    currentWordId?: number;
    /** Whether the word has a pronunciation or meaning to be named by. */
    hasNameSource: boolean;
}

/** How many OTHER words spell with `graphemeId` anywhere in their spelling. */
function countWordsUsingGrapheme(
    lexicon: readonly LexiconComplete[],
    graphemeId: number | undefined,
    currentWordId: number | undefined,
): number {
    if (graphemeId === undefined) return 0;
    const entry = createGraphemeEntry(graphemeId);
    return lexicon.filter((w) =>
        w.id !== currentWordId && deserializeGlyphOrder(w.glyph_order).includes(entry),
    ).length;
}

/** Classify an image-import SVG for the preview caption. */
function detectImportMode(svg: string): GlyphImportMode {
    return /<mask[\s>]/i.test(svg) && /currentColor/i.test(svg) ? 'line-art' : 'keep-colors';
}

function SymbolPreview({ svg, label }: { svg: string; label: string }) {
    const safe = useMemo(
        () => DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }),
        [svg],
    );
    return (
        <div
            className={styles.symbol}
            role="img"
            aria-label={label}
            dangerouslySetInnerHTML={{ __html: safe }}
        />
    );
}

export default function LogogramPanel({
    tab,
    onTabChange,
    choice,
    onChoiceChange,
    drawSvg,
    onDraw,
    onImport,
    onClearImport,
    drawField,
    wordName,
    currentWordId,
    hasNameSource,
}: LogogramPanelProps) {
    const { data } = useEtymolog();
    const graphemes = useMemo(() => data.graphemesComplete ?? [], [data.graphemesComplete]);
    const glyphs = useMemo(() => data.glyphsWithUsage ?? [], [data.glyphsWithUsage]);
    const lexicon = useMemo(() => data.lexiconComplete ?? [], [data.lexiconComplete]);

    const [graphemePickerOpen, setGraphemePickerOpen] = useState(false);
    const [glyphPickerOpen, setGlyphPickerOpen] = useState(false);

    const chosenGrapheme = choice?.kind === 'grapheme'
        ? graphemes.find((g) => g.id === choice.graphemeId) ?? null
        : null;
    const chosenGlyph: Glyph | null = choice?.kind === 'glyph'
        ? glyphs.find((g) => g.id === choice.glyphId) ?? null
        : null;
    const reusedForGlyph = chosenGlyph ? existingLogogramForGlyph(graphemes, chosenGlyph.id) : null;

    // No manual memo: the React compiler memoises this itself, and a hand
    // dependency list on derived values is exactly what it refuses to preserve.
    const countedGraphemeId = chosenGrapheme ? chosenGrapheme.id : reusedForGlyph ? reusedForGlyph.id : undefined;
    /** Other words spelled with exactly this grapheme somewhere in their spelling. */
    const otherWordCount = countWordsUsingGrapheme(lexicon, countedGraphemeId, currentWordId);

    const newName = wordName.trim() || 'this word';

    return (
        <div className={styles.panel}>
            <p className={formStyles.symbolHelp}>
                A logogram is ONE symbol that writes the whole word. It is a normal grapheme in your
                script (category &ldquo;{WORD_SYMBOL_CATEGORY}&rdquo;, no sound), so it also appears in
                the Script Maker and in the glyph keyboard.
            </p>

            <div className={formStyles.segmented} role="group" aria-label="Where the logogram comes from">
                <button
                    type="button"
                    className={classNames(formStyles.segment, { [formStyles.segmentActive]: tab === 'existing' })}
                    aria-pressed={tab === 'existing'}
                    onClick={() => onTabChange('existing')}
                >
                    Use existing
                </button>
                <button
                    type="button"
                    className={classNames(formStyles.segment, { [formStyles.segmentActive]: tab === 'draw' })}
                    aria-pressed={tab === 'draw'}
                    onClick={() => onTabChange('draw')}
                >
                    Draw new
                </button>
            </div>

            {tab === 'existing' ? (
                <div className={styles.existing}>
                    {(chosenGrapheme || chosenGlyph) ? (
                        <div className={styles.choiceCard} aria-live="polite">
                            <SymbolPreview
                                svg={chosenGrapheme
                                    ? normalizeToRenderable(chosenGrapheme).svg_data
                                    : chosenGlyph!.svg_data}
                                label={`Logogram: ${(chosenGrapheme ?? chosenGlyph)!.name}`}
                            />
                            <div className={styles.choiceText}>
                                <span className={styles.choiceName}>{(chosenGrapheme ?? chosenGlyph)!.name}</span>
                                <span className={styles.choiceMeta}>
                                    {chosenGrapheme
                                        ? `Grapheme${chosenGrapheme.phonemes.length === 0 ? ' (logogram)' : ''}`
                                        : reusedForGlyph
                                            ? `Glyph, already the logogram “${reusedForGlyph.name}”, which will be reused`
                                            : `Glyph. Saving wraps it in a new logogram grapheme named “${newName}”`}
                                </span>
                                {otherWordCount > 0 && (
                                    <span className={styles.choiceMeta}>
                                        Also used by {otherWordCount} other word{otherWordCount === 1 ? '' : 's'}.
                                        Editing it in the Script Maker changes {otherWordCount === 1 ? 'both' : 'all of them'}.
                                    </span>
                                )}
                            </div>
                            <div className={styles.choiceActions}>
                                <Button
                                    type="button"
                                    themeType="basic"
                                    className={buttonStyles.secondary}
                                    onClick={() => (chosenGrapheme ? setGraphemePickerOpen(true) : setGlyphPickerOpen(true))}
                                >
                                    Change
                                </Button>
                                <HoverToolTip content="Open it in the Script Maker to change its drawing or details">
                                    <Link
                                        className={styles.scriptMakerLink}
                                        to={chosenGrapheme
                                            ? resolveUrl(ROUTES.graphemeEdit, { id: chosenGrapheme.id })
                                            : resolveUrl(ROUTES.glyphEdit, { id: chosenGlyph!.id })}
                                    >
                                        Edit in Script Maker
                                    </Link>
                                </HoverToolTip>
                                <Button
                                    type="button"
                                    themeType="basic"
                                    className={buttonStyles.secondary}
                                    onClick={() => onChoiceChange(null)}
                                >
                                    Remove
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <p className={styles.nothingChosen}>
                            {choice
                                ? 'The logogram this word used no longer exists. Choose another one.'
                                : 'Pick the grapheme or glyph that writes this word.'}
                        </p>
                    )}

                    {/* Once something is chosen, "Change" on its card replaces these. */}
                    {!(chosenGrapheme || chosenGlyph) && (
                        <div className={styles.pickButtons}>
                            <Button
                                type="button"
                                themeType="basic"
                                className={buttonStyles.secondary}
                                onClick={() => setGraphemePickerOpen(true)}
                                disabled={graphemes.length === 0}
                            >
                                Choose a grapheme…
                            </Button>
                            <Button
                                type="button"
                                themeType="basic"
                                className={buttonStyles.secondary}
                                onClick={() => setGlyphPickerOpen(true)}
                                disabled={glyphs.length === 0}
                            >
                                Choose a glyph…
                            </Button>
                        </div>
                    )}
                    {graphemes.length === 0 && glyphs.length === 0 && (
                        <p className={styles.nothingChosen}>
                            Your script has no glyphs or graphemes yet. Use &ldquo;Draw new&rdquo; to make this
                            word&rsquo;s logogram.
                        </p>
                    )}
                </div>
            ) : (
                <div className={styles.draw}>
                    <p className={formStyles.symbolHelp}>
                        Saving turns this drawing into a new glyph and a logogram grapheme named
                        &ldquo;{newName}&rdquo;, which you can reuse for other words.
                        {!hasNameSource && ' Give the word a meaning (or a pronunciation) above so the logogram can be named.'}
                    </p>

                    {/* `fit-content` + `max-width: 100%`: the drawer has a hard
                        ~366px minimum (a 300px canvas + padding). The old 320px
                        cap cut its toolbar off; now it keeps its natural width
                        and only scrolls inside its own panel on a phone. */}
                    <div className={styles.drawerField}>
                        {isImageImportSvg(drawSvg) ? (
                            <GlyphImagePreview
                                svg={drawSvg!}
                                mode={detectImportMode(drawSvg!)}
                                onClear={onClearImport}
                            />
                        ) : (
                            <SvgDrawerInput
                                displayName="Logogram drawing"
                                colors={GLYPH_INK}
                                guideInset={GLYPH_GUIDE_INSET}
                                onSvgChange={onDraw}
                                {...drawField}
                            />
                        )}
                    </div>

                    <GlyphImageImport onImport={onImport} />
                </div>
            )}

            <GraphemePickerModal
                isOpen={graphemePickerOpen}
                setIsOpen={setGraphemePickerOpen}
                title="Choose the grapheme that writes this word"
                // A mark (vowel-killer, accent) never stands for a word.
                hideMarks
                onSelect={(grapheme) => onChoiceChange({ kind: 'grapheme', graphemeId: grapheme.id })}
            />
            <GlyphPickerModal
                isOpen={glyphPickerOpen}
                setIsOpen={setGlyphPickerOpen}
                title="Choose the glyph that writes this word"
                emptyDescription="Draw glyphs in the Script Maker, or use “Draw new” here."
                onSelect={(glyph) => onChoiceChange({ kind: 'glyph', glyphId: glyph.id })}
            />
        </div>
    );
}
