/**
 * SyllabaryChartPage — `/script-maker/syllabary`.
 *
 * The CV (consonant + vowel) grid: one row per consonant, one column per vowel,
 * one cell per syllable. Same interaction as the IPA chart — a cell either
 * edits the grapheme that writes that syllable or starts one for it.
 *
 * A thin wrapper over {@link ChartPageLayout}.
 *
 * It carries the same FLAVOUR GUIDE as the IPA chart page, reading the same
 * `settings.wordGenerator.guidePresetId`. Only the ROW and COLUMN headers are
 * painted here — see `IPASyllabaryChart` for why ringing two thousand syllable
 * cells says less than ringing the ninety sounds they are made of.
 */

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PannableCanvas } from 'cyber-components/interactable/canvas/pannableCanvas';
import type { PannableCanvasRef } from 'cyber-components/interactable/canvas/pannableCanvas';

import {
    GuideLegend,
    GuidePicker,
    IPASyllabaryChart,
    useGuidePreset,
} from '../../../display/ipaChart';
import { useEtymolog } from '../../../../db';
import type { GraphemeComplete } from '../../../../db/types';
import { ROUTES, resolveUrl } from '../../../../url_mapping';
import ChartPageLayout from '../chartPage/ChartPageLayout';

import styles from './SyllabaryChartPage.module.scss';

export default function SyllabaryChartPage() {
    const navigate = useNavigate();
    const canvasRef = useRef<PannableCanvasRef>(null);
    const { api, isReady, error } = useEtymolog();
    const [attempt, setAttempt] = useState(0);
    /** Controlled so the legend's "Why it sounds like this" can open it. */
    const [aboutOpen, setAboutOpen] = useState(false);
    const aboutId = useId();

    const phonemeMap = useMemo(() => {
        if (!isReady) return new Map<string, GraphemeComplete>();
        void attempt;
        const result = api.grapheme.getPhonemeMap();
        return result.success && result.data
            ? result.data
            : new Map<string, GraphemeComplete>();
    }, [api, isReady, attempt]);

    const handleCellClick = useCallback(
        (ipa: string, grapheme?: GraphemeComplete | null) => {
            navigate(
                grapheme
                    ? resolveUrl(ROUTES.graphemeEdit, { id: grapheme.id })
                    : `${ROUTES.scriptMakerCreate}?phoneme=${encodeURIComponent(ipa)}`,
            );
        },
        [navigate],
    );

    const { preset, guide, guideLabel, coreFact, coverage } = useGuidePreset(phonemeMap);

    const showWhy = useCallback(() => {
        setAboutOpen(true);
        const explainer = document.getElementById(aboutId);
        // Focus FOLLOWS the disclosure it opened. Without this a keyboard user
        // presses "Why it sounds like this", the paragraph unrolls somewhere
        // below them, and their focus is still on a button in the legend — the
        // classic disclosure trap where the content that appeared is content
        // you now have to go and find. `tabIndex={-1}` on the wrapper (see
        // `ChartPageLayout`) makes it a legal focus target without putting it
        // in the tab order.
        explainer?.focus?.({ preventScroll: true });
        // `scrollIntoView` is absent in happy-dom and on some older engines;
        // the disclosure has still opened, so the guard costs nothing.
        explainer?.scrollIntoView?.({ block: 'nearest' });
    }, [aboutId]);

    return (
        <ChartPageLayout
            title="Syllabary chart"
            description="A CV grid: rows are consonants grouped by manner of articulation, columns are vowels grouped by backness. Click a cell to create or edit the grapheme for that syllable."
            back={{ to: ROUTES.scriptMaker, label: 'Graphemes' }}
            actions={<GuidePicker />}
            facts={[
                { label: 'Phonemes assigned', value: phonemeMap.size, big: true },
                ...(coreFact
                    ? [{ label: 'Core sounds in script', value: coreFact, big: true }]
                    : []),
            ]}
            isReady={isReady}
            error={error ?? null}
            onRetry={() => setAttempt((n) => n + 1)}
            aboutId={aboutId}
            aboutOpen={aboutOpen}
            onAboutOpenChange={setAboutOpen}
            belowChart={
                preset && coverage ? (
                    <GuideLegend
                        preset={preset}
                        coverage={coverage}
                        onShowWhy={showWhy}
                        whyOpen={aboutOpen}
                        whyTargetId={aboutId}
                    />
                ) : null
            }
            about={
                <>
                    <h4>How to read this chart</h4>
                    <ul>
                        <li>
                            <strong>Rows</strong> are consonants, grouped by manner of articulation
                            (plosives, nasals, fricatives, …).
                        </li>
                        <li>
                            <strong>Columns</strong> are vowels, grouped by backness (front,
                            central, back).
                        </li>
                        <li>
                            <strong>Cells</strong> are CV syllables — row &ldquo;k&rdquo; plus
                            column &ldquo;a&rdquo; is &ldquo;ka&rdquo;. Assigned syllables show
                            their glyphs.
                        </li>
                        <li>
                            The <strong>∅ row</strong> is the standalone vowels, with no consonant
                            in front.
                        </li>
                    </ul>
                    {preset && (
                        <>
                            <h4>{preset.name}</h4>
                            <p>{preset.why}</p>
                        </>
                    )}
                </>
            }
        >
            <div className={styles.chartCanvas}>
                <PannableCanvas
                    ref={canvasRef}
                    minScale={0.2}
                    maxScale={2}
                    showControls
                    /* Wheel-zoom OFF so the page scrolls over the chart — see the
                       note on IPACombinedChart. Zoom via the +/−/⟲ controls and pinch. */
                    enableWheel={false}
                    contentDimensions={{
                        initialPosition: 'top',
                        autoFit: { enabled: true, axis: 'width', padding: 16, refitOnResize: true },
                    }}
                    doubleClickMode="disabled"
                    controlsPosition="bottom-right"
                    ariaLabel="Syllabary chart — CV syllable grid"
                >
                    <div className={styles.chartContent}>
                        <IPASyllabaryChart
                            phonemeMap={phonemeMap}
                            onCellClick={handleCellClick}
                            guide={guide}
                            guideLabel={guideLabel}
                        />
                    </div>
                </PannableCanvas>
            </div>
        </ChartPageLayout>
    );
}
