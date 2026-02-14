/**
 * SyllabaryChartPage Component
 *
 * Page for viewing the CV syllabary chart with grapheme assignments.
 * Accessible at /script-maker/syllabary
 *
 * @module tabs/grapheme/syllabaryChart/SyllabaryChartPage
 */

import { useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import classNames from 'classnames';

import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton';
import { PannableCanvas } from 'cyber-components/interactable/canvas/pannableCanvas';
import type { PannableCanvasRef } from 'cyber-components/interactable/canvas/pannableCanvas';
import { IPASyllabaryChart } from '../../../display/ipaChart';
import { useEtymolog } from '../../../../db';
import { flex, graphic } from 'utils-styles';
import type { GraphemeComplete } from '../../../../db/types';
import styles from './SyllabaryChartPage.module.scss';

/**
 * SyllabaryChartPage - Main container for the syllabary chart viewer.
 */
export default function SyllabaryChartPage() {
    const navigate = useNavigate();
    const canvasRef = useRef<PannableCanvasRef>(null);
    const { api, isLoading, error } = useEtymolog();

    // Fetch phoneme-grapheme mappings
    const phonemeMapResult = useMemo(() => {
        if (isLoading) return null;
        return api.grapheme.getPhonemeMap();
    }, [api, isLoading]);

    const phonemeMap = useMemo(() => {
        if (!phonemeMapResult?.success || !phonemeMapResult.data) {
            return new Map<string, GraphemeComplete>();
        }
        return phonemeMapResult.data;
    }, [phonemeMapResult]);

    // Handle cell clicks - navigate to create or edit
    const handleCellClick = useCallback(
        (ipa: string, grapheme?: GraphemeComplete | null) => {
            if (grapheme) {
                navigate(`/script-maker/grapheme/db/${grapheme.id}`);
            } else {
                navigate(`/script-maker/create?phoneme=${encodeURIComponent(ipa)}`);
            }
        },
        [navigate]
    );

    if (isLoading) {
        return (
            <div className={classNames(styles.container, styles.loading)}>
                <div className={styles.loadingText}>Loading Syllabary Chart...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={classNames(styles.container, styles.error)}>
                <div className={styles.errorText}>
                    Failed to load chart: {error.message}
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Navigation header */}
            <nav className={classNames(flex.flexRow, flex.flexGapM, styles.nav)}>
                <IconButton
                    as={Link}
                    to="/script-maker"
                    iconName="arrow-left"
                >
                    Back to Graphemes
                </IconButton>
            </nav>

            {/* Page title */}
            <h2 className={classNames(graphic.underlineHighlightColorPrimary, styles.pageTitle)}>
                Syllabary Chart
            </h2>

            {/* Description */}
            <p className={styles.description}>
                A CV (consonant + vowel) syllabary grid. Rows are consonants grouped by
                manner of articulation; columns are vowels grouped by backness.
                Click any cell to create or edit a grapheme for that syllable.
            </p>

            {/* Stats bar */}
            <div className={styles.statsBar}>
                <span className={styles.stat}>
                    <strong>{phonemeMap.size}</strong> phonemes assigned
                </span>
            </div>

            {/* Syllabary chart in pannable canvas */}
            <div className={styles.chartCanvas}>
                <PannableCanvas
                    ref={canvasRef}
                    minScale={0.2}
                    maxScale={2}
                    showControls
                    contentDimensions={{
                        initialPosition: "top",
                        autoFit: {
                            enabled: true,
                            axis: 'width',
                            padding: 16,
                            refitOnResize: true,
                        },
                    }}
                    doubleClickMode="disabled"
                    controlsPosition="bottom-right"
                    ariaLabel="Syllabary Chart - CV syllable grid"
                >
                    <div className={styles.chartContent}>
                        <IPASyllabaryChart
                            phonemeMap={phonemeMap}
                            onCellClick={handleCellClick}
                            isLoading={isLoading}
                        />
                    </div>
                </PannableCanvas>
            </div>

            {/* Info section */}
            <div className={styles.infoSection}>
                <h4>How to Read This Chart</h4>
                <ul>
                    <li>
                        <strong>Rows:</strong> Each row is a consonant, grouped by manner of
                        articulation (plosives, nasals, fricatives, etc.).
                    </li>
                    <li>
                        <strong>Columns:</strong> Each column is a vowel, grouped by backness
                        (front, central, back).
                    </li>
                    <li>
                        <strong>Cells:</strong> Each cell represents a CV syllable (e.g. row "k" + column "a" = "ka").
                        Assigned syllables show their grapheme glyphs; unassigned ones appear grayed out.
                    </li>
                    <li>
                        <strong>∅ row:</strong> The top row shows standalone vowels with no consonant prefix.
                    </li>
                </ul>
            </div>
        </div>
    );
}
