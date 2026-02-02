/**
 * IPAChartPage Component
 *
 * Main page for viewing the IPA chart with grapheme assignments.
 * Accessible at /script-maker/chart
 *
 * Features:
 * - Displays consonant and vowel charts
 * - Shows assigned graphemes with their glyphs
 * - Unassigned IPA characters are grayed out and clickable
 * - Clicking assigned → edit grapheme
 * - Clicking unassigned → create grapheme with pre-filled phoneme
 *
 * @module tabs/grapheme/ipaChart/IPAChartPage
 */

import { useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import classNames from 'classnames';

import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton';
import { IPACombinedChart } from '../../../display/ipaChart';
import { useEtymolog } from '../../../../db';
import { flex, graphic } from 'utils-styles';
import type { GraphemeComplete } from '../../../../db/types';
import styles from './IPAChartPage.module.scss';

/**
 * IPAChartPage - Main container for the IPA chart viewer.
 */
export default function IPAChartPage() {
    const navigate = useNavigate();
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
                // Navigate to edit page
                navigate(`/script-maker/grapheme/db/${grapheme.id}`);
            } else {
                // Navigate to create page with pre-filled phoneme
                navigate(`/script-maker/create?phoneme=${encodeURIComponent(ipa)}`);
            }
        },
        [navigate]
    );

    // Loading state
    if (isLoading) {
        return (
            <div className={classNames(styles.container, styles.loading)}>
                <div className={styles.loadingText}>Loading IPA Chart...</div>
            </div>
        );
    }

    // Error state
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
                IPA Chart
            </h2>

            {/* Description */}
            <p className={styles.description}>
                Click on an IPA character to create or edit its associated grapheme.
                Assigned sounds show their grapheme glyphs; unassigned sounds appear grayed out.
            </p>

            {/* Stats bar */}
            <div className={styles.statsBar}>
                <span className={styles.stat}>
                    <strong>{phonemeMap.size}</strong> IPA sounds assigned
                </span>
            </div>

            {/* Combined IPA Chart with pan/zoom */}
            <IPACombinedChart
                phonemeMap={phonemeMap}
                onCellClick={handleCellClick}
                isLoading={isLoading}
                className={styles.chartCanvas}
            />

            {/* Additional info */}
            <div className={styles.infoSection}>
                <h4>Understanding the IPA Chart</h4>
                <ul>
                    <li>
                        <strong>Consonants:</strong> Organized by place of articulation (columns)
                        and manner of articulation (rows). Each cell shows voiceless/voiced pairs.
                    </li>
                    <li>
                        <strong>Vowels:</strong> Positioned on a trapezoid by height (vertical)
                        and backness (horizontal). Pairs show unrounded and rounded variants.
                    </li>
                    <li>
                        <strong>Shaded cells:</strong> Indicate physically impossible sounds.
                    </li>
                </ul>
            </div>
        </div>
    );
}
