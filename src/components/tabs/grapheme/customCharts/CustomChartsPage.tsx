/**
 * CustomChartsPage Component
 *
 * Page for managing user-defined custom charts.
 * Accessible at /script-maker/custom-charts
 *
 * @module tabs/grapheme/customCharts/CustomChartsPage
 */

import { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import classNames from 'classnames';

import IconButton from 'cyber-components/interactable/buttons/iconButton/iconButton';
import { buttonStyles } from 'cyber-components/interactable/buttons/button/button';
import { CustomChartCard, CreateChartModal } from '../../../display/customChart';
import { useEtymolog } from '../../../../db';
import type { CustomChartDefinition } from '../../../../db/api/types';
import type { GraphemeComplete } from '../../../../db/types';
import { flex, graphic } from 'utils-styles';
import styles from './CustomChartsPage.module.scss';

export default function CustomChartsPage() {
    const navigate = useNavigate();
    const { api, isLoading, error, settings } = useEtymolog();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingChart, setEditingChart] = useState<CustomChartDefinition | null>(null);

    const customCharts = settings?.customCharts ?? [];

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
        (ipa: string, grapheme: GraphemeComplete | null) => {
            if (grapheme) {
                navigate(`/script-maker/grapheme/db/${grapheme.id}`);
            } else {
                navigate(`/script-maker/create?phoneme=${encodeURIComponent(ipa)}`);
            }
        },
        [navigate]
    );

    const handleCreateClick = () => {
        setEditingChart(null);
        setIsModalOpen(true);
    };

    const handleEdit = (chart: CustomChartDefinition) => {
        setEditingChart(chart);
        setIsModalOpen(true);
    };

    const handleDelete = (chart: CustomChartDefinition) => {
        if (!window.confirm(`Delete chart "${chart.name}"?`)) return;
        const updated = customCharts.filter(c => c.id !== chart.id);
        api.settings.update({ customCharts: updated });
    };

    const handleSubmit = (chart: CustomChartDefinition) => {
        const existing = customCharts.findIndex(c => c.id === chart.id);
        let updated: CustomChartDefinition[];
        if (existing >= 0) {
            updated = [...customCharts];
            updated[existing] = chart;
        } else {
            updated = [...customCharts, chart];
        }
        api.settings.update({ customCharts: updated });
    };

    if (isLoading) {
        return (
            <div className={classNames(styles.container, styles.loading)}>
                <div className={styles.loadingText}>Loading Custom Charts...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={classNames(styles.container, styles.error)}>
                <div className={styles.errorText}>
                    Failed to load: {error.message}
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
                Custom Charts
            </h2>

            {/* Description */}
            <p className={styles.description}>
                Create custom charts to organize your conlang's script in ways that don't fit
                the standard IPA or syllabary layouts. Click on any cell to create or edit its
                associated grapheme.
            </p>

            {/* Stats bar */}
            <div className={styles.statsBar}>
                <span className={styles.stat}>
                    <strong>{customCharts.length}</strong> custom chart{customCharts.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Create button */}
            <IconButton
                iconName="plus-lg"
                className={buttonStyles.primary}
                onClick={handleCreateClick}
            >
                Create Chart
            </IconButton>

            {/* Charts list */}
            {customCharts.length === 0 ? (
                <div className={styles.emptyState}>
                    <p>No custom charts yet. Click "Create Chart" to get started.</p>
                </div>
            ) : (
                <div className={styles.chartsList}>
                    {customCharts.map(chart => (
                        <CustomChartCard
                            key={chart.id}
                            chart={chart}
                            phonemeMap={phonemeMap}
                            onCellClick={handleCellClick}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}

            {/* Create/Edit Modal */}
            <CreateChartModal
                isOpen={isModalOpen}
                setIsOpen={setIsModalOpen}
                editingChart={editingChart}
                onSubmit={handleSubmit}
            />
        </div>
    );
}
