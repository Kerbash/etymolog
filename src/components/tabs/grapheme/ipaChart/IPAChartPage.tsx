/**
 * IPAChartPage — `/script-maker/chart`.
 *
 * The IPA consonant + vowel charts with the script's grapheme assignments
 * painted on. Clicking an assigned sound edits its grapheme; clicking an
 * unassigned one starts a new grapheme with that phoneme pre-filled.
 *
 * A thin wrapper over {@link ChartPageLayout} — the header, stats, loading,
 * error and the collapsed explainer are all shared with the other three chart
 * pages now.
 *
 * It also hosts the FLAVOUR GUIDE (word generator, Phase 4): the picker in the
 * header slot, the tier overlay on the chart itself, and the legend under it.
 * The chosen flavour lives in `settings.wordGenerator.guidePresetId`, so it is
 * the same choice the syllabary page and the generator page see.
 */

import { useCallback, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
    GuideLegend,
    GuidePicker,
    IPACombinedChart,
    useGuidePreset,
} from '../../../display/ipaChart';
import { useEtymolog } from '../../../../db';
import type { GraphemeComplete } from '../../../../db/types';
import { ROUTES, resolveUrl } from '../../../../url_mapping';
import ChartPageLayout from '../chartPage/ChartPageLayout';

export default function IPAChartPage() {
    const navigate = useNavigate();
    const { api, isReady, error } = useEtymolog();
    /** Bumped by Retry to re-run the lookup below. */
    const [attempt, setAttempt] = useState(0);
    /**
     * The explainer is CONTROLLED here (it is uncontrolled on the other chart
     * pages) so the legend's "Why it sounds like this" can open it. A second
     * disclosure holding the same paragraph would be two places to look for one
     * explanation.
     */
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
            title="IPA chart"
            description="Click a sound to create or edit the grapheme that writes it. Assigned sounds show their glyphs; unassigned ones are greyed out."
            back={{ to: ROUTES.scriptMaker, label: 'Graphemes' }}
            actions={<GuidePicker />}
            facts={[
                { label: 'Sounds assigned', value: phonemeMap.size, big: true },
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
                            <strong>Consonants</strong> are organised by place of articulation
                            (columns) and manner of articulation (rows). Each cell shows the
                            voiceless/voiced pair.
                        </li>
                        <li>
                            <strong>Vowels</strong> sit on a trapezoid by height (vertical) and
                            backness (horizontal). Pairs show the unrounded and rounded variants.
                        </li>
                        <li>
                            <strong>Shaded cells</strong> are sounds judged physically impossible.
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
            <IPACombinedChart
                phonemeMap={phonemeMap}
                onCellClick={handleCellClick}
                guide={guide}
                guideLabel={guideLabel}
            />
        </ChartPageLayout>
    );
}
