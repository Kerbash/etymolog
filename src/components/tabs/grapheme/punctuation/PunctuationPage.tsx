/**
 * PunctuationPage Component
 *
 * Main page for configuring punctuation marks and separators.
 * Accessible at /script-maker/punctuation
 *
 * Features:
 * - Displays all punctuation marks in a categorized table
 * - Shows assigned graphemes with their glyphs
 * - Allows toggling "no glyph" mode for any punctuation
 * - Clicking assign opens a grapheme selection modal
 * - Settings persist to conlang settings
 *
 * @module tabs/grapheme/punctuation/PunctuationPage
 */

import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import classNames from 'classnames';

import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton';
import Modal from 'cyber-components/container/modal/modal';
import { PunctuationTable } from '../../../display/punctuationChart';
import GraphemeGallery from '../galleryGrapheme/graphemeGallery';
import { useEtymolog } from '../../../../db';
import { flex, graphic } from 'utils-styles';
import type { GraphemeComplete } from '../../../../db/types';
import type { PunctuationConfig } from '../../../../db/api/types';
import type { PunctuationKey } from '../../../../data/punctuationData';
import styles from './PunctuationPage.module.scss';

/**
 * PunctuationPage - Main container for the punctuation configuration.
 */
export default function PunctuationPage() {
    const { api, settings, isLoading, error, data } = useEtymolog();

    // Modal state for grapheme selection
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPunctuationKey, setSelectedPunctuationKey] = useState<PunctuationKey | null>(null);

    // Build grapheme map for punctuation keys
    const punctuationGraphemeMap = useMemo(() => {
        const map = new Map<PunctuationKey, GraphemeComplete>();

        if (!settings?.punctuation) return map;

        const graphemeById = new Map<number, GraphemeComplete>();
        for (const g of data.graphemesComplete) {
            graphemeById.set(g.id, g);
        }

        for (const [key, config] of Object.entries(settings.punctuation) as [PunctuationKey, PunctuationConfig][]) {
            if (config.graphemeId !== null) {
                const grapheme = graphemeById.get(config.graphemeId);
                if (grapheme) {
                    map.set(key, grapheme);
                }
            }
        }

        return map;
    }, [settings?.punctuation, data.graphemesComplete]);

    // Handle assign button click - open modal
    const handleAssign = useCallback((key: PunctuationKey) => {
        setSelectedPunctuationKey(key);
        setIsModalOpen(true);
    }, []);

    // Handle grapheme selection from modal
    const handleGraphemeSelect = useCallback((grapheme: GraphemeComplete) => {
        if (!selectedPunctuationKey) return;

        const currentPunctuation = { ...settings.punctuation };
        currentPunctuation[selectedPunctuationKey] = {
            ...currentPunctuation[selectedPunctuationKey],
            graphemeId: grapheme.id,
            useNoGlyph: false, // Clear no-glyph when assigning
        };

        api.settings.update({ punctuation: currentPunctuation });
        setIsModalOpen(false);
        setSelectedPunctuationKey(null);
    }, [api, settings.punctuation, selectedPunctuationKey]);

    // Handle toggle no glyph
    const handleToggleNoGlyph = useCallback((key: PunctuationKey, useNoGlyph: boolean) => {
        const currentPunctuation = { ...settings.punctuation };
        currentPunctuation[key] = {
            ...currentPunctuation[key],
            useNoGlyph,
        };

        api.settings.update({ punctuation: currentPunctuation });
    }, [api, settings.punctuation]);

    // Handle clear assignment
    const handleClear = useCallback((key: PunctuationKey) => {
        const currentPunctuation = { ...settings.punctuation };
        currentPunctuation[key] = {
            graphemeId: null,
            useNoGlyph: false,
        };

        api.settings.update({ punctuation: currentPunctuation });
    }, [api, settings.punctuation]);

    // Close modal
    const handleModalClose = useCallback(() => {
        setIsModalOpen(false);
        setSelectedPunctuationKey(null);
    }, []);

    // Loading state
    if (isLoading) {
        return (
            <div className={classNames(styles.container, styles.loading)}>
                <div className={styles.loadingText}>Loading Punctuation Settings...</div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className={classNames(styles.container, styles.error)}>
                <div className={styles.errorText}>
                    Failed to load settings: {error.message}
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
                Punctuation & Separators
            </h2>

            {/* Description */}
            <p className={styles.description}>
                Configure how punctuation marks and word separators are rendered in your script.
                You can assign a custom grapheme, use a virtual glyph (dashed box), or hide marks entirely.
            </p>

            {/* Info box for word/sentence separators */}
            <div className={styles.infoBox}>
                <h4>Important: Word & Sentence Separators</h4>
                <p>
                    The <strong>Word Separator</strong> and <strong>Sentence Separator</strong> at the top
                    are particularly important as they control how words and sentences are visually
                    distinguished in your script. Click the eye icon to hide them if your script
                    doesn't use visual separation.
                </p>
            </div>

            {/* Stats bar */}
            <div className={styles.statsBar}>
                <span className={styles.stat}>
                    <strong>{punctuationGraphemeMap.size}</strong> punctuation marks assigned
                </span>
                <span className={styles.stat}>
                    <strong>
                        {Object.values(settings.punctuation).filter(c => c.useNoGlyph).length}
                    </strong> hidden
                </span>
            </div>

            {/* Punctuation Table */}
            <PunctuationTable
                graphemeMap={punctuationGraphemeMap}
                settings={settings.punctuation}
                onAssign={handleAssign}
                onToggleNoGlyph={handleToggleNoGlyph}
                onClear={handleClear}
                isLoading={isLoading}
                className={styles.table}
            />

            {/* Additional info */}
            <div className={styles.infoSection}>
                <h4>Understanding Punctuation Settings</h4>
                <ul>
                    <li>
                        <strong>Assigned:</strong> Uses a custom grapheme you've created for this punctuation.
                    </li>
                    <li>
                        <strong>Virtual:</strong> Shows the original punctuation character in a dashed box
                        (default behavior for new languages).
                    </li>
                    <li>
                        <strong>Hidden:</strong> The punctuation mark is not rendered at all.
                        Use this for scripts that don't separate words or sentences visually.
                    </li>
                </ul>
            </div>

            {/* Grapheme Selection Modal */}
            <Modal
                isOpen={isModalOpen}
                setIsOpen={setIsModalOpen}
                onClose={handleModalClose}
                allowClose={true}
                className={styles.modal}
            >
                <div className={styles.modalContent}>
                    <h3 className={styles.modalTitle}>Select Grapheme for Punctuation</h3>
                    <p className={styles.modalDescription}>
                        Select a grapheme to use for this punctuation mark.
                        The grapheme will be displayed in place of the original character.
                    </p>
                    <div className={styles.galleryContainer}>
                        <GraphemeGallery
                            onGraphemeClick={handleGraphemeSelect}
                            selectionMode={true}
                        />
                    </div>
                </div>
            </Modal>
        </div>
    );
}



